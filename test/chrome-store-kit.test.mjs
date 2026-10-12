import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { zip } from '../scripts/build-extension.mjs';
import { prepareChromeStoreKit, packagedManifest } from '../scripts/prepare-chrome-store-kit.mjs';

const VERSION = '0.46.8';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const IMAGE_FILES = [
  ['icon-128.png', 128, 128],
  ['promo-small-440x280.png', 440, 280],
  ['marquee-1400x560.png', 1400, 560],
  ...['', 'en/'].flatMap((locale) => [1, 2, 3].map((n) => [
    locale + 'snimek-' + n + '-1280x800.png', 1280, 800,
  ])),
];

function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-store-kit-'));
  const manifest = { manifest_version: 3, version: VERSION, name: 'Agenteeq' };
  await fs.mkdir(path.join(root, 'extension'), { recursive: true });
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: VERSION }));
  await fs.writeFile(path.join(root, 'extension/manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, 'dist/agenteeq-extension-' + VERSION + '.zip'),
    zip([{ rel: 'manifest.json', body: Buffer.from(JSON.stringify(manifest)) }]));
  for (const [name, w, h] of IMAGE_FILES) {
    const file = path.join(root, 'branding/chrome-web-store/export', name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, png(w, h));
  }
  return { root, manifest };
}

async function useFixture(fn) {
  const { root, manifest } = await fixture();
  try { return await fn(root, manifest); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('Chrome Store kit matches the packed manifest, version and exactly 10 SHA256-verified files', async () => {
  await useFixture(async (root, manifest) => {
    const out = path.join(root, 'kit');
    const result = await prepareChromeStoreKit({ root, output: out, sourceCommit: SHA });
    assert.equal(result.version, VERSION);
    assert.equal(result.state, 'REVIEW_REQUIRED_NOT_PUBLISHED');
    assert.equal(result.sourceCommit, SHA);
    assert.equal(result.files.length, 10);
    assert.equal(result.uploadFile, 'package/agenteeq-extension-' + VERSION + '.zip');
    const zipData = await fs.readFile(path.join(out, result.uploadFile));
    assert.deepEqual(packagedManifest(zipData), manifest);
    const checksumLines = (await fs.readFile(path.join(out, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
    for (const f of result.files) {
      const bytes = await fs.readFile(path.join(out, f.path));
      assert.equal(f.bytes, bytes.length);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), f.sha256);
      assert.ok(checksumLines.includes(f.sha256 + '  ' + f.path));
    }
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(out, 'STORE-KIT.json'))), result);
    assert.match(await fs.readFile(path.join(out, 'PUBLISHING-GATE.txt'), 'utf8'), /NOT PUBLISHED/);
  });
});

test('Chrome Store kit refuses a ZIP built from stale manifest or a store-keyed manifest', async () => {
  await useFixture(async (root, manifest) => {
    for (const corrupted of [{ ...manifest, version: '0.46.7' }, { ...manifest, key: 'must-not-be-here' }]) {
      await fs.writeFile(path.join(root, 'dist/agenteeq-extension-' + VERSION + '.zip'),
        zip([{ rel: 'manifest.json', body: Buffer.from(JSON.stringify(corrupted)) }]));
      await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: SHA }),
        /outdated|unsupported|store-keyed/);
    }
  });
});

test('Chrome Store kit fails closed on untracked commit, incorrect listing dimensions and malformed ZIP', async () => {
  await useFixture(async (root) => {
    await assert.rejects(prepareChromeStoreKit({ root }), /Full 40-character/);
    await fs.writeFile(path.join(root, 'branding/chrome-web-store/export/en/snimek-2-1280x800.png'), png(100, 100));
    await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: SHA }), /Wrong image dimensions/);
    await fs.writeFile(path.join(root, 'dist/agenteeq-extension-' + VERSION + '.zip'), Buffer.from('not a ZIP'));
    await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: SHA }), /Missing or malformed/);
  });
});
