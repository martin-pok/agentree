import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const zdroj = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

// Otevřené okno (hledání, upozornění) zamkne stránku a posuvník zmizí. Bez vyhrazeného místa se
// obsah rozšíří, posune doprava a box Stav agentů se přeskládá (vlastník, 18. 10. 2026).
test('místo pro posuvník je vyhrazené vždy, i když okno stránku zamkne', async () => {
  const css = await zdroj('public/refinement.css');
  assert.match(css, /html \{ scrollbar-gutter: stable; \}/);
  assert.match(css, /@supports not \(scrollbar-gutter: stable\)[^}]*padding-right: var\(--posuvnik/);
  const app = await zdroj('public/js/app.js');
  assert.match(app, /CSS\?\.supports\?\.\('scrollbar-gutter', 'stable'\)/, 'záloha pro prohlížeč bez scrollbar-gutter');
});

// Počty agentů podle stavu nese box Stav agentů. Pravá strana pozdravu je neopakuje: ukazuje den
// a dnešní aktivitu, kterou jinak schovává zavřený „Průběh dne a spotřeba“.
test('pozdrav na Přehledu neopakuje počty z boxu Stav agentů', async () => {
  const prehled = await zdroj('public/js/views/overview.js');
  assert.doesNotMatch(prehled, /pozdrav-pocty/);
  assert.match(prehled, /zivy\(el, 'pozdrav-dnes'/);
});
