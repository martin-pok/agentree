import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

export const MIN = 60e3;
export const HOUR = 3600e3;
export const DAY = 86400e3;

export const hourKey = (ts) => new Date(ts).toISOString().slice(0, 13);
export const minuteKey = (ts) => Math.floor(ts / MIN);
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function clip(s, n = 180) {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '';
}

export function clipBlock(s, n = 2000) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\r/g, '').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function toTs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string' && v) {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Text z obsahu zprávy: řetězec nebo pole částí ({text} / {type:'text'}).
export function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((p) => (typeof p === 'string' ? p : typeof p?.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n');
}

// Systémový kontext vkládaný nástroji do "uživatelských" zpráv — není to zadání od člověka.
export function isInjectedPrompt(text) {
  return /^\s*(<|#|The following is|\[Request interrupted|Caveat:)/.test(text || '');
}

export function run(cmd, args, { timeout = 3000, input } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024, timeout }, (err, stdout, stderr) =>
        resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || ''), code: err?.code ?? 0 }),
      );
    } catch (err) {
      resolve({ ok: false, stdout: '', stderr: String(err.message), code: -1 });
      return;
    }
    if (input != null) child.stdin.end(input);
  });
}

// Inkrementální čtení JSONL: vrací jen nově připsané kompletní řádky.
export class JsonlTail {
  constructor(file) {
    this.file = file;
    this.offset = 0;
  }

  async read(size) {
    if (size < this.offset) this.offset = 0;
    if (size === this.offset) return [];
    const fh = await fs.open(this.file, 'r');
    try {
      const len = size - this.offset;
      const buf = Buffer.allocUnsafe(len);
      const { bytesRead } = await fh.read(buf, 0, len, this.offset);
      const view = buf.subarray(0, bytesRead);
      const last = view.lastIndexOf(10);
      if (last === -1) return [];
      this.offset += last + 1;
      const out = [];
      for (const line of view.toString('utf8', 0, last).split('\n')) {
        if (line.length < 2) continue;
        try { out.push(JSON.parse(line)); } catch { /* poškozený nebo rozepsaný řádek */ }
      }
      return out;
    } finally {
      await fh.close();
    }
  }
}

export async function statSafe(p) {
  try { return await fs.stat(p); } catch { return null; }
}

export async function readdirSafe(p) {
  try { return await fs.readdir(p, { withFileTypes: true }); } catch { return []; }
}

export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

export async function writeFileAtomic(file, content, mode) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, content, mode ? { mode } : undefined);
  await fs.rename(tmp, file);
}

export const writeJsonAtomic = (file, data, mode = 0o600) => writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`, mode);

export const randomToken = () => crypto.randomBytes(24).toString('hex');
export const uid = () => crypto.randomUUID();

export function debounce(fn, ms) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  wrapped.pending = () => timer !== null;
  return wrapped;
}

// Minutové značky aktivity → souvislé úseky (mezera do `gap` minut se slévá).
export function spansFromMinutes(minutes, now, windowMs = DAY, gap = 6) {
  const from = minuteKey(now - windowMs);
  const sorted = [...minutes].filter((m) => m >= from).sort((a, b) => a - b);
  const spans = [];
  for (const m of sorted) {
    const last = spans[spans.length - 1];
    if (last && m - last[1] <= gap) last[1] = m;
    else spans.push([m, m]);
  }
  return spans.map(([a, b]) => [a * MIN, (b + 1) * MIN]);
}

export const lastSegment = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';

export const shellQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

export const shortPath = (p, home) => (home && typeof p === 'string' && p.startsWith(home) ? `~${p.slice(home.length)}` : String(p || ''));
