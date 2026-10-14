import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createLiveEventBacklog } from '../public/js/sse-backlog.js';

test('SSE restart: a fresh snapshot cannot be overwritten by previous stream events', () => {
  const backlog = createLiveEventBacklog();
  backlog.begin();
  // Twenty agents and a delayed removal from the previous connection.
  for (let i = 0; i < 20; i++) backlog.add('session', { id: 'old-' + i, status: 'working' });
  backlog.add('session:remove', { id: 'gone' });
  assert.equal(backlog.size, 21);

  // Server restarted. Its snapshot contains only the newer set of agents.
  backlog.begin();
  const visible = new Map(Array.from({ length: 20 }, (_, i) => [
    'new-' + i, { id: 'new-' + i, status: 'working' },
  ]));
  backlog.add('session', { id: 'new-5', status: 'needs_input' });
  backlog.add('session:remove', { id: 'new-6' });
  backlog.drain((type, data) => {
    if (type === 'session') visible.set(data.id, data);
    else if (type === 'session:remove') visible.delete(data.id);
  });

  assert.equal(visible.size, 19);
  assert.equal(visible.get('new-5').status, 'needs_input');
  assert.equal(visible.has('new-6'), false);
  assert.equal([...visible.keys()].some(x => x.startsWith('old-')), false,
    'old events must not resurrect removed agents after reconnection');
  assert.equal(backlog.size, 0);
});

test('SSE backlog preserves arrival order within a single current connection and drains once', () => {
  const q = createLiveEventBacklog();
  q.begin();
  q.add('session', { id: 'one', status: 'working' });
  q.add('session:remove', { id: 'one' });
  q.add('session', { id: 'one', status: 'needs_input' });
  const events = [];
  q.drain((event, data) => events.push([event, data.status || data.id]));
  assert.deepEqual(events, [['session', 'working'], ['session:remove', 'one'], ['session', 'needs_input']]);
  q.drain(() => { throw new Error('drain must not replay an event'); });
  assert.equal(q.size, 0);
});

test('SSE snapshot lifecycle wires begin before fetching and drains only into current state', async () => {
  const src = await fs.readFile(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ createLiveEventBacklog \} from '\.\/sse-backlog\.js'/);
  assert.match(src, /const queued = createLiveEventBacklog\(\)/);
  const hello = src.slice(src.indexOf('  onHello: () => {'), src.indexOf('  onEvent: (name, data) => {'));
  assert.ok(hello.includes('queued.begin();'), 'every new handshake drops old backlog');
  assert.ok(hello.indexOf('queued.begin();') < hello.indexOf('api.state()'),
    'old events must be dropped before fetching fresh state');
  assert.match(src, /queued\.drain\(handle\)/);
  assert.match(src, /if \(!state\.loaded \|\| loadingSnapshot\) queued\.add\(name, data\)/);
});
