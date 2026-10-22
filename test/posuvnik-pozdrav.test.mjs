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

// Bug report 14. 10. (audit 18. 10.): Pomocník na „vzhled agenta“ odpovídal o vzhledu aplikace.
test('Pomocník: vzhled agenta vede do detailu agenta, vzhled aplikace do Nastavení', async () => {
  const { guideAnswer } = await import('../public/js/assistant-guide.js');
  assert.match(guideAnswer('Jak upravím vzhled agenta?').text, /detailu.*robota s tužkou/);
  assert.match(guideAnswer('jak dám agentovi čepici').text, /detailu/);
  assert.match(guideAnswer('Jak přepnu tmavý vzhled?').text, /Vzhled a jazyk/);
});

test('Odhlásit a Smazat účet stojí na konci sekce Účet a licence, ne u přihlášení', async () => {
  const s = await zdroj('public/js/views/settings.js');
  assert.match(s, /\['set-ucet', tr\('Účet a licence'\), \[[^\]]*'license', 'account-end'\]\]/);
  const karta = s.slice(s.indexOf('function accountCard()'), s.indexOf('function', s.indexOf('function accountCard()') + 20));
  assert.doesNotMatch(karta, /data-action="ucet-smazat"/);
});
