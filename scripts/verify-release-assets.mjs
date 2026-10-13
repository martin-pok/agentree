// Re-verify the actual bytes downloaded from a DRAFT GitHub release before
// publish.yml exposes them publicly. Do not trust release asset names alone.
// Node builtins only; the GH REST response is the independent metadata source.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function expectedAssets(tag) {
  const m = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (!m) throw new Error('Expected exact vX.Y.Z release tag');
  const version = tag.slice(1);
  return [
    "Agenteeq-" + version + "-macOS-arm64.dmg",
    "Agenteeq-" + version + "-macOS-arm64.zip",
    "Agenteeq-" + version + "-Windows-x64.zip",
    "agenteeq-extension-" + version + ".zip",
    "Agenteeq-macOS-arm64.dmg",
    "Agenteeq-macOS-arm64.zip",
    "Agenteeq-Windows-x64.zip",
    "SHA256SUMS.txt",
  ];
}

const shaPattern = /^sha256:([a-f0-9]{64})$/;
const manifestLine = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/;

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyReleaseAssets({ tag, dir, release }) {
  const expected = expectedAssets(tag);
  if (!release || release.tag_name !== tag || release.draft !== true || release.published_at !== null) {
    throw new Error('Release must be the exact unpublished draft for ' + tag);
  }
  if (!Array.isArray(release.assets) || release.assets.length !== expected.length) {
    throw new Error('Expected eight GitHub release assets for ' + tag);
  }
  const byName = new Map();
  for (const asset of release.assets) {
    if (!asset || typeof asset.name !== 'string' || !expected.includes(asset.name) || byName.has(asset.name)) {
      throw new Error('Unexpected or duplicate GitHub release asset: ' + (asset?.name || '?'));
    }
    if (!Number.isSafeInteger(asset.size) || asset.size < 1 || !shaPattern.test(asset.digest || '')) {
      throw new Error('Missing GitHub size or SHA-256 digest: ' + asset.name);
    }
    byName.set(asset.name, asset);
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries.filter(x => x.isFile()).map(x => x.name);
  if (files.length !== expected.length || expected.some(name => !files.includes(name))) {
    throw new Error('Downloaded assets do not match the complete release inventory');
  }

  const manifestName = 'SHA256SUMS.txt';
  const manifestStat = await fs.stat(path.join(dir, manifestName));
  if (manifestStat.size > 16 * 1024) throw new Error('Oversized checksum manifest');
  const manifestBytes = await fs.readFile(path.join(dir, manifestName));
  const actualManifestHash = createHash('sha256').update(manifestBytes).digest('hex');
  if (manifestStat.size !== byName.get(manifestName).size ||
      actualManifestHash !== shaPattern.exec(byName.get(manifestName).digest)[1]) {
    throw new Error('SHA256SUMS.txt differs from the GitHub asset digest');
  }

  const manifest = new Map();
  const text = manifestBytes.toString('utf8');
  if (!text.endsWith('\n')) throw new Error('Checksum manifest needs final newline');
  for (const line of text.trimEnd().split('\n')) {
    const m = manifestLine.exec(line);
    if (!m || m[2] === manifestName || manifest.has(m[2])) throw new Error('Invalid or duplicate SHA256SUMS.txt entry');
    manifest.set(m[2], m[1]);
  }
  if (manifest.size !== expected.length - 1 ||
      expected.filter(n => n !== manifestName).some(n => !manifest.has(n))) {
    throw new Error('Checksum manifest is missing an asset or contains an unknown one');
  }

  const digests = new Map();
  for (const name of expected.filter(n => n !== manifestName)) {
    const file = path.join(dir, name);
    const stat = await fs.stat(file);
    const sha = await checksum(file);
    if (stat.size !== byName.get(name).size ||
        sha !== shaPattern.exec(byName.get(name).digest)[1] ||
        sha !== manifest.get(name)) {
      throw new Error('Release size or SHA-256 mismatch: ' + name);
    }
    digests.set(name, sha);
  }
  const version = tag.slice(1);
  for (const [alias, versioned] of [
    ['Agenteeq-macOS-arm64.dmg', 'Agenteeq-' + version + '-macOS-arm64.dmg'],
    ['Agenteeq-macOS-arm64.zip', 'Agenteeq-' + version + '-macOS-arm64.zip'],
    ['Agenteeq-Windows-x64.zip', 'Agenteeq-' + version + '-Windows-x64.zip'],
  ]) {
    if (digests.get(alias) !== digests.get(versioned)) {
      throw new Error('Stable-name alias does not match versioned asset: ' + alias);
    }
  }
  return { tag, assetsVerified: expected.length, archiveCount: digests.size, draft: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [tag, dir, metadata] = process.argv.slice(2);
  if (!tag || !dir || !metadata) {
    console.error('Usage: node scripts/verify-release-assets.mjs vX.Y.Z assetsDir release.json');
    process.exitCode = 1;
  } else {
    try {
      const release = JSON.parse(await fs.readFile(metadata, 'utf8'));
      console.log(JSON.stringify(await verifyReleaseAssets({ tag, dir, release })));
    } catch (err) {
      console.error('::error::Release verification failed: ' + err.message);
      process.exitCode = 1;
    }
  }
}
