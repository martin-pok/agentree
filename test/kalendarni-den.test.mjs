// „Dnes“, „včera“, „posledních 7 dní“ a „tento měsíc“ jsou vždy místní kalendářní dny. Testy běží
// v pražském čase kolem změn času (29. 3. 2026 má 23 hodin, 25. 10. 2026 má 25 hodin) a kolem
// půlnoci, kdy se místní den a den UTC rozcházejí.
process.env.TZ = 'Europe/Prague';

import test from 'node:test';
import assert from 'node:assert/strict';

// Prohlížečové API jen v rozsahu, který moduly při načtení potřebují (stejně jako test/ucet-web.test.mjs).
globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const { dayStart, startOfDay, resetsLabel } = await import('../public/js/format.js');
const { heatGrid, heatDetails } = await import('../public/js/data.js');
const { projectMonthTokens } = await import('../src/projects.js');
const { tokenyPoDnech } = await import('../src/cloud-sync.js');
const { tokenyZaDny } = await import('../public/js/ucet-web.js');

const mistne = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const utcHodina = (ts) => new Date(ts).toISOString().slice(0, 13);

test('prostředí testu opravdu běží v pražském čase (jinak by test nic neověřil)', () => {
  assert.equal(new Date(Date.UTC(2026, 6, 1, 12)).getHours(), 14);
  assert.equal(new Date(Date.UTC(2026, 11, 1, 12)).getHours(), 13);
});

test('dayStart: o N kalendářních dní zpět i přes 25hodinový den (konec letního času 25. 10. 2026)', () => {
  const now = mistne(2026, 10, 26, 23, 30);
  assert.equal(dayStart(now, -7), mistne(2026, 10, 19));
  // Původní výpočet startOfDay(now - 7 * 24 h) skočil o den dopředu a „průměr 7 dní“ měl jen 6.
  assert.notEqual(startOfDay(now - 7 * 86400e3), mistne(2026, 10, 19));
  assert.equal(dayStart(mistne(2026, 10, 25, 12), 1), mistne(2026, 10, 26));
});

test('dayStart: o N kalendářních dní zpět i přes 23hodinový den (začátek letního času 29. 3. 2026)', () => {
  const now = mistne(2026, 4, 1, 0, 30);
  assert.equal(dayStart(now, -7), mistne(2026, 3, 25));
  assert.equal(dayStart(mistne(2026, 3, 30, 0, 30), -1), mistne(2026, 3, 29));
});

test('resetsLabel: „včera“ platí i těsně po půlnoci po začátku letního času', () => {
  const now = mistne(2026, 3, 30, 0, 30);
  assert.match(resetsLabel(mistne(2026, 3, 29, 12), now), /^včera/);
  assert.match(resetsLabel(mistne(2026, 3, 31, 9), now), /^zítra/);
});

test('mapa aktivity za 7 dní na podzim zahrne první den okna celý (25hodinový den uvnitř okna)', () => {
  const now = mistne(2026, 10, 26, 23, 30);
  const prvniDen = mistne(2026, 10, 20, 10);
  const sessions = [{ app: 'Claude Code', hourly: { [utcHodina(prvniDen)]: 500 } }];
  const grid = heatGrid(sessions, now, 7);
  assert.equal(grid.flat().reduce((a, b) => a + b, 0), 500, 'úterý 20. 10. patří do posledních 7 dní');
  const detail = heatDetails(sessions, now, 7);
  // Každý den v týdnu se v 7denním okně vyskytne právě jednou – ani 25hodinový den nic nezdvojí.
  assert.deepEqual(detail.map((row) => row[0].mozne), [1, 1, 1, 1, 1, 1, 1]);
});

test('mapa aktivity za 7 dní na jaře nezahrne den před oknem (23hodinový den uvnitř okna)', () => {
  const now = mistne(2026, 4, 1, 0, 30);
  const predOknem = mistne(2026, 3, 25, 12);
  const vOkne = mistne(2026, 3, 26, 12);
  const sessions = [{ app: 'Codex', hourly: { [utcHodina(predOknem)]: 7, [utcHodina(vOkne)]: 11 } }];
  assert.equal(heatGrid(sessions, now, 7).flat().reduce((a, b) => a + b, 0), 11);
});

test('rozpočet tokenů projektu počítá místní měsíc – stejný jako peněžní rozpočet v Útratě', () => {
  // 1. 11. 2026 v 0:30 v Praze je v UTC ještě 31. 10. 23:30.
  const now = mistne(2026, 11, 1, 0, 30);
  const sessions = [
    { projectId: 'p1', hourly: { '2026-10-15T10': 1000, [utcHodina(mistne(2026, 11, 1, 0))]: 50 } },
    { projectId: 'jiny', hourly: { [utcHodina(mistne(2026, 11, 1, 0))]: 999 } },
  ];
  assert.equal(utcHodina(mistne(2026, 11, 1, 0)), '2026-10-31T23');
  assert.equal(projectMonthTokens(sessions, 'p1', now), 50);
});

test('synchronizace do účtu: usage_daily.day je místní den Macu, ne den UTC', () => {
  const now = mistne(2026, 11, 1, 9);
  const radky = tokenyPoDnech([{ provider: 'anthropic', hourly: { '2026-10-31T23': 40, '2026-10-31T22': 2 } }], now);
  assert.deepEqual(radky.map((r) => [r.day, r.tokens]), [['2026-10-31', 2], ['2026-11-01', 40]]);
});

test('web účtu staví osu dnů z místních dnů – dnešní řádek po půlnoci nechybí', () => {
  const now = mistne(2026, 11, 1, 0, 30);
  const { hodnoty, celkem } = tokenyZaDny([{ day: '2026-11-01', provider: 'anthropic', tokens: 5 }, { day: '2026-10-31', provider: 'openai', tokens: 3 }], now, 7);
  assert.equal(hodnoty[hodnoty.length - 1], 5);
  assert.equal(hodnoty[hodnoty.length - 2], 3);
  assert.equal(celkem, 8);
});
