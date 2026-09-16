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

// Nápověda k režimu a poznámka cíle se v rozhraní skládají za sebe do jednoho odstavce.
// Když obojí popisovalo totéž, četl uživatel dvakrát tutéž informaci jinými slovy –
// u webových služeb dokonce s rozporem („v prohlížeči" vs. „otevře aplikaci").
test('spuštění agenta: nápověda režimu a poznámka cíle si neříkají totéž', async () => {
  const kod = await zdroj('public/js/launcher-ui.js');
  const blok = kod.match(/const MODE_HINT = \{([\s\S]*?)\n\};/)?.[1];
  assert.ok(blok, 'MODE_HINT se v launcher-ui.js nenašel – uprav test spolu s ním');
  const hint = Object.fromEntries([...blok.matchAll(/(\w+):\s*'([^']*)'/g)].map((m) => [m[1], m[2]]));
  assert.ok(Object.keys(hint).length >= 5, `čekali jsme nápovědu ke všem režimům, máme ${Object.keys(hint).length}`);

  const env = {
    bins: { claude: '/opt/bin/claude', codex: '/opt/bin/codex', gemini: '/opt/bin/gemini', qwen: '/opt/bin/qwen' },
    chatgptApp: true,
    claudeApp: true,
    ollama: { ok: true, models: [{ name: 'llama3.2:3b' }] },
  };
  const fraze = [/ve schránce/gi, /⌘V/g, /prohlížeč/gi, /na tvém Macu/gi, /zdarma/gi, /Otevře/g];
  for (const t of launchTargets(env)) {
    for (const mode of t.modes) {
      assert.ok(hint[mode], `režim ${mode} nemá nápovědu`);
      const veta = `${hint[mode]} ${t.note || ''}`;
      for (const f of fraze) {
        const kolik = (veta.match(f) || []).length;
        assert.ok(kolik <= 1, `${t.id}/${mode} opakuje ${f}: „${veta}"`);
      }
    }
  }
  // Ollama bez staženého modelu má jinou poznámku – projít musí i ta.
  const bezModelu = launchTargets({ ...env, ollama: { ok: true, models: [] } }).find((t) => t.id === 'ollama');
  assert.ok(!/na tvém Macu.*na tvém Macu/s.test(`${hint.local} ${bezModelu.note}`));
});

// Osa grafu je tvrzení o řádu čísel. Nad prázdnými daty by `niceMax` vrátil 4 a graf by
// nakreslil stupnici „4 Kč, 3 Kč, 2 Kč…" nad prázdnou plochou – vymyšlené měřítko místo dat.
test('Útrata: graf za posledních 6 měsíců bez dat nekreslí vymyšlenou osu', async () => {
  const kod = await zdroj('public/js/views/spend.js');
  assert.match(kod, /const jeCoUkazat = sp\.months\.some\(\(m\) => m\.total > 0\) \|\| total > 0;/,
    'rozhodnutí „je co ukázat" musí zůstat vázané na skutečná data');
  const usek = kod.slice(kod.indexOf('const jeCoUkazat'), kod.indexOf("fill(el, 'mlegend'"));
  assert.match(usek, /jeCoUkazat \? columnChart\(\{/, 'graf se kreslí jen když jsou data');
  assert.match(usek, /: emptyState\(\{ title: 'Zatím žádná útrata'/, 'jinak prázdný stav');
});
