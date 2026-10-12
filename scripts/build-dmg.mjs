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

// Finder po rozložení okna (osascript) drží svazek ještě chvíli otevřený a hdiutil detach hlásí
// „Resource busy“ (viděno na runneru s macOS). První pokus přitom svazek často odpojí, jen disk
// nevysune – přípojný bod pak už neexistuje a další pokus s ním skončí „No such file“. Proto se
// odpojuje zařízení (/dev/diskN z výpisu attach), opakovaně s rostoucím odstupem, a -force přijde
// až v posledním pokusu, kdy už Finder měl čas zapsat .DS_Store s rozložením.
export const ODSTUPY_ODPOJENI = [0, 1000, 2000, 4000, 8000];

/** Zařízení připojeného obrazu z výpisu `hdiutil attach` (první řádek „/dev/diskN …“), jinak ''. */
export const zarizeniZVypisu = (vypis) => String(vypis).match(/^(\/dev\/disk\d+)\s/m)?.[1] || '';

/** Odpojí svazek; `spust(argv)` a `cekej(ms)` se předávají, ať jde pořadí pokusů ověřit testem. */
export function odpojSvazek(cil, { spust, cekej }) {
  let chyba;
  for (const [i, odstup] of ODSTUPY_ODPOJENI.entries()) {
    if (odstup) cekej(odstup);
    const posledni = i === ODSTUPY_ODPOJENI.length - 1;
    try { spust(['detach', ...(posledni ? ['-force'] : []), cil]); return i + 1; }
    catch (error) { chyba = error; }
  }
  throw chyba;
}

export function planDmg({ verze, arch = 'arm64', dist, docasna, identita = '-', notarProfil = '' }) {
  const zip = path.posix.join(dist, jmenoZip(verze, arch));
  const dmg = path.posix.join(dist, jmenoDmg(verze, arch));
  const obsah = path.posix.join(docasna, 'obsah');
  const writable = path.posix.join(docasna, 'Agenteeq-editable.dmg');
  const mounted = path.posix.join(docasna, 'mounted');
  const art = path.posix.join(obsah, '.background', 'Agenteeq.png');
  const kroky = [
    ['ditto', ['-x', '-k', zip, obsah]],
    ['ln', ['-s', '/Applications', path.posix.join(obsah, 'Applications')]],
    ['xcrun', ['swift', path.posix.join(root, 'desktop', 'DmgBackground.swift'), art]],
    ['hdiutil', ['create', '-volname', SVAZEK, '-srcfolder', obsah, '-fs', 'HFS+', '-format', 'UDRW', '-ov', writable]],
    ['hdiutil', ['attach', '-readwrite', '-noverify', '-noautoopen', '-mountpoint', mounted, writable]],
    ['osascript', ['-e', finderLayoutScript(mounted)]],
    ['hdiutil', ['detach', mounted]],
    ['hdiutil', ['convert', writable, '-format', 'UDZO', '-o', dmg]],
    ['hdiutil', ['verify', dmg]],
  ];
  if (identita !== '-') {
    kroky.push(['codesign', ['--force', '--sign', identita, '--timestamp', dmg]]);
    if (notarProfil) {
      kroky.push(['xcrun', ['notarytool', 'submit', dmg, '--keychain-profile', notarProfil, '--wait']]);
      kroky.push(['xcrun', ['stapler', 'staple', dmg]]);
    }
  }
  return { zip, dmg, obsah, mounted, art, kroky };
}

// Finder saves window geometry and icon positions to .DS_Store on the writable volume.
// The finished read-only DMG retains this metadata and the local PNG background.
export function finderLayoutScript(mount) {
  const q = (v) => JSON.stringify(v);
  return `tell application "Finder"
  set volumeFolder to (POSIX file ${q(mount)} as alias)
  open volumeFolder
  delay 1
  set dmgWindow to front window
  set current view of dmgWindow to icon view
  set toolbar visible of dmgWindow to false
  set statusbar visible of dmgWindow to false
  set bounds of dmgWindow to {120, 110, 880, 580}
  set opts to icon view options of dmgWindow
  set arrangement of opts to not arranged
  set icon size of opts to 104
  set text size of opts to 13
  set background picture of opts to (POSIX file ${q(path.posix.join(mount, '.background', 'Agenteeq.png'))} as alias)
  set position of item "Agenteeq.app" of dmgWindow to {198, 254}
  set position of item "Applications" of dmgWindow to {566, 254}
  close dmgWindow
  open volumeFolder
  update volumeFolder without registering applications
  delay 1
  close front window
end tell`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') {
    console.error('Obraz disku (DMG) jde sestavit jen na macOS – hdiutil jinde není.');
    process.exit(1);
  }
  const verze = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
  const dist = path.join(root, 'dist');
  const docasna = await fs.mkdtemp('/private/tmp/agenteeq-dmg-');
  const plan = planDmg({verze, arch:process.arch, dist, docasna,
    identita:process.env.AGENTEEQ_SIGN_IDENTITY || '-',
    notarProfil:process.env.AGENTEEQ_NOTARY_PROFILE || ''});
  let mounted = false;
  let zarizeni = '';
  try {
    await fs.access(plan.zip).catch(() => {throw new Error('Chybí hotový ZIP. Nejdřív spusť npm run build:mac.');});
    await fs.mkdir(path.dirname(plan.art), {recursive:true});
    await fs.mkdir(plan.obsah, {recursive:true});
    await fs.mkdir(plan.mounted, {recursive:true});
    for(const [command,args] of plan.kroky) {
      const spust=(argv)=>execFileSync(command,argv,{cwd:root,stdio:'inherit',timeout:180000});
      const cekej=(ms)=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
      try {
        if(command==='hdiutil' && args[0]==='detach') odpojSvazek(zarizeni || args.at(-1),{spust,cekej});
        else if(command==='hdiutil' && args[0]==='attach') {
          const vypis=execFileSync(command,args,{cwd:root,stdio:['ignore','pipe','inherit'],timeout:180000});
          process.stdout.write(vypis);
          zarizeni=zarizeniZVypisu(vypis);
        } else spust(args);
      }
      catch(error){throw new Error(`Krok DMG selhal: ${command} ${args[0]} (${error.message})`);}
      if(command==='hdiutil' && args[0]==='attach') mounted=true;
      if(command==='hdiutil' && args[0]==='detach') mounted=false;
    }
    const entries=(await fs.readdir(plan.obsah)).filter(p=>!p.startsWith('.')).sort();
    if(JSON.stringify(entries)!==JSON.stringify(['Agenteeq.app','Applications']))
      throw new Error(`Neočekávaný obsah DMG: ${entries.join(', ')}`);
    const png=(await fs.stat(plan.art)).size;
    if(png<10000)throw new Error('Brandové pozadí DMG je neúplné.');
    const size=(await fs.stat(plan.dmg)).size;
    console.log(`Hotovo: ${path.relative(root,plan.dmg)} (${(size/1048576).toFixed(1)} MB)`);
  } catch(error){console.error(error.message);process.exitCode=1;}
  finally {
    if(mounted)try{execFileSync('hdiutil',['detach','-force',zarizeni || plan.mounted],{stdio:'ignore'});}catch{}
    await fs.rm(docasna,{recursive:true,force:true});
  }
}
