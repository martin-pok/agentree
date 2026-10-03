// Útrata musí jít složit z toho, co je vidět: součet měsíce = ručně zapsané řádky + automatické
// řádky z Admin API, a převod měn říká, odkud je kurz. Dřív tabulka Výdaje ukazovala jen ruční
// zápisy, zatímco součet obsahoval i Admin API, a výchozí kurz 23 Kč za dolar se tvářil jako přesný.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const { spendSummary, monthlyTotals, SERVICES, KINDS, CURRENCIES, DEFAULT_SPEND } = await import('../src/spend.js');
const { rateInfo } = await import('../src/rates.js');
const { ledgerHtml } = await import('../public/js/views/spend.js');

const NOW = new Date(2026, 9, 12, 10).getTime(); // 12. 10. 2026
const ledger = [
  { id: 'm1', service: 'chatgpt', kind: 'subscription', amount: 500, currency: 'CZK', date: '2026-09-03', recurring: 'monthly', endDate: null, note: '', account: '', createdAt: 1 },
  { id: 'm2', service: 'claude', kind: 'extra', amount: 20, currency: 'USD', date: '2026-10-05', recurring: null, endDate: null, note: 'víkendový sprint', account: '', createdAt: 2 },
];
const auto = [
  { id: 'auto:openai-admin:2026-10-01', service: 'openai-api', kind: 'api', amount: 1.5, currency: 'USD', date: '2026-10-01', recurring: null, note: 'Admin API', auto: true },
  { id: 'auto:openai-admin:2026-10-11', service: 'openai-api', kind: 'api', amount: 2.25, currency: 'USD', date: '2026-10-11', recurring: null, note: 'Admin API', auto: true },
  { id: 'auto:anthropic-admin:2026-10-02', service: 'anthropic-api', kind: 'api', amount: 4, currency: 'USD', date: '2026-10-02', recurring: null, note: 'Admin API', auto: true },
  { id: 'auto:anthropic-admin:2026-09-30', service: 'anthropic-api', kind: 'api', amount: 10, currency: 'USD', date: '2026-09-30', recurring: null, note: 'Admin API', auto: true },
];

function payload(spend) {
  return { ...spendSummary(spend, NOW, auto), ledger: spend.ledger, budgetsConfig: spend.budgets, rates: spend.rates, rateInfo: rateInfo(spend), subscriptions: [], services: SERVICES, kinds: KINDS, currencies: CURRENCIES };
}

test('součet měsíce = ručně zapsané + automatické řádky Admin API (rozpočet a prognóza beze změny významu)', () => {
  const spend = { ...structuredClone(DEFAULT_SPEND), ledger };
  const sp = payload(spend);
  const jenRucne = monthlyTotals(spend, [sp.monthKey], [])[0].total;
  const automaticky = sp.automatic.filter((r) => r.month === sp.monthKey).reduce((a, r) => a + r.converted, 0);
  assert.equal(sp.month.auto, Math.round(automaticky * 100) / 100);
  assert.ok(Math.abs(sp.month.total - (jenRucne + automaticky)) < 0.011, `${sp.month.total} ≠ ${jenRucne} + ${automaticky}`);
  // Jeden řádek za službu a měsíc, dny a období odpovídají denním položkám.
  const openai = sp.automatic.find((r) => r.month === '2026-10' && r.service === 'openai-api');
  assert.deepEqual({ amount: openai.amount, days: openai.days, from: openai.from, to: openai.to, currency: openai.currency }, { amount: 3.75, days: 2, from: '2026-10-01', to: '2026-10-11', currency: 'USD' });
  assert.equal(sp.automatic.find((r) => r.month === '2026-09').amount, 10);
});

test('tabulka Výdaje ukazuje i automatické řádky Admin API jako skupinu jen ke čtení', () => {
  const spend = { ...structuredClone(DEFAULT_SPEND), ledger };
  const html = ledgerHtml(payload(spend));
  assert.match(html, /Automaticky z Admin API · Anthropic \/ OpenAI|Automaticky z Admin API · OpenAI \/ Anthropic/);
  assert.match(html, /jen ke čtení/);
  assert.match(html, /dny podle UTC/);
  // Součet: celek = ručně + automaticky; částka se nikdy neodtrhne od popisku (nedělitelná mezera).
  const soucet = html.match(/<p class="ledger-sum">([\s\S]*?)<\/p>/)?.[1] || '';
  assert.match(soucet, /Tento měsíc&nbsp;<b class="ledger-castka">/);
  assert.match(soucet, /= zapsáno ručně&nbsp;<span class="ledger-castka">/);
  assert.match(soucet, /\+ automaticky z Admin API&nbsp;<span class="ledger-castka">/);
  const castky = [...soucet.matchAll(/class="ledger-castka">([^<]+)</g)].map((m) => Number(m[1].replace(/[^\d]/g, '')));
  assert.equal(castky.length, 3);
  assert.equal(castky[0], castky[1] + castky[2], 'celek se skládá z obou dílů');
  const autoRows = html.split('<tr class="ledger-auto">').slice(1).map((r) => r.split('</tr>')[0]);
  assert.equal(autoRows.length, 3, 'říjen OpenAI, říjen Anthropic, září Anthropic');
  for (const r of autoRows) assert.doesNotMatch(r, /data-action=/, 'automatický řádek nejde smazat ani ukončit');
  // Ruční řádky zůstávají s akcemi.
  assert.match(html, /data-action="delete" data-id="m2"/);
});

test('jen automatické řádky (bez ručních) už neukazují prázdný stav „Zatím žádné výdaje“', () => {
  const spend = { ...structuredClone(DEFAULT_SPEND), ledger: [] };
  const html = ledgerHtml(payload(spend));
  assert.doesNotMatch(html, /Zatím žádné výdaje/);
  assert.match(html, /Automaticky z Admin API/);
});

test('kurz: výchozí je označený jako orientační, ČNB s datem, vlastní jako vlastní', () => {
  const vychozi = ledgerHtml(payload({ ...structuredClone(DEFAULT_SPEND), ledger }));
  assert.match(vychozi, /spend-foot--warn/);
  assert.match(vychozi, /Orientační kurz/);
  assert.match(vychozi, /1 \$ = 23 Kč, 1 € = 25 Kč/);

  const cnb = { ...structuredClone(DEFAULT_SPEND), ledger, rates: { CZK: 1, USD: 21.5, EUR: 24.3 }, ratesSource: 'cnb', liveRates: { date: '2026-10-09', USD: 21.5, EUR: 24.3 } };
  const html = ledgerHtml(payload(cnb));
  assert.doesNotMatch(html, /Orientační kurz/);
  assert.match(html, /Kurz ČNB z 9\. ?10\. ?2026/);
  assert.match(html, /Minulé měsíce se přepočítávají stejným kurzem/);

  const rucne = ledgerHtml(payload({ ...structuredClone(DEFAULT_SPEND), ledger, ratesSource: 'manual', rates: { CZK: 1, USD: 22, EUR: 25 } }));
  assert.match(rucne, /Vlastní kurz z Rozpočtů/);
});

test('jen koruny bez Admin API: poznámka o kurzu se neukazuje (nic se nepřevádí)', () => {
  const spend = { ...structuredClone(DEFAULT_SPEND), ledger: [ledger[0]] };
  const sp = { ...spendSummary(spend, NOW, []), ledger: spend.ledger, rates: spend.rates, rateInfo: rateInfo(spend), services: SERVICES, kinds: KINDS };
  const html = ledgerHtml(sp);
  assert.doesNotMatch(html, /kurz/i);
  assert.doesNotMatch(html, /Admin API/);
});
