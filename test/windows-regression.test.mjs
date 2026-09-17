import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { startTestServer } from './helpers.mjs';
import { hookCommand, statuslineCommand } from '../src/hooks-installer.js';

test('Windows capabilities retain web opening and launching without native application launch', async t => {
  const s = await startTestServer(); t.after(() => s.close());
  Object.assign(s.app.config, { openApps: false, launchAgents: false });
  const web = s.app.store.ensure({ connector: 'web', localId: 'regression', provider: 'openai', app: 'ChatGPT' });
  web.url = 'https://chatgpt.com/c/fixture'; web.source = 'web';
  web.lastAt = Date.now(); s.app.store.commit(web);
  assert.equal((await s.app.openSession(web.id, 'app')).ok, true);
  assert.equal((await s.app.launch({ agent: 'chatgpt', mode: 'web', prompt: 'Test' })).ok, true);
  s.app.config.openMode = 'off';
  assert.equal((await s.app.openSession(web.id, 'app')).status, 422);
  assert.equal((await s.app.launch({ agent: 'chatgpt', mode: 'web', prompt: 'Test' })).status, 422);
});

test('Windows encoded hook delivers UTF-8 and succeeds when server is offline', { skip: process.platform !== 'win32' }, async t => {
  const received = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk.toString('utf8');
    received.push({ path: req.url, body, token: req.headers['x-agenteeq-token'] });
    res.end('Připojeno');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const port = server.address().port;
  const token = 'd'.repeat(40);
  const payload = JSON.stringify({ text: 'Příliš žluťoučký kůň 🐎' });
  const run = command => new Promise((resolve, reject) => {
    const [exe, ...args] = command.split(' ');
    const child = spawn(exe, args, { windowsHide: true });
    let output = ''; child.stdout.on('data', b => { output += b.toString('utf8'); });
    child.on('error', reject); child.on('close', code => resolve({ code, output }));
    child.stdin.end(payload);
  });
  assert.equal((await run(hookCommand(port, token, { windows: true }))).code, 0);
  const status = await run(statuslineCommand(port, token, { windows: true }));
  assert.equal(status.code, 0); assert.match(status.output, /Připojeno/);
  assert.equal(received.length, 2);
  for (const req of received) { assert.deepEqual(JSON.parse(req.body), JSON.parse(payload)); assert.equal(req.token, token); }
  await new Promise(r => server.close(r));
  const offline = await run(statuslineCommand(port, token, { windows: true }));
  assert.equal(offline.code, 0); assert.match(offline.output, /Agenteeq nebezi/);
  assert.equal((await run(hookCommand(port, token, { windows: true }))).code, 0);
});
