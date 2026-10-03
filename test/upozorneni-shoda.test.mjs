import test from 'node:test';
import assert from 'node:assert/strict';
import { castkaProUpozorneni, budgetAlertCandidates, CURRENCIES } from '../src/spend.js';
import { fmtMoney } from '../public/js/format.js';

// Upozornění a obrazovka Útrata mluví o téže částce a témže procentu. Když se rozejdou,
// uživatel vidí „1 319 CZK, vyčerpáno 87 %“ v oznámení a „1 319 Kč, 88 %“ na obrazovce –
// a přestane věřit oběma. Server a rozhraní jsou dva různé kusy kódu, takže shodu hlídá test.

test('částka v upozornění se píše stejně jako v rozhraní', () => {
  for (const mena of CURRENCIES) {
    for (const v of [0, 1, 2.1, 12.5, 99.9, 1319, 1500, 12345.67]) {
      assert.equal(castkaProUpozorneni(v, mena), fmtMoney(v, mena),
        `${v} ${mena}: server a rozhraní se rozcházejí`);
    }
  }
  // Konkrétně to, co selhalo: česká koruna se píše „Kč“, ne kódem měny.
  assert.equal(castkaProUpozorneni(1319, 'CZK').replace(/ /g, ' '), '1 319 Kč');
});

test('procento v upozornění se zaokrouhluje stejně jako na obrazovce', () => {
  const summary = {
    monthKey: '2026-09',
    currency: 'CZK',
    budgets: [{ scope: 'total', label: 'Celkem', spent: 1319, budget: 1500, pct: 87.93 }],
  };
  const [a] = budgetAlertCandidates(summary);
  // Rozhraní kreslí `Math.round(b.pct)` → 88. Dřív tu bylo `Math.floor` → 87.
  assert.match(a.title, /Vyčerpáno 88 % rozpočtu: Celkem/);
  assert.match(a.body.replace(/ /g, ' '), /1 319 Kč z 1 500 Kč/);
});

test('překročený rozpočet se hlásí jako překročení, ne jako procento', () => {
  const summary = {
    monthKey: '2026-09',
    currency: 'CZK',
    budgets: [{ scope: 'total', label: 'Celkem', spent: 1800, budget: 1500, pct: 120 }],
  };
  const [a] = budgetAlertCandidates(summary);
  assert.match(a.title, /^Rozpočet překročen/);
  assert.equal(a.level, 'critical');
});

test('necelá částka v cizí měně má vždy dvě desetinná místa, celá žádná', () => {
  const bez = (x) => x.replace(/[\s\u00a0\u202f]/g, ' ');
  assert.match(bez(fmtMoney(2.1, 'USD')), /2,10/);
  assert.match(bez(fmtMoney(20, 'USD')), /^20 /);
  assert.doesNotMatch(bez(fmtMoney(20, 'USD')), /,00/);
  assert.match(bez(fmtMoney(18.75, 'EUR')), /18,75/);
  assert.equal(bez(fmtMoney(1319.4, 'CZK')), '1 319 Kč');
  assert.equal(castkaProUpozorneni(2.1, 'USD'), fmtMoney(2.1, 'USD'));
});
