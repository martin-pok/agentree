// Syntaktická kontrola všech JS souborů projektu (bez závislostí).
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['bin', 'src', 'public/js', 'extension', 'scripts', 'test'];
const files = [];

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(m?js)$/.test(name)) files.push(full);
  }
}
for (const d of dirs) walk(path.join(root, d));

let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    console.error(`✗ ${path.relative(root, f)}\n${r.stderr}`);
  }
}
console.log(failed ? `${failed} z ${files.length} souborů má chybu.` : `✓ ${files.length} souborů bez syntaktické chyby.`);
process.exit(failed ? 1 : 0);
