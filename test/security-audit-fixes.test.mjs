import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, api, tempDir } from './helpers.mjs';
import { planOpen, executeOpen, bezpecnaSlozka } from '../src/openers.js';
import { installHooks } from '../src/hooks-installer.js';

// Nálezy nezávislého bezpečnostního auditu (20. 9. 2026). Každý test drží jednu opravu; tam, kde šlo
// útok předvést živě, test předvádí právě ten útok.

test('ID konverzace začínající pomlčkou se nikdy nedostane do příkazu jako přepínač', () => {
  const apps = { cli: { claude: true, codex: true, copilot: true }, apps: {} };
  for (const [connector, id] of [['claude-code', '--dangerously-skip-permissions'], ['codex', '-x'], ['copilot-cli', '--yolo']]) {
    const s = { id: `${connector}:${id}`, connector, cwd: '/tmp', source: 'local' };
    assert.equal(planOpen(s, 'terminal', apps), null, `${connector}: ${id} nesmí projít do příkazu`);
  }
  const dobre = { id: 'claude-code:0f3c2a1e-1111-4222-8333-444455556666', connector: 'claude-code', cwd: '/tmp', source: 'local' };
  assert.match(planOpen(dobre, 'terminal', apps).command, /claude --resume 0f3c2a1e-1111-4222-8333-444455556666$/);
});

test('hook s ID začínajícím pomlčkou se odmítne už při příjmu', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  const token = JSON.parse(await fs.readFile(path.join(srv.dataHome, 'data.json'), 'utf8')).ingestToken;
  for (const sid of ['--dangerously-skip-permissions', '-abcdefgh']) {
    const r = await a.send('POST', '/api/hooks/claude-code', { session_id: sid, hook_event_name: 'SessionStart' }, { 'X-Agenteeq-Token': token });
    assert.equal(r.status, 400, `${sid} musí skončit chybou`);
  }
  const ok = await a.send('POST', '/api/hooks/claude-code', { session_id: 'abcd1234-ef56-7890-abcd-ef1234567890', hook_event_name: 'SessionStart' }, { 'X-Agenteeq-Token': token });
  assert.equal(ok.status, 200);
});

test('„Otevřít složku“ neotevře balíček ani soubor, jen obyčejnou složku', async () => {
  const kořen = await tempDir('agenteeq-open-');
  const obycejna = path.join(kořen, 'projekt');
  const balicek = path.join(kořen, 'podvrh.app');
  const soubor = path.join(kořen, 'poznamky.txt');
  await fs.mkdir(obycejna);
  await fs.mkdir(path.join(balicek, 'Contents', 'MacOS'), { recursive: true });
  await fs.writeFile(soubor, 'x');
  const odkaz = path.join(kořen, 'odkaz');
  await fs.symlink(balicek, odkaz);

  assert.equal(bezpecnaSlozka(obycejna), true);
  assert.equal(bezpecnaSlozka(balicek), false, 'složka s příponou .app je program');
  assert.equal(bezpecnaSlozka(odkaz), false, 'odkaz na balíček se posuzuje podle cíle');
  assert.equal(bezpecnaSlozka(soubor), false, 'soubor není složka');
  assert.equal(bezpecnaSlozka(path.join(kořen, 'neexistuje')), false);

  // Plán pro složku nese příznak a vykonání odmítne balíček dřív, než se zavolá `open`.
  const plan = planOpen({ id: 'codex:x', connector: 'codex', cwd: balicek, source: 'local' }, 'folder', {});
  assert.equal(plan.folderOnly, true);
  const r = await executeOpen(plan);
  assert.equal(r.ok, false);
  assert.match(r.error, /není obyčejná složka/);
});

