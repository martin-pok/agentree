import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchTargets } from '../src/launcher.js';
import { ovladani } from '../public/js/views/skills.js';

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

// Prázdná obrazovka je první, co uživatel po instalaci uvidí. Tyhle testy hlídají, že mu
// Agenteeq v tu chvíli neukáže ovládání, které nemá co ovládat, ani čísla, která nemá odkud vzít.

test('Dovednosti: ovládání se ukáže jen tam, kde má co ovládat', () => {
  const prazdno = ovladani({ pocet: 0, zdroju: 0, puvodu: 0 });
  assert.deepEqual(prazdno, { hledani: false, zdroje: false, razeni: false, puvod: false },
    'nad prázdným seznamem nemá smysl hledat, řadit ani filtrovat');

  // Jeden zdroj znamená, že „Vše" i ten zdroj vrátí tentýž seznam – přepínač mezi nimi je past.
  const jedinyZdroj = ovladani({ pocet: 4, zdroju: 1, puvodu: 1 });
  assert.equal(jedinyZdroj.zdroje, false);
  assert.equal(jedinyZdroj.puvod, false);
  assert.equal(jedinyZdroj.hledani, true, 'hledat se dá i mezi dovednostmi z jednoho zdroje');
  assert.equal(jedinyZdroj.razeni, true);

  assert.equal(ovladani({ pocet: 1, zdroju: 1, puvodu: 1 }).razeni, false, 'jednu položku není podle čeho seřadit');
  assert.deepEqual(ovladani({ pocet: 9, zdroju: 3, puvodu: 2 }),
    { hledani: true, zdroje: true, razeni: true, puvod: true });
});

// Karta „Spustit agenta" nemá pod zadáním vysvětlivky (rozhodnutí vlastníka produktu: žádné
// uklidňující a vysvětlující texty). Ollama bez staženého modelu nemá čím odpovědět, a tak se
// vůbec nenabízí – jinak by uživatel vybral cíl, který jen vrátí chybu.
test('spuštění agenta: cíle bez vysvětlivek a Ollama jen se staženým modelem', async () => {
  const kod = await zdroj('public/js/launcher-ui.js');
  assert.doesNotMatch(kod, /MODE_HINT|launch-note/);
  const env = {
    bins: { claude: '/opt/bin/claude', codex: '/opt/bin/codex', gemini: '/opt/bin/gemini', qwen: '/opt/bin/qwen' },
    chatgptApp: true,
    claudeApp: true,
    ollama: { ok: true, models: [{ name: 'llama3.2:3b' }] },
  };
  const cile = launchTargets(env);
  assert.ok(cile.some((t) => t.id === 'ollama'));
  for (const t of cile) assert.equal(t.note, undefined, t.id);
  const bezModelu = launchTargets({ ...env, ollama: { ok: true, models: [] } });
  assert.ok(!bezModelu.some((t) => t.id === 'ollama'), 'Ollama bez modelu se nenabízí');
});

// Osa grafu je tvrzení o řádu čísel. Nad prázdnými daty by `niceMax` vrátil 4 a graf by
// nakreslil stupnici „4 Kč, 3 Kč, 2 Kč…" nad prázdnou plochou – vymyšlené měřítko místo dat.
test('Útrata: graf za posledních 6 měsíců bez dat nekreslí vymyšlenou osu', async () => {
  const kod = await zdroj('public/js/views/spend.js');
  assert.match(kod, /const jeCoUkazat = sp\.months\.some\(\(m\) => m\.total > 0\) \|\| total > 0;/,
    'rozhodnutí „je co ukázat" musí zůstat vázané na skutečná data');
  const usek = kod.slice(kod.indexOf('const jeCoUkazat'), kod.indexOf("fill(el, 'mlegend'"));
  assert.match(usek, /jeCoUkazat \? columnChart\(\{/, 'graf se kreslí jen když jsou data');
  assert.match(usek, /: emptyState\(\{ title: tr\('Zatím žádné ověřené náklady'\)/, 'jinak prázdný stav');
});
