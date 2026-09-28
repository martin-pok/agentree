// Čerstvé soubory rozhraní po každé aktualizaci (docs/ARCHITECTURE.md → Mezipaměť a čerstvost).
//
// Okno aplikace pro Mac (WKWebView), Windows (WebView2) i prohlížeč ukládají odpovědi na disk
// podle hlaviček a adresa 127.0.0.1:4620 se mezi verzemi nemění. Soubor uložený „natrvalo“ pod
// adresou bez verze by tam po aktualizaci zůstal klidně rok – přesně tak po vydání s novými logy
// svítila stará. Pravidlo proto zní:
//
//   - natrvalo (`immutable`) smí prohlížeč držet jen adresu se značkou obsahu – `/logos/claude.svg?v=…`,
//     kde značka je tatáž jako ETag souboru. Nový obsah = nová adresa, stará kopie se nikdy nepoužije;
//   - všechno ostatní (stránka, kód, styly, holá adresa loga) má `no-cache` + ETag: prohlížeč se
//     před použitím zeptá a na nezměněný soubor dostane 304 v pár bajtech.
//
// Tenhle modul značky počítá a vpisuje je do odkazů: do stránky (index.html), do manifestu, do
// fonts.css (soubory písem), do sw.js (předem ukládané soubory a jméno mezipaměti) a do seznamu,
// ze kterého si je berou skripty (public/js/verze.js). Server ho volá při každém dotazu, sestavení
// webu (scripts/build-site.mjs) jednou nad hotovou složkou. Značky se počítají z obsahu; paměť
// podle stat() jen šetří čtení nezměněných souborů, takže změna na disku se projeví bez restartu.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Složky, jejichž soubory se odkazují se značkou obsahu a smí pak zůstat v prohlížeči natrvalo.
export const AKTIVA = /^\/(logos|fonts|brand|icons)\//;
export const NATRVALO = 'max-age=31536000, immutable';

// Značka obsahu: stejná pro ETag i pro `?v=` v adrese.
export const znackaObsahu = (telo) => crypto.createHash('sha1').update(telo).digest('base64url').slice(0, 20);

