import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fromRoot = (path) => new URL('../' + path, import.meta.url);
const read = async (path) => fs.readFile(fromRoot(path), 'utf8');

test('brand inventory: no generated native icon may be tracked in Git', async () => {
  // Native CI legitimately regenerates ICNS and Windows ICO into the working
  // tree. Assert they are never committed, rather than banning temporary files.
  const native = ['desktop/Agenteeq-icon.png', 'desktop/Agenteeq.icns', 'desktop/windows/Agenteeq.ico'];
  const root = fileURLToPath(new URL('..', import.meta.url));
  const indexed = execFileSync('git', ['ls-files', '--cached', '--', ...native], { cwd: root, encoding: 'utf8' });
  assert.equal(indexed, '', 'generated native icon duplicates are not allowed in version control');
  const ignore = await read('.gitignore');
  for (const name of native) assert.ok(ignore.split('\\n').includes(name), name + ' must be gitignored');
  const make = await read('scripts/make-ico.mjs');
  assert.match(make, /'extension', 'icons', 'icon-128\\.png'/,
    'Windows ICO must be generated from the reviewed 128px Chrome/Dock raster');
});

test('brand inventory: Windows package removes obsolete icon variants after copy', async () => {
  const build = await read('scripts/build-windows.mjs');
  const copy = build.indexOf("for (const dir of ['src', 'public', 'bin', 'extension', 'desktop'])");
  const stale = build.indexOf("for (const stale of ['Agenteeq-icon.png', 'Agenteeq.icns'])");
  assert.ok(copy >= 0 && stale > copy,
    'legacy icons must be removed *after* copying desktop into the Windows ZIP');
  assert.match(build, /fs\.rm\(path\.join\(balik, 'app', 'desktop', stale\), \{ force: true \}\)/);
  assert.match(build, /run\(process\.execPath, \['scripts\/make-ico\.mjs'\]\)/,
    'Windows EXE icon is regenerated from the current approved Chrome/Dock source');
  const mac = await read('scripts/build-macos.mjs');
  assert.match(mac, /for \(const stale of \['Agenteeq\.icns', 'Agenteeq-icon\.png'\]\)/,
    'Mac must reject the same stale icons');
  assert.match(mac, /xcrun', \['swift', 'desktop\/Icon\.swift', iconset\]/,
    'Mac Dock icon derives from canonical Swift geometry at build time');
});

test('brand inventory: website pages including 404 explicitly reference canonical icon family', async () => {
  const pages = [
    'site/index.html', 'site/en/index.html', 'site/instalace/index.html',
    'site/en/install/index.html', 'site/soukromi/index.html',
    'site/en/privacy/index.html', 'site/404.html', 'public/index.html',
  ];
  for (const path of pages) {
    const html = await read(path);
    assert.match(html, /<link rel="icon" type="image\/x-icon" sizes="32x32" href="\/favicon\.ico">/, path);
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/brand\/agenteeq-mark-dark\.svg">/, path);
    assert.doesNotMatch(html, /(?:robot-predloha|agentree-mark|trident-logo|trojzubec\.svg)/i, path);
  }
  const ico = await fs.readFile(fromRoot('site/favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico.readUInt32BE(22 + 16), 32, 'the embedded ICO PNG width must be 32');
});

test('brand inventory: all product marks preserve approved wide head and one antenna', async () => {
  const canonical = await read('public/brand/agenteeq-dock.svg');
  for (const path of [
    'public/brand/agenteeq-mark.svg', 'public/brand/agenteeq-mark-dark.svg',
    'extension/icons/brand.svg',
  ]) assert.equal(await read(path), canonical, path + ' must be byte-identical');
  for (const [path, size] of [
    ['branding/chrome-web-store/source/icon-16.svg', 16],
    ['branding/chrome-web-store/source/icon.svg', 128],
  ]) {
    const v = await read(path);
    assert.equal(v.replace(`<svg width="${size}" height="${size}" xmlns=`, '<svg xmlns='), canonical,
      path + ' must change only dimensions');
  }
  assert.match(canonical, /width="78" height="53" rx="20"/);
  assert.match(canonical, /<circle cx="54" cy="22" r="4"/);
  assert.doesNotMatch(canonical, /#9C8CFF|#6260D8|M64 50V82|M8 6\.5V11\.5/);
  const copied = await fs.readFile(fromRoot('extension/icons/icon-128.png'));
  const exported = await fs.readFile(fromRoot('branding/chrome-web-store/export/icon-128.png'));
  assert.deepEqual(copied, exported, 'Chrome Store icon must match shipped extension icon exactly');
});
