import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTopUps } from '../src/credits.js';

const min = 60000;

test('Dokoupení kreditů: zastaralý snímek z jiné konverzace se nepočítá jako nákup', () => {
  const t0 = Date.UTC(2026, 7, 1, 10, 0, 0);
  // zůstatek klesá, mezi tím jedna starší konverzace ohlásí zastaralou (vyšší) hodnotu
  const odecty = [
    { at: t0, balance: 100 },
    { at: t0 + min, balance: 90 },
    { at: t0 + 2 * min, balance: 100 }, // zastaralý snímek → vzestup, který se neudrží
    { at: t0 + 3 * min, balance: 88 },
    { at: t0 + 4 * min, balance: 86 },
    { at: t0 + 5 * min, balance: 85 },
  ];
  assert.deepEqual(detectTopUps(odecty), [], 'návrat na dřívější úroveň není nákup');
});

test('Dokoupení kreditů: skutečný nákup se udrží a vykáže celou částku', () => {
  const t0 = Date.UTC(2026, 7, 1, 10, 0, 0);
  const odecty = [
    { at: t0, balance: 12 },
    { at: t0 + min, balance: 8 },
    { at: t0 + 2 * min, balance: 108 }, // +100
    { at: t0 + 3 * min, balance: 106 },
    { at: t0 + 4 * min, balance: 104 },
    { at: t0 + 5 * min, balance: 101 },
  ];
  const n = detectTopUps(odecty);
  assert.equal(n.length, 1);
  assert.equal(n[0].amount, 100);
  assert.equal(n[0].at, t0 + 2 * min);
});

test('Dokoupení kreditů: jeden nákup ohlášený nadvakrát se nepočítá dvakrát', () => {
  const t0 = Date.UTC(2026, 7, 1, 10, 0, 0);
  const odecty = [
    { at: t0, balance: 5 },
    { at: t0 + 1000, balance: 60 },
    { at: t0 + 11000, balance: 105 }, // druhý krok téhož nákupu o 10 s později
    { at: t0 + 20 * min, balance: 103 },
    { at: t0 + 25 * min, balance: 100 },
  ];
  const n = detectTopUps(odecty);
  assert.equal(n.length, 1, 'dva kroky do 15 minut jsou jeden nákup');
  assert.equal(n[0].amount, 100, 'částka je rozdíl proti stavu před nákupem');
});

test('Dokoupení kreditů: odečty mimo pořadí a nesmysly nevadí', () => {
  const t0 = Date.UTC(2026, 7, 1, 10, 0, 0);
  const odecty = [
    { at: t0 + 2 * min, balance: 50 },
    { at: t0, balance: 60 },
    { at: null, balance: 999 },
    { at: t0 + min, balance: 55 },
    { balance: 5 },
    { at: t0 + 3 * min, balance: 48 },
  ];
  assert.deepEqual(detectTopUps(odecty), [], 'klesající řada bez ohledu na pořadí zápisu');
});

test('Dokoupení kreditů: prázdný i chybějící vstup vrací prázdný seznam', () => {
  assert.deepEqual(detectTopUps([]), []);
  assert.deepEqual(detectTopUps(null), []);
  assert.deepEqual(detectTopUps(undefined), []);
});
