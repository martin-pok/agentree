import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (p) => fs.readFile(new URL('../' + p, import.meta.url), 'utf8');

test('brand: extension and Chrome Store logo is the two-tone robot, no legacy trident', async () => {
  for (const p of ['branding/chrome-web-store/source/icon.svg', 'branding/chrome-web-store/source/icon-16.svg']) {
    const svg = await read(p);
    assert.match(svg, /<rect[^>]+rx=/, p + ': robot head');
    assert.match(svg, /<circle[^>]+fill="#FAF9FF"/, p + ': white antenna tip');
    assert.match(svg, /stroke="#FAF9FF"/, p + ': white antenna stem');
    assert.doesNotMatch(svg, /#9C8CFF|#C99A3E|M64 50V82|M8 6\.5V11\.5/, p + ': legacy accent or trident');
  }
  const popup = await read('extension/popup.html');
  assert.match(popup, /\.robo \.ant \{ stroke: #FAFAFA; \}/);
  assert.match(popup, /\.robo \.ant-svetlo \{ fill: #FAFAFA; \}/);
  for (const p of ['branding/chrome-web-store/source/promo-small.html', 'branding/chrome-web-store/source/marquee.html']) {
    const html = await read(p);
    assert.match(html, /stroke="#FAF9FF"/);
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
  const nativeIcon = await read('desktop/Icon.swift');
  assert.match(nativeIcon, /white\.setStroke\(\); stem\.stroke\(\)/, 'macOS app icon draws white antenna stem');
  assert.match(nativeIcon, /white\.setFill\(\)/, 'macOS app icon draws white head and antenna tip');
  assert.doesNotMatch(nativeIcon, /#(?:9C8CFF|5254D8|6260D8)/i, 'no purple antenna in native icon generator');
});
