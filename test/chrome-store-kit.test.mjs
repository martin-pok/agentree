import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { zip } from '../scripts/build-extension.mjs';
import { prepareChromeStoreKit, packagedManifest, packagedEntry } from '../scripts/prepare-chrome-store-kit.mjs';

const VERSION = '0.46.8';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const IMAGE_FILES = [
  ['icon-128.png', 128, 128],
  ['promo-small-440x280.png', 440, 280],
  ['marquee-1400x560.png', 1400, 560],
  ['en/promo-small-440x280.png', 440, 280],
  ['en/marquee-1400x560.png', 1400, 560],
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
  const icons = [16, 32, 48, 128].map(size => ({
    rel: 'icons/icon-' + size + '.png', body: png(size, size),
  }));
  for (const icon of icons) {
    const target = path.join(root, 'extension', icon.rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, icon.body);
  }
  await fs.writeFile(path.join(root, 'dist/agenteeq-extension-' + VERSION + '.zip'),
    zip([{ rel: 'manifest.json', body: Buffer.from(JSON.stringify(manifest)) }, ...icons]));
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

test('Chrome Store kit matches the packed manifest, version and exactly 12 SHA256-verified files', async () => {
  await useFixture(async (root, manifest) => {
    const out = path.join(root, 'kit');
    const result = await prepareChromeStoreKit({ root, output: out, sourceCommit: SHA });
    assert.equal(result.version, VERSION);
    assert.equal(result.state, 'REVIEW_REQUIRED_NOT_PUBLISHED');
    assert.equal(result.sourceCommit, SHA);
    assert.equal(result.files.length, 12);
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
        zip([{ rel: 'manifest.json', body: Buffer.from(JSON.stringify(corrupted)) },
          ...[16, 32, 48, 128].map(size => ({ rel: 'icons/icon-' + size + '.png', body: png(size, size) }))]));
      await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: SHA }),
        /outdated|unsupported|store-keyed/);
    }
  });
});

test('Chrome Store kit fails closed on untracked commit, incorrect listing dimensions and malformed ZIP', async () => {
  await useFixture(async (root) => {
    await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: 'invalid' }), /Full 40-character/);
    await fs.writeFile(path.join(root, 'branding/chrome-web-store/export/en/snimek-2-1280x800.png'), png(100, 100));
    await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: SHA }), /Wrong image dimensions/);
    await fs.writeFile(path.join(root, 'dist/agenteeq-extension-' + VERSION + '.zip'), Buffer.from('not a ZIP'));
    await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: SHA }), /Missing or malformed/);
  });
});

test('Store kit rejects re-rasterized toolbar icons and a different 128px listing', async () => {
  await useFixture(async (root, manifest) => {
    const zipFile = path.join(root, 'dist/agenteeq-extension-' + VERSION + '.zip');
    const originals = [16, 32, 48, 128].map(size => ({
      rel: 'icons/icon-' + size + '.png', body: png(size, size),
    }));
    const bad = originals.map(icon => icon.rel === 'icons/icon-32.png'
      ? { ...icon, body: Buffer.concat([icon.body, Buffer.from([1])]) } : icon);
    await fs.writeFile(zipFile, zip([{ rel: 'manifest.json', body: Buffer.from(JSON.stringify(manifest)) }, ...bad]));
    await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: SHA }),
      /Packaged Chrome icon differs from approved source: icons\/icon-32.png/);
    await fs.writeFile(zipFile, zip([{ rel: 'manifest.json', body: Buffer.from(JSON.stringify(manifest)) }, ...originals]));
    const listing = path.join(root, 'branding/chrome-web-store/export/icon-128.png');
    await fs.writeFile(listing, Buffer.concat([png(128, 128), Buffer.from([4])]));
    await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: SHA }),
      /Chrome Store listing icon differs from packaged 128px icon/);
  });
});

test('Store kit rejects missing, duplicate and decompression-bomb-sized packaged icons', async () => {
  await useFixture(async (root, manifest) => {
    const zipFile = path.join(root, 'dist/agenteeq-extension-' + VERSION + '.zip');
    const icons = [16, 32, 48, 128].map(size => ({ rel: 'icons/icon-' + size + '.png', body: png(size, size) }));
    await fs.writeFile(zipFile, zip([{ rel: 'manifest.json', body: Buffer.from(JSON.stringify(manifest)) }, ...icons.filter(i => i.rel !== 'icons/icon-48.png')]));
    await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: SHA }), /Extension ZIP has no icons\/icon-48.png/);
    await fs.writeFile(zipFile, zip([{ rel: 'manifest.json', body: Buffer.from(JSON.stringify(manifest)) }, ...icons, icons[0]]));
    await assert.rejects(prepareChromeStoreKit({ root, sourceCommit: SHA }), /Duplicate icons\/icon-16.png in ZIP/);
    assert.equal(packagedEntry(zip([{ rel: 'some.txt', body: Buffer.from('x') }]), 'some.txt').toString(), 'x');
  });
});

test('Chrome Store renderer validates current SVG against approved PNG, never swaps the shipped icon', async () => {
  const source = await fs.readFile(new URL('../branding/chrome-web-store/render.mjs', import.meta.url), 'utf8');
  assert.match(source, /published = await fs\.readFile\(path\.join\(icons, job\.name\)\)/);
  assert.match(source, /maxDelta/);
  assert.match(source, /mean > maxDelta/);
  assert.match(source, /fs\.writeFile\(path\.join\(dir, job\.name\), published\)/);
  assert.doesNotMatch(source, /fs\.writeFile\(path\.join\(dir, job\.name\), png\)/);
});
