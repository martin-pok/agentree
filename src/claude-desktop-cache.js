import fs from 'node:fs/promises';
import path from 'node:path';
import v8 from 'node:v8';

// Read-only LevelDB/IndexedDB snapshot. Never opens LOCK, writes to Claude's database,
// or decodes unrelated IndexedDB stores. Within the persisted query snapshot the
// connector selects only remote-session metadata and the plan usage windows (two percentages,
// two reset times); account/profile queries never enter the Store.
// Formats: google/leveldb doc/{log,table}_format.md, google/snappy format_description.txt,
// Chromium indexed_db_leveldb_coding.cc and IDBValueUnwrapper.
const MAX = 64 * 1024 * 1024;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? (n >>> 1) ^ 0x82f63b78 : n >>> 1;
  return n >>> 0;
});
export function maskedCrc(b) {
  let crc = 0xffffffff;
  for (const n of b) crc = crcTable[(crc ^ n) & 255] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  return (((crc >>> 15) | (crc << 17)) + 0xa282ead8) >>> 0;
}
export function varint(b, at = 0) {
  let value = 0, mul = 1;
  for (let i = at; i < b.length && i < at + 8; i++) {
    const n = b[i];
    value += (n & 127) * mul;
    if (!Number.isSafeInteger(value)) throw Error('Invalid integer');
    if (n < 128) return [value, i + 1];
    mul *= 128;
  }
  throw Error('Incomplete integer');
}
export function unsnappy(b) {
  let [size, i] = varint(b);
  if (size > MAX) throw Error('Oversized block');
  const out = Buffer.alloc(size);
  let at = 0;
  while (i < b.length) {
    const tag = b[i++], kind = tag & 3;
    let length, offset;
    if (!kind) {
      length = tag >>> 2;
      if (length < 60) length++;
      else {
        const bytes = length - 59;
        if (i + bytes > b.length) throw Error('Incomplete literal');
        length = 0;
        for (let n = 0; n < bytes; n++) length += b[i++] * 2 ** (8 * n);
        length++;
      }
      if (i + length > b.length || at + length > size) throw Error('Invalid literal');
      b.copy(out, at, i, i + length);
      i += length;
    } else {
      const bytes = kind === 1 ? 1 : kind === 2 ? 2 : 4;
      if (i + bytes > b.length) throw Error('Incomplete copy');
      length = kind === 1 ? 4 + ((tag >>> 2) & 7) : 1 + (tag >>> 2);
      offset = kind === 1 ? ((tag & 224) << 3) | b[i] : b.readUIntLE(i, bytes);
      i += bytes;
      if (!offset || offset > at || at + length > size) throw Error('Invalid copy');
      for (let n = 0; n < length; n++) out[at + n] = out[at + n - offset];
    }
    at += length;
  }
  if (at !== size) throw Error('Incomplete block');
  return out;
}
export function logRecords(b) {
  const out = [];
  let parts = null;
  for (let i = 0; i + 7 <= b.length;) {
    const remaining = 32768 - i % 32768;
    if (remaining < 7) { i += remaining; continue; }
    const length = b.readUInt16LE(i + 4), type = b[i + 6];
    if (!length && !type) { i += remaining; continue; }
    if (length + 7 > remaining || i + length + 7 > b.length) break; // In-flight tail: retry next change.
    const payload = b.subarray(i + 7, i + 7 + length);
    if (maskedCrc(b.subarray(i + 6, i + 7 + length)) !== b.readUInt32LE(i)) throw Error('Invalid log checksum');
    i += 7 + length;
    if (type === 1) { parts = null; out.push(payload); }
    else if (type === 2) parts = [payload];
    else if (type === 3 && parts) parts.push(payload);
    else if (type === 4 && parts) { parts.push(payload); out.push(Buffer.concat(parts)); parts = null; }
    else throw Error('Invalid log fragment');
  }
  return out;
}
function blockEntries(b) {
  if (b.length < 8) throw Error('Incomplete table block');
  const end = b.length - 4 * (b.readUInt32LE(b.length - 4) + 1);
  if (end < 0) throw Error('Invalid restart array');
  const out = [];
  let i = 0, key = Buffer.alloc(0);
  while (i < end) {
    const [shared, a] = varint(b, i), [length, c] = varint(b, a), [size, d] = varint(b, c);
    if (shared > key.length || d + length + size > end) throw Error('Invalid table entry');
    key = Buffer.concat([key.subarray(0, shared), b.subarray(d, d + length)]);
    out.push({ key, value: b.subarray(d + length, d + length + size) });
    i = d + length + size;
  }
  return out;
}
export function tableEntries(b) {
  if (b.length < 48 || b.readBigUInt64LE(b.length - 8) !== 0xdb4775248b80fb57n) throw Error('Invalid table footer');
  const [, a] = varint(b, b.length - 48), [, c] = varint(b, a);
  const [offset, d] = varint(b, c), [size] = varint(b, d);
  function block(at, length) {
    if (at + length + 5 > b.length - 48) throw Error('Invalid block handle');
    const raw = b.subarray(at, at + length + 1);
    if (maskedCrc(raw) !== b.readUInt32LE(at + length + 1)) throw Error('Invalid table checksum');
    if (raw[length] === 0) return raw.subarray(0, length);
    if (raw[length] === 1) return unsnappy(raw.subarray(0, length));
    throw Error('Unknown compression');
  }
  return blockEntries(block(offset, size)).flatMap(({ value }) => {
    const [at, end] = varint(value), [length] = varint(value, end);
    return blockEntries(block(at, length));
  });
}
function manifestFiles(b) {
  const tables = new Set();
  let log = 0, previousLog = 0;
  for (const record of logRecords(b)) {
    let at = 0;
    const read = () => { const [n, end] = varint(record, at); at = end; return n; };
    const skip = () => { const length = read(); at += length; if (at > record.length) throw Error('Invalid manifest'); };
    while (at < record.length) {
      const tag = read();
      if (tag === 1) skip();
      else if (tag === 2) log = read();
      else if (tag === 3 || tag === 4) read();
      else if (tag === 5) { read(); skip(); }
      else if (tag === 6) { read(); tables.delete(read()); }
      else if (tag === 7) { read(); tables.add(read()); read(); skip(); skip(); }
      else if (tag === 9) previousLog = read();
      else throw Error('Unsupported manifest');
    }
  }
  return { tables, log, previousLog };
}
async function boundedRead(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX) throw Error('Invalid cache file');
  return fs.readFile(file);
}
export async function readLevelSnapshot(dir) {
  const current = (await boundedRead(path.join(dir, 'CURRENT'))).toString().trim();
  if (!/^MANIFEST-\d+$/.test(current)) throw Error('Invalid manifest name');
  const { tables, log, previousLog } = manifestFiles(await boundedRead(path.join(dir, current)));
  const names = await fs.readdir(dir);
  const records = new Map();
  function put(key, value, sequence, type) {
    const hex = key.toString('hex'), old = records.get(hex);
    if (!old || sequence > old.sequence) records.set(hex, { key, value, sequence, type });
  }
  for (const name of names) {
    const match = /^(\d+)\.(ldb|sst|log)$/.exec(name);
    if (!match) continue;
    const number = Number(match[1]);
    if (match[2] !== 'log') {
      if (!tables.has(number)) continue; // Do not resurrect obsolete compacted tables.
      for (const { key, value } of tableEntries(await boundedRead(path.join(dir, name)))) {
        if (key.length < 8) throw Error('Invalid internal key');
        const tag = key.readBigUInt64LE(key.length - 8);
        put(key.subarray(0, -8), value, tag >> 8n, Number(tag & 255n));
      }
    } else if (number >= log || number === previousLog) {
      for (const batch of logRecords(await boundedRead(path.join(dir, name)))) {
        if (batch.length < 12) throw Error('Invalid write batch');
        const sequence = batch.readBigUInt64LE(), count = batch.readUInt32LE(8);
        let at = 12;
        for (let n = 0; n < count; n++) {
          const type = batch[at++], [length, end] = varint(batch, at);
          if (end + length > batch.length || ![0, 1].includes(type)) throw Error('Invalid batch key');
          const key = batch.subarray(end, end + length);
          at = end + length;
          let value = Buffer.alloc(0);
          if (type) {
            const [size, j] = varint(batch, at);
            if (j + size > batch.length) throw Error('Invalid batch value');
            value = batch.subarray(j, j + size); at = j + size;
          }
          put(key, value, sequence + BigInt(n), type);
        }
        if (at !== batch.length) throw Error('Invalid batch length');
      }
    }
  }
  return [...records.values()].filter((x) => x.type === 1);
}
export function indexedKey(key) {
  if (!key.length) return null;
  const sizes = [(key[0] >>> 5) + 1, ((key[0] >>> 2) & 7) + 1, (key[0] & 3) + 1];
  let at = 1;
  const ids = sizes.map((size) => {
    if (size > 6 || at + size > key.length) throw Error('Invalid key prefix');
    const id = key.readUIntLE(at, size); at += size; return id;
  });
  if (!ids[0] || !ids[1] || ids[2] !== 1 || at + 2 > key.length || key[at++] !== 1) return null; // Only exact string keys.
  const [length, end] = varint(key, at);
  if (end + 2 * length !== key.length) return null;
  return { database: ids[0], store: ids[1], index: ids[2], name: Buffer.from(key.subarray(end)).swap16().toString('utf16le'), prefixSize: at - 1 };
}
export function decodeClone(raw) {
  if (raw[0] === 255 && raw[1] === 17 && raw[2] === 2) raw = unsnappy(raw.subarray(3));
  // Blink envelope v21, optional trailer-offset tag. Only the observed plain-data V8
  // v15/v16 wire formats are accepted. v16 differs for resizable buffers, absent from
  // these JSON-shaped cache entries; Node's reader is v15. Never accept newer versions.
  if (raw[0] !== 255 || raw[1] !== 21) throw Error('Unknown Blink version');
  const at = raw[2] === 254 ? 15 : 2;
  if (raw[at] !== 255 || ![15, 16].includes(raw[at + 1])) throw Error('Unknown V8 version');
  const data = Buffer.from(raw.subarray(at));
  data[1] = 15;
  return v8.deserialize(data);
}
export async function readClaudeDesktopCache(dir) {
  const entries = await readLevelSnapshot(dir);
  const byKey = new Map(entries.map((x) => [x.key.toString('hex'), x.value]));
  const blobs = dir.replace(/\.leveldb$/, '.blob');
  const selected = [];
  for (const { key, value } of entries) {
    const meta = indexedKey(key);
    if (!meta || meta.index !== 1 || !(meta.name === 'react-query-cache' || /^code:cse_[A-Za-z0-9]+$/.test(meta.name))) continue;
    const [, at] = varint(value);
    let raw = value.subarray(at);
    if (raw[0] === 255 && raw[1] === 17 && raw[2] === 1) {
      const blobKey = Buffer.from(key);
      blobKey[meta.prefixSize - 1] = 3; // blob-entry index, same database/store/string key.
      const external = byKey.get(blobKey.toString('hex'));
      if (!external || external[0] !== 0) throw Error('Missing external blob');
      const [number] = varint(external, 1), hex = number.toString(16);
      raw = await boundedRead(path.join(blobs, String(meta.database), Math.floor(number / 256).toString(16).padStart(2, '0'), hex));
    }
    selected.push({ key: meta.name, value: decodeClone(raw) });
  }
  return selected;
}