test('záloha nastavení Claude Code má práva 0600 a zúží i ty dřívější', async () => {
  const dir = await tempDir('agenteeq-hooks-');
  const file = path.join(dir, 'settings.json');
  await fs.writeFile(file, JSON.stringify({ env: { TAJNE: 'x' } }), { mode: 0o600 });
  const stara = `${file}.agenteeq-backup-1`;
  await fs.writeFile(stara, '{}', { mode: 0o644 });

  const { backup } = await installHooks(file, { port: 4620, token: 'a'.repeat(40), now: 2 });
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(backup)).mode & 0o777, 0o600, 'nová záloha je jen pro vlastníka');
    assert.equal((await fs.stat(stara)).mode & 0o777, 0o600, 'dřívější záloha se zúžila, nesmazala');
  }
  assert.equal(await fs.readFile(backup, 'utf8'), JSON.stringify({ env: { TAJNE: 'x' } }), 'záloha zachová původní obsah');
  assert.equal(await fs.readFile(stara, 'utf8'), '{}', 'obsah dřívější zálohy zůstal beze změny');
});

test('párovací kód rozšíření vytvoří jen Mac, ne požadavek přes proxy nebo z telefonu', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  const lokalne = await a.send('POST', '/api/extension/pair-code', {});
  assert.equal(lokalne.status, 200);
  assert.match(lokalne.body.code, /^[A-Za-z0-9_-]{16}$/);

  const pres = await a.send('POST', '/api/extension/pair-code', {}, { 'X-Forwarded-For': '203.0.113.7' });
  assert.notEqual(pres.status, 200, 'požadavek přes proxy nesmí kód dostat');
  assert.equal(pres.body?.code, undefined);
});

test('klíč okna aplikace: bez něj server z tohoto Macu nic nevydá, s ním funguje jako dřív', async () => {
  const { startTestServer } = await import('./helpers.mjs');
  const klic = 'k'.repeat(40);
  const t = await startTestServer({ AGENTEEQ_LOCAL_KEY: klic });
  try {
    const hlavicky = { 'X-Agenteeq': '1' };
    assert.equal((await fetch(`${t.url}/api/state`)).status, 403, 'bez klíče žádná data');
    assert.equal((await fetch(`${t.url}/`)).status, 403, 'bez klíče ani stránka');
    assert.equal((await fetch(`${t.url}/api/state`, { headers: { 'X-Agenteeq-Key': 'x'.repeat(40) } })).status, 403, 'špatný klíč');
    assert.equal((await fetch(`${t.url}/api/settings`, { method: 'PUT', headers: { ...hlavicky, 'Content-Type': 'application/json' }, body: '{}' })).status, 403, 'bez klíče žádná změna');
    const health = await (await fetch(`${t.url}/api/health`)).json();
    assert.equal(health.ok, true, 'health je bez klíče, ať jde poznat, že server žije');
    assert.equal(health.keyed, true);
    assert.equal((await fetch(`${t.url}/api/state`, { headers: { 'X-Agenteeq-Key': klic } })).status, 200, 'klíč v hlavičce');
    const r = await fetch(`${t.url}/?k=${klic}`, { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/', 'klíč se z adresy odstraní');
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.equal((await fetch(`${t.url}/api/state`, { headers: { Cookie: cookie.split(';')[0] } })).status, 200, 'cookie z adresy stačí');
    assert.equal((await fetch(`${t.url}/api/state?k=${klic}`)).status, 403, 'klíč v adrese API se neuznává');
  } finally {
    await t.close();
  }
});

test('health z tohoto Macu nese údaje pro převzetí osiřelého serveru i bez /api/state', async () => {
  const { startTestServer } = await import('./helpers.mjs');
  const t = await startTestServer({ AGENTEEQ_LOCAL_KEY: 'z'.repeat(40) });
  try {
    const h = await (await fetch(`${t.url}/api/health`)).json();
    assert.equal(typeof h.install.root, 'string');
    assert.equal(typeof h.install.bin, 'string');
    assert.equal(h.runsActive, 0);
  } finally {
    await t.close();
  }
});

test('git v cizím repozitáři nespustí příkaz z jeho konfigurace (core.fsmonitor)', async () => {
  const { tempDir } = await import('./helpers.mjs');
  const { repoInfo } = await import('../src/git.js');
  const { execFileSync } = await import('node:child_process');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = await tempDir('agenteeq-git-');
  const znak = path.join(dir, 'SPUSTENO');
  const skript = path.join(dir, 'fsm.sh');
  await fs.writeFile(skript, `#!/bin/sh\ntouch "${znak}"\n`, { mode: 0o755 });
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } });
  g('init', '-q');
  g('config', 'user.email', 't@t.cz'); g('config', 'user.name', 't');
  await fs.writeFile(path.join(dir, 'a.txt'), 'x');
  g('add', '.'); g('commit', '-qm', 'init');
  g('config', 'core.fsmonitor', skript);
  await repoInfo(dir);
  await assert.rejects(fs.access(znak), 'skript z konfigurace repozitáře se nesmí spustit');
});

