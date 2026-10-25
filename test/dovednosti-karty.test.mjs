import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const css = async (f) => fs.readFile(new URL(`../public/${f}`, import.meta.url), 'utf8');

// Vlastník 25. 10. 2026: karty dovedností mají stejnou výšku a název při najetí zfialoví.
// Žlutá/zlatá je ze starého designu a na hover se nevrací (docs/DESIGN.md).
test('Dovednosti: název při najetí v barvě značky, nikdy ve zlaté', async () => {
  const vse = (await Promise.all(['styles.css', 'koncert.css', 'workbench.css', 'refinement.css'].map(css))).join('\n');
  const hover = [...vse.matchAll(/[^{}]*\.skill[^{}]*:hover[^{}]*\{([^}]*)\}/g)];
  assert.ok(hover.length, 'pravidlo pro najetí na dovednost chybí');
  for (const [pravidlo, telo] of hover) assert.doesNotMatch(telo, /brass|gold|amber/, `zlatá při najetí: ${pravidlo.trim()}`);
  assert.match(vse, /\.skill-open:hover\s*\{\s*color:\s*var\(--brand\)/);
});

test('Dovednosti: karty v mřížce se natáhnou na stejnou výšku a texty mají pevný počet řádků', async () => {
  const r = await css('refinement.css');
  assert.match(r, /\.skills\s*\{\s*align-items:\s*stretch;/);
  assert.match(r, /\.skills > \.skill \{[^}]*grid-template-rows:\s*1fr auto auto auto/);
  assert.match(r, /\.skills > \.skill \.skill-main \{[^}]*min-height:\s*110px/);
  assert.match(r, /\.skill-open \{\s*-webkit-line-clamp:\s*2/);
  assert.match(r, /\.skill-main p \{\s*-webkit-line-clamp:\s*3/);
});
