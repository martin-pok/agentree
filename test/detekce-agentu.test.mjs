import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { korenyClaudeCode, korenZPrepisu } from '../src/connectors/claude-code.js';
import { domovyCodexu } from '../src/connectors/codex.js';
import { agentniProcesy, vedeKonverzaci, RUNTIMES, parsePs } from '../src/connectors/processes.js';
import { nesparovane, createBeziciAgenti } from '../src/bezici-agenti.js';
import { detailyProcesu, promennaZPrikazu, slozkyZLsof } from '../src/platform.js';
import { rozbalCestu, createKorenyPrepisu } from '../src/koreny-prepisu.js';
import { watchTree } from '../src/watch.js';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { startTestServer, api, tempDir, waitFor, writeJsonl, fakeDatastore, jenProcesy } from './helpers.mjs';

// Hlavní úděl Agenteeq: běžící agent na počítači musí být vidět. Tyhle testy hlídají všechny cesty,
// kudy by mohl propadnout – přepis v nečekané složce, hook s cestou mimo známé kořeny, proces bez
// přepisu – a skutečný živý proces „claude“ v Linuxu, kde to jde ověřit bez atrapy.

const H = 3600e3;
const radek = (sessionId, cwd, at = new Date().toISOString(), text = 'Oprav testy') => ({
  type: 'user', sessionId, cwd, timestamp: at, message: { role: 'user', content: text },
});

