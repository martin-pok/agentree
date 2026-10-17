import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Značka v hlavičce (issue #255): logo robota bylo vedle nápisu „Agenteeq“ opticky malé a každý
// produkt ho měl jinak (aplikace 34 px k 20px písmu, rozšíření 22 px k 16 px, web 34 px k 19 px).
// Velikost loga se teď odvozuje z velikosti nápisu jedním poměrem na variantu loga a shodu
// v prohlížeči měří `npm run qa:tvary`. Tady se hlídá, že se poměr nerozjede ve zdrojích.
const read = (p) => fs.readFile(new URL('../' + p, import.meta.url), 'utf8');
const token = (css, name) => css.match(new RegExp(`${name}:\\s*([\\d.]+(?:px)?)`))?.[1];
// Hlava robota v rámečku 1024 × 1024 (public/brand/agenteeq-dock.svg): 53 × 7,2.
const HLAVA = (53 * 7.2) / 1024;

test('značka v hlavičce: jeden poměr loga k nápisu v aplikaci, rozšíření i na webu', async () => {
  const app = await read('public/styles.css');
  const ext = await read('extension/popup.html');
  const web = await read('site/lp.css');
  for (const [kde, css] of [['aplikace', app], ['rozšíření', ext], ['web', web]]) {
    assert.equal(token(css, '--brand-mark-tile'), '1.9', `${kde}: logo v dlaždici má rámeček 1,9× písmo`);
  }
  assert.equal(token(web, '--brand-mark-clean'), '2.1', 'web: logo bez dlaždice má rámeček 2,1× písmo');
  // Hlava ≈ výška verzálek Satoshi (~0,7 em): dlaždice 0,71 em, bez dlaždice 0,78 em.
  for (const r of [1.9, 2.1]) {
    const hlava = r * HLAVA;
    assert.ok(hlava >= 0.68 && hlava <= 0.82, `poměr ${r}: hlava ${hlava.toFixed(2)} em`);
  }
  assert.equal(token(app, '--brand-word'), '20px');
  assert.equal(token(ext, '--brand-word'), '16px');
  assert.equal(token(web, '--brand-word'), '19px');
});

test('značka v hlavičce: velikost loga nikde není zapsaná číslem mimo tokeny', async () => {
  const app = (await read('public/styles.css')) + (await read('public/workbench.css')) + (await read('public/refinement.css'));
  assert.match(app, /\.brand-mark \{ width: var\(--brand-mark\); height: var\(--brand-mark\);/);
  assert.doesNotMatch(app, /\.brand(?: \.brand-mark|-mark) \{ width: \d/);
  const ext = await read('extension/popup.html');
  assert.match(ext, /\.brand > img \{ width: var\(--brand-mark\); height: var\(--brand-mark\);/);
  const web = await read('site/lp.css');
  assert.match(web, /\.nav \.brand img \{ width:var\(--brand-mark\); height:var\(--brand-mark\); \}/);
  assert.doesNotMatch(web, /\.nav \.brand img \{ width:\d/);
  // Stránky se zásadami mají v hlavičce logo v dlaždici, a tedy jeho poměr.
  for (const p of ['site/soukromi/index.html', 'site/en/privacy/index.html']) {
    assert.match(await read(p), /<a class="brand brand--tile"[^>]*><img src="\/brand\/agenteeq-mark-dark\.svg"/, p);
  }
});
