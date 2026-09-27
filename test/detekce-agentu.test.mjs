import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { korenyClaudeCode, korenZPrepisu } from '../src/connectors/claude-code.js';
import { domovyCodexu } from '../src/connectors/codex.js';
import { agentniProcesy, vedeKonverzaci } from '../src/connectors/processes.js';
import { nesparovane, createBeziciAgenti } from '../src/bezici-agenti.js';
import { detailyProcesu, promennaZPrikazu, slozkyZLsof } from '../src/platform.js';
import { rozbalCestu } from '../src/koreny-prepisu.js';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { startTestServer, api, tempDir, waitFor, writeJsonl, fakeDatastore } from './helpers.mjs';

// Hlavní úděl Agenteeq: běžící agent na počítači musí být vidět. Tyhle testy hlídají všechny cesty,
// kudy by mohl propadnout – přepis v nečekané složce, hook s cestou mimo známé kořeny, proces bez
// přepisu – a skutečný živý proces „claude“ v Linuxu, kde to jde ověřit bez atrapy.

const H = 3600e3;
const radek = (sessionId, cwd, at = new Date().toISOString(), text = 'Oprav testy') => ({
  type: 'user', sessionId, cwd, timestamp: at, message: { role: 'user', content: text },
});

test('kořeny přepisů: CLAUDE_CONFIG_DIR, výchozí ~/.claude, starší ~/.config/claude; CODEX_HOME a ~/.codex', () => {
  assert.deepEqual(korenyClaudeCode({ home: '/Users/eva' }), ['/Users/eva/.claude/projects', '/Users/eva/.config/claude/projects']);
  assert.deepEqual(korenyClaudeCode({ home: '/Users/eva', configDir: '~/Design & Web/claude' })[0], '/Users/eva/Design & Web/claude/projects');
  assert.equal(korenyClaudeCode({ home: '/Users/eva', configDir: 'relativni' }).length, 2, 'relativní cestu bez složky procesu nehádáme');
  assert.deepEqual(domovyCodexu({ home: '/Users/eva', codexHome: '/data/codex' }), ['/data/codex', '/Users/eva/.codex']);
  assert.equal(rozbalCestu('~', '/h'), '/h');
  assert.equal(rozbalCestu('  ', '/h'), '');
  assert.equal(korenZPrepisu('/x/projects/-Users-eva-web/abc12345.jsonl', 'abc12345'), '/x/projects');
  assert.equal(korenZPrepisu('/x/projects/-Users-eva-web/jiny.jsonl', 'abc12345'), '', 'soubor musí patřit té konverzaci');
  assert.equal(korenZPrepisu('/x/data/-p/abc12345.jsonl', 'abc12345'), '', 'kořen se jmenuje projects');
  assert.equal(korenZPrepisu('relativni/projects/p/abc12345.jsonl', 'abc12345'), '');
});

test('přepis z CLAUDE_CONFIG_DIR a ze starší ~/.config/claude se načte', async () => {
  const cfg = await tempDir('agenteeq-cfg-');
  const srv = await startTestServer({ AGENTEEQ_CLAUDE_CONFIG_DIR: cfg });
  try {
    await writeJsonl(path.join(cfg, 'projects', '-tmp-web', 'aaaa1111-0000-0000-0000-000000000001.jsonl'), [radek('aaaa1111-0000-0000-0000-000000000001', '/tmp/web')]);
    await writeJsonl(path.join(srv.sourceHome, '.config', 'claude', 'projects', '-tmp-api', 'bbbb2222-0000-0000-0000-000000000002.jsonl'), [radek('bbbb2222-0000-0000-0000-000000000002', '/tmp/api')]);
    await srv.app.connectors['claude-code'].scan();
    const ids = (await api(srv.url).get('/api/state')).body.sessions.map((s) => s.id);
    assert.ok(ids.includes('claude-code:aaaa1111-0000-0000-0000-000000000001'), 'CLAUDE_CONFIG_DIR');
    assert.ok(ids.includes('claude-code:bbbb2222-0000-0000-0000-000000000002'), '~/.config/claude');
  } finally {
    await srv.close();
  }
});

