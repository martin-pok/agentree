import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, tempDir } from './helpers.mjs';
import { parseCnb, applyLiveRates, createRateFeed } from '../src/rates.js';
import { claudePlanFromAccount, chatgptPlanFromLimits, describePlan, subscriptionEntries } from '../src/subscriptions.js';
import { spendSummary, DEFAULT_SPEND } from '../src/spend.js';
import { normalizeData } from '../src/datastore.js';

const CNB = `18.09.2026 #181
země|měna|množství|kód|kurz
Austrálie|dolar|1|AUD|15,113
EMU|euro|1|EUR|24,380
Japonsko|jen|100|JPY|14,900
USA|dolar|1|USD|21,345
`;

test('kurzovní lístek ČNB se přečte včetně desetinné čárky a data', () => {
  assert.deepEqual(parseCnb(CNB), { date: '2026-09-18', EUR: 24.38, USD: 21.345 });
});

test('pokažený nebo neúplný lístek se odmítne místo hádání', () => {
  assert.equal(parseCnb('<html>Přihlaste se</html>'), null);
  assert.equal(parseCnb('18.09.2026 #1\nhlavička\nUSA|dolar|1|USD|0,5\nEMU|euro|1|EUR|24'), null, 'nesmyslný kurz');
  assert.equal(parseCnb('18.09.2026 #1\nhlavička\nUSA|dolar|1|USD|21,3'), null, 'chybí EUR');
  assert.equal(parseCnb('x'.repeat(30000)), null);
});

test('živý kurz přepíše výchozí, ale nikdy ruční', () => {
  const sp = { rates: { CZK: 1, USD: 23, EUR: 25 }, ratesSource: 'default' };
  applyLiveRates(sp, { date: '2026-09-18', USD: 21.3, EUR: 24.4 });
  assert.equal(sp.rates.USD, 21.3);
  assert.equal(sp.ratesSource, 'cnb');
  sp.ratesSource = 'manual';
  sp.rates.USD = 22;
  applyLiveRates(sp, { date: '2026-09-19', USD: 21.0, EUR: 24.0 });
  assert.equal(sp.rates.USD, 22, 'uživatelův kurz zůstane');
  assert.equal(sp.liveRates.USD, 21.0, 'ale poslední známý kurz ČNB se eviduje');
});

test('podávač kurzů bez internetu nic nerozbije a nic nepřepíše', async () => {
  const sp = { rates: { CZK: 1, USD: 23, EUR: 25 }, ratesSource: 'default' };
  const feed = createRateFeed({ spend: () => sp, save() {}, changed() {}, fetchFn: async () => { throw new Error('offline'); } });
  assert.equal(await feed.refresh(), false);
  assert.equal(sp.rates.USD, 23);
  const off = createRateFeed({ spend: () => sp, save() {}, changed() {}, enabled: false, fetchFn: async () => { throw new Error('nemá se volat'); } });
  assert.equal(await off.refresh(), false);
  const ok = createRateFeed({ spend: () => sp, save() {}, changed() {}, fetchFn: async () => ({ ok: true, text: async () => CNB }) });
  assert.equal(await ok.refresh(), true);
  assert.equal(sp.rates.USD, 21.345);
});

test('typ účtu Claude se pozná z účtu a nic osobního se nepřenese', () => {
  const pro = claudePlanFromAccount({ organizationType: 'claude_pro', organizationRateLimitTier: 'default_claude_ai', emailAddress: 'a@b.cz', fullName: 'Jan Novák', subscriptionCreatedAt: '2026-01-15T10:00:00Z' }, Date.parse('2026-09-20'));
  assert.equal(pro.plan, 'pro');
  assert.equal(pro.since, '2026-01-15');
  assert.doesNotMatch(JSON.stringify(pro), /a@b\.cz|Novák/);
  assert.equal(claudePlanFromAccount({ organizationType: 'claude_max', userRateLimitTier: 'default_claude_max_5x' }).plan, 'max5x');
  assert.equal(claudePlanFromAccount({ organizationType: 'claude_max', userRateLimitTier: 'default_claude_max_20x' }).plan, 'max20x');
  assert.equal(claudePlanFromAccount({ organizationType: 'claude_max' }).plan, 'max', 'bez úrovně se cena neuhodne');
  assert.equal(claudePlanFromAccount({ organizationType: 'něco_nového' }), null, 'neznámý typ se netvrdí');
  assert.equal(claudePlanFromAccount(null), null);
});

