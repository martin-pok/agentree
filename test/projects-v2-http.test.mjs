import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startTestServer, writeJsonl, tempDir, waitFor, api, fakeDatastore } from './helpers.mjs';
import { AlertEngine } from '../src/alerts.js';
import { COVER_PRESETS } from '../src/projects.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const g = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('projekty 2: nastavení, vzhled, obrázky, git, tým agentů, pravidla a rozpočet', async (t) => {
  const srcHome = await tempDir('agentree-src-');
  const repo = path.join(srcHome, 'klienti', 'web');
  await fs.mkdir(repo, { recursive: true });
  g(repo, 'init', '-q', '-b', 'main');
  g(repo, 'config', 'user.name', 'Test');
  g(repo, 'config', 'user.email', 'test@example.com');
  g(repo, 'config', 'commit.gpgsign', 'false');
  await fs.writeFile(path.join(repo, 'README.md'), '# Web\n');
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', 'Začátek');
  const sid = '88888888-2222-3333-4444-555555555555';
  await writeJsonl(path.join(srcHome, '.claude', 'projects', '-klienti-web', `${sid}.jsonl`), [
    { type: 'user', timestamp: new Date(Date.now() - 60000).toISOString(), cwd: repo, message: { content: 'Uprav web' } },
    { type: 'assistant', timestamp: new Date(Date.now() - 50000).toISOString(), message: { id: 'z1', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo' }], usage: { input_tokens: 100, output_tokens: 800 } } },
  ]);
  const srv = await startTestServer({ AGENTREE_SOURCE_HOME: srcHome });
  t.after(() => srv.close());
  const a = api(srv.url);
  let project;

  await t.test('nový projekt má výchozí nastavení a pozadí z předvoleb; validace nastavení', async () => {
    const r = await a.send('POST', '/api/projects', { name: 'Web', folders: [repo] });
    assert.equal(r.status, 201);
    project = r.body.project;
    assert.ok(COVER_PRESETS.includes(project.cover.preset));
    assert.equal(project.logo, null);
    assert.deepEqual(project.settings.agents, ['claude-code']);
    assert.equal(project.settings.isolate, true);
    assert.deepEqual(project.work, []);

    const bad = await a.send('PATCH', `/api/projects/${project.id}`, { settings: { agents: ['xyz'], tokenBudget: -1, baseBranch: 'a..b', repo: 'relativni', notify: 'hlasite' }, cover: { preset: 'neni' } });
    assert.equal(bad.status, 422);
    for (const k of ['settings.agents', 'settings.tokenBudget', 'settings.baseBranch', 'settings.repo', 'settings.notify', 'cover']) assert.ok(bad.body.errors[k], k);

    const ok = await a.send('PATCH', `/api/projects/${project.id}`, { settings: { repo, agents: ['claude-code', 'codex'], instructions: 'Piš česky.', notify: 'decisions', tokenBudget: 1000 }, cover: { preset: 'ember' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.project.cover.preset, 'ember');
    assert.equal(ok.body.project.settings.repo, repo);
    assert.equal(ok.body.project.settings.permission, 'plan', 'nezměněná pole zůstanou');
    project = ok.body.project;
  });

  await t.test('logo: nahrání PNG, ověření obsahu a velikosti, ochrana, smazání', async () => {
    const put = (body, headers = { 'X-Agentree': '1', 'Content-Type': 'image/png' }) => fetch(`${srv.url}/api/projects/${project.id}/media/logo`, { method: 'PUT', headers, body });
    assert.equal((await put(PNG, { 'Content-Type': 'image/png' })).status, 403, 'CSRF');
    assert.equal((await put(Buffer.from('<svg onload=alert(1)>'))).status, 415, 'SVG ani text nejsou povolené');
    const big = Buffer.concat([PNG, Buffer.alloc(1_600_000)]);
    assert.equal((await put(big)).status, 413);
    const up = await put(PNG);
    assert.equal(up.status, 200);
    const body = await up.json();
    assert.match(body.project.logo.file, /^logo-\d+\.png$/);
    const img = await fetch(`${srv.url}/api/projects/${project.id}/media/logo`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.match(img.headers.get('content-security-policy'), /sandbox/);
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
    assert.equal((await a.send('DELETE', `/api/projects/${project.id}/media/logo`)).body.project.logo, null);
    assert.equal((await fetch(`${srv.url}/api/projects/${project.id}/media/logo`)).status, 404);
    assert.equal((await fetch(`${srv.url}/api/projects/${project.id}/media/../../data.json`)).status, 404);
  });

  await t.test('git projektu: větev, čistý stav, žádné pracovní větve', async () => {
    const r = await a.get(`/api/projects/${project.id}/git`);
    assert.equal(r.status, 200);
    assert.equal(r.body.repo.isRepo, true);
    assert.equal(r.body.repo.branch, 'main');
    assert.equal(r.body.repo.clean, true);
    assert.deepEqual(r.body.work, []);
  });

  await t.test('tým agentů (zkušební režim): větev a pracovní kopie pro každého, pravidla a brief v zadání', async () => {
    await a.send('PATCH', `/api/projects/${project.id}`, { notes: 'Klient: kavárna.' });
    const r = await a.send('POST', `/api/projects/${project.id}/team`, { prompt: 'Přidej ceník', agents: ['claude-code', 'codex'], mode: 'background' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.started, 2);
    for (const x of r.body.results) {
      assert.match(x.work.branch, new RegExp(`^agentree/${x.agent === 'codex' ? 'codex' : 'claude'}-pridej-cenik-\\d{4}-\\d{6}$`));
      assert.ok(x.work.path.startsWith(path.join(srv.dataHome, 'worktrees', project.id) + path.sep));
      assert.equal(await fs.stat(x.work.path).catch(() => null), null, 'zkušební režim nic nevytváří');
      const promptArg = x.plan.argv.at(-1);
      assert.ok(promptArg.startsWith('Přidej ceník'));
      assert.ok(promptArg.includes('Pravidla projektu Web:\nPiš česky.'));
      assert.ok(promptArg.includes('Podklady projektu Web:\nKlient: kavárna.'));
    }
    assert.deepEqual((await a.get('/api/projects')).body.projects.items[0].work, []);

    assert.equal((await a.send('POST', `/api/projects/${project.id}/team`, { prompt: ' ', agents: ['codex'] })).body.field, 'prompt');
    const missing = await a.send('POST', `/api/projects/${project.id}/team`, { prompt: 'x', agents: ['gemini-cli'] });
    assert.equal(missing.status, 422);
    assert.match(missing.body.error, /není k dispozici/);
    assert.equal((await a.send('POST', `/api/projects/${project.id}/team`, { prompt: 'x', agents: ['codex', 'codex', 'claude-code', 'qwen-code', 'gemini-cli'] })).status, 422);

    const plainDir = path.join(srcHome, 'bez-gitu');
    await fs.mkdir(plainDir);
    const p2 = (await a.send('POST', '/api/projects', { name: 'Bez gitu', folders: [plainDir] })).body.project;
    assert.match((await a.send('POST', `/api/projects/${p2.id}/team`, { prompt: 'x', agents: ['codex'] })).body.error, /není Git repozitář/);
    const off = await a.send('POST', `/api/projects/${p2.id}/team`, { prompt: 'x', agents: ['codex'], isolate: false });
    assert.equal(off.status, 200, 'bez oddělených větví funguje i mimo Git');
    const p3 = (await a.send('POST', '/api/projects', { name: 'Bez složky' })).body.project;
    assert.equal((await a.send('POST', `/api/projects/${p3.id}/team`, { prompt: 'x', agents: ['codex'] })).body.field, 'repo');
    assert.equal((await a.send('POST', `/api/projects/${project.id}/work/neni/accept`)).status, 404);
  });

  await t.test('jednotlivé spuštění z projektu nese pravidla projektu', async () => {
    const r = await a.send('POST', '/api/launch', { agent: 'codex', mode: 'background', prompt: 'Ahoj', cwd: repo, projectId: project.id });
    assert.equal(r.status, 200);
    assert.equal(r.body.plan.argv.at(-1), 'Ahoj\n\n---\nPravidla projektu Web:\nPiš česky.');
  });

  await t.test('rozpočet tokenů projektu: upozornění při 80 %', async () => {
    await waitFor(() => srv.app.projectMonthTokens(project.id) >= 900);
    srv.app.checkProjectBudgets();
    const alerts = (await a.get('/api/alerts')).body.items;
    assert.ok(alerts.some((x) => x.kind === 'budget' && x.title === 'Projekt Web: 90 % rozpočtu tokenů'), JSON.stringify(alerts.map((x) => x.title)));
    srv.app.checkProjectBudgets();
    assert.equal((await a.get('/api/alerts')).body.items.filter((x) => x.kind === 'budget').length, 1, 'bez duplicit');
  });
});

test('upozornění podle projektu: ztlumený projekt mlčí, „jen rozhodnutí“ nehlásí dokončení', () => {
  const make = (mode) => {
    const ds = fakeDatastore();
    const engine = new AlertEngine({ store: { on() {}, emit() {}, list: () => [] }, datastore: ds, notifier: { native: async () => {} }, projectNotify: () => mode });
    return { engine, ds };
  };
  const now = Date.now();
  const needs = { id: 'claude-code:a', app: 'Claude Code', status: 'needs_input', reason: 'Povolit?', pending: { at: now }, lastAt: now, projectId: 'p' };
  const muted = make('mute');
  muted.engine.onSession({ ...needs, status: 'working', turnStartedAt: now - 600e3 });
  muted.engine.onSession(needs);
  assert.equal(muted.ds.data.alerts.length, 0);

  const decisions = make('decisions');
  decisions.engine.onSession({ ...needs, status: 'working', turnStartedAt: now - 600e3 });
  decisions.engine.onSession({ ...needs, status: 'waiting', lastAt: now });
  assert.equal(decisions.ds.data.alerts.length, 0, 'dokončení se nehlásí');
  decisions.engine.onSession(needs);
  assert.deepEqual(decisions.ds.data.alerts.map((x) => x.kind), ['needs_input']);
});
