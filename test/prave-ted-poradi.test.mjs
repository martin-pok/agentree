import test from 'node:test';
import assert from 'node:assert/strict';

// „Právě teď“ na Přehledu (docs/DESIGN.md → Pořadí agentů): pracuje → rozhodnutí (selhání,
// limit) → dokončil a čeká → neaktivní. Uvnitř skupiny stabilní čas, ne každá živá událost.
import { poradiPraveTed } from '../public/js/prave-ted.js';

test('Právě teď: pracující první, selhání nikdy před pracujícím, hotoví před neaktivními', () => {
  const a = (id, extra = {}) => ({ id, lastAt: 0, startedAt: 0, ...extra });
  const poradi = poradiPraveTed({
    working: [a('w-stary', { turnStartedAt: 100, lastAt: 999 }), a('w-novy', { turnStartedAt: 200, lastAt: 300 })],
    needs: [a('rozhodni')],
    failed: [a('selhal', { lastAt: 5000 })],
    limited: [a('limit')],
    hotovo: [a('hotovo')],
    pripraveni: [a('proces')],
    zacatek: (s) => s.turnStartedAt || s.startedAt,
  }).map((s) => s.id);
  assert.deepEqual(poradi, ['w-novy', 'w-stary', 'rozhodni', 'selhal', 'limit', 'hotovo', 'proces']);
});
