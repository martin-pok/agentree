import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('one-shot candidate workflow is pinned to successful main push Testy', async () => {
  const w = await read('.github/workflows/release-0467-boot.yml');
  assert.match(w, /workflow_run:[\s\S]*?workflows: \['Testy'\][\s\S]*?types: \[completed\][\s\S]*?branches: \[main\]/);
  assert.match(w, /workflow_run\.conclusion == 'success'/);
  assert.match(w, /workflow_run\.event == 'push'/);
  assert.match(w, /workflow_run\.head_branch == 'main'/);
  assert.match(w, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(w, /cancel-in-progress: false/);
});

test('one-shot release dispatch verifies SHA, versions, all eight checks', async () => {
  const w = await read('.github/workflows/release-0467-boot.yml');
  assert.match(w, /CURRENT_SHA=\$\(git rev-parse HEAD\)/);
  assert.match(w, /test "\$CURRENT_SHA" = "\$VERIFIED_SHA"/);
  assert.match(w, /app !== "0\.46\.7" \|\| ext !== app/);
  assert.match(w, /repos\/\$\{GITHUB_REPOSITORY\}\/commits\/\$\{VERIFIED_SHA\}\/check-runs/);
  for (const name of ['ubuntu-latest', 'windows-latest', 'macos-latest', 'Web, rozšíření a kontrast', 'aplikace pro Mac', 'Chrome Web Store branding a screenshoty']) {
    assert.ok(w.includes(name), `missing CI check ${name}`);
  }
  assert.match(w, /x\.status === "completed" && x\.conclusion === "success"/);
});

test('one-shot release triggers draft workflow but never publishes to Latest', async () => {
  const w = await read('.github/workflows/release-0467-boot.yml');
  assert.match(w, /TAG: v0\.46\.7/);
  assert.match(w, /gh workflow run release\.yml --ref main -f "tag=\$TAG" -f "expected_sha=\$VERIFIED_SHA"/);
  assert.match(w, /git\/ref\/tags\/\$\{TAG\}/);
  assert.doesNotMatch(w, /gh release edit|gh release create|--draft=false|--latest(?:[ =]|$)/);
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /workflow_dispatch:/);
  assert.match(release, /expected_sha:/);
  assert.match(release, /git rev-parse HEAD/);
  assert.match(release, /if \[ -n "\$EXPECTED_SHA" \]/);
  assert.match(release, /gh release create "\$TAG"[\s\S]*?--draft/);
  assert.match(release, /IS_DRAFT=\$\(gh release view "\$TAG" --json isDraft --jq \.isDraft\)/);
  assert.match(release, /if \[ "\$IS_DRAFT" != "true" \]; then[\s\S]*?exit 1[\s\S]*?gh release upload/);

});
