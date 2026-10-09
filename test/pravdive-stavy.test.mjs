import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createSession, deriveStatus, summarize, pushEntry } from '../src/model.js';
import { statusPill, vetaStavu } from '../public/js/ui.js';
import { STATUS } from '../public/js/format.js';
import { stavRobota, vetaRobota } from '../public/js/robot-bubliny.js';

// Pravdivé stavy v rozhraní (0.45.1): karta v „Právě teď“ nesla u každé konverzace se stavem
// `waiting` štítek „Hotovo“ – i když agent spadl uprostřed práce (stale) nebo vůbec neodpověděl.
// Na Agentech měla stejná konverzace štítek „Čeká na zadání“. Jeden stav, dvě jména, a jedno z nich
// nepravdivé.

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const HOUR = 3600e3;

function konverzace(now) {
  const s = createSession({ connector: 'claude-code', localId: 'x', provider: 'anthropic', app: 'Claude Code' });
  s.title = 'Úprava webu';
  s.lastAt = now - 60e3;
  return s;
}

test('model: „done“ jen u agenta, který odpověděl a jehož tah neskončil vypršením', () => {
  const now = Date.now();
  const bezOdpovedi = konverzace(now);
  assert.deepEqual(deriveStatus(bezOdpovedi, now), { status: 'waiting', reason: 'Zatím bez odpovědi agenta', stale: false, done: false });

  const stale = konverzace(now);
  pushEntry(stale, { at: now - 40 * 60e3, role: 'assistant', text: 'Začínám' });
  Object.assign(stale, { running: true, runningAt: now - 40 * 60e3, staleMs: 30 * 60e3 });
  assert.deepEqual(deriveStatus(stale, now), { status: 'waiting', reason: 'Delší dobu bez aktivity', stale: true, done: false });

  const hotovo = konverzace(now);
  pushEntry(hotovo, { at: now - 60e3, role: 'assistant', text: 'Hotovo' });
  assert.deepEqual(deriveStatus(hotovo, now), { status: 'waiting', reason: 'Hotovo, čeká na další zadání', stale: false, done: true });

  // Pracující agent ani agent, který čeká na tvé rozhodnutí, „hotový“ není.
  Object.assign(hotovo, { running: true, runningAt: now - 1000 });
  assert.equal(summarize(hotovo, now, 24 * HOUR).done, false);
  Object.assign(hotovo, { running: false, pending: { kind: 'permission', text: 'Smím?', at: now } });
  assert.equal(summarize(hotovo, now, 24 * HOUR).done, false);
  // Ukončená konverzace se taky nevydává za doběhlou práci.
  Object.assign(hotovo, { pending: null, ended: true });
  assert.equal(summarize(hotovo, now, 24 * HOUR).done, false);

  assert.equal(summarize(stale, now, 24 * HOUR).done, false, 'souhrn pro klienta nese příznak');
  assert.equal(summarize(konverzace(now), now, 24 * HOUR).done, false);
});

test('karta „Právě teď“: štítek je stejný jako na Agentech, „Hotovo“ jen u doběhlého agenta', () => {
  const now = Date.now();
  const bezOdpovedi = summarize(konverzace(now), now, 24 * HOUR);
  const staleSession = konverzace(now);
  pushEntry(staleSession, { at: now - 40 * 60e3, role: 'assistant', text: 'Začínám' });
  Object.assign(staleSession, { running: true, runningAt: now - 40 * 60e3, staleMs: 30 * 60e3 });
  const stale = summarize(staleSession, now, 24 * HOUR);
  const hotovaSession = konverzace(now);
  pushEntry(hotovaSession, { at: now - 60e3, role: 'assistant', text: 'Hotovo' });
  const hotova = summarize(hotovaSession, now, 24 * HOUR);

  for (const s of [bezOdpovedi, stale, hotova]) {
    const pill = statusPill(s.status, 'pb-stav');
    assert.match(pill, /class="pill pb-stav" data-status="waiting"/, 'barva ze stejného .pill[data-status] jako na Agentech');
    assert.ok(pill.includes(STATUS.waiting.label), 'jméno ze STATUS, ne z vlastního slovníku');
    assert.doesNotMatch(pill, /Hotovo/);
  }
  assert.equal(vetaStavu(bezOdpovedi), 'Zatím bez odpovědi agenta');
  assert.equal(vetaStavu(stale), 'Delší dobu bez aktivity');
  assert.equal(vetaStavu(hotova), 'Hotovo, čeká na další zadání');
  assert.equal(vetaStavu({ status: 'working', activity: 'Upravuje app.js' }), 'Upravuje app.js');
  assert.equal(vetaStavu({ status: 'failed', reason: 'Failed to authenticate' }), 'Failed to authenticate');
});

