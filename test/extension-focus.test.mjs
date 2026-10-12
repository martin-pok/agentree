import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const popupPath = new URL('../extension/popup.js', import.meta.url);
const htmlPath = new URL('../extension/popup.html', import.meta.url);
const translationsPath = new URL('../extension/i18n.js', import.meta.url);
const popup = await fs.readFile(popupPath, 'utf8');
const html = await fs.readFile(htmlPath, 'utf8');

const begin = popup.indexOf('const FILTRY_KONVERZACI = new Set(');
const end = popup.indexOf('async function nactiKonverzace()', begin);
assert.ok(begin >= 0 && end > begin, 'use real popup focus code, not a reimplemented helper');

function env() {
  const selected = [];
  const controls = [
    { dataset: { filtr: 'vse' }, setAttribute(k, v) { selected.push([this.dataset.filtr, k, v]); } },
    { dataset: { filtr: 'odpovida' }, setAttribute(k, v) { selected.push([this.dataset.filtr, k, v]); } },
    { dataset: { filtr: 'pozor' }, setAttribute(k, v) { selected.push([this.dataset.filtr, k, v]); } },
  ];
  const list = { dataset: { podpis: 'old' } };
  const actions = {};
  const context = vm.createContext({
    $: id => id === 'konverzace' ? list : ({ querySelectorAll: () => controls, addEventListener: (kind, fn) => { actions[kind] = fn; } }),
    vykresliSeznam() { context.draws = (context.draws || 0) + 1; },
  });
  vm.runInContext(popup.slice(begin, end), context);
  const filter = (next, k, d = null, disabled = []) => vm.runInContext(
    'filtrKonverzaci = ' + JSON.stringify(next) + '; odpovidaFiltru(k,d,disabled)',
    Object.assign(context, { k, d, disabled }),
  );
  return { context, filter, controls, list, actions, selected };
}

test('extension status filters match the state shown to the user, not invented metrics', () => {
  const { filter } = env();
  const working = { site: 'chatgpt', generating: true, limit: false };
  const stopped = { site: 'claude', generating: false, limit: false };
  const limited = { site: 'gemini', generating: false, limit: true };
  const both = { site: 'gemini', generating: true, limit: true };
  assert.equal(filter('vse', working), true);
  assert.equal(filter('vse', stopped), true);
  assert.equal(filter('vse', limited), true);
  assert.equal(filter('odpovida', working), true);
  assert.equal(filter('odpovida', stopped), false);
  assert.equal(filter('odpovida', limited), false);
  assert.equal(filter('pozor', limited), true);
  assert.equal(filter('pozor', stopped), false);
  assert.equal(filter('pozor', both), false, 'replying takes priority over a stale limit');
});

test('extension filter uses fresh active-page diagnostics and respects disabled sites', () => {
  const { filter } = env();
  const cached = { site: 'chatgpt', generating: false, limit: true };
  assert.equal(filter('odpovida', cached, { site: 'chatgpt', generuje: true, limit: false }), true);
  assert.equal(filter('pozor', cached, { site: 'chatgpt', generuje: true, limit: false }), false);
  assert.equal(filter('odpovida', cached, { site: 'chatgpt', generuje: true }, ['chatgpt']), false);
  assert.equal(filter('pozor', cached, null, ['chatgpt']), false);
});

test('extension filter control keeps pressed state accessible and invalid states inert', () => {
  const { context, selected, list } = env();
  vm.runInContext("nastavFiltrKonverzaci('odpovida')", context);
  assert.equal(context.draws, 1);
  assert.deepEqual(selected.map(x => x[2]), ['false', 'true', 'false']);
  assert.equal('podpis' in list.dataset, false, 'the result list cannot use stale cached DOM');
  vm.runInContext("nastavFiltrKonverzaci('odpovida')", context);
  vm.runInContext("nastavFiltrKonverzaci('invalid')", context);
  assert.equal(context.draws, 1, 'invalid and unchanged values are no-op');
});

test('filter layout has bilingual accessible buttons and visible no-results explanation', async () => {
  const translations = await fs.readFile(translationsPath, 'utf8');
  for (const key of ['vse', 'odpovida', 'pozor']) {
    assert.match(html, new RegExp('data-filtr="' + key + '" aria-pressed="(?:true|false)"'));
    assert.match(html, new RegExp('data-filtr-pocet="' + key + '"'));
  }
  assert.match(html, /id="filtry-konverzaci" role="group" aria-label="Filtrovat chaty podle stavu"/);
  assert.match(html, /id="prazdne-konverzace" role="status" hidden/);
  assert.match(popup, /pocetOdpovida[\s\S]*pocetLimity/);
  assert.match(popup, /'Žádný webový chat právě neodpovídá\.'/);
  assert.match(popup, /'Žádný webový chat nehlásí limit\.'/);
  assert.match(translations, /'Filtrovat chaty podle stavu': 'Filter chats by status'/);
  assert.match(translations, /'Odpovídají': 'Replying'/);
  assert.match(translations, /'Limity': 'Limits'/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(html, /\.radek--tato::before\s*\{\s*content:/, 'avoid banned one-sided decorative strokes');
});
