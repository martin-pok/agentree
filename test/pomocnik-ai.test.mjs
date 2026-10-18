import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPomocnikAi } from '../src/pomocnik-ai.js';

const bezOllamy = { baseUrl: 'http://127.0.0.1:11434', models: async () => ({ ok: false, models: [] }), loaded: async () => ({ ok: false, models: [] }) };

async function tmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-pomocnik-test-'));
}

test('Pomocník AI: bez Ollamy i Claude Code vrátí engine null (odpoví průvodce)', async () => {
  const ai = createPomocnikAi({ ollama: bezOllamy, claudeBin: () => null, tmpDir: await tmp() });
  assert.deepEqual(await ai.odpovez({ dotaz: 'Kde nastavím rozpočet?' }), { engine: null });
});

test('Pomocník AI: Claude Code běží bez nástrojů, MCP, hooků a paměti, v prázdné složce, se znalostní bází', async () => {
  const volani = [];
  const ignorovane = [];
  const dir = await tmp();
  const ai = createPomocnikAi({
    ollama: bezOllamy,
    claudeBin: () => '/usr/local/bin/claude',
    ignoruj: (id) => ignorovane.push(id),
    tmpDir: dir,
    spustit: async (cmd, args, opts) => { volani.push({ cmd, args, opts }); return { ok: true, stdout: '## Rozpočet\nRozpočet nastavíš v Útratě → Rozpočty.\n', stderr: '' }; },
  });
  const r = await ai.odpovez({ dotaz: 'Kde nastavím rozpočet?', historie: [{ kdo: 'ja', text: 'ahoj' }, { kdo: 'on', text: 'Ahoj!' }], stranka: 'utrata', znalosti: ['Rozpočet nastavíš v Útratě → Rozpočty.'] });
  assert.equal(r.engine, 'claude-code');
  assert.equal(r.text, 'Rozpočet\nRozpočet nastavíš v Útratě → Rozpočty.', 'nadpisy markdownu se odstraní');
  const { cmd, args, opts } = volani[0];
  assert.equal(cmd, '/usr/local/bin/claude');
  for (const a of ['-p', '--no-session-persistence', '--strict-mcp-config']) assert.ok(args.includes(a), a);
  assert.equal(args[args.indexOf('--tools') + 1], '', 'žádné nástroje');
  assert.equal(args[args.indexOf('--model') + 1], 'haiku');
  assert.deepEqual(JSON.parse(args[args.indexOf('--settings') + 1]), { disableAllHooks: true });
  assert.match(args[args.indexOf('--system-prompt') + 1], /Rozpočet nastavíš v Útratě/);
  assert.match(args[args.indexOf('--system-prompt') + 1], /utrata/);
  assert.match(args.at(-1), /Uživatel: ahoj\nPomocník: Ahoj!\n\nUživatel: Kde nastavím rozpočet\?/);
  assert.equal(args.at(-2), '--', 'dotaz za -- se nikdy nečte jako přepínač');
  assert.equal(ignorovane[0], args[args.indexOf('--session-id') + 1], 'hooky dotazu se zahodí');
  assert.ok(opts.cwd.startsWith(dir), 'běží v prázdné dočasné složce, ne v projektu');
  assert.deepEqual(await fs.readdir(opts.cwd), []);
});

test('Pomocník AI: starší Claude Code bez --tools dostane výčet zakázaných nástrojů', async () => {
  const volani = [];
  const ai = createPomocnikAi({
    ollama: bezOllamy,
    claudeBin: () => '/bin/claude',
    tmpDir: await tmp(),
    spustit: async (cmd, args) => {
      volani.push(args);
      return volani.length === 1 ? { ok: false, stdout: '', stderr: "error: unknown option '--tools'" } : { ok: true, stdout: 'Odpověď', stderr: '' };
    },
  });
  const r = await ai.odpovez({ dotaz: 'Jak zapnu upozornění?' });
  assert.equal(r.text, 'Odpověď');
  const druhe = volani[1];
  assert.ok(!druhe.includes('--tools') && !druhe.includes('--no-session-persistence'));
  assert.match(druhe[druhe.indexOf('--disallowedTools') + 1], /Bash.*Read.*WebFetch/);
  assert.ok(druhe.indexOf('--disallowedTools') < druhe.indexOf('--'));
});

test('Pomocník AI: dotaz z telefonu Claude Code nespustí; lokální Ollama má přednost', async () => {
  let spusteno = false;
  const spustit = async () => { spusteno = true; return { ok: true, stdout: 'x', stderr: '' }; };
  const ai = createPomocnikAi({ ollama: bezOllamy, claudeBin: () => '/bin/claude', spustit, tmpDir: await tmp() });
  assert.deepEqual(await ai.odpovez({ dotaz: 'Co umíš?', smiCloud: false }), { engine: null });
  assert.equal(spusteno, false);

  const zpravy = [];
  const ollama = {
    baseUrl: 'http://127.0.0.1:11434',
    models: async () => ({ ok: true, models: [{ name: 'llama3.2:3b', size: 2e9, capabilities: ['completion'] }] }),
    loaded: async () => ({ ok: true, models: [] }),
    chat: async ({ messages, onDelta }) => { zpravy.push(...messages); onDelta('Nastavení → Upozornění.'); return {}; },
  };
  const lokalni = createPomocnikAi({ ollama, claudeBin: () => '/bin/claude', spustit, tmpDir: await tmp() });
  const r = await lokalni.odpovez({ dotaz: 'Jak zapnu upozornění?' });
  assert.deepEqual([r.engine, r.label, r.text], ['ollama', 'llama3.2:3b', 'Nastavení → Upozornění.']);
  assert.equal(zpravy[0].role, 'system');
  assert.match(zpravy[0].content, /POUZE na otázky k Agenteeq/);
  assert.equal(spusteno, false);
});
