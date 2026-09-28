import test from 'node:test';
import assert from 'node:assert/strict';
import { spendCsv, monthlyTotals, addMonths, DEFAULT_SPEND } from '../src/spend.js';
import { startTestServer, api } from './helpers.mjs';

// Export útraty do CSV pro účetnictví: jeden řádek za platbu v každém měsíci. Hlídá se, že
// součty sedí s obrazovkou Útrata, že převod měn jde zkontrolovat a že soubor otevře tabulka
// v jazyce aplikace (česky středník a desetinná čárka, anglicky čárka a desetinná tečka; vždy BOM)
// bez spuštění vzorce z poznámky.

// Minimální čtečka CSV s oddělovačem a uvozovkami – stačí na to, co export píše.
function precti(text, oddelovac = ';') {
  assert.equal(text.charCodeAt(0), 0xfeff, 'BOM, aby Excel poznal UTF-8');
  const radky = [];
  for (const radek of text.slice(1).split('\r\n').filter(Boolean)) {
    const bunky = [];
    let i = 0;
    while (i <= radek.length) {
      if (radek[i] === '"') {
        let j = i + 1, s = '';
        for (;;) {
          if (radek[j] === '"' && radek[j + 1] === '"') { s += '"'; j += 2; }
          else if (radek[j] === '"') { j++; break; }
          else s += radek[j++];
        }
        bunky.push(s); i = j + 1;
      } else {
        const j = radek.indexOf(oddelovac, i);
        bunky.push(radek.slice(i, j === -1 ? radek.length : j)); i = j === -1 ? radek.length + 1 : j + 1;
      }
    }
    radky.push(bunky);
  }
  return radky;
}
const cislo = (s, jazyk = 'cs') => Number(jazyk === 'en' ? s : String(s).replace(',', '.'));
const ODDELOVAC = { cs: ';', en: ',' };

const now = new Date(2026, 8, 15, 12).getTime(); // 15. 9. 2026
const spend = {
  ...DEFAULT_SPEND,
  rates: { CZK: 1, USD: 23, EUR: 25 },
  ledger: [
    { id: 'a', service: 'chatgpt', kind: 'subscription', amount: 20, currency: 'USD', date: '2026-07-05', recurring: 'monthly', endDate: '2026-08-31', note: 'Plus' },
    { id: 'b', service: 'claude', kind: 'extra', amount: 512.5, currency: 'CZK', date: '2026-08-12', recurring: null, note: '=HYPERLINK("http://zle.example";"klik")' },
    { id: 'c', service: 'cursor', kind: 'subscription', amount: 20, currency: 'EUR', date: '2026-01-31', recurring: 'monthly', endDate: null, note: '' },
    { id: 'd', service: 'gemini', kind: 'credits', amount: 99, currency: 'CZK', date: '2026-02-10', recurring: null, note: 'mimo okno exportu' },
  ],
};
const automaticke = [
  { id: 'auto:openai-admin:2026-09-03', service: 'openai-api', kind: 'api', amount: 1.5, currency: 'USD', date: '2026-09-03', recurring: null, note: 'Admin API', auto: true },
  { id: 'auto:sub:claude', service: 'claude', kind: 'subscription', amount: 100, currency: 'USD', date: '2026-09-01', recurring: 'monthly', endDate: null, note: 'Claude Max podle ceníku', auto: true },
];

