import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Ukázkový režim pro živou prohlídku na webu (/app?ukazka): rozhraní běží nad snímkem smyšlených
// dat bez serveru. Tyhle testy drží, že ukázka nic neukládá, nikam se neptá, časy jsou „teď“
// a že do veřejných dat neproklouzne nic ze stroje, na kterém se web sestavuje.

const { zapniUkazku, request, connectStream } = await import('../public/js/api.js');
const { posunCasy, spustUkazku, UKAZKA_DATA } = await import('../public/js/ukazka.js');
const { ukazkoveOdpovedi, ocistiCesty, UKAZKA_CESTY } = await import('../scripts/ukazka-data.mjs');
const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('posun časů: posune jen časová razítka, ne tokeny, částky ani text', () => {
  const vytvoreno = Date.UTC(2026, 8, 1);
  const rozdil = 3 * 86400000;
  const data = {
    lastAt: vytvoreno - 60000,
    seznam: [vytvoreno, { at: vytvoreno - 5 * 86400000 }],
    tokens: 861000,
    castka: 4209,
    davno: vytvoreno - 2 * 365 * 86400000,
    text: String(vytvoreno),
    nic: null,
  };
  const out = posunCasy(data, rozdil, vytvoreno);
  assert.equal(out.lastAt, data.lastAt + rozdil);
  assert.equal(out.seznam[0], vytvoreno + rozdil);
  assert.equal(out.seznam[1].at, data.seznam[1].at + rozdil);
  assert.equal(out.tokens, 861000);
  assert.equal(out.castka, 4209);
  assert.equal(out.davno, data.davno, 'číslo dál než rok od vzniku dat není razítko prohlídky');
  assert.equal(out.text, data.text);
  assert.equal(out.nic, null);
  assert.equal(data.lastAt, vytvoreno - 60000, 'vstup zůstane nedotčený');
});

test('ukázka odpovídá ze snímku, nic neukládá a na síť se neptá', async () => {
  const puvodniFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('ukázka se nesmí ptát sítě'); };
  try {
    zapniUkazku({ '/api/state': { sessions: [{ id: 'a', title: 'UKÁZKA' }] } });
    const stav = await request('GET', '/api/state');
    assert.equal(stav.sessions[0].title, 'UKÁZKA');
    stav.sessions.length = 0;
    assert.equal((await request('GET', '/api/state')).sessions.length, 1, 'každé čtení dostane vlastní kopii');

    await assert.rejects(request('POST', '/api/spend/ledger', { amount: 1 }), (e) => e.status === 403 && /nic se v ní neukládá/.test(e.message));
    await assert.rejects(request('PUT', '/api/settings', {}), (e) => e.status === 403);
    await assert.rejects(request('GET', '/api/sessions/a'), (e) => e.status === 404);

    const udalosti = [];
    const spojeni = connectStream({ onHello: () => udalosti.push('hello'), onEvent: () => udalosti.push('event'), onStatus: (s) => udalosti.push(s) });
    await Promise.resolve();
    assert.deepEqual(udalosti, ['live', 'hello'], 'jednou „připojeno“, žádné živé změny');
    assert.equal(typeof spojeni.close, 'function');
  } finally {
    globalThis.fetch = puvodniFetch;
  }
});

test('spuštění ukázky: časy na „teď“, v rámu čeká nástup a připravenost se hlásí jen vlastnímu původu', async () => {
  const atributy = new Set();
  const zpravy = [];
  const stare = { window: globalThis.window, document: globalThis.document, location: globalThis.location };
  globalThis.location = { origin: 'https://agenteeq.example' };
  globalThis.document = {
    documentElement: { dataset: {}, setAttribute: (k) => atributy.add(k) },
    querySelector: (sel) => (sel.includes(':not(.loader-wrap)') ? {} : null),
    fonts: { ready: Promise.resolve() },
  };
  const rodic = { postMessage: (data, puvod) => zpravy.push({ data, puvod }) };
  globalThis.window = { parent: rodic };
  try {
    const vytvoreno = Date.now() - 5 * 86400000;
    const dotazy = [];
    const fetchFn = async (url, init) => {
      dotazy.push([url, init]);
      return { ok: true, json: async () => ({ vytvoreno, odpovedi: { '/api/state': { now: vytvoreno, sessions: [{ lastAt: vytvoreno - 60000 }] } } }) };
    };
    await spustUkazku(fetchFn);
    assert.deepEqual(dotazy, [[UKAZKA_DATA, { cache: 'no-store' }]]);
    const stav = await request('GET', '/api/state');
    assert.ok(Math.abs(stav.now - Date.now()) < 5000, '„teď“ ze snímku je teď u návštěvníka');
    assert.ok(Math.abs(stav.sessions[0].lastAt - (Date.now() - 60000)) < 5000);
    assert.ok('ukazka' in globalThis.document.documentElement.dataset);
    assert.ok(atributy.has('data-nastup-stoji'), 'v rámu stojí nástup, dokud ho stránka nepustí');
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(zpravy, [{ data: { typ: 'agenteeq:ukazka-pripravena' }, puvod: 'https://agenteeq.example' }]);

    await assert.rejects(spustUkazku(async () => ({ ok: false, status: 404 })), /404/, 'bez dat se ukázka nespustí – boot.js pak ukáže rozcestník');
  } finally {
    Object.assign(globalThis, stare);
  }
});

