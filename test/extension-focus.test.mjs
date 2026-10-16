import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Filtr časové osy okna rozšíření (Vše · Agenti · Chaty). Spouští se skutečný kód z popup.js,
// ne jeho přepis: filtr je čistě místní volba nad daty, která okno už má.
const popupPath = new URL('../extension/popup.js', import.meta.url);
const htmlPath = new URL('../extension/popup.html', import.meta.url);
const translationsPath = new URL('../extension/i18n.js', import.meta.url);
const popup = await fs.readFile(popupPath, 'utf8');
const html = await fs.readFile(htmlPath, 'utf8');

const begin = popup.indexOf('const FILTRY_KONVERZACI = new Set(');
const end = popup.indexOf('async function nactiKonverzace()', begin);
assert.ok(begin >= 0 && end > begin, 'use real popup filter code, not a reimplemented helper');

function env() {
  const selected = [];
  const controls = ['vse', 'agenti', 'chaty'].map((filtr) => ({ dataset: { filtr }, setAttribute(k, v) { selected.push([filtr, k, v]); } }));
  const list = { dataset: { podpis: 'old' } };
  const context = vm.createContext({
    $: (id) => (id === 'konverzace' ? list : { querySelectorAll: () => controls, addEventListener: () => {} }),
    vykresliOsu(o) { context.draws = (context.draws || 0) + 1; context.kaskada = o?.kaskada; },
  });
  vm.runInContext(popup.slice(begin, end), context);
  const filter = (next, polozka) => vm.runInContext(`filtrKonverzaci = ${JSON.stringify(next)}; odpovidaFiltru(p)`, Object.assign(context, { p: polozka }));
  return { context, filter, list, selected };
}

test('extension timeline filter splits agents and browser chats by real kind', () => {
  const { filter } = env();
  const agent = { druh: 'agent', klic: 'a:codex:1' };
  const chat = { druh: 'chat', klic: 'c:chatgpt:a' };
  const webSession = { druh: 'chat', klic: 'a:web:claude:b' };
  for (const p of [agent, chat, webSession]) assert.equal(filter('vse', p), true);
  assert.equal(filter('agenti', agent), true);
  assert.equal(filter('agenti', chat), false);
  assert.equal(filter('chaty', chat), true);
  assert.equal(filter('chaty', webSession), true, 'a web conversation known to the app is still a chat');
  assert.equal(filter('chaty', agent), false);
});

test('extension filter control keeps pressed state accessible and invalid states inert', () => {
  const { context, selected, list } = env();
  vm.runInContext("nastavFiltrKonverzaci('agenti')", context);
  assert.equal(context.draws, 1);
  assert.equal(context.kaskada, true, 'filter change re-enters the list with a stagger');
  assert.deepEqual(selected.map((x) => x[2]), ['false', 'true', 'false']);
  assert.equal('podpis' in list.dataset, false, 'the result list cannot use stale cached DOM');
  vm.runInContext("nastavFiltrKonverzaci('agenti')", context);
  vm.runInContext("nastavFiltrKonverzaci('invalid')", context);
  assert.equal(context.draws, 1, 'invalid and unchanged values are no-op');
});

test('filter layout has bilingual accessible buttons and visible no-results explanation', async () => {
  const translations = await fs.readFile(translationsPath, 'utf8');
  for (const key of ['vse', 'agenti', 'chaty']) assert.match(html, new RegExp(`data-filtr="${key}" aria-pressed="(?:true|false)"`));
  assert.match(html, /id="filtry-konverzaci" role="group" aria-label="Zobrazit"/);
  assert.match(html, /id="prazdne-konverzace" role="status" hidden/);
  assert.match(popup, /'Žádný agent tu teď není\.'/);
  assert.match(popup, /'Žádný chat v prohlížeči\.'/);
  for (const [cs, en] of [['Agenti', 'Agents'], ['Chaty', 'Chats'], ['Co se děje', 'What’s happening']]) assert.ok(translations.includes(`'${cs}': '${en}'`));
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(html, /\.radek--tato::before\s*\{\s*content:/, 'avoid banned one-sided decorative strokes');
});
