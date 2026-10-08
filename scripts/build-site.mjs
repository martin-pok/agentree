// Sestavení webu do dist/web – to, co se nahrává na hosting (vercel.json → outputDirectory).
//
// Na jedné adrese žijí dvě různé věci a tenhle skript je poskládá tak, aby si nepřekážely:
//
//   /       landing page (site/) – jediné, co má vidět někdo, kdo o Agenteeq slyší poprvé
//   /en     táž stránka anglicky (site/en/)
//   /app    statická kopie rozhraní aplikace (public/) – rozcestník „Kde máš Agenteeq?“
//           pro telefon mimo domácí síť, viz docs/REMOTE.md
//
// Rozhraní odkazuje na své soubory absolutně (/js/app.js, /styles.css), takže všechno z public/
// zůstává v kořeni a stěhuje se jen jeho index.html. Díky tomu se nemusí sahat do aplikace kvůli
// webu – a zároveň marketingová stránka nikdy neskončí v balíčku aplikace (site/ je mimo public/).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ukazkoveOdpovedi } from './ukazka-data.mjs';
import { adresaObchodu } from '../public/js/obchod.js';
import { SATOSHI_FACE } from '../src/verze-souboru.js';
import { zajistiSatoshi } from './satoshi.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Kam vede rozhraní aplikace na webovém hostingu.
export const APP_PATH = '/app';

// Jazykové verze landing page. Výchozí je čeština v kořeni, angličtina na /en (čistá adresa
// jako /app – hosting má cleanUrls). Obě mají stejnou stavbu, liší se jen texty; hlídá to
// test/site.test.mjs.
export const JAZYKY = [
  { kod: 'cs', adresa: '/', soubor: 'index.html' },
  { kod: 'en', adresa: '/en', soubor: path.join('en', 'index.html') },
];

// Stránka Instalace (postup pro Mac a Windows, rozšíření) v obou jazycích. Má stejné tlačítka
// ke stažení i značky rozšíření jako úvodní stránka, takže se sestavuje stejnými funkcemi.
export const INSTALACE = [
  { kod: 'cs', adresa: '/instalace', soubor: path.join('instalace', 'index.html') },
  { kod: 'en', adresa: '/en/install', soubor: path.join('en', 'install', 'index.html') },
];

// Přepíše softwareVersion ve strukturovaných datech stránky. Když ji tam nenajde, spadne: tichá
// změna tvaru stránky by jinak vrátila zastaralou verzi a nikdo by si nevšiml.
export function verzeVDatechStranky(html, verze) {
  const vzor = /"softwareVersion":"[^"]*"/;
  if (!vzor.test(html)) throw new Error('Stránka webu nemá „softwareVersion“ ve strukturovaných datech — uprav scripts/build-site.mjs.');
  return html.replace(vzor, `"softwareVersion":"${verze}"`);
}

// Odkaz na stažení míří na přílohu se stálým jménem v posledním vydání. Adresa s číslem verze
// by po každém vydání ukazovala do prázdna, dokud by někdo nepřestavěl web — a přesně tak vypadá
// rozbité tlačítko Stáhnout. Stálé kopie přikládá k vydání workflow (.github/workflows/release.yml).
export const REPO = 'https://github.com/martin-pok/agentree';
export const BALICEK_MAC = 'Agenteeq-macOS-arm64.zip';
export const INSTALATOR_MAC = 'Agenteeq-macOS-arm64.dmg';
export const BALICEK_WINDOWS = 'Agenteeq-Windows-x64.zip';

// Stálé přílohy, které POSLEDNÍ ZVEŘEJNĚNÉ vydání opravdu má. Jediné místo, které se po vydání
// mění: web nesmí odkazovat na soubor, který na GitHubu ještě není (tlačítko by vedlo na 404).
// Ověřeno 6. 10. 2026 proti zveřejněnému v0.37.1: má všechny tři stálé přílohy (ZIP a DMG pro
// Mac, ZIP pro Windows). Mac proto stahuje DMG a Windows vede rovnou na ZIP.
export const V_POSLEDNIM_VYDANI = Object.freeze([BALICEK_MAC, INSTALATOR_MAC, BALICEK_WINDOWS]);

