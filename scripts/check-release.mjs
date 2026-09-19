import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFile(path.join(root, file), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const version = pkg.version;
const tag = process.argv[2] || process.env.RELEASE_TAG || '';
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const changelog = await read('CHANGELOG.md');
const readme = await read('README.md');
const install = await read('docs/INSTALL.md');
const plist = await read('desktop/Info.plist');

if (!new RegExp(`^## \\[[^\\]]+\\] ${escape(version)}\\b|^## ${escape(version)}\\b`, 'm').test(changelog)) {
  throw new Error(`CHANGELOG.md nemá aktuální položku pro verzi ${version}.`);
}
if (!readme.includes(`v${version}`)) throw new Error(`README.md neuvádí aktuální verzi v${version}.`);
if (!install.includes('Agentree-<verze>-macOS-arm64.zip')) throw new Error('docs/INSTALL.md používá zastaralý název desktopového balíčku.');
if (!plist.includes('__VERSION__')) throw new Error('desktop/Info.plist musí používat placeholder __VERSION__.');
if (tag && tag !== `v${version}`) throw new Error(`Tag ${tag} neodpovídá package.json (${version}).`);

console.log(`✓ Release metadata jsou konzistentní pro v${version}.`);
