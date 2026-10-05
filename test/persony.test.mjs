import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { appSupportDir } from '../src/platform.js';
import { startTestServer, api, tempDir, waitFor, writeJsonl, openStream, jenProcesy, pairExtension, EXTENSION_ORIGIN } from './helpers.mjs';

// Tři typičtí uživatelé. U každého se ověřuje totéž, co slibuje Agenteeq: každý agent, který na
// počítači běží, je v přehledu právě jednou, správně pojmenovaný, se správným stavem, a objeví se
// do 2 s bez obnovení stránky (událost v živém streamu). Agenti v příkazové řádce jsou skutečné
// procesy (Linux přes /proc, bez atrapy výpisu); desktopové aplikace jsou řádky výpisu procesů
// v přesném tvaru z macOS; webové chaty posílá rozšíření stejným API jako v provozu.

const JE_LINUX = process.platform === 'linux';
const LIMIT_MS = 2000;
const iso = (t = Date.now()) => new Date(t).toISOString();

// Přepis Claude Code s dokončeným tahem: agent odpověděl a čeká na další zadání.
const claudePrepis = (id, cwd, text = 'Oprav testy') => [
  { type: 'user', sessionId: id, cwd, timestamp: iso(), message: { role: 'user', content: text } },
  { type: 'assistant', sessionId: id, cwd, timestamp: iso(), message: { id: `m-${id}`, role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: 'Hotovo.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } },
];
// Přepis Codexu s rozpracovaným tahem.
const codexPrepis = (id, cwd, originator = 'codex_cli_rs') => [
  { timestamp: iso(), type: 'session_meta', payload: { id, cwd, originator, timestamp: iso() } },
  { timestamp: iso(), type: 'event_msg', payload: { type: 'task_started' } },
  { timestamp: iso(), type: 'event_msg', payload: { type: 'user_message', message: 'Oprav testy' } },
];
const codexSoubor = (domov, id) => path.join(domov, 'sessions', '2026', '10', '05', `rollout-2026-10-05T10-00-00-${id}.jsonl`);

async function skripty(dir) {
  const zapis = async (soubor, obsah) => {
    await fs.mkdir(path.dirname(soubor), { recursive: true });
    await fs.writeFile(soubor, obsah, { mode: 0o755 });
    return soubor;
  };
  const bin = path.join(dir, 'bin');
  const codexKoren = path.join(dir, 'lib', 'node_modules', '@openai', 'codex');
  const codexNativni = await zapis(path.join(codexKoren, 'vendor', 'x86_64-unknown-linux-musl', 'bin', 'codex'), '#!/bin/sh\nsleep 30\n');
  return {
    claude: await zapis(path.join(bin, 'claude'), '#!/bin/sh\nsleep 30\n'),
    codex: await zapis(path.join(bin, 'codex'), '#!/bin/sh\nsleep 30\n'),
    // Jako @openai/codex 0.160.0 bin/codex.js: nativní program jako dítě se stejnými argumenty.
    codexJs: await zapis(path.join(codexKoren, 'bin', 'codex.js'), `const c = require('node:child_process').spawn(${JSON.stringify(codexNativni)}, process.argv.slice(2), { stdio: 'ignore' });
process.on('SIGTERM', () => { c.kill(); process.exit(0); });
c.on('exit', () => process.exit(0));
`),
    // Jako gemini-cli 0.62.0: znovuspuštění s větší pamětí jako dítě.
    geminiJs: await zapis(path.join(dir, 'lib', 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js'), `if (process.env.GEMINI_CLI_NO_RELAUNCH) { setTimeout(() => process.exit(0), 30000); }
else {
  const c = require('node:child_process').spawn(process.execPath, ['--max-old-space-size=64', __filename], { stdio: 'ignore', env: { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' } });
  process.on('SIGTERM', () => { c.kill(); process.exit(0); });
  c.on('exit', () => process.exit(0));
}
`),
  };
}

// Prostředí jedné persony: server se zapnutým výpisem procesů omezeným na procesy testu (+ řádky
// desktopových aplikací), živý stream a pomocníci pro spuštění agenta a čekání na jeho záznam.
async function prostredi(env = {}) {
  const home = await tempDir('agenteeq-persona-');
  const pidy = new Set();
  const desktop = [];
  const vlastni = jenProcesy(pidy);
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_PROCESSES: '1', ...env }, {
    vypisProcesu: async () => {
      const r = await vlastni();
      return r.ok ? { ...r, stdout: [r.stdout, ...desktop].filter(Boolean).join('\n') } : r;
    },
  });
  const stream = await openStream(srv.url);
  const deti = [];
  const spust = (prikaz, args, { cwd, env: e = {} } = {}) => {
    const p = spawn(prikaz, args, { cwd, env: { ...process.env, ...e }, stdio: 'ignore' });
    deti.push(p);
    pidy.add(p.pid);
    return p;
  };
  // Čas od `t0` do první události `session` pro záznam, který splní podmínku.
  const objeviSe = async (t0, podminka, ms = LIMIT_MS) => {
    const e = await waitFor(() => stream.events.find((x) => x.event === 'session' && x.at >= t0 && podminka(x.data)), ms + 500);
    return { ...e, za: e.at - t0 };
  };
  const agenti = async () => (await api(srv.url).get('/api/state')).body.sessions.filter((s) => !s.parentId);
  return {
    home, srv, stream, desktop, spust, objeviSe, agenti,
    async konec() {
      stream.close();
      for (const p of deti) p.kill();
      await srv.close();
    },
  };
}

const jedenZaznam = (agenti) => {
  const ids = agenti.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `žádný záznam dvakrát: ${ids.join(', ')}`);
};

test('persona „lehký uživatel“: Claude Code v Terminálu a ChatGPT v Chromu', async (t) => {
  if (!JE_LINUX) return t.skip('skutečné procesy agentů se ověřují na Linuxu (/proc)');
  const o = await prostredi();
  try {
    const bin = await skripty(await tempDir('agenteeq-persona-bin-'));
    const web = path.join(o.home, 'projekty', 'Design & Web');
    await fs.mkdir(web, { recursive: true });
    await fs.mkdir(path.join(o.home, '.claude', 'projects'), { recursive: true });
    const casy = {};

    // 1. Spustí Claude Code a ještě nic nenapíše: přepis neexistuje, agent je vidět jako běžící proces.
    let t0 = Date.now();
    const claude = o.spust(bin.claude, [], { cwd: web });
    const proces = await o.objeviSe(t0, (s) => s.proces?.pid === claude.pid);
    casy['Claude Code spuštěný (proces)'] = proces.za;
    assert.equal(proces.data.app, 'Claude Code');
    assert.equal(proces.data.status, 'observed');

    // 2. První zadání: přepis vznikne, záznam procesu se spáruje s konverzací – zůstane jeden agent.
    const id = crypto.randomUUID();
    t0 = Date.now();
    await writeJsonl(path.join(o.home, '.claude', 'projects', '-Design---Web', `${id}.jsonl`), claudePrepis(id, web));
    const konverzace = await o.objeviSe(t0, (s) => s.id === `claude-code:${id}`);
    casy['Claude Code první zadání (přepis)'] = konverzace.za;
    await waitFor(async () => !(await o.agenti()).some((s) => s.proces), LIMIT_MS);

    // 3. ChatGPT v Chromu: nová konverzace bez ID, po první zprávě dostane ID.
    const { token } = await pairExtension(o.srv.url);
    const posli = (telo) => api(o.srv.url).send('POST', '/api/ingest/web', { site: 'chatgpt', generating: true, counts: { user: 1, assistant: 0 }, ...telo }, { 'X-Agenteeq-Token': token, Origin: EXTENSION_ORIGIN });
    t0 = Date.now();
    await posli({ conversationId: 'tab-a1b2c3', url: 'https://chatgpt.com/' });
    casy['ChatGPT v Chromu'] = (await o.objeviSe(t0, (s) => s.id === 'web:chatgpt:tab-a1b2c3')).za;
    await posli({ conversationId: '68e2-0001', url: 'https://chatgpt.com/c/68e2-0001', nahrazuje: 'tab-a1b2c3' });

    const agenti = await o.agenti();
    jedenZaznam(agenti);
    assert.deepEqual(agenti.map((s) => [s.id, s.app, s.status]).sort(), [
      [`claude-code:${id}`, 'Claude Code', 'waiting'],
      ['web:chatgpt:68e2-0001', 'ChatGPT', 'working'],
    ]);
    const stav = (await api(o.srv.url).get('/api/state')).body;
    assert.equal(stav.runtimes.find((r) => r.id === 'claude-code').running, true);
    assert.deepEqual(stav.runtimes.filter((r) => r.running).map((r) => r.id), ['claude-code'], 'nic, co neběží, nesvítí');
    for (const [k, v] of Object.entries(casy)) {
      t.diagnostic(`${k}: ${v} ms`);
      assert.ok(v < LIMIT_MS, `${k}: ${v} ms`);
    }
  } finally {
    await o.konec();
  }
});

test('persona „víc licencí“: dva účty Claude (CLAUDE_CONFIG_DIR) a dva profily Codexu (CODEX_HOME)', async (t) => {
  if (!JE_LINUX) return t.skip('skutečné procesy agentů se ověřují na Linuxu (/proc)');
  const o = await prostredi();
  try {
    const dir = await tempDir('agenteeq-licence-');
    const bin = await skripty(dir);
    // Oba účty pracují ve stejné složce – nejhorší případ pro párování procesu s konverzací.
    const projekt = path.join(dir, 'Klient A');
    await fs.mkdir(projekt);
    const ucty = { prace: path.join(dir, 'claude prace'), osobni: path.join(dir, 'claude-osobni') };
    const profily = { firma: path.join(dir, 'codex firma'), doma: path.join(dir, 'codex-doma') };
    // Účet i profil existují (přihlášení je založilo), složky s přepisy vznikají až s první zprávou.
    for (const d of [...Object.values(ucty), ...Object.values(profily)]) await fs.mkdir(d, { recursive: true });
    const casy = {};

    const t0 = Date.now();
    const procesy = [
      ...Object.entries(ucty).map(([k, d]) => [`Claude ${k}`, o.spust(bin.claude, [], { cwd: projekt, env: { CLAUDE_CONFIG_DIR: d } })]),
      ...Object.entries(profily).map(([k, d]) => [`Codex ${k}`, o.spust(bin.codex, [], { cwd: projekt, env: { CODEX_HOME: d } })]),
    ];
    for (const [k, p] of procesy) casy[`${k} (proces)`] = (await o.objeviSe(t0, (s) => s.proces?.pid === p.pid)).za;
    // Kořeny z prostředí procesů se přidaly – každý účet a profil se sleduje.
    await waitFor(() => Object.values(ucty).every((d) => o.srv.app.connectors['claude-code'].koreny().includes(path.join(d, 'projects'))), LIMIT_MS);

    // První zadání ve všech čtyřech najednou.
    const ids = { prace: crypto.randomUUID(), osobni: crypto.randomUUID(), firma: crypto.randomUUID(), doma: crypto.randomUUID() };
    const t1 = Date.now();
    await Promise.all([
      writeJsonl(path.join(ucty.prace, 'projects', '-Klient-A', `${ids.prace}.jsonl`), claudePrepis(ids.prace, projekt)),
      writeJsonl(path.join(ucty.osobni, 'projects', '-Klient-A', `${ids.osobni}.jsonl`), claudePrepis(ids.osobni, projekt)),
      writeJsonl(codexSoubor(profily.firma, ids.firma), codexPrepis(ids.firma, projekt)),
      writeJsonl(codexSoubor(profily.doma, ids.doma), codexPrepis(ids.doma, projekt)),
    ]);
    for (const [k, id] of Object.entries(ids)) {
      const connector = k === 'prace' || k === 'osobni' ? 'claude-code' : 'codex';
      casy[`${k} (přepis)`] = (await o.objeviSe(t1, (s) => s.id === `${connector}:${id}`)).za;
    }
    // Procesy se spárují s konverzacemi: zůstanou čtyři agenti, žádný proces navíc.
    await waitFor(async () => !(await o.agenti()).some((s) => s.proces), 3000);
    const agenti = await o.agenti();
    jedenZaznam(agenti);
    assert.deepEqual(agenti.map((s) => s.id).sort(), [`claude-code:${ids.osobni}`, `claude-code:${ids.prace}`, `codex:${ids.doma}`, `codex:${ids.firma}`].sort());
    for (const s of agenti) {
      if (s.connector === 'claude-code') {
        assert.equal(s.app, 'Claude Code');
        assert.equal(s.status, 'waiting');
      } else {
        assert.equal(s.app, 'Codex CLI');
        assert.equal(s.status, 'working');
      }
      assert.equal(s.cwd, projekt);
    }
    for (const [k, v] of Object.entries(casy)) {
      t.diagnostic(`${k}: ${v} ms`);
      assert.ok(v < LIMIT_MS, `${k}: ${v} ms`);
    }
  } finally {
    await o.konec();
  }
});

test('persona „heavy user“: 12 souběžných agentů napříč Terminálem, desktopem a prohlížečem', async (t) => {
  if (!JE_LINUX) return t.skip('skutečné procesy agentů se ověřují na Linuxu (/proc)');
  let DatabaseSync = null;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* bez node:sqlite se Cursor vynechá */ }
  const o = await prostredi();
  try {
    const dir = await tempDir('agenteeq-heavy-');
    const bin = await skripty(dir);
    const slozka = async (n) => { const d = path.join(dir, n); await fs.mkdir(d, { recursive: true }); return d; };
    await fs.mkdir(path.join(o.home, '.claude', 'projects'), { recursive: true });
    await fs.mkdir(path.join(o.home, '.codex', 'sessions'), { recursive: true });
    const cursorDb = path.join(appSupportDir(o.home), 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    if (DatabaseSync) {
      await fs.mkdir(path.dirname(cursorDb), { recursive: true });
      const db = new DatabaseSync(cursorDb);
      db.exec('PRAGMA journal_mode=WAL');
      db.exec('CREATE TABLE composerHeaders (composerId TEXT, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER, isArchived INTEGER, isSubagent INTEGER, value TEXT)');
      db.exec('CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)');
      db.close();
    }
    const { token } = await pairExtension(o.srv.url);
    const slozky = { c1: await slozka('web'), c2: await slozka('api'), c3: await slozka('mobil'), c4: await slozka('infra'), x: await slozka('codex-npm'), g: await slozka('gemini') };
    const ids = { c1: crypto.randomUUID(), c2: crypto.randomUUID(), c3: crypto.randomUUID(), codexApp: crypto.randomUUID() };

    // Všechno začne naráz – jako ráno, kdy uživatel pustí práci ve všech oknech.
    const t0 = Date.now();
    const p = {
      c1: o.spust(bin.claude, [], { cwd: slozky.c1 }),
      c2: o.spust(bin.claude, ['--resume', 'x'], { cwd: slozky.c2 }),
      c3: o.spust(bin.claude, [], { cwd: slozky.c3 }),
      c4: o.spust(bin.claude, [], { cwd: slozky.c4 }),
      x: o.spust(process.execPath, [bin.codexJs, 'exec', 'oprav testy'], { cwd: slozky.x }),
      g: o.spust(process.execPath, [bin.geminiJs], { cwd: slozky.g }),
    };
    o.desktop.push(
      '9300001 1 10:00 0.5 200000 /Applications/Claude.app/Contents/MacOS/Claude',
      '9300002 1 10:00 0.5 200000 /Applications/Codex.app/Contents/MacOS/Codex',
      '9300003 9300002 10:00 0.5 200000 /Applications/Codex.app/Contents/Resources/codex app-server',
      '9300004 1 10:00 0.5 200000 /Applications/Cursor.app/Contents/MacOS/Cursor',
    );
    await Promise.all([
      writeJsonl(path.join(o.home, '.claude', 'projects', '-web', `${ids.c1}.jsonl`), claudePrepis(ids.c1, slozky.c1)),
      writeJsonl(path.join(o.home, '.claude', 'projects', '-api', `${ids.c2}.jsonl`), claudePrepis(ids.c2, slozky.c2)),
      writeJsonl(path.join(o.home, '.claude', 'projects', '-mobil', `${ids.c3}.jsonl`), claudePrepis(ids.c3, slozky.c3)),
      writeJsonl(codexSoubor(path.join(o.home, '.codex'), ids.codexApp), codexPrepis(ids.codexApp, path.join(dir, 'desktop-projekt'), 'Codex Desktop')),
      ...['chatgpt', 'claude', 'gemini', 'perplexity'].map((site) => api(o.srv.url).send('POST', '/api/ingest/web', {
        site, conversationId: `${site}-1`, url: `https://example.invalid/${site}`.replace('example.invalid', { chatgpt: 'chatgpt.com', claude: 'claude.ai', gemini: 'gemini.google.com', perplexity: 'www.perplexity.ai' }[site]),
        generating: site !== 'perplexity', counts: { user: 1, assistant: site === 'perplexity' ? 1 : 0 },
      }, { 'X-Agenteeq-Token': token, Origin: EXTENSION_ORIGIN })),
    ]);
    if (DatabaseSync) {
      const db = new DatabaseSync(cursorDb);
      const now = Date.now();
      db.prepare('INSERT INTO composerHeaders VALUES (?, ?, ?, ?, 0, 0, ?)').run('cur-heavy', 'ws', now, now, '{}');
      db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)').run('composerData:cur-heavy', JSON.stringify({ name: 'Refaktor', fullConversationHeadersOnly: [{ bubbleId: 'b1' }], generatingBubbleIds: ['b1'], status: 'generating', createdAt: now, lastUpdatedAt: now }));
      db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)').run('bubbleId:cur-heavy:b1', JSON.stringify({ type: 1, text: 'Refaktor', createdAt: now }));
      db.close();
    }

    // Co má být vidět: [podmínka, název aplikace, stav].
    const ocekavani = {
      'Claude Code web': [(s) => s.id === `claude-code:${ids.c1}`, 'Claude Code', 'waiting'],
      'Claude Code api': [(s) => s.id === `claude-code:${ids.c2}`, 'Claude Code', 'waiting'],
      'Claude Code mobil': [(s) => s.id === `claude-code:${ids.c3}`, 'Claude Code', 'waiting'],
      'Claude Code bez přepisu': [(s) => s.proces?.pid === p.c4.pid, 'Claude Code', 'observed'],
      'Codex z npm (obal + dítě)': [(s) => s.proces?.pid === p.x.pid, 'Codex', 'observed'],
      'Gemini CLI (znovuspuštění)': [(s) => s.proces?.pid === p.g.pid, 'Gemini CLI', 'observed'],
      'Codex app': [(s) => s.id === `codex:${ids.codexApp}`, 'Codex · aplikace', 'working'],
      'ChatGPT web': [(s) => s.id === 'web:chatgpt:chatgpt-1', 'ChatGPT', 'working'],
      'Claude.ai web': [(s) => s.id === 'web:claude:claude-1', 'Claude.ai', 'working'],
      'Gemini web': [(s) => s.id === 'web:gemini:gemini-1', 'Gemini', 'working'],
      'Perplexity web': [(s) => s.id === 'web:perplexity:perplexity-1', 'Perplexity', 'waiting'],
      ...(DatabaseSync ? { 'Cursor agent': [(s) => s.id === 'cursor:cur-heavy', 'Cursor', 'working'] } : {}),
    };
    const casy = {};
    for (const [k, [podminka]] of Object.entries(ocekavani)) casy[k] = (await o.objeviSe(t0, podminka)).za;
    // Procesy se spárovanými přepisy už nejsou samostatné záznamy.
    await waitFor(async () => (await o.agenti()).filter((s) => s.proces).length === 3, 3000);
    await new Promise((r) => setTimeout(r, 1600)); // ještě jeden průchod výpisu procesů – nic nesmí přibýt
    const agenti = await o.agenti();
    jedenZaznam(agenti);
    assert.equal(agenti.length, Object.keys(ocekavani).length, agenti.map((s) => `${s.id} ${s.app}`).join('\n'));
    for (const [k, [podminka, app, status]] of Object.entries(ocekavani)) {
      const s = agenti.filter(podminka);
      assert.equal(s.length, 1, `${k}: právě jednou`);
      assert.equal(s[0].app, app, `${k}: název`);
      assert.equal(s[0].status, status, `${k}: stav`);
    }
    const runtimes = (await api(o.srv.url).get('/api/state')).body.runtimes;
    for (const id of ['claude-desktop', 'codex-app', 'cursor', 'claude-code', 'codex', 'gemini-cli']) {
      assert.equal(runtimes.find((r) => r.id === id)?.running, true, `${id} běží`);
    }
    assert.equal(runtimes.find((r) => r.id === 'chatgpt').running, false, 'aplikace ChatGPT neběží – vnitřní app-server Codexu se za ni nevydává');
    for (const [k, v] of Object.entries(casy)) {
      t.diagnostic(`${k}: ${v} ms`);
      assert.ok(v < LIMIT_MS, `${k}: ${v} ms`);
    }
  } finally {
    await o.konec();
  }
});
