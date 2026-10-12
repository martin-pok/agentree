import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expectedAssets, verifyReleaseAssets } from '../scripts/verify-release-assets.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const TAG = 'v0.46.7';

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-release-assets-'));
  const names = expectedAssets(TAG);
  const version = TAG.slice(1);
  const archives = new Map();
  for (const name of names.filter(n => n !== 'SHA256SUMS.txt')) {
    const original = name.replace(/^Agenteeq-(?:macOS|Windows)/, (m) => 'Agenteeq-' + version + '-' + m.slice('Agenteeq-'.length));
    const bytes = Buffer.from('fixture archive for ' + original);
    archives.set(name, bytes);
    await fs.writeFile(path.join(dir, name), bytes);
  }
  const manifest = names.filter(n => n !== 'SHA256SUMS.txt').sort()
    .map(n => sha(archives.get(n)) + '  ' + n).join('\n') + '\n';
  await fs.writeFile(path.join(dir, 'SHA256SUMS.txt'), manifest);
  const assets = names.map(name => {
    const bytes = name === 'SHA256SUMS.txt' ? Buffer.from(manifest) : archives.get(name);
    return { name, size: bytes.byteLength, digest: 'sha256:' + sha(bytes) };
  });
  const release = { tag_name: TAG, draft: true, published_at: null, assets };
  return { dir, release, archives, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

test('release assets: draft with complete matching files, GitHub digests and aliases passes', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await verifyReleaseAssets({ tag: TAG, dir: f.dir, release: f.release }),
      { tag: TAG, assetsVerified: 8, archiveCount: 7, draft: true });
  } finally { await f.cleanup(); }
});

test('release assets: reject public release and mismatched tag', async () => {
  const f = await fixture();
  try {
    await assert.rejects(verifyReleaseAssets({ tag: TAG, dir: f.dir, release: { ...f.release, draft: false } }), /unpublished draft/);
    await assert.rejects(verifyReleaseAssets({ tag: TAG, dir: f.dir, release: { ...f.release, published_at: '2026-10-12T00:00:00Z' } }), /unpublished draft/);
    await assert.rejects(verifyReleaseAssets({ tag: 'v0.46.8', dir: f.dir, release: f.release }), /exact unpublished draft/);
  } finally { await f.cleanup(); }
});

test('release assets: reject a downloaded archive corrupted after GitHub published its digest', async () => {
  const f = await fixture();
  try {
    const name = 'Agenteeq-0.46.7-macOS-arm64.dmg';
    await fs.writeFile(path.join(f.dir, name), Buffer.from('tampered image!'));
    await assert.rejects(verifyReleaseAssets({ tag: TAG, dir: f.dir, release: f.release }), /mismatch/);
  } finally { await f.cleanup(); }
});

test('release assets: reject forged SHA256SUMS even if all archives remain unchanged', async () => {
  const f = await fixture();
  try {
    await fs.appendFile(path.join(f.dir, 'SHA256SUMS.txt'), 'garbage\n');
    await assert.rejects(verifyReleaseAssets({ tag: TAG, dir: f.dir, release: f.release }), /SHA256SUMS.txt differs/);
  } finally { await f.cleanup(); }
});

test('release assets: reject removed and duplicate entries in manifest even if GitHub digest is updated', async () => {
  const f = await fixture();
  try {
    const file = path.join(f.dir, 'SHA256SUMS.txt');
    const lines = (await fs.readFile(file, 'utf8')).trimEnd().split('\n');
    const update = async value => {
      await fs.writeFile(file, value);
      const asset = f.release.assets.find(x => x.name === 'SHA256SUMS.txt');
      asset.size = Buffer.byteLength(value);
      asset.digest = 'sha256:' + sha(value);
    };
    await update(lines.slice(1).join('\n') + '\n');
    await assert.rejects(verifyReleaseAssets({ tag: TAG, dir: f.dir, release: f.release }), /manifest is missing/);
    await update([...lines, lines[0]].join('\n') + '\n');
    await assert.rejects(verifyReleaseAssets({ tag: TAG, dir: f.dir, release: f.release }), /duplicate/);
  } finally { await f.cleanup(); }
});

test('release assets: reject alias that differs even when manifest and metadata agree', async () => {
  const f = await fixture();
  try {
    const name = 'Agenteeq-macOS-arm64.zip';
    const bytes = Buffer.from('modified alias with matching forged checksums');
    await fs.writeFile(path.join(f.dir, name), bytes);
    const manifestFile = path.join(f.dir, 'SHA256SUMS.txt');
    const original = await fs.readFile(manifestFile, 'utf8');
    const modified = original.split('\n').map(line => line.endsWith('  ' + name) ? sha(bytes) + '  ' + name : line).join('\n');
    await fs.writeFile(manifestFile, modified);
    for (const asset of f.release.assets) {
      if (asset.name === name) { asset.size = bytes.length; asset.digest = 'sha256:' + sha(bytes); }
      if (asset.name === 'SHA256SUMS.txt') { asset.size = Buffer.byteLength(modified); asset.digest = 'sha256:' + sha(modified); }
    }
    await assert.rejects(verifyReleaseAssets({ tag: TAG, dir: f.dir, release: f.release }), /alias does not match/);
  } finally { await f.cleanup(); }
});

test('release assets: reject missing or extra archives', async () => {
  const f = await fixture();
  try {
    await fs.unlink(path.join(f.dir, 'Agenteeq-Windows-x64.zip'));
    await assert.rejects(verifyReleaseAssets({ tag: TAG, dir: f.dir, release: f.release }), /inventory/);
    await fs.writeFile(path.join(f.dir, 'Agenteeq-Windows-x64.zip'), f.archives.get('Agenteeq-Windows-x64.zip'));
    await fs.writeFile(path.join(f.dir, 'other.zip'), 'extra');
    await assert.rejects(verifyReleaseAssets({ tag: TAG, dir: f.dir, release: f.release }), /inventory/);
  } finally { await f.cleanup(); }
});

test('release assets: refuse untrusted GitHub metadata without valid asset digests and sizes', async () => {
  const f = await fixture();
  try {
    const a = f.release.assets.find(x => x.name === 'agenteeq-extension-0.46.7.zip');
    a.digest = null;
    await assert.rejects(verifyReleaseAssets({ tag: TAG, dir: f.dir, release: f.release }), /Missing GitHub size or SHA-256/);
  } finally { await f.cleanup(); }
});

test('release assets: only strict numeric version tags are accepted', () => {
  assert.throws(() => expectedAssets('v0.46.7; rm -rf /'), /exact vX.Y.Z/);
  assert.throws(() => expectedAssets('v0.46.07'), /exact vX.Y.Z/);
  assert.equal(expectedAssets(TAG).length, 8);
});

test('publish workflow verifies full downloaded bytes before changing release visibility', async () => {
  const publish = await fs.readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  const verifyPos = publish.indexOf('scripts/verify-release-assets.mjs');
  const publishPos = publish.indexOf('gh release edit "$TAG" --notes-file poznamky.md --draft=false');
  assert.ok(verifyPos > 0 && publishPos > verifyPos, 'binary checks must precede publication');
  assert.match(publish, /gh release download "\$TAG" --dir overene-prilohy --repo "\$GITHUB_REPOSITORY"/);
  assert.match(publish, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/releases\/tags\/\$\{TAG\}" > release-metadata\.json/);
  assert.match(publish, /sha256sum --check SHA256SUMS\.txt/);
  assert.match(publish, /channel:[\s\S]*?default: preview/);
  assert.match(publish, /--prerelease --latest=false/);
});
