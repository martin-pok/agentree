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
  const stranka = { id: 'konverzace-1', generuje: false, zpravy: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }] };
  const adapter = {
    id: 'chatgpt',
    messages: () => stranka.zpravy,
    generating: () => stranka.generuje,
    conversationId: () => stranka.id,
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

// Nová konverzace nemá v adrese ID – rozšíření ji hlásí pod zástupným ID karty (extension/sites.js#tabId).
// Jakmile služba ID přidělí, první hlášení pod skutečným ID řekne, co nahrazuje, a server ze dvou
// záznamů udělá jeden. Dřív zůstal v přehledu vedle skutečné konverzace „duch“ nové konverzace.
test('rozšíření: konverzace, která dostala ID, nahlásí zástupné ID karty, které nahrazuje', async () => {
  let odpoved = { ok: false };
  const r = spust(() => odpoved);
  r.stranka.id = 'tab-k3j9x2';
  r.stranka.zpravy = [{ role: 'user', text: 'a' }];
  r.stranka.generuje = true;
  odpoved = { ok: true };
  await r.pruchod(0);
  assert.equal(r.odeslano.at(-1).conversationId, 'tab-k3j9x2');
  assert.equal(r.odeslano.at(-1).nahrazuje, undefined);
  r.stranka.id = '68e2-aa11';
  odpoved = { ok: false };
  await r.pruchod();
  assert.equal(r.odeslano.at(-1).nahrazuje, 'tab-k3j9x2');
  odpoved = { ok: true };
  await r.pruchod();
  assert.equal(r.odeslano.at(-1).nahrazuje, 'tab-k3j9x2', 'nepovedené odeslání se zopakuje i s údajem, co nahrazuje');
  r.stranka.zpravy.push({ role: 'assistant', text: 'b' });
  await r.pruchod();
  assert.equal(r.odeslano.at(-1).nahrazuje, undefined, 'po potvrzení už se neposílá');
  // Přechod mezi dvěma skutečnými konverzacemi nic nenahrazuje – obě jsou skutečné.
  r.stranka.id = 'jina-konverzace';
  await r.pruchod();
  assert.equal(r.odeslano.at(-1).conversationId, 'jina-konverzace');
  assert.equal(r.odeslano.at(-1).nahrazuje, undefined);
});
