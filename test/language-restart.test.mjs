import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, tempDir, api } from './helpers.mjs';

test('English preference survives the server restart used by a desktop update', async () => {
  const dataHome = await tempDir('agenteeq-language-');
  const env = { AGENTEEQ_HOME: dataHome };
  const first = await startTestServer(env);
  try {
    const saved = await api(first.url).send('PUT', '/api/settings', { language: 'en' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.settings.language, 'en');
    const disk = JSON.parse(await fs.readFile(path.join(dataHome, 'data.json'), 'utf8'));
    assert.equal(disk.settings.language, 'en');
  } finally {
    await first.close();
  }

  const restarted = await startTestServer(env);
  try {
    assert.equal((await api(restarted.url).get('/api/state')).body.settings.language, 'en');
    const html = await (await fetch(`${restarted.url}/`, { cache: 'no-store' })).text();
    assert.match(html, /<html lang="en" data-system=/);
  } finally {
    await restarted.close();
  }
});
