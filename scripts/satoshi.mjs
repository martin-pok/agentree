// Písmo Satoshi (Indian Type Foundry, ITF Free Font License 2.0) se do repozitáře nedává.
//
// Licence dovoluje písmo vložit do vlastní aplikace a hostovat ho na vlastním webu, ale zakazuje ho
// šířit přes veřejný repozitář nebo veřejně přístupný server jako samotný soubor (§ 02). Repozitář
// Agenteeq je veřejný, proto se oficiální soubor stahuje až při sestavení (aplikace pro Mac
// a Windows, rozšíření, web) přímo z Fontshare a ověří podle otisku SHA-256. Soubor nesmí být
// upravený, převedený ani zmenšený (§ 02, § 05) – bere se beze změny tak, jak ho Fontshare vydává.
//
// Bez souboru (vývoj z čistého klonu, testy) se rozhraní sází záložním Onest a žádný požadavek na
// chybějící soubor nevznikne: pravidlo @font-face přidává server jen tehdy, když soubor existuje
// (src/verze-souboru.js#fontsCss).
//
// Použití: node scripts/satoshi.mjs [--povinne]  (--povinne = bez písma skončit chybou)
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SATOSHI_SLOZKA = path.join(ROOT, 'public', 'fonts', 'satoshi');
export const SATOSHI_SOUBOR = path.join(SATOSHI_SLOZKA, 'Satoshi-Variable.woff2');
const ZDROJ = 'https://api.fontshare.com/v2/fonts/download/satoshi';
const V_ARCHIVU = { font: 'Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Variable.woff2', licence: 'Satoshi_Complete/License/FFL.txt' };
// Oficiální soubor z Fontshare, ověřeno 8. 10. 2026 (ITF FFL 2.0 ze 17. 8. 2026).
export const SATOSHI_SHA256 = 'e739aff9b4d02c264341d6d4872edcda28e79373aeda936f659566a1cd3eb47f';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Soubory z archivu ZIP bez závislostí: centrální adresář → lokální hlavička → data (deflate/stored).
export function rozbalZip(zip, jmena) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Archiv písma není ZIP.');
  const pocet = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < pocet; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Poškozený adresář archivu písma.');
    const metoda = zip.readUInt16LE(p + 10);
    const velikost = zip.readUInt32LE(p + 20);
    const nJ = zip.readUInt16LE(p + 28), nX = zip.readUInt16LE(p + 30), nK = zip.readUInt16LE(p + 32);
    const lokalni = zip.readUInt32LE(p + 42);
    const jmeno = zip.subarray(p + 46, p + 46 + nJ).toString('utf8');
    if (jmena.includes(jmeno)) {
      const zacatek = lokalni + 30 + zip.readUInt16LE(lokalni + 26) + zip.readUInt16LE(lokalni + 28);
      const data = zip.subarray(zacatek, zacatek + velikost);
      out[jmeno] = metoda === 0 ? Buffer.from(data) : metoda === 8 ? zlib.inflateRawSync(data) : null;
    }
    p += 46 + nJ + nX + nK;
  }
  return out;
}

export async function satoshiPripraveno() {
  try { return sha256(await fs.readFile(SATOSHI_SOUBOR)) === SATOSHI_SHA256; } catch { return false; }
}

/** Zajistí oficiální soubor písma. Vrací true, když je na místě a sedí otisk. */
export async function zajistiSatoshi({ stahnout = fetch } = {}) {
  if (await satoshiPripraveno()) return true;
  const r = await stahnout(ZDROJ, { headers: { 'User-Agent': 'Agenteeq build' } });
  if (!r.ok) throw new Error(`Fontshare vrátil ${r.status}.`);
  const soubory = rozbalZip(Buffer.from(await r.arrayBuffer()), Object.values(V_ARCHIVU));
  const font = soubory[V_ARCHIVU.font];
  if (!font) throw new Error('V archivu Fontshare chybí Satoshi-Variable.woff2.');
  // Nový otisk = Fontshare vydal jinou verzi nebo jinou licenci. Nepoužije se, dokud ji člověk
  // neprověří a nezmění SATOSHI_SHA256.
  if (sha256(font) !== SATOSHI_SHA256) throw new Error(`Satoshi z Fontshare má jiný otisk (${sha256(font)}) – prověř licenci a uprav SATOSHI_SHA256.`);
  await fs.mkdir(SATOSHI_SLOZKA, { recursive: true });
  await fs.writeFile(SATOSHI_SOUBOR, font);
  if (soubory[V_ARCHIVU.licence]) await fs.writeFile(path.join(SATOSHI_SLOZKA, 'FFL.txt'), soubory[V_ARCHIVU.licence]);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const povinne = process.argv.includes('--povinne');
  try {
    await zajistiSatoshi();
    console.log('Satoshi: oficiální soubor z Fontshare je připravený.');
  } catch (err) {
    console.error(`Satoshi: ${err.message}`);
    if (povinne) process.exit(1);
    console.error('Satoshi: pokračuji se záložním písmem Onest.');
  }
}