test('Přehled nemá vlastní slovník stavů a nedoběhlé čekání přizná všude, kde je štítek', async () => {
  const prehled = await zdroj('public/js/views/overview.js');
  assert.match(prehled, /statusPill\(s\.status, 'pb-stav'\)/);
  assert.match(prehled, /esc\(vetaStavu\(s\)\)/);
  assert.doesNotMatch(prehled, /waiting: tr\('Hotovo'\)/, 'čekání se nesmí jmenovat „Hotovo“');
  assert.doesNotMatch(prehled, /data-ton="\$\{s\.status/, 'barva štítku jen z .pill[data-status]');
  assert.match(prehled, /s\.status === 'waiting' && !s\.done \? ' data-done="false"'/);
  const css = await zdroj('public/workbench.css');
  assert.doesNotMatch(css, /\.pb-stav\[data-ton/, 'druhá sada barev stavu');
  const agenti = await zdroj('public/js/views/agents.js');
  assert.match(agenti, /s\.status === 'waiting' && !s\.done && s\.reason\) sub = `\$\{esc\(s\.reason\)\}/);
  const detail = await zdroj('public/js/views/session.js');
  assert.match(detail, /statusPill\(s\.status\)\}\$\{s\.status === 'waiting' && !s\.done && s\.reason \? `<span>\$\{esc\(s\.reason\)\}<\/span>`/);
  assert.match(await zdroj('public/js/home-studio.js'), /s\.status === 'waiting' && !s\.done \? ' data-done="false"'/);
});

test('robot u čekání, které nedoběhlo, neříká „hotovo“ a nehlásí se sám', async () => {
  const prvek = (atributy) => ({
    closest: (sel) => {
      const m = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      const k = m[1].replace(/^data-/, '');
      const v = atributy[k];
      if (v === undefined || (m[2] !== undefined && v !== m[2])) return null;
      return { dataset: atributy };
    },
  });
  assert.equal(stavRobota(prvek({ status: 'waiting' })), 'waiting');
  assert.equal(stavRobota(prvek({ status: 'waiting', done: 'false' })), 'ticho');
  assert.equal(stavRobota(prvek({ state: 'waiting', done: 'false' })), 'ticho', 'portrét v detailu');
  for (let i = 0; i < 20; i++) assert.doesNotMatch(vetaRobota('ticho', { nahoda: () => 1 }), /[Hh]otov|volné ruce|Připraven/);
  const kod = await zdroj('public/js/robot-bubliny.js');
  assert.match(kod, /const DULEZITE = new Set\(\['needs_input', 'failed', 'limited', 'waiting'\]\);/, 'vypršelý tah se sám neohlásí');
});

// Detail konverzace držel `v.odpoved` a `v.odpovedStav` z předchozí konverzace: do doběhnutí load()
// (a po jeho selhání natrvalo) ukazoval formulář nebo důvod z A, a obnovOdpoved se pro B při stejném
// stavu obou konverzací vůbec nespustilo.
test('detail konverzace při vstupu i odchodu zapomene stav odpovědi', async () => {
  const kod = await zdroj('public/js/views/session.js');
  const mount = kod.slice(kod.indexOf('function mount('), kod.indexOf('el.innerHTML', kod.indexOf('function mount(')));
  assert.match(mount, /Object\.assign\(v, \{[^}]*odpoved: null[^}]*\}\)/, 'mount nuluje odpověď');
  assert.match(mount, /Object\.assign\(v, \{[^}]*odpovedStav: null[^}]*\}\)/, 'mount nuluje stav, pro který se odpověď zjišťovala');
  const unmount = kod.slice(kod.indexOf('unmount() {'));
  assert.match(unmount, /Object\.assign\(v, \{[^}]*odpoved: null, odpovedStav: null[^}]*\}\)/, 'unmount nuluje obojí');
  assert.match(kod, /if \(v\.odpovedStav !== s\.status\) \{ v\.odpovedStav = s\.status; obnovOdpoved\(\); \}/, 'obnovení podle stavu zůstává');
});
