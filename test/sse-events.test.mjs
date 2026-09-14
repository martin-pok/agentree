import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Událost, kterou server vyšle přes store.emit, se do prohlížeče dostane jen tehdy, když ji
// živý proud (src/http.js) výslovně předává. Nová událost bez předávání selže potichu: rozhraní
// se nedozví nic až do obnovení stránky. Tak se málem ztratil pruh „Změny se nedaří uložit“.

const src = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

// Interní události, které do prohlížeče schválně nejdou (zpracuje je server sám).
const INTERNI = new Set(['alerts:raised']);

test('každá událost vyslaná aplikací má předávání do živého proudu', async () => {
  const soubory = ['src/app.js', 'src/store.js', 'src/alerts.js', 'src/http.js', 'src/runs.js', 'src/local-chat.js'];
  const vyslane = new Set();
  for (const f of soubory) {
    const text = await src(f).catch(() => '');
    for (const m of text.matchAll(/\b(?:store|this)\.emit\(\s*'([\w:]+)'/g)) vyslane.add(m[1]);
  }
  const http = await src('src/http.js');
  const blok = http.slice(http.indexOf('const listeners = {'), http.indexOf('for (const [event, fn] of Object.entries(listeners))'));
  const predavane = new Set([...blok.matchAll(/^\s*(?:'([\w:]+)'|(\w+)):/gm)].map((m) => m[1] || m[2]));
  const chybi = [...vyslane].filter((e) => !predavane.has(e) && !INTERNI.has(e));
  assert.ok(vyslane.has('storage'), 'kontrola našla i událost storage');
  assert.deepEqual(chybi, [], `události bez předávání do prohlížeče: ${chybi.join(', ')}`);
});

// Druhý a třetí článek řetězce: prohlížeč poslouchá jen názvy z EVENTS v public/js/api.js a stav mění
// jen události, které mají `case` v applyEvent (public/js/state.js). Chybějící článek = tichá chyba.
test('každou předávanou událost prohlížeč poslouchá a umí zpracovat', async () => {
  const http = await src('src/http.js');
  const blok = http.slice(http.indexOf('const listeners = {'), http.indexOf('for (const [event, fn] of Object.entries(listeners))'));
  const vysilane = new Set([...blok.matchAll(/broadcast\('([\w:]+)'/g)].map((m) => m[1]));
  const api = await src('public/js/api.js');
  const posloucha = new Set(JSON.parse(api.match(/const EVENTS = (\[[^\]]*\]);/)[1].replace(/'/g, '"')));
  const stav = await src('public/js/state.js');
  const zpracuje = new Set([...stav.matchAll(/case '([\w:]+)'/g)].map((m) => m[1]));
  const neposloucha = [...vysilane].filter((e) => !posloucha.has(e));
  const nezpracuje = [...posloucha].filter((e) => !zpracuje.has(e));
  assert.ok(vysilane.has('storage') && posloucha.has('storage'), 'kontrola vidí událost storage na obou stranách');
  assert.deepEqual(neposloucha, [], `server posílá, prohlížeč neposlouchá: ${neposloucha.join(', ')}`);
  assert.deepEqual(nezpracuje, [], `prohlížeč poslouchá, ale stav nezmění: ${nezpracuje.join(', ')}`);
});
