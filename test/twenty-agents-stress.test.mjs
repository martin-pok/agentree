import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { remoteScope } from '../src/remote-scope.js';

// Synthetic load, not a claim of QA on a real Mac or external provider.
test('20 simultaneous CLI agents remain distinct and emit live updates', () => {
  const now = Date.now();
  const store = new Store({ config: { windowDays: 7 }, datastore: {} });
  store.ready = true;
  const changed = new Set();
  store.on('session', (value) => changed.add(value.id));
  for (let i = 0; i < 20; i++) {
    const s = store.ensure({ connector: i % 2 ? 'claude-code' : 'codex', localId: 'load-' + i, provider: i % 2 ? 'anthropic' : 'openai', app: i % 2 ? 'Claude Code' : 'Codex' });
    s.startedAt = now - 2000;
    s.lastAt = now;
    s.runningAt = now;
    s.running = true;
    s.staleMs = 30_000;
    store.commit(s, now);
  }
  const ids = store.list(now).map(s => s.id);
  assert.equal(ids.length, 20);
  assert.equal(new Set(ids).size, 20, 'no session identity collision');
  assert.equal(changed.size, 20, 'all twenty events must reach the SSE publisher');
  assert.equal(store.list(now).filter(s => s.status === 'working').length, 20);
  store.reevaluate(now + 31_000);
  assert.equal(store.list(now + 31_000).filter(s => s.status === 'working').length, 0,
    'expired activity cannot remain falsely active');
});

test('paired mobile does not gain remote agent execution permissions', () => {
  for (const path of ['/api/launch', '/api/agents/run', '/api/runs', '/api/skills/install']) {
    assert.equal(remoteScope('POST', path).ok, false, path);
  }
  assert.equal(remoteScope('GET', '/api/state').ok, true);
});
