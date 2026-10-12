import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Execute the actual popup header function without Chrome/network to verify
// the words and state the user sees (rather than only matching source strings).
const src = await fs.readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const start = src.indexOf('function hlavicka() {');
const end = src.indexOf('// Konverzace se mění', start);
assert.ok(start >= 0 && end > start, 'popup header function located');
const code = src.slice(start, end);

function paint({ unknown, status = 'problem', working = 1 } = {}) {
  const sub = { dataset: {} };
  const screen = { hero: null };
  const context = {
    seznam: { pripojeno: true, lastStatus: null, zastarala: false, off: [], konverzace: [] },
    overeni: { diagnostika: null, tab: null },
    prehled: { zdravi: { stav: status, pracuje: working, cekaNaTebe: 0, selhalo: status === 'problem' ? 1 : 0, limit: 0, procesyNevim: unknown } },
    tr: s => s,
    mnozne: () => 'agentů právě pracuje',
    vetaZdravi: () => (status === 'problem' ? 'Selhal 1 agent' : 'Nepodařilo se zjistit, co na počítači běží'),
    $: key => key === 'sub' ? sub : ({ dataset: {} }),
    setHero: h => { screen.hero = h; },
  };
  vm.runInNewContext(code + '\nhlavicka()', context);
  return screen.hero;
}

test('extension never claims a fully healthy state when process scan is incomplete', () => {
  const result = paint({ unknown: true });
  assert.equal(result.tone, 'warn');
  assert.match(result.sub, /Selhal 1 agent/);
  assert.match(result.sub, /Nepodařilo se zjistit, co na počítači běží/);
  assert.equal(paint({ unknown: false }).sub, 'Selhal 1 agent');
  assert.equal(paint({ unknown: false }).tone, 'ok');
});

test('extension does not duplicate the unknown-process message when it is already primary', () => {
  const result = paint({ unknown: true, status: 'nevim', working: 0 });
  assert.equal(result.tone, 'warn');
  assert.equal(result.sub, 'Nepodařilo se zjistit, co na počítači běží');
});
