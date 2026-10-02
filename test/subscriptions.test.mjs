import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, tempDir } from './helpers.mjs';
import { parseCnb, applyLiveRates, createRateFeed } from '../src/rates.js';
import { claudePlanFromAccount, chatgptPlanFromLimits, describePlan, subscriptionPortfolio } from '../src/subscriptions.js';
import { spendSummary, DEFAULT_SPEND, validateEntry } from '../src/spend.js';
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

test('plán ChatGPT se bere přesně z nejnovějšího limitu Codexu bez domnělé ceny', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  const found = chatgptPlanFromLimits([{ provider: 'openai', plan: 'plus', at: now - 1 }, { provider: 'anthropic', plan: 'x', at: now }], now);
  assert.equal(found.plan, 'plus');
  assert.equal(found.observedAt, now - 1);
  assert.equal(chatgptPlanFromLimits([]), null);
  assert.equal(chatgptPlanFromLimits([{ provider: 'openai', plan: 'plus', at: now - 24 * 60 * 60 * 1000 - 1 }], now), null, 'staré pozorování se nevydává za aktuální plán');
  assert.equal(chatgptPlanFromLimits([{ provider: 'openai', plan: 'plus', at: now + 60_001 }], now), null, 'čas z budoucnosti se odmítne');
  const pro = describePlan({ service: 'chatgpt', plan: 'pro', evidence: 'x' });
  assert.equal(pro.label, 'ChatGPT Pro');
  assert.equal(pro.payment, null);
  const plus = describePlan({ service: 'chatgpt', plan: 'plus', evidence: 'x' });
  assert.equal(plus.label, 'ChatGPT Plus');
  assert.equal(plus.payment, null, 'veřejný ceník není skutečná platba uživatele');
});

test('rozpoznaný plán ukáže jen aktivní skutečnou platbu zapsanou uživatelem', () => {
  const now = Date.parse('2026-09-20');
  const ledger = [{ id: 'real', service: 'claude', kind: 'subscription', amount: 612.4, currency: 'CZK', recurring: 'monthly', date: '2026-03-01', endDate: null, account: 'Osobní', note: 'Claude Pro' }];
  const p = describePlan({ service: 'claude', plan: 'pro', evidence: 'x' }, ledger, now);
  assert.deepEqual(p.payment, { id: 'real', amount: 612.4, currency: 'CZK', date: '2026-03-01', recurring: 'monthly', account: 'Osobní', note: 'Claude Pro' });
  assert.equal(p.payments.length, 1);
  const ended = describePlan({ service: 'claude', plan: 'pro', evidence: 'x' }, [{ ...ledger[0], endDate: '2026-06-30' }], now);
  assert.equal(ended.payment, null, 'ukončený zápis už není aktuální platba');
});

test('portfolio oddělí více licencí od rozpoznaného účtu a zachová ručně evidovanou službu', () => {
  const now = Date.parse('2026-09-20');
  const ledger = [
    { id: 'c1', service: 'claude', kind: 'subscription', amount: 20, currency: 'USD', recurring: 'monthly', date: '2026-01-01', endDate: null, account: 'Osobní', note: '' },
    { id: 'c2', service: 'claude', kind: 'subscription', amount: 25, currency: 'USD', recurring: 'monthly', date: '2026-02-01', endDate: null, account: 'Studio', note: '' },
    { id: 'p1', service: 'perplexity', kind: 'subscription', amount: 20, currency: 'USD', recurring: 'monthly', date: '2026-03-01', endDate: null, account: 'Výzkum', note: '' },
    { id: 'old', service: 'claude', kind: 'subscription', amount: 10, currency: 'USD', recurring: 'monthly', date: '2026-01-01', endDate: '2026-08-31', account: 'Ukončená', note: '' },
  ];
  const plans = subscriptionPortfolio([{ service: 'claude', plan: 'pro', evidence: 'Claude Code' }], ledger, now);
  const claude = plans.find((p) => p.service === 'claude');
  assert.equal(claude.detected, true);
  assert.equal(claude.payments.length, 2);
  assert.equal(claude.payment, null, 'u více licencí se žádná nevydává za platbu rozpoznaného účtu');
  assert.deepEqual(claude.payments.map((p) => p.account), ['Osobní', 'Studio']);
  const perplexity = plans.find((p) => p.service === 'perplexity');
  assert.equal(perplexity.detected, false);
  assert.equal(perplexity.payments[0].account, 'Výzkum');
});

