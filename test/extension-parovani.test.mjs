import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Background worker rozšíření (extension/background.js) ve VM s atrapou Chromu a sítě. Hlídá
// párování bez kódu ve všech okrajových případech: aplikace neběží, rozšíření je cizí (409),
// aplikace token odvolala (401) – a že se nic z toho nezacyklí ani nezahltí aplikaci dotazy.

const zdroj = await fs.readFile(fileURLToPath(new URL('../extension/background.js', import.meta.url)), 'utf8');

function spust(sit, { ulozeno = {} } = {}) {
  const local = { ...ulozeno };
  let zmenaUloziste = null;
  const session = {};
  const volani = [];
  let posluchac = null;
  let zavreni = null;
  let ted = 1_000_000;
  const oblast = (data) => ({
    get: async (klice) => Object.fromEntries((Array.isArray(klice) ? klice : [klice]).filter((k) => k in data).map((k) => [k, data[k]])),
    set: async (o) => { Object.assign(data, o); },
    remove: async (k) => { delete data[k]; },
  });
  const kontext = vm.createContext({
    crypto: { randomUUID: () => 'instalace-1234' },
    Date: { now: () => ted },
    fetch: async (url, init = {}) => {
      const cesta = String(url).replace(/^http:\/\/127\.0\.0\.1:\d+/, '');
      volani.push({ url: cesta, plna: String(url), headers: init.headers || {} });
      const r = await sit(cesta, init);
      if (r instanceof Error) throw r;
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body || {} };
    },
    chrome: {
      storage: { local: oblast(local), session: oblast(session), onChanged: { addListener: (fn) => { zmenaUloziste = fn; } } },
      runtime: {
        getManifest: () => ({ version: '1.0.0', content_scripts: [] }),
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        onMessage: { addListener: (fn) => { posluchac = fn; } },
      },
      alarms: { create() {}, onAlarm: { addListener() {} } },
      tabs: { query: async () => [], onRemoved: { addListener: (fn) => { zavreni = fn; } } },
    },
  });
  vm.runInContext(zdroj, kontext);
  const zprava = (msg, sender = {}) => new Promise((resolve) => { posluchac(msg, sender, resolve); });
  const zavri = async (tabId) => { zavreni(tabId); await new Promise((res) => setTimeout(res, 0)); };
  return { local, session, volani, zprava, zavri, posun: (ms) => { ted += ms; }, zmenPort: (port) => { local.port = port; zmenaUloziste?.({ port: { newValue: port } }, 'local'); } };
}

test('pozadí rozšíření: aplikace neběží → „nedostupné“, bez tokenu a bez zahlcení dotazy', async () => {
  const r = spust(() => new TypeError('Failed to fetch'));
  const hello = await r.zprava({ type: 'agenteeq:hello' });
  assert.equal(hello.paired, false);
  assert.equal(hello.parovani, 'nedostupne');
  assert.equal(r.local.token, undefined);
  // Odeslání stavu konverzace zkusí spárování nejvýš jednou za 20 s, ne při každém průchodu.
  const pred = r.volani.filter((v) => v.url === '/api/extension/pripojit').length;
  for (let i = 0; i < 5; i++) await r.zprava({ type: 'agenteeq:update', payload: { site: 'chatgpt', conversationId: 'c1', generating: false } });
  assert.equal(r.volani.filter((v) => v.url === '/api/extension/pripojit').length, pred, 'bez uplynutí 20 s žádný další pokus');
  r.posun(21e3);
  await r.zprava({ type: 'agenteeq:update', payload: { site: 'chatgpt', conversationId: 'c1', generating: false } });
  assert.equal(r.volani.filter((v) => v.url === '/api/extension/pripojit').length, pred + 1);
});

test('pozadí rozšíření: naše rozšíření se spáruje samo a pošle ID instalace', async () => {
  const r = spust((url) => (url === '/api/extension/pripojit' ? { status: 200, body: { token: 't'.repeat(43), version: '1.0.0' } }
    : url === '/api/extension/hello' ? { status: 200, body: { expectedVersion: '1.0.0' } } : { status: 200 }));
  const hello = await r.zprava({ type: 'agenteeq:hello' });
  assert.equal(hello.paired, true);
  assert.equal(r.local.token, 't'.repeat(43));
  assert.equal(r.local.parovani, 'hotovo');
  const parovani = r.volani.find((v) => v.url === '/api/extension/pripojit');
  assert.equal(parovani.headers['X-Agenteeq-Installation-Id'], 'instalace-1234');
  const hlaseni = r.volani.find((v) => v.url === '/api/extension/hello');
  assert.equal(hlaseni.headers['X-Agenteeq-Token'], 't'.repeat(43), 'token se hned použije');
});

