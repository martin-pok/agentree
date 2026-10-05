// Instalátor pro Mac jako obraz disku: `npm run build:dmg` (po `npm run build:mac`).
//
// Proč vedle ZIPu ještě DMG: ZIP se po stažení rozbalí do Stahování a člověk, který Mac nezná
// do hloubky, pak aplikaci spouští odtud – nebo ji nenajde vůbec. Obraz disku po otevření ukáže
// Agenteeq a vedle zástupce složky Aplikace, takže instalace je jedno přetažení, jak to lidé
// znají z ostatních aplikací pro Mac.
//
// Obsah se bere z hotového ZIPu (`dist/Agenteeq-<verze>-macOS-<arch>.zip`), ne ze složky buildu.
// V obrazu je tak bit po bitu tatáž aplikace, která jde do vydání i do aktualizací – včetně
// podpisu a případného notarizačního lístku.
//
// Jen nástroje, které má každý Mac: ditto, hdiutil, ln (a codesign/notarytool, když je podpis).
// Žádná knihovna, žádný create-dmg. Na Linuxu ani na Windows to spustit nejde; tvar příkazů
// proto hlídá test/dmg.test.mjs nad čistou funkcí planDmg() a skutečný obraz ověří až běh
// workflow Vydání na runneru s macOS.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Jméno svazku, které uživatel uvidí na ploše a ve Finderu.
export const SVAZEK = 'Agenteeq';

export const jmenoDmg = (verze, arch = 'arm64') => `Agenteeq-${verze}-macOS-${arch}.dmg`;
export const jmenoZip = (verze, arch = 'arm64') => `Agenteeq-${verze}-macOS-${arch}.zip`;

/**
 * Plán sestavení obrazu: seznam příkazů jako argv (žádný shell – cesty se nikdy neskládají
 * do řetězce, který by se rozebíral podruhé). Funkce nic nespouští, takže jde testovat kdekoli.
 */
export function planDmg({ verze, arch = 'arm64', dist, docasna, identita = '-', notarProfil = '' }) {
  // Plán běží jen na macOS, takže cesty se skládají vždy s lomítkem (test ho počítá i na Windows).
  const zip = path.posix.join(dist, jmenoZip(verze, arch));
  const dmg = path.posix.join(dist, jmenoDmg(verze, arch));
  const obsah = path.posix.join(docasna, 'obsah');
  const kroky = [
    // Rozbalit hotový archiv. ditto zachová podpis i rozšířené atributy aplikace.
    ['ditto', ['-x', '-k', zip, obsah]],
    // Zástupce složky Aplikace vedle aplikace: přetažení na něj je celá instalace.
    ['ln', ['-s', '/Applications', path.posix.join(obsah, 'Applications')]],
    // Komprimovaný obraz jen pro čtení (UDZO) s HFS+, který otevře každá podporovaná verze macOS.
    ['hdiutil', ['create', '-volname', SVAZEK, '-srcfolder', obsah, '-fs', 'HFS+', '-format', 'UDZO', '-ov', dmg]],
    // Kontrolní součet obrazu: poškozený soubor se nesmí dostat do vydání.
    ['hdiutil', ['verify', dmg]],
  ];
  if (identita !== '-') {
    // Podepsaný obraz s Developer ID; ad-hoc podpis by obrazu nic nepřidal, proto se vynechá.
    kroky.push(['codesign', ['--force', '--sign', identita, '--timestamp', dmg]]);
    if (notarProfil) {
      kroky.push(['xcrun', ['notarytool', 'submit', dmg, '--keychain-profile', notarProfil, '--wait']]);
      kroky.push(['xcrun', ['stapler', 'staple', dmg]]);
    }
  }
  return { zip, dmg, obsah, kroky };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') {
    console.error('Obraz disku (DMG) jde sestavit jen na macOS – hdiutil jinde není.');
    console.error('Na jiném systému projdou testy a kontrola syntaxe, samotný DMG ne.');
    process.exit(1);
  }
  const verze = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
  const dist = path.join(root, 'dist');
  // Mimo iCloud a File Provider – ty během práce přidávají atributy Finderu (viz build-macos.mjs).
  const docasna = await fs.mkdtemp('/private/tmp/agenteeq-dmg-');
  const plan = planDmg({
    verze,
    arch: process.arch,
    dist,
    docasna,
    identita: process.env.AGENTEEQ_SIGN_IDENTITY || '-',
    notarProfil: process.env.AGENTEEQ_NOTARY_PROFILE || '',
  });
  try {
    await fs.access(plan.zip).catch(() => {
      throw new Error(`Chybí ${path.relative(root, plan.zip)}. Nejdřív spusť npm run build:mac.`);
    });
    await fs.mkdir(plan.obsah, { recursive: true });
    for (const [prikaz, argumenty] of plan.kroky) execFileSync(prikaz, argumenty, { cwd: root, stdio: 'inherit' });
    // Pojistka: v obrazu musí být přesně aplikace a zástupce Aplikací, nic navíc.
    const polozky = (await fs.readdir(plan.obsah)).filter((p) => !p.startsWith('.')).sort();
    if (JSON.stringify(polozky) !== JSON.stringify(['Agenteeq.app', 'Applications'])) {
      throw new Error(`Neočekávaný obsah obrazu: ${polozky.join(', ')}`);
    }
    const velikost = (await fs.stat(plan.dmg)).size;
    console.log(`Hotovo: ${path.relative(root, plan.dmg)} (${(velikost / 1024 / 1024).toFixed(1)} MB)`);
  } catch (chyba) {
    console.error(chyba.message);
    process.exitCode = 1;
  } finally {
    await fs.rm(docasna, { recursive: true, force: true });
  }
}
