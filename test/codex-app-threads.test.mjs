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

test('Codex app thread beyond first 100 entries is discovered through every index page', async () => {
  const requests = [];
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.kill = () => {};
  const older = { ...thread, name: 'Synthetic page two thread' };
  child.stdin.on('data', chunk => {
    for (const line of chunk.toString().trim().split('\n')) {
      const request = JSON.parse(line); requests.push(request);
      if (request.method === 'initialize') child.stdout.write(JSON.stringify({ id: request.id, result: {} }) + '\n');
      if (request.method === 'thread/list') {
        const data = request.params.cursor ? [older] : Array.from({ length: 100 }, (_, i) => ({ ...thread, id: `019a1f83-8d9f-71a0-b532-${String(i).padStart(12, '0')}`, source: 'cli', originator: 'codex_cli_rs' }));
        child.stdout.write(JSON.stringify({ id: request.id, result: { data, nextCursor: request.params.cursor ? null : 'synthetic-page-2' } }) + '\n');
      }
    }
  });
  const data = await readCodexAppThreads('codex', '/synthetic/.codex', { spawnFn: () => child });
  assert.equal(data.length, 101, 'the first page must not silently hide an app thread on the next page');
  assert.equal(requests.filter(r => r.method === 'thread/list').length, 2);
  assert.equal(requests.find(r => r.params?.cursor)?.params.cursor, 'synthetic-page-2');
  const store = new Store({ config: { windowDays: 30 } });
  const connector = createCodexAppThreadsConnector({ store, config: { sourceHome: '/synthetic', windowDays: 30 },
    codexCloudBin: () => 'codex', codexCloudHome: () => '/synthetic/.codex', readThreads: async () => data });
  await connector.scan();
  assert.equal(store.summary(`codex:${id}`).title, older.name);
});

for (const mode of ['repeated-cursor', 'later-page-error', 'legacy-fallback']) {
  test(`Codex index pagination guards incomplete results and preserves compatibility: ${mode}`, async () => {
    const child = new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.kill=()=>{};
    let page=0;const lists=[];
    child.stdin.on('data',chunk=>{for(const line of chunk.toString().trim().split('\n')){
      const r=JSON.parse(line);
      if(r.method==='initialize')child.stdout.write(JSON.stringify({id:r.id,result:{}})+'\n');
      if(r.method!=='thread/list')continue;
      lists.push(r.params);
      if(mode==='legacy-fallback'&&r.params.useStateDbOnly){child.stdout.write(JSON.stringify({id:r.id,error:{message:'Unsupported parameter'}})+'\n');continue;}
      page++;
      if(mode==='later-page-error'&&page===2){child.stdout.write(JSON.stringify({id:r.id,error:{message:'Synthetic page failure'}})+'\n');continue;}
      const nextCursor=mode==='repeated-cursor'?'repeated':page===1?'page-two':null;
      child.stdout.write(JSON.stringify({id:r.id,result:{data:[thread],nextCursor}})+'\n');
    }});
    const rows=await readCodexAppThreads('codex','/synthetic/.codex',{spawnFn:()=>child});
    if(mode==='legacy-fallback'){
      assert.equal(rows.length,2);assert.equal(lists.length,3);
      assert.equal(lists[0].useStateDbOnly,true);assert.equal(lists[1].useStateDbOnly,undefined);assert.equal(lists[2].useStateDbOnly,undefined);
    }else{assert.equal(rows,null,'a partial/repeating index must not be reported as complete');assert.equal(lists.length,2);}
  });
}
