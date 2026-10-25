import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, api, pairExtension, EXTENSION_ORIGIN } from './helpers.mjs';

// Klik na agenta v okně rozšíření vede rovnou do konverzace, ne do Agenteeq: webový chat vrátí
// adresu pro Chrome, ostatní se otevřou hlavní akcí (v testu suchý běh, AGENTEEQ_OPEN=dry).
async function fixture(t) {
  const server = await startTestServer({ AGENTEEQ_DESKTOP: '1' });
  t.after(() => server.close());
  const messages = [];
  server.app.nastavDesktop((m) => messages.push(m));
  const now = Date.now();
  const pridej = (o) => { const s = server.app.store.ensure(o.zaklad); Object.assign(s, { running: true, runningAt: now, lastAt: now, staleMs: 30_000, title: 'Agent' }, o.pole); server.app.store.commit(s, now); return s; };
  const web = pridej({ zaklad: { connector: 'web', localId: 'chatgpt:abc', provider: 'openai', app: 'ChatGPT', source: 'web' }, pole: { url: 'https://chatgpt.com/c/abc' } });
  const cloud = pridej({ zaklad: { connector: 'claude-desktop-code', localId: 'session_01FixtureRemoteAgent123', provider: 'anthropic', app: 'Claude Desktop · vzdálený Code', source: 'desktop-cache' }, pole: { url: 'https://claude.ai/code/session_01FixtureRemoteAgent123' } });
  const proces = pridej({ zaklad: { connector: 'claude-code', localId: 'jen-proces', provider: 'anthropic', app: 'Claude Code' }, pole: {} });
  const paired = await pairExtension(server.url);
  const send = (id, h = {}) => api(server.url).send('POST', '/api/extension/open-agent', { id }, { Origin: EXTENSION_ORIGIN, 'X-Agenteeq-Token': paired.token, ...h });
  return { server, messages, web, cloud, proces, send };
}

test('rozšíření: vzdálený Claude bez ověřené karty ukáže detail, s kartou otevře přesný chat', async (t) => {
  const f = await fixture(t);
  const w = await f.send(f.web.id);
  assert.equal(w.status, 200);
  assert.equal(w.body.url, 'https://chatgpt.com/c/abc');
  // Cache-only relace nesmí aktivovat poslední cizí chat v Claude ani odhadnutý odkaz.
  const c = await f.send(f.cloud.id);
  assert.equal(c.status, 200);
  assert.equal(c.body.focused, true);
  assert.equal(f.messages.length, 1, 'otevře se detail agenta v Agenteeq');
  assert.equal(f.messages[0].route, `#/agent/${encodeURIComponent(f.cloud.id)}`);
  f.server.app.connectors.web.ingest({ site: 'claude-code-web', conversationId: 'session_01FixtureRemoteAgent123', url: 'https://claude.ai/code/session_01FixtureRemoteAgent123', generating: true, counts: { user: 1, assistant: 0 } });
  const verified = await f.send(f.cloud.id);
  assert.equal(verified.body.url, 'https://claude.ai/code/session_01FixtureRemoteAgent123');
  assert.equal(f.messages.length, 1, 'ověřený odkaz už nepřepne okno Agenteeq');
  assert.equal(f.server.app.runs.children.size, 0);
});

test('rozšíření: bez místa, kam konverzace vede, ukáže agenta v Agenteeq; cizí a neznámé odmítne', async (t) => {
  const f = await fixture(t);
  const r = await f.send(f.proces.id);
  assert.equal(r.status, 200);
  assert.ok(r.body.opened || r.body.focused);
  assert.equal((await f.send('claude-code:neexistuje')).status, 404);
  assert.equal((await f.send(f.web.id, { 'X-Agenteeq-Token': '' })).status, 401);
  assert.equal((await f.send(f.web.id, { Origin: 'https://evil.example' })).status, 401);
  assert.equal((await f.send(f.web.id, { 'X-Forwarded-For': '198.51.100.4' })).status, 403);
});
