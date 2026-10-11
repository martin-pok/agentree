import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (p) => fs.readFile(new URL('../' + p, import.meta.url), 'utf8');

test('brand: extension and Chrome Store logo is the two-tone robot, no legacy trident', async () => {
  for (const p of ['branding/chrome-web-store/source/icon.svg', 'branding/chrome-web-store/source/icon-16.svg']) {
    const svg = await read(p);
    assert.match(svg, /<rect x="9" y="16\.5" width="30" height="24" rx="9\.5"/, p + ': canonical robot head');
    assert.match(svg, /<circle cx="24" cy="9" r="2\.8" fill="#FAFAFA"/, p + ': white antenna tip');
    assert.match(svg, /stroke="#FAFAFA"/, p + ': white antenna stem');
    assert.doesNotMatch(svg, /#9C8CFF|#C99A3E|M64 50V82|M8 6\.5V11\.5/, p + ': legacy accent or trident');
  }
  const popup = await read('extension/popup.html');
  assert.match(popup, /<img src="icons\/brand\.svg" width="22" height="22" alt="">/);
  assert.equal(await read('extension/icons/brand.svg'), await read('public/brand/agenteeq-mark.svg'),
    'popup mark stays byte-identical to the product brand');
  const popupScript = await read('extension/popup.js');
  assert.match(popupScript, /<rect class="hlava" x="9" y="16\.5" width="30" height="24" rx="9\.5"/,
    'state robots in the popup use the same head proportions');
  assert.doesNotMatch(popupScript, /<rect class="hlava" x="5" y="12" width="38" height="31"/);
  for (const p of ['branding/chrome-web-store/source/promo-small.html', 'branding/chrome-web-store/source/marquee.html']) {
    const html = await read(p);
    assert.match(html, /public\/brand\/agenteeq-mark\.svg/, p + ': canonical brand mark');
    assert.doesNotMatch(html, /#9C8CFF|M700 236V410|M220 124V190/, p);
  }
});

test('brand: web and native app use white antenna and two-tone mark', async () => {
  for (const p of ['public/brand/agenteeq-mark.svg', 'public/brand/agenteeq-mark-dark.svg', 'site/brand-mark-clean.svg']) {
    const svg = await read(p);
    assert.match(svg, /<path[^>]+stroke="#(?:FAFAFA|F4F3F7)"/, p + ': white antenna');
    assert.match(svg, /<circle[^>]+fill="#(?:FAFAFA|F4F3F7)"/, p + ': white antenna tip');
    assert.doesNotMatch(svg, /#(?:9C8CFF|5254D8|6260D8|C99A3E)/i, p + ': unexpected coloured logo accent');
  }
  const dockSvg = await read('public/brand/agenteeq-dock.svg');
  const transparentSvg = await read('public/brand/agenteeq-dock-transparent.svg');
  assert.match(dockSvg, /width="78" height="53" rx="20"/, 'Dock master has approved wide filled head');
  assert.match(dockSvg, /translate\(123 109\) scale\(7\.2\)/, 'Dock master matches native build coordinates');
  assert.match(transparentSvg, /viewBox="0 0 108 108"/);
  assert.doesNotMatch(transparentSvg, /<rect[^>]+fill="#17171D"\s*\/>/, 'transparent mark has no background tile');
    const nativeIcon = await read('desktop/Icon.swift');
  assert.match(nativeIcon, /approved widened filled robot head/, 'Dock uses approved wide head, not full-body Scout');
  assert.match(nativeIcon, /rounded\(15, 34, 78, 53, 20, white\)/, 'widened filled head');
  assert.match(nativeIcon, /rounded\(36, 52, 8, 16, 4, paper\)/, 'first capsule eye');
  assert.match(nativeIcon, /rounded\(64, 52, 8, 16, 4, paper\)/, 'second capsule eye');
  assert.doesNotMatch(nativeIcon, /#(?:9C8CFF|5254D8|6260D8)/i, 'no purple antenna in native icon generator');

  const mark = await read('public/brand/agenteeq-mark.svg');
  const menuIcon = await read('desktop/Agenteeq.swift');
  assert.match(mark, /<rect x="9" y="16\.5" width="30" height="24" rx="9\.5"/);
  assert.match(menuIcon, /NSRect\(x: 9 \* s, y: 16\.5 \* s, width: 30 \* s, height: 24 \* s\)/,
    'menu bar robot head uses the official mark geometry');
  assert.match(menuIcon, /NSRect\(x: x \* s, y: 24 \* s, width: 4 \* s, height: 8 \* s\)/,
    'menu bar robot eyes use the official mark geometry');
  assert.doesNotMatch(menuIcon, /NSRect\(x: 5 \* s, y: 12 \* s, width: 38 \* s/,
    'the oversized alternate robot head must not return');
});


test('brand: store icon and installed extension icon are byte-identical', async () => {
  const extensionIcon = await fs.readFile(new URL('../extension/icons/icon-128.png', import.meta.url));
  const storeIcon = await fs.readFile(new URL('../branding/chrome-web-store/export/icon-128.png', import.meta.url));
  assert.deepEqual(extensionIcon, storeIcon, 'Chrome Web Store listing and installed toolbar must share the same current robot logo');

  const manifest = JSON.parse(await read('extension/manifest.json'));
  for (const size of ['16', '32', '48', '128']) {
    assert.equal(manifest.action.default_icon[size], manifest.icons[size], `toolbar and extension settings must use the same ${size}px logo`);
    const bytes = await fs.readFile(new URL('../extension/' + manifest.icons[size], import.meta.url));
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG', `icon ${size} must be PNG`);
    assert.equal(bytes.readUInt32BE(16), Number(size), `icon ${size} width`);
    assert.equal(bytes.readUInt32BE(20), Number(size), `icon ${size} height`);
  }
});


test('rebrand: active surfaces do not link deprecated trident artwork', async () => {
  const files = [
    'site/index.html', 'site/en/index.html',
    'site/instalace/index.html', 'site/en/install/index.html',
    'site/404.html', 'extension/popup.html',
    'branding/chrome-web-store/source/marquee.html',
  ];
  for (const p of files) {
    const body = await read(p);
    assert.doesNotMatch(body, /(?:robot-predloha|agentree-mark|trident-logo|trojzubec\.svg)/i, p);
  }
  for (const p of ['docs/brand/robot-predloha.svg', 'docs/brand/robot-predloha.png']) {
    await assert.rejects(fs.access(new URL('../' + p, import.meta.url)), { code: 'ENOENT' }, p + ' must be removed');
  }
});
