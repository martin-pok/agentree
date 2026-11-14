// Prohlídka aplikace (vlastník 14. 11. 2026): pár kroků nad skutečným rozhraním místo AI pomocníka,
// spustitelná znovu z Nastavení → Nápověda a z Pomocníka. Sama jen novému uživateli po úvodním okně.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('prohlídka: kroky míří na skutečná místa, poprvé sama, znovu z Nastavení i Pomocníka', async () => {
  const kod = await zdroj('public/js/prohlidka.js');
  for (const cil of ["'.launch'", `'[aria-labelledby="dec-h"]'`, "'.home-live'", `'.nav a[data-nav="agenti"]'`, "'#refresh-app'", "'.pm-fab'"]) assert.ok(kod.includes(cil), cil);
  assert.match(kod, /const najdi = \(krok\) => krok\.cil\.map\(\(s\) => document\.querySelector\(s\)\)\.find\(viditelny\)/, 'neviditelný cíl se přeskočí');
  assert.match(kod, /localStorage\.setItem\(UKAZANO, '1'\)/, 'sama jen poprvé');
  assert.match(kod, /addEventListener\('agenteeq-pruvodce-hotov', \(\) => \{\n    if \(navigator\.webdriver\) return;/, 'sama jen novému uživateli po úvodním okně, ne v testech');
  assert.match(kod, /e\.key === 'Escape'/);
  assert.match(kod, /role="dialog" aria-modal="true"/);
  const app = await zdroj('public/js/app.js');
  assert.match(app, /initProhlidka\(\);/);
  assert.match(await zdroj('public/js/views/settings.js'), /data-prohlidka>\$\{ICON\.spark\}\$\{tr\('Prohlídka aplikace'\)\}/);
  assert.match(await zdroj('public/js/robot-guide.js'), /class="pm-prohlidka" data-prohlidka/);
  const css = await zdroj('public/refinement.css');
  assert.match(css, /\.prohl-karta\.je-nahore/, 'na telefonu nezakryje spodní navigaci');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.prohl, \.prohl-svetlo, \.prohl-karta \{ transition: none; \} \}/);
});
