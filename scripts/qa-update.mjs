// Skutečná aktualizace sestavené aplikace pro Mac: `npm run qa:update` (jen macOS, po `npm run build:mac`).
//
// Testy kódu nepoznají, jestli se aplikace při „Aktualizovat a restartovat“ opravdu ukončí, vymění
// a znovu spustí. Přesně tady se dřív zasekla na „Instalujeme…“ a nešla ukončit ani z Docku.
// Tenhle skript to dělá naostro s archivem, který si člověk stáhne:
//
//   A) běžná aktualizace verze V → V+1 (aplikace v dočasné složce „Aplikace“),
//   B) aktualizace se zaseknutým serverem (SIGSTOP) V+1 → V+2,
//   C) ukončení aplikace se zaseknutým serverem.
//
// Pokaždé měří čas a ověřuje: starý proces skončil, na místě je nová verze, nová verze běží,
// po výměně nezůstaly rozbalené zbytky a denik aktualizace (~/Library/Logs/Agenteeq/update.log)
// popisuje, co se stalo. Plášť k tomu má scénáře jen v režimu QA (desktop/Agenteeq.swift → runQaScenario).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin') {
  console.log('qa:update běží jen na macOS – tady není co aktualizovat.');
  process.exit(0);
}
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
const archiv = path.join(root, 'dist', `Agenteeq-${version}-macOS-${process.arch}.zip`);
try { await fs.access(archiv); } catch {
  console.error(`Chybí ${path.relative(root, archiv)} – nejdřív npm run build:mac.`);
  process.exit(1);
}
const vystup = path.join(root, 'dist', 'qa-update');
await fs.mkdir(vystup, { recursive: true });

const kroky = [];
const zapis = (ok, text) => { kroky.push({ ok, text }); console.log(`${ok ? '  ✓' : '  ✗'} ${text}`); };
const cekej = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} selhal: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
const dalsi = (v, o) => { const [a, b, c] = v.split('.').map(Number); return `${a}.${b}.${c + o}`; };

const pracovni = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-update-'));
const aplikace = path.join(pracovni, 'Aplikace');
const domov = path.join(pracovni, 'domov');
const bundle = path.join(aplikace, 'Agenteeq.app');
const spustitelny = path.join(bundle, 'Contents', 'MacOS', 'Agenteeq');
const denik = path.join(os.homedir(), 'Library', 'Logs', 'Agenteeq', 'update.log');
await fs.mkdir(aplikace, { recursive: true });
await fs.mkdir(domov, { recursive: true });
run('ditto', ['-x', '-k', archiv, aplikace]);

