// Řazení seznamu agentů (vlastník 15. 11. 2026: „ať si to mohu lépe seřadit, třeba od nejnovějších“).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('agenti: výběr řazení vedle stavů, šest voleb, volba se pamatuje a mění pořadí', async () => {
  const js = await zdroj('public/js/views/agents.js');
  for (const k of ['stav', 'nejnovejsi', 'nejstarsi', 'zalozeno', 'tokeny', 'nazev']) assert.match(js, new RegExp(`\\n  ${k}: \\[\\(\\) => tr\\(`), k);
  assert.match(js, /<label class="select razeni"><span class="sr-only">\$\{tr\('Seřadit agenty'\)\}<\/span><select data-razeni>/, 'nativní select s popiskem (vlastní vzhled dodá selects.js)');
  assert.match(js, /localStorage\.setItem\(RAZENI_KLIC, f\.razeni\)/, 'volba se pamatuje');
  assert.match(js, /\.sort\(RAZENI\[f\.razeni\]\?\.\[1\] \|\| compareAgentsForList\)/);
  assert.match(js, /JSON\.stringify\(\[f\.status, f\.source, \[\.\.\.f\.providers\], f\.q, f\.project, f\.razeni\]\)/, 'změna řazení seznam přeřadí hned');
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.toolbar--filtry:has\(\.razeni\) \{ flex-wrap: nowrap; \}/, 'na desktopu ve stejné řadě jako stavy');
  assert.match(css, /\.toolbar--filtry \.razeni \.picker-trigger \{ min-height: 44px;/, 'stejná výška jako řada stavů');
});
