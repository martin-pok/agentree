import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Background worker rozšíření (extension/background.js) ve VM s atrapou Chromu a sítě. Hlídá
// párování bez kódu ve všech okrajových případech: aplikace neběží, rozšíření je cizí (409),
// aplikace token odvolala (401) – a že se nic z toho nezacyklí ani nezahltí aplikaci dotazy.

const zdroj = await fs.readFile(fileURLToPath(new URL('../extension/background.js', import.meta.url)), 'utf8');

function spust(sit) {
  const local = {};
  const session = {};
  const volani = [];
  let posluchac = null;
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
      volani.push({ url: String(url).replace('http://127.0.0.1:4620', ''), headers: init.headers || {} });
      const r = await sit(String(url).replace('http://127.0.0.1:4620', ''), init);
      if (r instanceof Error) throw r;
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body || {} };
    },
    chrome: {
      storage: { local: oblast(local), session: oblast(session) },
      runtime: {
        getManifest: () => ({ version: '1.0.0', content_scripts: [] }),
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        onMessage: { addListener: (fn) => { posluchac = fn; } },
      },
      alarms: { create() {}, onAlarm: { addListener() {} } },
      tabs: { query: async () => [] },
    },
  });
  vm.runInContext(zdroj, kontext);
  const zprava = (msg) => new Promise((resolve) => { posluchac(msg, {}, resolve); });
  return { local, session, volani, zprava, posun: (ms) => { ted += ms; } };
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
  await r.zprava({ type: 'agenteeq:update', payload: { site: 'chatgpt', conversationId: 'a', generating: true, counts: { user: 1, assistant: 1 } } });
  await r.zprava({ type: 'agenteeq:update', payload: { site: 'claude', conversationId: 'b', generating: false } });
  assert.deepEqual(Object.keys(r.session.otevrene).sort(), ['chatgpt:a', 'claude:b']);
  assert.deepEqual(Object.keys(r.session.otevrene['chatgpt:a']).sort(), ['at', 'generating', 'site'], 'v paměti jen služba, stav a čas – nic ze stránky');
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
