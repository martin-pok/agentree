import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { stampVersion } from './plist-version.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin') throw new Error('Build requires macOS and Xcode command-line tools.');
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
// Build outside File Provider/iCloud folders: they re-add FinderInfo during signing.
const build = await fs.mkdtemp('/private/tmp/agenteeq-mac-build-');
const app = path.join(build, 'Agenteeq.app');
const resources = path.join(app, 'Contents', 'Resources');
const binary = path.join(app, 'Contents', 'MacOS');
await fs.mkdir(binary, { recursive: true });
await fs.mkdir(path.join(resources, 'app'), { recursive: true });
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
for (const dir of ['src', 'public', 'bin', 'extension', 'desktop']) await fs.cp(path.join(root, dir), path.join(resources, 'app', dir), { recursive: true });
// Zákazník dostane jen návod. Ostatní dokumenty jsou interní (licence a podpisový klíč, obchodní
// strategie, QA) a do prodávaného balíčku nepatří — stejně jako v npm balíčku (package.json → files).
await fs.mkdir(path.join(resources, 'app', 'docs'), { recursive: true });
for (const doc of ['INSTALL.md']) await fs.copyFile(path.join(root, 'docs', doc), path.join(resources, 'app', 'docs', doc));
for (const file of ['package.json', 'README.md', 'CHANGELOG.md']) await fs.copyFile(path.join(root, file), path.join(resources, 'app', file));
await fs.writeFile(path.join(app, 'Contents/Info.plist'), stampVersion(await fs.readFile(path.join(root, 'desktop/Info.plist'), 'utf8'), version));
const node = process.env.AGENTEEQ_NODE_BINARY || process.execPath;
await fs.copyFile(node, path.join(resources, 'node')); await fs.chmod(path.join(resources, 'node'), 0o755);
await fs.copyFile(path.resolve(node, '../../LICENSE'), path.join(resources, 'NODE-LICENSE.txt'));
run('xcrun', ['swiftc', '-O', '-module-cache-path', path.join(build, 'module-cache'), '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos14.0`, '-framework', 'AppKit', '-framework', 'WebKit', '-framework', 'UserNotifications', 'desktop/Agenteeq.swift', '-o', path.join(binary, 'Agenteeq')]);
run('xcrun', ['swiftc', '-O', '-module-cache-path', path.join(build, 'module-cache'), '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos14.0`, '-framework', 'Security', 'desktop/Keychain.swift', '-o', path.join(resources, 'agenteeq-keychain')]);
// Keep the reviewed macOS icon as a source asset. Recent macOS releases can
// reject a freshly generated .iconset despite valid PNG dimensions, which made
// release builds non-deterministic. The checked-in ICNS is the exact reviewed
// white-tile Agenteeq mark used by the app.
await fs.copyFile(path.join(root, 'desktop', 'Agenteeq.icns'), path.join(resources, 'Agenteeq.icns'));
const identity = process.env.AGENTEEQ_SIGN_IDENTITY || '-';
// Finder metadata can be inherited while copying into a .app; strip it only from our generated build.
run('xattr', ['-cr', app]);
const signature = identity === '-' ? [] : ['--timestamp', '--options', 'runtime'];
run('codesign', ['--force', '--sign', identity, ...signature, '--entitlements', 'desktop/node-entitlements.plist', path.join(resources, 'node')]);
run('codesign', ['--force', '--sign', identity, ...signature, path.join(resources, 'agenteeq-keychain')]);
run('codesign', ['--force', '--sign', identity, ...signature, '--entitlements', 'desktop/app-entitlements.plist', app]);
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
const archive = path.join(root, 'dist', `Agenteeq-${version}-macOS-${process.arch}.zip`);
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);

// Notarizace pro veřejné vydání. Bez ní Gatekeeper staženou aplikaci odmítne („rejected“).
// Spustí se jen s podpisem Developer ID a uloženým profilem notarytool:
//   xcrun notarytool store-credentials agenteeq-notary --apple-id … --team-id … --password <app-specific>
//   AGENTEEQ_SIGN_IDENTITY="Developer ID Application: …" AGENTEEQ_NOTARY_PROFILE=agenteeq-notary npm run build:mac
// Po schválení se lístek přišpendlí k aplikaci a archiv se vytvoří znovu, aby fungoval i offline.
const notaryProfile = process.env.AGENTEEQ_NOTARY_PROFILE || '';
let notarized = false;
if (notaryProfile) {
  if (identity === '-') throw new Error('Notarizace vyžaduje podpis Developer ID (AGENTEEQ_SIGN_IDENTITY).');
  run('xcrun', ['notarytool', 'submit', archive, '--keychain-profile', notaryProfile, '--wait']);
  run('xcrun', ['stapler', 'staple', app]);
  run('xcrun', ['stapler', 'validate', app]);
  await fs.rm(archive, { force: true });
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
  notarized = true;
}
const iconPreview = path.join(root, 'desktop', 'Agenteeq-icon.png');
try {
  await fs.copyFile(iconPreview, path.join(root, 'dist/Agenteeq-icon.png'));
} catch {
  // The app icon remains present; the PNG preview is a convenience artifact.
}
await fs.writeFile(path.join(root, 'dist/latest-build.json'), JSON.stringify({ app, archive, version, arch: process.arch, signature: identity === '-' ? 'ad-hoc' : 'Developer ID', notarized }, null, 2));
console.log(JSON.stringify({ app, archive, version, signature: identity === '-' ? 'ad-hoc' : 'Developer ID', notarized }));
