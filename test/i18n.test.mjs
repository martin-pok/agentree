import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EN from '../public/js/i18n/en.js';
import { execFileSync } from 'node:child_process';

// Angličtina rozhraní (public/js/i18n.js). Zdrojem textů je čeština v kódu v tr('…'); slovník
// public/js/i18n/en.js k ní drží překlad. Chybějící překlad by se v angličtině ukázal česky,
// proto tenhle test hlídá úplnost, proměnné, značky a to, že slovník nenese staré texty.

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('i18n: serverové akce se přeloží při vykreslení a cizí popisky zůstanou escapované', () => {
  const script = `
    globalThis.document = { documentElement: { lang: 'en' } };
    const { openButtons } = await import('./public/js/ui.js');
    const labels = ['Otevřít v Codexu', 'Otevřít Claude', 'Otevřít v Cursoru', 'Otevřít ve VS Code', 'Otevřít konverzaci', 'Pokračovat v Terminálu', 'Otevřít složku', 'Přepnout do LM Studio', 'constructor', undefined, '<img src=x onerror=alert(1)>'];
    console.log(openButtons({ id: 'fixture', open: labels.map(label => ({ id: 'terminal', label })) }, { max: labels.length }));
  `;
  const html = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' });
  for (const label of ['Open in Codex', 'Open Claude', 'Open in Cursor', 'Open in VS Code', 'Open conversation', 'Continue in Terminal', 'Open folder', 'Switch to LM Studio']) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Pokračovat|Otevřít|Přepnout|<img src=x/);
  assert.match(html, />constructor<\/button>/);
  assert.doesNotMatch(html, /function Object|undefined/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

async function soubory(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await soubory(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const retezec = (zapis) => JSON.parse(`"${zapis.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);

async function vyuziti() {
  const klice = new Map();
  const mnozne = new Map();
  for (const f of await soubory(path.join(ROOT, 'public/js'))) {
    if (f.includes(`${path.sep}i18n${path.sep}`)) continue;
    const s = await fs.readFile(f, 'utf8');
    const rel = path.relative(ROOT, f);
    for (const m of s.matchAll(/\btr\('((?:[^'\\]|\\.)*)'/g)) klice.set(retezec(m[1]), rel);
    // První argument (počet) může být libovolně složitý výraz se závorkami uvnitř
    // (`new Set(...).size`) – nezávorkuje se, jen se hledají tři textové tvary až k uzavírací závorce.
    for (const m of s.matchAll(/\bplural\([\s\S]*?,\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'\s*\)/g)) mnozne.set(`${m[1]}|${m[2]}|${m[3]}`, rel);
  }
  return { klice, mnozne };
}

const promenne = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
const znacky = (s) => [...s.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/g)].map((m) => m[0].replace(/\s+/g, ' ')).sort().join('|');

test('i18n: každý text rozhraní má anglický překlad', async () => {
  const { klice } = await vyuziti();
  assert.ok(klice.size > 1000, `čekali jsme přes tisíc textů, našli jsme ${klice.size}`);
  const chybi = [...klice].filter(([k]) => !(k in EN.texty)).map(([k, f]) => `${f}: ${k.slice(0, 80)}`);
  assert.deepEqual(chybi, [], 'texty bez překladu v public/js/i18n/en.js');
});

test('i18n: každý tvar podle počtu má anglické tvary', async () => {
  const { mnozne } = await vyuziti();
  const chybi = [...mnozne].filter(([k]) => !Array.isArray(EN.mnozne[k]) || EN.mnozne[k].length !== 2).map(([k, f]) => `${f}: ${k}`);
  assert.deepEqual(chybi, []);
});

test('i18n: překlad nese stejné proměnné a značky jako čeština', () => {
  const vadne = [];
  for (const [cz, en] of Object.entries(EN.texty)) {
    if (promenne(cz) !== promenne(en)) vadne.push(`proměnné: ${cz.slice(0, 60)}`);
    if (znacky(cz) !== znacky(en)) vadne.push(`značky: ${cz.slice(0, 60)}`);
    if (!en.trim()) vadne.push(`prázdný překlad: ${cz.slice(0, 60)}`);
  }
  assert.deepEqual(vadne, []);
});

test('i18n: v angličtině nezůstala čeština a slovník nenese staré texty', async () => {
  const { klice, mnozne } = await vyuziti();
  const cesky = Object.entries(EN.texty).filter(([, en]) => CZ.test(en)).map(([cz]) => cz.slice(0, 60));
  assert.deepEqual(cesky, [], 'anglický překlad obsahuje češtinu');
  for (const tvary of Object.values(EN.mnozne)) for (const t of tvary) assert.doesNotMatch(t, CZ);
  const stare = Object.keys(EN.texty).filter((k) => !klice.has(k)).map((k) => k.slice(0, 60));
  assert.deepEqual(stare, [], 'slovník drží texty, které už v kódu nejsou');
  assert.deepEqual(Object.keys(EN.mnozne).filter((k) => !mnozne.has(k)), []);
});
