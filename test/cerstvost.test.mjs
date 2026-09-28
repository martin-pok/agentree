import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { startTestServer, tempDir, api, sleep } from './helpers.mjs';

// Po aktualizaci aplikace musí uživatel vždy vidět aktuální kód, styly, loga i data – v prohlížeči,
// v okně aplikace pro Mac (WKWebView) i ve Windows (WebView2). Všechna tři okna ukládají odpovědi
// na disk podle hlaviček a adresa 127.0.0.1:4620 se mezi verzemi nemění, takže soubor uložený
// „natrvalo“ pod adresou bez verze by tam po aktualizaci zůstal klidně rok.
//
// Pravidlo (docs/ARCHITECTURE.md → Mezipaměť a čerstvost): natrvalo jen adresa se značkou obsahu,
// která k obsahu opravdu patří. Všechno ostatní `no-cache` + ETag – prohlížeč se zeptá a dostane 304.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const VERZE = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
const TRVALE = /max-age=31536000, immutable/;

async function stahni(url, init) {
  const r = await fetch(url, init);
  const telo = Buffer.from(await r.arrayBuffer());
  return Object.assign(r, { telo });
}
const znackaZ = (r) => (r.headers.get('etag') || '').replace(/"/g, '');
const src = (p) => fs.readFile(path.join(ROOT, p), 'utf8');

test('server: nic z rozhraní se neuloží natrvalo pod adresou bez verze', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const cesty = ['/', '/index.html', '/agenti', '/styles.css', '/js/app.js', '/js/icons.js', '/manifest.webmanifest', '/sw.js',
    '/logos/claude.svg', '/brand/agenteeq-mark-dark.svg', '/icons/icon-192.png', '/fonts/fonts.css', '/fonts/onest-400.ttf'];
  for (const cesta of cesty) {
    const r = await stahni(`${srv.url}${cesta}`);
    assert.equal(r.status, 200, cesta);
    assert.equal(r.headers.get('cache-control'), 'no-cache', `${cesta}: bez verze v adrese se musí pokaždé ověřit u serveru`);
    assert.ok(r.headers.get('etag'), `${cesta}: bez ETag by prohlížeč stahoval celý soubor znovu`);
    const znovu = await stahni(`${srv.url}${cesta}`, { headers: { 'If-None-Match': r.headers.get('etag') } });
    assert.equal(znovu.status, 304, `${cesta}: nezměněný soubor = 304 v pár bajtech`);
    assert.equal(znovu.headers.get('cache-control'), 'no-cache');
  }
});

test('server: natrvalo jen adresa se značkou obsahu, která k obsahu patří', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  for (const cesta of ['/logos/claude.svg', '/brand/agenteeq-mark-dark.svg', '/icons/icon-192.png', '/fonts/onest-400.ttf']) {
    const znacka = znackaZ(await stahni(`${srv.url}${cesta}`));
    const sedi = await stahni(`${srv.url}${cesta}?v=${znacka}`);
    assert.match(sedi.headers.get('cache-control'), TRVALE, `${cesta}: značka sedí → smí zůstat natrvalo`);
    // Stará stránka po aktualizaci se ptá na starou značku: dostane nový obsah, ale jen k ověření –
    // kdyby se pod starou adresu uložil natrvalo, návrat obsahu (vrácená změna) by ukázal cizí soubor.
    const stara = await stahni(`${srv.url}${cesta}?v=predchozi-verze`);
    assert.equal(stara.status, 200);
    assert.equal(stara.headers.get('cache-control'), 'no-cache', `${cesta}: cizí značka se nesmí uložit natrvalo`);
  }
  // U kódu a stylů značka v adrese nic nemění: ověřují se vždy.
  const js = znackaZ(await stahni(`${srv.url}/js/app.js`));
  assert.equal((await stahni(`${srv.url}/js/app.js?v=${js}`)).headers.get('cache-control'), 'no-cache');
});