// Balíček další verze: stejná aplikace s vyšším číslem verze, znovu podepsaná stejně jako build.
async function balicek(cilovaVerze) {
  const slozka = path.join(pracovni, `v${cilovaVerze}`);
  const app = path.join(slozka, 'Agenteeq.app');
  run('ditto', ['-x', '-k', archiv, slozka]);
  run('plutil', ['-replace', 'CFBundleShortVersionString', '-string', cilovaVerze, path.join(app, 'Contents', 'Info.plist')]);
  run('codesign', ['--force', '--sign', '-', '--entitlements', path.join(root, 'desktop', 'app-entitlements.plist'), app]);
  run('codesign', ['--verify', '--deep', '--strict', app]);
  const zip = path.join(pracovni, `Agenteeq-${cilovaVerze}.zip`);
  run('ditto', ['-c', '-k', '--keepParent', app, zip]);
  return zip;
}
const verzeNaDisku = () => { try { return run('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(bundle, 'Contents', 'Info.plist')]); } catch { return ''; } };
const bezi = (vzor) => spawnSync('pgrep', ['-f', vzor]).status === 0;
async function ukonciVse() {
  for (const signal of ['TERM', 'KILL']) {
    spawnSync('pkill', [`-${signal}`, '-f', spustitelny]);
    spawnSync('pkill', [`-${signal}`, '-f', path.join(bundle, 'Contents', 'Resources', 'node')]);
    await cekej(1500);
  }
}
async function pockej(podminka, ms) {
  const konec = Date.now() + ms;
  while (Date.now() < konec) { if (await podminka()) return true; await cekej(250); }
  return false;
}

function spustQa(env, hlaseni) {
  return spawn(spustitelny, [], {
    env: {
      ...process.env,
      PORT: '0',
      AGENTEEQ_DESKTOP_QA: '1',
      AGENTEEQ_DESKTOP_QA_REPORT: hlaseni,
      AGENTEEQ_SOURCE_HOME: domov,
      AGENTEEQ_HOME: path.join(domov, 'data'),
      AGENTEEQ_CLOUD: '0',
      AGENTEEQ_UCET_URL: '0',
      AGENTEEQ_OPEN: 'dry',
      AGENTEEQ_PROCESSES: '0',
      AGENTEEQ_KEYCHAIN: '0',
      AGENTEEQ_NATIVE_NOTIFY: '0',
      AGENTEEQ_OLLAMA_URL: 'http://127.0.0.1:9',
      ...env,
    },
    stdio: 'ignore',
  });
}
const udalosti = async (hlaseni) => { try { return (await fs.readFile(hlaseni, 'utf8')).split('\n').filter(Boolean).map((r) => JSON.parse(r)); } catch { return []; } };

async function aktualizace(nazev, z, na, { zaseknuty = false } = {}) {
  const zip = await balicek(na);
  const hlaseni = path.join(pracovni, `${nazev}.jsonl`);
  const plast = spustQa({ AGENTEEQ_DESKTOP_QA_INSTALL: zip, AGENTEEQ_DESKTOP_QA_INSTALL_VERSION: na, ...(zaseknuty ? { AGENTEEQ_DESKTOP_QA_WEDGE: '1' } : {}) }, hlaseni);
  const skoncil = new Promise((r) => plast.once('exit', () => r(Date.now())));
  const server = await pockej(async () => (await udalosti(hlaseni)).some((u) => u.udalost === 'server'), 90000);
  zapis(server, `${nazev}: aplikace ${z} nastartovala`);
  if (!server) { plast.kill('SIGKILL'); return; }
  const start = Date.now();
  const konec = await Promise.race([skoncil, cekej(60000).then(() => null)]);
  zapis(konec !== null, konec ? `${nazev}: stará verze se ukončila za ${((konec - start) / 1000).toFixed(1)} s` : `${nazev}: stará verze se do 60 s neukončila`);
  if (!konec) { plast.kill('SIGKILL'); return; }
  const vymeneno = await pockej(() => verzeNaDisku() === na, 45000);
  zapis(vymeneno, vymeneno ? `${nazev}: na místě je ${na} (${((Date.now() - start) / 1000).toFixed(1)} s od začátku)` : `${nazev}: na disku zůstala ${verzeNaDisku() || 'žádná verze'}`);
  const novaBezi = await pockej(() => bezi(spustitelny), 30000);
  zapis(novaBezi, novaBezi ? `${nazev}: nová verze se sama spustila` : `${nazev}: nová verze se nespustila`);
  const zbytky = (await fs.readdir(aplikace)).filter((f) => f.startsWith('.agenteeq-update-'));
  zapis(zbytky.length === 0, zbytky.length ? `${nazev}: vedle aplikace zůstaly rozbalené zbytky ${zbytky.join(', ')}` : `${nazev}: po výměně nezůstaly rozbalené zbytky`);
  const kroky = (await udalosti(hlaseni)).filter((u) => u.udalost === 'aktualizace').map((u) => u.krok);
  zapis(['rozbaleni', 'podpis', 'ukonceni', 'restart'].every((k) => kroky.includes(k)), `${nazev}: okno ukázalo kroky průběhu (${kroky.join(' → ')})`);
  await ukonciVse();
}

try {
  await fs.rm(denik, { force: true });
  await aktualizace('A běžná', version, dalsi(version, 1));
  await aktualizace('B zaseknutý server', dalsi(version, 1), dalsi(version, 2), { zaseknuty: true });

  // C) Ukončení se zaseknutým serverem: aplikace musí skončit sama a server s ní.
  const hlaseni = path.join(pracovni, 'C.jsonl');
  const plast = spustQa({ AGENTEEQ_DESKTOP_QA_QUIT: '1', AGENTEEQ_DESKTOP_QA_WEDGE: '1' }, hlaseni);
  const skoncil = new Promise((r) => plast.once('exit', () => r(Date.now())));
  const server = await pockej(async () => (await udalosti(hlaseni)).some((u) => u.udalost === 'server'), 90000);
  zapis(server, 'C ukončení: aplikace nastartovala');
  if (server) {
    await pockej(async () => (await udalosti(hlaseni)).some((u) => u.udalost === 'qa-ukonceni'), 20000);
    const start = Date.now();
    const konec = await Promise.race([skoncil, cekej(30000).then(() => null)]);
    zapis(konec !== null && konec - start <= 12000, konec ? `C ukončení: aplikace skončila za ${((konec - start) / 1000).toFixed(1)} s i se zaseknutým serverem` : 'C ukončení: aplikace se do 30 s neukončila');
    const serverPryc = await pockej(() => !bezi(path.join(bundle, 'Contents', 'Resources', 'node')), 10000);
    zapis(serverPryc, serverPryc ? 'C ukončení: server skončil s aplikací' : 'C ukončení: server běží dál bez aplikace');
  }
  plast.kill('SIGKILL');
  // Text z pomocníka předává macOS v rozloženém tvaru Unicode (NFD) – porovnává se po normalizaci.
  const log = (await fs.readFile(denik, 'utf8').catch(() => '')).normalize('NFC');
  zapis(/nová verze spuštěna/.test(log), 'deník aktualizace zaznamenal úspěšné spuštění nové verze');
  // Pojistka je poslední záchrana. Běžné ukončení i aktualizace musí doběhnout bez ní.
  zapis(!/pojistkou/.test(log), log.includes('pojistkou') ? 'ukončení skončilo až pojistkou – běžná cesta se zasekla' : 'ukončení i aktualizace doběhly běžnou cestou, bez pojistky');
  await fs.writeFile(path.join(vystup, 'update.log'), log);
} finally {
  await ukonciVse();
  await fs.writeFile(path.join(vystup, 'vysledek.json'), JSON.stringify({ verze: version, kroky }, null, 2));
  await fs.rm(pracovni, { recursive: true, force: true }).catch(() => {});
}

const chyb = kroky.filter((k) => !k.ok).length;
if (chyb) console.log(`\nDeník aktualizace:\n${await fs.readFile(path.join(vystup, 'update.log'), 'utf8').catch(() => '(prázdný)')}`);
console.log(chyb ? `\nNEPROŠLO: ${chyb} z ${kroky.length}.` : `\nV pořádku: ${kroky.length} z ${kroky.length}.`);
process.exit(chyb ? 1 : 0);
