import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = async (file) => fs.readFile(new URL('../' + file, import.meta.url), 'utf8');

test('live Czech privacy text discloses GitHub update checks and CNB network requests', async () => {
  const html = await source('site/soukromi/index.html');
  assert.match(html, /GitHubu pro kontrolu aktualizací/);
  assert.match(html, /České národní banky/);
  assert.match(html, /IP adresu/);
  assert.doesNotMatch(html, /sama od sebe jen dotaz na denní kurzy|na internet:.*?jen dotaz na denní kurzy/i);
});

test('live English privacy text does not conceal GitHub release traffic', async () => {
  const html = await source('site/en/privacy/index.html');
  assert.match(html, /releases on GitHub for updates/);
  assert.match(html, /Czech National Bank/);
  assert.match(html, /IP address/);
  assert.doesNotMatch(html, /on its own, only a request for the Czech National Bank/i);
});

test('neither privacy page invites private data-subject requests in public issues', async () => {
  const cz = await source('site/soukromi/index.html');
  const en = await source('site/en/privacy/index.html');
  assert.match(cz, /GitHub Issues/);
  assert.match(cz, /Nezveřejňuj zde osobní údaje/);
  assert.match(cz, /neveřejný kontakt/);
  assert.match(en, /Public <a [^>]+>GitHub Issues<\/a>/);
  assert.match(en, /Do not publicly post personal data/);
  assert.match(en, /dedicated private channel/);
  // A placeholder must not become a real-looking fabricated email.
  assert.doesNotMatch(cz, /href="mailto:[^"]*github\.com"/i);
  assert.doesNotMatch(en, /href="mailto:[^"]*github\.com"/i);
});

test('all legal drafts are explicitly non-effective and not represented as certifications', async () => {
  for (const file of ['TERMS.cs.md','TERMS.en.md','PRIVACY.cs.md','PRIVACY.en.md','BRAND-POLICY.cs.md','BRAND-POLICY.en.md']) {
    const text = await source('docs/legal/' + file);
    assert.match(text, /DRAFT|NÁVRH|PRÁVNÍ NÁVRH/i, file + ' must be flagged as a draft');
    assert.match(text, /NEPLATÍ|NOT EFFECTIVE|NOT YET EFFECTIVE|ZATÍM NEPLATÍ|NOT A REGISTERED/i,
      file + ' must not claim it is already an operative policy');
  }
  const guide = await source('docs/legal/README.md');
  assert.match(guide, /DRAFT/);
  assert.match(guide, /NEPLATÍ jako zveřejněné podmínky/);
  assert.match(await source('docs/legal/FREE-ASSURANCE.md'), /not a certification/i);
  assert.match(await source('docs/legal/LAUNCH-LEGAL-GATE.md'), /before public commercial availability/i);
});

test('marketing site build does not copy private legal working papers into production assets', async () => {
  const build = await source('scripts/build-site.mjs');
  assert.match(build, /copyDir\(path\.join\(root, 'site'\), out\)/);
  assert.match(build, /copyDir\(path\.join\(root, 'public'\), out/);
  assert.doesNotMatch(build, /copyDir\(path\.join\(root, ['"]docs['"]\)/);
  for (const path of ['site/index.html','site/en/index.html','site/soukromi/index.html','site/en/privacy/index.html']) {
    const html = await source(path);
    assert.doesNotMatch(html, /\/docs\/legal\//,
      path + ' must not present internal legal DRAFT files as effective contracts');
  }
});
