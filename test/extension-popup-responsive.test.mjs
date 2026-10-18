import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exact-browser qa:extension additionally measures every visible element's right edge
// at 320px and 380px; this regression pins the responsive popup width contract.
test('Chrome popup keeps 380px by itself and fits a 300–379px viewport', async () => {
  const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
  assert.match(html, /--w:\s*380px;/, 'normal popup stays 380px wide');
  // Popup otevírá Chrome skoro nulový a zvětšuje ho podle obsahu. Šířka těla odvozená od okna
  // (`min(var(--w), 100vw)`) tak zůstala pruhem pár pixelů – u vlastníka 18. 10. 2026.
  assert.match(html, /width:\s*var\(--w\);\s*height:\s*600px;/, 'body width never depends on the initial popup window');
  assert.doesNotMatch(html, /min\(var\(--w\),\s*100vw\)/, 'no self-referential popup width');
  assert.match(html, /@media \(min-width:\s*300px\) and \(max-width:\s*379\.98px\) \{ body \{ width: 100vw; \} \}/,
    'narrow windows and high zoom still fit, but never below 300px');
  assert.match(html, /@container okno \(max-width:\s*352px\)/,
    'header and brand controls reflow when the popup is narrower than 352px');
});
