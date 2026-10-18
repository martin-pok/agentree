import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Notion: account sync cloud is optically larger without changing its tile or other icons', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const settings = await readFile(new URL('../public/js/views/settings.js', import.meta.url), 'utf8');
  assert.match(settings, /class="acct-sync-icon"\>\$\{ICON\.cloud\}\<\/span\>/);
  assert.match(css, /\.acct-sync-icon \{[^}]*width: 40px; height: 40px;/);
  assert.match(css, /\.acct-sync-icon > \.icon \{ width: 26px; height: 26px; stroke-width: 2; \}/);
  assert.match(css, /\.icon \{ width: 18px; height: 18px;/, 'other icons retain their shared design-system size');
});