test('plán ChatGPT se bere z limitů Codexu a Pro se cenově nerozliší', () => {
  const found = chatgptPlanFromLimits([{ provider: 'openai', plan: 'plus', at: 1 }, { provider: 'anthropic', plan: 'x', at: 9 }]);
  assert.equal(found.plan, 'plus');
  assert.equal(chatgptPlanFromLimits([]), null);
  const pro = describePlan({ service: 'chatgpt', plan: 'pro', evidence: 'x' });
  assert.equal(pro.usd, null);
  assert.deepEqual(pro.options, [100, 200]);
  assert.equal(pro.counted, false, 'nejednoznačná cena se do útraty nepočítá');
  const plus = describePlan({ service: 'chatgpt', plan: 'plus', evidence: 'x' });
  assert.equal(plus.usd, 20);
  assert.equal(plus.counted, true);
});

test('ručně zapsané předplatné nahradí zjištěné, ne aby se počítalo dvakrát', () => {
  const now = Date.parse('2026-09-20');
  const ledger = [{ service: 'claude', kind: 'subscription', recurring: 'monthly', date: '2026-03-01', endDate: null }];
  const p = describePlan({ service: 'claude', plan: 'pro', evidence: 'x' }, ledger, now);
  assert.equal(p.covered, true);
  assert.equal(p.counted, false);
  assert.deepEqual(subscriptionEntries([p], now), []);
  const ended = describePlan({ service: 'claude', plan: 'pro', evidence: 'x' }, [{ ...ledger[0], endDate: '2026-06-30' }], now);
  assert.equal(ended.covered, false, 'ukončený zápis už nekryje');
});

test('zjištěné předplatné jde do měsíčního součtu i předpovědi v korunách', () => {
  const now = Date.parse('2026-09-20T12:00:00');
  const p = describePlan({ service: 'claude', plan: 'pro', since: '2026-08-05', evidence: 'x' }, [], now);
  const entries = subscriptionEntries([p], now);
  const s = spendSummary({ ...DEFAULT_SPEND, ledger: [], rates: { CZK: 1, USD: 21, EUR: 24 } }, now, entries);
  assert.equal(s.month.total, 420);
  assert.equal(s.recurring, 420);
  assert.equal(s.forecast, 420);
  assert.equal(s.months.find((m) => m.key === '2026-08').total, 420);
  assert.equal(s.months.find((m) => m.key === '2026-07').total, 0, 'před začátkem předplatného se nic nepočítá');
});

test('starý soubor s vlastním kurzem se pozná jako ruční, nový jako výchozí', () => {
  assert.equal(normalizeData({ spend: { rates: { USD: 22.5 } } }).spend.ratesSource, 'manual');
  assert.equal(normalizeData({ spend: {} }).spend.ratesSource, 'default');
  assert.equal(normalizeData({ spend: { ratesSource: 'cnb', liveRates: { date: '2026-09-18', USD: 21, EUR: 24 } } }).spend.liveRates.USD, 21);
  assert.equal(normalizeData({ spend: { liveRates: { date: 'zítra', USD: 21, EUR: 24 } } }).spend.liveRates, null);
});

test('aplikace s účtem Claude Pro ukáže předplatné a započítá ho', async () => {
  const src = await tempDir('agenteeq-src-');
  await fs.writeFile(path.join(src, '.claude.json'), JSON.stringify({ oauthAccount: { organizationType: 'claude_pro', emailAddress: 'tajne@example.com', subscriptionCreatedAt: '2026-01-10T00:00:00Z' } }));
  const t = await startTestServer({ AGENTEEQ_SOURCE_HOME: src });
  try {
    await t.app.refreshSubscriptions();
    const sp = t.app.spendPayload();
    const claude = sp.subscriptions.find((x) => x.service === 'claude');
    assert.equal(claude.plan, 'pro');
    assert.equal(claude.usd, 20);
    assert.equal(claude.counted, true);
    assert.ok(sp.month.total > 0);
    assert.doesNotMatch(JSON.stringify(sp), /tajne@example\.com/);
    assert.equal(sp.rateInfo.source, 'default');
  } finally {
    await t.close();
  }
});
