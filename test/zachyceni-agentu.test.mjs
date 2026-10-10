import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { agentniProcesy, parsePs, rozpoznejNastroj } from '../src/connectors/processes.js';
import { radkyProcesu } from '../src/platform.js';
import { startTestServer, api, tempDir, waitFor, writeJsonl, openStream, jenProcesy, pairExtension, EXTENSION_ORIGIN } from './helpers.mjs';

// „Vždy, absolutně vždy musí zachytit, pokud je na počítači spuštěný agent – ihned, bez obnovení
// stránky, a vždy ho správně identifikovat.“ Tyhle testy hlídají jednotlivé cesty, kudy se agent do
// přehledu dostává, a měří čas od spuštění do události v živém streamu (SSE), kterou rozhraní vykreslí.
// Cíl je 2 s (AGENTS.md); naměřené časy test vypíše (`t.diagnostic`).

const JE_LINUX = process.platform === 'linux';
const radek = (sessionId, cwd, at = new Date().toISOString(), text = 'Oprav testy') => ({
  type: 'user', sessionId, cwd, timestamp: at, message: { role: 'user', content: text },
});

// ── Jeden běh = jeden záznam ────────────────────────────────────────────────

test('npm Codex: obal v Node a nativní program pod ním jsou jeden agent (macOS, Linux i Windows)', () => {
  const vystup = [
    // macOS/Linux: npm odkaz `bin/codex` → `node …/codex` a jeho dítě z vendor/ (bin/codex.js, @openai/codex 0.160.0).
    '500 1 01:00 0.1 100 node /opt/homebrew/bin/codex',
    '501 500 00:59 1.0 100 /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex',
    // Windows: npm volá skript přímo, nativní program je codex.exe.
    '700 4 01:00 0.1 100 C:\\Program Files\\nodejs\\node.exe C:\\Users\\jana\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js exec "oprav testy"',
    '701 700 01:00 0.1 100 C:\\Users\\jana\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe exec "oprav testy"',
  ].join('\n');
  assert.deepEqual(agentniProcesy(vystup).map((p) => [p.pid, p.runtime]), [[500, 'codex'], [700, 'codex']]);
  assert.equal(parsePs(vystup).find((r) => r.id === 'codex').processes, 4, 'zátěž se počítá ze všech procesů');
  assert.equal(rozpoznejNastroj('node /usr/lib/node_modules/@openai/codex/bin/codex.js')?.id, 'codex', 'skript spuštěný přímou cestou');
  // Podpříkaz bez konverzace se pozná i za cestou ke skriptu.
  assert.deepEqual(agentniProcesy('9 1 00:05 0 1 node /x/node_modules/@openai/codex/bin/codex.js login'), []);
});

test('Gemini CLI a Qwen Code z npm: znovuspuštění s větší pamětí je tentýž běh', () => {
  const vystup = [
    // gemini-cli 0.62.0: bundle/gemini.js se spustí znovu jako dítě s --max-old-space-size (GEMINI_CLI_NO_RELAUNCH).
    '600 1 01:00 0.1 100 node /usr/local/bin/gemini',
    '601 600 00:59 0.1 100 /usr/local/bin/node --max-old-space-size=8192 /usr/local/bin/gemini',
    '610 1 01:00 0.1 100 C:\\Program Files\\nodejs\\node.exe C:\\npm\\node_modules\\@google\\gemini-cli\\bundle\\gemini.js',
    '611 610 01:00 0.1 100 C:\\Program Files\\nodejs\\node.exe --max-old-space-size=8192 C:\\npm\\node_modules\\@google\\gemini-cli\\bundle\\gemini.js',
    // qwen-code 0.25.0 na Windows: cli-entry.js spouští cli.js s --expose-gc.
    '900 1 01:00 0.1 100 C:\\Program Files\\nodejs\\node.exe C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli-entry.js',
    '901 900 01:00 0.1 100 C:\\Program Files\\nodejs\\node.exe --expose-gc C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli.js',
  ].join('\n');
  assert.deepEqual(agentniProcesy(vystup).map((p) => [p.pid, p.runtime]), [[600, 'gemini-cli'], [610, 'gemini-cli'], [900, 'qwen-code']]);
});

