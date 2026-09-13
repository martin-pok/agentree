import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIMES } from '../src/connectors/processes.js';
import { MA_PREPIS, BEZ_PREPISU } from '../public/js/no-transcript.js';

// Nejčastější stížnost na aplikaci zní „běží mi agent a Agenteeq ho nezaregistroval". Někdy je to
// chyba, jindy fakt o té aplikaci (ChatGPT konverzace na disk neukládá). Nepřijatelné je jen jedno:
// aby aplikace běžela a Agenteeq o ní mlčel. Tyhle testy to hlídají za nás.

test('každá známá aplikace je buď čtená, nebo má vysvětlení — nikdy ani jedno', () => {
  const nezarazene = RUNTIMES.filter((r) => !MA_PREPIS.has(r.id) && !BEZ_PREPISU[r.id]);
  assert.deepEqual(
    nezarazene.map((r) => r.id),
    [],
    'Tahle aplikace by běžela a uživatel by nevěděl proč po ní není stopa. Přidej ji do MA_PREPIS '
    + '(umíme číst její přepisy), nebo do BEZ_PREPISU s ověřeným důvodem — v public/js/no-transcript.js.',
  );
});

test('žádná aplikace není v obou skupinách zároveň', () => {
  const obojí = RUNTIMES.filter((r) => MA_PREPIS.has(r.id) && BEZ_PREPISU[r.id]).map((r) => r.id);
  assert.deepEqual(obojí, [], 'Aplikace nemůže mít přepis a zároveň být bez přepisu.');
});

test('seznamy neobsahují aplikace, které už neexistují', () => {
  const zname = new Set(RUNTIMES.map((r) => r.id));
  assert.deepEqual([...MA_PREPIS].filter((id) => !zname.has(id)), [], 'MA_PREPIS zná aplikaci, která není v RUNTIMES.');
  assert.deepEqual(Object.keys(BEZ_PREPISU).filter((id) => !zname.has(id)), [], 'BEZ_PREPISU zná aplikaci, která není v RUNTIMES.');
});

test('každé vysvětlení je k něčemu: má důvod, radu i odkaz', () => {
  for (const [id, i] of Object.entries(BEZ_PREPISU)) {
    assert.ok(i.duvod && i.duvod.length > 30, `${id}: důvod chybí nebo je příliš stručný na to, aby něco vysvětlil`);
    assert.ok(i.rada && i.rada.length > 10, `${id}: chybí rada, co s tím uživatel může udělat`);
    assert.ok(i.odkaz?.href && i.odkaz?.text, `${id}: chybí odkaz, kam se má uživatel vydat`);
    assert.doesNotMatch(i.duvod, /asi |patrně|možná|nejspíš/i, `${id}: důvod má být ověřený fakt, ne odhad`);
  }
});
