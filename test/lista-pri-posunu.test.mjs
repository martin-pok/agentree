import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Horní lišta při posouvání (public/js/lista-pri-posunu.js): dolů schovat, nahoru vysunout
// s gradientem, na začátku stránky v toku. Prohlížeč ověřil vzhled a pohyb na 1440 i 375 px;
// tady se hlídá rozhodování o stavu a to, že CSS stavy existují.
const zdroj = (f) => fs.readFile(new URL(`../${f}`, import.meta.url), 'utf8');

function prostredi() {
  const posluchaci = {};
  const naListe = {};
  const kotvaTop = 32; // kde lišta v toku začíná (od začátku dokumentu)
  const win = {
    scrollY: 0,
    addEventListener: (t, f) => { posluchaci[t] = f; },
    removeEventListener: (t) => { delete posluchaci[t]; },
  };
  const notif = { hidden: true };
  let paleta = null;
  const nadpis = { matches: (s) => s === '.page-title' };
  const tlacitko = { matches: () => false };
  const doc = {
    activeElement: null,
    documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} } },
    createElement: () => ({ setAttribute() {}, remove() {}, getBoundingClientRect: () => ({ top: kotvaTop - win.scrollY }) }),
    addEventListener: (t, f) => { posluchaci[`doc-${t}`] = f; },
    removeEventListener() {},
    getElementById: (id) => (id === 'notif-pop' ? notif : null),
    querySelector: (s) => (s === '.palette:not([hidden])' ? paleta : null),
  };
  const lista = {
    before() {},
    parentElement: {},
    style: { setProperty() {} },
    getBoundingClientRect: () => ({ height: 44 }),
    contains: (el) => el === nadpis || el === tlacitko,
    addEventListener: (t, f) => { naListe[t] = f; },
    removeEventListener() {},
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.getComputedStyle = () => ({ top: '12px', paddingLeft: '56px', paddingRight: '56px' });
  globalThis.requestAnimationFrame = (f) => f();
  const posun = (y) => { win.scrollY = y; posluchaci.scroll(); return doc.documentElement.dataset.lista; };
  const klik = (cil) => posluchaci['doc-click']({ target: { closest: (sel) => (sel === '[data-jump]' && cil === 'jump' ? {} : null) } });
  return { klik, lista, koren: doc.documentElement, posun, doc, nadpis, tlacitko, notif, naListe, setPaleta: (p) => { paleta = p; } };
}

test('lišta: dolů schová, nahoru vysune, na začátku stránky stojí v toku', async () => {
  const { listaPriPosunu } = await import('../public/js/lista-pri-posunu.js');
  const p = prostredi();
  const zrus = listaPriPosunu({ lista: p.lista, koren: p.koren });
  assert.equal(p.koren.dataset.lista, 'nahore');
  assert.equal(p.posun(15), 'nahore', 'dokud ji stránka neminula, nic se neschovává');
  assert.equal(p.lista.inert, false);
  assert.equal(p.posun(400), 'skryta');
  assert.equal(p.lista.inert, true, 'schovaná lišta mimo okno nejde do Tabu ani do čtečky');
  assert.equal(p.posun(800), 'skryta');
  assert.equal(p.posun(795), 'skryta', 'malý posun zpět (setrvačnost) lištu nevysune');
  assert.equal(p.posun(780), 'vysunuta', 'souvislý posun nahoru přes práh ji vysune');
  assert.equal(p.lista.inert, false);
  assert.equal(p.posun(783), 'vysunuta', 'šum dolů ji hned neschová');
  assert.equal(p.posun(900), 'skryta');
  assert.equal(p.posun(-40), 'nahore', 'přetažení nad začátek (iOS) je pořád začátek');
  assert.equal(p.posun(1200), 'skryta');
  p.klik('jump');
  assert.equal(p.posun(700), 'skryta', 'skok aplikace na skupinu Nastavení lištu nevysune');
  p.klik('jinam');
  p.posun(900);
  zrus();
  assert.equal(p.koren.dataset.lista, undefined);
  assert.equal(p.lista.inert, false);
});

test('lišta: neschová se pod rukama – fokus z klávesnice, upozornění, hledání', async () => {
  const { listaPriPosunu } = await import('../public/js/lista-pri-posunu.js');
  const p = prostredi();
  listaPriPosunu({ lista: p.lista, koren: p.koren });
  assert.equal(p.posun(600), 'skryta');
  p.doc.activeElement = p.tlacitko; p.naListe.focusin();
  assert.equal(p.koren.dataset.lista, 'vysunuta', 'Tab do lišty ji ukáže');
  assert.equal(p.posun(1200), 'vysunuta', 'a dokud je v ní fokus, zůstane');
  p.doc.activeElement = p.nadpis;
  assert.equal(p.posun(1600), 'skryta', 'fokus na nadpisu (po přechodu obrazovky) lištu nedrží');
  p.doc.activeElement = null; p.notif.hidden = false;
  assert.equal(p.posun(1500), 'vysunuta');
  assert.equal(p.posun(2000), 'vysunuta', 'otevřená upozornění drží lištu');
  p.notif.hidden = true; p.setPaleta({});
  assert.equal(p.posun(2400), 'vysunuta', 'otevřené hledání drží lištu');
  p.setPaleta(null);
  assert.equal(p.posun(2800), 'skryta');
});

test('lišta: CSS stavy, gradient v barvě papíru a omezený pohyb', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /html\[data-lista='skryta'\] \.topbar \{ transform: translateY\(/);
  assert.match(css, /html\[data-lista='vysunuta'\] \.topbar::before \{ opacity: 1; \}/);
  assert.match(css, /\.topbar::before \{[^}]*linear-gradient\(to bottom, var\(--paper\)/, 'gradient z barvy papíru aktuálního vzhledu');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s+\.topbar \{ transition: none; \}\n\s+html\[data-lista='skryta'\] \.topbar \{ transform: none; opacity: 0; visibility: hidden; \}/,
    'omezený pohyb: lišta nevyjíždí, jen zmizí');
  const app = await zdroj('public/js/app.js');
  assert.match(app, /import \{ listaPriPosunu \} from '\.\/lista-pri-posunu\.js';/);
  assert.match(app, /\n\s*listaPriPosunu\(\);/);
});

test('Pomocník: Nový rozhovor dá viditelnou odezvu i při omezeném pohybu', async () => {
  const js = await zdroj('public/js/robot-guide.js');
  assert.match(js, /tl\.classList\.remove\('is-toci'\);\n\s+void tl\.offsetWidth;[^\n]*\n\s+tl\.classList\.add\('is-toci'\);/);
  const css = await zdroj('public/workbench.css');
  assert.match(css, /\.pm-novy\.is-toci svg \{ animation: pm-toci 600ms/);
  assert.match(css, /\.pm-novy\.is-toci svg \{ animation: pm-blik 400ms/);
});