test('data ukázky: jen čtené odpovědi, vzhled podle systému, všechno označené a bez cest ze stroje', async () => {
  const { vytvoreno, odpovedi } = await ukazkoveOdpovedi();
  assert.ok(Math.abs(vytvoreno - Date.now()) < 60000);
  assert.deepEqual(Object.keys(odpovedi), UKAZKA_CESTY);
  const stav = odpovedi['/api/state'];
  assert.equal(stav.settings.appearance, 'system', 'prohlídka má vzhled podle návštěvníka, ne podle toho, kdo web sestavil');
  assert.ok(stav.sessions.length >= 3);
  for (const s of stav.sessions) assert.match(s.title, /^UKÁZKA · /, 'každá konverzace je jako ukázka popsaná');
  for (const p of stav.projects.items) assert.match(p.name, /^UKÁZKA · /);
  assert.ok(stav.spend.ledger.length > 0, 'Útrata v prohlídce není prázdná');
  for (const v of stav.spend.ledger) assert.match(v.note, /^UKÁZKA · /);
  assert.equal(stav.host.home, '/Users/ukazka');

  const text = JSON.stringify(odpovedi);
  const koren = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
  assert.equal(text.includes(JSON.stringify(koren).slice(1, -1)), false, 'cesta k repozitáři na web nepatří');
  assert.doesNotMatch(text, /agenteeq-(?:src|data)-/, 'dočasné složky sestavení na web nepatří');
});

test('čištění cest: nejdelší napřed a i v zápisu JSON (zpětná lomítka z Windows)', () => {
  const text = JSON.stringify({ a: 'C:\\Temp\\agenteeq-data-1\\x', b: 'C:\\Temp\\x' });
  const out = JSON.parse(ocistiCesty(text, [['C:\\Temp', '/Users/ukazka'], ['C:\\Temp\\agenteeq-data-1', '/Users/ukazka/.agenteeq']]));
  assert.deepEqual(out, { a: '/Users/ukazka/.agenteeq\\x', b: '/Users/ukazka\\x' });
});

test('ukázka se zapíná jen na statické kopii na webu a nástup v rámu pouští stránka kolem', async () => {
  const boot = await zdroj('public/js/boot.js');
  assert.match(boot, /if \(await jeStatickaKopie\(\)\) \{[^]*if \(ukazka\) \{[^]*spustUkazku\(\)/, 'u sebe na Macu se ukázka nikdy nezapne');
  // Ukázka účet nespouští (let ucet = false zůstane), takže když se její data nenačtou, zbude rozcestník.
  assert.match(boot, /let ucet = false;[^]*if \(ukazka\) \{[^}]*spustUkazku\(\);\s*spustena = true;/);
  assert.match(boot, /else if \(!ucet\) pripojovaciObrazovka\(\);/, 'když se data nenačtou, zbude rozcestník – nikdy prázdná aplikace');
  const app = await zdroj('public/js/app.js');
  assert.match(app, /if \(UKAZKA\) \{\s*\n\s*window\.addEventListener\('agenteeq:prehraj'/);
  assert.match(app, /if \(!firstNav && !UKAZKA\)/, 'ukázka v rámu nebere stránce fokus ani ji neroluje');
  const css = await zdroj('public/styles.css');
  assert.ok(css.includes('[data-nastup-stoji] .view.is-entering, [data-nastup-stoji] .view.is-entering * { animation-play-state: paused !important; }'));
});
