import test from 'node:test';
import assert from 'node:assert/strict';

// Vlastník 4. 11. 2026 (snímky pro portfolio): logo Codexu na Přehledu bylo bílým čtvercem. Přechod
// v logu měl pevné id a první kopie ležela ve skrytém prvku, takže ho prohlížeč nevykreslil.
// Definice přechodů patří jednou do viditelného zásobníku, ne do každé kopie loga.
test('logo s přechodem: definice jednou v zásobníku, kopie bez <defs>', async () => {
  const vlozene = [];
  const zasobnik = { id: '', style: {}, setAttribute() {}, insertAdjacentHTML: (_, html) => vlozene.push(html) };
  globalThis.document = {
    body: { prepend: () => {} },
    getElementById: (id) => (id === 'logo-defs' && zasobnik.id ? zasobnik : null),
    createElementNS: () => zasobnik,
  };
  try {
    const { glyph } = await import(`../public/js/icons.js?t=${Date.now()}`);
    const a = glyph('codex'), b = glyph('codex');
    assert.match(a, /url\(#lobe-icons-codex/, 'kopie dál odkazuje na přechod');
    assert.doesNotMatch(a, /<defs>/);
    assert.doesNotMatch(b, /<defs>/);
    assert.equal(vlozene.length, 1, 'definice se vloží jen jednou');
    assert.match(vlozene[0], /linearGradient[^>]*id="lobe-icons-codex/);
    assert.equal(zasobnik.id, 'logo-defs');
  } finally {
    delete globalThis.document;
  }
});
