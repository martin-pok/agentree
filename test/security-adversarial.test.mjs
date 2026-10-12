import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteScope, JEN_NA_HOSTITELI_UDALOSTI } from '../src/remote-scope.js';
import { claudeIdentity, normalizeCodexAccount, observeAccount, normalizeObservedAccounts } from '../src/provider-accounts.js';

// Security invariants: remote devices must never gain arbitrary local execution,
// credential file access, transcript access or administrative mutations.
test('remote paired phone cannot mutate host or execute tools', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const url of ['/api/launch', '/api/runs', '/api/settings', '/api/integrations/claude-hooks/install',
      '/api/fs/write', '/api/skills/import', '/api/extension/pair-code', '/api/spend/budgets']) {
      assert.equal(remoteScope(method, url).ok, false, method + ' ' + url);
    }
  }
});
test('paired phone cannot directly fetch private transcripts or execution logs', () => {
  for (const route of ['/api/fs/root', '/api/sessions/claude%3Aabc/transcript',
    '/api/runs/abc/log']) {
    assert.equal(remoteScope('GET', route).ok, false, route);
  }
  assert.equal(JEN_NA_HOSTITELI_UDALOSTI.has('transcript'), true);
});
test('provider account normalization rejects missing identities and malformed quotas', () => {
  assert.equal(claudeIdentity({}), null);
  assert.equal(normalizeCodexAccount({ rateLimits: { planType: 'pro' } }), null);
  const at = Date.now();
  const account = normalizeCodexAccount({
    accountId: 'account-test-1234567',
    rateLimitsByLimitId: {
      broken: { primary: { usedPercent: -1 }, secondary: { usedPercent: 101 } },
      valid: { primary: { usedPercent: 75, windowDurationMins: 300, resetsAt: Math.floor((at + 1800000) / 1000) } },
    },
    rateLimits: { credits: { balance: 'Infinity' }, planType: 'plus' },
    email: 'secret@example.com', token: 'super-secret-token',
  }, at);
  assert.ok(account);
  assert.equal(account.limits.length, 1);
  assert.equal(account.limits[0].primary.usedPercent, 75);
  assert.equal(account.credits, null);
  assert.doesNotMatch(JSON.stringify(account), /secret@example.com|super-secret-token|account-test-1234567/);
});
test('account history neither merges two IDs nor accepts forged arbitrary keys', () => {
  const a = claudeIdentity({ accountUuid: 'alpha-credential-1234' });
  const b = claudeIdentity({ accountUuid: 'bravo-credential-1234' });
  assert.notEqual(a, b);
  const history = observeAccount(observeAccount([], { id: a, provider: 'anthropic', service: 'claude', observedAt: 1 }),
    { id: b, provider: 'anthropic', service: 'claude', observedAt: 2 });
  assert.equal(history.length, 2);
  assert.deepEqual(normalizeObservedAccounts([{ id: '__proto__', provider: 'anthropic', seenAt: 4 }]), []);
});
