// Generate deterministic SHA-256 checksums for release assets after stable aliases are copied.
// Run in release.yml on Linux; only Node builtins, no network or credentials required.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_ASSETS = [
  'Agenteeq-macOS-arm64.dmg',
  'Agenteeq-macOS-arm64.zip',
  'Agenteeq-Windows-x64.zip',
];

export async function checksumsForDirectory(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const assets = entries.filter((e) => e.isFile() && /\.(?:zip|dmg)$/i.test(e.name))
    .map((e) => e.name).sort();
  for (const required of REQUIRED_ASSETS) {
    if (!assets.includes(required)) throw new Error('Missing release asset: ' + required);
  }
  if (!assets.some((name) => /^agenteeq-extension-\d+\.\d+\.\d+\.zip$/.test(name))) {
    throw new Error('Missing versioned Chrome extension release ZIP');
  }
  const lines = [];
  for (const name of assets) {
    // Reject filenames that could inject additional checksum lines or flags.
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('Invalid release asset filename: ' + name);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path.join(dir, name))) hash.update(chunk);
    lines.push(hash.digest('hex') + '  ' + name);
  }
  return lines.join('\n') + '\n';
}

export async function writeChecksums(dir) {
  const manifest = await checksumsForDirectory(dir);
  await fs.writeFile(path.join(dir, 'SHA256SUMS.txt'), manifest, { mode: 0o644 });
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeChecksums(path.resolve(process.argv[2] || 'prilohy'))
    .then((manifest) => process.stdout.write(manifest))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
