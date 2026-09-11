import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { startTestServer, api, tempDir, waitFor } from './helpers.mjs';
import { normalizeData } from '../src/datastore.js';

test('welcome: first-run state is boolean, persisted by API; desktop blocks competing LaunchAgent', async () => {
  assert.equal(normalizeData({ settings: { welcomeCompleted: 'yes' } }).settings.welcomeCompleted, false);
  const s = await startTestServer({ AGENTREE_DESKTOP: '1' });
  try {
    const client = api(s.url);
    assert.equal((await client.get('/api/state')).body.settings.welcomeCompleted, false);
    assert.equal((await client.send('PUT', '/api/settings', { welcomeCompleted: true })).body.settings.welcomeCompleted, true);
    await s.app.datastore.flush();
    assert.equal(JSON.parse(await fs.readFile(s.app.datastore.file, 'utf8')).settings.welcomeCompleted, true);
    const snapshot = (await client.get('/api/state')).body;
    assert.equal(snapshot.integrations.desktop, true);
    assert.equal(snapshot.integrations.autostart.supported, false);
    assert.equal((await s.app.autostart('install')).status, 422);
    const css = await fetch(s.url + '/fonts/fonts.css');
    assert.equal(css.status, 200);
    const font = await fetch(s.url + '/fonts/onest-400.ttf');
    assert.equal(font.headers.get('content-type'), 'font/ttf');
    assert.equal(font.headers.get('content-security-policy').includes("font-src 'self'"), true);
  } finally { await s.close(); }
});

test('desktop: owns its server, closes on parent EOF, rejects occupied ports', async () => {
  const dir = await tempDir('agentree-desktop-');
  const env = { ...process.env, PORT: '0', AGENTREE_SOURCE_HOME: dir, AGENTREE_HOME: dir, AGENTREE_PROCESSES: '0', AGENTREE_CLOUD: '0', AGENTREE_NATIVE_NOTIFY: '0', AGENTREE_KEYCHAIN: '0', AGENTREE_OPEN: 'dry', AGENTREE_QUIET: '1', AGENTREE_OLLAMA_URL: 'http://127.0.0.1:9' };
  const child = spawn(process.execPath, ['desktop/server.mjs'], { env, stdio: ['pipe','pipe','pipe'] });
  let output = '';
  child.stdout.on('data', (s) => { output += s; });
  const exited = new Promise((r) => child.once('exit', r));
  try {
    const ready = await waitFor(() => output.split('\n').filter((x) => x.startsWith('AGENTREE_DESKTOP ')).map((x) => JSON.parse(x.slice(17))).find((x) => x.ready), 15000);
    assert.equal((await fetch(`http://127.0.0.1:${ready.port}/api/health`).then((r) => r.json())).ready, true);
    const occupiedDir = await tempDir('agentree-occupied-');
    const second = spawn(process.execPath, ['desktop/server.mjs'], { env: { ...env, PORT: String(ready.port), AGENTREE_HOME: occupiedDir }, stdio: ['pipe','pipe','pipe'] });
    let secondOutput = '';
    second.stdout.on('data', (s) => { secondOutput += s; });
    assert.equal(await new Promise((r) => second.once('exit', r)), 1);
    assert.match(secondOutput, /používá jiná aplikace/);
    child.stdin.end();
    assert.equal(await exited, 0);
    await assert.rejects(fetch(`http://127.0.0.1:${ready.port}/api/health`));
  } finally { if (child.exitCode === null) child.kill(); }
});
