import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { readdirSafe, statSafe, clip } from './util.js';
import { ui } from './texty.js';

// Dovednosti = soubory SKILL.md, které si na disk ukládají Claude, jeho pluginy a Codex.
// Čteme je jen lokálně a jen na vyžádání; nic se nikam neodesílá.
const FILE_NAME = 'SKILL.md';
const MAX_BYTES = 512 * 1024;

export const SOURCES = [
  { id: 'shared', label: ui('Sdílené'), rel: ['.agents', 'skills'], depth: 2 },
  { id: 'user-skills', label: 'Skills', rel: ['skills'], depth: 2 },
  { id: 'claude', label: 'Claude', tool: 'claude', rel: ['skills'], depth: 2 },
  { id: 'claude-plugin', label: 'Claude · plugin', tool: 'claude', rel: ['plugins'], depth: 7 },
  { id: 'claude-task', label: ui('Claude · plánovaná úloha'), tool: 'claude', rel: ['scheduled-tasks'], depth: 2 },
  { id: 'codex', label: 'Codex', tool: 'codex', rel: ['skills'], depth: 3 },
  { id: 'codex-memory', label: ui('Codex · paměť'), tool: 'codex', rel: ['memories', 'skills'], depth: 2 },
];

// Hlavička souboru je YAML mezi dvěma řádky `---`. Bereme jen `name` a `description`,
// nic dalšího neodhadujeme – když hlavička chybí, název vezmeme z názvu složky.
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

// Odkud dovednost pochází. Zdroj (`source`) říká, který nástroj ji čte; původ říká, kdo ji napsal –
// a to je to, co uživatel hledá, když má mezi 147 dovednostmi najít ty svoje dvě.
// Rozlišuje se podle cesty, protože v souboru samotném o původu nic není.
export const ORIGINS = {
  anthropic: 'Od Anthropicu',
  openai: 'Od OpenAI',
  plugin: 'Z pluginu',
  own: 'Moje',
};

export function originOf(dir) {
  // Původ se pozná ze struktury cesty, a ta se na Windows píše zpětným lomítkem.
  // Kdyby se porovnávalo jen s „/“, na Windows by se každá dovednost z pluginu
  // označila za vlastní – tedy tiše špatně, což je horší než nepoznat ji vůbec.
  const d = String(dir || '').replace(/\\/g, '/');
  if (/\/plugins\/(marketplaces|cache)\/claude-plugins-official\//.test(d)) return 'anthropic';
  if (/\/\.codex\/skills\/\.system\//.test(d)) return 'openai';
  if (/\/plugins\/(marketplaces|cache)\//.test(d)) return 'plugin';
  return 'own';
}

const idOf = (file) => crypto.createHash('sha1').update(file).digest('hex').slice(0, 12);

async function findSkillFiles(root, depth) {
  const out = [];
  const visited = new Set();
  async function walk(dir, level) {
    // Symlinkované skills jsou běžné (například jedna sdílená složka napojená do Claude i Codexu).
    // Realpath zároveň zabrání smyčkám a duplicitnímu procházení téže složky.
    let realDir;
    try { realDir = await fs.realpath(dir); } catch { return; }
    if (visited.has(realDir)) return;
    visited.add(realDir);
    for (const e of await readdirSafe(dir)) {
      const full = path.join(dir, e.name);
      if (e.name === FILE_NAME && (e.isFile() || e.isSymbolicLink()) && (await statSafe(full))?.isFile()) out.push(full);
      else if ((e.isDirectory() || e.isSymbolicLink()) && level < depth && !e.name.startsWith('node_modules') && (await statSafe(full))?.isDirectory()) await walk(full, level + 1);
    }
  }
  await walk(root, 0);
  return out;
}

export function createSkills({ config }) {
  // Testovací sourceHome izoluje všechny zdroje. V běžném provozu respektujeme i vlastní
  // umístění Claude/Codex, které jejich CLI dovolují přes CLAUDE_CONFIG_DIR a CODEX_HOME.
  const rootOf = (src) => {
    const toolHome = src.tool === 'claude' ? config.claudeConfigDir : src.tool === 'codex' ? config.codexHome : '';
    const base = toolHome || (src.tool ? path.join(config.sourceHome, src.tool === 'claude' ? '.claude' : '.codex') : config.sourceHome);
    return path.join(base, ...src.rel);
  };

  async function list() {
    const seen = new Set();
    const items = [];
    for (const src of SOURCES) {
      const root = rootOf(src);
      if (!(await statSafe(root))) continue;
      for (const file of await findSkillFiles(root, src.depth)) {
        let canonical;
        try { canonical = await fs.realpath(file); } catch { continue; }
        if (seen.has(canonical)) continue;
        seen.add(canonical);
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
          origin: originOf(path.dirname(file)),
          dir: path.dirname(file),
          bytes: stat.size,
          at: Math.round(stat.mtimeMs),
        });
      }
    }
    return items.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  }

  // Obsah se hledá podle id v čerstvě projitém seznamu – cesta nikdy nepřichází z požadavku,
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