test('hook s přepisem mimo známé kořeny: kořen se přidá, přepis se načte i s tokeny', async () => {
  const jinde = await tempDir('agenteeq-jinde-');
  const srv = await startTestServer();
  try {
    const id = 'cccc3333-0000-0000-0000-000000000003';
    const soubor = path.join(jinde, 'projects', '-tmp-x', `${id}.jsonl`);
    await writeJsonl(soubor, [
      radek(id, '/tmp/x'),
      { type: 'assistant', sessionId: id, timestamp: new Date().toISOString(), message: { id: 'm1', role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: 'Hotovo' }], stop_reason: 'end_turn', usage: { input_tokens: 120, output_tokens: 30 } } },
    ]);
    const r = await srv.app.connectors['claude-code'].ingestHook({ session_id: id, hook_event_name: 'Stop', transcript_path: soubor, cwd: '/tmp/x' });
    assert.equal(r.ok, true);
    assert.ok(srv.app.connectors['claude-code'].koreny().includes(path.join(jinde, 'projects')));
    const s = srv.app.store.summary(`claude-code:${id}`);
    assert.equal(s.tokens.input + s.tokens.output, 150);
    // Nová konverzace v témže kořeni se pak najde i bez hooku (kořen se sleduje).
    const id2 = 'dddd4444-0000-0000-0000-000000000004';
    await writeJsonl(path.join(jinde, 'projects', '-tmp-y', `${id2}.jsonl`), [radek(id2, '/tmp/y')]);
    await waitFor(() => srv.app.store.summary(`claude-code:${id2}`), 6000);
  } finally {
    await srv.close();
  }
});

test('tatáž konverzace ze dvou kořenů (symlink) se nezapočítá dvakrát', async (t) => {
  if (process.platform === 'win32') return t.skip('symlink složky vyžaduje práva');
  const home = await tempDir('agenteeq-sym-');
  const id = 'eeee5555-0000-0000-0000-000000000005';
  await writeJsonl(path.join(home, '.claude', 'projects', '-tmp-z', `${id}.jsonl`), [
    radek(id, '/tmp/z'),
    { type: 'assistant', sessionId: id, timestamp: new Date().toISOString(), message: { id: 'm1', role: 'assistant', model: 'm', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } },
  ]);
  await fs.mkdir(path.join(home, '.config'), { recursive: true });
  await fs.symlink(path.join(home, '.claude'), path.join(home, '.config', 'claude'));
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    await srv.app.connectors['claude-code'].scan();
    assert.equal(srv.app.store.summary(`claude-code:${id}`).tokens.input + srv.app.store.summary(`claude-code:${id}`).tokens.output, 15);
  } finally {
    await srv.close();
  }
});

test('Codex z CODEX_HOME i z domova, který prozradí proces až za běhu', async () => {
  const codexHome = await tempDir('agenteeq-codex-');
  const pozdejsi = await tempDir('agenteeq-codex2-');
  const srv = await startTestServer({ AGENTEEQ_CODEX_HOME: codexHome });
  const relace = (id) => [
    { timestamp: new Date().toISOString(), type: 'session_meta', payload: { id, cwd: '/tmp/c', timestamp: new Date().toISOString() } },
    { timestamp: new Date().toISOString(), type: 'event_msg', payload: { type: 'user_message', message: 'ahoj' } },
  ];
  try {
    const id1 = '11111111-2222-3333-4444-555555555555';
    await writeJsonl(path.join(codexHome, 'sessions', '2026', '09', '27', `rollout-2026-09-27T10-00-00-${id1}.jsonl`), relace(id1));
    await srv.app.connectors.codex.scan();
    assert.ok(srv.app.store.summary(`codex:${id1}`), 'CODEX_HOME');
    const id2 = '66666666-7777-8888-9999-000000000000';
    await writeJsonl(path.join(pozdejsi, 'sessions', '2026', '09', '27', `rollout-2026-09-27T11-00-00-${id2}.jsonl`), relace(id2));
    assert.equal(await srv.app.connectors.codex.pridejDomov(pozdejsi), true);
    assert.equal(await srv.app.connectors.codex.pridejDomov(pozdejsi), false, 'podruhé se nepřidává');
    assert.ok(srv.app.store.summary(`codex:${id2}`), 'domov z běžícího procesu');
  } finally {
    await srv.close();
  }
});

