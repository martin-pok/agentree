import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// README tvrdilo „297 testů“, když jich bylo 395, a nabízelo ke stažení verzi 0.12.0, když byla
// aktuální 0.18.2. Dokumentace, která se rozejde s produktem, je horší než žádná: čtenář podle ní
// hledá soubor, co neexistuje. Tyhle testy drží čísla u reality – ne na kus přesně, ale v mezích,
// kdy je údaj ještě pravdivý.

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const verze = JSON.parse(await zdroj('package.json')).version;

test('verze v README odpovídá vydané verzi', async () => {
  const readme = await zdroj('README.md');
  assert.match(readme, new RegExp(`Stav: \\*\\*v${verze.replace(/\./g, '\\.')} `), 'README hlásí jinou verzi než package.json');
  assert.match(readme, new RegExp(`Agenteeq-${verze.replace(/\./g, '\\.')}-macOS-arm64\\.zip`), 'odkaz na balíček ke stažení ukazuje na jiný soubor');
});

test('počet testů v dokumentaci se neliší o víc než desetinu', async () => {
  const dir = fileURLToPath(new URL('../test/', import.meta.url));
  let skutecnost = 0;
  for (const f of await fs.readdir(dir)) {
    if (!f.endsWith('.test.mjs')) continue;
    // Počítají se i vnořené testy (`t.test(...)`), protože i ty runner vypíše jako samostatný test.
    skutecnost += (await fs.readFile(path.join(dir, f), 'utf8')).match(/^\s*(?:await )?(?:t\.)?test\(/gm)?.length || 0;
  }
  for (const [soubor, re] of [['README.md', /npm test\s+# (\d+) testů/], ['docs/TESTING.md', /\| `npm test` \| (\d+) testů/]]) {
    const uvedeno = Number((await zdroj(soubor)).match(re)?.[1]);
    assert.ok(uvedeno, `${soubor}: počet testů se nepodařilo najít`);
    const odchylka = Math.abs(uvedeno - skutecnost) / skutecnost;
    assert.ok(odchylka <= 0.1, `${soubor} uvádí ${uvedeno} testů, ve složce jich je ${skutecnost} (rozdíl ${Math.round(odchylka * 100)} %)`);
  }
});

test('changelog a „Co je nového“ znají vydanou verzi', async () => {
  assert.match(await zdroj('CHANGELOG.md'), new RegExp(`^## ${verze.replace(/\./g, '\\.')} – `, 'm'), 'CHANGELOG nemá záznam k této verzi');
  assert.match(await zdroj('public/js/whats-new-data.js'), new RegExp(`version: '${verze.replace(/\./g, '\\.')}'`), '„Co je nového“ nemá záznam k této verzi');
  assert.equal(JSON.parse(await zdroj('extension/manifest.json')).version, verze, 'rozšíření má jinou verzi než aplikace');
});