test('dva agenti téhož nástroje zůstávají dva: souběžné běhy i agent spuštěný jiným agentem přes shell', () => {
  const vystup = [
    '100 1 10:00 0.1 100 /Users/e/.local/bin/claude',
    '101 1 05:00 0.1 100 /Users/e/.local/bin/claude --resume abc',
    // Claude Code spustil v Bashi další `claude -p`: rodič je shell, ne Claude Code – je to další agent.
    '102 100 01:00 0.1 100 /bin/zsh -c claude -p "shrň změny"',
    '103 102 01:00 0.1 100 /Users/e/.local/bin/claude -p shrň změny',
  ].join('\n');
  assert.deepEqual(agentniProcesy(vystup).map((p) => p.pid), [100, 101, 103]);
});

test('výpis procesů: nový tvar s PID rodiče i starší bez něj', () => {
  assert.deepEqual(radkyProcesu('  42     7 1-02:03:04 1.5 2048 /usr/bin/claude --x'), [{ pid: 42, ppid: 7, uptimeSec: 93784, cpu: 1.5, rssKB: 2048, args: '/usr/bin/claude --x' }]);
  assert.deepEqual(radkyProcesu('42 00:05 0.0 100 claude'), [{ pid: 42, ppid: 0, uptimeSec: 5, cpu: 0, rssKB: 100, args: 'claude' }]);
  // Číslo v příkazu se za PID rodiče nepovažuje: doba běhu má vždy dvojtečku.
  assert.equal(radkyProcesu('42 00:05 0.0 100 sleep 10')[0].ppid, 0);
});

test('aplikace Codex pro Mac a Windows se pozná a její vnitřní app-server není Codex CLI', () => {
  // Jména balíčků podle zdroje `codex app` (openai/codex, codex-rs/cli/src/desktop_app): Codex.app,
  // bundle com.openai.codex; Windows balíček OpenAI.Codex_… z Microsoft Store.
  assert.equal(rozpoznejNastroj('/Applications/Codex.app/Contents/MacOS/Codex')?.id, 'codex-app');
  assert.equal(rozpoznejNastroj('/Users/eva/Applications/Codex.app/Contents/MacOS/Codex --type=renderer')?.id, 'codex-app');
  assert.equal(rozpoznejNastroj('/Applications/Codex.app/Contents/Resources/codex app-server --analytics-default-enabled')?.id, 'codex-app');
  assert.equal(rozpoznejNastroj('C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1.0.0_x64__2p2nqsd0c76g0\\app\\Codex.exe')?.id, 'codex-app');
  assert.equal(rozpoznejNastroj('C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1.0.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe app-server')?.id, 'codex-app');
  // Ostatní zůstává, jak bylo: Codex CLI, ChatGPT a jeho vnitřní Codex.
  assert.equal(rozpoznejNastroj('/opt/homebrew/bin/codex')?.id, 'codex');
  assert.equal(rozpoznejNastroj('/Applications/ChatGPT.app/Contents/MacOS/ChatGPT')?.id, 'chatgpt');
  assert.equal(rozpoznejNastroj('/Applications/ChatGPT.app/Contents/Resources/codex app-server'), null);
  // Složka, která se jen jmenuje podobně, aplikace není.
  assert.equal(rozpoznejNastroj('/Users/eva/Codex.application/run.sh'), null);
  assert.deepEqual(agentniProcesy([
    '800 1 01:00 0.1 100 /Applications/Codex.app/Contents/MacOS/Codex',
    '801 800 01:00 0.1 100 /Applications/Codex.app/Contents/Resources/codex app-server',
  ].join('\n')), [], 'aplikace není „detekovaný proces bez přepisu“ – její vlákna čte konektor Codexu');
  const r = parsePs('800 1 01:00 0.1 100 /Applications/Codex.app/Contents/MacOS/Codex').find((x) => x.id === 'codex-app');
  assert.equal(r.running, true);
  assert.equal(r.name, 'Codex app');
  assert.equal(r.overeno, false, 'bez ověření na skutečném stroji je to Beta');
  assert.deepEqual(r.konektory, ['codex']);
});

