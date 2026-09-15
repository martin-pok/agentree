import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildSite, manifestProWeb, serviceWorkerProWeb, APP_PATH } from '../scripts/build-site.mjs';
import { tempDir } from './helpers.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

// Na jedné adrese žijí dvě věci: landing page v kořeni a rozhraní aplikace na /app. Rozhraní
// odkazuje na své soubory absolutně, takže sestavení musí obojí složit tak, aby si nepřekáželo.
test('web: landing page je v kořeni, rozhraní aplikace na /app a soubory aplikace zůstávají u kořene', async () => {
  const out = await tempDir('web-');
  const r = await buildSite({ out });

  const korenova = await fs.readFile(path.join(out, 'index.html'), 'utf8');
  assert.match(korenova, /Velín pro práci s/, 'v kořeni musí být landing page');
  assert.equal(korenova.includes('<aside class="sidebar">'), false, 'a rozhodně ne rozhraní aplikace');

  const aplikace = await fs.readFile(path.join(out, 'app/index.html'), 'utf8');
  assert.match(aplikace, /<aside class="sidebar">/, 'rozhraní aplikace patří na /app');
  assert.equal(aplikace, await fs.readFile(path.join(ROOT, 'public/index.html'), 'utf8'), 'kopie se nesmí lišit od aplikace');

  // Rozhraní tahá soubory z kořene (/js/app.js, /styles.css) — musí tam být, jinak je /app rozbité.
  for (const soubor of ['styles.css', 'js/app.js', 'js/boot.js', 'fonts/fonts.css', 'brand/agenteeq-mark-dark.svg', 'logos/claude.svg']) {
    assert.ok(r.files.includes(soubor), `v sestavení chybí ${soubor}`);
  }
  assert.ok(r.files.includes('lp.css'), 'styly landing page');
  assert.match(await fs.readFile(path.join(out, 'robots.txt'), 'utf8'), new RegExp(`Disallow: ${APP_PATH}`));
});

test('web: manifest a service worker se narovnají na /app, na Macu zůstávají beze změny', async () => {
  const puvodni = await fs.readFile(path.join(ROOT, 'public/manifest.webmanifest'), 'utf8');
  const m = JSON.parse(manifestProWeb(puvodni));
  assert.equal(m.id, '/app');
  assert.equal(m.start_url, '/app?source=pwa');
  assert.equal(m.scope, '/app');
  for (const s of m.shortcuts) assert.ok(s.url.startsWith('/app/'), s.url);
  assert.equal(JSON.parse(puvodni).start_url, '/?source=pwa', 'zdroj pro aplikaci na Macu se nemění');

  const sw = serviceWorkerProWeb(await fs.readFile(path.join(ROOT, 'public/sw.js'), 'utf8'));
  assert.match(sw, /const PRECACHE = \['\/app',/, 'offline skořápkou je rozhraní, ne marketing');

  // Kdyby se tvar seznamu v sw.js změnil, přepis musí spadnout, ne tiše nic neudělat.
  assert.throws(() => serviceWorkerProWeb('const PRECACHE = [];'), /PRECACHE/);
});

test('web: každý odkaz na vlastní soubor v landing page opravdu existuje', async () => {
  const out = await tempDir('web-odkazy-');
  const r = await buildSite({ out });
  const html = await fs.readFile(path.join(out, 'index.html'), 'utf8');
  const css = await fs.readFile(path.join(out, 'lp.css'), 'utf8');
  const cesty = new Set();
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)) cesty.add(m[1]);
  for (const m of css.matchAll(/url\('?(\/[^')]+)'?\)/g)) cesty.add(m[1]);
  assert.ok(cesty.size >= 10, `čekali jsme víc odkazů, našli jsme ${cesty.size}`);
  for (const cesta of cesty) {
    if (cesta === APP_PATH) continue; // čistá adresa bez přípony, soubor je app/index.html
    assert.ok(r.files.includes(cesta.slice(1)), `odkaz ${cesta} nikam nevede`);
  }
});

test('web: landing page drží design systém aplikace a maximální váhu písma 500', async () => {
  const css = await fs.readFile(path.join(ROOT, 'site/lp.css'), 'utf8');
  const app = await fs.readFile(path.join(ROOT, 'public/styles.css'), 'utf8');
  // Klíčové barvy identity „koncertní sál" musí sedět na aplikaci, ne být přibližné.
  for (const token of ['--stage: #121019', '--paper: #F4F3F7', '--ink: #16141D', '--brass: #C99A3E', '--velvet: #C2335A', '--teal: #22A38C']) {
    assert.ok(css.includes(token), `landing page nemá token ${token}`);
    assert.ok(app.includes(token), `aplikace nemá token ${token} — sjednoť obě strany`);
  }
  for (const rodina of ["--f-display: 'Urbanist'", "--f-body: 'Onest'", "--f-mono: 'Geist Mono'"]) {
    assert.ok(css.includes(rodina), rodina);
  }
  const vahy = [...css.matchAll(/font-weight:\s*(\d{3})/g)].map((m) => Number(m[1]));
  assert.equal(vahy.some((v) => v > 500), false, `příliš těžké písmo: ${vahy.filter((v) => v > 500).join(', ')}`);
  assert.match(css, /prefers-reduced-motion/, 'omezení pohybu se respektuje');
  assert.match(css, /prefers-color-scheme: dark/, 'tmavý režim');
  assert.match(css, /:focus-visible/, 'viditelný fokus');
});

// Poctivost nad efektem platí i na webu: panely v hero sekci vypadají jako snímky aplikace,
// takže u každého musí stát, že jde o ukázku. Bez toho by stránka vydávala vymyšlený obsah
// za skutečná data uživatele.
test('web: každá ukázka rozhraní je jako ukázka popsaná', async () => {
  const html = await fs.readFile(path.join(ROOT, 'site/index.html'), 'utf8');
  const panelu = (html.match(/class="stage shot-frame"/g) || []).length;
  const popisku = (html.match(/class="shot-note"/g) || []).length;
  assert.ok(panelu > 0, 'ukázky rozhraní na stránce jsou');
  assert.equal(popisku, panelu, `${panelu} ukázek, ale ${popisku} popisků „Ukázka rozhraní"`);
  for (const m of html.matchAll(/class="shot-note"[^>]*>([^<]+)/g)) assert.match(m[1], /Ukázka rozhraní/);
});

test('web: stránka je česky, má popis pro vyhledávače a odkaz na stažení', async () => {
  const html = await fs.readFile(path.join(ROOT, 'site/index.html'), 'utf8');
  assert.match(html, /<html lang="cs">/);
  assert.match(html, /<meta name="description" content="[^"]{80,}"/, 'popis pro vyhledávače');
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport"[^>]*width=device-width/);
  assert.match(html, /<a class="skip" href="#obsah">/, 'přeskočení na obsah pro klávesnici');
  assert.ok(html.includes('releases/latest'), 'hlavní výzva vede na stažení');
  // Alternativní text u obrázků: prázdný u dekorace, vyplněný u obsahových.
  for (const m of html.matchAll(/<img (?![^>]*alt=)[^>]*>/g)) assert.fail(`obrázek bez alt: ${m[0]}`);
});
