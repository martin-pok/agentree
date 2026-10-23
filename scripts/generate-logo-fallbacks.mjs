// Druhá kopie oficiálních log pro případ, že WebView nedostane samostatný SVG soubor.
// Zdroj pravdy zůstává public/logos/*.svg. Po změně těchto souborů spusť tento skript.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public/logos');
const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.svg')).sort();
const entries = await Promise.all(names.map(async (name) =>
  `  ${JSON.stringify(name.slice(0, -4))}: ${JSON.stringify((await fs.readFile(path.join(dir, name), 'utf8')).trim())},`));
await fs.writeFile(path.join(root, 'public/js/logo-fallbacks.js'),
  `// Generováno ze souborů public/logos/*.svg skriptem scripts/generate-logo-fallbacks.mjs.\nexport const LOGO_FALLBACKS = Object.freeze({\n${entries.join('\n')}\n});\n`);
