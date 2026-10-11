import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const icon = await fs.readFile(new URL('../public/logos/chrome.svg', import.meta.url), 'utf8');
const install = await fs.readFile(new URL('../site/instalace/index.html', import.meta.url), 'utf8');
const en = await fs.readFile(new URL('../site/en/install/index.html', import.meta.url), 'utf8');

test('Chrome install icon is a complete established vector logo, not an improvised construction', () => {
  assert.match(icon, /viewBox="0 0 256 256"/);
  for (const color of ['#229342', '#FBC116', '#1A73E8', '#E33B2E']) assert.ok(icon.includes(color), color);
  assert.equal(icon.split('<path ').length - 1, 5);
  assert.ok(!icon.includes('<circle '));
});

test('Both install pages load the same local Chrome logo', () => {
  for (const html of [install, en]) assert.ok(html.includes('src="/logos/chrome.svg"'));
});
