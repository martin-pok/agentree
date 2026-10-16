import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Execute the actual popup summary functions without Chrome/network to verify
// the words and state the user sees (rather than only matching source strings).
const src = await fs.readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const start = src.indexOf('function vetaZdravi(');
const end = src.indexOf('async function nactiPrehled()', start);
assert.ok(start >= 0 && end > start, 'popup summary functions located');
const code = src.slice(start, end);
const ctx = vm.createContext({ tr: (s) => s, mnozne: (n, a, b, c) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c) });
vm.runInContext(code, ctx);
const souhrn = (z, o) => vm.runInContext('souhrnStavu(z, o)', Object.assign(ctx, { z, o }));
const z = (stav, x = {}) => ({ stav, pracuje: 0, cekaNaTebe: 0, selhalo: 0, limit: 0, procesyNevim: false, ...x });

test('extension never claims a fully healthy state when process scan is incomplete', () => {
  const result = souhrn(z('problem', { selhalo: 1, pracuje: 1, procesyNevim: true }));
  assert.equal(result.ton, 'warn');
  assert.match(result.text, /Selhal 1 agent/);
  assert.match(result.text, /1 pracuje/);
  assert.match(result.text, /Nepodařilo se zjistit, co na počítači běží/);
  const known = souhrn(z('problem', { selhalo: 1, pracuje: 1 }));
  assert.equal(known.text, 'Selhal 1 agent · 1 pracuje');
  assert.equal(known.ton, '');
});

test('extension does not duplicate the unknown-process message when it is already primary', () => {
  const result = souhrn(z('nevim', { procesyNevim: true }));
  assert.equal(result.ton, 'warn');
  assert.equal(result.text, 'Nepodařilo se zjistit, co na počítači běží');
});

test('extension shows BOTH delivery failure and unknown process coverage without duplicating either', () => {
  const result = souhrn(z('nevim', { procesyNevim: true }), { selhaloHlaseni: true });
  assert.equal(result.ton, 'warn');
  assert.match(result.text, /^Poslední hlášení se do Agenteeq nedostalo/);
  assert.equal(result.text.match(/Nepodařilo se zjistit, co na počítači běží/g)?.length, 1);
  assert.equal(result.text.match(/Poslední hlášení/g)?.length, 1);
});

test('missing app overview is reported as unknown, never as nobody working', () => {
  const result = souhrn(null);
  assert.equal(result.ton, 'warn');
  assert.equal(result.text, 'Agenti na počítači: nezjištěno');
  assert.doesNotMatch(result.text, /nikdo nepracuje|0/);
});
