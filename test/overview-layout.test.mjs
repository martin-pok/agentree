import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Přehled měl dřív sloupcovou sazbu (`columns: 2`). O tom, co skončí nahoře v pravém sloupci,
// rozhodoval prohlížeč podle výšky bloků – takže se s jinou šířkou okna nebo jinými daty nad
// widget „Kam dnes šly tokeny" vysunul cizí blok i s prázdnou mezerou. Tyhle testy hlídají,
// že rozvržení zůstane určené kódem, ne náhodou.

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const html = await zdroj('public/js/views/overview.js');
const css = await zdroj('public/styles.css');

const mrizka = html.slice(html.indexOf('<div class="ov">'), html.indexOf('<section class="ov-wide"'));

test('Přehled má dva sloupce s pevně daným obsahem', () => {
  const sloupce = mrizka.split('<div class="ov-col bal-col">').slice(1);
  assert.equal(sloupce.length, 2, 'sloupce musí být právě dva');
  for (const s of sloupce) assert.match(s, /<section/, 'prázdný sloupec nedává smysl');
});

test('žádný blok nevisí v mřížce mimo sloupec', () => {
  const mimo = mrizka.split('<div class="ov-col bal-col">')[0];
  assert.doesNotMatch(mimo, /<section/, 'sekce patří do sloupce, jinak si její místo určí prohlížeč');
});

test('widget „Kam dnes šly tokeny" je první v pravém sloupci', () => {
  const pravy = mrizka.split('<div class="ov-col bal-col">')[2];
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
// mezeru 40 px – díru uprostřed stránky, kterou uživatel vidí a nepozná její příčinu.
test('blok bez obsahu ve sloupci zmizí i s mezerou', () => {
  assert.match(css, /\.ov-col > section:empty \{ display: none; \}/);
});

test('karty mají přirozenou výšku bez natahování grafu podle druhého sloupce', () => {
  assert.match(css, /\.ov \{[^}]*align-items: start/);
  assert.doesNotMatch(css, /\.ov-col > \*:last-child \{[^}]*flex: 1 1 auto/);
});

// Sloupce mají podle dat různou výšku. Pohyblivé sekce (data-float) proto sedí tam, kde je míň
// místa, ale jen při znatelném zlepšení – jinak by karty skákaly při každé změně dat.
import { balanceColumns } from '../public/js/balance.js';

function fakeCol(name) {
  const c = { name, children: [], append(el) { if (el.parentElement) el.parentElement.children = el.parentElement.children.filter((x) => x !== el); el.parentElement = c; c.children.push(el); } };
  return c;
}
function fakeBox(baseA, baseB, floatHeights, cols = 'a b') {
  const a = fakeCol('a');
  const b = fakeCol('b');
  const mk = (h) => ({ offsetHeight: h, parentElement: null });
  a.append(mk(baseA));
  b.append(mk(baseB));
  const floats = floatHeights.map((h) => { const f = mk(h); b.append(f); return f; });
  const box = { _floats: floats, querySelectorAll: () => [a, b], style: {} };
  globalThis.getComputedStyle = (el) => (el === box ? { gridTemplateColumns: cols } : { rowGap: '32px' });
  return { box, a, b, floats };
}

test('pohyblivá sekce přejde do kratšího sloupce', () => {
  const { box, a, floats } = fakeBox(600, 900, [200]);
  assert.equal(balanceColumns(box), true);
  assert.equal(floats[0].parentElement, a, 'levý sloupec je kratší, sekce přejde vlevo');
  const stay = fakeBox(900, 600, [200]);
  assert.equal(balanceColumns(stay.box), false, 'pravý sloupec je kratší, sekce zůstane');
});

test('bez znatelného zlepšení se nic nehýbe a na jednom sloupci zůstává pořadí', () => {
  const { box, b, floats } = fakeBox(700, 650, [200]);
  assert.equal(balanceColumns(box), false, 'rozdíl je menší než práh, karta neskáče');
  assert.equal(floats[0].parentElement, b);
  const one = fakeBox(900, 600, [200, 300], '1fr');
  one.floats[0].parentElement = one.a; one.a.children.push(one.floats[0]);
  balanceColumns(one.box);
  assert.ok(one.floats.every((f) => f.parentElement === one.b), 'na telefonu jde vše do jednoho proudu');
});

test('dvě pohyblivé sekce se rozdělí tak, aby byl rozdíl nejmenší', () => {
  const { box, a, b, floats } = fakeBox(873, 660, [250, 500]);
  balanceColumns(box);
  const h = (col) => col.children.reduce((s, c) => s + c.offsetHeight + 32, 0);
  assert.ok(Math.abs(h(a) - h(b)) < 120, `rozdíl ${Math.abs(h(a) - h(b))} px`);
});
