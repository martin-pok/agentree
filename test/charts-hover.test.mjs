import test from 'node:test';
import assert from 'node:assert/strict';
import { stepIndex } from '../public/js/charts.js';

// Historie kreditů i limitů se ukládá komprimovaně: jen okamžiky změny. Mezi nimi hodnota drží.
// Když kurzor hledal „nejbližší bod“, při týdenní mezeře uskočil o dny jinam, než kam se ukazuje.
// Správná odpověď je poslední odečet před kurzorem.
const den = 86400e3;
const body = [
  { at: 0 * den, value: 250 },
  { at: 5 * den, value: 240 },
  { at: 20 * den, value: 90 },
  { at: 21 * den, value: 5.3 },
];

test('pod kurzorem platí poslední odečet, ne nejbližší bod', () => {
  // Uprostřed patnáctidenní mezery je nejbližší bod ten na konci; platí ale ten na začátku.
  assert.equal(stepIndex(body, 12.5 * den), 1, 'v mezeře drží hodnota z posledního odečtu');
  assert.equal(stepIndex(body, 19.9 * den), 1, 'těsně před změnou pořád platí stará hodnota');
  assert.equal(stepIndex(body, 20 * den), 2, 'v okamžiku změny už platí nová');
  assert.equal(stepIndex(body, 20.001 * den), 2);
});

test('mimo rozsah se hodnota neodhaduje', () => {
  assert.equal(stepIndex(body, -5 * den), 0, 'před prvním odečtem známe jen ten první');
  assert.equal(stepIndex(body, 0), 0);
  assert.equal(stepIndex(body, 999 * den), 3, 'za posledním odečtem platí ten poslední');
});

test('funguje i na krajních tvarech historie', () => {
  assert.equal(stepIndex([{ at: 7, value: 1 }], 100), 0, 'jediný bod');
  const husty = Array.from({ length: 500 }, (_, i) => ({ at: i * 60e3, value: i }));
  assert.equal(stepIndex(husty, 250 * 60e3 + 59e3), 250, 'hustá řada: pořád poslední před kurzorem');
  assert.equal(stepIndex(husty, 499 * 60e3), 499);
});
