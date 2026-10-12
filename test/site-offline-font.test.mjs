import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSatoshiForWebBuild } from '../scripts/build-site.mjs';

const offline = async () => { throw new Error('Fontshare offline'); };

test('offline local web builds deliberately fall back to Onest without misrepresenting Satoshi', async () => {
  const messages = [];
  const ok = await prepareSatoshiForWebBuild({ ensure: offline, argv: ['node', 'scripts/build-site.mjs'], env: {}, warn: (msg) => messages.push(msg) });
  assert.equal(ok, false);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Fontshare offline/);
  assert.match(messages[0], /Onest/);
});

test('CI, Vercel and --povinne fail closed if the licensed font cannot be verified', async () => {
  for (const options of [
    { argv: ['node', 'scripts/build-site.mjs'], env: { CI: 'true' } },
    { argv: ['node', 'scripts/build-site.mjs'], env: { VERCEL: '1' } },
    { argv: ['node', 'scripts/build-site.mjs', '--povinne'], env: {} },
  ]) {
    let warned = false;
    await assert.rejects(
      prepareSatoshiForWebBuild({ ensure: offline, warn: () => { warned = true; }, ...options }),
      /Fontshare offline/
    );
    assert.equal(warned, false, 'strict builds must fail instead of quietly changing brand font');
  }
});

test('verified Satoshi is used in both local and CI builds without fallback', async () => {
  for (const env of [{}, { CI: '1' }, { VERCEL: '1' }]) {
    let called = 0, warned = false;
    const result = await prepareSatoshiForWebBuild({
      ensure: async () => { called += 1; },
      argv: ['node', 'scripts/build-site.mjs'],
      env,
      warn: () => { warned = true; },
    });
    assert.equal(result, true);
    assert.equal(called, 1);
    assert.equal(warned, false);
  }
});