test('export útraty: řádek za platbu v každém měsíci, převod a zdroj záznamu', () => {
  const [hlavicka, ...radky] = precti(spendCsv(spend, now, automaticke, 4));
  assert.deepEqual(hlavicka, ['Měsíc', 'Datum platby', 'Služba', 'Typ', 'Opakování', 'Poznámka', 'Částka', 'Měna', 'Kurz na CZK', 'Částka v CZK', 'Zdroj']);
  const klic = (r) => `${r[1]} ${r[2]}`;
  assert.deepEqual(radky.map(klic), [
    '2026-06-30 Cursor',
    '2026-07-05 ChatGPT', '2026-07-31 Cursor',
    '2026-08-05 ChatGPT', '2026-08-12 Claude', '2026-08-31 Cursor',
    '2026-09-01 Claude', '2026-09-03 OpenAI API', '2026-09-30 Cursor',
  ], 'měsíční předplatné v každém měsíci, kdy běželo; 31. se v kratším měsíci posune na poslední den; nic mimo okno');
  const chatgpt = radky.find((r) => r[1] === '2026-07-05');
  assert.deepEqual(chatgpt, ['2026-07', '2026-07-05', 'ChatGPT', 'Předplatné', 'měsíčně do 2026-08-31', 'Plus', '20', 'USD', '23', '460', 'Ručně']);
  const api = radky.find((r) => r[2] === 'OpenAI API');
  assert.deepEqual(api.slice(6), ['1,5', 'USD', '23', '34,5', 'Admin API'], 'desetinná čárka pro českou tabulku');
  assert.equal(radky.find((r) => r[1] === '2026-09-01')[10], 'Podle ceníku');
  assert.equal(radky.find((r) => r[1] === '2026-09-01')[4], 'měsíčně');
  assert.equal(radky.find((r) => r[1] === '2026-08-12')[4], 'jednorázově');
});

test('export útraty anglicky: hlavička a hodnoty v angličtině, čárka a desetinná tečka', () => {
  const text = spendCsv(spend, now, automaticke, 4, 'en');
  const [hlavicka, ...radky] = precti(text, ',');
  assert.deepEqual(hlavicka, ['Month', 'Payment date', 'Service', 'Type', 'Recurrence', 'Note', 'Amount', 'Currency', 'Rate to CZK', 'Amount in CZK', 'Source']);
  assert.equal(radky.length, 9, 'tytéž řádky jako česky');
  assert.deepEqual(radky.find((r) => r[1] === '2026-07-05'), ['2026-07', '2026-07-05', 'ChatGPT', 'Subscription', 'monthly until 2026-08-31', 'Plus', '20', 'USD', '23', '460', 'Manual']);
  assert.deepEqual(radky.find((r) => r[2] === 'OpenAI API').slice(3), ['API', 'one-off', 'Admin API', '1.5', 'USD', '23', '34.5', 'Admin API'], 'desetinná tečka pro anglickou tabulku');
  const predplatne = radky.find((r) => r[1] === '2026-09-01');
  assert.deepEqual([predplatne[4], predplatne[5], predplatne[10]], ['monthly', 'Claude Max from the price list', 'Price list'], 'poznámka automatického záznamu je text aplikace');
  assert.deepEqual(radky.find((r) => r[2] === 'Claude' && r[0] === '2026-08').slice(3, 7), ['Extra usage', 'one-off', `'=HYPERLINK("http://zle.example";"klik")`, '512.5']);
  assert.doesNotMatch(text, /[áčďéěíňóřšťúůýž]/i, 'v anglickém exportu nezůstala čeština');
  // Poznámka od uživatele se nepřekládá, jen se kvůli čárce dá do uvozovek.
  const vlastni = spendCsv({ ...spend, ledger: [{ ...spend.ledger[0], note: 'Měsíčně, ručně' }] }, now, [], 2, 'en');
  assert.ok(vlastni.includes(',"Měsíčně, ručně",'), vlastni);
  assert.equal(precti(vlastni, ',')[1][5], 'Měsíčně, ručně');
});

test('export útraty: součty po měsících sedí s obrazovkou Útrata v obou jazycích', () => {
  const mesice = Array.from({ length: 6 }, (_, i) => addMonths('2026-09', i - 5));
  const obrazovka = monthlyTotals(spend, mesice, automaticke);
  for (const jazyk of ['cs', 'en']) {
    const [, ...radky] = precti(spendCsv(spend, now, automaticke, 6, jazyk), ODDELOVAC[jazyk]);
    for (const { key, total } of obrazovka) {
      const soucet = radky.filter((r) => r[0] === key).reduce((s, r) => s + cislo(r[9], jazyk), 0);
      assert.ok(Math.abs(soucet - total) < 0.01, `${jazyk} ${key}: export ${soucet} × obrazovka ${total}`);
    }
  }
});

