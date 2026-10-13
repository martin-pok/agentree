import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (p) => fs.readFile(new URL("../" + p, import.meta.url), "utf8");
const workflowsDir = new URL("../.github/workflows/", import.meta.url);

test('completed v0.46.7 one-shot CI bootstrap does not waste Actions minutes on every main push', async () => {
  const names = await fs.readdir(workflowsDir);
  assert.ok(!names.includes('release-0467-boot.yml'),
    'the version-pinned workflow_run bootstrap should be removed after the draft exists');
  assert.ok(!names.some(n => /^release-\d+-boot\.ya?ml$/.test(n)),
    'no stale one-shot draft creation listeners should remain active');
  assert.ok(names.includes('test.yml'), 'full CI remains configured');
  assert.ok(names.includes('release.yml'), 'normal manual draft build remains available');
  assert.ok(names.includes('publish.yml'), 'explicit human-controlled publish workflow remains');
});

test('manual draft build still pins the tested commit SHA and cannot alter public release assets', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /workflow_dispatch:/);
  assert.match(release, /expected_sha:/);
  assert.match(release, /git rev-parse HEAD/);
  assert.match(release, /if \[ -n "\$EXPECTED_SHA" \]/);
  assert.match(release, /gh release create "\$TAG"[\s\S]*?--draft/);
  assert.match(release, /IS_DRAFT=\$\(gh release view "\$TAG" --json isDraft --jq \.isDraft\)/);
  assert.match(release, /if \[ "\$IS_DRAFT" != "true" \]; then[\s\S]*?exit 1[\s\S]*?gh release upload/);
});

test('publishing requires an explicit manual Preview/Stable choice and verifies downloaded assets', async () => {
  const publish = await read('.github/workflows/publish.yml');
  assert.match(publish, /workflow_dispatch:/);
  assert.match(publish, /channel:[\s\S]*?default: preview/);
  assert.match(publish, /confirm_stable:/);
  assert.match(publish, /scripts\/verify-release-assets\.mjs/);
  assert.match(publish, /-F draft=false -F prerelease=true -f make_latest=false/);
  assert.match(publish, /-F draft=false -F prerelease=false -f make_latest=true/);
  assert.doesNotMatch(publish, /^\\s+gh release (?:view|download|edit)\\b/m);
});
