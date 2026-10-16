import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exact-browser qa:extension additionally measures every visible element's right edge
// at 320px and 380px; this regression pins the responsive popup width contract.
test('Chrome popup respects a 320px viewport instead of forcing 380px body width', async () => {
  const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
  assert.match(html, /--w:\s*380px;/, 'normal popup stays 380px wide');
  assert.match(html, /width:\s*min\(var\(--w\),\s*100vw\);\s*height:\s*600px;/,
    'viewport controls body width on narrow windows and high zoom');
  assert.match(html, /@container okno \(max-width:\s*352px\)/,
    'header and brand controls reflow when the popup is narrower than 352px');
  assert.doesNotMatch(html, /width:\s*var\(--w\);\s*height:\s*600px;/,
    'do not restore fixed body width that overflows a 320px viewport');
});
