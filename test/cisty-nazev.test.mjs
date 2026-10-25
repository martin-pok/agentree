import test from 'node:test';
import assert from 'node:assert/strict';
import { cistyNazev } from '../src/util.js';
import { createSession, summarize } from '../src/model.js';

// Vlastník 25. 10. 2026: názvy agentů ukazovaly prázdné čtverečky („▯ STUDIO MASTER SKILL“) a celý
// řádek z bočního panelu claude.ai/code. Znak, který písmo neumí, v názvu nemá co dělat.
test('název agenta bez ikon z písem, animovaných hvězdiček a neviditelných znaků', () => {
  assert.equal(cistyNazev(' STUDIO MASTER SKILL'), 'STUDIO MASTER SKILL');
  assert.equal(cistyNazev('✳ Oprav ⠂přihlášení​'), 'Oprav přihlášení');
  assert.equal(cistyNazev('Řádek • s tečkou uvnitř'), 'Řádek • s tečkou uvnitř', 'běžná interpunkce uvnitř zůstává');
  assert.equal(cistyNazev('Design & Web 🚀'), 'Design & Web 🚀', 'emoji písmo vykreslí, zůstává');
  const s = createSession({ connector: 'claude-desktop-code', localId: 'x', provider: 'anthropic', app: 'Claude' });
  s.title = '';
  s.firstPrompt = 'Oprav detekci';
  assert.equal(summarize(s, Date.now(), 86400000).title, 'Oprav detekci', 'z prázdného názvu se nevezme čtvereček, ale další zdroj');
});
