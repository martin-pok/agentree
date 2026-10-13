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

  // Future legal revisions must update both visible language dates together;
  // the test intentionally does not freeze the current calendar date.
  const czUpdated = cz.match(/Aktualizováno (\d{1,2})\. (\d{1,2})\. (\d{4})/);
  const enUpdated = en.match(/Last updated (\d{1,2}) ([A-Za-z]+) (\d{4})/);
  assert.ok(czUpdated, 'Czech public notice must display its last-revised date');
  assert.ok(enUpdated, 'English public notice must display its last-revised date');
  const englishMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  assert.equal(Number(czUpdated[1]), Number(enUpdated[1]));
  assert.equal(Number(czUpdated[2]), englishMonths.indexOf(enUpdated[2]) + 1);
  assert.equal(Number(czUpdated[3]), Number(enUpdated[3]));
  assert.doesNotMatch(cz, /Platí od 27\. 9\. 2026/);
  assert.doesNotMatch(en, /Effective 27 September 2026/);

  for (const html of [cz, en]) {
    assert.match(html, /GitHub Issues/);
    assert.match(html, /GitHub/);
    assert.match(html, /IP adresu|IP address/);
    assert.match(html, /neveřejný kontakt|dedicated private channel/);
  }
});
