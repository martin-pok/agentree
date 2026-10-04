// Aktivní útrata pochází jen z Admin API. Starší ruční zápisy zůstávají v exportu
// a v historii, ale nesmějí zvýšit graf, rozpočet ani souhrn.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const { spendSummary, monthlyTotals, SERVICES, KINDS, CURRENCIES, DEFAULT_SPEND } = await import('../src/spend.js');
const { rateInfo } = await import('../src/rates.js');
const { ledgerHtml, plansHtml } = await import('../public/js/views/spend.js');

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

test('karta plánů vzniká jen z ověřeného zdroje a nenabízí ruční licence', () => {
  const sp = { services: SERVICES, subscriptions: [] };
  assert.equal(plansHtml(sp), '');
  sp.subscriptions = [{ service: 'perplexity', detected: false, label: 'Perplexity Pro', payments: [{ amount: 20, currency: 'USD' }] }];
  assert.equal(plansHtml(sp), '', 'starší ruční záznam neotevře kartu plánu');
  sp.subscriptions.push({ service: 'chatgpt', detected: true, label: 'ChatGPT Plus', evidence: 'Codex', observedAt: NOW, payments: [{ amount: 500, currency: 'CZK', account: 'Studio' }] });
  const html = plansHtml(sp);
  assert.match(html, /ChatGPT Plus/);
  assert.doesNotMatch(html, /Perplexity Pro|500|Studio|Další licence|Přidat licenci|data-action=/);
});

test('součet měsíce tvoří jen ověřené řádky Admin API, starší ruční platby jsou mimo něj', () => {
  const spend = { ...structuredClone(DEFAULT_SPEND), currency: 'CZK', ledger };
  const sp = payload(spend);
  const jenRucne = monthlyTotals(spend, [sp.monthKey], [])[0].total;
  const automaticky = sp.automatic.filter((r) => r.month === sp.monthKey).reduce((a, r) => a + r.converted, 0);
  assert.ok(jenRucne > 0);
  assert.equal(sp.month.auto, Math.round(automaticky * 100) / 100);
  assert.ok(Math.abs(sp.month.total - automaticky) < 0.011, `${sp.month.total} ≠ ${automaticky}`);
  assert.equal(sp.month.services.chatgpt, undefined);
  // Jeden řádek za službu a měsíc, dny a období odpovídají denním položkám.
  const openai = sp.automatic.find((r) => r.month === '2026-10' && r.service === 'openai-api');
  assert.deepEqual({ amount: openai.amount, days: openai.days, from: openai.from, to: openai.to, currency: openai.currency }, { amount: 3.75, days: 2, from: '2026-10-01', to: '2026-10-11', currency: 'USD' });
  assert.equal(sp.automatic.find((r) => r.month === '2026-09').amount, 10);
});

test('tabulka Výdaje ukazuje i automatické řádky Admin API jako skupinu jen ke čtení', () => {
  const spend = { ...structuredClone(DEFAULT_SPEND), currency: 'CZK', ledger };
  const html = ledgerHtml(payload(spend));
  assert.match(html, /Automaticky z Admin API · Anthropic \/ OpenAI|Automaticky z Admin API · OpenAI \/ Anthropic/);
  assert.match(html, /jen ke čtení/);
  assert.match(html, /dny podle UTC/);
  assert.match(html, /Starší ruční záznamy/);
  assert.doesNotMatch(html, /class="ledger-sum"/, 'historie se nesčítá s ověřenými náklady');
  const autoRows = html.split('<tr class="ledger-auto">').slice(1).map((r) => r.split('</tr>')[0]);
  assert.equal(autoRows.length, 3, 'říjen OpenAI, říjen Anthropic, září Anthropic');
  for (const r of autoRows) assert.doesNotMatch(r, /data-action=/, 'automatický řádek nejde smazat ani ukončit');
  // Ruční řádky zůstávají s akcemi.
  assert.match(html, /data-action="delete" data-id="m2"/);
});

