import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Řádky filtrů na Agentech se nikdy vodorovně neposouvají ani nezvyšují (vlastník, 23. 10. 2026):
// co se nevejde, je v čipu „+N“ s nabídkou. Chování v prohlížeči ověřuje scripts/qa-desktop.mjs.
const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('řádky filtrů na Agentech se skládají do „+N“ místo posouvání', async () => {
  const agents = await zdroj('public/js/views/agents.js');
  for (const region of ['source', 'chips', 'projects']) {
    assert.match(agents, new RegExp(`chips--sklada" role="group" aria-labelledby="ag-f-[a-z]+" data-region="${region}"`), region);
    assert.match(agents, new RegExp(`skladejCipy\\(el\\.querySelector\\('\\[data-region="${region}"\\]'\\)\\)`), region);
  }
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.chips--rada\.chips--sklada \{ overflow: hidden;/);
  const js = await zdroj('public/js/chips-skladani.js');
  assert.match(js, /i === 0 \|\| c\.getAttribute\('aria-pressed'\) === 'true'/, 'první a vybraný čip zůstávají vidět');
  assert.match(js, /cil\?\.click\(\)/, 'položka nabídky použije skutečný čip (filtr, počty, přetažení)');
  assert.match(js, /new ResizeObserver/);
  const en = await zdroj('public/js/i18n/en.js');
  assert.match(en, /"Další \(\{0\}\)": "More \(\{0\}\)"/);
});

test('karty agentů ukazují službu logem a model po lidsku, ne slovem', async () => {
  const { modelPopis } = await import('../public/js/format.js');
  assert.equal(modelPopis('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(modelPopis('claude-3-5-sonnet-20241022'), 'Sonnet 3.5');
  assert.equal(modelPopis('gpt-5-codex'), 'GPT-5 Codex');
  assert.equal(modelPopis('gemini-2.5-pro'), 'Gemini 2.5 Pro');
  assert.equal(modelPopis('llama3:8b'), 'llama3:8b', 'neznámé zůstane, nic se nevymýšlí');
  const agents = await zdroj('public/js/views/agents.js');
  assert.match(agents, /<span class="cell-logo">\$\{glyph\(s\)\}<\/span><span class="sr-only">\$\{esc\(s\.app\)\}<\/span>/);
  const studio = await zdroj('public/js/home-studio.js');
  assert.match(studio, /cell-logo">\$\{glyph\(a\)\}/);
});
