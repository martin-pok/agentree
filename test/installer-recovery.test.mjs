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
  assert.match(swift, /showLoading\(\)\s*setLoading\("Připravujeme Agenteeq \\\(version\)…", progress: true, value: 0\.05\)/,
    'stage indication must start before ZIP extraction');
  for (const stage of [
    'Rozbalujeme Agenteeq', 'Kontrolujeme podpis aplikace',
    'Ukládáme data a restartujeme', 'Spouštíme Agenteeq',
  ]) assert.ok(swift.includes(stage), stage);
  assert.match(swift, /if type == "ukoncit", installing \{ NSApp\.terminate\(nil\) \}/,
    'the native loader must expose an actual Quit action, not a dead button');
});

// Dřív aplikace po „Aktualizovat a restartovat“ visela na „Instalujeme…“ a nešla ukončit ani z Docku:
// ukončení stálo jen na odpovědi AppKitu (terminateLater). Teď server zastaví plášť sám s časovým
// limitem, proces pojistka ukončí i bez AppKitu a pomocník si poradí i se zaseknutým procesem.
test('update and Quit never depend solely on AppKit termination', async () => {
  const swift = await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8');
  const install = swift.slice(swift.indexOf('func installUpdate('), swift.indexOf('// Status/notifications come from'));
  const stop = install.indexOf('self.stopServerBounded()');
  const terminate = install.indexOf('NSApp.terminate(nil)');
  assert.ok(stop > 0 && terminate > stop, 'server is stopped with a bound BEFORE asking AppKit to quit');
  assert.ok(install.indexOf('helper.run()') < stop, 'helper is running before anything is stopped');
  assert.match(install, /self\.armExitWatchdog\(seconds: 6\)\s*NSApp\.terminate\(nil\)/);
  const watchdog = swift.slice(swift.indexOf('func armExitWatchdog('), swift.indexOf('func installUpdate('));
  assert.match(watchdog, /DispatchQueue\.global\(qos: \.userInitiated\)\.asyncAfter/, 'watchdog must not need the main thread');
  assert.match(watchdog, /_exit\(0\)/);
  const bounded = swift.slice(swift.indexOf('func stopServerBounded('), swift.indexOf('func armExitWatchdog('));
  assert.match(bounded, /kill\(process\.processIdentifier, SIGKILL\)/);
  assert.doesNotMatch(bounded, /waitUntilExit/, 'bounded polling only; never an unbounded wait');
  const quit = swift.slice(swift.indexOf('func applicationShouldTerminate('));
  assert.match(quit, /armExitWatchdog\(seconds: 15\)/, 'Dock/⌘Q Quit is guaranteed even with a wedged server');
  assert.match(quit, /ownedRuns > 0, !quitIsSystemInitiated, !confirmQuitWithRunningAgents\(\)/,
    'Quit asks before stopping agents started from Agenteeq, but never blocks logout/shutdown');
  assert.match(swift, /if type == "owned-runs", let count = data\["count"\] as\? Int \{ ownedRuns = max\(0, count\) \}/);
  const server = await fs.readFile(file('desktop/server.mjs'), 'utf8');
  assert.match(server, /report\(\{ type: 'owned-runs', count \}\)/);
  assert.match(server, /app\.store\.on\('runs', ownedRuns\)/);
  // Rozbalení přímo vedle aplikace: žádná druhá kopie celé aplikace (dřív dvojí ditto).
  assert.equal((install.match(/\/usr\/bin\/ditto/g) || []).length, 1);
  assert.match(install, /dest\.appendingPathComponent\("\.agenteeq-update-/);
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
    const el = {
      textContent: '', hidden: true,
      attrs: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      removeAttribute(name) { delete this.attrs[name]; },
      classes: new Set(),
      classList: { toggle(name, on) { const c = this.owner.classes; if (on) c.add(name); else c.delete(name); } },
      vars: {},
      style: { setProperty(name, value) { this.owner.vars[name] = value; } },
      addEventListener(event, fn) { this[event] = fn; },
      focus() { this.focused = true; },
    };
    el.classList.owner = el; el.style.owner = el;
    fields.set(id, el);
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
  assert.equal(fields.get('nacitani-progress').classes.has('is-urcity'), false, 'no value = indeterminate');
  // Plášť posílá podíl dokončených kroků: pruh se doplní a čtečka dostane hodnotu.
  win.agenteeqNacitani({ text: 'Kontrolujeme podpis aplikace…', progress: true, hodnota: 0.5 });
  assert.equal(fields.get('nacitani-progress').classes.has('is-urcity'), true);
  assert.equal(fields.get('nacitani-progress').vars['--podil'], '0.5');
  assert.equal(fields.get('nacitani-progress').attrs['aria-valuenow'], '50');
  win.agenteeqNacitani({ text: 'Rozbalujeme aktualizaci…', progress: true });
  assert.equal(fields.get('nacitani-progress').attrs['aria-valuenow'], undefined);
  fields.get('nacitani-ukoncit').click();
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: 'ukoncit' }]);
  win.agenteeqNacitani({ text: 'Připravujeme prostor…', progress: false, znovu: true });
  assert.equal(fields.get('nacitani-progress').hidden, true);
  assert.equal(fields.get('nacitani-ukoncit').hidden, true);
  assert.equal(fields.get('nacitani-znovu').hidden, false);
});

