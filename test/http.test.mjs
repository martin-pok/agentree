import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
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
  const srcHome = await tempDir('agentree-src-');
  const sid = '11111111-2222-3333-4444-555555555555';
  const file = path.join(srcHome, '.claude', 'projects', '-Users-x-proj', `${sid}.jsonl`);
  const now = Date.now();
  const iso = (ms) => new Date(now + ms).toISOString();
  await writeJsonl(file, [
    { type: 'user', timestamp: iso(-60000), cwd: '/Users/x/proj', message: { content: 'Vytvoř landing page' } },
    { type: 'assistant', timestamp: iso(-50000), message: { id: 'a1', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo' }], usage: { input_tokens: 5, output_tokens: 7 } } },
  ]);
  const srv = await startTestServer({ AGENTREE_SOURCE_HOME: srcHome });
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
      }, { 'X-Agentree-Token': token });
      assert.equal(r.status, 200);
      const ev = await waitFor(() => stream.events.find((e) => e.event === 'alert'));
      assert.equal(ev.data.alert.kind, 'needs_input');
      const st = await a.get(`/api/sessions/${encodeURIComponent(id)}`);
      assert.equal(st.body.session.status, 'needs_input');
      assert.equal(st.body.session.reason, 'Claude needs your permission to use Bash');
      assert.ok(st.body.transcript.length >= 3);

      await a.send('POST', '/api/hooks/claude-code', { session_id: sid, hook_event_name: 'Stop' }, { 'X-Agentree-Token': token });
      const after = await a.get(`/api/sessions/${encodeURIComponent(id)}`);
      assert.equal(after.body.session.status, 'waiting');
    } finally {
      stream.close();
    }
  });

  await t.test('výdaje: ochrana proti CSRF, validace, rozpočet a upozornění', async () => {
    assert.equal((await a.send('POST', '/api/spend/ledger', { service: 'claude' }, {})).status, 403);
    const foreign = await raw(`${srv.url}/api/spend/ledger`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agentree': '1', Origin: 'https://evil.example' }, body: '{}' });
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

  await t.test('webové rozšíření: ingest a jednorázové párování', async () => {
    const code = await a.send('POST', '/api/extension/pair-code', {});
    assert.equal(code.status, 200);
    assert.match(code.body.code, /^[A-Za-z0-9_-]{16}$/);
    assert.ok(code.body.expiresAt > Date.now());
    assert.equal((await raw(`${srv.url}/api/extension/pair`)).status, 405);
    const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const installationId = 'abcdefghijklmnopqrstuvwx';
    const foreign = await raw(`${srv.url}/api/extension/pair`, { method: 'POST', headers: { Origin: 'https://evil.example', 'X-Agentree-Pair-Code': code.body.code } });
    assert.equal(foreign.status, 403);
    const bad = await raw(`${srv.url}/api/extension/pair`, { method: 'POST', headers: { Origin: origin, 'X-Agentree-Pair-Code': 'A'.repeat(16) } });
    assert.equal(bad.status, 401);
    const paired = await raw(`${srv.url}/api/extension/pair`, { method: 'POST', headers: { Origin: origin, 'X-Agentree-Pair-Code': code.body.code, 'X-Agentree-Installation-Id': installationId } });
    assert.equal(paired.status, 200);
    const extensionToken = JSON.parse(paired.body).token;
    assert.notEqual(extensionToken, token, 'rozšíření nikdy nedostane sdílený ingest token');
    const r = await a.send('POST', '/api/ingest/web', {
      site: 'perplexity',
      conversationId: 'trh-ai-2026',
      url: 'https://www.perplexity.ai/search/trh-ai-2026',
      title: 'Trh AI',
      generating: true,
      messages: [{ role: 'user', text: 'Jak velký je trh?' }],
    }, { Origin: origin, 'X-Agentree-Token': extensionToken });
    assert.equal(r.status, 200);
    assert.equal((await a.send('POST', '/api/ingest/web', { site: 'perplexity' }, { Origin: origin, 'X-Agentree-Token': token })).status, 401);
    const st = await a.get('/api/state');
    const s = st.body.sessions.find((x) => x.id === 'web:perplexity:trh-ai-2026');
    assert.equal(s.status, 'working');
    assert.equal(s.app, 'Perplexity');
    assert.equal(st.body.integrations.extension.token, undefined);
    const launch = await a.send('POST', '/api/launch', { agent: 'gemini', mode: 'web', prompt: 'Oprav Gemini předání' });
    assert.equal(launch.status, 200);
    assert.equal(launch.body.browserHandoff.site, 'gemini');
    assert.ok(!JSON.stringify(launch.body).includes('Oprav Gemini předání'), 'zadání se do odpovědi API nevrací');
    const handoffPath = `/api/extension/handoff?site=gemini&id=${launch.body.browserHandoff.id}`;
    const foreignHandoff = await raw(`${srv.url}${handoffPath}`, { headers: { Origin: 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba', 'X-Agentree-Token': extensionToken } });
    assert.equal(foreignHandoff.status, 401);
    const handoff = await raw(`${srv.url}${handoffPath}`, { headers: { Origin: origin, 'X-Agentree-Token': extensionToken } });
    assert.equal(handoff.status, 200);
    assert.equal(JSON.parse(handoff.body).handoff.prompt, 'Oprav Gemini předání');
    const consumed = await raw(`${srv.url}${handoffPath}`, { headers: { Origin: origin, 'X-Agentree-Token': extensionToken } });
    assert.equal(JSON.parse(consumed.body).handoff, null, 'prompt lze vyzvednout jen jednou');
    const replay = await raw(`${srv.url}/api/extension/pair`, { method: 'POST', headers: { Origin: origin, 'X-Agentree-Pair-Code': code.body.code, 'X-Agentree-Installation-Id': installationId } });
    assert.equal(replay.status, 401);
  });

  await t.test('zapnutí Claude hooků přes API zapíše správný port', async () => {
    const r = await a.send('POST', '/api/integrations/claude-hooks/install');
    assert.equal(r.status, 200);
    assert.equal(r.body.claudeHooks.installed, true);
    const json = JSON.parse(await fs.readFile(path.join(srcHome, '.claude', 'settings.json'), 'utf8'));
    const port = new URL(srv.url).port;
    assert.ok(json.hooks.Notification[0].hooks[0].command.includes(`127.0.0.1:${port}/api/hooks/claude-code`));
    const off = await a.send('POST', '/api/integrations/claude-hooks/uninstall');
    assert.equal(off.body.claudeHooks.installed, false);
  });

  await t.test('nastavení, statické soubory a ochrana cest', async () => {
    const s = await a.send('PUT', '/api/settings', { notifications: { done: false, doneMinSeconds: 300 } });
    assert.equal(s.body.settings.notifications.done, false);
    assert.equal((await a.send('PUT', '/api/settings', { notifications: { doneMinSeconds: -1 } })).status, 422);
    const index = await fetch(`${srv.url}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Agentree/);
    const trav = await raw(`${srv.url}/..%2f..%2fpackage.json`);
    assert.ok([403, 404].includes(trav.status), `stav ${trav.status}`);
    assert.equal((await fetch(`${srv.url}/api/neexistuje`)).status, 404);
    assert.equal((await fetch(`${srv.url}/js/app.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  });
});
