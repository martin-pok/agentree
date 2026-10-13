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
  const elements = new Map(['feats', 'app-link', 'app-link-text'].map(k => [k, { hidden: true, href: '', textContent: '' }]));
  const env = {
    seznam: { pripojeno: true, konverzace: [{ id: 'old' }] },
    overeni: { diagnostika: { generating: true } },
    prehled: { zdravi: { pracuje: 20 } },
    WEB: 'https://agentree-fawn.vercel.app/',
    tr: s => s,
    $: id => elements.get(id),
    zakladniStav() { env.seznam.pripojeno = false; },
    setHero(value) { env.hero = value; },
  };
  vm.runInNewContext(code + '\nukazVypadek()', env);
  assert.equal(env.prehled, null);
  assert.equal(env.overeni.diagnostika, null);
  assert.equal(env.seznam.konverzace.length, 0);
  assert.equal(env.seznam.pripojeno, false);
  assert.equal(env.hero.tone, 'err');
  assert.equal(env.hero.pill, 'Neběží');
});

test('extension refresh loop tests actual health and auto-recovers after restart', async () => {
  const code = await read();
  const start = code.indexOf('let probihaKontrolaSpojeni = false;');
  const end = code.indexOf("$('retry').addEventListener", start);
  assert.ok(start >= 0 && end > start);
  const loop = code.slice(start, end);
  assert.match(loop, /if \(document\.hidden \|\| probihaKontrolaSpojeni\) return/);
  assert.match(loop, /if \(!seznam\.pripojeno\) \{[\s\S]*?await render\(\)/);
  assert.match(loop, /if \(!await fungujeSluzba\(\)\) \{[\s\S]*?ukazVypadek\(\)/);
  assert.match(loop, /if \(!aktualniPrehled\) \{[\s\S]*?await render\(\)/);
  assert.ok(loop.indexOf('await fungujeSluzba()') < loop.indexOf('prehled = aktualniPrehled'),
    'health must precede publishing new live state');
  assert.match(loop, /finally \{[\s\S]*?probihaKontrolaSpojeni = false/);
  assert.match(code, /if \(r\?\.paired && !r\.online\) \{[\s\S]*?ukazVypadek\(\)/);
});