test('pozadí rozšíření: cizí rozšíření (409) zůstane u kódu, kód ho spáruje', async () => {
  const r = spust((url, init) => (url === '/api/extension/pripojit' ? { status: 409, body: { error: 'kód' } }
    : url === '/api/extension/pair' ? (init.headers['X-Agenteeq-Pair-Code'] === 'abcdefghijklmnop' ? { status: 200, body: { token: 'k'.repeat(43) } } : { status: 401, body: { error: 'Párovací kód neplatí.' } })
      : { status: 200, body: {} }));
  const hello = await r.zprava({ type: 'agenteeq:hello' });
  assert.deepEqual([hello.paired, hello.parovani], [false, 'kod']);
  const spatny = await r.zprava({ type: 'agenteeq:pair', code: 'xxxxxxxxxxxxxxxx' });
  assert.equal(spatny.ok, false);
  assert.match(spatny.error, /neplatí/);
  const dobry = await r.zprava({ type: 'agenteeq:pair', code: 'abcdefghijklmnop' });
  assert.equal(dobry.ok, true);
  assert.equal(r.local.token, 'k'.repeat(43));
});

test('pozadí rozšíření: odvolaný token (401) → jedno nové spárování, žádná smyčka', async () => {
  let helloVolani = 0;
  const r = spust((url) => {
    if (url === '/api/extension/pripojit') return { status: 200, body: { token: `novy${helloVolani}`.padEnd(43, 'x') } };
    if (url === '/api/extension/hello') { helloVolani++; return { status: 401, body: {} }; }
    return { status: 200, body: {} };
  });
  r.local.token = 'stary'.padEnd(43, 'x');
  const hello = await r.zprava({ type: 'agenteeq:hello' });
  assert.equal(helloVolani, 2, 'po odvolání se spáruje a ohlásí jen jednou znovu');
  assert.equal(hello.paired, false, 'když ani nový token neprojde, řekne to – nezacyklí se');
  assert.equal(hello.revoked, true);
});

test('pozadí rozšíření: otevřené konverzace pro okno – jen stav, staré se zapomenou', async () => {
  const r = spust((url) => (url === '/api/extension/pripojit' ? { status: 200, body: { token: 't'.repeat(43) } } : { status: 200, body: {} }));
  const karta = (id) => ({ tab: { id, windowId: 3 } });
  await r.zprava({ type: 'agenteeq:update', payload: { site: 'chatgpt', conversationId: 'a', generating: true, counts: { user: 1, assistant: 1 } } }, karta(11));
  await r.zprava({ type: 'agenteeq:update', payload: { site: 'claude', conversationId: 'b', generating: false, limit: true } }, karta(12));
  assert.deepEqual(Object.keys(r.session.otevrene).sort(), ['chatgpt:a', 'claude:b']);
  assert.deepEqual(Object.keys(r.session.otevrene['chatgpt:a']).sort(), ['at', 'generating', 'konec', 'limit', 'od', 'okno', 'site', 'tab'], 'v paměti jen služba, karta, stav a časy – nic ze stránky');
  assert.equal(r.session.otevrene['chatgpt:a'].tab, 11, 'okno ví, do které karty přepnout');
  assert.equal(r.session.otevrene['chatgpt:a'].okno, 3);
  assert.equal(r.session.otevrene['claude:b'].limit, true);
  // Začátek odpovědi se drží, dokud agent odpovídá; po dopsání se zapíše konec.
  const zacatek = r.session.otevrene['chatgpt:a'].od;
  assert.ok(zacatek > 0);
  r.posun(5e3);
  await r.zprava({ type: 'agenteeq:update', payload: { site: 'chatgpt', conversationId: 'a', generating: true } }, karta(11));
  assert.equal(r.session.otevrene['chatgpt:a'].od, zacatek, 'začátek odpovědi se s dalším hlášením neposouvá');
  r.posun(5e3);
  await r.zprava({ type: 'agenteeq:update', payload: { site: 'chatgpt', conversationId: 'a', generating: false } }, karta(11));
  assert.equal(r.session.otevrene['chatgpt:a'].od, null);
  assert.equal(r.session.otevrene['chatgpt:a'].konec, zacatek + 10e3, 'konec odpovědi = první hlášení bez generování');
  // Karta přešla na jinou konverzaci: stará z okna zmizí hned.
  await r.zprava({ type: 'agenteeq:update', payload: { site: 'chatgpt', conversationId: 'a2', generating: false } }, karta(11));
  assert.deepEqual(Object.keys(r.session.otevrene).sort(), ['chatgpt:a2', 'claude:b']);
  // Zavřená karta zmizí hned, ne až po 150 s ticha.
  await r.zavri(12);
  assert.deepEqual(Object.keys(r.session.otevrene), ['chatgpt:a2']);
  r.posun(151e3);
  await r.zprava({ type: 'agenteeq:update', payload: { site: 'gemini', conversationId: 'c', generating: false } });
  assert.deepEqual(Object.keys(r.session.otevrene), ['gemini:c'], 'karta, která přes 150 s mlčí, je zavřená');
  // Vypnutá služba se do okna nepočítá a aplikaci se nic neposílá.
  r.local.disabledSites = ['grok'];
  const pred = r.volani.length;
  const vysledek = await r.zprava({ type: 'agenteeq:update', payload: { site: 'grok', conversationId: 'd', generating: true } });
  assert.equal(vysledek.ok, true);
  assert.equal(r.volani.length, pred);
  assert.equal(r.session.otevrene['grok:d'], undefined);
});

