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
