// Přibalí oficiální loga do UI, aby jejich první zobrazení nečekalo na síťové požadavky.
// Zdroj pravdy zůstává public/logos/*.svg. Po změně těchto souborů spusť tento skript.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public/logos');
const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.svg')).sort();
const entries = await Promise.all(names.map(async (name) =>
  `  ${JSON.stringify(name.slice(0, -4))}: ${JSON.stringify((await fs.readFile(path.join(dir, name), 'utf8')).trim())},`));
await fs.writeFile(path.join(root, 'public/js/logo-vectors.js'),
  `// Generováno ze souborů public/logos/*.svg skriptem scripts/generate-logo-vectors.mjs.\nexport const LOGO_VECTORS = Object.freeze({\n${entries.join('\n')}\n});\n`);
