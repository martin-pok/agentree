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