export const prilohaVydani = (jmeno) => `${REPO}/releases/latest/download/${jmeno}`;

// Kam vedou tlačítka ke stažení podle toho, co poslední vydání má.
export function cileStazeni(vydano = V_POSLEDNIM_VYDANI) {
  return {
    dmg: vydano.includes(INSTALATOR_MAC),
    mac: prilohaVydani(vydano.includes(INSTALATOR_MAC) ? INSTALATOR_MAC : BALICEK_MAC),
    windows: vydano.includes(BALICEK_WINDOWS) ? prilohaVydani(BALICEK_WINDOWS) : `${REPO}/releases/latest`,
  };
}

// Značky v HTML: <!-- nazev -->…<!-- /nazev -->. Sestavení nechá jen platný blok.
const blokZnacky = (nazev) => new RegExp(`\\n[ \\t]*<!-- ${nazev} -->([\\s\\S]*?)[ \\t]*<!-- /${nazev} -->`);
function nechejBlok(html, nechat, zahodit) {
  return html.replace(blokZnacky(zahodit), '').replace(blokZnacky(nechat), (_, obsah) => obsah.replace(/\n$/, ''));
}

// Tlačítko pro Mac (data-stahnout="mac-arm64") stránka mít musí; pro Windows (data-stahnout=
// "windows-x64") jen tam, kde je. Postup pro Mac stojí na stránce dvakrát – mezi značkami
// <!-- mac:dmg --> a <!-- mac:zip --> – a zůstane ten, který sedí na stahovaný soubor.
export function odkazNaStazeni(html, vydano = V_POSLEDNIM_VYDANI) {
  const mac = /(data-stahnout="mac-arm64" href=")[^"]*(")/g;
  if (!mac.test(html)) throw new Error('Stránka webu nemá odkaz s data-stahnout="mac-arm64" — uprav scripts/build-site.mjs.');
  const cile = cileStazeni(vydano);
  let out = html
    .replace(mac, `$1${cile.mac}$2`)
    .replace(/(data-stahnout="windows-x64" href=")[^"]*(")/g, `$1${cile.windows}$2`);
  const dmgBlok = blokZnacky('mac:dmg').test(out), zipBlok = blokZnacky('mac:zip').test(out);
  if (dmgBlok !== zipBlok) throw new Error('Stránka webu má jen jednu ze značek mac:dmg a mac:zip — uprav scripts/build-site.mjs.');
  // Značky se zpracují opakovaně: postup pro Mac smí na stránce stát víckrát (kroky i poznámka).
  while (blokZnacky('mac:dmg').test(out) || blokZnacky('mac:zip').test(out)) {
    out = cile.dmg ? nechejBlok(out, 'mac:dmg', 'mac:zip') : nechejBlok(out, 'mac:zip', 'mac:dmg');
  }
  return out;
}

// Instalace rozšíření na webu: stránka nese obě cesty mezi značkami <!-- rozsireni:obchod --> a
// <!-- rozsireni:rucne -->. Sestavení nechá jen tu platnou – dokud rozšíření v Chrome Web Store
// není (public/js/obchod.js je prázdné), ruční; potom odkaz do obchodu a „2 minuty“ místo „10“.
// Chybějící značky shodí sestavení: jinak by na webu tiše zůstaly obě cesty najednou.
export function rozsireniNaWebu(html, url = adresaObchodu()) {
  const blok = (nazev) => new RegExp(`\\n[ \\t]*<!-- rozsireni:${nazev} -->([\\s\\S]*?)[ \\t]*<!-- /rozsireni:${nazev} -->`);
  if (!blok('obchod').test(html) || !blok('rucne').test(html)) throw new Error('Stránka webu nemá značky rozsireni:obchod a rozsireni:rucne — uprav scripts/build-site.mjs.');
  const obchod = adresaObchodu(url);
  if (obchod) {
    return html
      .replace(blok('rucne'), '')
      .replace(blok('obchod'), (_, obsah) => obsah.replace(/data-obchod-chrome href="#"/g, `data-obchod-chrome href="${obchod}" target="_blank" rel="noopener"`).replace(/\n$/, ''))
      .replace(/(<span class="detail-tag") data-rozsireni-doba="([^"]*)">[^<]*</, '$1>$2<');
  }
  return html
    .replace(blok('obchod'), '')
    .replace(blok('rucne'), (_, obsah) => obsah.replace(/\n$/, ''))
    .replace(/ data-rozsireni-doba="[^"]*"/, '');
}

// Manifest PWA platí pro rozhraní aplikace, ne pro landing page: na hostingu se proto přepíše tak,
// aby instalace na plochu otevřela /app. Na Macu zůstává public/manifest.webmanifest beze změny,
// protože tam je rozhraní skutečně v kořeni.
export function manifestProWeb(text, appPath = APP_PATH) {
  const m = JSON.parse(text);
  m.id = appPath;
  m.start_url = `${appPath}?source=pwa`;
  m.scope = appPath;
  m.shortcuts = (m.shortcuts || []).map((s) => ({ ...s, url: s.url.replace(/^\//, `${appPath}/`) }));
  return `${JSON.stringify(m, null, 2)}\n`;
}

// Service worker si dopředu ukládá „/“ jako skořápku aplikace. Na hostingu je v kořeni landing
// page, takže by si offline uložil marketing místo rozhraní – proto se cesta přepíše na /app.
export function serviceWorkerProWeb(text, appPath = APP_PATH) {
  const puvodni = "const PRECACHE = ['/',";
  if (!text.includes(puvodni)) throw new Error('sw.js změnil tvar seznamu PRECACHE – uprav scripts/build-site.mjs.');
  return text.replace(puvodni, `const PRECACHE = ['${appPath}',`);
}

// Značka „tohle je kopie na webu, žádný server tu není“. Vkládá se hned za <head>,
// aby ji rozhraní našlo dřív, než se stihne na cokoli zeptat.
export function znackaStatickeKopie(html) {
  const znacka = '<meta name="agenteeq-staticka-kopie" content="1">';
  if (html.includes('agenteeq-staticka-kopie')) return html;
  if (!html.includes('<head>')) throw new Error('public/index.html nemá <head> — uprav scripts/build-site.mjs.');
  return html.replace('<head>', `<head>\n${znacka}`);
}

async function copyDir(from, to, { skip = () => false } = {}) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const rel = path.relative(root, src);
    if (skip(rel, entry)) continue;
    if (entry.isDirectory()) await copyDir(src, path.join(to, entry.name), { skip });
    else await fs.copyFile(src, path.join(to, entry.name));
  }
}

export async function buildSite({ out = path.join(root, 'dist', 'web') } = {}) {
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });

  // 1. Rozhraní aplikace: všechno kromě jeho index.html zůstane v kořeni.
  await copyDir(path.join(root, 'public'), out, { skip: (rel) => rel === path.join('public', 'index.html') });

  // Satoshi: soubor přibalený do sestavení (scripts/satoshi.mjs) dostane pravidlo @font-face.
  if (await fs.stat(path.join(out, 'fonts', 'satoshi', 'Satoshi-Variable.woff2')).then(() => true, () => false)) {
    await fs.appendFile(path.join(out, 'fonts', 'fonts.css'), `${SATOSHI_FACE}\n`);
  }

  // 2. index.html aplikace se přestěhuje na /app (čistá adresa bez přípony) a dostane značku,
  //    že je to kopie na webu. Rozhraní se pak neptá neexistujícího serveru, jestli žije –
  //    ušetří dotaz a hlavně nenechá na veřejné stránce 404 v konzoli.
  await fs.mkdir(path.join(out, 'app'), { recursive: true });
  await fs.writeFile(
    path.join(out, 'app', 'index.html'),
    znackaStatickeKopie(await fs.readFile(path.join(root, 'public', 'index.html'), 'utf8')),
  );

  // 3. Manifest a service worker se narovnají na novou adresu rozhraní.
  await fs.writeFile(path.join(out, 'manifest.webmanifest'), manifestProWeb(await fs.readFile(path.join(root, 'public', 'manifest.webmanifest'), 'utf8')));
  await fs.writeFile(path.join(out, 'sw.js'), serviceWorkerProWeb(await fs.readFile(path.join(root, 'public', 'sw.js'), 'utf8')));

  // 4. Landing page do kořene. Jde poslední, takže její index.html je ten, který návštěvník uvidí.
  await copyDir(path.join(root, 'site'), out);
  // Verze v datech pro vyhledávače se bere z package.json při každém sestavení. Napsaná ručně by po
  // prvním vydání zastarala – přesně jako číslo v Info.plist, které roky svítilo starou verzi.
  // Stejně se upraví každá jazyková verze stránky – odkaz ke stažení i verze musí sedět v obou.
  const verze = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
  for (const jazyk of JAZYKY) {
    const stranka = path.join(out, jazyk.soubor);
    await fs.writeFile(stranka, rozsireniNaWebu(odkazNaStazeni(verzeVDatechStranky(await fs.readFile(stranka, 'utf8'), verze))));
  }
  for (const jazyk of INSTALACE) {
    const stranka = path.join(out, jazyk.soubor);
    await fs.writeFile(stranka, rozsireniNaWebu(odkazNaStazeni(await fs.readFile(stranka, 'utf8'))));
  }

  // 5. Data živé prohlídky: rozhraní na /app?ukazka z nich ukazuje smyšlenou scénu místo serveru.
  await fs.mkdir(path.join(out, 'ukazka'), { recursive: true });
  await fs.writeFile(path.join(out, 'ukazka', 'data.json'), JSON.stringify(await ukazkoveOdpovedi()));

  // 6. Roboti: stránka je veřejná, rozhraní aplikace na hostingu indexovat nemá smysl.
  await fs.writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: ${APP_PATH}\n\nSitemap: https://agentree-fawn.vercel.app/sitemap.xml\n`);

  // Vrácený seznam popisuje adresy na hostingu, ne soubory na disku: „js/app.js“ je URL.
  // path.relative dá na Windows „js\\app.js“, což jako odkaz na webu nikam nevede – proto
  // se oddělovač vždy narovná na lomítko, ať se web sestavuje odkudkoli.
  const soubory = [];
  const projdi = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await projdi(p);
      else soubory.push(path.relative(out, p).split(path.sep).join('/'));
    }
  };
  await projdi(out);
  return { out, files: soubory.sort() };
}

// Hlavičky, které hosting (vercel.json → headers) pošle k dané cestě. Náhled webu i kontrola
// `npm run qa:site` je posílají taky, aby se bezpečnostní politika (CSP a spol.) zkoušela na
// skutečných stránkách dřív, než se nasadí – rozbitou stránku by jinak ukázala až produkce.
// Zdroj pravidla je výraz ve tvaru, jaký vercel.json používá („/(.*)\\.(js|css)“, „/install.sh“).
export async function hlavickyWebu() {
  const vercel = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8'));
  const pravidla = (vercel.headers || []).map((h) => ({ vzor: new RegExp(`^${h.source}$`), hlavicky: h.headers }));
  return (cesta) => {
    const out = {};
    for (const { vzor, hlavicky } of pravidla) if (vzor.test(cesta)) for (const { key, value } of hlavicky) out[key] = value;
    return out;
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await zajistiSatoshi();
  const r = await buildSite();
  console.log(`Web sestaven: ${r.files.length} souborů v ${path.relative(root, r.out)}`);
  console.log(`  /      landing page (site/)`);
  console.log(`  ${APP_PATH}   rozhraní aplikace (public/)`);
}
