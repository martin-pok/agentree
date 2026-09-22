// Sestavení webu do dist/web – to, co se nahrává na hosting (vercel.json → outputDirectory).
//
// Na jedné adrese žijí dvě různé věci a tenhle skript je poskládá tak, aby si nepřekážely:
//
//   /       landing page (site/) – jediné, co má vidět někdo, kdo o Agenteeq slyší poprvé
//   /app    statická kopie rozhraní aplikace (public/) – rozcestník „Kde máš Agenteeq?“
//           pro telefon mimo domácí síť, viz docs/REMOTE.md
//
// Rozhraní odkazuje na své soubory absolutně (/js/app.js, /styles.css), takže všechno z public/
// zůstává v kořeni a stěhuje se jen jeho index.html. Díky tomu se nemusí sahat do aplikace kvůli
// webu – a zároveň marketingová stránka nikdy neskončí v balíčku aplikace (site/ je mimo public/).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Kam vede rozhraní aplikace na webovém hostingu.
export const APP_PATH = '/app';

// Přepíše softwareVersion ve strukturovaných datech stránky. Když ji tam nenajde, spadne: tichá
// změna tvaru stránky by jinak vrátila zastaralou verzi a nikdo by si nevšiml.
export function verzeVDatechStranky(html, verze) {
  const vzor = /"softwareVersion":"[^"]*"/;
  if (!vzor.test(html)) throw new Error('site/index.html nemá „softwareVersion“ ve strukturovaných datech — uprav scripts/build-site.mjs.');
  return html.replace(vzor, `"softwareVersion":"${verze}"`);
}

// Odkaz na stažení. Soubory vydání nesou číslo verze, takže napsaný ručně by po každém vydání
// ukazoval na starý balíček, nebo rovnou nikam. Spadne, když značka ze stránky zmizí.
export const REPO = 'https://github.com/martin-pok/agentree';
export function odkazNaStazeni(html, verze) {
  const vzor = /(data-stahnout="mac-arm64" href=")[^"]*(")/g;
  if (!vzor.test(html)) throw new Error('site/index.html nemá odkaz s data-stahnout="mac-arm64" — uprav scripts/build-site.mjs.');
  const adresa = `${REPO}/releases/download/v${verze}/Agenteeq-${verze}-macOS-arm64.zip`;
  return html
    .replace(vzor, `$1${adresa}$2`)
    .replace(/(<span data-verze-stazeni>)[^<]*(<\/span>)/g, `$1verze ${verze}$2`);
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
  const verze = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
  const stranka = path.join(out, 'index.html');
  await fs.writeFile(stranka, odkazNaStazeni(verzeVDatechStranky(await fs.readFile(stranka, 'utf8'), verze), verze));

  // 5. Roboti: stránka je veřejná, rozhraní aplikace na hostingu indexovat nemá smysl.
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await buildSite();
  console.log(`Web sestaven: ${r.files.length} souborů v ${path.relative(root, r.out)}`);
  console.log(`  /      landing page (site/)`);
  console.log(`  ${APP_PATH}   rozhraní aplikace (public/)`);
}
