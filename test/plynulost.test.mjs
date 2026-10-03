import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Plynulost rozhraní (0.33.0). Měřené pojistky (snímky, mutace, kotva, úniky) jsou v
// scripts/qa-desktop.mjs#zkontrolujPlynulost; tady jsou ty, které jdou ohlídat ze zdroje.

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('pohyb má jednu sadu délek a jednu křivku: žádné „transition: all“ ani délka zapsaná číslem', async () => {
  const css = await zdroj('public/styles.css');
  for (const t of ['--motion-press', '--motion-response', '--motion-enter', '--motion-move', '--motion-value']) assert.match(css, new RegExp(`${t}: \\d+ms;`), `chybí token ${t}`);
  assert.doesNotMatch(css, /transition:\s*all\b/, 'transition: all animuje i rozvržení a stíny, které se animovat nemají');
  const prechody = [...css.matchAll(/transition:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((v) => v !== 'none' && !v.startsWith('none '));
  assert.ok(prechody.length > 40, 'přechody se nenašly');
  for (const v of prechody) {
    for (const cast of v.split(',')) {
      assert.doesNotMatch(cast, /(^|\s)\.?\d+(\.\d+)?m?s\b/, `délka přechodu má být token, ne číslo: „${v}“`);
      assert.match(cast, /var\(--motion-[a-z]+\)/, `přechod bez tokenu délky: „${v}“`);
      assert.match(cast, /var\(--ease(-settle)?\)|cubic-bezier/, `přechod bez společné křivky: „${v}“`);
    }
  }
});

test('nekonečná animace jezdce průběhu jede transformací, ne vlastností left', async () => {
  const css = await zdroj('public/styles.css');
  const slide = css.match(/@keyframes slide \{[^}]*\}[^}]*\}/)?.[0] || '';
  assert.match(slide, /translateX/);
  for (const k of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?\})\s*\}/g)) {
    assert.doesNotMatch(k[1], /(^|[{;\s])(left|top|right|bottom|width|height|margin[\w-]*)\s*:/, `klíčové snímky animují rozvržení: ${k[0].slice(0, 80)}`);
  }
});

test('pruhy hodnot jsou izolované, aby plynulá změna šířky nepřepočítávala celou stránku', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.meter-track, \.hb-track, \.row-progress, \.progress-track, \.budget-track, \.lwin-bar, \.onboard-track \{ contain: strict; \}/);
});

