// Balíček rozšíření pro Chrome: dist/agenteeq-extension-<verze>.zip
//
// ZIP se skládá vlastní rutinou místo volání `zip` nebo `ditto`. Důvod je stejný jako u zbytku
// projektu — žádné závislosti a žádné překvapení podle toho, na čem se buildí: `ditto` přibaluje
// metadata macOS (__MACOSX), která Chrome Web Store nemá rád, a `zip` nemusí být nainstalovaný.
// Archiv je navíc deterministický (pevné datum), takže dvě sestavení téhož kódu dají tentýž soubor.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'extension');

// Do balíčku jdou jen soubory rozšíření. Licence písem zůstávají (OFL to vyžaduje),
// všechno ostatní, co by se ve složce mohlo objevit, se vynechá.
const SKIP = new Set(['.DS_Store', 'Thumbs.db']);

async function collect(dir, prefix = '') {
  const out = [];
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await collect(path.join(dir, entry.name), rel));
    else out.push({ rel, body: await fs.readFile(path.join(dir, entry.name)) });
  }
  return out;
}

// CRC-32 (ZIP ho vyžaduje u každé položky). Tabulka se počítá jednou.
const CRC_TABLE = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Pevné datum (1. 1. 2000) v MS-DOS formátu — archiv pak nezávisí na čase sestavení.
const DOS_TIME = 0;
const DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1;

export function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const { rel, body } of files) {
    const name = Buffer.from(rel, 'utf8');
    const deflated = zlib.deflateRawSync(body, { level: 9 });
    // Uložíme menší z obou variant: u už zkomprimovaných dat (PNG, TTF) bývá „deflate“ větší.
    const compress = deflated.length < body.length;
    const data = compress ? deflated : body;
    const crc = crc32(body);

    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4); // potřebná verze
    head.writeUInt16LE(0x0800, 6); // jména souborů v UTF-8
    head.writeUInt16LE(compress ? 8 : 0, 8);
    head.writeUInt16LE(DOS_TIME, 10);
    head.writeUInt16LE(DOS_DATE, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(body.length, 22);
    head.writeUInt16LE(name.length, 26);
    local.push(head, name, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); // verze, která archiv vytvořila
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(compress ? 8 : 0, 10);
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(body.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE((0o100644 << 16) >>> 0, 38); // práva: běžný soubor jen ke čtení pro ostatní
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += head.length + name.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, end]);
}

export async function buildExtension({ out = path.join(root, 'dist') } = {}) {
  const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
  const manifest = JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8'));
  if (manifest.version !== version) {
    throw new Error(`Verze rozšíření (${manifest.version}) nesouhlasí s verzí aplikace (${version}). Sjednoť extension/manifest.json.`);
  }
  const files = await collect(source);
  await fs.mkdir(out, { recursive: true });
  const file = path.join(out, `agenteeq-extension-${version}.zip`);
  await fs.writeFile(file, zip(files));
  return { file, version, files: files.length, bytes: (await fs.stat(file)).size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await buildExtension();
  console.log(`Rozšíření ${r.version}: ${r.files} souborů, ${(r.bytes / 1024).toFixed(0)} kB → ${path.relative(root, r.file)}`);
  console.log('Instalace ručně: chrome://extensions → Režim pro vývojáře → Načíst rozbalené → složka extension/');
}
