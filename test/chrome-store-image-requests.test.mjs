import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { unexpectedScreenshotFailures } from '../branding/chrome-web-store/request-qa.mjs';

const cz = 'http://127.0.0.1:4620/branding/chrome-web-store/source/okno-sluzby.png';
const en = 'http://127.0.0.1:4620/branding/chrome-web-store/source/okno-sluzby-en.png';
const fail = (url, error = 'net::ERR_ABORTED', kind = 'image') => ({ url, error, kind });

test('Chrome Store locale switch tolerates cancellation only for an obsolete image URL', () => {
  assert.deepEqual(unexpectedScreenshotFailures([fail(cz)], [en]), []);
  assert.deepEqual(unexpectedScreenshotFailures([fail(cz), fail(en)], [en]), [fail(en)],
    'an aborted FINAL image must still fail screenshot QA');
  assert.deepEqual(unexpectedScreenshotFailures([fail(cz, 'net::ERR_CONNECTION_RESET')], [en]),
    [fail(cz, 'net::ERR_CONNECTION_RESET')], 'real network failures cannot be suppressed');
  assert.deepEqual(unexpectedScreenshotFailures([fail(cz, 'net::ERR_ABORTED', 'stylesheet')], [en]),
    [fail(cz, 'net::ERR_ABORTED', 'stylesheet')], 'CSS/script failures are never an expected image swap');
});

test('Chrome Store QA waits for all final images with verified decoding before screenshot', async () => {
  const source = await fs.readFile(new URL('../branding/chrome-web-store/snimky.mjs', import.meta.url), 'utf8');
  assert.match(source, /document\.images\.length > 0/);
  assert.match(source, /img\.complete && img\.naturalWidth > 0 && img\.naturalHeight > 0/);
  assert.match(source, /unexpectedScreenshotFailures\(selhanePozadavky, obrazky\)/);
  const loaded = source.indexOf('await page.waitForFunction(() => document.images.length > 0');
  const screenshot = source.indexOf('await page.screenshot({ path: path.join(cil,');
  assert.ok(loaded >= 0 && screenshot > loaded, 'images must be decoded before a Store screenshot');
  assert.ok(source.includes('požadované obrázky nejsou dekódované'), 'broken final images are a hard error');
});
