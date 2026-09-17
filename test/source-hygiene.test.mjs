import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Zdrojový soubor se syrovým řídicím znakem (např. nulovým bajtem v regulárním výrazu) funguje,
// ale nástroje ho považují za binární: `grep` v něm potichu nic nenajde. Tak se při auditu
// spolehlivosti málem „ztratila“ celá logika stavu Claude Code. Řídicí znaky patří do kódu
// jen jako escape (\x00), nikdy doslova.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['src', 'public', 'extension', 'bin', 'scripts', 'test'];
const EXT = /\.(m?js|css|html|json|md)$/;

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXT.test(e.name)) yield p;
  }
}

test('žádný zdrojový soubor neobsahuje syrové řídicí znaky', async () => {
  const vadne = [];
  for (const d of DIRS) {
    for await (const file of walk(path.join(ROOT, d))) {
      const buf = await fs.readFile(file);
      for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f) {
          vadne.push(`${path.relative(ROOT, file)}:${buf.subarray(0, i).toString('latin1').split('\n').length}`);
          break;
        }
      }
    }
  }
  assert.deepEqual(vadne, [], `syrový řídicí znak v: ${vadne.join(', ')}`);
});