test('název licence se ukládá jen k předplatnému a je omezený', () => {
  const base = { service: 'claude', amount: 20, currency: 'USD', date: '2026-09-20', recurring: 'monthly', account: `  ${'x'.repeat(90)}  ` };
  const subscription = validateEntry({ ...base, kind: 'subscription' }, 1);
  assert.equal(subscription.value.account.length, 80);
  const extra = validateEntry({ ...base, kind: 'extra' }, 1);
  assert.equal(extra.value.account, '');
});

test('rozpoznaný plán bez billing dat nevytváří výdaj; ruční platba se počítá jednou', () => {
  const now = Date.parse('2026-09-20T12:00:00');
  const detected = describePlan({ service: 'claude', plan: 'pro', since: '2026-08-05', evidence: 'x' }, [], now);
  assert.equal(detected.payment, null);
  const empty = spendSummary({ ...DEFAULT_SPEND, ledger: [], rates: { CZK: 1, USD: 21, EUR: 24 } }, now, []);
  assert.equal(empty.month.total, 0);
  const ledger = [{ id: 'real', service: 'claude', kind: 'subscription', amount: 20, currency: 'USD', date: '2026-08-05', recurring: 'monthly', endDate: null }];
  const s = spendSummary({ ...DEFAULT_SPEND, ledger, rates: { CZK: 1, USD: 21, EUR: 24 } }, now, []);
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

test('aplikace s účtem Claude Pro ukáže přesný plán, ale nevymyslí jeho útratu', async () => {
  const src = await tempDir('agenteeq-src-');
  await fs.writeFile(path.join(src, '.claude.json'), JSON.stringify({ oauthAccount: { organizationType: 'claude_pro', emailAddress: 'tajne@example.com', subscriptionCreatedAt: '2026-01-10T00:00:00Z' } }));
  const t = await startTestServer({ AGENTEEQ_SOURCE_HOME: src }, {
    napojeniRun: async (_bin, args) => args[0] === 'auth'
      ? { ok: true, stdout: JSON.stringify({ loggedIn: true }), stderr: '' }
      : { ok: false, stdout: '', stderr: '' },
  });
  try {
    await t.app.refreshSubscriptions();
    const sp = t.app.spendPayload();
    const claude = sp.subscriptions.find((x) => x.service === 'claude');
    assert.equal(claude.plan, 'pro');
    assert.equal(claude.label, 'Claude Pro');
    assert.equal(claude.payment, null);
    assert.equal(sp.month.total, 0);
    assert.doesNotMatch(JSON.stringify(sp), /tajne@example\.com/);
    assert.equal(sp.rateInfo.source, 'default');
  } finally {
    await t.close();
  }
});

test('starý účtový soubor Claude se po odhlášení nevydává za aktivní plán', async () => {
  const src = await tempDir('agenteeq-sub-logout-');
  await fs.writeFile(path.join(src, '.claude.json'), JSON.stringify({ oauthAccount: { organizationType: 'claude_pro' } }));
  const t = await startTestServer({ AGENTEEQ_SOURCE_HOME: src }, {
    napojeniRun: async () => ({ ok: true, stdout: JSON.stringify({ loggedIn: false }), stderr: '' }),
  });
  try {
    const sp = t.app.spendPayload();
    assert.equal(sp.subscriptions.some((x) => x.service === 'claude'), false);
  } finally {
    await t.close();
  }
});

test('nový plán z limitů Codexu se propíše do Útraty okamžitě', async () => {
  const t = await startTestServer();
  try {
    let pushed = null;
    t.app.store.once('spend', (value) => { pushed = value; });
    const now = Date.now();
    t.app.store.setLimit({ id: 'openai:five_hour', provider: 'openai', app: 'Codex', kind: 'time', label: '5 h', plan: 'plus', at: now, resetsAt: now + 3600e3, usedPercent: 10 });
    assert.equal(pushed?.subscriptions.find((p) => p.service === 'chatgpt')?.plan, 'plus');
    assert.equal(pushed?.subscriptions.find((p) => p.service === 'chatgpt')?.observedAt, now);
  } finally {
    await t.close();
  }
});
