import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecrets } from '../src/secrets.js';
import { createCloudBillingConnector } from '../src/connectors/cloud-billing.js';
import { startTestServer, api } from './helpers.mjs';
import { DataStore } from '../src/datastore.js';
import fs from 'node:fs/promises';

test('security: foreign origins cannot read state, transcripts or SSE; same-origin works', async () => {
  const s = await startTestServer();
  try {
    for (const p of ['/api/state', '/api/stream', '/api/runs', '/api/sessions/fake/transcript']) {
      for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
        const r = await fetch(s.url + p, { headers });
        assert.equal(r.status, 403, p);
        assert.equal(r.headers.get('access-control-allow-origin'), null);
      }
    }
    assert.equal((await fetch(s.url + '/api/state', { headers: { Origin: s.url } })).status, 200);
    assert.equal((await fetch(s.url + '/')).headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal((await api(s.url).send('PUT', '/api/settings', { avatar: 1 }, { 'X-Agentree': '1', Origin: 'https://evil.example' })).status, 403);
  } finally { await s.close(); }
});

test('security: SSE client limit and disconnect release', async () => {
  const s = await startTestServer();
  const controllers = [];
  try {
    for (let i = 0; i < 32; i++) {
      const c = new AbortController(); controllers.push(c);
      assert.equal((await fetch(s.url + '/api/stream', { signal: c.signal })).status, 200);
    }
    assert.equal((await fetch(s.url + '/api/stream')).status, 503);
    controllers.pop().abort();
    await new Promise(r => setTimeout(r, 50));
    const c = new AbortController(); controllers.push(c);
    assert.equal((await fetch(s.url + '/api/stream', { signal: c.signal })).status, 200);
  } finally { controllers.forEach(c => c.abort()); await s.close(); }
});

test('security: keychain values travel on stdin only; no insecure argv fallback', async () => {
  const calls = [];
  const value = 'sk-qa-placeholder-not-a-real-key-12345';
  const secrets = createSecrets({ keychain: true }, { helper: process.execPath, runImpl: async (...args) => { calls.push(args); return { ok: true, stdout: '' }; } });
  await secrets.set('openai-admin', value);
  assert.deepEqual(calls[0][1], ['set', 'openai-admin']);
  assert.equal(calls[0][2].input, value);
  assert.ok(!JSON.stringify(calls[0].slice(0, 2)).includes(value));
  await assert.rejects(secrets.set('openai-admin', 'sk-' + 'a'.repeat(5000)));
  await assert.rejects(createSecrets({ keychain: true }, { helper: '/nonexistent/agentree-keychain' }).set('openai-admin', value), /desktopovou/);
});

test('security: billing credentials never follow redirects; failures remain contained', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    throw new TypeError('fetch failed');
  });
  const c = createCloudBillingConnector({ config: { cloudFetch: true }, secrets: { get: async () => 'QA-only', source: () => 'test' } });
  await c.scan();
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.options.redirect === 'error'));
  assert.deepEqual(calls.map(c => new URL(c.url).hostname), ['api.openai.com', 'api.anthropic.com']);
  assert.equal(c.status().state, 'error');
  assert.ok(!JSON.stringify(c.providers()).includes('QA-only'));
});

test('reliability: corrupt persistent data are never replaced with an empty database', async () => {
  const dir = await fs.mkdtemp('/private/tmp/agentree-corrupt-qa-');
  const file = dir + '/data.json';
  for (const input of ['{"unfinished":', 'null', '[]']) {
    await fs.writeFile(file, input, { mode: 0o600 });
    await assert.rejects(new DataStore(dir).load(), /Původní soubor zůstal/);
    assert.equal(await fs.readFile(file, 'utf8'), input);
  }
});
