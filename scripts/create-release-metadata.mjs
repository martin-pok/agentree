import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = process.env.RELEASE_TAG || `v${version}`;
const tagVersion = tag.replace(/^v/, '');
if (tagVersion !== version) throw new Error(`RELEASE_TAG ${tag} neodpovídá package.json (${version}).`);

const repository = process.env.GITHUB_REPOSITORY || 'martin-pok/agentree';
const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
const base = `${server}/${repository}`;
const releaseUrl = `${base}/releases/tag/${tag}`;
const manifestUrl = `${base}/releases/latest/download/agentree-release.json`;
const files = (await fs.readdir(dist)).filter((file) => file.endsWith('.zip') || file.endsWith('.tgz')).sort();

const sha256 = async (file) => {
  const hash = crypto.createHash('sha256');
  hash.update(await fs.readFile(path.join(dist, file)));
  return hash.digest('hex');
};

const assets = [];
for (const name of files) {
  const platform = name.match(/macOS-(arm64|x64)\.zip$/)?.[1];
  const kind = platform ? 'desktop' : name.endsWith('.tgz') ? 'cli' : 'other';
  assets.push({
    name,
    kind,
    ...(platform ? { platform, minimumMacOS: '14.0' } : {}),
    url: `${base}/releases/download/${tag}/${encodeURIComponent(name)}`,
    sha256: await sha256(name),
  });
}

const manifest = {
  schemaVersion: 1,
  product: 'Agentree',
  channel: 'stable',
  version,
  tag,
  repository,
  releaseUrl,
  manifestUrl,
  generatedAt: new Date().toISOString(),
  desktop: {
    updateCheck: { manifestUrl, channel: 'stable' },
    minimumMacOS: '14.0',
  },
  assets,
};

const changelog = await fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
const heading = new RegExp(`^## (?:\\[)?${version.replaceAll('.', '\\.')}(?:\\])?[^\\n]*$`, 'm');
const match = heading.exec(changelog);
if (!match) throw new Error(`CHANGELOG.md nemá položku pro v${version}.`);
const start = match.index;
const after = changelog.slice(start + match[0].length);
const nextHeading = after.search(/^## /m);
const notes = changelog.slice(start, nextHeading < 0 ? undefined : start + match[0].length + nextHeading).trim();

await fs.mkdir(dist, { recursive: true });
await fs.writeFile(path.join(dist, 'agentree-release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await fs.writeFile(path.join(dist, 'release-notes.md'), `${notes}\n`);
console.log(JSON.stringify({ manifest: 'dist/agentree-release.json', notes: 'dist/release-notes.md', assets: assets.map((asset) => asset.name) }, null, 2));
