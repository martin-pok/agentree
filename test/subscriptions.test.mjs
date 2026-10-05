import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, tempDir, waitFor } from './helpers.mjs';
import { parseCnb, applyLiveRates, createRateFeed } from '../src/rates.js';
import { claudePlanFromAccount, chatgptPlanFromLimits, describePlan, subscriptionPortfolio } from '../src/subscriptions.js';
import { spendSummary, DEFAULT_SPEND, validateEntry } from '../src/spend.js';
import { normalizeData } from '../src/datastore.js';
import { claudeIdentity, normalizeCodexAccount, observeAccount } from '../src/provider-accounts.js';

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
  assert.equal(pro.label, 'ChatGPT Pro 200', 'kód „pro“ je v Codexu Pro 200 (codex-rs/tui/src/subscription.rs)');
  assert.equal('payment' in pro, false);
  const plus = describePlan({ service: 'chatgpt', plan: 'plus', evidence: 'x' });
  assert.equal(plus.label, 'ChatGPT Plus');
  assert.equal('payments' in plus, false, 'veřejný ceník není skutečná platba uživatele');
});

test('ruční zápisy nikdy nevytvoří plán ani licenci v portfoliu', () => {
  const ledger = [{ id: 'real', service: 'claude', kind: 'subscription', amount: 612.4, currency: 'CZK', recurring: 'monthly', date: '2026-03-01', endDate: null, account: 'Osobní', note: 'Claude Pro' }];
  assert.deepEqual(subscriptionPortfolio([], ledger), []);
  const p = subscriptionPortfolio([{ service: 'claude', plan: 'pro', evidence: 'Claude Code' }], ledger)[0];
  assert.equal(p.label, 'Claude Pro');
  assert.equal('payments' in p, false);
  assert.equal('payment' in p, false);
});

test('další ruční licence nejsou vydávány za automaticky zjištěné účty', () => {
  const ledger = [
    { id: 'c1', service: 'claude', kind: 'subscription', amount: 20, currency: 'USD', recurring: 'monthly', date: '2026-01-01', endDate: null, account: 'Osobní', note: '' },
    { id: 'c2', service: 'claude', kind: 'subscription', amount: 25, currency: 'USD', recurring: 'monthly', date: '2026-02-01', endDate: null, account: 'Studio', note: '' },
    { id: 'p1', service: 'perplexity', kind: 'subscription', amount: 20, currency: 'USD', recurring: 'monthly', date: '2026-03-01', endDate: null, account: 'Výzkum', note: '' },
    { id: 'old', service: 'claude', kind: 'subscription', amount: 10, currency: 'USD', recurring: 'monthly', date: '2026-01-01', endDate: '2026-08-31', account: 'Ukončená', note: '' },
  ];
  const plans = subscriptionPortfolio([{ service: 'claude', plan: 'pro', evidence: 'Claude Code' }], ledger);
  assert.deepEqual(plans.map((p) => p.service), ['claude']);
  assert.equal(plans[0].detected, true);
  // Ceník (veřejná cena plánu, src/cenik.js) se ověřuje zvlášť; z ručních zápisů nesmí projít nic.
  assert.doesNotMatch(JSON.stringify(plans.map(({ cena, ...p }) => p)), /Studio|Výzkum|612\.4|20/);
  assert.equal(plans[0].cena.mesicne, 20, 'cena je z ceníku Anthropic, ne z ručního zápisu 25 USD');
});

test('název licence se ukládá jen k předplatnému a je omezený', () => {
  const base = { service: 'claude', amount: 20, currency: 'USD', date: '2026-09-20', recurring: 'monthly', account: `  ${'x'.repeat(90)}  ` };
  const subscription = validateEntry({ ...base, kind: 'subscription' }, 1);
  assert.equal(subscription.value.account.length, 80);
  const extra = validateEntry({ ...base, kind: 'extra' }, 1);
  assert.equal(extra.value.account, '');
});

test('rozpoznaný plán bez billing dat nevytváří výdaj a ruční platba nezvyšuje ověřený součet', () => {
  const now = Date.parse('2026-09-20T12:00:00');
  const detected = describePlan({ service: 'claude', plan: 'pro', since: '2026-08-05', evidence: 'x' }, [], now);
  assert.equal('payment' in detected, false);
  const empty = spendSummary({ ...DEFAULT_SPEND, ledger: [], rates: { CZK: 1, USD: 21, EUR: 24 } }, now, []);
  assert.equal(empty.month.total, 0);
  const ledger = [{ id: 'real', service: 'claude', kind: 'subscription', amount: 20, currency: 'USD', date: '2026-08-05', recurring: 'monthly', endDate: null }];
  const s = spendSummary({ ...DEFAULT_SPEND, ledger, rates: { CZK: 1, USD: 21, EUR: 24 } }, now, []);
  assert.equal(s.month.total, 0);
  assert.equal(s.recurring, 0);
  assert.equal(s.forecast, 0);
  assert.equal(s.months.find((m) => m.key === '2026-08').total, 0);
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
    assert.equal((await t.app.integrations()).claudeAuth.loggedIn, true);
    const sp = t.app.spendPayload();
    const claude = sp.subscriptions.find((x) => x.service === 'claude');
    assert.equal(claude.plan, 'pro');
    assert.equal(claude.label, 'Claude Pro');
    assert.equal('payment' in claude, false);
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
    await t.app.refreshSubscriptions();
    assert.equal((await t.app.integrations()).claudeAuth.loggedIn, false);
    const sp = t.app.spendPayload();
    assert.equal(sp.subscriptions.some((x) => x.service === 'claude'), false);
  } finally {
    await t.close();
  }
});