test('export útraty: poznámka nespustí vzorec a středník nerozbije sloupce', () => {
  const text = spendCsv(spend, now, [], 4);
  assert.ok(text.includes(`"'=HYPERLINK(""http://zle.example"";""klik"")"`), 'vzorec dostane apostrof, uvozovky se zdvojí');
  const radek = precti(text).find((r) => r[2] === 'Claude');
  assert.equal(radek.length, 11);
  assert.equal(radek[5], `'=HYPERLINK("http://zle.example";"klik")`);
  assert.equal(radek[6], '512,5');
});

test('export útraty: v jiné měně aplikace se převádí přes kurzy v aplikaci', () => {
  const [hlavicka, ...radky] = precti(spendCsv({ ...spend, currency: 'EUR' }, now, [], 2));
  assert.equal(hlavicka[9], 'Částka v EUR');
  const cursor = radky.find((r) => r[2] === 'Cursor' && r[0] === '2026-09');
  assert.deepEqual(cursor.slice(6, 10), ['20', 'EUR', '1', '20']);
  const chatgpt = radky.filter((r) => r[2] === 'ChatGPT');
  assert.deepEqual(chatgpt.map((r) => r[0]), ['2026-08'], 'předplatné skončené v srpnu má v okně srpen–září jen srpen');
  assert.deepEqual(chatgpt[0].slice(6, 10), ['20', 'USD', '0,92', '18,4'], 'kurz USD → EUR z kurzů v aplikaci (23 / 25)');
});

test('export útraty přes HTTP: soubor ke stažení a hlídaný počet měsíců', async () => {
  const s = await startTestServer();
  try {
    const a = api(s.url);
    assert.equal((await a.send('POST', '/api/spend/ledger', { service: 'perplexity', kind: 'subscription', amount: '20', currency: 'USD', date: new Date().toISOString().slice(0, 10), recurring: 'monthly', note: 'Pro' })).status, 201);
    const res = await fetch(`${s.url}/api/spend/export`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/csv/);
    assert.match(res.headers.get('content-disposition'), /filename="agenteeq-utrata-\d{4}-\d{2}-\d{2}\.csv"/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const radky = precti(Buffer.from(await res.arrayBuffer()).toString('utf8')); // text() by BOM zahodil
    assert.ok(radky.some((r) => r[2] === 'Perplexity' && r[5] === 'Pro'));
    for (const spatne of ['0', '37', 'abc', '1.5', '-3']) {
      assert.equal((await fetch(`${s.url}/api/spend/export?mesicu=${spatne}`)).status, 422, `mesicu=${spatne}`);
    }
    assert.equal((await fetch(`${s.url}/api/spend/export?mesicu=36`)).status, 200);

    // Anglicky z Nastavení: soubor i jeho jméno v angličtině, čárka jako oddělovač.
    assert.equal((await a.send('PUT', '/api/settings', { language: 'en' })).status, 200);
    const en = await fetch(`${s.url}/api/spend/export`);
    assert.match(en.headers.get('content-disposition'), /filename="agenteeq-spend-\d{4}-\d{2}-\d{2}\.csv"/);
    const [hlavicka, ...enRadky] = precti(Buffer.from(await en.arrayBuffer()).toString('utf8'), ',');
    assert.equal(hlavicka[0], 'Month');
    assert.ok(enRadky.some((r) => r[2] === 'Perplexity' && r[3] === 'Subscription' && r[4] === 'monthly' && r[5] === 'Pro' && r[10] === 'Manual'));
  } finally {
    await s.close();
  }
});

test('tlačítko exportu vede na export a v živé prohlídce na webu chybí', async () => {
  const fs = await import('node:fs/promises');
  const view = await fs.readFile(new URL('../public/js/views/spend.js', import.meta.url), 'utf8');
  assert.match(view, /function exportTlacitko\(\) \{\s*if \(document\.documentElement\.hasAttribute\('data-ukazka'\)\) return '';/, 'ukázka nemá server, stažení by skončilo chybou');
  assert.match(view, /href="\/api\/spend\/export" download/);
  assert.match(view, /<h2 id="led-h">\$\{tr\('Výdaje'\)\}<\/h2>\$\{exportTlacitko\(\)\}/);
});