test('jen automatické řádky (bez ručních) už neukazují prázdný stav „Zatím žádné výdaje“', () => {
  const spend = { ...structuredClone(DEFAULT_SPEND), currency: 'CZK', ledger: [] };
  const html = ledgerHtml(payload(spend));
  assert.doesNotMatch(html, /Zatím žádné výdaje/);
  assert.match(html, /Automaticky z Admin API/);
});

test('kurz: výchozí je označený jako orientační, ČNB s datem, vlastní jako vlastní', () => {
  const vychozi = ledgerHtml(payload({ ...structuredClone(DEFAULT_SPEND), currency: 'CZK', ledger }));
  assert.match(vychozi, /spend-foot--warn/);
  assert.match(vychozi, /Orientační kurz/);
  assert.match(vychozi, /1 \$ = 23 Kč, 1 € = 25 Kč/);

  const cnb = { ...structuredClone(DEFAULT_SPEND), currency: 'CZK', ledger, rates: { CZK: 1, USD: 21.5, EUR: 24.3 }, ratesSource: 'cnb', liveRates: { date: '2026-10-09', USD: 21.5, EUR: 24.3 } };
  const html = ledgerHtml(payload(cnb));
  assert.doesNotMatch(html, /Orientační kurz/);
  assert.match(html, /Kurz ČNB z 9\. ?10\. ?2026/);
  assert.match(html, /Minulé měsíce se přepočítávají stejným kurzem/);

  const rucne = ledgerHtml(payload({ ...structuredClone(DEFAULT_SPEND), currency: 'CZK', ledger, ratesSource: 'manual', rates: { CZK: 1, USD: 22, EUR: 25 } }));
  assert.match(rucne, /Vlastní kurz z Rozpočtů/);
});

test('jen koruny bez Admin API: poznámka o kurzu se neukazuje (nic se nepřevádí)', () => {
  const spend = { ...structuredClone(DEFAULT_SPEND), currency: 'CZK', ledger: [ledger[0]] };
  const sp = { ...spendSummary(spend, NOW, []), ledger: spend.ledger, rates: spend.rates, rateInfo: rateInfo(spend), services: SERVICES, kinds: KINDS };
  const html = ledgerHtml(sp);
  assert.doesNotMatch(html, /kurz/i);
  assert.doesNotMatch(html, /Admin API/);
});

// 0.34.0: automatický řádek jde rozbalit na rozpad po modelech. Tokeny jsou z Admin API, mají vlastní
// popisek a nikdy se nesčítají s částkou ani s tokeny z přepisů.
const modelEntries = [
  { service: 'openai-api', date: '2026-10-01', model: 'gpt-6-astra', amount: 1.0, currency: 'USD', tokens: { input: 900, output: 100, cached: 0 } },
  { service: 'openai-api', date: '2026-10-01', model: 'gpt-6-mini', amount: 0.5, currency: 'USD', tokens: { input: 50, output: 5, cached: 0 } },
  { service: 'openai-api', date: '2026-10-11', model: 'gpt-6-astra', amount: 2.25, currency: 'USD', tokens: { input: 2000, output: 300, cached: 100 } },
  { service: 'anthropic-api', date: '2026-10-02', model: 'claude-opus-5', amount: 3.5, currency: 'USD', tokens: null },
  { service: 'anthropic-api', date: '2026-10-02', model: null, amount: 0.5, currency: 'USD', tokens: null },
];

