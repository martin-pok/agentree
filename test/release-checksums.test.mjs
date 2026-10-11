import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { tempDir } from './helpers.mjs';
import { checksumsForDirectory, writeChecksums } from '../scripts/release-checksums.mjs';

const names = [
  'Agenteeq-macOS-arm64.dmg',
  'Agenteeq-macOS-arm64.zip',
  'Agenteeq-Windows-x64.zip',
  'agenteeq-extension-0.46.2.zip',
];

async function fixture() {
  const dir = await tempDir('release-hashes-');
  for (const name of names) await fs.writeFile(path.join(dir, name), Buffer.from('fixture:' + name));
  return dir;
}

test('release checksum manifest is complete, deterministic and cryptographically correct', async () => {
  const dir = await fixture();
  const first = await writeChecksums(dir);
  assert.equal(first, await checksumsForDirectory(dir));
  assert.equal(first, await fs.readFile(path.join(dir, 'SHA256SUMS.txt'), 'utf8'));
  const lines = first.trim().split('\n');
  assert.equal(lines.length, names.length);
  for (const name of [...names].sort()) {
    const hash = createHash('sha256').update('fixture:' + name).digest('hex');
    assert.ok(lines.includes(hash + '  ' + name), 'manifest omitted or mis-hashed ' + name);
  }
  // The manifest itself and build metadata never belong in the checksums list.
  assert.doesNotMatch(first, /SHA256SUMS|latest-build/);
  assert.equal(await writeChecksums(dir), first, 'repeated generation must be byte-stable');
});

test('checksum generation fails closed for missing or unsafe release assets', async () => {
  const dir = await fixture();
  await fs.unlink(path.join(dir, 'Agenteeq-macOS-arm64.dmg'));
  await assert.rejects(checksumsForDirectory(dir), /Missing release asset/);
  await fs.writeFile(path.join(dir, 'Agenteeq-macOS-arm64.dmg'), 'restored');
  await fs.rename(path.join(dir, 'agenteeq-extension-0.46.2.zip'),
    path.join(dir, 'agenteeq-extension-untagged.zip'));
  await assert.rejects(checksumsForDirectory(dir), /Missing versioned Chrome extension/);
  await fs.writeFile(path.join(dir, 'agenteeq-extension-0.46.2.zip'), 'extension');
  await fs.writeFile(path.join(dir, 'evil\nother.zip'), 'malicious');
  await assert.rejects(checksumsForDirectory(dir), /Invalid release asset filename/);
});

test('release workflow verifies checksums before publishing and includes manifest in both paths', async () => {
  const yaml = await fs.readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(yaml, /node scripts\/release-checksums\.mjs prilohy[\s\S]*?sha256sum --check SHA256SUMS\.txt/);
  assert.equal((yaml.match(/prilohy\/\*\.zip prilohy\/\*\.dmg prilohy\/SHA256SUMS\.txt/g) || []).length, 2,
    'both draft creation and draft update must attach the checksum manifest');
});