test('procesy: každý agent zvlášť, bez pomocných procesů a příkazů bez konverzace', () => {
  const vystup = [
    '  101 01:02:03 0.5 20480 /Users/e/.local/bin/claude',
    '  102 00:10 0.0 2048 claude auth status --json',
    '  103 1-00:00:00 1.0 4096 node /usr/local/bin/codex',
    '  104 00:05 0.0 100 /Applications/Claude.app/Contents/MacOS/Claude',
    '  105 00:05 0.0 100 /Users/e/.local/bin/claude --bg-spare',
    '  106 00:05 0.0 100 /opt/homebrew/bin/codex app-server',
    '  107 00:05 0.0 100 /Applications/ChatGPT.app/Contents/Resources/codex app-server',
    '  108 00:05 0.0 100 gemini',
    '  109 00:05 0.0 100 claude -p "auth"',
  ].join('\n');
  assert.deepEqual(agentniProcesy(vystup).map((p) => [p.pid, p.runtime]), [[101, 'claude-code'], [103, 'codex'], [108, 'gemini-cli'], [109, 'claude-code']]);
  assert.equal(vedeKonverzaci('claude daemon run', 'claude-code'), false);
  assert.equal(vedeKonverzaci('claude --resume abc', 'claude-code'), true);
  assert.equal(vedeKonverzaci('codex exec "oprav testy"', 'codex'), true);
});

test('párování procesů s konverzacemi', () => {
  const ted = Date.now();
  const p = (pid, od, cwd = '/w', runtime = 'claude-code') => ({ pid, runtime, od, cwd });
  const s = (id, lastAt, cwd = '/w', connector = 'claude-code') => ({ id, connector, lastAt, cwd, hookAt: 0 });
  assert.deepEqual(nesparovane([p(1, ted - H)], []).map((x) => x.pid), [1], 'bez konverzace');
  assert.deepEqual(nesparovane([p(1, ted - H)], [s('a', ted)]), [], 'konverzace žila od startu procesu');
  assert.deepEqual(nesparovane([p(1, ted - H)], [s('a', ted - 2 * H)]).map((x) => x.pid), [1], 'stará konverzace z doby před startem');
  assert.deepEqual(nesparovane([p(1, ted - H)], [s('a', ted, '/jinde')]).map((x) => x.pid), [1], 'jiná složka');
  assert.deepEqual(nesparovane([p(1, ted - H, '')], [s('a', ted, '/cokoli')]), [], 'složku procesu neznáme (Windows): stačí čas');
  assert.deepEqual(nesparovane([p(1, ted - H), p(2, ted - 10 * 60e3)], [s('a', ted)]).map((x) => x.pid), [2], 'dva agenti v jedné složce = dva agenti; konverzaci drží starší');
  assert.deepEqual(nesparovane([p(1, ted - H), p(2, ted - 10 * 60e3)], [s('stara', ted - 30 * 60e3), s('nova', ted)]), [], 'každý svou: starší proces starší konverzaci');
  assert.deepEqual(nesparovane([p(1, ted - H, '/w', 'codex')], [s('a', ted)]).map((x) => x.pid), [1], 'jiný nástroj');
  assert.deepEqual(nesparovane([p(1, ted - H)], [{ ...s('a', 0), hookAt: ted }]), [], 'hook SessionStart stačí');
  assert.deepEqual(nesparovane([p(1, ted - H)], [{ ...s('a', ted), proces: { pid: 9 } }]).map((x) => x.pid), [1], 'procesový záznam se nepočítá');
});

test('pojistka: proces bez přepisu se ukáže, s přepisem zmizí, po skončení zmizí, při nejistotě zůstane', () => {
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: '/tmp/nic', AGENTEEQ_HOME: '/tmp/nic' });
  const store = new Store({ config, datastore: fakeDatastore() });
  const pojistka = createBeziciAgenti({ store });
  const od = Date.now() - 5 * 60e3;
  const proces = { pid: 4242, runtime: 'claude-code', od, cwd: '/Users/eva/Design & Web' };
  pojistka.upravit([proces]);
  const v = store.summary('claude-code:proces-4242');
  assert.equal(v.status, 'waiting');
  assert.match(v.reason, /Claude Code běží v Design & Web/);
  assert.match(v.reason, /Přepis zatím není/);
  assert.deepEqual(v.proces, { pid: 4242, od });
  assert.ok(store.list().some((x) => x.id === 'claude-code:proces-4242'), 'je v seznamu agentů');
  pojistka.upravit(null);
  assert.ok(store.summary('claude-code:proces-4242'), 'nepovedený výpis procesů nic neubere');
  // Přepis se objevil (první zadání): spáruje se a procesový záznam zmizí.
  const s = store.ensure({ connector: 'claude-code', localId: 'ffff', provider: 'anthropic', app: 'Claude Code' });
  s.cwd = proces.cwd;
  s.lastAt = Date.now();
  pojistka.upravit([proces]);
  assert.equal(store.summary('claude-code:proces-4242'), null);
  // Druhý agent ve stejné složce bez přepisu se ukáže; když skončí, zmizí.
  pojistka.upravit([proces, { ...proces, pid: 4343, od: Date.now() - 60e3 }]);
  assert.ok(store.summary('claude-code:proces-4343'));
  pojistka.upravit([proces]);
  assert.equal(store.summary('claude-code:proces-4343'), null);
  assert.equal(pojistka.pocet(), 0);
});