test('rozpad po modelech: měsíční součet modelů = částka řádku, tokeny jen z Admin API', () => {
  const spend = { ...structuredClone(DEFAULT_SPEND), currency: 'CZK', ledger };
  const sp = { ...spendSummary(spend, NOW, auto, modelEntries), ledger: spend.ledger, rates: spend.rates, rateInfo: rateInfo(spend), services: SERVICES, kinds: KINDS };
  const openai = sp.automatic.find((r) => r.month === '2026-10' && r.service === 'openai-api');
  assert.deepEqual(openai.models.map((m) => m.model), ['gpt-6-astra', 'gpt-6-mini'], 'nejdražší první');
  assert.equal(openai.models.reduce((a, m) => a + m.amount, 0), openai.amount);
  assert.deepEqual(openai.models[0].tokens, { input: 2900, output: 400, cached: 100 });
  const anth = sp.automatic.find((r) => r.month === '2026-10' && r.service === 'anthropic-api');
  assert.equal(anth.models.at(-1).model, null, 'položka bez modelu je poslední');
  assert.ok(anth.models.every((m) => m.tokens === null), 'nezjištěné tokeny zůstávají null');
  // Září Anthropic nemá rozpad → prázdné pole, bez tlačítka.
  assert.deepEqual(sp.automatic.find((r) => r.month === '2026-09').models, []);

  const zavreno = ledgerHtml(sp, new Set());
  assert.match(zavreno, /data-models="2026-10\|openai-api\|USD"[^>]*aria-expanded="false"/);
  assert.match(zavreno, /<tr class="ledger-models" id="lm-2026-10-openai-api-USD" hidden>/);
  assert.equal((zavreno.match(/data-models=/g) || []).length, 2, 'září bez rozpadu tlačítko nemá');
  const autoRows = zavreno.split('<tr class="ledger-auto">').slice(1).map((r) => r.split('</tr>')[0]);
  for (const r of autoRows) assert.doesNotMatch(r, /data-action=/, 'rozbalení nic nemaže ani neukončuje');

  const otevreno = ledgerHtml(sp, new Set(['2026-10|openai-api|USD']));
  assert.match(otevreno, /aria-expanded="true" aria-controls="lm-2026-10-openai-api-USD"/);
  assert.match(otevreno, /<tr class="ledger-models" id="lm-2026-10-openai-api-USD"><td colspan="5">/);
  assert.match(otevreno, /Tokeny z Admin API/);
  assert.match(otevreno, /Nejsou to tokeny z konverzací ve Statistikách/);
  assert.match(otevreno, /gpt-6-astra[\s\S]*2,9 tis\. vstup[\s\S]*400 výstup[\s\S]*100 mezipaměť/);
  const anthOpen = ledgerHtml(sp, new Set(['2026-10|anthropic-api|USD']));
  assert.match(anthOpen, /nezjištěno/);
  assert.match(anthOpen, /Bez modelu \(nástroje, úložiště\)/);
  assert.match(anthOpen, /Spotřebu tokenů se od dodavatele nepodařilo zjistit/);
});

test('Statistiky: tokeny organizace z Admin API stojí zvlášť a jen pro období po dnech', async () => {
  const { apiTokensHtml } = await import('../public/js/views/stats.js');
  const now = Date.UTC(2026, 9, 12, 12);
  const cloud = {
    'anthropic-admin': { state: 'connected', tokens: { '2026-10-12': { input: 1000, output: 10 }, '2026-10-06': { input: 500, output: 5 }, '2026-10-01': { input: 99999, output: 9 } } },
    'openai-admin': { state: 'connected', tokens: null },
  };
  assert.equal(apiTokensHtml('today', now, cloud), '', 'den Admin API neodpovídá „Dnes“ ani „24 hodin“');
  assert.equal(apiTokensHtml('day', now, cloud), '');
  const tyden = apiTokensHtml('week', now, cloud);
  assert.match(tyden, /Organizace přes API/);
  assert.match(tyden, /nejsou v grafu ani v součtu/);
  assert.match(tyden, /1,5 tis\. vstup · 15 výstup/, 'jen posledních 7 dní (UTC)');
  assert.match(tyden, /nezjištěno/, 'selhaná spotřeba není nula');
  assert.equal(apiTokensHtml('week', now, { 'anthropic-admin': { state: 'missing', tokens: {} } }), '');
});
