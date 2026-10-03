import assert from 'node:assert/strict';
import test from 'node:test';
import { keepalive, keepaliveRequest } from '../scripts/supabase-keepalive.mjs';

test('keepalive volá necacheované Auth API bez uživatelského tokenu', () => {
  const { url, options } = keepaliveRequest({ url: 'https://example.supabase.co', klic: 'public-key' });
  assert.equal(url.toString(), 'https://example.supabase.co/auth/v1/settings');
  assert.deepEqual(options, {
    headers: {
      apikey: 'public-key',
      'Cache-Control': 'no-store',
    },
  });
});

test('keepalive projde jen při úspěšné odpovědi', async () => {
  const status = await keepalive(async () => new Response('', { status: 200 }));
  assert.equal(status, 200);
  await assert.rejects(() => keepalive(async () => new Response('', { status: 540 })), /Supabase Auth vrátil 540/);
});
