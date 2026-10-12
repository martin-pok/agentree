import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Kde chybí krok, má rozhraní nabídnout akci, ne vysvětlovat, proč to nejde. Tyhle testy hlídají,
// že odkazy „Nastavit…“ vedou na skutečnou kartu, že omluvy a texty v první osobě se nevrací
// a že místo „otevři tlačítkem výše“ stojí tlačítko přímo tam, kde je potřeba.

const koren = new URL('../', import.meta.url);
const zdroj = (p) => fs.readFile(new URL(p, koren), 'utf8');

async function klientskeSoubory() {
  const out = [];
  async function projdi(dir) {
    for (const e of await fs.readdir(new URL(dir, koren), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'i18n') await projdi(rel); }
      else if (e.name.endsWith('.js') && e.name !== 'whats-new-data.js') out.push(rel);
    }
  }
  await projdi('public/js');
  return out;
}

test('odkaz do Nastavení míří na kartu, která existuje', async () => {
  const settings = await zdroj('public/js/views/settings.js');
  const blok = settings.match(/const GROUPS = \[([\s\S]*?)\n\];/)?.[1];
  assert.ok(blok, 'GROUPS se v settings.js nenašel – uprav test spolu s ním');
  const karty = new Set([...blok.matchAll(/\[([^\]]*)\]\],?$/gm)].flatMap((m) => [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1])));
  assert.ok(karty.has('extension') && karty.has('notifications') && karty.has('cloud'), [...karty].join(', '));
  assert.match(settings, /const CILE_SKOKU = new Set\(GROUPS\.flatMap/, 'skočit se dá na každou kartu Nastavení');

  const cile = [];
  for (const soubor of await klientskeSoubory()) {
    const kod = await zdroj(soubor);
    for (const m of kod.matchAll(/data-karta="([\w-]+)"/g)) cile.push([soubor, m[1]]);
    for (const m of kod.matchAll(/karta: '([\w-]+)'/g)) cile.push([soubor, m[1]]);
    for (const m of kod.matchAll(/data-karta="\$\{[^}]*\}"/g)) {
      for (const x of m[0].matchAll(/'([\w-]+)'/g)) cile.push([soubor, x[1]]);
    }
  }
  assert.ok(cile.length >= 10, `odkazů s cílovou kartou je jen ${cile.length}`);
  for (const [soubor, karta] of cile) assert.ok(karty.has(karta), `${soubor}: karta „${karta}“ v Nastavení není`);

  const app = await zdroj('public/js/app.js');
  assert.match(app, /closest\('a\[data-karta\]'\)[\s\S]{0,120}goToSettings\(karta\.dataset\.karta\)/, 'klik na odkaz s kartou musí skočit na kartu');
});

test('Přehled bez rozpočtu nabídne jeho nastavení a Útrata dialog rovnou otevře', async () => {
  const overview = await zdroj('public/js/views/overview.js');
  assert.match(overview, /href="#\/utrata\?rozpocty=1">\$\{tr\('Nastavit rozpočet'\)\}/);
  const spend = await zdroj('public/js/views/spend.js');
  assert.match(spend, /function mount\(el, _params, query\) \{\n\s+v\.el = el;\n\s+v\.rozpocty = query\?\.get\('rozpocty'\) === '1';/);
  assert.match(spend, /if \(v\.rozpocty && billingConnected\) \{\n\s+v\.rozpocty = false;\n\s+[^\n]*\n\s+history\.replaceState\(null, '', '#\/utrata'\);\n\s+openBudgets\(/,
    'dialog se otevře jednou a adresa se vrátí na Útratu');
  assert.match(spend, /query\(q\) \{\n\s+v\.rozpocty = q\?\.get\('rozpocty'\) === '1';/, 'funguje i když Útrata už je otevřená');
});

test('agent, který čeká na odpověď, má tlačítko k otevření přímo v pruhu', async () => {
  const session = await zdroj('public/js/views/session.js');
  const banner = session.slice(session.indexOf("fill(el, 'banner'"), session.indexOf("fill(el, 'live'"));
  assert.match(banner, /s\.status === 'needs_input'[\s\S]*?s\.open\?\.length \? `<div class="banner-actions">\$\{openButtons\(s, \{ small: true \}\)\}<\/div>` : `[^`]*howToAnswer\(s\)/,
    'tlačítka z nabídky serveru (všechna – hlavička je pak už neopakuje), věta jen když žádné tlačítko není');
});

test('rozhraní se neomlouvá a nemluví v první osobě', async () => {
  const zakazane = [
    /tlačítkem (výše|nahoře)/, /níže v části/, /už čtu/, /číst neumím/, /\bpřečtu\b/, /\bnemáme\b/, /\bukážeme\b/,
    /\bověřujeme\b/, /\bzkusíme\b/i, /\bupozorníme\b/i, /\bposíláme\b/, /\bnepřepíšeme\b/, /\bneukazujeme\b/,
    /\bnebudu\b/, /Použil jsem/, /\bneumíme\b/, /\bnevíme\b/, /\bZkontrolujeme\b/, /\bdostaneme\b/,
    /Běží na tvých předplatných/, /nic nenastavuješ/,
  ];
  const en = (await import('../public/js/i18n/en.js')).default;
  const texty = [...Object.keys(en.texty), ...Object.keys(en.server)];
  for (const t of texty) for (const z of zakazane) assert.doesNotMatch(t, z, `text rozhraní: „${t}“`);
  const ext = await zdroj('extension/i18n.js');
  for (const z of zakazane) assert.doesNotMatch(ext, z, 'okno rozšíření');
});