const helperScript = (swift) => {
  const match = swift.match(/let script = """\n([\s\S]*?)\n\s*"""/);
  assert.ok(match, 'test the literal helper shipped in the native app');
  return match[1].split('\n').map(line => line.replace(/^ {12}/, '')).join('\n').replaceAll('sleep 0.2', 'sleep 0');
};

test('updater helper swaps the app, cleans the extracted folder and moves the old app to Trash', {
  skip: process.platform === 'win32' && 'POSIX shell required'
}, async () => {
  const script = helperScript(await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-update-ok-'));
  try {
    const current = path.join(root, 'Agenteeq.app');
    const work = path.join(root, '.agenteeq-update-x');
    const stage = path.join(work, 'Agenteeq.app');
    const trash = path.join(root, 'Trash-Agenteeq.app');
    const bin = path.join(root, 'bin');
    await fs.mkdir(current); await fs.mkdir(stage, { recursive: true }); await fs.mkdir(bin);
    await fs.writeFile(path.join(current, 'version'), 'old');
    await fs.writeFile(path.join(stage, 'version'), 'new');
    await fs.writeFile(path.join(bin, 'open'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const log = path.join(root, 'update.log');
    const done = spawnSync('/bin/sh', ['-c', script, 'agenteeq-update', '99999999', current, stage, work, path.join(root, '.backup.app'), trash, log], {
      encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: bin + ':' + process.env.PATH },
    });
    assert.equal(done.status, 0);
    assert.equal(await fs.readFile(path.join(current, 'version'), 'utf8'), 'new');
    assert.equal(await fs.readFile(path.join(trash, 'version'), 'utf8'), 'old');
    await assert.rejects(fs.access(work), { code: 'ENOENT' });
    assert.match(await fs.readFile(log, 'utf8'), /nová verze spuštěna/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('updater helper ends a hung old process instead of leaving the user stuck', {
  skip: process.platform === 'win32' && 'POSIX shell required'
}, async () => {
  const script = helperScript(await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-update-hung-'));
  const { spawn } = await import('node:child_process');
  // Proces, který TERM ignoruje – jako zaseknutá aplikace. Pomusí ho až KILL.
  const current = path.join(root, 'Agenteeq.app');
  // Spustitelný soubor uvnitř balíčku, aby proces byl „náš“ stejně jako skutečná aplikace.
  await fs.mkdir(path.join(current, 'Contents', 'MacOS'), { recursive: true });
  const exe = path.join(current, 'Contents', 'MacOS', 'Agenteeq');
  await fs.writeFile(exe, '#!/bin/sh\ntrap "" TERM\nwhile :; do sleep 1; done\n', { mode: 0o755 });
  const hung = spawn('/bin/sh', [exe], { stdio: 'ignore', detached: true });
  try {
    const work = path.join(root, '.agenteeq-update-y');
    const stage = path.join(work, 'Agenteeq.app');
    const bin = path.join(root, 'bin');
    await fs.mkdir(stage, { recursive: true }); await fs.mkdir(bin);
    await fs.writeFile(path.join(stage, 'version'), 'new');
    await fs.writeFile(path.join(bin, 'open'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const log = path.join(root, 'update.log');
    // Asynchronně: test (rodič zaseknutého procesu) ho musí po KILL uklidit stejně jako launchd
    // na Macu; synchronní běh by z něj nechal zombie, která pro `kill -0` pořád „žije“.
    const helper = spawn('/bin/sh', ['-c', script, 'agenteeq-update', String(hung.pid), current, stage, work, path.join(root, '.backup.app'), '', log], {
      stdio: 'ignore', env: { ...process.env, PATH: bin + ':' + process.env.PATH },
    });
    const status = await new Promise((resolve) => helper.once('exit', resolve));
    assert.equal(status, 0, 'update completes even when the old process ignored TERM');
    assert.equal(await fs.readFile(path.join(current, 'version'), 'utf8'), 'new');
    const text = await fs.readFile(log, 'utf8');
    assert.match(text, /posílám TERM/);
    assert.match(text, /posílám KILL/);
  } finally {
    try { process.kill(hung.pid, 'SIGKILL'); } catch { /* už neběží */ }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('updater helper rolls back the previous app on failed relaunch (no black-screen trap)', {
  skip: process.platform === 'win32' && 'POSIX shell required'
}, async () => {
  const script = helperScript(await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8'));
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
    const done = spawnSync('/bin/sh', ['-c', script, 'agenteeq-update', '99999999', current, stage, path.join(root, 'work'), backup, '', path.join(root, 'update.log')], {
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
