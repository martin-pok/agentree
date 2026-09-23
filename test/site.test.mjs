import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, manifestProWeb, serviceWorkerProWeb, znackaStatickeKopie, odkazNaStazeni, REPO, BALICEK_MAC, APP_PATH } from '../scripts/build-site.mjs';
import { tempDir } from './helpers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Na jedné adrese žijí dvě věci: landing page v kořeni a rozhraní aplikace na /app. Rozhraní
// odkazuje na své soubory absolutně, takže sestavení musí obojí složit tak, aby si nepřekáželo.
test('web: landing page je v kořeni, rozhraní aplikace na /app a soubory aplikace zůstávají u kořene', async () => {
  const out = await tempDir('web-');
  const r = await buildSite({ out });

  const korenova = await fs.readFile(path.join(out, 'index.html'), 'utf8');
  assert.match(korenova, /Každý agent má svůj úkol/, 'v kořeni musí být landing page');
  assert.equal(korenova.includes('<aside class="sidebar">'), false, 'a rozhodně ne rozhraní aplikace');

  const aplikace = await fs.readFile(path.join(out, 'app/index.html'), 'utf8');
  assert.match(aplikace, /<aside class="sidebar">/, 'rozhraní aplikace patří na /app');
  // Kopie se od aplikace smí lišit přesně v jedné věci: značce „tady žádný server není“.
  // Cokoli dalšího by znamenalo, že se rozhraní na webu začalo rozcházet s tím v aplikaci.
  const zdroj = await fs.readFile(path.join(ROOT, 'public/index.html'), 'utf8');
  const bezZnacky = aplikace.replace('\n<meta name="agenteeq-staticka-kopie" content="1">', '');
  assert.equal(bezZnacky, zdroj, 'kopie se od aplikace nesmí lišit v ničem jiném než ve značce');

  // Rozhraní tahá soubory z kořene (/js/app.js, /styles.css) – musí tam být, jinak je /app rozbité.
  for (const soubor of ['styles.css', 'js/app.js', 'js/boot.js', 'fonts/fonts.css', 'brand/agenteeq-mark-dark.svg', 'logos/claude.svg']) {
    assert.ok(r.files.includes(soubor), `v sestavení chybí ${soubor}`);
  }
  assert.ok(r.files.includes('lp.css'), 'styly landing page');
  assert.match(await fs.readFile(path.join(out, 'robots.txt'), 'utf8'), new RegExp(`Disallow: ${APP_PATH}`));

  // Živá prohlídka (/app?ukazka) čte data sestavená spolu s webem – bez nich by rám zůstal na snímcích.
  assert.ok(r.files.includes('ukazka/data.json'), 'data živé prohlídky');
  const ukazka = JSON.parse(await fs.readFile(path.join(out, 'ukazka', 'data.json'), 'utf8'));
  assert.equal(typeof ukazka.vytvoreno, 'number');
  assert.ok(ukazka.odpovedi['/api/state'].sessions.length > 0);
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
    assert.ok(app.includes(token), `aplikace nemá token ${token} – sjednoť obě strany`);
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

test('web: stránka je česky a nabízí skutečnou prohlídku a instalační postup', async () => {
  const html = await fs.readFile(path.join(ROOT, 'site/index.html'), 'utf8');
  assert.match(html, /<html lang="cs">/);
  assert.match(html, /<meta name="description" content="[^"]{80,}"/, 'popis pro vyhledávače');
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport"[^>]*width=device-width/);
  assert.match(html, /<a class="skip" href="#obsah">/, 'přeskočení na obsah pro klávesnici');
  assert.ok(html.includes('href="#vyzkouset"'), 'výzva vede na dostupný instalační postup');
  assert.match(html, /data-stahnout="mac-arm64"/, 'stránka musí mít tlačítko ke stažení');
  assert.match(html, /chrome:\/\/extensions/);
  assert.match(html, /Mac musí být zapnutý/);
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  assert.equal(graph[0].about['@id'], graph[1]['@id']);
  assert.match(html, /rel="canonical" href="https:\/\/agentree-fawn.vercel.app\/"/);
  // Alternativní text u obrázků: prázdný u dekorace, vyplněný u obsahových.
  for (const m of html.matchAll(/<img (?![^>]*alt=)[^>]*>/g)) assert.fail(`obrázek bez alt: ${m[0]}`);
});

// Živá prohlídka je skutečná aplikace v rámu. Je jen na dívání (žádný fokus, žádné ovládání),
// poslouchá jen vlastní původ a snímky pod ní zůstávají: bez JavaScriptu, během načítání a když
// se aplikace nenačte, je prohlídka pořád celá.
test('web: živá prohlídka je jen na dívání, snímky zůstávají jako záloha', async () => {
  const js = await fs.readFile(path.join(ROOT, 'site/lp.js'), 'utf8');
  assert.match(js, /iframe\.src = `\/app\?ukazka#\/\$\{aktivni\}`/);
  assert.match(js, /iframe\.inert = true;/, 'do rámu se nedá klepnout ani přejít klávesnicí');
  assert.match(js, /iframe\.tabIndex = -1;/);
  assert.match(js, /obal\.setAttribute\('aria-hidden', 'true'\)/, 'odečítačka čte popis snímku, ne celou aplikaci');
  assert.match(js, /e\.origin !== location\.origin \|\| e\.source !== ziva\.okno/, 'zprávy jen z vlastního rámu');
  assert.match(js, /if \(bezPohybu\.matches\) return void ukaz\(\);/, 'omezený pohyb: rovnou konečný stav, bez nástupu');
  assert.match(js, /if \(!ziva\.videt\) ukaz\(\);\s*\n\s*else if \(ziva\.ukazana\) pust\(\);/, 'snímek, na který se někdo dívá, nezmizí pod rukama');
  const html = await fs.readFile(path.join(ROOT, 'site/index.html'), 'utf8');
  for (const obrazovka of ['prehled', 'projekty', 'utrata']) {
    assert.match(html, new RegExp(`<picture class="shot[^"]*" data-obrazovka="${obrazovka}"`), `snímek ${obrazovka} zůstává jako záloha`);
  }
  const css = await fs.readFile(path.join(ROOT, 'site/lp.css'), 'utf8');
  assert.match(css, /\.shot-live \{[^}]*pointer-events: none;/);
});

// Kopie rozhraní na webu o sobě musí vědět předem. Bez značky by se ptala neexistujícího
// serveru, jestli žije, a nechala by na veřejné stránce 404 v konzoli – přesně to, co
// CLAUDE.md zakazuje („čistá konzole“).
test('web: kopie rozhraní na /app ví, že za ní žádný server není', async () => {
  const out = await tempDir('web-znacka-');
  await buildSite({ out });

  const naWebu = await fs.readFile(path.join(out, 'app', 'index.html'), 'utf8');
  assert.match(naWebu, /<meta name="agenteeq-staticka-kopie" content="1">/, 'kopie na webu značku má');

  const vAplikaci = await fs.readFile(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(vAplikaci, /agenteeq-staticka-kopie/,
    'v aplikaci značka být nesmí – tam server je a rozhraní se ho ptát má');

  // Značka se vkládá do <head>, aby ji rozhraní našlo dřív, než se stihne na cokoli zeptat.
  assert.ok(naWebu.indexOf('agenteeq-staticka-kopie') < naWebu.indexOf('</head>'));
});

test('značka se do stránky nepřidá dvakrát', () => {
  const jednou = znackaStatickeKopie('<!doctype html><html><head>\n<title>x</title></head></html>');
  assert.equal(jednou.match(/agenteeq-staticka-kopie/g).length, 1);
  assert.equal(znackaStatickeKopie(jednou), jednou, 'opakované sestavení nic nepřidá');
  assert.throws(() => znackaStatickeKopie('<html><body>bez hlavičky</body></html>'), /head/);
});

// Verze ve strukturovaných datech stránky se bere z package.json při sestavení, ne z ruky.
test('web nese verzi z package.json, ne opsanou z minula', async () => {
  const { verzeVDatechStranky } = await import('../scripts/build-site.mjs');
  assert.equal(
    verzeVDatechStranky('x "softwareVersion":"0.1.0" y', '9.8.7'),
    'x "softwareVersion":"9.8.7" y',
  );
  assert.throws(() => verzeVDatechStranky('<html></html>', '1.0.0'), /softwareVersion/, 'bez pole se nesmí mlčky vrátit stará verze');
  const fsp = await import('node:fs/promises');
  const balicek = JSON.parse(await fsp.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore' });
  const html = await fsp.readFile(new URL('../dist/web/index.html', import.meta.url), 'utf8');
  assert.match(html, new RegExp(`"softwareVersion":"${balicek.version.replace(/\./g, '\\.')}"`));
});

// Na webu nesmí nic běžet donekonečna: návštěvník stránku čte, nedívá se na smyčku.
// Nástupní animace jsou konečné a při `prefers-reduced-motion: reduce` se vypínají.
// Kontrola v prohlížeči to hlídá taky, ale ta potřebuje Playwright – tohle projde vždy.
test('web nemá nekonečnou animaci a pohyb umí vypnout', async () => {
  const css = await fs.readFile(path.join(ROOT, 'site', 'lp.css'), 'utf8');
  const smycky = [...css.matchAll(/animation:[^;{}]*\binfinite\b[^;{}]*/g)].map(m => m[0].trim());
  assert.deepEqual(smycky, [], 'landing page nesmí mít animaci ve smyčce');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^{]*\{[^]*animation: none !important/, 'omezený pohyb musí animace vypnout');
});


// Nejčastější tichá chyba webu: tlačítko Stáhnout ukazuje do prázdna. Odkaz proto vede na
// přílohu se stálým jménem v posledním vydání – ta přežije povýšení verze bez zásahu do stránky.
test('web: odkaz na stažení míří na stálou přílohu posledního vydání', async () => {
  const out = await tempDir('web-stazeni-');
  await buildSite({ out });
  const html = await fs.readFile(path.join(out, 'index.html'), 'utf8');
  const odkazy = [...html.matchAll(/data-stahnout="mac-arm64" href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(odkazy.length >= 2, 'tlačítko patří do hlavičky i do sekce Stažení');
  for (const odkaz of odkazy) assert.equal(odkaz, `${REPO}/releases/latest/download/${BALICEK_MAC}`);
  assert.throws(() => odkazNaStazeni('<a href="x">bez značky</a>'), /data-stahnout/);
  // Stálou kopii k vydání přikládá workflow. Bez ní by odkaz po dalším vydání přestal fungovat.
  const workflow = await fs.readFile(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
  assert.ok(workflow.includes(BALICEK_MAC), `release.yml musí k vydání přiložit ${BALICEK_MAC}`);
});
