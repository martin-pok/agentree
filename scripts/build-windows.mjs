// Sestavení aplikace pro Windows: `npm run build:windows`
//
// Výsledek je složka, ve které leží všechno potřebné, a ZIP z ní:
//
//   Agenteeq/
//     Agenteeq.exe      plášť (desktop/windows/Agenteeq.cpp)
//     node.exe          přibalený Node — uživatel žádný neinstaluje
//     app/              src, public, bin, extension, desktop, docs
//
// Stejná úvaha jako u macOS balíčku: uživatel dostane jednu věc, rozbalí ji a spustí.
// Rozdíl je jen v tom, že .app je na macOS složka, která vypadá jako soubor, kdežto
// na Windows je to prostě složka.
//
// Co potřebuje ke spuštění: Visual Studio Build Tools (cl.exe, rc.exe) a SDK WebView2.
// SDK je jediná věc, která se stahuje — je to hlavičkový soubor a statická knihovna,
// ne běhová závislost. Výsledný .exe nepotřebuje vedle sebe žádnou DLL.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;

if (process.platform !== 'win32') {
  console.error('Sestavení pro Windows jde jen na Windows s Visual Studio Build Tools.');
  console.error('Na jiném systému projdou testy a kontrola syntaxe, samotný build ne.');
  process.exit(1);
}

const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
const tise = (command, args) => {
  try { return execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; }
};

const zdroje = path.join(root, 'desktop', 'windows');
const build = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-win-build-'));
const balik = path.join(build, 'Agenteeq');
await fs.mkdir(balik, { recursive: true });

console.log(`Agenteeq ${version} – sestavení pro Windows (${process.arch})`);

// ── 1. SDK WebView2 ──────────────────────────────────────────────────────────
//
// Balíček nuget obsahuje WebView2.h a WebView2LoaderStatic.lib. Verze je zamčená
// schválně: build musí dát dnes i za rok tentýž výsledek.
const WEBVIEW2_VERZE = '1.0.2792.45';
const balicky = path.join(root, 'dist', 'sdk');
const webview2 = path.join(balicky, `Microsoft.Web.WebView2.${WEBVIEW2_VERZE}`);