// Konfigurovatelný port (PORT): rozšíření mluví s uloženým portem, neplatný ignoruje
// a po změně portu zapomene token a spáruje se znovu.
test('pozadí rozšíření: port aplikace z nastavení, neplatný se ignoruje, změna znovu spáruje', async () => {
  const odpoved = (url) => (url === '/api/extension/pripojit' ? { status: 200, body: { token: 'p'.repeat(43), version: '1.0.0' } }
    : url === '/api/extension/hello' ? { status: 200, body: { expectedVersion: '1.0.0' } } : { status: 200 });
  const r = spust(odpoved, { ulozeno: { port: 5123 } });
  await r.zprava({ type: 'agenteeq:hello' });
  assert.ok(r.volani.length && r.volani.every((v) => v.plna.startsWith('http://127.0.0.1:5123/')), JSON.stringify(r.volani.map((v) => v.plna)));
  const spatny = spust(odpoved, { ulozeno: { port: 80 } });
  await spatny.zprava({ type: 'agenteeq:hello' });
  assert.ok(spatny.volani.every((v) => v.plna.startsWith('http://127.0.0.1:4620/')), 'port pod 1024 se nepoužije');
  assert.equal(r.local.token, 'p'.repeat(43), 'old port has a stored token');
  r.zmenPort(6001);
  // Real Chrome storage is asynchronous: hello immediately after a port change must not read the old token.
  await r.zprava({ type: 'agenteeq:hello' });
  assert.equal(r.local.token, 'p'.repeat(43), 'immediate reconnect receives a freshly paired token');
  assert.ok(r.volani.slice(-2).every((v) => v.plna.startsWith('http://127.0.0.1:6001/')), 'immediate reconnect targets the new port');
  r.posun(21e3);
  await r.zprava({ type: 'agenteeq:hello' });
  const poZmene = r.volani.slice(-2);
  assert.ok(poZmene.every((v) => v.plna.startsWith('http://127.0.0.1:6001/')), JSON.stringify(poZmene.map((v) => v.plna)));
  assert.ok(r.volani.filter((v) => v.url === '/api/extension/pripojit').length >= 2, 'změna portu musí vyvolat nové spárování');
});


test('pozadí rozšíření: souběžné pokusy o párování sdílejí jediný HTTP požadavek', async () => {
  let calls = 0;
  const r = spust(async (url) => {
    if (url === '/api/extension/pripojit') {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { status: 200, body: { token: 'x'.repeat(43) } };
    }
    return { status: 200, body: {} };
  });
  const results = await Promise.all(Array.from({ length: 8 }, () => r.zprava({ type: 'agenteeq:hello' })));
  assert.ok(results.every((v) => v.paired === true));
  assert.equal(calls, 1, 'simultaneous reconnect events must reuse one pairing request');
});