test('změna přihlášení Claude se bez reloadu propíše do živého stavu', async () => {
  let loggedIn = false;
  const t = await startTestServer({}, {
    napojeniRun: async () => ({ ok: true, stdout: JSON.stringify({ loggedIn }), stderr: '' }),
  });
  try {
    const events = [];
    t.app.store.on('integrations', (value) => events.push(value.claudeAuth.loggedIn));
    loggedIn = true;
    await t.app.refreshSubscriptions();
    await waitFor(() => events.includes(true));
    loggedIn = false;
    await t.app.refreshSubscriptions();
    await waitFor(() => events.at(-1) === false);
    loggedIn = null;
    await t.app.refreshSubscriptions();
    await waitFor(() => events.at(-1) === null);
    assert.deepEqual(events.filter((value, index) => index === 0 || value !== events[index - 1]), [true, false, null]);
  } finally {
    await t.close();
  }
});

test('historický limit Codexu bez identity účtu nevytvoří aktuální předplatné', async () => {
  const t = await startTestServer();
  try {
    const now = Date.now();
    t.app.store.setLimit({ id: 'openai:five_hour', provider: 'openai', app: 'Codex', kind: 'time', label: '5 h', plan: 'plus', at: now, resetsAt: now + 3600e3, usedPercent: 10 });
    assert.equal(t.app.spendPayload().subscriptions.some((p) => p.service === 'chatgpt'), false);
  } finally {
    await t.close();
  }
});

test('účet, plán a limity Codexu pocházejí z jednoho odečtu app-serveru bez osobních údajů', () => {
  const snap = normalizeCodexAccount(
    { accountId: 'acct-abcdefgh12345678', rateLimitsByLimitId: { codex: { primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: { usedPercent: 15, windowDurationMins: 10080 } } }, rateLimits: { planType: 'plus', credits: { balance: '12.5' } } }, 1234);
  assert.equal(snap.plan, 'plus');
  assert.equal(snap.limits[0].primary.usedPercent, 25);
  assert.equal(snap.credits, 12.5);
  assert.doesNotMatch(JSON.stringify(snap), /tajne@example\.com|acct-abcdefgh/);
  assert.equal(normalizeCodexAccount({ rateLimits: { planType: 'plus' } }), null, 'bez identity se plán nepřiřadí');
});

test('přepnutí dvou účtů zachová historii, ale čísla patří jen aktuálnímu účtu', async () => {
  let account = normalizeCodexAccount(
    { accountId: 'account-alpha-1234', rateLimitsByLimitId: { codex: { primary: { usedPercent: 80 } } }, rateLimits: { planType: 'plus', credits: { balance: '7' } } });
  const t = await startTestServer({}, { codexAccountReader: async () => account });
  try {
    await t.app.refreshSubscriptions();
    const first = t.app.spendPayload();
    assert.equal(first.providerAccounts.find((x) => x.active).credits, 7);
    account = normalizeCodexAccount(
      { accountId: 'account-bravo-1234', rateLimitsByLimitId: { codex: { primary: { usedPercent: 12 } } }, rateLimits: { planType: 'pro', credits: { balance: '3' } } });
    await t.app.refreshSubscriptions();
    const second = t.app.spendPayload();
    assert.equal(second.providerAccounts.filter((x) => x.provider === 'openai').length, 2);
    assert.equal(second.providerAccounts.find((x) => x.active).credits, 3);
    assert.equal(second.providerAccounts.find((x) => !x.active && x.provider === 'openai').credits, null);
    assert.equal(second.subscriptions.find((x) => x.service === 'chatgpt').plan, 'pro');
    account = null;
    await t.app.refreshSubscriptions();
    assert.equal(t.app.spendPayload().providerAccounts.some((x) => x.active && x.provider === 'openai'), false);
    assert.equal(t.app.spendPayload().subscriptions.some((x) => x.service === 'chatgpt'), false);
  } finally { await t.close(); }
});

test('Claude identity rozlišuje účty bez přenosu UUID nebo e-mailu', () => {
  const a = claudeIdentity({ accountUuid: '11111111-1111-4111-8111-111111111111' });
  const b = claudeIdentity({ accountUuid: '22222222-2222-4222-8222-222222222222' });
  assert.notEqual(a, b);
  const history = observeAccount(observeAccount([], { id: a, provider: 'anthropic', service: 'claude', plan: 'pro', observedAt: 1 }),
    { id: b, provider: 'anthropic', service: 'claude', plan: 'max', observedAt: 2 });
  assert.equal(history.length, 2);
  assert.doesNotMatch(JSON.stringify(history), /11111111|22222222/);
});