test('živé seznamy se slučují, ne přepisují, a řádky mají klíč', async () => {
  const ui = await zdroj('public/js/ui.js');
  assert.match(ui, /export function sloucit\(el, html/);
  assert.match(ui, /if \(slouceni && el\.firstChild\)/);
  const agenti = await zdroj('public/js/views/agents.js');
  assert.match(agenti, /fill\(el, name, html, \{ sloucit: true/);
  assert.equal((agenti.match(/data-key="\$\{esc\(s\.id\)\}"/g) || []).length, 2, 'oba druhy řádku Agentů mají klíč');
  assert.doesNotMatch(agenti.slice(agenti.indexOf('function update()')), /[^.]fill\(el, '/, 'oblasti Agentů jdou přes slučování');
  const prehled = await zdroj('public/js/views/overview.js');
  for (const r of ['hero', 'decisions', 'meter', 'today-apps', 'limits', 'activity', 'timeline', 'spend', 'runtimes']) assert.match(prehled, new RegExp(`zivy\\(el, '${r}'`), `oblast Přehledu ${r} se slučuje`);
  assert.match(ui, /<li data-key="\$\{esc\(s\.id\)\}"><a class="act-item"/);
  assert.match(ui, /class="decision\$\{limited \? ' is-limit' : ''\}" data-key=/);
});

test('slučování nepřepíše rozepsané pole, otevřený <details> ani běžící animované číslo', async () => {
  const ui = await zdroj('public/js/ui.js');
  const telo = ui.slice(ui.indexOf('function sloucitUzel'), ui.indexOf('// Překreslení oblasti nesmí vzít fokus'));
  assert.match(telo, /const zaostreno = a === document\.activeElement/);
  assert.match(telo, /else if \(!zaostreno\) a\.value =/);
  assert.match(telo, /detaily && at\.name === 'open'/);
  assert.match(telo, /a\.hasAttribute\('data-tween'\) && a\._tweenTo !== undefined\) return/);
  assert.match(telo, /a\.hasAttribute\('data-region'\)\) a\._html = undefined/);
});

test('přesun řádku je jen transform a opacity a respektuje omezený pohyb i posouvání', async () => {
  const ui = await zdroj('public/js/ui.js');
  const presun = ui.slice(ui.indexOf('const chcePresun'), ui.indexOf('function sloucitDeti'));
  assert.match(presun, /prefers-reduced-motion: reduce/);
  assert.match(presun, /is-scrolling/);
  const animace = [...presun.matchAll(/\.animate\(\[([^\]]+)\]/g)].map((m) => m[1]);
  assert.ok(animace.length >= 2);
  for (const a of animace) assert.doesNotMatch(a.replace(/transform|opacity/g, ''), /[a-z]+:/i, `dojezd animuje něco jiného než transform/opacity: ${a}`);
  // Kotva: WebKit overflow-anchor nedodrží, proto vlastní korekce, která nepřeruší dojezd kolečka.
  assert.match(ui, /function ukotvi\(el, pred\)/);
  assert.match(ui, /posunSObsahem\(posuny\[i\]\)/);
  const plynule = await zdroj('public/js/plynule-posouvani.js');
  assert.match(plynule, /export function posunSObsahem\(dy\)/);
  assert.match(plynule, /poloha \+= dy;/);
  // Konec dojezdu má nejmenší rychlost: jinak WebKit stál na celém pixelu a stránka se o 1–2 px
  // pohnula až dlouho po zdánlivém zastavení.
  assert.match(plynule, /const MIN_RYCHLOST = 0\.12;/);
  assert.match(plynule, /Math\.max\(Math\.abs\(zbyva\) \* \(1 - Math\.exp\(-dt \/ DOJEZD_MS\)\), MIN_RYCHLOST \* dt\)/);
  // Kotva i kolem celého živého překreslení obrazovky: počty ve filtrech nad seznamem mění výšku.
  // Nativní kotva je vypnutá: WebKit ji u zlomkových výšek řádků zaokrouhloval střídavě a okno
  // donekonečna kmitalo o 1 px. Kotvu drží jen ui.js#kotva.
  assert.match(await zdroj('public/styles.css'), /html \{[^}]*overflow-anchor: none;[^}]*\}/);
  const app = await zdroj('public/js/app.js');
  assert.match(app, /const drzKotvu = kotva\(viewEl\);\s*\n\s*try \{\s*\n\s*current\?\.update\(topics\);[\s\S]*?drzKotvu\(\);/);
});

test('změna motivu je jeden okamžitý krok bez View Transitions (WebKit je skládal rozbitě)', async () => {
  const a = await zdroj('public/js/appearance.js');
  assert.match(a, /root\.classList\.add\('meni-motiv'\)/);
  assert.match(a, /setTimeout\(hotovo, POJISTKA_MS\)/, 'třída se sundá i ve skrytém okně');
  assert.doesNotMatch(a.replace(/\/\/.*$/gm, ''), /startViewTransition/);
  const css = await zdroj('public/styles.css');
  assert.match(css, /html\.meni-motiv \*, html\.meni-motiv \*::before, html\.meni-motiv \*::after \{ transition: none !important; \}/);
});

test('přetahování karet po sobě uklidí posluchač na window (únik celé mřížky)', async () => {
  const r = await zdroj('public/js/reorder.js');
  assert.match(r, /window\.addEventListener\('keydown', [\s\S]*?signal: konec\.signal \}\)/);
  assert.match(r, /zrus: \(\) => konec\.abort\(\)/);
  assert.match(await zdroj('public/js/views/projects.js'), /unmount: \(\) => \{ v\.reorder\?\.zrus\(\);/);
  assert.match(await zdroj('public/js/views/project.js'), /v\.reorder\?\.zrus\(\);/);
  assert.match(await zdroj('public/js/views/session.js'), /v\.sideDrag\?\.zrus\(\);/);
});

test('formátovače času a částek jsou sdílené a dávají stejný text jako dřív', async () => {
  const f = await import('../public/js/format.js');
  const ts = Date.UTC(2026, 9, 3, 14, 5);
  const { LOCALE } = await import('../public/js/i18n.js');
  assert.equal(f.timeHM(ts), new Date(ts).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }));
  assert.equal(f.dateTime(ts), new Date(ts).toLocaleString(LOCALE, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }));
  assert.equal(f.dateLong(ts), new Date(ts).toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric', year: 'numeric' }));
  assert.equal(f.timeHM(Number.NaN), 'Invalid Date', 'neplatné datum nespadne');
  assert.equal(f.dateTime(0), '–');
  assert.equal(f.fmtNum(1234567.4), (1234567).toLocaleString(LOCALE));
  assert.equal(f.fmtMoney(20, 'USD'), new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(20));
  assert.equal(f.fmtMoney(5, 'XXXX-neplatna'), `5 XXXX-neplatna`, 'neplatná měna se vypíše textem');
  const zdrojF = await zdroj('public/js/format.js');
  assert.doesNotMatch(zdrojF, /new Intl\.(NumberFormat|DateTimeFormat)\(LOCALE/, 'formátovač se nevytváří při každém volání');
});

test('animované číslo přepisuje data textového uzlu a odznaky zapisují jen změnu', async () => {
  const ui = await zdroj('public/js/ui.js');
  assert.match(ui, /function nastavText\(el, t\)/);
  assert.doesNotMatch(ui.slice(ui.indexOf('export function tweenAll'), ui.indexOf('/* ---------- Nástup obrazovky')), /el\.textContent = fmt/);
  const app = await zdroj('public/js/app.js');
  assert.match(app, /if \(b\.textContent !== text\) b\.textContent = text;/);
});

test('Agenti vykreslí nejdřív první obrazovku řádků a zbytek po dávkách po nástupu', async () => {
  const a = await zdroj('public/js/views/agents.js');
  assert.match(a, /const PRVNI_DAVKA = 32;/);
  assert.match(a, /list\.slice\(0, v\.limit\)/);
  assert.match(a, /setTimeout\(krok, DOPLNIT_PO_NASTUPU_MS\)/);
  assert.match(a, /addEventListener\('scroll', krok, \{ once: true, passive: true, signal: konec\.signal \}\)/);
  assert.match(a, /setTimeout\(krok, 150\)/, 'pojistka pro skryté okno, kde rAF neběží');
});

test('nástup obrazovky začíná v prvním snímku a dotyková obrazovka nenechá viset zvednutí', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.view\.is-entering \[data-enter\] \{ animation: rise 480ms var\(--ease-settle\) both; animation-delay: calc\(max\(var\(--i, 0\) - 1, 0\) \* 40ms\); \}/);
  assert.match(css, /@media \(hover: none\) \{\s*\.skill:hover, \.appearance-option:hover, \.avatar-pick:hover, \.pcard:hover/);
});
