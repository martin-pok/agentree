import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const file = (name) => new URL('../' + name, import.meta.url);

test('native updater has bounded Quit, prevents permanent loading overlay and shows real stage state', async () => {
  const swift = await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8');
  const quit = swift.slice(swift.indexOf('func applicationShouldTerminate('));
  assert.match(quit, /DispatchQueue\.global\(\)\.asyncAfter\(deadline: \.now\(\) \+ 8\)/);
  assert.match(quit, /kill\(process\.processIdentifier, SIGKILL\)/);
  assert.match(quit, /DispatchQueue\.main\.asyncAfter\(deadline: \.now\(\) \+ 12, execute: finish\)/,
    'native Quit must always be acknowledged even when child wait never returns');
  assert.match(quit, /guard let self, self\.terminateReplyPending else \{ return \}/,
    'respond to AppKit exactly once even when watchdog races child completion');
  assert.match(swift, /if baseURL != nil \{ hideLoading\(\) \}\s*else \{ setLoading\(message, retry: true\) \}/,
    'a failed pre-swap installer must return to usable existing app instead of blank loader');
  assert.match(swift, /showLoading\(\)\s*setLoading\("Ověřujeme a připravujeme Agenteeq/,
    'stage indication must start before ZIP extraction');
  for (const stage of [
    'Rozbalujeme aktualizaci', 'Kontrolujeme podpis aplikace',
    'Připravujeme bezpečnou výměnu', 'Spouštíme Agenteeq',
  ]) assert.ok(swift.includes(stage), stage);
  assert.match(swift, /if type == "ukoncit", installing \{ NSApp\.terminate\(nil\) \}/,
    'the native loader must expose an actual Quit action, not a dead button');
});

test('loader shows an honest indeterminate update bar with accessible text and Quit', async () => {
  const html = await fs.readFile(file('public/nacitani.html'), 'utf8');
  const style = await fs.readFile(file('public/loader.css'), 'utf8');
  assert.match(html, /id="nacitani-progress" role="progressbar"[^>]* hidden/);
  assert.match(html, /id="nacitani-ukoncit"[^>]* hidden/);
  assert.match(style, /\.nacitani \.loader-progress\[hidden\] \{ display: none; \}/);
  assert.match(style, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(html, /aria-valuenow=/, 'no fabricated progress percentage');
  const fields = new Map();
  const messages = [];
  for (const id of ['nacitani-text', 'nacitani-znovu', 'nacitani-progress', 'nacitani-ukoncit']) {
    fields.set(id, {
      textContent: '', hidden: true,
      attrs: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(event, fn) { this[event] = fn; },
      focus() { this.focused = true; },
    });
  }
  const win = { webkit: { messageHandlers: { nacitani: { postMessage(value) { messages.push(value); } } } } };
  vm.runInNewContext(await fs.readFile(file('public/js/nacitani.js'), 'utf8'), {
    document: { getElementById(id) { return fields.get(id); } },
    window: win,
  });
  win.agenteeqNacitani({ text: 'Rozbalujeme aktualizaci…', progress: true, znovu: false });
  assert.equal(fields.get('nacitani-progress').hidden, false);
  assert.equal(fields.get('nacitani-ukoncit').hidden, false);
  assert.equal(fields.get('nacitani-text').textContent, 'Rozbalujeme aktualizaci…');
  assert.equal(fields.get('nacitani-progress').attrs['aria-valuetext'], 'Rozbalujeme aktualizaci…');
  fields.get('nacitani-ukoncit').click();
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: 'ukoncit' }]);
  win.agenteeqNacitani({ text: 'Připravujeme prostor…', progress: false, znovu: true });
  assert.equal(fields.get('nacitani-progress').hidden, true);
  assert.equal(fields.get('nacitani-ukoncit').hidden, true);
  assert.equal(fields.get('nacitani-znovu').hidden, false);
});

test('updater helper rolls back the previous app on failed relaunch (no black-screen trap)', {
  skip: process.platform === 'win32' && 'POSIX shell required',
}, async () => {
  const swift = await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8');
  const match = swift.match(/let script = """\n([\s\S]*?)\n\s*"""/);
  assert.ok(match, 'test the literal helper shipped in the native app');
  const script = match[1].split('\n').map(line => line.replace(/^ {12}/, '')).join('\n')
    .replace('sleep 0.2', 'sleep 0');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-update-relaunch-'));
  try {
    const current = path.join(root, 'Agenteeq.app');
    const stage = path.join(root, '.agenteeq-update.app');
    const backup = path.join(root, '.agenteeq-backup.app');
    const bin = path.join(root, 'bin');
    await fs.mkdir(current); await fs.mkdir(stage); await fs.mkdir(bin);
    await fs.writeFile(path.join(current, 'version'), 'known-good');
    await fs.writeFile(path.join(stage, 'version'), 'new');
    await fs.writeFile(path.join(bin, 'open'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const done = spawnSync('/bin/sh', ['-c', script, 'agenteeq-update', '99999999', current, stage, backup, ''], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PATH: bin + ':' + process.env.PATH },
    });
    assert.equal(done.status, 1, 'launch failure must be a failed update');
    assert.equal(await fs.readFile(path.join(current, 'version'), 'utf8'), 'known-good',
      'old working app must be restored, not moved to Trash');
    await assert.rejects(fs.access(backup), { code: 'ENOENT' });
    await assert.rejects(fs.access(stage), { code: 'ENOENT' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
