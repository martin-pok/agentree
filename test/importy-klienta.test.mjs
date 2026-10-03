import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Klientské moduly se v Node spustit nedají (sahají na window a document), takže chybějící export
// neodhalí ani `npm run check`, ani ostatní testy – ukáže se až v prohlížeči jako prázdná aplikace.
// Tenhle test proto staticky ověří, že každý pojmenovaný import z public/js existuje v cílovém modulu.

const KOREN = fileURLToPath(new URL('../public/js/', import.meta.url));

async function soubory(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await soubory(p)));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function exporty(src) {
  const jmena = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/g)) jmena.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const cast of m[1].split(',')) {
      const jmeno = cast.trim().split(/\s+as\s+/).pop().trim();
      if (jmeno) jmena.add(jmeno);
    }
  }
  if (/export\s+default\b/.test(src)) jmena.add('default');
  return jmena;
}

test('každý pojmenovaný import v klientském kódu existuje v cílovém modulu', async () => {
  const vse = await soubory(KOREN);
  const zdroje = new Map(await Promise.all(vse.map(async (f) => [f, await fs.readFile(f, 'utf8')])));
  const chyby = [];
  let pocet = 0;
  for (const [f, src] of zdroje) {
    for (const m of src.matchAll(/import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"](\.[^'"]+)['"]/g)) {
      const cil = path.resolve(path.dirname(f), m[3]);
      const cilSrc = zdroje.get(cil);
      if (!cilSrc) { chyby.push(`${path.relative(KOREN, f)}: modul ${m[3]} neexistuje`); continue; }
      const nabizi = exporty(cilSrc);
      const chce = (m[2] || '').split(',').map((x) => x.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      if (m[1]) chce.push('default');
      for (const jmeno of chce) {
        pocet++;
        if (!nabizi.has(jmeno)) chyby.push(`${path.relative(KOREN, f)}: ${m[3]} neexportuje „${jmeno}“`);
      }
    }
  }
  assert.ok(pocet > 100, `zkontrolováno jen ${pocet} importů – rozbitý rozbor?`);
  assert.deepEqual(chyby, []);
});