test('server: data a živý proud nikdy nejdou do mezipaměti', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  for (const cesta of ['/api/state', '/api/health', '/api/neexistuje']) {
    assert.equal((await stahni(`${srv.url}${cesta}`)).headers.get('cache-control'), 'no-store', cesta);
  }
  const ac = new AbortController();
  const proud = await fetch(`${srv.url}/api/stream`, { signal: ac.signal });
  assert.equal(proud.headers.get('cache-control'), 'no-store');
  assert.match(proud.headers.get('content-type'), /text\/event-stream/);
  ac.abort();
});

test('server: stránka, písma, manifest i sw.js odkazují na loga, písma a ikony se značkou obsahu', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const overOdkaz = async (odkaz, kde) => {
    assert.match(odkaz, /\?v=[\w-]{8,}$/, `${kde}: ${odkaz} nemá značku obsahu`);
    const r = await stahni(new URL(odkaz, srv.url));
    assert.equal(r.status, 200, `${kde}: ${odkaz}`);
    assert.equal(odkaz.split('?v=')[1], znackaZ(r), `${kde}: značka v adrese ${odkaz} musí být ETag souboru`);
    assert.match(r.headers.get('cache-control'), TRVALE, `${kde}: ${odkaz}`);
    return r;
  };

  const index = (await stahni(`${srv.url}/`)).telo.toString('utf8');
  const odkazy = [...index.matchAll(/(?:href|src)="(\/(?:logos|brand|icons|fonts)\/[^"]*)"/g)].map((m) => m[1]);
  assert.ok(odkazy.length >= 3, `čekali jsme ikonu, písma a ikonu pro iOS, našli jsme ${odkazy.length}`);
  for (const o of odkazy) await overOdkaz(o, 'index.html');

  // Skripty (glyph(), obrazovka připojení…) berou značky ze seznamu vloženého do stránky.
  const blok = index.match(/<script type="application\/json" id="agenteeq-verze">([\s\S]*?)<\/script>/);
  assert.ok(blok, 'stránka nemá seznam značek pro skripty');
  const data = JSON.parse(blok[1]);
  assert.equal(data.verze, VERZE, 'stránka nese verzi, pro kterou je její kód');
  for (const slozka of ['logos', 'brand', 'icons']) {
    for (const f of (await fs.readdir(path.join(PUBLIC, slozka))).filter((x) => /\.(svg|png)$/.test(x))) {
      assert.ok(data.soubory[`/${slozka}/${f}`], `seznam nezná /${slozka}/${f}`);
      await overOdkaz(`/${slozka}/${f}?v=${data.soubory[`/${slozka}/${f}`]}`, 'seznam');
    }
  }

  // Písma: fonts.css se značkou a v něm soubory písem se značkou.
  const fonts = await overOdkaz(odkazy.find((o) => o.startsWith('/fonts/fonts.css')), 'index.html');
  const pisma = [...fonts.telo.toString('utf8').matchAll(/url\('([^']+)'\)/g)].map((m) => new URL(m[1], `${srv.url}/fonts/fonts.css`));
  assert.ok(pisma.length >= 7);
  for (const u of pisma) await overOdkaz(`${u.pathname}${u.search}`, 'fonts.css');

  const manifest = JSON.parse((await stahni(`${srv.url}/manifest.webmanifest`)).telo.toString('utf8'));
  for (const ikona of manifest.icons) await overOdkaz(ikona.src, 'manifest');

  const sw = (await stahni(`${srv.url}/sw.js`)).telo.toString('utf8');
  const predem = JSON.parse(sw.match(/const PRECACHE = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  for (const o of predem.filter((x) => /^\/(logos|brand|icons|fonts)\//.test(x))) await overOdkaz(o, 'sw.js');
});

test('server: mezipaměť service workeru se jmenuje podle verze a obsahu, ne ručním číslem', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const sw = (await stahni(`${srv.url}/sw.js`)).telo.toString('utf8');
  const jmeno = sw.match(/const CACHE = '([^']+)';/)?.[1];
  assert.ok(jmeno, 'sw.js nemá jméno mezipaměti');
  assert.match(jmeno, new RegExp(`^agenteeq-${VERZE.replace(/\./g, '\\.')}-[\\w-]{12}$`), `jméno ${jmeno} musí nést verzi a otisk obsahu`);
  assert.doesNotMatch(jmeno, /-v\d+$/, 'ruční „v6“ se zapomene zvednout');
});

// Otisk a značky se počítají z obsahu při každém dotazu (s pamětí podle stat), takže změna souboru
// na disku se projeví bez restartu serveru – `npm run dev` hlídá jen src/ a bin/.
test('verze souborů: změna na disku se projeví hned, bez restartu', async () => {
  const { createVerzeSouboru } = await import('../src/verze-souboru.js');
  const koren = await tempDir('agenteeq-verze-');
  const zapis = async (rel, obsah) => { await fs.mkdir(path.dirname(path.join(koren, rel)), { recursive: true }); await fs.writeFile(path.join(koren, rel), obsah); };
  await zapis('index.html', '<!doctype html><html lang="cs"><head><link rel="icon" href="/logos/a.svg"><link rel="stylesheet" href="/fonts/fonts.css"></head><body></body></html>');
  await zapis('logos/a.svg', '<svg>1</svg>');
  await zapis('fonts/fonts.css', "@font-face { src: url('./x.ttf') format('truetype'); }");
  await zapis('fonts/x.ttf', 'pismo-1');
  await zapis('js/app.js', 'export const a = 1;');
  await zapis('sw.js', "const CACHE = 'agenteeq-shell';\nconst PRECACHE = ['/', '/logos/a.svg'];\n");
  const v = createVerzeSouboru(koren, { verze: '9.9.9' });
  const stav = async () => {
    const index = (await v.priprav('/index.html', await fs.readFile(path.join(koren, 'index.html')))).toString();
    const sw = (await v.priprav('/sw.js', await fs.readFile(path.join(koren, 'sw.js')))).toString();
    return {
      logo: index.match(/\/logos\/a\.svg\?v=([\w-]+)/)?.[1],
      fonts: index.match(/\/fonts\/fonts\.css\?v=([\w-]+)/)?.[1],
      cache: sw.match(/const CACHE = '([^']+)'/)?.[1],
      precache: sw.match(/'\/logos\/a\.svg\?v=([\w-]+)'/)?.[1],
      seznam: JSON.parse(index.match(/id="agenteeq-verze">([\s\S]*?)<\/script>/)[1]).soubory['/logos/a.svg'],
    };
  };
  const a = await stav();
  assert.ok(a.logo && a.fonts && a.cache && a.precache && a.seznam, JSON.stringify(a));
  assert.equal(a.logo, a.seznam);
  assert.equal(a.logo, a.precache);
  assert.match(a.cache, /^agenteeq-9\.9\.9-/);

  await zapis('logos/a.svg', '<svg>nové logo</svg>');
  const b = await stav();
  assert.notEqual(b.logo, a.logo, 'nové logo = nová adresa');
  assert.equal(b.seznam, b.logo);
  assert.notEqual(b.cache, a.cache, 'nové logo = nová mezipaměť service workeru');
  assert.equal(b.fonts, a.fonts, 'písma se nezměnila, jejich adresa zůstává');

  await zapis('fonts/x.ttf', 'pismo-2 delší');
  const c = await stav();
  assert.notEqual(c.fonts, b.fonts, 'nové písmo = nová adresa fonts.css (nese značky písem)');

  await zapis('js/app.js', 'export const a = 2;');
  const d = await stav();
  assert.notEqual(d.cache, c.cache, 'nový kód = nová mezipaměť service workeru');
  assert.equal(d.logo, c.logo, 'kód nemění adresy log');

  // Chybějící soubor se neverzuje (odkaz zůstane, jak byl) a nic nespadne.
  assert.equal(await v.verzujOdkazy('<img src="/logos/neni.svg">'), '<img src="/logos/neni.svg">');
  // Cesta ven z kořene se nikdy nečte.
  assert.equal(await v.verzeSouboru('/logos/../../etc/passwd'), '');
});

/* ---------- Service worker ---------- */

// sw.js ve VM s atrapou Cache Storage a sítě. Požadavky jsou prosté objekty (Node neumí mode
// „navigate“), Request atrapa jen zapamatuje, s jakým režimem mezipaměti se stahovalo.
function spustSw(text, { sit, mezipameti = {} } = {}) {
  const posluchaci = {};
  const ulozeno = new Map(Object.entries(mezipameti).map(([k, v]) => [k, new Map(Object.entries(v))]));
  const klic = (r) => (typeof r === 'string' ? r : r.url);
  const otevri = async (jmeno) => {
    if (!ulozeno.has(jmeno)) ulozeno.set(jmeno, new Map());
    const m = ulozeno.get(jmeno);
    return {
      add: async (req) => { m.set(new URL(klic(req), 'http://127.0.0.1:4620').pathname + new URL(klic(req), 'http://127.0.0.1:4620').search, await sit(req)); },
      put: async (req, res) => { m.set(new URL(klic(req)).pathname + new URL(klic(req)).search, res); },
    };
  };
  const stazeno = [];
  class Req {
    constructor(vstup, init = {}) { Object.assign(this, typeof vstup === 'string' ? { url: new URL(vstup, 'http://127.0.0.1:4620').href, method: 'GET', mode: 'cors' } : vstup, init); }
  }
  const kontext = vm.createContext({
    self: {
      addEventListener: (jmeno, fn) => { posluchaci[jmeno] = fn; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      registration: {},
      location: new URL('http://127.0.0.1:4620/sw.js'),
    },
    caches: {
      keys: async () => [...ulozeno.keys()],
      delete: async (k) => ulozeno.delete(k),
      open: otevri,
      match: async (req) => {
        const u = new URL(klic(req));
        for (const m of ulozeno.values()) if (m.has(u.pathname + u.search)) return m.get(u.pathname + u.search);
        return undefined;
      },
    },
    fetch: async (req) => { stazeno.push(req); return sit(req); },
    Request: Req,
    Response: { error: () => ({ type: 'error' }) },
    URL,
    Promise,
    console,
  });
  vm.runInContext(text, kontext);
  const udalost = (jmeno, extra = {}) => {
    let ceka = null;
    let odpoved = null;
    const e = { ...extra, waitUntil: (p) => { ceka = p; }, respondWith: (p) => { odpoved = p; } };
    posluchaci[jmeno](e);
    return { hotovo: ceka, odpoved };
  };
  return { udalost, ulozeno, stazeno };
}
const odpoved = (telo, hlavicky = {}) => ({ ok: true, type: 'basic', status: 200, telo, headers: { get: (k) => hlavicky[k.toLowerCase()] ?? null }, clone() { return this; } });

test('service worker: po vydání smaže starou mezipaměť, cizí nechá být', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const text = (await stahni(`${srv.url}/sw.js`)).telo.toString('utf8');
  const jmeno = text.match(/const CACHE = '([^']+)';/)[1];
  const sw = spustSw(text, {
    sit: async () => odpoved('x'),
    mezipameti: { 'agenteeq-shell-v6': { '/': odpoved('stará') }, 'agenteeq-0.28.0-abcdefabcdef': {}, 'cizi-aplikace': {} },
  });
  await sw.udalost('install').hotovo;
  assert.ok(sw.ulozeno.get(jmeno)?.size >= 5, 'nová skořápka se uloží předem do nové mezipaměti');
  await sw.udalost('activate').hotovo;
  assert.deepEqual([...sw.ulozeno.keys()].sort(), [jmeno, 'cizi-aplikace'].sort());
});

