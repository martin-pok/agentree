import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const file = await fs.readFile(new URL('../.github/workflows/prepare-preview-draft.yml', import.meta.url), 'utf8');

test('green main alone may prepare an immutable draft but never publish a release', () => {
  assert.match(file, /workflow_run:/);
  assert.match(file, /workflows: \['Testy'\]/);
  assert.match(file, /branches: \[main\]/);
  assert.match(file, /workflow_run\.conclusion == 'success'/);
  assert.match(file, /workflow_run\.event == 'push'/);
  assert.match(file, /workflow_run\.head_branch == 'main'/);
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
