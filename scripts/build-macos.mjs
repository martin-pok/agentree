import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin') throw new Error('Build requires macOS and Xcode command-line tools.');
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
// Build outside File Provider/iCloud folders: they re-add FinderInfo during signing.
const build = await fs.mkdtemp('/private/tmp/agentree-mac-build-');
const app = path.join(build, 'Agentree.app');
const resources = path.join(app, 'Contents', 'Resources');
const binary = path.join(app, 'Contents', 'MacOS');
await fs.mkdir(binary, { recursive: true });
await fs.mkdir(path.join(resources, 'app'), { recursive: true });
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
for (const dir of ['src', 'public', 'bin', 'extension', 'docs', 'desktop']) await fs.cp(path.join(root, dir), path.join(resources, 'app', dir), { recursive: true });
for (const file of ['package.json', 'README.md', 'CHANGELOG.md']) await fs.copyFile(path.join(root, file), path.join(resources, 'app', file));
await fs.copyFile(path.join(root, 'desktop/Info.plist'), path.join(app, 'Contents/Info.plist'));
const node = process.env.AGENTREE_NODE_BINARY || process.execPath;
await fs.copyFile(node, path.join(resources, 'node')); await fs.chmod(path.join(resources, 'node'), 0o755);
await fs.copyFile(path.resolve(node, '../../LICENSE'), path.join(resources, 'NODE-LICENSE.txt'));
run('xcrun', ['swiftc', '-O', '-module-cache-path', path.join(build, 'module-cache'), '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos14.0`, '-framework', 'AppKit', '-framework', 'WebKit', '-framework', 'UserNotifications', 'desktop/Agentree.swift', '-o', path.join(binary, 'Agentree')]);
run('xcrun', ['swiftc', '-O', '-module-cache-path', path.join(build, 'module-cache'), '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos14.0`, '-framework', 'Security', 'desktop/Keychain.swift', '-o', path.join(resources, 'agentree-keychain')]);
// Keep the reviewed macOS icon as a source asset. Recent macOS releases can
// reject a freshly generated .iconset despite valid PNG dimensions, which made
// release builds non-deterministic. The checked-in ICNS is the exact reviewed
// white-tile Agentree mark used by the app.
await fs.copyFile(path.join(root, 'desktop', 'Agentree.icns'), path.join(resources, 'Agentree.icns'));
const identity = process.env.AGENTREE_SIGN_IDENTITY || '-';
// Finder metadata can be inherited while copying into a .app; strip it only from our generated build.
run('xattr', ['-cr', app]);
const signature = identity === '-' ? [] : ['--timestamp', '--options', 'runtime'];
run('codesign', ['--force', '--sign', identity, ...signature, '--entitlements', 'desktop/node-entitlements.plist', path.join(resources, 'node')]);
run('codesign', ['--force', '--sign', identity, ...signature, path.join(resources, 'agentree-keychain')]);
run('codesign', ['--force', '--sign', identity, ...signature, '--entitlements', 'desktop/app-entitlements.plist', app]);
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
const archive = path.join(root, 'dist', `Agentree-${version}-macOS-${process.arch}.zip`);
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);
const iconPreview = path.join(root, 'desktop', 'Agentree-icon.png');
try {
  await fs.copyFile(iconPreview, path.join(root, 'dist/Agentree-icon.png'));
} catch {
  // The app icon remains present; the PNG preview is a convenience artifact.
}
await fs.writeFile(path.join(root, 'dist/latest-build.json'), JSON.stringify({ app, archive, version, arch: process.arch, signature: identity === '-' ? 'ad-hoc' : 'Developer ID', notarized: false }, null, 2));
console.log(JSON.stringify({ app, archive, version, signature: identity === '-' ? 'ad-hoc' : 'Developer ID' }));
