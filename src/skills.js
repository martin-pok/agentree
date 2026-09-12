import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { readdirSafe, statSafe, clip } from './util.js';

// Dovednosti = soubory SKILL.md, které si na disk ukládají Claude, jeho pluginy a Codex.
// Čteme je jen lokálně a jen na vyžádání; nic se nikam neodesílá.
const FILE_NAME = 'SKILL.md';
const MAX_SKILLS = 400;
const MAX_BYTES = 512 * 1024;

export const SOURCES = [
  { id: 'claude', label: 'Claude', rel: ['.claude', 'skills'], depth: 2 },
  { id: 'claude-plugin', label: 'Claude · plugin', rel: ['.claude', 'plugins'], depth: 7 },
  { id: 'claude-task', label: 'Claude · plánovaná úloha', rel: ['.claude', 'scheduled-tasks'], depth: 2 },
  { id: 'codex', label: 'Codex', rel: ['.codex', 'skills'], depth: 3 },
  { id: 'codex-memory', label: 'Codex · paměť', rel: ['.codex', 'memories', 'skills'], depth: 2 },
];

// Hlavička souboru je YAML mezi dvěma řádky `---`. Bereme jen `name` a `description`,
// nic dalšího neodhadujeme — když hlavička chybí, název vezmeme z názvu složky.
export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text || '');
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    if (key !== 'name' && key !== 'description') continue;
    out[key] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const idOf = (file) => crypto.createHash('sha1').update(file).digest('hex').slice(0, 12);

async function findSkillFiles(root, depth) {
  const out = [];
  async function walk(dir, level) {
    if (out.length >= MAX_SKILLS) return;
    for (const e of await readdirSafe(dir)) {
      if (out.length >= MAX_SKILLS) return;
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name === FILE_NAME) out.push(full);
      else if (e.isDirectory() && level < depth && !e.name.startsWith('node_modules')) await walk(full, level + 1);
    }
  }
  await walk(root, 0);
  return out;
}

export function createSkills({ config }) {
  // Cesta se skládá ze `config.sourceHome`, aby testy běžely nad dočasným HOME a ne nad skutečným.
  const rootOf = (src) => path.join(config.sourceHome, ...src.rel);

  async function list() {
    const seen = new Set();
    const items = [];
    for (const src of SOURCES) {
      const root = rootOf(src);
      if (!(await statSafe(root))) continue;
      for (const file of await findSkillFiles(root, src.depth)) {
        if (seen.has(file)) continue;
        seen.add(file);
        const stat = await statSafe(file);
        if (!stat?.isFile()) continue;
        let head = '';
        try {
          const fh = await fs.open(file, 'r');
          try {
            const buf = Buffer.alloc(Math.min(4096, stat.size));
            await fh.read(buf, 0, buf.length, 0);
            head = buf.toString('utf8');
          } finally {
            await fh.close();
          }
        } catch {
          continue;
        }
        const fm = parseFrontMatter(head);
        items.push({
          id: idOf(file),
          name: clip(fm.name || path.basename(path.dirname(file)), 80),
          description: clip(fm.description || '', 240),
          source: src.label,
          sourceId: src.id,
          dir: path.dirname(file),
          bytes: stat.size,
          at: Math.round(stat.mtimeMs),
        });
      }
    }
    return items.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  }

  // Obsah se hledá podle id v čerstvě projitém seznamu — cesta nikdy nepřichází z požadavku,
  // takže se přes tenhle endpoint nedá přečíst libovolný soubor na disku.
  async function read(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{12}$/.test(id)) return null;
    const items = await list();
    const hit = items.find((s) => s.id === id);
    if (!hit) return null;
    const file = path.join(hit.dir, FILE_NAME);
    const stat = await statSafe(file);
    if (!stat?.isFile() || stat.size > MAX_BYTES) return null;
    return { ...hit, file, text: await fs.readFile(file, 'utf8') };
  }

  return { list, read, rootOf };
}