if (!(await fs.stat(path.join(webview2, 'build', 'native', 'include', 'WebView2.h')).then(() => true, () => false))) {
  console.log(`Stahuji SDK WebView2 ${WEBVIEW2_VERZE}…`);
  await fs.mkdir(balicky, { recursive: true });
  const nupkg = path.join(balicky, `webview2-${WEBVIEW2_VERZE}.zip`);
  const url = `https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/${WEBVIEW2_VERZE}`;
  run('curl.exe', ['-sSL', '-o', nupkg, url]);
  run('powershell.exe', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${nupkg}' -DestinationPath '${webview2}' -Force`]);
  await fs.rm(nupkg, { force: true });
}

const include = path.join(webview2, 'build', 'native', 'include');
const knihovna = path.join(webview2, 'build', 'native', 'x64', 'WebView2LoaderStatic.lib');
for (const [soubor, popis] of [[path.join(include, 'WebView2.h'), 'hlavička'], [knihovna, 'statická knihovna']]) {
  if (!(await fs.stat(soubor).then(() => true, () => false))) {
    console.error(`SDK WebView2 je neúplné, chybí ${popis}: ${soubor}`);
    process.exit(1);
  }
}

// ── 2. Prostředky (ikona, manifest, verze) ───────────────────────────────────
//
// Verze se do .rc doplní z package.json, aby žila na jednom místě. Windows chce
// čtyřčíslí, takže se doplní nulou.
const cisla = `${version.split('.').map((n) => Number(n) || 0).concat([0, 0, 0]).slice(0, 3).join(',')},0`;
const rc = (await fs.readFile(path.join(zdroje, 'Agenteeq.rc.in'), 'utf8'))
  .replaceAll('__VERZE_CISLA__', cisla)
  .replaceAll('__VERZE__', version);
await fs.writeFile(path.join(zdroje, 'Agenteeq.generated.rc'), rc, 'utf8');

const res = path.join(build, 'Agenteeq.res');
console.log('Prostředky (ikona, manifest, verze)…');
run('rc.exe', ['/nologo', '/fo', res, path.join(zdroje, 'Agenteeq.generated.rc')]);

// ── 3. Překlad pláště ────────────────────────────────────────────────────────
console.log('Překlad pláště…');
run('cl.exe', [
  '/nologo', '/std:c++17', '/EHsc', '/O2', '/MT', '/W3', '/utf-8',
  '/DUNICODE', '/D_UNICODE',
  `/I${include}`,
  `/Fo${build}\\`, `/Fe${path.join(balik, 'Agenteeq.exe')}`,
  path.join(zdroje, 'Agenteeq.cpp'),
  res,
  '/link', '/SUBSYSTEM:WINDOWS',
  knihovna,
  'user32.lib', 'gdi32.lib', 'shell32.lib', 'ole32.lib', 'oleaut32.lib',
  'shlwapi.lib', 'dwmapi.lib', 'advapi32.lib', 'version.lib',
]);

// ── 4. Aplikace a Node ───────────────────────────────────────────────────────
console.log('Aplikace a Node…');
for (const dir of ['src', 'public', 'bin', 'extension', 'desktop']) {
  await fs.cp(path.join(root, dir), path.join(balik, 'app', dir), { recursive: true });
}
// Zdroje pláště do balíčku nepatří — uživatel dostává .exe, ne překladač.
await fs.rm(path.join(balik, 'app', 'desktop', 'windows'), { recursive: true, force: true });

// Zákazník dostane jen návod; ostatní dokumenty jsou interní (licence, obchod, QA).
await fs.mkdir(path.join(balik, 'app', 'docs'), { recursive: true });
for (const doc of ['INSTALL.md']) await fs.copyFile(path.join(root, 'docs', doc), path.join(balik, 'app', 'docs', doc));
for (const file of ['package.json', 'README.md', 'CHANGELOG.md']) await fs.copyFile(path.join(root, file), path.join(balik, file === 'package.json' ? 'app/package.json' : `app/${file}`));

const node = process.env.AGENTEEQ_NODE_BINARY || process.execPath;
await fs.copyFile(node, path.join(balik, 'node.exe'));
const licenceNode = path.resolve(node, '..', 'LICENSE');
if (await fs.stat(licenceNode).then(() => true, () => false)) {
  await fs.copyFile(licenceNode, path.join(balik, 'NODE-LICENSE.txt'));
}

// ── 5. Podpis ────────────────────────────────────────────────────────────────
//
// Bez podpisu ukáže SmartScreen při stažení varování a část lidí instalaci vzdá.
// Podepisuje se .exe i přibalený node.exe, stejně jako na macOS.
const certifikat = process.env.AGENTEEQ_WINDOWS_CERT || '';
if (certifikat) {
  const heslo = process.env.AGENTEEQ_WINDOWS_CERT_PASSWORD || '';
  const casovaZnacka = process.env.AGENTEEQ_WINDOWS_TIMESTAMP || 'http://timestamp.digicert.com';
  console.log('Podpis…');
  for (const soubor of [path.join(balik, 'Agenteeq.exe'), path.join(balik, 'node.exe')]) {
    run('signtool.exe', ['sign', '/fd', 'SHA256', '/tr', casovaZnacka, '/td', 'SHA256',
      '/f', certifikat, ...(heslo ? ['/p', heslo] : []), soubor]);
  }
  run('signtool.exe', ['verify', '/pa', path.join(balik, 'Agenteeq.exe')]);
} else {
  console.log('AGENTEEQ_WINDOWS_CERT není nastavená → bez podpisu.');
  console.log('Takový build na tomhle počítači funguje, ale stažený z internetu na něj');
  console.log('SmartScreen upozorní. Pro veřejné vydání nastav podpisový certifikát.');
}

// ── 6. Archiv ────────────────────────────────────────────────────────────────
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
const archiv = path.join(root, 'dist', `Agenteeq-${version}-Windows-x64.zip`);
await fs.rm(archiv, { force: true });
console.log('Archiv…');
run('powershell.exe', ['-NoProfile', '-Command',
  `Compress-Archive -LiteralPath '${balik}' -DestinationPath '${archiv}' -CompressionLevel Optimal`]);

const velikost = (await fs.stat(archiv)).size;
await fs.rm(build, { recursive: true, force: true });
await fs.rm(path.join(zdroje, 'Agenteeq.generated.rc'), { force: true });

console.log(`\nHotovo: ${path.relative(root, archiv)} (${(velikost / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Verze pláště: ${tise('powershell.exe', ['-NoProfile', '-Command',
  `(Get-Item '${path.join(balik, 'Agenteeq.exe')}').VersionInfo.FileVersion`]) || version}`);
