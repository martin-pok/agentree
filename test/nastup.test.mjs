import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Nástup obrazovky: čísla vyjedou do okének jako na počítadle (public/js/ui.js), měřidla se naplní
// (public/styles.css). Tyhle testy drží to, co se na snímcích ověřovalo okem: počítadlo nikdy
// neukáže víc, než je cíl, skončí přesně na hodnotě, nerozbije formát a čtečka přečte celé číslo.

globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const { odoSloupce, odometrHtml } = await import('../public/js/ui.js');
const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

// Co počítadlo ukazuje v poměrné fázi e (0–1): každý váleček je ve stejné fázi své dráhy.
const cteni = (text, e) => odoSloupce(text).map(({ znak, sled }) => {
  if (!sled) return znak;
  const c = sled[Math.floor(e * (sled.length - 1) + 1e-9)];
  return c ?? ' ';
}).join('');

test('počítadlo skončí přesně na konečné hodnotě a formát nechá beze změny', () => {
  for (const text of ['70 %', '4 209 Kč', '0', '861 tis.', '1,2 mil.', '3', '100 %', '12 345 Kč']) {
    assert.equal(cteni(text, 1), text, text);
    const sloupce = odoSloupce(text);
    assert.equal(sloupce.map((s) => s.znak).join(''), text, `${text}: znaky mimo číslice zůstávají`);
    for (const s of sloupce.filter((x) => x.sled)) {
      assert.equal(s.sled[0], null, `${text}: začíná prázdným políčkem, ne nulou`);
      assert.equal(s.sled.at(-1), Number(s.znak), `${text}: váleček končí na své číslici`);
    }
  }
});

test('číslo vyjede z prázdna – na začátku nesvítí žádné nuly', () => {
  assert.equal(cteni('4 209 Kč', 0), '      Kč');
  assert.equal(cteni('70 %', 0), '   %');
});

test('nejvyšší řád jde k cíli rovnou, bez přetočení – číslo nikdy nepřestřelí', () => {
  // Dřív se desítky u „70 %“ protočily celé kolo navíc a uprostřed nástupu svítilo „77 %“.
  const [desitky] = odoSloupce('70 %').filter((s) => s.sled);
  assert.deepEqual(desitky.sled, [null, 1, 2, 3, 4, 5, 6, 7]);
  for (let e = 0; e <= 1.0001; e += 0.01) {
    const nejvyssi = Number(cteni('70 %', e).trim()[0]);
    assert.ok(!(nejvyssi > 7), `v e=${e.toFixed(2)} se nesmí objevit desítky nad 7`);
  }
  // Nižší řády se točí jen tolikrát, kolikrát by se točily při napočítání (nejvýš dvakrát).
  const [, stovky] = odoSloupce('1 209').filter((s) => s.sled);
  assert.equal(stovky.sled.length, 1 + 10 + 2, 'stovky u 1 209 udělají jedno kolo a dojedou na 2');
});

test('řády se usazují zprava doleva a čtečka dostane celé číslo', () => {
  const html = odometrHtml('4 209 Kč');
  const rady = [...html.matchAll(/--odo-r:(\d)/g)].map((m) => Number(m[1]));
  assert.deepEqual(rady, [3, 2, 1, 0], 'nejvyšší řád dojede poslední');
  assert.match(html, /<span class="odo-cislo" aria-hidden="true">/);
  assert.match(html, /<span class="sr-only">4 209 Kč<\/span>$/);
  // Viditelné jsou konečné číslice (okénka) a znaky mezi nimi: musí dát přesně původní text –
  // žádná mezera navíc ze značek, žádná chybějící.
  const viditelne = html.replace(/<span class="odo-s"[^>]*>(?:<span>[^<]*<\/span>)*<\/span>/g, '').replace(/<span class="sr-only">.*$/, '').replace(/<[^>]+>/g, '');
  assert.equal(viditelne, '4 209 Kč');
  assert.equal(odometrHtml('<b>1</b>').includes('<b>'), false, 'text se escapuje');
});

test('nástup se spustí jednou po otevření obrazovky a omezení pohybu ho vypne', async () => {
  const app = await zdroj('public/js/app.js');
  assert.match(app, /nastupCeka = !reduceMotion\.matches;\s*\n\s*current\.mount/, 'nástup se chystá jen při otevření obrazovky, ne při každém vykreslení');
  assert.match(app, /if \(nastupCeka\) zacniNastup\(\);/);
  assert.match(app, /el\.classList\.remove\('is-entering'\);\s*\n\s*dokonciCisla\(cisla\);/, 'po doběhnutí se is-entering sundá, aby živé aktualizace nic nerozpohybovaly');
  const css = await zdroj('public/styles.css');
  for (const pravidlo of ['.view.is-entering .gauge-fill', '.view.is-entering :is(.meter-track i', '.view.is-entering :is(.pgrid > .pcard']) {
    assert.ok(css.includes(pravidlo), `pohyb měřidel je vázaný na nástup: ${pravidlo}`);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.odo-s \{ animation: none;/);
  assert.match(await zdroj('public/js/charts.js'), /class="gauge-fill" pathLength="1"/, 'oblouk ukazatele má délku 1, aby se dal dokreslit');
});
