import test from 'node:test';
import assert from 'node:assert/strict';
import { stackedColumns, timeLine, miniBars } from '../public/js/charts.js';
import { providerSeries, chartColor, CATEGORICAL, sessionTotal } from '../public/js/data.js';
import { limitGauges } from '../public/js/ui.js';

const hourKey = (d) => d.toISOString().slice(0, 13);

test('grafy: tokeny po dnech sedí na místní kalendářní dny, poskytovatel má pevnou barvu', () => {
  const now = new Date(2026, 8, 11, 15, 30).getTime();
  const sessions = [
    { provider: 'anthropic', hourly: { [hourKey(new Date(2026, 8, 10, 23, 10))]: 1000, [hourKey(new Date(2026, 8, 11, 0, 20))]: 500 } },
    { provider: 'openai', hourly: { [hourKey(new Date(2026, 8, 5, 9))]: 200 } },
    { provider: 'alibaba', hourly: { [hourKey(new Date(2026, 8, 11, 10))]: 7 } },
  ];
  const ser = providerSeries(sessions, 'week', now);
  assert.equal(ser.labels.length, 7);
  const byKey = Object.fromEntries(ser.series.map((s) => [s.key, s]));
  assert.deepEqual(byKey.anthropic.values.slice(-2), [1000, 500], 'půlnoc podle místního času, ne UTC');
  assert.equal(byKey.openai.values[0], 200);
  assert.equal(byKey.other.label, 'Ostatní', 'poskytovatel mimo paletu spadne do Ostatní');
  assert.equal(byKey.anthropic.color, chartColor('anthropic'));
  assert.ok(CATEGORICAL.includes(byKey.openai.color));
  assert.equal(ser.series.reduce((a, s) => a + s.values.reduce((x, y) => x + y, 0), 0), 1707, 'nic se neztratí ani nepřidá');
});

test('grafy: sloupce nevymýšlejí hodnoty mezi intervaly a výška odpovídá součtu', () => {
  const labels = Array.from({ length: 30 }, (_, i) => `${i + 1}. 9.`);
  const values = Array(30).fill(0);
  values[28] = 1_537_930;
  values[29] = 2_150_000;
  const html = stackedColumns({ id: 't-cols', labels, series: [{ key: 'anthropic', label: 'Anthropic', color: '#eb6834', values }], partialLast: true });
  assert.ok(!/ C\d/.test(html) && !html.includes('<path'), 'žádné křivky');
  assert.equal((html.match(/class="bar-slot"/g) || []).length, 30);
  assert.ok(html.includes('height:53.75%'), 'max osy 4 M → 2,15 M = 53,75 %');
  assert.equal((html.match(/height:0.00%/g) || []).length, 28, 'prázdné dny jsou opravdu prázdné');
  const shown = [...html.matchAll(/<span class="(is-minor)?" style="left:([\d.]+)%">([^<]+)<\/span>/g)].map((m) => ({ left: Number(m[2]), text: m[3] }));
  assert.ok(shown.length <= 8, `${shown.length} popisků osy x`);
  assert.equal(shown.at(-1).text, '30. 9.', 'poslední den je vždy popsaný');
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i].left - shown[i - 1].left > 8, 'popisky se nepřekrývají');
});

