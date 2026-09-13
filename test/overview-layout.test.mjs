import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Přehled měl dřív sloupcovou sazbu (`columns: 2`). O tom, co skončí nahoře v pravém sloupci,
// rozhodoval prohlížeč podle výšky bloků — takže se s jinou šířkou okna nebo jinými daty nad
// widget „Kam dnes šly tokeny" vysunul cizí blok i s prázdnou mezerou. Tyhle testy hlídají,
// že rozvržení zůstane určené kódem, ne náhodou.

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const html = await zdroj('public/js/views/overview.js');
const css = await zdroj('public/styles.css');

const mrizka = html.slice(html.indexOf('<div class="ov">'), html.indexOf('<section class="ov-wide"'));

test('Přehled má dva sloupce s pevně daným obsahem', () => {
  const sloupce = mrizka.split('<div class="ov-col">').slice(1);
  assert.equal(sloupce.length, 2, 'sloupce musí být právě dva');
  for (const s of sloupce) assert.match(s, /<section/, 'prázdný sloupec nedává smysl');
});

test('žádný blok nevisí v mřížce mimo sloupec', () => {
  const mimo = mrizka.split('<div class="ov-col">')[0];
  assert.doesNotMatch(mimo, /<section/, 'sekce patří do sloupce, jinak si její místo určí prohlížeč');
});

test('widget „Kam dnes šly tokeny" je první v pravém sloupci', () => {
  const pravy = mrizka.split('<div class="ov-col">')[2];
  const prvni = pravy.indexOf('<section');
  assert.ok(prvni >= 0, 'pravý sloupec má mít sekce');
  assert.match(pravy.slice(prvni, prvni + 400), /Kam dnes šly tokeny/, 'nahoře v pravém sloupci má být tenhle widget');
});

test('mřížka Přehledu nepoužívá sloupcovou sazbu', () => {
  const pravidlo = css.match(/^\.ov \{[^}]*\}/m)?.[0] || '';
  assert.match(pravidlo, /display: grid/, 'sloupce určuje mřížka');
  assert.doesNotMatch(pravidlo, /[{;]\s*columns:/, 'sloupcová sazba rozhazovala bloky sama');
});

// Blok bez obsahu (žádná okna limitů) je neviditelný, ale v pružném sloupci by po sobě nechal
// mezeru 40 px — díru uprostřed stránky, kterou uživatel vidí a nepozná její příčinu.
test('blok bez obsahu ve sloupci zmizí i s mezerou', () => {
  assert.match(css, /\.ov-col > section:empty \{ display: none; \}/);
});

test('poslední karta ve sloupci dorovná rozdíl výšek', () => {
  assert.match(css, /\.ov-col > \*:last-child \{[^}]*flex: 1 1 auto/);
  assert.match(css, /\.ov-col > \*:last-child > \*:last-child \{ flex: 1 1 auto; \}/);
});