test('podrobnosti procesu: výstup lsof a ps -E z macOS', () => {
  assert.equal(promennaZPrikazu('/bin/claude --x HOME=/Users/eva CLAUDE_CONFIG_DIR=/Users/eva/Design & Web/c TERM=xterm', 'CLAUDE_CONFIG_DIR'), '/Users/eva/Design & Web/c');
  assert.equal(promennaZPrikazu('/bin/claude CLAUDE_CONFIG_DIR_X=/a', 'CLAUDE_CONFIG_DIR'), '');
  assert.deepEqual([...slozkyZLsof('p12\nfcwd\nn/Users/eva/Projekt A\np34\nfcwd\nn/tmp\n')], [[12, '/Users/eva/Projekt A'], [34, '/tmp']]);
});

test('podrobnosti procesu na macOS se skládají z lsof a ps -E', async () => {
  const volani = [];
  const runImpl = async (cmd, args) => {
    volani.push(cmd);
    if (cmd === 'lsof') return { ok: true, stdout: 'p7\nfcwd\nn/Users/eva/web\n' };
    return { ok: true, stdout: '    7 /Users/eva/.local/bin/claude HOME=/Users/eva CLAUDE_CONFIG_DIR=/Users/eva/cfg\n' };
  };
  const d = await detailyProcesu([7], ['CLAUDE_CONFIG_DIR'], { runImpl, jeMac: true, jeWindows: false });
  assert.deepEqual(d.get(7), { cwd: '/Users/eva/web', env: { CLAUDE_CONFIG_DIR: '/Users/eva/cfg' } });
  assert.deepEqual(volani, ['lsof', 'ps']);
  const win = await detailyProcesu([7], ['X'], { runImpl, jeMac: false, jeWindows: true });
  assert.deepEqual(win.get(7), { cwd: '', env: {} }, 'Windows: nic se nehádá');
});

// Skutečný běžící proces „claude“ (skript) ve složce s ampersandem a s CLAUDE_CONFIG_DIR. Aplikace ho
// musí najít z výpisu procesů, ukázat ho jako běžícího agenta a po prvním zápisu do přepisu v jeho
// CLAUDE_CONFIG_DIR ho spárovat s konverzací. Na Linuxu přes /proc, bez jakékoli atrapy.
test('živý proces claude se zaregistruje, spáruje s přepisem a po skončení zmizí', async (t) => {
  if (process.platform !== 'linux') return t.skip('živý proces se ověřuje na Linuxu (/proc); macOS jde přes lsof');
  const dir = await tempDir('agenteeq-zivy-');
  const slozka = path.join(dir, 'Design & Web');
  const bin = path.join(dir, 'bin');
  const cfg = path.join(dir, 'claude cfg');
  await fs.mkdir(slozka, { recursive: true });
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(path.join(bin, 'claude'), '#!/bin/sh\nsleep 60\n', { mode: 0o755 });
  const agent = spawn(path.join(bin, 'claude'), [], { cwd: slozka, env: { ...process.env, CLAUDE_CONFIG_DIR: cfg }, stdio: 'ignore' });
  const srv = await startTestServer({ AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '200' });
  try {
    const klient = api(srv.url);
    const najdi = async () => (await klient.get('/api/state')).body.sessions.find((s) => s.proces?.pid === agent.pid);
    const v = await waitFor(najdi, 8000);
    assert.equal(v.status, 'waiting');
    assert.equal(v.cwd, slozka);
    assert.match(v.reason, /Claude Code běží v Design & Web/);
    // Kořen z prostředí procesu se přidal – první zadání se najde a spáruje.
    assert.ok(srv.app.connectors['claude-code'].koreny().includes(path.join(cfg, 'projects')));
    const id = '12345678-aaaa-bbbb-cccc-000000000099';
    await writeJsonl(path.join(cfg, 'projects', '-Design---Web', `${id}.jsonl`), [radek(id, slozka)]);
    await waitFor(() => srv.app.store.summary(`claude-code:${id}`), 8000);
    await waitFor(async () => !(await najdi()), 8000);
    agent.kill();
    await waitFor(async () => !(await klient.get('/api/state')).body.sessions.some((s) => s.proces?.pid === agent.pid), 8000);
  } finally {
    agent.kill();
    await srv.close();
  }
});