test('druhý izolovaný profil Claude je aktivní i při odhlášení výchozího profilu', async () => {
  const src = await tempDir('agenteeq-src-claude-');
  const alt = await tempDir('agenteeq-alt-claude-');
  await fs.writeFile(path.join(src, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: '11111111-1111-4111-8111-111111111111', organizationType: 'claude_pro' } }));
  await fs.writeFile(path.join(alt, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: '22222222-2222-4222-8222-222222222222', organizationType: 'claude_max', userRateLimitTier: 'default_claude_max_5x' } }));
  const t = await startTestServer({ AGENTEEQ_SOURCE_HOME: src, AGENTEEQ_CLAUDE_CONFIG_DIR: alt }, {
    napojeniRun: async (_bin, _args, options) => ({ ok: true, stdout: JSON.stringify({ loggedIn: options?.env?.CLAUDE_CONFIG_DIR === alt }), stderr: '' }),
  });
  try {
    await t.app.refreshSubscriptions();
    const sp = t.app.spendPayload();
    assert.equal(sp.subscriptions.filter((p) => p.service === 'claude').length, 1);
    assert.equal(sp.subscriptions.find((p) => p.service === 'claude').plan, 'max5x');
    assert.equal(sp.providerAccounts.find((x) => x.provider === 'anthropic' && x.active).plan, 'max5x');
    assert.doesNotMatch(JSON.stringify(sp), /11111111|22222222/);
  } finally { await t.close(); }
});

test('dva současné domovy Codexu dávají dvě oddělené licence', async () => {
  const src = await tempDir('agenteeq-src-codex-');
  const alt = await tempDir('agenteeq-alt-codex-');
  const t = await startTestServer({ AGENTEEQ_SOURCE_HOME: src, AGENTEEQ_CODEX_HOME: alt }, {
    codexAccountReader: async (_bin, { home }) => normalizeCodexAccount({
      accountId: home === alt ? 'account-bravo-1234' : 'account-alpha-1234',
      rateLimits: { planType: home === alt ? 'pro' : 'plus', credits: { balance: home === alt ? '9' : '2' } },
    }),
  });
  try {
    await t.app.refreshSubscriptions();
    const sp = t.app.spendPayload();
    assert.equal(sp.subscriptions.filter((p) => p.service === 'chatgpt').length, 2);
    assert.deepEqual(sp.providerAccounts.filter((x) => x.provider === 'openai' && x.active).map((x) => x.credits).sort(), [2, 9]);
  } finally { await t.close(); }
});


test('ceník zjištěných plánů: úroveň a cena podle oficiálního ceníku, bez ceny se nic nedohaduje', async () => {
  const { cenaPlanu, CENIK_OVERENO } = await import('../src/cenik.js');
  const c = (service, plan) => describePlan({ service, plan, evidence: 'x' });
  const ocekavane = [
    ['claude', 'pro', 'Claude Pro', 20, 17],
    ['claude', 'max5x', 'Claude Max 5×', 100, null],
    ['claude', 'max20x', 'Claude Max 20×', 200, null],
    ['chatgpt', 'go', 'ChatGPT Go', 8, null],
    ['chatgpt', 'plus', 'ChatGPT Plus', 20, null],
    ['chatgpt', 'prolite', 'ChatGPT Pro 100', 100, null],
    ['chatgpt', 'pro', 'ChatGPT Pro 200', 200, null],
    ['chatgpt', 'promax', 'ChatGPT Pro 500', 500, null],
    ['chatgpt', 'team', 'ChatGPT Business', 25, 20],
    ['chatgpt', 'self_serve_business_prolite', 'ChatGPT Business Premium', 125, 100],
  ];
  for (const [service, plan, label, mesicne, rocne] of ocekavane) {
    const p = c(service, plan);
    assert.equal(p.label, label, plan);
    assert.equal(p.cena.mesicne, mesicne, plan);
    assert.equal(p.cena.rocne, rocne, plan);
    assert.equal(p.cena.mena, 'USD');
    assert.match(p.cena.url, /^https:\/\/(claude|chatgpt)\.com\/pricing$/);
    assert.equal(p.cena.overeno, CENIK_OVERENO);
  }
  assert.equal(c('chatgpt', 'team').cena.zaMisto, true);
  assert.equal(c('chatgpt', 'go').cena.jenUsa, true, 'Go má v každé zemi jinou cenu');
  assert.equal(c('claude', 'max').cena.od, true, 'Max bez známé úrovně má jen dolní mez');
  // Firemní plány bez veřejné ceny a neznámé kódy cenu nemají – nic se nedohaduje.
  assert.equal(c('chatgpt', 'business').label, 'ChatGPT Enterprise', 'kód „business“ je v Codexu Enterprise');
  for (const [service, plan] of [['chatgpt', 'business'], ['chatgpt', 'enterprise'], ['chatgpt', 'edu'], ['chatgpt', 'neznamy'], ['claude', 'neznamy']]) {
    assert.equal(cenaPlanu(service, plan), null, `${service} ${plan}`);
  }
  assert.equal(c('claude', 'free').cena.mesicne, 0);
});
