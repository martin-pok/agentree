import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (file) => fs.readFile(new URL('../' + file, import.meta.url), 'utf8');

test('legal working overview reflects the fixed live privacy warnings without declaring legal readiness', async () => {
  const [guide, audit, cz, en] = await Promise.all([
    read('docs/legal/README.md'),
    read('docs/legal/PRIVACY-REVIEW.cs.md'),
    read('site/soukromi/index.html'),
    read('site/en/privacy/index.html'),
  ]);
  assert.match(guide, /PR #221/);
  assert.match(guide, /výslovně varují před zveřejňováním osobních údajů/);
  assert.match(guide, /stále chybí ověřená identita správce/);
  assert.doesNotMatch(guide, /jen odkazují žádosti GDPR na \*\*veřejné GitHub Issues\*\*/i);
  assert.doesNotMatch(guide, /Veřejná privacy stránka říká, že desktop sám od sebe volá jen ČNB/i);

  assert.match(audit, /Historická veřejná privacy věta/);
  assert.match(audit, /PR #221/);
  assert.match(audit, /\[ \] \*\*P0 stále otevřené:/);
  assert.doesNotMatch(audit, /- \[ \] \*\*P0:\*\* upravit absolutní větu „jen ČNB“/);

  for (const html of [cz, en]) {
    assert.match(html, /GitHub Issues/);
    assert.match(html, /GitHub/);
    assert.match(html, /IP adresu|IP address/);
    assert.match(html, /neveřejný kontakt|dedicated private channel/);
  }
});
