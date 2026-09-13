import test from 'node:test';
import assert from 'node:assert/strict';
import { clipboardEnv, copyToClipboard } from '../src/openers.js';

// Změřeno na macOS: `pbcopy` s nastaveným LANG=…UTF-8 přečte zadání jako MacRoman a z „název“
// udělá „n�zev“. Tenhle test hlídá, že se proměnné jazyka k `pbcopy` nedostanou. Skutečnou
// schránku test nepoužívá — přepsal by ji uživateli, na jehož Macu testy běží.

test('pbcopy dostane prostředí bez proměnných jazyka', () => {
  const env = clipboardEnv({ PATH: '/usr/bin', HOME: '/Users/x', LANG: 'cs_CZ.UTF-8', LC_ALL: 'en_US.UTF-8', LC_CTYPE: 'UTF-8', __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0' });
  assert.deepEqual(env, { PATH: '/usr/bin', HOME: '/Users/x' });
});

test('ostatní proměnné zůstanou — pbcopy musí najít uživatele a jeho schránku', () => {
  const env = clipboardEnv({ PATH: '/usr/bin', USER: 'martin', TMPDIR: '/tmp/x' });
  assert.equal(env.USER, 'martin');
  assert.equal(env.TMPDIR, '/tmp/x');
});

test('ve zkušebním režimu se schránky nedotkne a prázdné zadání nekopíruje', async () => {
  assert.deepEqual(await copyToClipboard('cokoli', { dry: true }), { ok: true, dry: true });
  assert.deepEqual(await copyToClipboard(''), { ok: false });
  assert.deepEqual(await copyToClipboard(null), { ok: false });
});
