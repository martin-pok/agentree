// Kontrola sestavené aplikace: `npm run qa:native` (macOS nebo Windows, po `npm run build:mac`
// nebo `npm run build:windows`).
//
// Testy a smoke:server ověřují kód a server. Tenhle skript ověřuje to, co z nich nevyplývá –
// že **archiv, který si člověk stáhne**, po rozbalení nastartuje: plášť spustí přibalený Node,
// server se ohlásí, okno načte rozhraní a to se vykreslí. Pak aplikaci ukončí a zkontroluje,
// že po ní nezůstal běžet server.
//
// Plášť pracuje v režimu QA (AGENTEEQ_DESKTOP_QA=1): nepíše do systému oznámení, nesdílí zámek
// ani data okna s běžnou instancí a do souboru z AGENTEEQ_DESKTOP_QA_REPORT zapisuje, co se
// stalo (desktop/Agenteeq.swift, desktop/windows/Agenteeq.cpp). Domov i data jsou dočasné.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
const vystup = path.join(root, 'dist', 'qa-native');
await fs.mkdir(vystup, { recursive: true });

const mac = process.platform === 'darwin';
const win = process.platform === 'win32';
if (!mac && !win) {
  console.log('qa:native běží jen na macOS a Windows – tady není co spustit.');
  process.exit(0);
}

const kroky = [];
const zapis = (ok, text) => { kroky.push({ ok, text }); console.log(`${ok ? '  ✓' : '  ✗'} ${text}`); };
const cekej = (ms) => new Promise((r) => setTimeout(r, ms));

const archiv = path.join(root, 'dist', mac ? `Agenteeq-${version}-macOS-${process.arch}.zip` : `Agenteeq-${version}-Windows-x64.zip`);
try { await fs.access(archiv); } catch {
  console.error(`Chybí ${path.relative(root, archiv)} – nejdřív ${mac ? 'npm run build:mac' : 'npm run build:windows'}.`);
  process.exit(1);
}

const pracovni = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-native-'));
const rozbaleno = path.join(pracovni, 'rozbaleno');
const domov = path.join(pracovni, 'domov');
const hlaseni = path.join(pracovni, 'hlaseni.jsonl');
await fs.mkdir(domov, { recursive: true });

// Rozbalit přesně tak, jak to udělá člověk: Finder (ditto) na Macu, Průzkumník na Windows.
if (mac) spawnSync('ditto', ['-x', '-k', archiv, rozbaleno], { stdio: 'inherit' });
else spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archiv}' -DestinationPath '${rozbaleno}'`], { stdio: 'inherit' });
const spustitelny = mac ? path.join(rozbaleno, 'Agenteeq.app', 'Contents', 'MacOS', 'Agenteeq') : path.join(rozbaleno, 'Agenteeq', 'Agenteeq.exe');
try { await fs.access(spustitelny); zapis(true, `archiv se rozbalil (${path.basename(archiv)})`); } catch {
  zapis(false, `v archivu chybí ${path.relative(rozbaleno, spustitelny)}`);
  process.exit(1);
}
if (mac) {
  const podpis = spawnSync('codesign', ['--verify', '--deep', '--strict', path.join(rozbaleno, 'Agenteeq.app')], { encoding: 'utf8' });
  zapis(podpis.status === 0, `podpis aplikace po rozbalení platí${podpis.status === 0 ? '' : `: ${podpis.stderr.trim()}`}`);
}

const plast = spawn(spustitelny, [], {
  env: {
    ...process.env,
    AGENTEEQ_DESKTOP_QA: '1',
    AGENTEEQ_DESKTOP_QA_REPORT: hlaseni,
    AGENTEEQ_SOURCE_HOME: domov,
    AGENTEEQ_HOME: path.join(domov, 'data'),
    AGENTEEQ_CLOUD: '0',
    AGENTEEQ_OLLAMA_URL: 'http://127.0.0.1:9',
  },
  stdio: 'ignore',
});

async function udalosti() {
  try {
    return (await fs.readFile(hlaseni, 'utf8')).split('\n').filter(Boolean).map((r) => JSON.parse(r));
  } catch { return []; }
}
async function pockejNa(udalost, timeout, podminka = () => true) {
  const konec = Date.now() + timeout;
  while (Date.now() < konec) {
    const nalez = (await udalosti()).find((u) => u.udalost === udalost && podminka(u));
    if (nalez) return nalez;
    if (plast.exitCode !== null) return null;
    await cekej(250);
  }
  return null;
}
const portOtevreny = (port) => new Promise((resolve) => {
  const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); resolve(true); });
  s.on('error', () => resolve(false));
  s.setTimeout(1000, () => { s.destroy(); resolve(false); });
});

