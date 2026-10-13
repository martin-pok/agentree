import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (name) => fs.readFile(new URL('../docs/legal/' + name, import.meta.url), 'utf8');
const drafts = [
  'README.md', 'TERMS.cs.md', 'TERMS.en.md', 'PRIVACY-REVIEW.cs.md',
  'BRAND-POLICY.cs.md', 'BRAND-POLICY.en.md',
  'IP-REGISTER.md', 'FREE-ASSURANCE.md', 'LAUNCH-LEGAL-GATE.md',
];

test('legal documents are versioned but not accidentally presented as effective policies', async () => {
  for (const p of drafts) {
    const s = await read(p);
    assert.ok(s.length > 1000, p + ' must not be an empty placeholder');
    assert.match(s, /DRAFT|návrh|pracovní|Working|review/i, p + ' must be labelled as a draft or workpaper');
  }
  const cs = await read('TERMS.cs.md');
  const en = await read('TERMS.en.md');
  assert.match(cs, /NENÍ ÚČINNÝ/);
  assert.match(en, /NOT EFFECTIVE/);
  assert.match(cs, /\[DOPLNIT/);
  assert.match(en, /\[INSERT/);
  assert.match(cs, /práva spotřebitele/);
  assert.match(en, /consumer/);
});

test('brand wording does not falsely claim a registration or third party certification', async () => {
  const cs = await read('BRAND-POLICY.cs.md');
  const en = await read('BRAND-POLICY.en.md');
  assert.match(cs, /NEZAKLÁDÁ|Nezakládá/);
  assert.match(en, /NOT A REGISTERED/);
  assert.match(cs, /žádné ®|Žádné ®/);
  const free = await read('FREE-ASSURANCE.md');
  assert.match(free, /not a certification/i);
  assert.match(free, /Scorecard/);
  assert.match(free, /WCAG/);
  assert.match(free, /not yet eligible/i);
});

test('public repo keeps only template documents and an explicit launch gate', async () => {
  const gate = await read('LAUNCH-LEGAL-GATE.md');
  const privacy = await read('PRIVACY-REVIEW.cs.md');
  assert.match(gate, /\[ \] \*\*Entity\*\*/);
  assert.match(gate, /\[ \] \*\*Privacy\*\*/);
  assert.match(gate, /\[ \] \*\*IP\*\*/);
  assert.match(privacy, /GitHub Issues/);
  assert.match(privacy, /ČNB|GitHub/);
  const root = await read('README.md');
  assert.match(root, /NEPLATÍ/);
  assert.match(root, /NEPUBLIKOVAT|nepublikovat/i);
});
