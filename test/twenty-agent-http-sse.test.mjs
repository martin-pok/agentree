import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, openStream, waitFor, api } from './helpers.mjs';

// End-to-end localhost server + real SSE transport, no external model,
// network, user files, paid integrations, credentials or process inspection.
test('20 concurrent agents reach SSE and HTTP snapshot, then reconnect without ghosts', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const first = await openStream(srv.url);
  t.after(() => first.close());
  await waitFor(() => first.events.some(e => e.event === 'hello'), 3000);

  const now = Date.now();
  const start = Date.now();
  const ids = [];
  for (let i = 0; i < 20; i++) {
    const connector = i % 2 ? 'claude-code' : 'codex';
    const localId = 'sse-load-' + i;
    const session = srv.app.store.ensure({
      connector, localId,
      provider: i % 2 ? 'anthropic' : 'openai',
      app: i % 2 ? 'Claude Code' : 'Codex',
    });
    session.startedAt = now - 2000;
    session.lastAt = now;
    session.runningAt = now;
    session.running = true;
    session.staleMs = 30000;
    srv.app.store.commit(session, now);
    ids.push(session.id);
  }
  const received = await waitFor(() => {
    const matches = first.events.filter(e => e.event === 'session' && ids.includes(e.data.id) && e.data.status === 'working');
    return new Set(matches.map(e => e.data.id)).size === 20 ? matches : null;
  }, 3000);
  assert.equal(new Set(received.map(x => x.data.id)).size, 20);
  assert.ok(Date.now() - start < 2000, 'twenty local SSE updates should arrive within the real-time target');

  const snap = (await api(srv.url).get('/api/state')).body;
  const selected = snap.sessions.filter(s => ids.includes(s.id));
  assert.equal(selected.length, 20, 'full snapshot contains each distinct agent once');
  assert.ok(selected.every(s => s.status === 'working'));

  // The closing stream must never be mistaken for proof of a session removal.
  const remove = ids[8];
  srv.app.store.remove(remove);
  await waitFor(() => first.events.some(e => e.event === 'session:remove' && e.data.id === remove), 3000);
  first.close();

  const second = await openStream(srv.url);
  t.after(() => second.close());
  await waitFor(() => second.events.some(e => e.event === 'hello'), 3000);
  const restored = (await api(srv.url).get('/api/state')).body.sessions.filter(s => ids.includes(s.id));
  assert.equal(restored.length, 19, 'new snapshot does not resurrect removed agent');
  assert.equal(restored.some(s => s.id === remove), false);
  const seenIds = new Set(restored.map(s => s.id));
  assert.equal(seenIds.size, 19, 'reconnection retains unique identities');
  assert.ok(restored.every(s => s.status === 'working'));
});