test('service worker: když server běží, vrací vždy čerstvou odpověď; API a no-store nikdy neukládá', async () => {
  const text = await fs.readFile(path.join(PUBLIC, 'sw.js'), 'utf8');
  const sit = async (req) => (req.url.includes('/ucet/') ? odpoved('návrat', { 'cache-control': 'no-store' }) : odpoved(`čerstvé ${req.url}`));
  const sw = spustSw(text, { sit, mezipameti: { 'agenteeq-shell-v6': { '/js/app.js': odpoved('stará verze') } } });
  const pozadavek = (cesta, mode = 'cors') => ({ request: { url: `http://127.0.0.1:4620${cesta}`, method: 'GET', mode }, preloadResponse: Promise.resolve(undefined) });

  const js = sw.udalost('fetch', pozadavek('/js/app.js'));
  assert.equal((await js.odpoved).telo, 'čerstvé http://127.0.0.1:4620/js/app.js', 'síť napřed: stará kopie se nepoužije');
  assert.equal(sw.stazeno.at(-1).cache, 'no-cache', 'kód se stahuje s ověřením u serveru');

  await sw.udalost('fetch', pozadavek('/fonts/fonts.css?v=abc123def456')).odpoved;
  assert.notEqual(sw.stazeno.at(-1).cache, 'no-cache', 'písma se značkou obsahu smí přijít rovnou z mezipaměti prohlížeče');
  await sw.udalost('fetch', pozadavek('/fonts/fonts.css')).odpoved;
  assert.equal(sw.stazeno.at(-1).cache, 'no-cache', 'bez značky se ověří');

  assert.equal(sw.udalost('fetch', pozadavek('/api/state')).odpoved, null, 'API jde mimo service worker');
  assert.equal(sw.udalost('fetch', pozadavek('/api/stream')).odpoved, null, 'živý proud jde mimo service worker');

  await sw.udalost('fetch', pozadavek('/ucet/navrat/abc?code=tajne', 'navigate')).odpoved;
  await sleep(10);
  const vse = [...sw.ulozeno.values()].flatMap((m) => [...m.keys()]);
  assert.ok(!vse.some((k) => k.startsWith('/ucet/')), 'odpověď s no-store (návrat z přihlášení) se neukládá');
  assert.ok(vse.includes('/js/app.js'));
});