test('grafy: zůstatek na skutečné časové ose (schody, žádné vyhlazování), popisky bez duplicit', () => {
  const t = (d, h, m = 0) => new Date(2026, 7, d, h, m).getTime();
  const points = [
    { at: t(15, 9), value: 100 }, { at: t(15, 9, 20), value: 250 }, { at: t(15, 14), value: 113.3 },
    { at: t(15, 18), value: 12 }, { at: t(15, 18, 30), value: 250 }, { at: t(15, 23), value: 5.3 },
  ];
  const html = timeLine({ id: 't-time', points, format: (x) => String(x), label: 'Kredity' });
  const d = html.match(/class="line" d="([^"]+)"/)[1];
  assert.match(d, /^M[\d.]+,[\d.]+( H[\d.]+ V[\d.]+)+$/, 'jen vodorovné a svislé úseky');
  const xs = [...d.matchAll(/H([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.abs(xs[0] - (20 / 840) * 1000) < 0.01, 'druhý bod je 20 minut po prvním, ne rovnoměrně po indexu');
  assert.equal((html.match(/class="chart-marker"/g) || []).length, 2, 'značky jen u dokoupení');
  const ticks = [...html.matchAll(/<span class="[^"]*" style="left:[\d.]+%">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.equal(new Set(ticks).size, ticks.length, 'žádný popisek dvakrát');
  assert.equal(ticks[0], '15. 8. 09:00');
  assert.ok(ticks.slice(1).every((x) => /^\d{2}:\d{2}$/.test(x)), 'stejný den se nepíše znovu');
});

test('grafy: miniaturní sloupce kreslí jen nenulové intervaly', () => {
  const svg = miniBars([0, 5, 0, 10], '#2a78d6', { height: 40 });
  assert.equal((svg.match(/<rect /g) || []).length, 3, 'základní linka + 2 sloupce');
  assert.equal(miniBars([], '#000'), '');
});

test('limity: jakmile dorazí přesná data ze stavového řádku, záložní historie se skryje', () => {
  const now = Date.now();
  const limity = [
    { id: 'claude:five_hour', provider: 'anthropic', app: 'Claude', label: 'Limit 5 h', usedPercent: 42, resetsAt: null, reached: false, at: now, source: 'statusline', kind: 'window' },
    { id: 'claude:five_hour:history', provider: 'anthropic', app: 'Claude', label: 'Limit 5 h', usedPercent: 13, resetsAt: null, reached: false, at: now, source: 'plan-history', kind: 'window' },
    { id: 'claude:seven_day:history', provider: 'anthropic', app: 'Claude', label: 'Týdenní limit', usedPercent: 62, resetsAt: null, reached: false, at: now, source: 'plan-history', kind: 'window' },
    { id: 'codex:codex:primary', provider: 'openai', app: 'Codex', label: 'Limit 5 h', usedPercent: 80, resetsAt: null, reached: false, at: now, source: '', kind: 'window' },
  ];

  const merice = limitGauges(limity, now);
  assert.equal(merice.length, 2, 'jeden měřák za Claude a jeden za Codex — ne dvě čísla pro stejný limit');
  assert.equal(merice.filter((h) => h.includes('42')).length, 1, 'platí přesná hodnota ze stavového řádku');
  assert.equal(merice.some((h) => h.includes('13')), false, 'záložní historie se nezobrazuje vedle ní');
  assert.equal(merice.some((h) => h.includes('62')), false, 'týdenní limit z historie se skryje také — zdroj má přednost jako celek');
  assert.equal(merice.some((h) => h.includes('80')), true, 'Codex zůstává, jeho limit je samostatný');

  const bezStatusline = limitGauges(limity.filter((l) => l.source !== 'statusline'), now);
  assert.equal(bezStatusline.length, 3, 'bez stavového řádku se historie použije jako záloha');
});

test('hlavní metrika je vstup + výstup — režie cache ji nesmí nadsadit', () => {
  // Skutečné hodnoty z jedné dnešní konverzace: zápis do cache je řádově větší než vstup
  // a výstup dohromady, protože se stejný kontext zapisuje znovu s každým tahem.
  const s = { tokens: { input: 2948, output: 629841, cacheWrite: 4847361, cacheRead: 266830165 } };

  assert.equal(sessionTotal(s), 632789, 'sčítá se jen vstup a výstup');
  assert.ok(sessionTotal(s) < s.tokens.cacheWrite, 'režie cache je větší než spotřeba — proto do součtu nepatří');
  assert.equal(sessionTotal({ tokens: { input: 0, output: 0, cacheWrite: 5_000_000, cacheRead: 0 } }), 0,
    'konverzace, která jen plnila cache, nesmí hlásit pětimilionovou spotřebu');
  assert.equal(sessionTotal({}), 0, 'chybějící tokeny nejsou chyba');
});
