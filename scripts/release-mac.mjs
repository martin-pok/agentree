// Vydání pro macOS jedním příkazem: `npm run release:mac`
//
// Projde celou cestu od testů po hotový archiv a volitelně vymění nainstalovanou aplikaci:
//
//   1. npm test a npm run check        důkaz, že se vydává něco funkčního
//   2. npm run smoke                   balíček se opravdu nainstaluje a nastartuje
//   3. rozšíření pro Chrome            dist/agenteeq-extension-<verze>.zip
//   4. web (landing page + rozhraní)   dist/web
//   5. npm run build:mac               .app, podpis, volitelně notarizace, dist/…zip
//   6. --install                       výměna aplikace tam, kde na tomhle Macu je (jen na výslovné přání)
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

// Kam se instaluje: tam, kde Agenteeq na tomhle Macu doopravdy je. Natvrdo '/Applications' by
// vedle existující kopie v ~/Applications založilo druhou a uživatel by dál spouštěl tu starou –
// s pocitem, že se vydání neprojevilo.
async function kamInstalovat() {
  const domaci = path.join(os.homedir(), 'Applications', 'Agenteeq.app');
  const systemova = '/Applications/Agenteeq.app';
  const je = async (cesta) => fs.stat(cesta).then(() => true, () => false);
  const [mameDomaci, mameSystemovou] = [await je(domaci), await je(systemova)];
  if (mameDomaci && mameSystemovou) {
    console.warn(`Pozor: Agenteeq je na dvou místech (${domaci} i ${systemova}). Měním ten v ${domaci}; ten druhý zůstává na staré verzi.`);
    return domaci;
  }
  if (mameDomaci) return domaci;
  return systemova;
}
const APLIKACE = await kamInstalovat();
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
const archiv = path.join(root, 'dist', `Agenteeq-${version}-macOS-${process.arch}.zip`);

const krok = (n, text) => console.log(`\n== ${n}. ${text} ==`);
const run = (command, cmdArgs, options = {}) => execFileSync(command, cmdArgs, { cwd: root, stdio: 'inherit', ...options });
const tise = (command, cmdArgs) => {
  try { return execFileSync(command, cmdArgs, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; }
};

console.log(`Agenteeq ${version} – vydání pro macOS (${process.arch})`);

// Nástroje se ověřují hned na začátku. Bez toho by chybějící Xcode vysvitlo až v pátém kroku,
// tedy po testech a smoke – po pěti minutách čekání na chybu, která byla vidět od začátku.
krok(0, 'Kontrola nástrojů');
const chybi = [];
for (const [nastroj, kde] of [['swiftc', 'xcrun'], ['codesign', 'which'], ['ditto', 'which'], ['xattr', 'which']]) {
  const nalezeno = kde === 'xcrun' ? tise('xcrun', ['--find', nastroj]) : tise('which', [nastroj]);
  if (!nalezeno) chybi.push(nastroj);
}
if (chybi.length) {
  console.error(`Chybí: ${chybi.join(', ')}.`);
  console.error('Nainstaluj vývojářské nástroje příkazem `xcode-select --install` a spusť to znovu.');
  process.exit(1);
}
if (process.env.AGENTEEQ_NOTARY_PROFILE) {
  if (!process.env.AGENTEEQ_SIGN_IDENTITY) {
    console.error('AGENTEEQ_NOTARY_PROFILE je nastavený, ale AGENTEEQ_SIGN_IDENTITY ne – notarizace bez podpisu Developer ID nedává smysl.');
    process.exit(1);
  }
  if (!tise('xcrun', ['--find', 'notarytool'])) {
    console.error('notarytool není k dispozici. Notarizace vyžaduje plný Xcode, ne jen vývojářské nástroje.');
    process.exit(1);
  }
}
console.log(`V pořádku${process.env.AGENTEEQ_SIGN_IDENTITY ? ' (podpis Developer ID)' : ' (ad-hoc podpis)'}.`);

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
  krok(6, `Výměna aplikace v ${path.dirname(APLIKACE)}`);
  const bezi = tise('pgrep', ['-x', 'Agenteeq']);
  if (bezi) {
    console.log('Agenteeq běží – žádám ho, ať se ukončí.');
    tise('osascript', ['-e', 'quit app "Agenteeq"']);
    for (let i = 0; i < 20 && tise('pgrep', ['-x', 'Agenteeq']); i++) execFileSync('sleep', ['0.5']);
    if (tise('pgrep', ['-x', 'Agenteeq'])) {
      console.error('Agenteeq se neukončil. Zavři ho ručně a spusť příkaz znovu – na běžící aplikaci se nesahá.');
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
  krok(6, `Instalace do ${path.dirname(APLIKACE)} přeskočena`);
  console.log('Spusť `npm run release:mac -- --install`, pokud chceš vyměnit i aplikaci na tomhle Macu.');
  console.log('Stará verze se přitom nemaže, jen odloží do ~/.agenteeq/zalohy.');
}

console.log('\nHotovo. Výstupy v dist/:');
for (const f of (await fs.readdir(path.join(root, 'dist')).catch(() => [])).sort()) console.log(`  dist/${f}`);

// Poslední krok je vydání na GitHubu a bez něj vede tlačítko „Stáhnout pro Mac" na prázdno.
// Skript ho schválně nedělá sám: vydání je veřejná publikace a ta patří do rukou člověka.
// Co ale udělat může, je nenechat ho hádat — ověří, že přílohy opravdu existují, a vypíše
// přesný příkaz, který stačí zkopírovat.
const prilohy = [archiv, path.join(root, 'dist', `agenteeq-extension-${version}.zip`)];
const chybejici = [];
for (const soubor of prilohy) {
  if (!(await fs.stat(soubor).then(() => true, () => false))) chybejici.push(path.relative(root, soubor));
}

const maGh = Boolean(tise('which', ['gh']));
const seznam = prilohy.map((f) => `"${path.relative(root, f)}"`).join(' ');

console.log('\nZbývá vydání na GitHubu — bez něj vede tlačítko „Stáhnout pro Mac" na prázdno.\n');
if (chybejici.length) {
  console.log(`  Pozor: chybí přílohy ${chybejici.join(', ')}. Spusť build znovu bez --skip-tests.`);
} else if (maGh) {
  console.log('  1. git push');
  console.log(`  2. gh release create v${version} ${seznam} --title "Agenteeq ${version}" --notes-from-tag`);
  console.log('     (bez --notes-from-tag ti gh nabídne popis napsat)');
} else {
  console.log('  1. git push');
  console.log(`  2. Vytvoř vydání s tagem v${version} na https://github.com/martin-pok/agentree/releases/new`);
  console.log('     a přilož k němu:');
  for (const f of prilohy) console.log(`       ${path.relative(root, f)}`);
  console.log('     (s nainstalovaným `gh` by to byl jeden příkaz — brew install gh)');
}
console.log('  3. Ověř, že https://github.com/martin-pok/agentree/releases/latest vede na nové vydání.');
console.log('  4. Web: dist/web nahraj na hosting (Vercel použije vercel.json a sestaví si ho sám).');
console.log('\nKdyž u Macu nejsi: `git tag v' + version + ' && git push --tags` nechá vydání sestavit');
console.log('v CI (.github/workflows/release.yml) — aplikaci pro Mac i pro Windows a rozšíření.');
console.log('Vznikne jako koncept; zveřejnit ho musíš sám.');
