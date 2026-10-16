import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const file = new URL('../extension/popup.js', import.meta.url);
const read = () => fs.readFile(file, 'utf8');

function cut(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'Expected popup connection code');
  return source.slice(from, to);
}

test('extension popup rejects inaccessible host, non-OK HTTP, invalid body and recovers with real health', async () => {
  const code = cut(await read(), 'async function fungujeSluzba() {', 'function ukazVypadek() {');
  const check = async (stub) => vm.runInNewContext(code + '\nfungujeSluzba()', {
    fetch: stub, APLIKACE: 'http://127.0.0.1:4620/', AbortSignal,
  });
  assert.equal(await check(async () => ({ ok: true, json: async () => ({ ok: true }) })), true);
  assert.equal(await check(async () => ({ ok: false, json: async () => ({ ok: true }) })), false);
  assert.equal(await check(async () => ({ ok: true, json: async () => ({ ok: false }) })), false);
  assert.equal(await check(async () => { throw new Error('connection refused'); }), false);
  assert.equal(await check(async () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } })), false);
});

test('extension popup clears stale agent counts, diagnostics and live badge when disconnected', async () => {
  const code = cut(await read(), 'function ukazVypadek() {', '// Viditelnost se přepíná');
  const env = {
    seznam: { pripojeno: true, konverzace: [{ id: 'old' }] },
    overeni: { diagnostika: { generating: true } },
    prehled: { zdravi: { pracuje: 20 } },
    rezim: 'sparovano',
    zakladniStav() { env.seznam.pripojeno = false; },
    nastavPill(tone, text) { env.pill = { tone, text }; },
    vykresli() { env.vykresleno = { prehled: env.prehled, rezim: env.rezim, konverzace: env.seznam.konverzace.length }; },
    obnovSeznam() { env.znovuChaty = true; },
  };
  vm.runInNewContext(code + '\nukazVypadek()', env);
  assert.equal(env.prehled, null);
  assert.equal(env.overeni.diagnostika, null);
  assert.equal(env.seznam.pripojeno, false);
  assert.equal(env.rezim, 'offline');
  assert.deepEqual(env.pill, { tone: 'err', text: 'Neběží' });
  assert.deepEqual(env.vykresleno, { prehled: null, rezim: 'offline', konverzace: 0 }, 'stale agents and chats are gone before the offline screen is drawn');
  assert.equal(env.znovuChaty, true, 'browser chats are reloaded from the browser, they never depended on the app');
});

test('failed verification with a running app is unverified, never offline or unpaired', async () => {
  const code = cut(await read(), 'function ukazVypadek() {', '// Viditelnost se přepíná');
  const env = {
    seznam: { pripojeno: true, konverzace: [{ id: 'old' }] },
    overeni: { diagnostika: { generating: true } },
    prehled: { zdravi: { pracuje: 3 } },
    rezim: 'sparovano',
    zakladniStav() { env.seznam.pripojeno = false; },
    nastavPill(tone, text) { env.pill = { tone, text }; },
    vykresli() { env.vykreslenyRezim = env.rezim; },
    obnovSeznam() { env.znovuChaty = true; },
  };
  vm.runInNewContext(code + '\nukazNeovereno()', env);
  assert.equal(env.rezim, 'neovereno');
  assert.deepEqual(env.pill, { tone: 'warn', text: 'Neověřeno' });
  assert.equal(env.prehled, null, 'stale agent counts are not shown as live');
  assert.equal(env.vykreslenyRezim, 'neovereno');
  assert.equal(env.znovuChaty, true);
  const novejsi = (a, b) => vm.runInNewContext(code + `\nnovejsiVerze(${JSON.stringify(a)}, ${JSON.stringify(b)})`, env);
  assert.equal(novejsi('0.46.12', '0.46.9'), true, 'numbers, not text');
  assert.equal(novejsi('0.46.0', '0.46.12'), false, 'an older app never offers an update');
  assert.equal(novejsi('neznámá', '0.46.12'), false);
});

test('extension refresh loop tests actual health and auto-recovers after restart', async () => {
  const code = await read();
  const start = code.indexOf('let probihaKontrolaSpojeni = false;');
  const end = code.indexOf('// Agenteeq běží na jiném portu', start);
  assert.ok(start >= 0 && end > start);
  const loop = code.slice(start, end);
  assert.match(loop, /if \(document\.hidden \|\| probihaKontrolaSpojeni\) return/);
  assert.match(loop, /if \(!seznam\.pripojeno\) \{[\s\S]*?await render\(\)/);
  assert.match(loop, /if \(!await fungujeSluzba\(\)\) \{[\s\S]*?ukazVypadek\(\)/);
  assert.match(loop, /if \(!aktualniPrehled\) \{[\s\S]*?await render\(\)/);
  assert.ok(loop.indexOf('await fungujeSluzba()') < loop.indexOf('prehled = aktualniPrehled'),
    'health must precede publishing new live state');
  assert.match(loop, /finally \{[\s\S]*?probihaKontrolaSpojeni = false/);
  // Nepodařené ověření (hello) při běžící aplikaci se nikdy nehlásí jako „připojeno“, ale ani jako
  // „neběží“ či „nespárováno“: je to „nepodařilo se ověřit“.
  assert.match(code, /if \(!r \|\| r\.chyba \|\| \(r\.paired && !r\.online\)\) \{[\s\S]*?ukazNeovereno\(\)/);
});
