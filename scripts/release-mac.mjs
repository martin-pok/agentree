// Vydání pro macOS jedním příkazem: `npm run release:mac`
//
// Projde celou cestu od testů po hotový archiv a volitelně vymění aplikaci v /Applications:
//
//   1. npm test a npm run check        důkaz, že se vydává něco funkčního
//   2. npm run smoke                   balíček se opravdu nainstaluje a nastartuje
//   3. rozšíření pro Chrome            dist/agenteeq-extension-<verze>.zip
//   4. web (landing page + rozhraní)   dist/web
//   5. npm run build:mac               .app, podpis, volitelně notarizace, dist/…zip
//   6. --install                       výměna aplikace v /Applications (jen na výslovné přání)
//
// Krok 6 je jediný, který sahá na už nainstalovanou aplikaci, a proto se nikdy nespustí sám:
// chce přepínač --install a starou aplikaci nemaže, jen ji odloží do zálohy. Kdyby nová verze
// nefungovala, je návrat otázkou jednoho přesunu.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const install = args.has('--install');
const preskocitTesty = args.has('--skip-tests');

if (process.platform !== 'darwin') {
  console.error('Vydání pro macOS jde sestavit jen na macOS s nástroji Xcode (swiftc, codesign).');
  console.error('Na jiném systému projdou testy a kontrola syntaxe, samotný build ne.');
  process.exit(1);
}

const APLIKACE = '/Applications/Agenteeq.app';
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
const archiv = path.join(root, 'dist', `Agenteeq-${version}-macOS-${process.arch}.zip`);

const krok = (n, text) => console.log(`\n== ${n}. ${text} ==`);
const run = (command, cmdArgs, options = {}) => execFileSync(command, cmdArgs, { cwd: root, stdio: 'inherit', ...options });
const tise = (command, cmdArgs) => {
  try { return execFileSync(command, cmdArgs, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; }
};

console.log(`Agenteeq ${version} — vydání pro macOS (${process.arch})`);

if (preskocitTesty) {
  console.log('\nPozor: --skip-tests. Vydáváš něco, co neprošlo testy. Dělej to jen při opakovaném pokusu po neúspěšném podpisu.');
} else {
  krok(1, 'Testy a kontrola syntaxe');
  run('npm', ['test']);
  run('npm', ['run', 'check']);

  krok(2, 'Instalační balíček (smoke)');
  run('npm', ['run', 'smoke']);
}

krok(3, 'Rozšíření pro Chrome');
run('node', ['scripts/build-extension.mjs']);

krok(4, 'Web: landing page a rozhraní');
run('node', ['scripts/build-site.mjs']);

krok(5, 'Aplikace pro macOS');
if (!process.env.AGENTEEQ_SIGN_IDENTITY) {
  console.log('AGENTEEQ_SIGN_IDENTITY není nastavená → ad-hoc podpis. Takový build funguje na tomto Macu,');
  console.log('ale stažený z internetu ho Gatekeeper odmítne. Pro veřejné vydání nastav Developer ID');
  console.log('a AGENTEEQ_NOTARY_PROFILE (viz docs/LICENSING.md).');
}
run('npm', ['run', 'build:mac']);

if (install) {
  krok(6, 'Výměna aplikace v /Applications');
  const bezi = tise('pgrep', ['-x', 'Agenteeq']);
  if (bezi) {
    console.log('Agenteeq běží — žádám ho, ať se ukončí.');
    tise('osascript', ['-e', 'quit app "Agenteeq"']);
    for (let i = 0; i < 20 && tise('pgrep', ['-x', 'Agenteeq']); i++) execFileSync('sleep', ['0.5']);
    if (tise('pgrep', ['-x', 'Agenteeq'])) {
      console.error('Agenteeq se neukončil. Zavři ho ručně a spusť příkaz znovu — na běžící aplikaci se nesahá.');
      process.exit(1);
    }
  }

  const uz = await fs.stat(APLIKACE).then(() => true, () => false);
  if (uz) {
    // Stará verze se nemaže, jen odkládá. Návrat zpátky je pak jeden přesun ve Finderu.
    const zalohy = path.join(os.homedir(), '.agenteeq', 'zalohy');
    await fs.mkdir(zalohy, { recursive: true });
    const stara = tise('defaults', ['read', `${APLIKACE}/Contents/Info`, 'CFBundleShortVersionString']) || 'neznama';
    const kam = path.join(zalohy, `Agenteeq-${stara}-${new Date().toISOString().replace(/[:.]/g, '-')}.app`);
    run('ditto', [APLIKACE, kam]);
    console.log(`Předchozí verze (${stara}) odložena do ${kam}`);
    await fs.rm(APLIKACE, { recursive: true, force: true });
  }

  const rozbaleno = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-install-'));
  run('ditto', ['-x', '-k', archiv, rozbaleno]);
  run('ditto', [path.join(rozbaleno, 'Agenteeq.app'), APLIKACE]);
  await fs.rm(rozbaleno, { recursive: true, force: true });
  run('codesign', ['--verify', '--deep', '--strict', APLIKACE]);
  console.log(`Nainstalováno: ${APLIKACE} (${version})`);
  run('open', ['-a', APLIKACE]);
} else {
  krok(6, 'Instalace do /Applications přeskočena');
  console.log('Spusť `npm run release:mac -- --install`, pokud chceš vyměnit i aplikaci na tomhle Macu.');
  console.log('Stará verze se přitom nemaže, jen odloží do ~/.agenteeq/zalohy.');
}

console.log('\nHotovo. Výstupy v dist/:');
for (const f of (await fs.readdir(path.join(root, 'dist')).catch(() => [])).sort()) console.log(`  dist/${f}`);
console.log(`
Zbývá ručně (vydání na GitHubu, aby fungovalo tlačítko „Stáhnout pro Mac" na webu):
  1. git push
  2. Vytvoř vydání s tagem v${version} a přilož:
       ${path.relative(root, archiv)}
       dist/agenteeq-extension-${version}.zip
  3. Zkontroluj, že https://github.com/martin-pok/agentree/releases/latest vede na nové vydání.
  4. Web: dist/web nahraj na hosting (Vercel použije vercel.json a sestaví si ho sám).`);
