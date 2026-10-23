import test from 'node:test';
import assert from 'node:assert/strict';
import { state, applyEvent, applySnapshot } from '../public/js/state.js';
import { api } from '../public/js/api.js';
import { markRead } from '../public/js/views/alerts.js';

function setup(t) {
  const originals = new Map(['requestAnimationFrame', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.requestAnimationFrame = () => 0;
  globalThis.document = { getElementById: () => null };
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}

// Test skutečného handleru s pozdrženou odpovědí, nikoli kopie jeho algoritmu.
test('přečtení upozornění: chyba zápisu nezmění stav ani počet', async (t) => {
  setup(t);
  state.alerts = { unread: 1, items: [{ id: 'a', read: false }] };
  let reject;
  t.mock.method(api, 'readAlerts', () => new Promise((_, no) => { reject = no; }));
  const reading = markRead(['a']);
  assert.equal(state.alerts.items[0].read, false);
  reject(new Error('offline'));
  await reading;
  assert.equal(state.alerts.items[0].read, false);
  assert.equal(state.alerts.unread, 1);
});

test('přečtení upozornění: úspěch potvrdí položku i počet', async (t) => {
  setup(t);
  state.alerts = { unread: 2, items: [{ id: 'a', read: false }, { id: 'b', read: false }] };
  t.mock.method(api, 'readAlerts', async () => ({ unread: 1 }));
  await markRead(['a']);
  assert.deepEqual(state.alerts.items.map((a) => a.read), [true, false]);
  assert.equal(state.alerts.unread, 1);
});

test('přečtení všech: opožděná odpověď nezahodí nové SSE upozornění', async (t) => {
  setup(t);
  state.alerts = { unread: 1, items: [{ id: 'a', read: false }] };
  let resolve;
  t.mock.method(api, 'readAlerts', () => new Promise((yes) => { resolve = yes; }));
  const reading = markRead('all');
  applyEvent('alerts', { unread: 0 });
  applyEvent('alert', { unread: 1, alert: { id: 'new', read: false } });
  resolve({ unread: 0 });
  await reading;
  assert.equal(state.alerts.unread, 1);
  assert.equal(state.alerts.items.find((a) => a.id === 'new').read, false);
  assert.equal(state.alerts.items.find((a) => a.id === 'a').read, true);
});

test('přečtení upozornění: nový snapshot má přednost před starým počtem', async (t) => {
  setup(t);
  state.alerts = { unread: 1, items: [{ id: 'a', read: false }] };
  let resolve;
  t.mock.method(api, 'readAlerts', () => new Promise((yes) => { resolve = yes; }));
  const reading = markRead(['a']);
  applySnapshot({ sessions: [], alerts: { unread: 2, items: [{ id: 'a', read: true }, { id: 'b', read: false }, { id: 'c', read: false }] } });
  resolve({ unread: 0 });
  await reading;
  assert.equal(state.alerts.unread, 2);
  assert.deepEqual(state.alerts.items.map((a) => a.read), [true, false, false]);
});
