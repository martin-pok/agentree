import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Přehled (Průběh dne a spotřeba) je nástěnka widgetů: uživatel je přesouvá a mění jim šířku.
// Rozvržení ale pořád určuje kód (board-pack.js), ne prohlížeč: řádky se skládají v pořadí,
// které zvolil uživatel, a v žádném řádku nesmí zůstat díra.

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const html = await zdroj('public/js/views/overview.js');
const css = await zdroj('public/refinement.css');
const { pack, decodeLayout, encodeLayout, mergeLayout, spanFromWidth, COLS, MIN_SPAN } = await import('../public/js/board-pack.js');

const widgety = [...html.matchAll(/<div class="widget" data-card="([a-z]+)">/g)].map((m) => m[1]);
const vychozi = [...html.slice(html.indexOf('const BOARD_DEFAULT'), html.indexOf('];', html.indexOf('const BOARD_DEFAULT'))).matchAll(/id: '([a-z]+)', span: (\d+)/g)].map((m) => ({ id: m[1], span: Number(m[2]) }));

test('každý blok Průběhu dne je widget a výchozí rozvržení pokrývá všechny', () => {
  assert.deepEqual(widgety, ['smena', 'kam', 'tokeny', 'aktivita', 'naklady', 'bezi', 'limity']);
  assert.deepEqual(vychozi.map((x) => x.id).sort(), [...widgety].sort());
  const mezi = html.slice(html.indexOf('<div class="home-board" data-board>'), html.indexOf('</div>\n`;', html.indexOf('data-board>')));
  assert.doesNotMatch(mezi.replace(/<div class="widget"[\s\S]*?\n {4}<\/div>/g, ''), /<section/, 'žádná sekce mimo widget – její místo by určil prohlížeč');
});

test('výchozí rozvržení: řádky bez děr, Kam dnes šly tokeny vedle Dnešní směny', () => {
  const p = pack(vychozi);
  const radky = {};
  for (const x of p) radky[x.row] = (radky[x.row] || 0) + x.span;
  assert.ok(Object.values(radky).every((n) => n === COLS), JSON.stringify(radky));
  assert.equal(p.find((x) => x.id === 'kam').row, p.find((x) => x.id === 'smena').row);
});

test('skládání: pořadí zůstává, každý řádek je plný a žádná šířka není pod minimem (náhodné rozvržení)', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < 500; k++) {
    const items = Array.from({ length: 1 + Math.floor(rnd() * 9) }, (_, i) => ({ id: `w${i}`, span: Math.floor(rnd() * 16) - 2 }));
    const p = pack(items);
    assert.deepEqual(p.map((x) => x.id), items.map((x) => x.id), 'pořadí se nemění');
    const radky = {};
    for (const x of p) { assert.ok(x.span >= MIN_SPAN && x.span <= COLS); radky[x.row] = (radky[x.row] || 0) + x.span; }
    assert.ok(Object.values(radky).every((n) => n === COLS), `díra v řádku: ${JSON.stringify(items)}`);
  }
});

test('uložené rozvržení: neznámé a poškozené položky se zahodí, nový widget přibude na konec', () => {
  assert.deepEqual(decodeLayout(['kam-6', 'smena-x', '<b>-6', 'tokeny-40', 'kam-6', 7, null]), [{ id: 'kam', span: 6 }, { id: 'tokeny', span: 12 }, { id: 'kam', span: 6 }]);
  const merged = mergeLayout(decodeLayout(['bezi-12', 'stary-6', 'kam-6', 'kam-8']), vychozi);
  assert.deepEqual(merged.map((x) => x.id), ['bezi', 'kam', 'smena', 'tokeny', 'aktivita', 'naklady', 'limity']);
  assert.equal(merged.find((x) => x.id === 'kam').span, 6, 'první výskyt platí');
  assert.ok(encodeLayout(merged).every((x) => /^[\w-]{1,40}$/.test(x)), 'server pouští jen [\\w-]{1,40}');
});

test('tažení za okraj se přichytí k celým sloupcům v mezích', () => {
  assert.equal(spanFromWidth(0, 80, 32), MIN_SPAN);
  assert.equal(spanFromWidth(6 * 80 + 5 * 32, 80, 32), 6);
  assert.equal(spanFromWidth(6 * 80 + 5 * 32 + 50, 80, 32), 6, 'méně než půl sloupce se nepřichytí');
  assert.equal(spanFromWidth(99999, 80, 32), COLS);
});

test('nástěnka je mřížka 12 sloupců, prázdný widget zmizí i s místem, na telefonu jeden sloupec', () => {
  assert.match(css, /\.home-board \{ display: grid; grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.widget\[hidden\] \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 880px\) \{\s*\.home-board \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.widget::after, \.widget-grip, \.widget-resize::before, \.widget-size \{ transition: none; \} \}/);
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