// ── Webová konverzace: z nové konverzace na konverzaci s ID ─────────────────

test('nová konverzace v prohlížeči: po přidělení ID zůstane jeden záznam, ne duch', async () => {
  const srv = await startTestServer();
  try {
    const { token } = await pairExtension(srv.url);
    const hlavicky = { 'X-Agenteeq-Token': token, Origin: EXTENSION_ORIGIN };
    const a = api(srv.url);
    const posli = (telo) => a.send('POST', '/api/ingest/web', { site: 'chatgpt', generating: true, counts: { user: 1, assistant: 0 }, ...telo }, hlavicky);
    const stream = await openStream(srv.url);
    try {
      assert.equal((await posli({ conversationId: 'tab-k3j9x2', url: 'https://chatgpt.com/' })).status, 200);
      const nova = srv.app.store.get('web:chatgpt:tab-k3j9x2');
      assert.ok(nova, 'nová konverzace je vidět hned, ještě bez ID');
      const zacatek = nova.startedAt;
      assert.equal((await posli({ conversationId: '68e2-aa11', url: 'https://chatgpt.com/c/68e2-aa11', nahrazuje: 'tab-k3j9x2' })).status, 200);
      const ids = srv.app.store.list().filter((s) => s.connector === 'web').map((s) => s.id);
      assert.deepEqual(ids, ['web:chatgpt:68e2-aa11'], 'jeden záznam');
      const s = srv.app.store.summary('web:chatgpt:68e2-aa11');
      assert.equal(s.status, 'working');
      assert.equal(s.startedAt, zacatek, 'začátek konverzace se zachoval');
      await waitFor(() => stream.events.some((e) => e.event === 'session:remove' && e.data.id === 'web:chatgpt:tab-k3j9x2'), 2000);

      // Zástupné ID se dá nahradit jen zástupným ID – skutečnou konverzaci tudy smazat nejde.
      await posli({ conversationId: 'jina-1', url: 'https://chatgpt.com/c/jina-1', nahrazuje: '68e2-aa11' });
      assert.ok(srv.app.store.get('web:chatgpt:68e2-aa11'), 'skutečná konverzace zůstala');
      // Jiná služba se stejným zástupným ID se nedotkne.
      await a.send('POST', '/api/ingest/web', { site: 'claude', conversationId: 'tab-k3j9x2', url: 'https://claude.ai/new', counts: { user: 1, assistant: 0 } }, hlavicky);
      await posli({ conversationId: 'dalsi-2', url: 'https://chatgpt.com/c/dalsi-2', nahrazuje: 'tab-k3j9x2' });
      assert.ok(srv.app.store.get('web:claude:tab-k3j9x2'), 'Claude.ai má vlastní konverzaci');
    } finally {
      stream.close();
    }
  } finally {
    await srv.close();
  }
});

// ── Selhání výpisu procesů ≠ nic neběží ─────────────────────────────────────

