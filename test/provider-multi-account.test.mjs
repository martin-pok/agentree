import test from 'node:test';
import assert from 'node:assert/strict';
import { providerIdentity, sessionAccountBinding, groupAccountsByProvider,
  normalizeObservedAccounts, observeAccount } from '../src/provider-accounts.js';

test('universal account IDs distinguish same provider profiles and vendors', () => {
  const a = providerIdentity('google', 'user-A-123456');
  const b = providerIdentity('google', 'user-B-123456');
  const c = providerIdentity('openrouter', 'user-A-123456');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.equal(providerIdentity('INVALID PROVIDER', 'user-A-123456'), null);
  assert.equal(providerIdentity('google', 'short'), null);
});

test('two or more licenses on any provider preserve isolation and account history', () => {
  const a = providerIdentity('google', 'first-identity');
  const b = providerIdentity('google', 'second-identity');
  const c = providerIdentity('openrouter', 'third-identity');
  let history = [];
  for (const [id, provider] of [[a, 'google'], [b, 'google'], [c, 'openrouter']]) {
    history = observeAccount(history, { id, provider, plan: 'pro', observedAt: 1000 });
  }
  assert.equal(history.length, 3);
  const grouped = groupAccountsByProvider(history);
  assert.equal(grouped.get('google').length, 2);
  assert.equal(grouped.get('openrouter').length, 1);
  assert.equal(grouped.has('claude'), false);
  assert.equal(normalizeObservedAccounts([...history, { id: a, provider: 'openrouter', seenAt: 1001 }]).length, 3);
});

test('session-to-account binding fails closed on absent or mismatched provenance', () => {
  const a = providerIdentity('google', 'first-identity');
  const yes = sessionAccountBinding({ sessionId: 'gemini:s1', accountId: a, provider: 'google',
    source: 'same-process-config', observedAt: 1000, verified: true });
  assert.equal(yes.confidence, 'verified');
  assert.equal(yes.accountId, a);
  for (const change of [
    { verified: false }, { provider: 'anthropic' }, { source: '' },
    { observedAt: Infinity }, { accountId: '__proto__' },
  ]) {
    const r = sessionAccountBinding({ sessionId: 'gemini:s1', accountId: a,
      provider: 'google', source: 'same-process-config', observedAt: 1000, verified: true, ...change });
    assert.equal(r.accountId, null);
    assert.equal(r.confidence, 'unresolved');
  }
  assert.equal(sessionAccountBinding({ sessionId: '../escape', provider: 'google', accountId: a }), null);
});

test('legacy Claude and Codex account IDs still resolve to canonical providers', () => {
  for (const [provider, namespace] of [['anthropic','claude'], ['openai','codex']]) {
    const id = providerIdentity(namespace, 'account-stable-123456');
    const r = sessionAccountBinding({ sessionId: 'agent:s1', accountId: id, provider,
      source: 'verified-cli', observedAt: 1000, verified: true });
    assert.equal(r.accountId, id);
  }
});
