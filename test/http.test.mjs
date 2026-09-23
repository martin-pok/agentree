import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { appSupportDir } from '../src/platform.js';
import { startTestServer, writeJsonl, openStream, waitFor, api, tempDir } from './helpers.mjs';

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function raw(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('HTTP API, realtime stream a zabezpečení', async (t) => {
  const srcHome = await tempDir('agenteeq-src-');
  const sid = '11111111-2222-3333-4444-555555555555';
  const file = path.join(srcHome, '.claude', 'projects', '-Users-x-proj', `${sid}.jsonl`);
  const now = Date.now();
  const iso = (ms) => new Date(now + ms).toISOString();
  await writeJsonl(file, [
    { type: 'user', timestamp: iso(-60000), cwd: '/Users/x/proj', message: { content: 'Vytvoř landing page' } },
    { type: 'assistant', timestamp: iso(-50000), message: { id: 'a1', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo' }], usage: { input_tokens: 5, output_tokens: 7 } } },
  ]);
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: srcHome });
  t.after(() => srv.close());
  const a = api(srv.url);
  const token = JSON.parse(await fs.readFile(path.join(srv.dataHome, 'data.json'), 'utf8')).ingestToken;
  const id = `claude-code:${sid}`;

  await t.test('stav obsahuje session z přepisu', async () => {
    const r = await a.get('/api/state');
    assert.equal(r.status, 200);
    assert.equal(r.body.ready, true);
    const s = r.body.sessions.find((x) => x.id === id);
    assert.ok(s, 'session je ve stavu');
    assert.equal(s.title, 'Vytvoř landing page');
    assert.equal(s.status, 'waiting');
    assert.equal(s.resume, `cd '/Users/x/proj' && claude --resume ${sid}`);
    assert.ok(r.body.connectors.some((c) => c.id === 'claude-code' && c.state === 'connected'));
  });

  await t.test('otevření v aplikaci: nabídka akcí, plán, ochrana', async () => {
    const st = await a.get(`/api/sessions/${encodeURIComponent(id)}`);
    assert.deepEqual(st.body.session.open.map((x) => x.id), ['app', 'terminal', 'folder']);
    const path = `/api/sessions/${encodeURIComponent(id)}/open`;
    assert.equal((await a.send('POST', path, { target: 'terminal' }, {})).status, 403);
    const r = await a.send('POST', path, { target: 'terminal' });
    assert.equal(r.status, 200);
    assert.equal(r.body.dry, true);
    assert.equal(r.body.plan.command, `cd '/Users/x/proj' && claude --resume ${sid}`);
    assert.equal((await a.send('POST', path, { target: 'shell' })).status, 422);
    assert.equal((await a.send('POST', '/api/sessions/neexistuje/open', { target: 'app' })).status, 404);
  });

  await t.test('cizí Host je odmítnut (DNS rebinding)', async () => {
    const r = await raw(`${srv.url}/api/state`, { headers: { Host: 'evil.example' } });
    assert.equal(r.status, 403);
  });

  await t.test('nový řádek přepisu dorazí streamem do 2 sekund', async () => {
    const stream = await openStream(srv.url);
    try {
      await waitFor(() => stream.events.some((e) => e.event === 'hello'));
      const t0 = Date.now();
      await writeJsonl(file, [{ type: 'user', timestamp: new Date().toISOString(), message: { content: 'Přidej ceník' } }], { append: true });
      const ev = await waitFor(() => stream.events.find((e) => e.event === 'transcript' && e.data.id === id && e.data.entries.some((x) => x.text === 'Přidej ceník')), 3000);
      assert.ok(ev.at - t0 < 2000, `latence ${ev.at - t0} ms`);
      await waitFor(() => stream.events.find((e) => e.event === 'session' && e.data.id === id && e.data.status === 'working'));
    } finally {
      stream.close();
    }
  });

  await t.test('hook: bez tokenu 401, s tokenem okamžitě „potřebuje rozhodnutí“ a upozornění', async () => {
    const bad = await a.send('POST', '/api/hooks/claude-code', { session_id: sid, hook_event_name: 'Notification' }, {});
    assert.equal(bad.status, 401);
    const stream = await openStream(srv.url);
    try {
      await waitFor(() => stream.events.some((e) => e.event === 'hello'));
      const r = await a.send('POST', '/api/hooks/claude-code', {
        session_id: sid,
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
        message: 'Claude needs your permission to use Bash',
        transcript_path: file,
        cwd: '/Users/x/proj',
      }, { 'X-Agenteeq-Token': token });
      assert.equal(r.status, 200);
      const ev = await waitFor(() => stream.events.find((e) => e.event === 'alert'));
      assert.equal(ev.data.alert.kind, 'needs_input');
      const st = await a.get(`/api/sessions/${encodeURIComponent(id)}`);
      assert.equal(st.body.session.status, 'needs_input');
      assert.equal(st.body.session.reason, 'Claude needs your permission to use Bash');
      assert.ok(st.body.transcript.length >= 3);

      await a.send('POST', '/api/hooks/claude-code', { session_id: sid, hook_event_name: 'Stop' }, { 'X-Agenteeq-Token': token });
      const after = await a.get(`/api/sessions/${encodeURIComponent(id)}`);
      assert.equal(after.body.session.status, 'waiting');
    } finally {
      stream.close();
    }
  });

  await t.test('výdaje: ochrana proti CSRF, validace, rozpočet a upozornění', async () => {
    assert.equal((await a.send('POST', '/api/spend/ledger', { service: 'claude' }, {})).status, 403);
    const foreign = await raw(`${srv.url}/api/spend/ledger`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agenteeq': '1', Origin: 'https://evil.example' }, body: '{}' });
    assert.equal(foreign.status, 403);
    const bad = await a.send('POST', '/api/spend/ledger', { service: 'claude', amount: 'x' });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.amount);
    const ok = await a.send('POST', '/api/spend/ledger', { service: 'claude', kind: 'extra', amount: '900', currency: 'CZK', date: localDate() });
    assert.equal(ok.status, 201);
    const b = await a.send('PUT', '/api/spend/budgets', { total: 1000, services: { claude: 500 } });
    assert.equal(b.status, 200);
    assert.equal(b.body.spend.month.total, 900);
    const alerts = await a.get('/api/alerts');
    assert.ok(alerts.body.items.some((x) => x.kind === 'budget' && x.level === 'critical'), 'Claude přes rozpočet');
    assert.ok(alerts.body.items.some((x) => x.kind === 'budget' && x.level === 'warning'), 'celkem nad 80 %');
    const del = await a.send('DELETE', `/api/spend/ledger/${ok.body.entry.id}`);
    assert.equal(del.body.spend.month.total, 0);
    const read = await a.send('POST', '/api/alerts/read', { ids: 'all' });
    assert.equal(read.body.unread, 0);
  });

  await t.test('webové rozšíření: jednorázové párování a ingest s vlastním tokenem', async () => {
    const code = await a.send('POST', '/api/extension/pair-code', {});
    assert.equal(code.status, 200);
    assert.match(code.body.code, /^[A-Za-z0-9_-]{16}$/);
    assert.ok(code.body.expiresAt > Date.now());
    assert.equal((await raw(`${srv.url}/api/extension/pair`)).status, 405);
    const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const foreign = await raw(`${srv.url}/api/extension/pair`, { method: 'POST', headers: { Origin: 'https://evil.example', 'X-Agenteeq-Pair-Code': code.body.code } });
    assert.equal(foreign.status, 403);
    const bad = await raw(`${srv.url}/api/extension/pair`, { method: 'POST', headers: { Origin: origin, 'X-Agenteeq-Pair-Code': 'A'.repeat(16) } });
    assert.equal(bad.status, 401);
    const paired = await raw(`${srv.url}/api/extension/pair`, { method: 'POST', headers: { Origin: origin, 'X-Agenteeq-Pair-Code': code.body.code } });
    assert.equal(paired.status, 200);
    const extToken = JSON.parse(paired.body).token;
    assert.ok(extToken.length >= 32);
    assert.notEqual(extToken, token, 'rozšíření nesmí dostat token hooků');
    const replay = await raw(`${srv.url}/api/extension/pair`, { method: 'POST', headers: { Origin: origin, 'X-Agenteeq-Pair-Code': code.body.code } });
    assert.equal(replay.status, 401);
    const zprava = {
      site: 'perplexity',
      conversationId: 'trh-ai-2026',
      url: 'https://www.perplexity.ai/search/trh-ai-2026',
      title: 'Trh AI',
      generating: true,
      messages: [{ role: 'user', text: 'Jak velký je trh?' }],
    };
    const sHooky = await a.send('POST', '/api/ingest/web', zprava, { 'X-Agenteeq-Token': token, Origin: origin });
    assert.equal(sHooky.status, 401, 'token hooků pro rozšíření neplatí');
    const r = await a.send('POST', '/api/ingest/web', zprava, { 'X-Agenteeq-Token': extToken, Origin: origin });
    assert.equal(r.status, 200);
    const st = await a.get('/api/state');
    const s = st.body.sessions.find((x) => x.id === 'web:perplexity:trh-ai-2026');
    assert.equal(s.status, 'working');
    assert.equal(s.app, 'Perplexity');
    assert.equal(st.body.integrations.extension.token, undefined);
  });

  await t.test('zapnutí Claude hooků přes API zapíše správný port', async () => {
    const r = await a.send('POST', '/api/integrations/claude-hooks/install');
    assert.equal(r.status, 200);
    assert.equal(r.body.claudeHooks.installed, true);
    const json = JSON.parse(await fs.readFile(path.join(srcHome, '.claude', 'settings.json'), 'utf8'));
    const port = new URL(srv.url).port;
    const rawCommand = json.hooks.Notification[0].hooks[0].command;
    const command = rawCommand.includes(' -EncodedCommand ')
      ? Buffer.from(rawCommand.split(' -EncodedCommand ')[1], 'base64').toString('utf16le') : rawCommand;
    assert.ok(command.includes(`127.0.0.1:${port}/api/hooks/claude-code`));
    const off = await a.send('POST', '/api/integrations/claude-hooks/uninstall');
    assert.equal(off.body.claudeHooks.installed, false);
  });

  await t.test('nastavení, statické soubory a ochrana cest', async () => {
    const s = await a.send('PUT', '/api/settings', { notifications: { done: false, doneMinSeconds: 300 } });
    assert.equal(s.body.settings.notifications.done, false);
    assert.equal((await a.send('PUT', '/api/settings', { notifications: { doneMinSeconds: -1 } })).status, 422);
    const index = await fetch(`${srv.url}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Agenteeq/);
    const trav = await raw(`${srv.url}/..%2f..%2fpackage.json`);
    assert.ok([403, 404].includes(trav.status), `stav ${trav.status}`);
    assert.equal((await fetch(`${srv.url}/api/neexistuje`)).status, 404);
    assert.equal((await fetch(`${srv.url}/js/app.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  });
});

test('Historie vytížení plánu přes API: bez souboru „není k dispozici“, se souborem reálná řada bez identifikátoru organizace', async (t) => {
  const srcHome = await tempDir('agenteeq-src-');
  const s = await startTestServer({ AGENTEEQ_SOURCE_HOME: srcHome });
  t.after(() => s.close());

  // Chybějící soubor není chyba serveru (dřív 404 plnila konzoli každého nového uživatele),
  // ale API si pořád nic nevymýšlí: žádná řada, jen „není k dispozici“.
  const prazdno = await api(s.url).get('/api/usage/claude');
  assert.equal(prazdno.status, 200);
  assert.equal(prazdno.body.available, false);
  assert.equal(prazdno.body.samples, undefined, 'bez souboru žádné vzorky');
  assert.equal(prazdno.body.fiveHour, undefined, 'bez souboru žádná řada');

  const now = Date.now();
  const dir = path.join(appSupportDir(srcHome), 'Claude');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'plan-usage-history.json'), JSON.stringify({
    version: 2,
    samples: [
      { t: now - 3 * 86400000, org: 'org_tajne', u: { fh: 40, sd: 20 } },
      { t: now - 86400000, org: 'org_tajne', u: { fh: 88, sd: 50, xu: 12.5 } },
    ],
  }));

  const res = await api(s.url).get('/api/usage/claude?days=7');
  assert.equal(res.status, 200);
  const out = res.body;
  assert.equal(out.samples, 2);
  assert.deepEqual(out.fiveHour.map((p) => p.value), [40, 88]);
  assert.deepEqual(out.extraUsage.map((p) => p.value), [12.5]);
  assert.equal(JSON.stringify(out).includes('org_tajne'), false, 'identifikátor organizace se ven nedostane');
});