// Odkaz na aktivum v uvozovkách: atributy v HTML, hodnoty v JSON a řetězce v sw.js. Adresa s `?`
// nebo `#` se nechá být – buď už značku má, nebo patří někomu jinému.
const ODKAZ = /(["'])(\/(?:logos|fonts|brand|icons)\/[^"'?#\s]+)\1/g;
const OBRAZEK = /\.(svg|png|webp|jpg|ico)$/;
const JMENO_CACHE = /const CACHE = '[^']*';/;

export function createVerzeSouboru(koren, { verze = '' } = {}) {
  const zaklad = path.resolve(koren);
  const pamet = new Map(); // absolutní cesta → { podpis, znacka } surového obsahu

  // Absolutní cesta k souboru pro URL cestu; mimo kořen nikdy.
  function soubor(cesta) {
    let rel;
    try { rel = decodeURIComponent(cesta); } catch { return null; }
    const abs = path.resolve(zaklad, `.${path.posix.normalize(`/${rel}`)}`);
    return abs.startsWith(zaklad + path.sep) ? abs : null;
  }

  async function znackaSouboru(abs) {
    let st;
    try { st = await fs.stat(abs); } catch { return ''; }
    if (!st.isFile()) return '';
    // ctime se mění při každém zápisu i náhradě souboru a kopie ho neumí zachovat (na rozdíl od mtime).
    const podpis = `${st.size}:${st.mtimeMs}:${st.ctimeMs}:${st.ino}`;
    const znamy = pamet.get(abs);
    if (znamy?.podpis === podpis) return znamy.znacka;
    let telo;
    try { telo = await fs.readFile(abs); } catch { return ''; }
    const znacka = znackaObsahu(telo);
    pamet.set(abs, { podpis, znacka });
    return znacka;
  }

  // Značka toho, co server pod cestou opravdu vydá – u fonts.css tedy obsahu se značkami písem.
  async function verzeSouboru(cesta) {
    const abs = soubor(cesta);
    if (!abs) return '';
    if (!(AKTIVA.test(cesta) && cesta.endsWith('.css'))) return znackaSouboru(abs);
    let telo;
    try { telo = await fs.readFile(abs); } catch { return ''; }
    return znackaObsahu(await priprav(cesta, telo));
  }

  async function verzujOdkazy(text) {
    const cesty = [...new Set([...text.matchAll(ODKAZ)].map((m) => m[2]))];
    const znacky = new Map(await Promise.all(cesty.map(async (c) => [c, await verzeSouboru(c)])));
    return text.replace(ODKAZ, (m, q, c) => (znacky.get(c) ? `${q}${c}?v=${znacky.get(c)}${q}` : m));
  }

  // url('./onest-400.ttf') v CSS uvnitř složky aktiv → url('./onest-400.ttf?v=…'). Relativní zápis
  // zůstává: tatáž fonts.css slouží i rozšíření, kde je kořenem složka rozšíření.
  async function verzujCss(text, cestaCss) {
    const vzor = /url\((['"]?)([^'")]+)\1\)/g;
    const nahrady = new Map();
    await Promise.all([...text.matchAll(vzor)].map(async (m) => {
      const odkaz = m[2].trim();
      if (/^(data:|[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(odkaz) || odkaz.includes('?')) return;
      const cesta = new URL(odkaz, `http://x${cestaCss}`).pathname;
      if (!AKTIVA.test(cesta) || cesta.endsWith('.css')) return;
      const v = await znackaSouboru(soubor(cesta) || '');
      if (v) nahrady.set(m[2], `${m[2]}?v=${v}`);
    }));
    return text.replace(vzor, (m, q, odkaz) => (nahrady.has(odkaz) ? `url(${q}${nahrady.get(odkaz)}${q})` : m));
  }

  async function projdi(dir) {
    let polozky;
    try { polozky = await fs.readdir(dir, { withFileTypes: true }); } catch { return []; }
    const casti = await Promise.all(polozky.map((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? projdi(p) : e.isFile() ? [p] : [];
    }));
    return casti.flat();
  }
  const url = (abs) => `/${path.relative(zaklad, abs).split(path.sep).join('/')}`;

  // Seznam značek pro skripty: loga služeb, značka Agenteeq a ikony (odkazují je glyph() a obrazovky).
  async function seznam() {
    const soubory = (await Promise.all(['logos', 'brand', 'icons'].map((d) => projdi(path.join(zaklad, d))))).flat().filter((f) => OBRAZEK.test(f)).sort();
    const znacky = await Promise.all(soubory.map(znackaSouboru));
    const out = {};
    soubory.forEach((abs, i) => { if (znacky[i]) out[url(abs)] = znacky[i]; });
    return out;
  }

  // Otisk celé složky kromě sw.js: změní se s jakýmkoli souborem rozhraní (kód, styly, loga).
  async function otisk() {
    const soubory = (await projdi(zaklad)).filter((abs) => url(abs) !== '/sw.js').sort();
    const znacky = await Promise.all(soubory.map(znackaSouboru));
    return znackaObsahu(soubory.map((abs, i) => `${url(abs)}\n${znacky[i]}`).join('\n'));
  }

  // Seznam značek a verze kódu do stránky. Data, ne skript (CSP script-src 'self' ho nespouští);
  // `<` se zapisuje jako <, aby řetězec nikdy nemohl ukončit značku <script>.
  async function vlozSeznam(html) {
    if (!html.includes('</head>')) throw new Error('Stránka nemá </head> – seznam značek souborů není kam vložit (src/verze-souboru.js).');
    const data = JSON.stringify({ verze, soubory: await seznam() }).replace(/</g, '\\u003c');
    return html.replace('</head>', `<script type="application/json" id="agenteeq-verze">${data}</script>\n</head>`);
  }

  // Jméno mezipaměti service workeru nese verzi a otisk obsahu. Každé vydání (i každá změna při
  // vývoji) je pro prohlížeč nový sw.js: nainstaluje se, uloží novou skořápku a při aktivaci smaže
  // všechny starší mezipaměti Agenteeq. Ruční „v6“ se dřív zapomínalo zvednout.
  async function pripravSw(text) {
    if (!JMENO_CACHE.test(text)) throw new Error('sw.js nemá řádek „const CACHE = …;“ – uprav src/verze-souboru.js.');
    const jmeno = `agenteeq-${verze || 'vyvoj'}-${(await otisk()).slice(0, 12)}`;
    return verzujOdkazy(text.replace(JMENO_CACHE, `const CACHE = '${jmeno}';`));
  }

  // Obsah, který server pod cestou vydá. `cesta` je cesta souboru od kořene s lomítkem na začátku.
  async function priprav(cesta, telo) {
    if (cesta === '/index.html') return Buffer.from(await vlozSeznam(await verzujOdkazy(telo.toString('utf8'))));
    if (cesta === '/manifest.webmanifest') return Buffer.from(await verzujOdkazy(telo.toString('utf8')));
    if (cesta === '/sw.js') return Buffer.from(await pripravSw(telo.toString('utf8')));
    if (AKTIVA.test(cesta) && cesta.endsWith('.css')) return Buffer.from(await verzujCss(telo.toString('utf8'), cesta));
    return telo;
  }

  return { verzeSouboru, verzujOdkazy, verzujCss, seznam, otisk, vlozSeznam, pripravSw, priprav };
}