test('selhání výpisu procesů: stav zdroje hned hlásí chybu, běžící agenti nezmizí', async (t) => {
  // Windows runner can schedule subprocess polling and SSE more slowly under concurrent test load.
  const limit = process.platform === 'win32' ? 6000 : 3000;
  const vypis = { ok: true, radky: [
    '9100001 1 05:00 0.1 100 /Applications/Cursor.app/Contents/MacOS/Cursor',
    '9100002 1 05:00 0.1 100 /usr/local/bin/claude',
  ] };
  const srv = await startTestServer({ AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '200' }, {
    vypisProcesu: async () => (vypis.ok ? { ok: true, stdout: vypis.radky.join('\n') } : { ok: false, stdout: '', stderr: 'ps: timeout' }),
  });
  const stream = await openStream(srv.url);
  try {
    const a = api(srv.url);
    const stav = async () => (await a.get('/api/state')).body;
    await waitFor(async () => (await stav()).sessions.some((s) => s.id === 'claude-code:proces-9100002'), limit);
    assert.equal((await stav()).connectors.find((c) => c.id === 'processes').state, 'connected');

    const t0 = Date.now();
    vypis.ok = false;
    const udalost = await waitFor(() => stream.events.find((e) => e.event === 'connectors' && e.at > t0 && e.data.find((c) => c.id === 'processes')?.state === 'error'), limit);
    const procesy = udalost.data.find((c) => c.id === 'processes');
    assert.match(procesy.detail, /nepodařilo zjistit/);
    // Ani lokální agenti (jinak průchod po 10 s) nehlásí „nic neběží“ – přepočtou se hned.
    await waitFor(() => stream.events.find((e) => e.event === 'connectors' && e.at > t0 && e.data.find((c) => c.id === 'local-agents')?.state === 'error'), limit);
    // Poslední známý stav zůstává – selhání není „nic neběží“.
    const s = await stav();
    assert.equal(s.runtimes.find((r) => r.id === 'cursor').running, true);
    assert.ok(s.sessions.some((x) => x.id === 'claude-code:proces-9100002'), 'detekovaný agent při nejistotě nezmizí');
    t.diagnostic(`selhání výpisu viditelné za ${udalost.at - t0} ms`);

    const t1 = Date.now();
    vypis.ok = true;
    vypis.radky = [vypis.radky[0]];
    await waitFor(() => stream.events.find((e) => e.event === 'connectors' && e.at > t1 && e.data.find((c) => c.id === 'processes')?.state === 'connected'), limit);
    await waitFor(async () => !(await stav()).sessions.some((x) => x.id === 'claude-code:proces-9100002'), limit);
  } finally {
    stream.close();
    await srv.close();
  }
});

test('výpis procesů selže hned od startu: stav je chyba, ne „nic neběží“ ani „vypnuto“', async () => {
  const srv = await startTestServer({ AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '200' }, {
    vypisProcesu: async () => { throw new Error('spawn ps ENOENT'); },
  });
  try {
    const s = (await api(srv.url).get('/api/state')).body;
    const procesy = s.connectors.find((c) => c.id === 'processes');
    assert.equal(procesy.state, 'error');
    assert.match(procesy.detail, /nepodařilo získat/);
    assert.equal(s.connectors.find((c) => c.id === 'local-agents').state, 'error');
  } finally {
    await srv.close();
  }
});