test('s klíčem okna dál fungují hooky, ingest z rozšíření i párování rozšíření (mají vlastní tajemství)', async () => {
  const { startTestServer } = await import('./helpers.mjs');
  const t = await startTestServer({ AGENTEEQ_LOCAL_KEY: 'h'.repeat(40) });
  try {
    const token = t.app.datastore.data.ingestToken;
    const post = (cesta, hlavicky, telo) => fetch(`${t.url}${cesta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...hlavicky }, body: JSON.stringify(telo) });
    // Bez tokenu ani klíče projde jen to, co má vlastní kontrolu – a ta odmítne.
    const bezTokenu = await post('/api/hooks/claude-code', { 'X-Agenteeq': '1' }, { hook_event_name: 'Stop', session_id: crypto.randomUUID() });
    assert.equal(bezTokenu.status, 401, 'hook bez tokenu: odmítne ho kontrola tokenu, ne klíč okna');
    const shTokenem = await post('/api/hooks/claude-code', { 'X-Agenteeq-Token': token }, { hook_event_name: 'Stop', session_id: crypto.randomUUID(), cwd: '/tmp' });
    assert.ok([200, 202, 204].includes(shTokenem.status), `hook s tokenem: ${shTokenem.status}`);
    const parovani = await post('/api/extension/pair', { 'X-Agenteeq-Pair-Code': 'neplatny-kod-1234567' }, {});
    assert.doesNotMatch(await parovani.text(), /klíč okna/, 'párování rozšíření se dostane až ke kontrole kódu, ne ke klíči okna');
    const kodBezKlice = await post('/api/extension/pair-code', { 'X-Agenteeq': '1' }, {});
    assert.equal(kodBezKlice.status, 403, 'vytvořit párovací kód smí jen okno s klíčem');
    const kodSKlicem = await post('/api/extension/pair-code', { 'X-Agenteeq': '1', 'X-Agenteeq-Key': 'h'.repeat(40) }, {});
    assert.equal(kodSKlicem.status, 200);
  } finally {
    await t.close();
  }
});

test('odkaz do prohlížeče nese klíč, vytvoří ho jen tento Mac a po otevření z adresy zmizí', async () => {
  const { startTestServer } = await import('./helpers.mjs');
  const klic = 'b'.repeat(40);
  const t = await startTestServer({ AGENTEEQ_LOCAL_KEY: klic });
  try {
    const r = await fetch(`${t.url}/api/local/browser-link`, { method: 'POST', headers: { 'X-Agenteeq': '1', 'X-Agenteeq-Key': klic } });
    assert.equal(r.status, 200);
    const { path: cesta } = await r.json();
    assert.equal(cesta, `/?k=${klic}`, 'cesta musí nést klíč');
    // Odkaz skutečně otevře přehled a klíč se vymění za cookie.
    const otevreni = await fetch(new URL(cesta, t.url), { redirect: 'manual' });
    assert.equal(otevreni.status, 302);
    assert.equal(otevreni.headers.get('location'), '/', 'klíč v adrese nezůstane');
    assert.match(otevreni.headers.get('set-cookie'), /HttpOnly/);
    // Server bez klíče (spuštění z terminálu) vrací prostou cestu, ne prázdno.
    const bezKlice = await startTestServer();
    try {
      const b = await fetch(`${bezKlice.url}/api/local/browser-link`, { method: 'POST', headers: { 'X-Agenteeq': '1' } });
      assert.equal((await b.json()).path, '/');
    } finally { await bezKlice.close(); }
  } finally {
    await t.close();
  }
});
