import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Execute the actual app callback with a deterministic clock: browser SSE can
// report a failed retry every two seconds while the service remains offline.
async function harness() {
  const source = await fs.readFile(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function onConnection(s)');
  const end = source.indexOf("offlineEl.addEventListener('click'", start);
  assert.ok(start >= 0 && end > start);
  let now = 0, nextId = 0;
  const timers = new Map();
  const offlineEl = { hidden: true };
  const shownAt = [];
  const context = vm.createContext({
    state: { connection: 'live' }, offlineTimer: null, offlineEl,
    setTimeout(fn, delay) { timers.set(++nextId, { at: now + delay, fn }); return nextId; },
    clearTimeout(id) { timers.delete(id); },
    renderOffline(show) { offlineEl.hidden = !show; if (show) shownAt.push(now); },
    updateChrome() {},
  });
  vm.runInContext(source.slice(start, end), context);
  return {
    status: context.onConnection, offlineEl, shownAt,
    advance(ms) {
      const until = now + ms;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = until;
    },
  };
}

test('offline notice appears four seconds into an outage despite repeated SSE retries', async () => {
  const h = await harness();
  h.status('reconnecting');
  h.advance(2000); h.status('reconnecting');
  h.advance(1999); assert.equal(h.offlineEl.hidden, true);
  h.advance(1); assert.equal(h.offlineEl.hidden, false);
  for (let i = 0; i < 5; i++) { h.status('offline'); h.advance(2000); }
  assert.deepEqual(h.shownAt, [4000], 'retries must neither delay nor repeatedly redraw the notice');
  h.status('live'); assert.equal(h.offlineEl.hidden, true);
});

test('recovery cancels the pending notice and a later outage gets its own grace period', async () => {
  const h = await harness();
  h.status('reconnecting'); h.advance(3000); h.status('live');
  h.advance(5000);
  assert.equal(h.offlineEl.hidden, true);
  assert.deepEqual(h.shownAt, []);
  h.status('offline'); h.advance(3999);
  assert.equal(h.offlineEl.hidden, true);
  h.advance(1); assert.equal(h.offlineEl.hidden, false);
  assert.deepEqual(h.shownAt, [12000]);
});
