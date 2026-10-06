import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Obsahový skript rozšíření (extension/content.js) ve VM s atrapou prohlížeče: skutečný kód, řízený
// čas a zachycené časovače. Hlídá, že otevřená konverzace v Agenteeq nechybí, ani když aplikace zrovna
// neběží (odeslání se zopakuje), ani po jejím restartu (klidná konverzace se ohlásí jednou za minutu).

const zdroj = await fs.readFile(fileURLToPath(new URL('../extension/content.js', import.meta.url)), 'utf8');

function spust(odpoved) {
  let ted = 1_000_000;
  let interval = null;
  let posluchac = null;
  const cekajici = [];
  const odeslano = [];
  const stranka = { generuje: false, zpravy: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }] };
  const adapter = {
    id: 'chatgpt',
    messages: () => stranka.zpravy,
    generating: () => stranka.generuje,
    conversationId: () => 'konverzace-1',
    model: () => 'gpt',
    limit: () => null,
    composer: () => null,
  };
  const kontext = vm.createContext({
    window: { AgenteeqSites: { detect: () => adapter }, addEventListener() {} },
    location: { href: 'https://chatgpt.com/c/konverzace-1' },
    document: { documentElement: {} },
    MutationObserver: class { observe() {} },
    Date: { now: () => ted },
    setTimeout: (fn) => { cekajici.push(fn); return cekajici.length; },
    clearTimeout: (id) => { cekajici[id - 1] = () => {}; },
    setInterval: (fn) => { interval = fn; return 1; },
    chrome: {
      runtime: {
        onMessage: { addListener(fn) { posluchac = fn; } },
        sendMessage: async (zprava) => {
          if (zprava.type !== 'agenteeq:update') return { prompt: null };
          odeslano.push(zprava.payload);
          return odpoved();
        },
      },
    },
  });
  vm.runInContext(zdroj, kontext);
  // Jeden průchod: uplyne čas, přijde interval skriptu (5 s) a doběhnou naplánované časovače.
  const pruchod = async (ms = 5000) => {
    ted += ms;
    interval?.();
    while (cekajici.length) cekajici.shift()();
    for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
  };
  const zprava = (msg) => new Promise((resolve) => posluchac(msg, {}, resolve));
  return { odeslano, stranka, pruchod, zprava };
}

test('rozšíření: nepovedené odeslání se zopakuje při dalším průchodu, ne až při změně stránky', async () => {
  let aplikaceBezi = false;
  const r = spust(() => ({ ok: aplikaceBezi }));
  await r.pruchod(0);
  assert.equal(r.odeslano.length, 1, 'stav se posílá hned');
  await r.pruchod();
  assert.equal(r.odeslano.length, 2, 'aplikace neběžela – zkouší se znovu, i když se stránka nezměnila');
  aplikaceBezi = true;
  await r.pruchod();
  assert.equal(r.odeslano.length, 3);
  await r.pruchod();
  assert.equal(r.odeslano.length, 3, 'po úspěchu se stejný stav znovu neposílá');
});

test('rozšíření: klidná konverzace se ohlásí jednou za minutu, generování po 10 s, změna hned', async () => {
  const r = spust(() => ({ ok: true }));
  await r.pruchod(0);
  for (let i = 0; i < 11; i++) await r.pruchod(); // 55 s
  assert.equal(r.odeslano.length, 1, 'v klidu nic navíc');
  await r.pruchod();
  assert.equal(r.odeslano.length, 2, 'po minutě udržovací signál – aplikace po restartu konverzaci znovu vidí');
  r.stranka.generuje = true;
  await r.pruchod();
  assert.equal(r.odeslano.length, 3, 'změna stavu hned');
  await r.pruchod();
  await r.pruchod();
  assert.equal(r.odeslano.length, 4, 'během generování po 10 s');
  assert.equal(r.odeslano.at(-1).generating, true);
});

test('rozšíření: prázdná stránka bez zpráv se neohlašuje', async () => {
  const r = spust(() => ({ ok: true }));
  r.stranka.zpravy = [];
  await r.pruchod(0);
  await r.pruchod(60000);
  assert.equal(r.odeslano.length, 0);
});

test('ruční obnova vynutí nové hlášení i beze změny a počká na jeho výsledek', async () => {
  const r = spust(() => ({ ok: true }));
  await r.pruchod(0);
  assert.equal(r.odeslano.length, 1);
  const vysledek = await r.zprava({ type: 'agenteeq:refresh' });
  assert.equal(vysledek.ok, true);
  assert.equal(r.odeslano.length, 2);
  assert.equal(r.odeslano.at(-1).counts.assistant, 1);
});

// Nová konverzace se hlásí pod dočasným ID karty (tab-…), dokud jí služba nedá adresu. Pak musí
// rozšíření jednou poslat i předchozí ID, aby aplikace oba záznamy spojila – a opakovat ho, dokud ho
// aplikace nepřijme. Jinak by po první odpovědi visel v přehledu „duch“ staré konverzace.
test('rozšíření: nová konverzace po získání adresy pošle předchozí dočasné ID, dokud se nepřijme', async () => {
  let ted = 1_000_000;
  let interval = null;
  const cekajici = [];
  const odeslano = [];
  let prijmout = true;
  const stranka = { id: 'tab-abc12345' };
  const adapter = { id: 'chatgpt', messages: () => [{ role: 'user', text: 'a' }], generating: () => false, conversationId: () => stranka.id, model: () => '', limit: () => null, composer: () => null };
  const kontext = vm.createContext({
    window: { AgenteeqSites: { detect: () => adapter }, addEventListener() {} },
    location: { href: 'https://chatgpt.com/' },
    document: { documentElement: {} },
    MutationObserver: class { observe() {} },
    Date: { now: () => ted },
    setTimeout: (fn) => { cekajici.push(fn); return cekajici.length; },
    clearTimeout: (id) => { cekajici[id - 1] = () => {}; },
    setInterval: (fn) => { interval = fn; return 1; },
    chrome: { runtime: { onMessage: { addListener() {} }, sendMessage: async (z) => { if (z.type !== 'agenteeq:update') return { prompt: null }; odeslano.push(z.payload); return { ok: prijmout }; } } },
  });
  vm.runInContext(zdroj, kontext);
  const pruchod = async () => { ted += 5000; interval?.(); while (cekajici.length) cekajici.shift()(); for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r)); };
  await pruchod();
  assert.equal(odeslano.at(-1).conversationId, 'tab-abc12345');
  assert.equal(odeslano.at(-1).predchozi, undefined);
  stranka.id = 'konverzace-9';
  prijmout = false;
  await pruchod();
  assert.equal(odeslano.at(-1).conversationId, 'konverzace-9');
  assert.equal(odeslano.at(-1).predchozi, 'tab-abc12345', 'předchozí ID jde s první zprávou pod novým ID');
  prijmout = true;
  await pruchod();
  assert.equal(odeslano.at(-1).predchozi, 'tab-abc12345', 'nepřijaté předchozí ID se pošle znovu');
  await pruchod(); ted += 70000; await pruchod();
  assert.equal(odeslano.at(-1).predchozi, undefined, 'po přijetí už se neposílá');
});
