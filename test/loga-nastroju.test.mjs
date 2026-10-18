import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { RUNTIMES } from '../src/connectors/processes.js';

// Každý rozpoznávaný nástroj ukazuje svoje skutečné logo (nebo logo autora), ne obecnou náhradní
// ikonu. Výjimky jsou nástroje, jejichž logo není v žádné z použitých sad (public/logos/README.md).
const BEZ_LOGA = new Set(['aider', 'crush', 'droid', 'auggie', 'dia']);

const objekt = (zdroj, jmeno) => {
  const m = zdroj.match(new RegExp(`const ${jmeno} = \\{([^\\n]*)\\};`));
  assert.ok(m, `${jmeno} v icons.js`);
  return Object.fromEntries([...m[1].matchAll(/'?([\w-]+)'?:\s*'([\w-]+)'/g)].map((x) => [x[1], x[2]]));
};

test('každý rozpoznávaný nástroj má logo a jeho soubor existuje', async () => {
  const icons = await readFile(new URL('../public/js/icons.js', import.meta.url), 'utf8');
  const runtime = objekt(icons, 'RUNTIME_LOGO');
  const provider = objekt(icons, 'PROVIDER_LOGO');
  const chybi = RUNTIMES
    .filter((r) => !BEZ_LOGA.has(r.id) && !runtime[r.id] && !provider[r.provider])
    .map((r) => r.id);
  assert.deepEqual(chybi, [], 'nástroje bez loga by dostaly náhradní ikonu');
  for (const klic of new Set([...Object.values(runtime), ...Object.values(provider)])) {
    await access(new URL(`../public/logos/${klic}.svg`, import.meta.url));
    assert.match(icons, new RegExp(`\\n  ${klic}: \\{ label:`), `${klic} v LOGOS`);
  }
});