test('Přehled: selhání výpisu procesů má přednost před „vypnuto“ i „nic neběží“', async () => {
  const kod = await fs.readFile(new URL('../public/js/views/overview.js', import.meta.url), 'utf8');
  const prazdno = kod.slice(kod.indexOf('<div class="empty-inline">${'));
  assert.ok(prazdno.indexOf('procesyNevim') < prazdno.indexOf('Sledování procesů je vypnuté'), 'chyba se vyhodnotí dřív než „vypnuto“');
  assert.match(kod, /procesyNevim \? `<p class="rt-warn" role="status">/, 'u známých aplikací je vidět, že stav je jen poslední známý');
  assert.match(kod, /procesyNevim \? ` · \$\{tr\('nepodařilo se zjistit, co běží'\)\}`/, 'souhrn nahoře neříká „0 aplikací běží“');
});

// ── Čas od spuštění do přehledu, po cestách ─────────────────────────────────

// Skutečné procesy (Linux přes /proc, bez atrapy): Claude Code v Terminálu, Codex a Gemini CLI z npm
// (obal + dceřiný proces), agent spuštěný z Agenteeq. Výchozí interval výpisu procesů (1,5 s), ne
// zrychlený testovací – měří se to, co uvidí uživatel.
test('čas do přehledu: CLI v Terminálu, npm Codex a Gemini, agent spuštěný z Agenteeq', async (t) => {
  if (!JE_LINUX) return t.skip('skutečné procesy se ověřují na Linuxu (/proc)');
  const dir = await tempDir('agenteeq-cas-');
  const bin = path.join(dir, 'bin');
  await fs.mkdir(bin, { recursive: true });
  const skript = async (soubor, obsah) => {
    await fs.mkdir(path.dirname(soubor), { recursive: true });
    await fs.writeFile(soubor, obsah, { mode: 0o755 });
    return soubor;
  };
  const claude = await skript(path.join(bin, 'claude'), '#!/bin/sh\nsleep 30\n');
  const codexKoren = path.join(dir, 'lib', 'node_modules', '@openai', 'codex');
  const codexNativni = await skript(path.join(codexKoren, 'vendor', 'x86_64-unknown-linux-musl', 'bin', 'codex'), '#!/bin/sh\nsleep 30\n');
  // Obal jako v @openai/codex 0.160.0 bin/codex.js: spustí nativní program se stejnými argumenty a čeká.
  const codexJs = await skript(path.join(codexKoren, 'bin', 'codex.js'), `const { spawn } = require('node:child_process');
const c = spawn(${JSON.stringify(codexNativni)}, process.argv.slice(2), { stdio: 'ignore' });
const konec = () => { c.kill(); process.exit(0); };
process.on('SIGTERM', konec);
c.on('exit', () => process.exit(0));
`);
  // Jako gemini-cli 0.62.0 bundle/gemini.js: bez GEMINI_CLI_NO_RELAUNCH se spustí znovu s větší pamětí.
  const geminiJs = await skript(path.join(dir, 'lib', 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js'), `const { spawn } = require('node:child_process');
if (process.env.GEMINI_CLI_NO_RELAUNCH) { setInterval(() => {}, 1000); setTimeout(() => process.exit(0), 30000); }
else {
  const c = spawn(process.execPath, ['--max-old-space-size=64', __filename, ...process.argv.slice(2)], { stdio: 'ignore', env: { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' } });
  process.on('SIGTERM', () => { c.kill(); process.exit(0); });
  c.on('exit', () => process.exit(0));
}
`);
  const pidy = new Set();
  const srv = await startTestServer({ AGENTEEQ_PROCESSES: '1' }, { vypisProcesu: jenProcesy(pidy) });
  const stream = await openStream(srv.url);
  const deti = [];
  const casy = {};
  try {
    const sezeniProcesu = (pid) => stream.events.find((e) => e.event === 'session' && e.data.proces?.pid === pid);
    const spust = async (nazev, prikaz, args, ocekavane) => {
      const slozka = path.join(dir, nazev);
      await fs.mkdir(slozka, { recursive: true });
      const t0 = Date.now();
      const p = spawn(prikaz, args, { cwd: slozka, stdio: 'ignore' });
      deti.push(p);
      pidy.add(p.pid);
      const e = await waitFor(() => sezeniProcesu(p.pid), 2000);
      casy[nazev] = e.at - t0;
      assert.equal(e.data.connector, ocekavane.connector, nazev);
      assert.equal(e.data.app, ocekavane.app, nazev);
      assert.equal(e.data.status, 'observed', nazev);
      assert.equal(e.data.cwd, slozka, nazev);
      return p;
    };
    await spust('claude-terminal', claude, [], { connector: 'claude-code', app: 'Claude Code' });
    const codex = await spust('codex-npm', process.execPath, [codexJs, 'exec', 'oprav testy'], { connector: 'codex', app: 'Codex' });
    const gemini = await spust('gemini-npm', process.execPath, [geminiJs], { connector: 'gemini-cli', app: 'Gemini CLI' });

    // Dceřiné procesy obou npm obalů už běží (výpis je vidí), a přesto je každý běh jeden záznam.
    await waitFor(async () => {
      const r = await jenProcesy(pidy)();
      return radkyProcesu(r.stdout).filter((x) => x.ppid === codex.pid || x.ppid === gemini.pid).length >= 2;
    }, 3000);
    await new Promise((r) => setTimeout(r, 1700)); // aspoň jeden celý průchod výpisu procesů s dětmi
    const procesove = srv.app.store.list().filter((s) => s.proces);
    assert.equal(procesove.filter((s) => s.connector === 'codex').length, 1, 'npm Codex = jeden agent');
    assert.equal(procesove.filter((s) => s.connector === 'gemini-cli').length, 1, 'Gemini CLI se znovuspuštěním = jeden agent');
    assert.equal(procesove.length, 3);

    // Agent spuštěný z Agenteeq na pozadí: běh je v rozhraní hned, proces do 2 s.
    const slozka = path.join(dir, 'z-agenteeq');
    await fs.mkdir(slozka);
    const t0 = Date.now();
    const beh = srv.app.runs.start({ agent: 'claude', label: 'Claude Code', argv: [claude, '-p', 'oprav testy'], cwd: slozka, prompt: 'oprav testy' });
    pidy.add(beh.pid);
    const udalostBehu = await waitFor(() => stream.events.find((e) => e.event === 'runs' && e.data.some((r) => r.id === beh.id && r.status === 'running')), 2000);
    casy['z-agenteeq (záznam běhu)'] = udalostBehu.at - t0;
    const e = await waitFor(() => sezeniProcesu(beh.pid), 2000);
    casy['z-agenteeq (agent v přehledu)'] = e.at - t0;
    assert.equal(e.data.app, 'Claude Code');
    srv.app.runs.stop?.(beh.id);

    for (const [k, v] of Object.entries(casy)) {
      t.diagnostic(`${k}: ${v} ms`);
      assert.ok(v < 2000, `${k}: ${v} ms`);
    }
  } finally {
    stream.close();
    for (const p of deti) p.kill();
    await srv.close();
  }
});

// Souborové a rozšířením hlášené cesty: přepis Claude Code a Codexu (CLI i aplikace), Cursor (SQLite),
// konverzace v prohlížeči a desktopová aplikace z výpisu procesů.
test('čas do přehledu: přepisy, Cursor, prohlížeč a desktopová aplikace', async (t) => {
  let DatabaseSync = null;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* starší Node: Cursor se přeskočí */ }
  const home = await tempDir('agenteeq-cas-src-');
  const { appSupportDir } = await import('../src/platform.js');
  const cursorDb = path.join(appSupportDir(home), 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  if (DatabaseSync) {
    await fs.mkdir(path.dirname(cursorDb), { recursive: true });
    const db = new DatabaseSync(cursorDb);
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('CREATE TABLE composerHeaders (composerId TEXT, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER, isArchived INTEGER, isSubagent INTEGER, value TEXT)');
    db.exec('CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)');
    db.close();
  }
  await fs.mkdir(path.join(home, '.claude', 'projects'), { recursive: true });
  await fs.mkdir(path.join(home, '.codex', 'sessions'), { recursive: true });
  const desktop = { radky: [] };
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_PROCESSES: '1' }, {
    vypisProcesu: async () => ({ ok: true, stdout: desktop.radky.join('\n') }),
  });
  const stream = await openStream(srv.url);
  const casy = {};
  const { INTERVAL_PROCESU_MS } = await import('../src/platform.js');
  // Výpis procesů běží v intervalu platformy (Mac a Linux 1,5 s, Windows 5 s – tasklist je drahý),
  // desktopová aplikace se proto ukáže do jednoho intervalu. Ostatní cesty mají limit 2 s všude.
  const limit = (nazev) => (nazev.includes('výpis procesů') ? Math.max(2000, INTERVAL_PROCESU_MS + 500) : 2000);
  const zmer = async (nazev, akce, najdi) => {
    const t0 = Date.now();
    await akce();
    const e = await waitFor(() => stream.events.find((x) => x.at >= t0 && najdi(x)), limit(nazev));
    casy[nazev] = e.at - t0;
    return e;
  };
  try {
    const idC = crypto.randomUUID();
    const e1 = await zmer('Claude Code (přepis)', () => writeJsonl(path.join(home, '.claude', 'projects', '-tmp-w', `${idC}.jsonl`), [radek(idC, '/tmp/w')]),
      (x) => x.event === 'session' && x.data.id === `claude-code:${idC}`);
    assert.equal(e1.data.app, 'Claude Code');

    const idX = crypto.randomUUID();
    const ted = new Date().toISOString();
    const e2 = await zmer('Codex aplikace (přepis)', () => writeJsonl(path.join(home, '.codex', 'sessions', '2026', '10', '05', `rollout-2026-10-05T10-00-00-${idX}.jsonl`), [
      { timestamp: ted, type: 'session_meta', payload: { id: idX, cwd: '/tmp/c', originator: 'Codex Desktop', timestamp: ted } },
      { timestamp: ted, type: 'event_msg', payload: { type: 'task_started' } },
      { timestamp: ted, type: 'event_msg', payload: { type: 'user_message', message: 'Oprav testy' } },
    ]), (x) => x.event === 'session' && x.data.id === `codex:${idX}`);
    assert.equal(e2.data.app, 'Codex · aplikace');

    if (DatabaseSync) {
      const e3 = await zmer('Cursor (SQLite)', () => {
        const db = new DatabaseSync(cursorDb);
        const now = Date.now();
        db.prepare('INSERT INTO composerHeaders VALUES (?, ?, ?, ?, 0, 0, ?)').run('cur-cas', 'ws', now, now, '{}');
        db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)').run('composerData:cur-cas', JSON.stringify({ name: 'Oprav prihlaseni', fullConversationHeadersOnly: [{ bubbleId: 'b1' }], generatingBubbleIds: ['b1'], status: 'generating', createdAt: now, lastUpdatedAt: now }));
        db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)').run('bubbleId:cur-cas:b1', JSON.stringify({ type: 1, text: 'Oprav prihlaseni', createdAt: now }));
        db.close();
      }, (x) => x.event === 'session' && x.data.id === 'cursor:cur-cas');
      assert.equal(e3.data.app, 'Cursor');
      assert.equal(e3.data.status, 'working');
    } else {
      t.diagnostic('Cursor přeskočen: node:sqlite chybí');
    }

    const { token } = await pairExtension(srv.url);
    const e4 = await zmer('prohlížeč přes rozšíření', () => api(srv.url).send('POST', '/api/ingest/web', { site: 'gemini', conversationId: 'g-cas', url: 'https://gemini.google.com/app/g-cas', generating: true, counts: { user: 1, assistant: 0 } }, { 'X-Agenteeq-Token': token, Origin: EXTENSION_ORIGIN }),
      (x) => x.event === 'session' && x.data.id === 'web:gemini:g-cas');
    assert.equal(e4.data.status, 'working');

    const e5 = await zmer('desktopová aplikace (výpis procesů)', () => { desktop.radky.push('9200001 1 00:01 0.1 100 /Applications/Codex.app/Contents/MacOS/Codex'); },
      (x) => x.event === 'runtimes' && x.data.find((r) => r.id === 'codex-app')?.running);
    assert.equal(e5.data.find((r) => r.id === 'codex-app').name, 'Codex app');

    for (const [k, v] of Object.entries(casy)) {
      t.diagnostic(`${k}: ${v} ms`);
      assert.ok(v < limit(k), `${k}: ${v} ms`);
    }
    // Cursor má sledování souboru: nový agent se ukáže v řádu stovek ms, ne až po 3 s jako dřív.
    if (DatabaseSync) assert.ok(casy['Cursor (SQLite)'] < 1500, `Cursor ${casy['Cursor (SQLite)']} ms`);
  } finally {
    stream.close();
    await srv.close();
  }
});
