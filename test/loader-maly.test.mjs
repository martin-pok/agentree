import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Malé načítání (seznam dovedností, přepis, výběr složky) je hlava robota ze značky s odleskem
// jako velká načítací scéna, ne obecný kroužek. Je dekorace: stav nese text nebo role="status".
const zdroj = (f) => fs.readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('malý loader: maska hlavy robota, odlesk, klid při omezeném pohybu, žádný kroužek', async () => {
  const css = await zdroj('public/styles.css');
  const pravidlo = css.match(/^\.loader \{[^}]*\}/m)?.[0] || '';
  assert.ok(pravidlo, 'pravidlo .loader chybí');
  assert.doesNotMatch(pravidlo, /border-radius: 50%|animation: spin/, 'žádný obecný kroužek');
  assert.match(pravidlo, /mask: url\("data:image\/svg\+xml,[^"]*M20\.8 4\.5A3\.2 3\.2/, 'tvar hlavy z public/js/loader.js');
  assert.match(pravidlo, /animation: loader-lesk 2\.4s/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.loader \{ animation: none;/);
  // Tvar je stejný jako ve velké scéně.
  const velky = await zdroj('public/js/loader.js');
  const tvar = velky.match(/<path class="lr-zaklad" d="([^"]+)"/)[1];
  assert.ok(pravidlo.includes(tvar), 'malý loader má stejný tvar hlavy jako velký');
});

test('malý loader je všude skrytý pro čtečku a stav oznamuje text s role="status"', async () => {
  for (const f of ['public/js/views/skills.js', 'public/js/views/session.js', 'public/js/projects-ui.js']) {
    const js = await zdroj(f);
    const vyskyty = [...js.matchAll(/<span class="loader"[^>]*>/g)].map((m) => m[0]);
    assert.ok(vyskyty.length, f);
    for (const v of vyskyty) assert.match(v, /aria-hidden="true"/, f);
    assert.match(js, /role="status"><span class="loader"/, f);
  }
});
