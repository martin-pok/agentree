import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createCodexAppThreadsConnector, normalizeCodexAppThread, readCodexAppThreads } from '../src/connectors/codex-app-threads.js';
import { Store } from '../src/store.js';

const id = '019a1f83-8d9f-71a0-b532-d7e3bd359b0f';
const now = Date.now();
const thread = { id, source: 'appServer', originator: 'Codex Desktop', name: 'LATEST AG',
  preview: '', cwd: '/Users/me/work', model: 'gpt-6.1-sol', createdAt: (now - 10000) / 1000,
  updatedAt: now / 1000, status: { type: 'notLoaded' }, ephemeral: false, parentThreadId: null };

test('Codex app thread is discovered without a rollout and remains honest about live state', async () => {
  const store = new Store({ config: { windowDays: 30 } });
  const connector = createCodexAppThreadsConnector({ store, config: { sourceHome: '/Users/me', windowDays: 30 },
    codexCloudBin: () => '/Applications/Codex.app/Contents/Resources/codex',
    codexCloudHome: () => '/Users/me/.codex', readThreads: async () => [thread] });
  await connector.scan();
  const s = store.summary(`codex:${id}`);
  assert.equal(s.title, 'LATEST AG');
  assert.equal(s.app, 'Codex · aplikace');
  assert.equal(s.status, 'observed');
  assert.equal(s.metadataOnly, true);
  assert.equal(store.list().length, 1);
  assert.equal(connector.status().state, 'connected');
});

test('Codex app thread index never overwrites a local transcript', async () => {
  const store = new Store({ config: { windowDays: 30 } });
  const s = store.ensure({ connector: 'codex', localId: id, provider: 'openai', app: 'Codex · aplikace' });
  s.title = 'Real rollout title';
  s.lastAt = now;
  store.commit(s);
  const connector = createCodexAppThreadsConnector({ store, config: { sourceHome: '/Users/me', windowDays: 30 },
    codexCloudBin: () => 'codex', codexCloudHome: () => '/Users/me/.codex', readThreads: async () => [thread] });
  await connector.scan();
  assert.equal(store.summary(`codex:${id}`).title, 'Real rollout title');
  assert.equal(store.summary(`codex:${id}`).metadataOnly, false);
});

test('app-server thread/list uses Codex home and state DB without cloud task credentials', async () => {
  const sent = [];
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.kill = () => {};
  child.stdin.on('data', (chunk) => {
    for (const line of chunk.toString().trim().split('\n')) {
      const request = JSON.parse(line);
      sent.push(request);
      if (request.id === 1) child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
      if (request.id === 2) child.stdout.write(`${JSON.stringify({ id: 2, result: { data: [thread] } })}\n`);
    }
  });
  let environment;
  const data = await readCodexAppThreads('codex', '/Users/me/.codex', {
    spawnFn: (bin, args, opts) => { environment = opts.env; assert.deepEqual(args, ['app-server', '--stdio']); return child; },
  });
  assert.equal(environment.CODEX_HOME, '/Users/me/.codex');
  assert.equal(sent[2].params.useStateDbOnly, true);
  assert.equal(data[0].name, 'LATEST AG');
  assert.equal(normalizeCodexAppThread({ ...thread, parentThreadId: id }), null);
});
