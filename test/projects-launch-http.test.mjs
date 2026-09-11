import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, writeJsonl, openStream, waitFor, api, tempDir } from './helpers.mjs';
import { signLicense } from '../src/license.js';
import { PAID_FEATURES } from '../src/plans.js';

function mockOllama() {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'llama3.2:3b', size: 2e9 }] }));
      return;
    }
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write(`${JSON.stringify({ message: { role: 'assistant', content: 'Ahoj' } })}\n`);
      setTimeout(() => {
        res.write(`${JSON.stringify({ message: { role: 'assistant', content: ', jak ti pomohu?' } })}\n`);
        res.end(`${JSON.stringify({ done: true, prompt_eval_count: 4, eval_count: 6 })}\n`);
      }, 20);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('projekty, rychlé spouštění, licence a složky přes HTTP', async (t) => {
  const ollama = await mockOllama();
  t.after(() => ollama.close());
  const srcHome = await tempDir('agentree-src-');
  const projDir = path.join(srcHome, 'klienti', 'kavarna');
  await fs.mkdir(path.join(projDir, 'web'), { recursive: true });
  await fs.mkdir(path.join(projDir, '.git'));
  const sid = '99999999-2222-3333-4444-555555555555';
  const now = Date.now();
  await writeJsonl(path.join(srcHome, '.claude', 'projects', '-klienti-kavarna-web', `${sid}.jsonl`), [
    { type: 'user', timestamp: new Date(now - 60000).toISOString(), cwd: path.join(projDir, 'web'), message: { content: 'Navrhni menu' } },
    { type: 'assistant', timestamp: new Date(now - 50000).toISOString(), message: { id: 'a1', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo' }], usage: { input_tokens: 5, output_tokens: 7 } } },
  ]);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const srv = await startTestServer(
    { AGENTREE_SOURCE_HOME: srcHome, AGENTREE_OLLAMA_URL: `http://127.0.0.1:${ollama.address().port}` },
    { licensePublicKey: publicKey.export({ type: 'spki', format: 'pem' }) },
  );
  t.after(() => srv.close());
  const a = api(srv.url);
  const id = `claude-code:${sid}`;
  const session = async (x = id) => (await a.get(`/api/sessions/${encodeURIComponent(x)}`)).body;
  let project;

  await t.test('stav obsahuje projekty, nabídku agentů, běhy a licenci', async () => {
    const r = await a.get('/api/state');
    assert.deepEqual(r.body.projects.items, []);
    const ids = r.body.launch.targets.map((x) => x.id);
    for (const x of ['claude-code', 'codex', 'chatgpt', 'claude-web', 'ollama']) assert.ok(ids.includes(x), x);
    assert.deepEqual(r.body.runs, []);
    assert.equal(r.body.license.plan, 'free');
    assert.equal(r.body.integrations.autostart.installed, false);
    assert.equal(r.body.usage.launches, 0);
  });

  await t.test('projekt: vytvoření, validace, úpravy a automatické zařazení podle složky (živě)', async () => {
    const stream = await openStream(srv.url);
    try {
      await waitFor(() => stream.events.some((e) => e.event === 'hello'));
      assert.equal((await a.send('POST', '/api/projects', { name: 'Kavárna' }, {})).status, 403, 'CSRF ochrana');
      const bad = await a.send('POST', '/api/projects', { name: ' ', folders: ['relativni'] });
      assert.equal(bad.status, 422);
      assert.ok(bad.body.errors.name && bad.body.errors.folders);

      const created = await a.send('POST', '/api/projects', { name: 'Kavárna U Mostu', description: 'Web a e-shop', folders: [projDir] });
      assert.equal(created.status, 201);
      project = created.body.project;
      await waitFor(() => stream.events.find((e) => e.event === 'projects' && e.data.items.some((p) => p.id === project.id)));
      await waitFor(() => stream.events.find((e) => e.event === 'session' && e.data.id === id && e.data.projectId === project.id && e.data.projectSource === 'folder'));

      assert.equal((await a.send('POST', '/api/projects', { name: 'kavárna u mostu' })).status, 422, 'duplicitní název');
      const edited = await a.send('PATCH', `/api/projects/${project.id}`, { notes: 'Brief: tón přátelský, barvy značky.', color: '#22A38C' });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.project.notes, 'Brief: tón přátelský, barvy značky.');
      assert.equal(edited.body.project.name, 'Kavárna U Mostu');
      assert.equal((await a.send('PATCH', '/api/projects/neexistuje', { name: 'X' })).status, 404);
    } finally {
      stream.close();
    }
  });

  await t.test('ruční zařazení, vyřazení z projektu a snímek konverzace', async () => {
    const out = await a.send('POST', '/api/projects/assign', { sessionIds: [id], projectId: '' });
    assert.equal(out.status, 200);
    assert.equal(out.body.projects.snapshots[id], undefined);
    let s = (await session()).session;
    assert.equal(s.projectId, null);
    assert.equal(s.projectSource, 'none', 'ruční vyřazení přebije pravidlo složky');

    const back = await a.send('POST', '/api/projects/assign', { sessionIds: [id, 'web:chatgpt:abc'], projectId: project.id });
    assert.equal(back.status, 200);
    assert.equal(back.body.projects.snapshots[id].title, 'Navrhni menu');
    assert.equal(back.body.projects.assignments['web:chatgpt:abc'], project.id, 'webový chat jde zařadit dopředu');
    s = (await session()).session;
    assert.equal(s.projectSource, 'manual');

    assert.equal((await a.send('POST', '/api/projects/assign', { sessionIds: [id], projectId: 'neexistuje' })).status, 422);
    assert.equal((await a.send('POST', '/api/projects/assign', { sessionIds: [id] })).status, 422);
    assert.equal((await a.send('POST', '/api/projects/assign', { sessionIds: [], projectId: project.id })).status, 422);
  });

  await t.test('export projektu do CSV', async () => {
    const res = await fetch(`${srv.url}/api/projects/${project.id}/export`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/csv/);
    assert.match(res.headers.get('content-disposition'), /filename="agentree-kavarna-u-mostu-\d{4}-\d{2}-\d{2}\.csv"/);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM pro Excel');
    assert.ok(bytes.toString('utf8').includes('Navrhni menu'));
    assert.equal((await fetch(`${srv.url}/api/projects/neexistuje/export`)).status, 404);
  });

  await t.test('spuštění agenta: Terminál, pozadí, web a chybové stavy', async () => {
    const term = await a.send('POST', '/api/launch', { agent: 'claude-code', mode: 'terminal', prompt: 'Uprav ceník', cwd: projDir, projectId: project.id });
    assert.equal(term.status, 200, JSON.stringify(term.body));
    assert.equal(term.body.dry, true);
    assert.match(term.body.plan.command, /--session-id [0-9a-f-]{36} -- "\$\(cat '.+\.txt'\)"$/);
    assert.equal(term.body.plan.prompt, undefined, 'zadání se v odpovědi nevrací');
    assert.equal((await a.get('/api/projects')).body.projects.assignments[term.body.sessionId], project.id, 'nová session je rovnou v projektu');

    const bg = await a.send('POST', '/api/launch', { agent: 'claude-code', mode: 'background', prompt: 'Zkontroluj texty', cwd: projDir, permission: 'acceptEdits' });
    assert.equal(bg.status, 200);
    assert.deepEqual(bg.body.plan.argv.slice(-4), ['--permission-mode', 'acceptEdits', '--', 'Zkontroluj texty']);

    const web = await a.send('POST', '/api/launch', { agent: 'chatgpt', mode: 'web', prompt: 'Napiš slogan' });
    assert.equal(web.body.copyPrompt, true);
    assert.match(web.body.plan.args[0], /^https:\/\/chatgpt\.com\/\?q=/);

    assert.equal((await a.send('POST', '/api/launch', { agent: 'chatgpt', mode: 'web', prompt: '' })).body.field, 'prompt');
    assert.equal((await a.send('POST', '/api/launch', { agent: 'codex', mode: 'background', prompt: 'x', cwd: path.join(srcHome, 'neni') })).body.field, 'cwd');
    assert.equal((await a.send('POST', '/api/launch', { agent: 'chatgpt', mode: 'web', prompt: 'x', projectId: 'neni' })).body.field, 'projectId');
    assert.equal((await a.send('POST', '/api/launch', { agent: 'chatgpt', mode: 'web', prompt: 'x' }, {})).status, 403);
    assert.equal((await a.get('/api/state')).body.usage.launches, 3);
  });

  await t.test('placená funkce bez licence vrátí 402, platná licence ji odemkne', async () => {
    PAID_FEATURES.launchBackground = 'pro';
    try {
      const body = { agent: 'codex', mode: 'background', prompt: 'x', cwd: projDir };
      const denied = await a.send('POST', '/api/launch', body);
      assert.equal(denied.status, 402);
      assert.equal(denied.body.upgrade, true);

      assert.equal((await a.send('PUT', '/api/license', { key: 'AGT1.nesmysl.podpis' })).status, 422);
      const key = signLicense({ v: 1, id: 'lic-http', name: 'Studio Test', email: 'studio@test.cz', plan: 'pro', seats: 3, issuedAt: new Date().toISOString(), expiresAt: null }, privateKey.export({ type: 'pkcs8', format: 'pem' }));
      const ok = await a.send('PUT', '/api/license', { key });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.license.plan, 'pro');
      assert.equal(ok.body.license.license.seats, 3);
      assert.ok(!JSON.stringify(ok.body).includes(key), 'celý klíč se klientovi nevrací');
      assert.equal((await a.send('POST', '/api/launch', body)).status, 200);
      assert.ok(!JSON.stringify((await a.get('/api/state')).body).includes(key));

      assert.equal((await a.send('DELETE', '/api/license')).body.license.plan, 'free');
      assert.equal((await a.send('POST', '/api/launch', body)).status, 402);
    } finally {
      delete PAID_FEATURES.launchBackground;
    }
  });

  await t.test('limit aktivních projektů ve verzi Zdarma (když je zapnutý)', async () => {
    PAID_FEATURES.projectsUnlimited = 'pro';
    const extra = [];
    try {
      for (const name of ['Druhý', 'Třetí']) {
        const r = await a.send('POST', '/api/projects', { name });
        assert.equal(r.status, 201);
        extra.push(r.body.project.id);
      }
      const over = await a.send('POST', '/api/projects', { name: 'Čtvrtý' });
      assert.equal(over.status, 402);
      await a.send('PATCH', `/api/projects/${extra[1]}`, { archived: true });
      assert.equal((await a.send('POST', '/api/projects', { name: 'Čtvrtý' })).status, 201, 'archivovaný projekt se do limitu nepočítá');
    } finally {
      delete PAID_FEATURES.projectsUnlimited;
      const items = (await a.get('/api/projects')).body.projects.items;
      for (const p of items) if (p.id !== project.id) await a.send('DELETE', `/api/projects/${p.id}`);
    }
  });

  await t.test('lokální model přes Ollamu: start z nabídky, streamovaná odpověď, pokračování', async () => {
    const r = await a.send('POST', '/api/launch', { agent: 'ollama', mode: 'local', prompt: 'Ahoj', projectId: project.id });
    assert.equal(r.status, 200);
    const chatId = r.body.sessionId;
    assert.match(chatId, /^local-chat:/);
    await waitFor(async () => (await session(chatId)).transcript?.some((e) => e.role === 'assistant' && e.text === 'Ahoj, jak ti pomohu?'));
    const s = (await session(chatId)).session;
    assert.equal(s.chat.available, true);
    assert.equal(s.projectId, project.id);
    assert.equal((await a.send('POST', `/api/sessions/${encodeURIComponent(chatId)}/reply`, { text: 'Díky' })).status, 200);
    await waitFor(async () => (await session(chatId)).transcript.filter((e) => e.role === 'assistant' && e.text === 'Ahoj, jak ti pomohu?').length === 2);
    assert.equal((await a.send('POST', `/api/sessions/${encodeURIComponent(chatId)}/reply`, { text: '  ' })).status, 422);
    assert.equal((await a.send('POST', `/api/sessions/${encodeURIComponent(id)}/reply`, { text: 'x' })).status, 404, 'odpovídat jde jen lokálnímu chatu');
    assert.equal((await a.send('POST', `/api/sessions/${encodeURIComponent(chatId)}/stop`)).status, 409);
  });

  await t.test('běhy, automatické spouštění, onboarding a procházení složek', async () => {
    assert.deepEqual((await a.get('/api/runs')).body.runs, []);
    assert.equal((await a.send('POST', '/api/runs/neni/stop')).status, 404);
    assert.equal((await a.get('/api/runs/neni/log')).status, 404);
    assert.equal((await a.send('POST', '/api/integrations/autostart/install')).body.dry, true);
    assert.equal((await a.send('PUT', '/api/settings', { onboardingDismissed: true })).body.settings.onboardingDismissed, true);

    const home = await a.get('/api/fs/folders');
    assert.equal(home.status, 200);
    assert.equal(home.body.path, path.resolve(srcHome));
    assert.equal(home.body.parent, null);
    assert.ok(home.body.dirs.some((d) => d.name === 'klienti'));
    assert.ok(!home.body.dirs.some((d) => d.name.startsWith('.')), 'skryté složky se nezobrazují');
    const inner = await a.get(`/api/fs/folders?path=${encodeURIComponent(path.join(srcHome, 'klienti'))}`);
    assert.deepEqual(inner.body.dirs, [{ name: 'kavarna', path: projDir, git: true }]);
    assert.equal((await a.get('/api/fs/folders?path=%2Fetc')).status, 403);
    assert.equal((await a.get(`/api/fs/folders?path=${encodeURIComponent(`${srcHome}-jinde`)}`)).status, 403);
    assert.equal((await a.get('/api/fs/folders?path=relativni')).status, 400);
    assert.equal((await a.get(`/api/fs/folders?path=${encodeURIComponent(path.join(srcHome, 'neni'))}`)).status, 404);
  });

  await t.test('smazání projektu uvolní jeho konverzace', async () => {
    assert.equal((await a.send('DELETE', `/api/projects/${project.id}`)).status, 200);
    const s = (await session()).session;
    assert.equal(s.projectId, null);
    assert.equal(s.projectSource, null);
    const p = (await a.get('/api/projects')).body.projects;
    assert.deepEqual(p.items, []);
    assert.deepEqual(p.snapshots, {});
    assert.equal((await a.send('DELETE', `/api/projects/${project.id}`)).status, 404);
  });
});
