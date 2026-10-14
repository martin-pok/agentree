import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { startTestServer, api, pairExtension, EXTENSION_ORIGIN } from './helpers.mjs';

async function fixture(t, { native = true } = {}) {
  const server = await startTestServer({ AGENTEEQ_DESKTOP: native ? '1' : '0' });
  t.after(() => server.close());
  const messages = [];
  if (native) server.app.nastavDesktop((message) => messages.push(message));
  const s = server.app.store.ensure({ connector: 'claude-code', localId: 'focus-existing', provider: 'anthropic', app: 'Claude Code' });
  const now = Date.now();
  s.running = true; s.runningAt = now; s.lastAt = now; s.staleMs = 30_000; s.title = 'Real running agent';
  server.app.store.commit(s, now);
  const paired = await pairExtension(server.url);
  assert.equal(paired.status, 200);
  const send = (id, overrides = {}) => api(server.url).send('POST', '/api/extension/focus-agent', { id },
    { Origin: EXTENSION_ORIGIN, 'X-Agenteeq-Token': paired.token, ...overrides });
  return { server, messages, s, paired, send };
}

test('extension focuses only a visible existing agent in the already running native window', async (t) => {
  const f = await fixture(t);
  const before = f.server.app.store.list().map(s => s.id);
  assert.equal(before.includes(f.s.id), true, 'fixture agent must be visible');
  const first = await f.send(f.s.id);
  assert.equal(first.status, 200);
  assert.equal(first.body.focused, true);
  assert.deepEqual(f.messages, [{ type: 'focus-agent', route: '#/agent/' + encodeURIComponent(f.s.id) }]);
  const second = await f.send(f.s.id);
  assert.equal(second.status, 200);
  assert.equal(f.messages.length, 2, 'repeated user clicks focus the same window, do not spawn agents');
  assert.deepEqual(f.server.app.store.list().map(s => s.id), before, 'navigation never starts a second agent');
  assert.equal(f.server.app.runs.children.size, 0, 'native focus never launches a CLI process');
  assert.doesNotMatch(JSON.stringify(first.body), /token|transcript|localKey|cwd|prompt/i);
});

test('extension focus is strictly local, paired and origin bound; forged identities cannot focus', async (t) => {
  const f = await fixture(t);
  const valid = { Origin: EXTENSION_ORIGIN, 'X-Agenteeq-Token': f.paired.token };
  const run = (headers, id = f.s.id) => api(f.server.url).send('POST', '/api/extension/focus-agent', { id }, headers);
  assert.equal((await run({ Origin: EXTENSION_ORIGIN })).status, 401, 'missing extension token');
  assert.equal((await run({ ...valid, 'X-Agenteeq-Token': 'invalid' })).status, 401);
  assert.equal((await run({ ...valid, Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).status, 401, 'wrong paired extension origin');
  assert.equal((await run({ ...valid, Origin: 'https://evil.example' })).status, 401, 'web origin');
  assert.equal((await run({ ...valid, 'X-Forwarded-For': '198.51.100.3' })).status, 403, 'proxy request is not local Mac');
  // Node's fetch normalizes/overrides Host. Send a real raw HTTP request to
  // exercise the malicious Host header at the transport boundary.
  const spoofedHost = await new Promise((resolve, reject) => {
    const req = http.request(f.server.url + '/api/extension/focus-agent', {
      method: 'POST',
      headers: { ...valid, Host: 'attacker.example', 'Content-Type': 'application/json' },
    }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end(JSON.stringify({ id: f.s.id }));
  });
  assert.equal(spoofedHost, 403, 'a forged HTTP Host cannot impersonate the Mac');
  assert.equal(f.messages.length, 0);
});

test('extension focus rejects missing, archived, stale or malformed agent IDs without opening a window', async (t) => {
  const f = await fixture(t);
  for (const id of [null, {}, 42, '', 'not-a-real-agent', '/../', f.s.id + '/../../nastaveni', 'z'.repeat(201)]) {
    const res = await f.send(id);
    assert.ok([404, 422].includes(res.status), 'unexpected status ' + res.status + ' for ' + String(id));
  }
  // Archived status is derived from activity timestamps, not set by a
  // caller-provided boolean. Remove the actual session from the current store.
  f.server.app.store.remove(f.s.id);
  assert.equal((await f.send(f.s.id)).status, 404);
  assert.equal(f.messages.length, 0);
});

test('extension click never exposes a browser-readable native key or general API access', async (t) => {
  const f = await fixture(t);
  f.server.app.config.localKey = 'a'.repeat(48);
  assert.equal((await f.send(f.s.id)).status, 200, 'token-scoped route bypasses only window-key gate for focus');
  const response = await api(f.server.url).get('/api/state');
  assert.equal(response.status, 403, 'Chrome does not inherit authenticated WKWebView access');
  const res = await api(f.server.url).send('POST', '/api/launch', { agent: 'claude-code' },
    { Origin: EXTENSION_ORIGIN, 'X-Agenteeq-Token': f.paired.token });
  assert.equal(res.status, 403, 'extension token cannot authorize generic native actions');
  assert.ok(f.messages[0].route.startsWith('#/agent/'));
});

test('headless/Windows shell does not pretend to focus the unavailable macOS WKWebView', async (t) => {
  const f = await fixture(t, { native: false });
  const response = await f.send(f.s.id);
  assert.equal(response.status, 409);
  assert.equal(f.messages.length, 0);
});

test('native focus route code does not execute shell or accept arbitrary browser URLs', async () => {
  const swift = await fs.readFile(new URL('../desktop/Agenteeq.swift', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const http = await fs.readFile(new URL('../src/http.js', import.meta.url), 'utf8');
  assert.match(swift, /if type == "focus-agent"/);
  assert.match(swift, /route\.hasPrefix\("#\/agent\/"\)/);
  assert.match(swift, /pendingAgentRoute = route[\s\S]*?showWindow\(\)/);
  assert.match(swift, /web\.evaluateJavaScript\("location\.hash=\\\(json\)\[0\]"\)/);
  assert.match(app, /desktopReport\(\{ type: 'focus-agent', route:/);
  assert.match(http, /if \(!zTohotoMacu\(req\)\) throw new HttpError\(403/);
  assert.match(http, /if \(!extensionOk\(req\)\) throw new HttpError\(401/);
});

test('extension focuses a recent conversation it shows in nedavne, never an archived one', async (t) => {
  const f = await fixture(t);
  const now = Date.now();
  const recent = f.server.app.store.ensure({ connector: 'codex', localId: 'focus-recent', provider: 'openai', app: 'Codex' });
  recent.title = 'Recent finished conversation'; recent.lastAt = now - 60_000; recent.turns = 1;
  f.server.app.store.commit(recent, now);
  const old = f.server.app.store.ensure({ connector: 'codex', localId: 'focus-old', provider: 'openai', app: 'Codex' });
  old.title = 'Old conversation'; old.lastAt = now - 3 * 86_400_000;
  f.server.app.store.commit(old, now);
  const prehled = await api(f.server.url).send('POST', '/api/extension/prehled', {}, { Origin: EXTENSION_ORIGIN, 'X-Agenteeq-Token': f.paired.token });
  assert.equal(prehled.status, 200);
  const ids = prehled.body.nedavne.map((x) => x.id);
  assert.ok(ids.includes(recent.id), 'recent conversation is offered');
  assert.ok(!ids.includes(old.id), 'archived conversation is not offered');
  assert.equal((await f.send(recent.id)).status, 200);
  assert.equal((await f.send(old.id)).status, 404);
  assert.equal(f.messages.length, 1);
});