function snimekObrazovky(soubor) {
  if (mac) return spawnSync('screencapture', ['-x', soubor]).status === 0;
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms, System.Drawing;',
    '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;',
    '$i = New-Object System.Drawing.Bitmap $b.Width, $b.Height;',
    '$g = [System.Drawing.Graphics]::FromImage($i);',
    '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size);',
    `$i.Save('${soubor}', [System.Drawing.Imaging.ImageFormat]::Png);`,
  ].join(' ');
  return spawnSync('powershell.exe', ['-NoProfile', '-Command', ps]).status === 0;
}

let port = 0;
try {
  const server = await pockejNa('server', 90000);
  port = server?.port || 0;
  zapis(port > 0, port > 0 ? `plášť spustil přibalený Node a server se ohlásil (port ${port})` : 'server se do 90 s neohlásil');

  // Sonda „ready“ znamená, že rozhraní načetlo stav, vykreslilo se a jeho zprávy docházejí do
  // pláště – stejnou cestou jde přepnutí vzhledu. Na Windows plášť navíc pár sekund po navigaci
  // zapíše „stav-okna“ přímo z výsledku skriptu, takže při selhání log řekne, co v okně je.
  const nacteno = port ? await pockejNa('nacteno', 90000) : null;
  const sonda = nacteno?.zprava?.sonda;
  zapis(Boolean(sonda), sonda ? 'okno načetlo rozhraní a to ohlásilo připravenost' : 'rozhraní se v okně do 90 s nenačetlo');
  if (sonda) {
    zapis(sonda.navigace >= 5, `navigace aplikace je vykreslená (${sonda.navigace} položek)`);
    zapis(sonda.pohled > 0, `obrazovka má obsah (${sonda.pohled} bloků, „${String(sonda.text || '').replace(/\s+/g, ' ').slice(0, 60)}…“)`);
    zapis(sonda.aplikace === true, 'rozhraní ví, že běží v aplikaci (agenteeqDesktop)');
    zapis(sonda.desktop === true, 'styly aplikace jsou zapnuté (is-desktop)');
    if (win) zapis(sonda.windows === true, 'rozhraní ví, že běží na Windows (is-windows)');
  }
  await cekej(1500);
  const soubor = path.join(vystup, `${mac ? 'macos' : 'windows'}-okno.png`);
  zapis(snimekObrazovky(soubor), `snímek obrazovky: ${path.relative(root, soubor)}`);
} finally {
  // Ukončit jako systém: na Macu SIGTERM, na Windows ukončení procesu. Server musí skončit s ním
  // (na Macu hlídá rodiče, na Windows ho drží job object) – jinak by po zavřené aplikaci běžel dál.
  if (win) spawnSync('taskkill', ['/PID', String(plast.pid), '/F']);
  else plast.kill('SIGTERM');
  await new Promise((r) => (plast.exitCode === null && plast.signalCode === null ? plast.once('exit', r) : r()));
  if (port) {
    let otevreny = true;
    for (let i = 0; i < 40 && otevreny; i++) { otevreny = await portOtevreny(port); if (otevreny) await cekej(250); }
    zapis(!otevreny, otevreny ? `server na portu ${port} běží i po ukončení aplikace` : 'po ukončení aplikace server skončil taky');
  }
  await fs.writeFile(path.join(vystup, 'vysledek.json'), JSON.stringify({ system: process.platform, arch: process.arch, archiv: path.basename(archiv), kroky, udalosti: await udalosti() }, null, 2));
  await fs.rm(pracovni, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}

const chyb = kroky.filter((k) => !k.ok).length;
if (chyb) {
  // Bez snímku z artefaktu musí stačit log: co plášť zaznamenal, v pořadí, jak se to stalo.
  const vysledek = JSON.parse(await fs.readFile(path.join(vystup, 'vysledek.json'), 'utf8'));
  console.log('\nUdálosti z pláště:');
  for (const u of vysledek.udalosti) console.log(`  ${JSON.stringify(u).slice(0, 400)}`);
}
console.log(chyb ? `\nNEPROŠLO: ${chyb} z ${kroky.length}.` : `\nV pořádku: ${kroky.length} z ${kroky.length}.`);
process.exit(chyb ? 1 : 0);
