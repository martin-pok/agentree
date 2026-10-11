import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { providerIdentity } from '../src/provider-accounts.js';

test('verified account identity is visible in live session summary and never silently switches', () => {
  const store = new Store({ config: { windowDays: 7 }, datastore: {} });
  store.ready = true;
  const events = [];
  store.on('session', (value) => events.push(value));
  const session = store.ensure({ connector: 'gemini', localId: '123', provider: 'google', app: 'Gemini' });
  session.lastAt = Date.now();
  store.commit(session);
  assert.equal(store.summary(session.id).accountBinding, null);
  const first = providerIdentity('google', 'verified-account-one');
  const second = providerIdentity('google', 'verified-account-two');
  const at = Date.now();
  assert.equal(store.bindAccount(session.id, { accountId: first, source: 'same-process-config', observedAt: at, verified: true }).ok, true);
  assert.equal(store.summary(session.id).accountBinding.accountId, first);
  assert.equal(store.bindAccount(session.id, { accountId: second, source: 'different-profile', observedAt: at + 1, verified: true }).reason, 'identity_conflict');
  assert.equal(store.bindAccount(session.id, { accountId: first, source: 'same-process-config', observedAt: at - 1, verified: true }).reason, 'stale_evidence');
  assert.equal(store.bindAccount(session.id, { accountId: first, source: 'user-guess', observedAt: at + 2, verified: false }).reason, 'unverified_identity');
  assert.equal(store.summary(session.id).accountBinding.accountId, first);
  assert.ok(events.some(e => e.accountBinding?.accountId === first));
});
test('unknown and mismatched vendor accounts are never attached to an agent', () => {
  const store = new Store({ config: { windowDays: 7 }, datastore: {} });
  const session = store.ensure({ connector: 'gemini', localId: 'case', provider: 'google', app: 'Gemini' });
  session.lastAt = Date.now(); store.commit(session);
  assert.equal(store.bindAccount(session.id, { accountId: providerIdentity('openrouter','some-account-123'),
    source: 'observed', observedAt: Date.now(), verified: true }).ok, false);
  assert.equal(store.bindAccount(session.id, { accountId: null, verified: true }).ok, false);
  assert.equal(store.summary(session.id).accountBinding, null);
});