test('Vlastní agenti přes API: cizí adresa neprojde, zápis chce hlavičku a víc než osm jich není', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const bezHlavicky = await raw(`${s.url}/api/custom-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x', type: 'comfyui', url: 'http://127.0.0.1:8188' }),
  });
  assert.equal(bezHlavicky.status, 403, 'zápis bez hlavičky X-Agenteeq je odmítnutý');

  const verejna = await api(s.url).send('POST', '/api/custom-agents', { name: 'Cizí', type: 'comfyui', url: 'https://example.com' });
  assert.equal(verejna.status, 400);
  assert.match(verejna.body.error, /lokální|privátní/);

  const metadata = await api(s.url).send('POST', '/api/custom-agents', { name: 'Metadata', type: 'comfyui', url: 'http://169.254.169.254/' });
  assert.equal(metadata.status, 400, 'cloudová metadata se nikdy nezkusí');

  const prvni = await api(s.url).send('POST', '/api/custom-agents', { name: 'ComfyUI', type: 'comfyui', url: 'http://127.0.0.1:8188/queue?x=1' });
  assert.equal(prvni.status, 200);
  assert.equal(prvni.body.agents.length, 1);
  assert.equal(prvni.body.agents[0].origin, 'http://127.0.0.1:8188', 'z adresy zůstane jen origin');

  const znovu = await api(s.url).send('POST', '/api/custom-agents', { name: 'ComfyUI podruhé', type: 'comfyui', url: 'http://127.0.0.1:8188' });
  assert.equal(znovu.status, 409, 'stejná služba se nepřidá dvakrát');

  for (let i = 0; i < 7; i++) {
    const r = await api(s.url).send('POST', '/api/custom-agents', { name: `Agent ${i}`, type: 'ollama', url: `http://127.0.0.1:${9000 + i}` });
    assert.equal(r.status, 200, `agent ${i} se má přidat`);
  }
  const devaty = await api(s.url).send('POST', '/api/custom-agents', { name: 'Devátý', type: 'ollama', url: 'http://127.0.0.1:9100' });
  assert.equal(devaty.status, 422, 'devátý agent se nepřidá');

  const id = prvni.body.agents[0].id;
  const smazano = await api(s.url).send('DELETE', `/api/custom-agents/${id}`);
  assert.equal(smazano.status, 200);
  assert.equal(smazano.body.agents.some((a) => a.id === id), false);

  const stav = await api(s.url).get('/api/state');
  assert.equal(Array.isArray(stav.body.customAgents), true, 'vlastní agenti jsou součástí stavu');
});
