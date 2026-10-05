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
  assert.deepEqual(prazdno, { hledani: false, zdroje: false, popis: false, razeni: false, puvod: false },
    'nad prázdným seznamem nemá smysl hledat, řadit ani filtrovat');

  // Jeden zdroj znamená, že „Vše" i ten zdroj vrátí tentýž seznam – přepínač mezi nimi je past.
  const jedinyZdroj = ovladani({ pocet: 4, zdroju: 1, puvodu: 1 });
  assert.equal(jedinyZdroj.zdroje, false);
  assert.equal(jedinyZdroj.puvod, false);
  assert.equal(jedinyZdroj.hledani, true, 'hledat se dá i mezi dovednostmi z jednoho zdroje');
  assert.equal(jedinyZdroj.razeni, true);

  assert.equal(ovladani({ pocet: 1, zdroju: 1, puvodu: 1 }).razeni, false, 'jednu položku není podle čeho seřadit');
  assert.deepEqual(ovladani({ pocet: 9, zdroju: 3, puvodu: 2 }),
    { hledani: true, zdroje: true, popis: true, razeni: true, puvod: true });
});

// Pod zadáním stojí jen poznámka cíle, a to jen tam, kde říká něco, co jinde není (schránka,
// chybějící model). Obecná nápověda režimu („Otevře aplikaci…“, „Běží na tvých předplatných…“)
// opakovala to, co už říká přepínač režimu, a uživatel ji četl u každého spuštění znovu.
test('spuštění agenta: žádná obecná nápověda režimu, poznámka cíle se neopakuje', async () => {
  const kod = await zdroj('public/js/launcher-ui.js');
  assert.doesNotMatch(kod, /MODE_HINT/, 'nápověda režimu se vrátila do launcher-ui.js');
  assert.match(kod, /fill\(root, 'note', esc\(t\.note \|\| ''\)\)/, 'pod zadáním smí stát jen poznámka cíle');

  const env = {
    bins: { claude: '/opt/bin/claude', codex: '/opt/bin/codex', gemini: '/opt/bin/gemini', qwen: '/opt/bin/qwen' },
    chatgptApp: true,
    claudeApp: true,
    ollama: { ok: true, models: [{ name: 'llama3.2:3b' }] },
  };
  const fraze = [/ve schránce/gi, /⌘V/g, /prohlížeč/gi, /na tvém Macu/gi, /zdarma/gi, /předplatn/gi];
  const cile = [...launchTargets(env), ...launchTargets({ ...env, ollama: { ok: true, models: [] } })];
  for (const t of cile) {
    for (const f of fraze) {
      const kolik = (t.note || '').match(f)?.length || 0;
      assert.ok(kolik <= 1, `${t.id} opakuje ${f}: „${t.note}"`);
    }
    assert.doesNotMatch(t.note || '', /předplatn/i, `${t.id}: poznámka nemá ujišťovat o předplatném`);
  }
  const bezModelu = cile.filter((t) => t.id === 'ollama').at(-1);
  assert.match(bezModelu.note, /model/, 'Ollama bez modelu musí říct, co chybí');
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
