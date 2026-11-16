// Ke kterému účtu agent patří (public/js/ui.js#ucetAgenta): jen ověřená vazba a jen když jsou
// aktivní aspoň dva účty téhož nástroje. Nic se neodhaduje.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ucetAgenta } from '../public/js/ui.js';

const A = 'claude:11111111-aaaa-4aaa-8aaa-111111111111';
const B = 'claude:22222222-bbbb-4bbb-8bbb-22222222abcd';
const ucet = (id, planLabel, active = true) => ({ id, provider: 'anthropic', service: 'claude', active, planLabel });
const agent = (accountId, confidence = 'verified') => ({ id: 'claude-code:x', accountBinding: accountId ? { accountId, confidence } : null });

test('dva aktivní účty Claude: agent ukáže svůj účet a plán', () => {
  const sp = { providerAccounts: [ucet(A, 'Max 5×'), ucet(B, 'Pro')] };
  assert.deepEqual(ucetAgenta(agent(B), sp), { id: B, tag: 'účet abcd', plan: 'Pro', aktivni: true });
});

test('jeden účet, neověřená vazba nebo žádná vazba: žádný štítek', () => {
  assert.equal(ucetAgenta(agent(A), { providerAccounts: [ucet(A, 'Pro')] }), null, 'jeden účet nic nerozlišuje');
  assert.equal(ucetAgenta(agent(A), { providerAccounts: [ucet(A, 'Pro'), ucet(B, 'Pro', false)] }), null, 'neaktivní účet se nepočítá');
  const sp = { providerAccounts: [ucet(A, 'Max 5×'), ucet(B, 'Pro')] };
  assert.equal(ucetAgenta(agent(A, 'unresolved'), sp), null);
  assert.equal(ucetAgenta(agent(null), sp), null);
  assert.equal(ucetAgenta(agent(A), null), null);
});

test('účet agenta, který teď není mezi aktivními, se ukáže bez vymyšleného plánu', () => {
  const C = 'claude:33333333-cccc-4ccc-8ccc-333333333333';
  const r = ucetAgenta(agent(C), { providerAccounts: [ucet(A, 'Max 5×'), ucet(B, 'Pro')] });
  assert.equal(r.plan, '');
  assert.equal(r.aktivni, false);
});

test('účet Codexu se nemíchá s účty Claude', () => {
  const sp = { providerAccounts: [ucet(A, 'Max 5×'), ucet(B, 'Pro')] };
  assert.equal(ucetAgenta(agent('codex:acct-1'), sp), null);
});