/* ---------- Adresy log ze skriptů ---------- */

test('skripty berou loga, značku a ikony jen přes adresaSouboru()', async () => {
  const soubory = [];
  const projdi = async (dir) => {
    for (const e of await fs.readdir(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== 'i18n') await projdi(`${dir}/${e.name}`);
      else if (e.name.endsWith('.js')) soubory.push(`${dir}/${e.name}`);
    }
  };
  await projdi('public/js');
  const holé = [];
  for (const f of soubory) {
    const text = await src(f);
    for (const m of text.matchAll(/(['"`])\/(logos|brand|icons|fonts)\//g)) {
      if (!text.slice(Math.max(0, m.index - 14), m.index).endsWith('adresaSouboru(')) holé.push(`${f}: ${text.slice(m.index, m.index + 40)}`);
    }
  }
  assert.deepEqual(holé, [], 'adresa bez značky obsahu se ukládá jen k ověření – loga by se zbytečně ptala serveru');

  const { adresaSouboru, verzeStranky } = await import('../public/js/verze.js');
  assert.equal(adresaSouboru('/logos/claude.svg'), '/logos/claude.svg', 'bez seznamu (Node, starší stránka) holá cesta – ta je vždy čerstvá');
  assert.equal(verzeStranky(), '');
});

test('adresaSouboru(): značka ze seznamu ve stránce, nic jiného do atributu nepustí', async () => {
  const kod = (await src('public/js/verze.js')).replace(/^export /gm, '');
  const spust = (obsah) => {
    const kontext = vm.createContext({ document: { getElementById: (id) => (id === 'agenteeq-verze' ? { textContent: obsah } : null) }, JSON, encodeURIComponent });
    vm.runInContext(`${kod}\nthis.vysledek = [adresaSouboru('/logos/claude.svg'), adresaSouboru('/logos/neni.svg'), verzeStranky()];`, kontext);
    return Array.from(kontext.vysledek); // pole z jiného realmu by deepEqual odmítl
  };
  assert.deepEqual(spust('{"verze":"0.29.1","soubory":{"/logos/claude.svg":"AbC_12-xyz"}}'), ['/logos/claude.svg?v=AbC_12-xyz', '/logos/neni.svg', '0.29.1']);
  assert.deepEqual(spust('{"soubory":{"/logos/claude.svg":"\\" onerror=alert(1)"}}'), ['/logos/claude.svg', '/logos/neni.svg', ''], 'podezřelá značka se nepoužije');
  assert.deepEqual(spust('rozbité'), ['/logos/claude.svg', '/logos/neni.svg', '']);
});
