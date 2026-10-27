// One reviewable Chrome Web Store upload kit: package, *rendered* listing images and hashes.
// This prepares files for a human publisher; it NEVER uploads or publishes to Google.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT = 'branding/chrome-web-store/export';
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngDimensions(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG)) throw new Error('Invalid PNG signature');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

// Validate the manifest from inside the ACTUAL ZIP, not merely the source folder.
// The extension packer writes local ZIP headers with concrete lengths (no data descriptors).
// Read one bounded ZIP entry (the packaging format is produced by build-extension.mjs).
// Verifies the bytes inside the actual upload ZIP, not just the source icon files.
export function packagedEntry(buffer, wanted, maxSize = 2 * 1024 * 1024) {
  let offset = 0;
  let result = null;
  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50 || offset + 30 > buffer.length) throw new Error('Invalid ZIP local header');
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    if (flags & 0x0008) throw new Error('ZIP data descriptors are not supported');
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const end = dataStart + size;
    if (end > buffer.length) throw new Error('Truncated ZIP entry');
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    if (name === wanted) {
      if (result !== null) throw new Error('Duplicate ' + wanted + ' in ZIP');
      if (size > maxSize) throw new Error('Oversized compressed ZIP entry: ' + wanted);
      const packed = buffer.subarray(dataStart, end);
      const raw = method === 0 ? packed : method === 8
        ? zlib.inflateRawSync(packed, { maxOutputLength: maxSize })
        : null;
      if (!raw) throw new Error('Unsupported ZIP compression for ' + wanted);
      if (raw.length > maxSize) throw new Error('Oversized ZIP entry: ' + wanted);
      result = raw;
    }
    offset = end;
  }
  if (result === null) throw new Error('Extension ZIP has no ' + wanted);
  return result;
}

export function packagedManifest(buffer) {
  return JSON.parse(packagedEntry(buffer, 'manifest.json', 1024 * 1024).toString('utf8'));
}

const IMAGES = [
  ['icon-128.png', 128, 128],
  ['promo-small-440x280.png', 440, 280],
  ['marquee-1400x560.png', 1400, 560],
  ['en/promo-small-440x280.png', 440, 280],
  ['en/marquee-1400x560.png', 1400, 560],
  ...['', 'en/'].flatMap((locale) => [1, 2, 3].map((n) => [
    locale + 'snimek-' + n + '-1280x800.png', 1280, 800,
  ])),
];

export async function prepareChromeStoreKit({
  root = ROOT,
  output = path.join(root, 'dist/chrome-store-kit'),
  sourceCommit = process.env.GITHUB_SHA,
} = {}) {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit || '')) {
    throw new Error('Full 40-character source commit SHA required; never label an unidentified build as releasable');
  }
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const sourceManifest = JSON.parse(await fs.readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
  if (pkg.version !== sourceManifest.version || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new Error('Source extension and application versions differ or are invalid');
  }
  const zipName = 'agenteeq-extension-' + pkg.version + '.zip';
  const zip = await fs.readFile(path.join(root, 'dist', zipName));
  if (zip.length < 100 || !zip.subarray(0, 4).equals(Buffer.from('PK\x03\x04', 'binary'))) {
    throw new Error('Missing or malformed extension ZIP');
  }
  const embedded = packagedManifest(zip);
  if (embedded.version !== pkg.version || embedded.manifest_version !== 3 || embedded.key != null) {
    throw new Error('Built ZIP contains outdated, unsupported or store-keyed manifest');
  }
  if (JSON.stringify(embedded) !== JSON.stringify(sourceManifest)) {
    throw new Error('Built ZIP manifest does not match current source; rebuild extension before publishing');
  }

  // The release runner packs tracked icons, but Chrome Store CI used to replace
  // them with new Chromium-rasterized PNGs before packing. v0.46.8 produced
  // two different ZIP digests for the same source SHA as a result.
  // Refuse a Store upload unless ALL four packaged icon bytes are precisely the
  // approved source assets, and the listing icon matches the actual package.
  for (const size of [16, 32, 48, 128]) {
    const name = 'icons/icon-' + size + '.png';
    const approved = await fs.readFile(path.join(root, 'extension', name));
    if (!packagedEntry(zip, name).equals(approved)) {
      throw new Error('Packaged Chrome icon differs from approved source: ' + name);
    }
  }
  const listingIcon = await fs.readFile(path.join(root, EXPORT, 'icon-128.png'));
  if (!listingIcon.equals(packagedEntry(zip, 'icons/icon-128.png'))) {
    throw new Error('Chrome Store listing icon differs from packaged 128px icon');
  }

  const entries = [{ relative: 'package/' + zipName, bytes: zip }];
  for (const [name, width, height] of IMAGES) {
    const bytes = await fs.readFile(path.join(root, EXPORT, name));
    const [w, h] = pngDimensions(bytes);
    if (w !== width || h !== height) throw new Error('Wrong image dimensions: ' + name);
    entries.push({ relative: 'listing/' + name, bytes });
  }

  const files = entries.map(({ relative, bytes }) => ({
    path: relative,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  }));
  // No deletion of arbitrary caller-supplied output dirs. A clean CI workspace is required.
  for (const entry of entries) {
    const target = path.join(output, entry.relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.bytes);
  }
  const metadata = {
    schema: 1,
    product: 'Agenteeq Chrome extension',
    version: pkg.version,
    sourceCommit,
    state: 'REVIEW_REQUIRED_NOT_PUBLISHED',
    compatibleDesktopRelease: 'NOT_VERIFIED',
    uploadFile: 'package/' + zipName,
    files,
  };
  await fs.writeFile(path.join(output, 'STORE-KIT.json'), JSON.stringify(metadata, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'SHA256SUMS.txt'),
    files.map((f) => f.sha256 + '  ' + f.path).join('\n') + '\n');
  await fs.writeFile(path.join(output, 'PUBLISHING-GATE.txt'),
    'NOT PUBLISHED. Only use after all 8/8 main CI checks are green on ' + sourceCommit + '.\n' +
    'Manually review rendered CZ/EN screenshots and icon against actual UI, then test ZIP in clean Chrome.\n' +
    'Confirm the public or approved Preview desktop build supports every extension action; same version alone is NOT proof.\n' +
    'Require pairing, native app navigation, restart and offline QA; see issue #172 and docs/CHROME-WEB-STORE.md.\n' +
    'Upload ONLY the ZIP inside package/ to the existing Chrome Web Store item after owner approval.\n' +
    'Verify public store version and listing after Google publishes; do not confuse artifact with publication.\n');
  return metadata;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const metadata = await prepareChromeStoreKit();
  console.log('Chrome Web Store review kit ' + metadata.version + ': ' + metadata.files.length +
    ' hashed assets, commit ' + metadata.sourceCommit);
}
