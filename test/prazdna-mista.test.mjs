import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Prázdná místa v rozhraní (B46): karta s nadpisem a jen „Bez dat.“, prázdný pruh obálky projektu
// bez obrázku a dvě tlačítka zpět vedle sebe. Prohlížeč ověřil vykreslení; tady se hlídá, aby se
// to nevrátilo.
const zdroj = (f) => fs.readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('Statistiky: karta rozpadu tokenů bez řádků se schová celá, žádné „Bez dat.“', async () => {
  const js = await zdroj('public/js/views/stats.js');
  assert.doesNotMatch(js, /tr\('Bez dat\.'\)/);
  assert.match(js, /function kartaRozpadu\(el, region, html\) \{\n\s+const karta = el\.querySelector\(`\[data-region="\$\{region\}"\]`\)\.closest\('section'\);\n\s+karta\.hidden = !html;/);
  for (const r of ['apps', 'projects', 'models']) {
    assert.equal((js.match(new RegExp(`kartaRozpadu\\(el, '${r}'`, 'g')) || []).length, 2, `${r}: krátká i dlouhá období`);
    assert.doesNotMatch(js, new RegExp(`zivy\\(el, '${r}'`), `${r} se plní jen přes kartaRozpadu`);
  }
});

test('Projekty: karta bez nahraného obrázku obálku nevykreslí', async () => {
  const js = await zdroj('public/js/views/projects.js');
  assert.match(js, /const obalka = Boolean\(p\.cover\?\.file\);/);
  assert.match(js, /\$\{obalka \? '' : ' pcard--bez-obalky'\}/);
  assert.match(js, /\$\{obalka \? projectCover\(p\) : ''\}/);
  const css = await zdroj('public/workbench.css');
  assert.match(css, /\.pcard--bez-obalky \{ padding-top: 22px; \}/);
  assert.match(css, /\.pcard--bez-obalky \.pcard-top\.has-logo \{ margin-top: 0; align-items: center; \}/);
});

test('Detail agenta a projektu: jedno zpět – odkaz v obsahu se schová, když je zpět v hlavičce', async () => {
  const app = await zdroj('public/js/app.js');
  assert.match(app, /backEl\.hidden = !predchozi;\n[\s\S]{0,300}document\.documentElement\.toggleAttribute\('data-zpet-v-hlavicce', Boolean\(predchozi\)\);/);
  const css = await zdroj('public/styles.css');
  assert.match(css, /\[data-zpet-v-hlavicce\] \.view \.back \{ display: none; \}/);
  for (const f of ['public/js/views/session.js', 'public/js/views/project.js']) {
    assert.match(await zdroj(f), /<a class="back" href="#\//, `${f}: přímý odkaz bez historie má dál cestu zpět`);
  }
});

test('CSS: žádné :has() uvnitř :has() – prohlížeč by celé pravidlo tiše zahodil', async () => {
  const soubory = (await fs.readdir(new URL('../public/', import.meta.url))).filter((f) => f.endsWith('.css'));
  assert.ok(soubory.length >= 5);
  const vnorene = [];
  for (const f of soubory) {
    const css = await zdroj(`public/${f}`);
    for (const m of css.matchAll(/:has\(/g)) {
      // Najdi konec tohoto :has( a zjisti, jestli uvnitř není další :has(.
      let hloubka = 1;
      let i = m.index + 5;
      for (; i < css.length && hloubka; i++) hloubka += css[i] === '(' ? 1 : css[i] === ')' ? -1 : 0;
      if (css.slice(m.index + 5, i).includes(':has(')) vnorene.push(`${f}: ${css.slice(m.index, i)}`);
    }
  }
  assert.deepEqual(vnorene, []);
});

test('tlačítka se při najetí neposouvají – mění se jen plocha nebo linka (docs/DESIGN.md, Stavy)', async () => {
  const soubory = (await fs.readdir(new URL('../public/', import.meta.url))).filter((f) => f.endsWith('.css'));
  const poskoky = [];
  for (const f of soubory) {
    const css = await zdroj(`public/${f}`);
    for (const m of css.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)) {
      const [, selektor, telo] = m;
      if (!/\b(btn|icon-btn|launch-go|pm-poslat|search-btn)\b/.test(selektor)) continue;
      if (/translate:\s*0(px)?\s+-\d|translateY\(-\d/.test(telo)) poskoky.push(`${f}: ${selektor.trim()}`);
    }
  }
  assert.deepEqual(poskoky, []);
});