test('kořeny přepisů: CLAUDE_CONFIG_DIR, výchozí ~/.claude, starší ~/.config/claude; CODEX_HOME a ~/.codex', () => {
  // Očekávané cesty přes path.* – na Windows mají zpětná lomítka a písmeno disku.
  const eva = path.resolve('/Users/eva');
  assert.deepEqual(korenyClaudeCode({ home: eva }), [path.join(eva, '.claude', 'projects'), path.join(eva, '.config', 'claude', 'projects')]);
  assert.deepEqual(korenyClaudeCode({ home: eva, configDir: '~/Design & Web/claude' })[0], path.join(eva, 'Design & Web', 'claude', 'projects'));
  assert.equal(korenyClaudeCode({ home: eva, configDir: 'relativni' }).length, 2, 'relativní cestu bez složky procesu nehádáme');
  const data = path.resolve('/data/codex');
  assert.deepEqual(domovyCodexu({ home: eva, codexHome: data }), [data, path.join(eva, '.codex')]);
  assert.equal(rozbalCestu('~', eva), eva);
  assert.equal(rozbalCestu('  ', eva), '');
  const x = path.resolve('/x');
  assert.equal(korenZPrepisu(path.join(x, 'projects', '-Users-eva-web', 'abc12345.jsonl'), 'abc12345'), path.join(x, 'projects'));
  assert.equal(korenZPrepisu(path.join(x, 'projects', '-Users-eva-web', 'jiny.jsonl'), 'abc12345'), '', 'soubor musí patřit té konverzaci');
  assert.equal(korenZPrepisu(path.join(x, 'data', '-p', 'abc12345.jsonl'), 'abc12345'), '', 'kořen se jmenuje projects');
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

// Agent je proces, který program claude opravdu běží – sám, nebo jako skript pod interpretem (node,
// sh…). Shell, který ho jen spouští nebo o něm mluví, agent není: skutečný claude se ve výpisu objeví
// jako vlastní proces. Dřív se počítal každý řádek s cestou končící na /claude, takže obal spouštěcího
// skriptu v kontejneru Claude Code (`/bin/sh -c … ln -sf /opt/claude-code/bin/claude …`, ověřeno
// 28. 9. 2026) vypadal jako druhý agent.
test('procesy: agent je jen běžící program, ne shell nebo příkaz, který ho zmiňuje', () => {
  const obal = '/bin/sh -c if [ -d /opt/claude-code ]; then ln -sf /opt/claude-code/bin/claude /opt/node22/bin/claude; fi; mkdir -p /home/user ; cd /home/user && /usr/local/bin/environment-manager task-run --stdin';
  const agent = [
    '/opt/claude-code/bin/claude --output-format=stream-json --verbose',
    '/Users/e/.local/bin/claude',
    'claude --resume abc',
    'node /usr/local/bin/claude',
    'node --no-warnings /usr/local/bin/claude -p x',
    '/Users/Jana Nováková/.nvm/versions/node/v22.13.0/bin/node /Users/Jana Nováková/.nvm/versions/node/v22.13.0/bin/claude',
    'node /root/.npm/_npx/6a9f0c/node_modules/.bin/claude',
    '/bin/sh /tmp/agenteeq-zivy-x/bin/claude',
    '/bin/bash /home/u/.local/bin/claude --resume abc',
    '/Users/m/Library/Application Support/Claude/claude-code/2.1.260/claude.app/Contents/MacOS/claude --output-format stream-json',
    'C:\\Users\\jana\\AppData\\Roaming\\npm\\claude.exe -p',
    'C:\\Program Files\\nodejs\\node.exe C:\\Users\\jana\\AppData\\Roaming\\npm\\claude.exe',
  ];
  const neniAgent = [
    obal,
    '/bin/zsh -lc /usr/local/bin/claude',
    'bash -c /home/u/.local/bin/claude --resume abc',
    'sudo /usr/local/bin/claude',
    'caffeinate -i /usr/local/bin/claude',
    'vim /Users/e/.local/bin/claude',
    'ln -sf /opt/claude-code/bin/claude /usr/local/bin/claude',
    'tail -f /var/log/claude',
    'C:\\Windows\\System32\\cmd.exe /c C:\\Users\\jana\\AppData\\Roaming\\npm\\claude.exe -p',
  ];
  for (const a of agent) assert.equal(RUNTIMES.find((r) => r.test(a))?.id, 'claude-code', a);
  for (const a of neniAgent) assert.notEqual(RUNTIMES.find((r) => r.test(a))?.id, 'claude-code', a);
  // Stejné pravidlo platí pro ostatní nástroje příkazové řádky.
  assert.equal(RUNTIMES.find((r) => r.test('/bin/sh -c /opt/homebrew/bin/codex exec x'))?.id, undefined);
  assert.equal(RUNTIMES.find((r) => r.test('node /opt/homebrew/bin/gemini'))?.id, 'gemini-cli');

  // Výpis z kontejneru: obal a skutečný claude pod ním jsou jeden agent, ne dva.
  const vystup = [`   81 55:06 0.0 3000 ${obal}`, '  103 55:04 1.0 400000 /opt/claude-code/bin/claude --output-format=stream-json --verbose'].join('\n');
  assert.deepEqual(agentniProcesy(vystup).map((p) => p.pid), [103]);
  assert.equal(parsePs(vystup).find((r) => r.id === 'claude-code').processes, 1);
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
//
// Dřív server viděl procesy celého počítače, přidal si CLAUDE_CONFIG_DIR jiného souběžného běhu a jeho
// přepis s tímtéž pevným ID obsadil konverzaci – proces se nespároval nikdy. Teď test vidí jen své
// procesy (jenProcesy) a ID je náhodné jako u skutečných konverzací (UUID).
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
  // Cizí agent se svým CLAUDE_CONFIG_DIR – jako jiný souběžný běh nebo Claude Code uživatele. Server
  // vidí jen procesy testu (jenProcesy), takže jeho kořen ani přepisy nikdy nečte.
  const cizi = path.join(await tempDir('agenteeq-cizi-'), 'claude cfg');
  const cizak = spawn(path.join(bin, 'claude'), [], { cwd: slozka, env: { ...process.env, CLAUDE_CONFIG_DIR: cizi }, stdio: 'ignore' });
  // Hned po spawn() může v /proc ještě stát příkazová řádka rodiče (před exec) a sdílený výpis procesů
  // pak platí 4 s. Server se proto spustí, až proces opravdu běží jako „claude“ – podmínka, ne čas.
  const bezi = (p) => fs.readFile(`/proc/${p.pid}/cmdline`, 'utf8').catch(() => '').then((c) => c.includes(path.join(bin, 'claude')));
  await waitFor(async () => (await bezi(agent)) && bezi(cizak), 8000);
  const pidy = new Set([agent.pid]);
  let druhy = null;
  const srv = await startTestServer({ AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '200' }, { vypisProcesu: jenProcesy(pidy) });
  try {
    const klient = api(srv.url);
    const najdi = async () => (await klient.get('/api/state')).body.sessions.find((s) => s.proces?.pid === agent.pid);
    const v = await waitFor(najdi, 8000);
    assert.equal(v.status, 'waiting');
    assert.equal(v.cwd, slozka);
    assert.match(v.reason, /Claude Code běží v Design & Web/);
    // Kořen z prostředí procesu se přidal – první zadání se najde a spáruje.
    assert.ok(srv.app.connectors['claude-code'].koreny().includes(path.join(cfg, 'projects')));
    // Žádný kořen mimo dočasné složky testu: cizí proces nic nepřidal.
    for (const k of srv.app.connectors['claude-code'].koreny()) {
      assert.ok(k.startsWith(srv.sourceHome) || k.startsWith(dir), `kořen mimo dočasnou složku testu: ${k}`);
    }
    assert.equal((await klient.get('/api/state')).body.sessions.some((s) => s.proces?.pid === cizak.pid), false, 'cizí proces se neukáže');
    const id = crypto.randomUUID();
    await writeJsonl(path.join(cfg, 'projects', '-Design---Web', `${id}.jsonl`), [radek(id, slozka)]);
    // Složka projects/ vznikla až teď, po přidání kořene. Sledování to zkusí znovu za 5 s a pravidelný
    // průchod přijde za 10 s (v testech 60 s); na tyhle hodiny test nečeká a jeden průchod spustí sám –
    // totéž, co dělá časovač v src/app.js. Že sledování kořen po vzniku převezme, hlídá test watchTree níž.
    await srv.app.connectors['claude-code'].scan();
    await waitFor(() => srv.app.store.summary(`claude-code:${id}`), 8000);
    assert.equal(srv.app.store.get(`claude-code:${id}`).cwd, slozka, 'konverzace se načetla z vlastního přepisu');
    await waitFor(async () => !(await najdi()), 8000);

    // Nespárovaný proces po skončení zmizí. Spárovaný zmizel už spárováním, takže konec musí ukázat
    // proces, ke kterému konverzace není: jiná složka, žádný přepis.
    const jinde = path.join(dir, 'Jiný projekt');
    await fs.mkdir(jinde);
    druhy = spawn(path.join(bin, 'claude'), [], { cwd: jinde, env: { PATH: process.env.PATH }, stdio: 'ignore' });
    pidy.add(druhy.pid);
    const druhyZaznam = async () => (await klient.get('/api/state')).body.sessions.find((s) => s.proces?.pid === druhy.pid);
    const z = await waitFor(druhyZaznam, 8000);
    assert.equal(z.cwd, jinde);
    assert.equal(z.status, 'waiting', 'běží, zatím bez přepisu');
    const konec = new Promise((r) => druhy.once('exit', r));
    druhy.kill();
    await konec;
    await waitFor(async () => !(await druhyZaznam()), 8000);
  } finally {
    agent.kill();
    cizak.kill();
    druhy?.kill();
    await srv.close();
  }
});

// Výpis procesů se mezi konektory sdílí, ale nikdy není starší než jeden průchod: s pevnými 4 s by
// AGENTEEQ_PROCESS_MS kratší než 4 s nic neznamenal a skončený agent by v přehledu visel až 4 s.
test('výpis procesů není starší než jeden průchod', async () => {
  let volani = 0;
  const vypis = jenProcesy(new Set());
  const srv = await startTestServer({ AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '200' }, { vypisProcesu: () => { volani++; return vypis(); } });
  try {
    const zacatek = volani;
    await new Promise((r) => setTimeout(r, 1200));
    assert.ok(volani - zacatek >= 3, `za 1,2 s při průchodu po 200 ms jen ${volani - zacatek} výpisů`);
  } finally {
    await srv.close();
  }
});

// Kořen z procesu často ještě neexistuje: Claude Code zakládá projects/ až s první zprávou. Sledování
// to pak zkouší znovu a po vzniku složky ohlásí plný průchod (null), který najde i soubor zapsaný dřív,
// než sledování začalo. Hodiny tu řídí test (retryMs), ne skutečných 5 s.
test('sledování kořene, který ještě neexistuje, začne, jakmile složka vznikne', async (t) => {
  const koren = path.join(await tempDir('agenteeq-koren-'), 'claude cfg', 'projects');
  const zmeny = [];
  const w = watchTree(koren, (soubor) => zmeny.push(soubor), { retryMs: 20 });
  t.after(() => w.close());
  assert.equal(w.active, false, 'složka zatím neexistuje');
  assert.deepEqual(zmeny, []);
  await writeJsonl(path.join(koren, '-Design---Web', 'a.jsonl'), [{}]);
  await waitFor(() => w.active, 4000);
  assert.ok(zmeny.includes(null), 'po vzniku složky se ohlásí plný průchod');
});

// Kořen, jehož složka ještě neexistuje, ale rodič ano (Claude Code je nainstalovaný, projects/ založí až
// první zpráva; CLAUDE_CONFIG_DIR běžícího procesu): dřív se sledování zkoušelo znovu jen každých 5 s,
// takže nový agent se ukázal až po 5 s – mimo cíl 2 s z AGENTS.md. Teď rodiče hlídá nerekurzivní
// „strážce“ a sledování začne, jakmile složka vznikne. Hodiny řídí test: opakování je hodina daleko,
// takže projít může jen strážce.
test('sledování kořene převezme novou složku hned, bez čekání na opakování', async (t) => {
  const rodic = path.join(await tempDir('agenteeq-strazce-'), 'claude cfg');
  await fs.mkdir(rodic);
  const koren = path.join(rodic, 'projects');
  const zmeny = [];
  const w = watchTree(koren, (soubor) => zmeny.push(soubor), { retryMs: 3_600_000, hlidatVznik: true });
  t.after(() => w.close());
  assert.equal(w.active, false);
  assert.equal(w.strazi, rodic, 'hlídá se přímý rodič');
  const pokusy = w.pokusy;

  // Klid: soubory, které Claude Code píše vedle (todos, statsig…), nevyvolají žádný pokus navíc.
  for (let i = 0; i < 50; i++) await fs.writeFile(path.join(rodic, `vedle-${i}.json`), '{}');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(w.pokusy, pokusy, 'jiná položka v rodiči sledování nezkouší');

  const zacatek = Date.now();
  await writeJsonl(path.join(koren, '-Design---Web', 'a.jsonl'), [{}]);
  await waitFor(() => w.active, 2000);
  assert.ok(Date.now() - zacatek < 2000, 'do 2 s');
  assert.ok(zmeny.includes(null), 'plný průchod najde i soubor zapsaný před začátkem sledování');
  assert.equal(w.strazi, '', 'strážce po převzetí skončí');

  // Strážce nikdy nad složkou, která chybí taky (nehlídá se nic širšího než rodič), ani nad domovem.
  const hluboko = watchTree(path.join(rodic, 'chybi', 'projects'), () => {}, { retryMs: 3_600_000, hlidatVznik: true });
  t.after(() => hluboko.close());
  assert.equal(hluboko.strazi, '');
  const domov = watchTree(path.join(rodic, 'projects-2'), () => {}, { retryMs: 3_600_000, hlidatVznik: true, bezStrazce: [rodic] });
  t.after(() => domov.close());
  assert.equal(domov.strazi, '', 'domov uživatele se nehlídá ani nerekurzivně');
});

// Totéž celou cestou: aplikace s nainstalovaným Claude Code bez jediné konverzace ukáže první
// konverzaci do 2 s. Opakování sledování je 5 s po startu a plný průchod v testech 60 s, takže
// do 2 s od startu ji může přinést jen strážce.
test('první konverzace v kořeni bez projects/ se ukáže do 2 s', async () => {
  const home = await tempDir('agenteeq-src-');
  await fs.mkdir(path.join(home, '.claude'));
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    const id = crypto.randomUUID();
    const zacatek = Date.now();
    await writeJsonl(path.join(home, '.claude', 'projects', '-tmp-w', `${id}.jsonl`), [radek(id, '/tmp/w')]);
    await waitFor(() => srv.app.store.summary(`claude-code:${id}`), 2000);
    assert.ok(Date.now() - zacatek < 2000);
  } finally {
    await srv.close();
  }
});

test('kořeny přepisů mají strop – podvržené cesty z hooků nevyčerpají sledování souborů', () => {
  const k = createKorenyPrepisu(['/a/projects'], { zmena() {}, max: 3 });
  assert.equal(k.pridej('/b/projects'), true);
  assert.equal(k.pridej('/b/projects'), false, 'tentýž kořen podruhé ne');
  assert.equal(k.pridej('/c/projects'), true);
  assert.equal(k.pridej('/d/projects'), false, 'nad strop se nepřidá');
  assert.equal(k.seznam().length, 3);
});
