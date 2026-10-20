import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const file = await fs.readFile(new URL('../.github/workflows/prepare-preview-draft.yml', import.meta.url), 'utf8');

// Kandidát vzniká jen na pokyn (rozhodnutí vlastníka 20. 10. 2026): po merge do main už žádný Draft
// sám nevznikne, takže v seznamu vydání nevisí nedokončené koncepty.
test('draft is prepared only on explicit request, from green main, and never published here', () => {
  assert.match(file, /^on:\n  workflow_dispatch:\n\npermissions:/m, 'jediný spouštěč je ruční');
  assert.doesNotMatch(file, /workflow_run|^  push:/m, 'merge do main nic nesestaví');
  assert.match(file, /github\.ref == 'refs\/heads\/main'/);
  assert.match(file, /actions\/workflows\/test\.yml\/runs\?head_sha=\$TESTED_SHA&event=push&status=success/, 'jen ze zeleného CI na přesném commitu');
  assert.match(file, /CURRENT_MAIN.*TESTED_SHA/);
  assert.match(file, /git rev-parse HEAD/);
  assert.match(file, /extension\/manifest\.json/);
  assert.match(file, /CHANGELOG\.md/);
  assert.match(file, /whats-new-data\.js/);
  assert.match(file, /git\/ref\/tags/);
  assert.match(file, /-f "inputs\[expected_sha\]=\$TESTED_SHA"/);
  assert.match(file, /actions\/workflows\/release\.yml\/dispatches/);
  assert.doesNotMatch(file, /gh release (edit|create)/);
  assert.doesNotMatch(file, /--draft=false|--latest(?:\s|$)|gh api .*\/releases(?:\/|$)/);
  assert.match(file, /actions: write.*dispatch existing release\.yml/);
});

test('automatic draft workflow grants the token only actions dispatch, not repository write', () => {
  assert.match(file, /permissions:\n  contents: read/);
  assert.match(file, /permissions:\n      contents: read\n      actions: write/);
  assert.doesNotMatch(file, /contents: write/);
  assert.match(file, /persist-credentials: false/);
  assert.match(file, /cancel-in-progress: false/);
});
