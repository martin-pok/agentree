import test from 'node:test';
import assert from 'node:assert/strict';
import { plynulePosouvani } from '../public/js/plynule-posouvani.js';

// Regression for main CI 38896211040: WebKit under load delivered sparse
// requestAnimationFrame callbacks; the wheel stopped at 383 instead of 400px.
// Simulate 4fps without relaxing the browser's exact-destination assertion.
test('wheel reaches exact destination even with throttled 250ms WebKit frames', () => {
  const keys = ['document', 'window', 'navigator', 'innerHeight', 'scrollY',
    'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame',
    'addEventListener', 'getComputedStyle', 'scrollTo'];
  const saved = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = new Map();
  const frames = new Map();
  let nextFrame = 0;
  const body = {};
  const html = { dataset: {}, style: { scrollBehavior: '' }, scrollHeight: 3000 };
  const define = (key, value) => Object.defineProperty(globalThis, key, {
    configurable: true, enumerable: true, writable: true, value,
  });
  try {
    define('document', { body, documentElement: html });
    define('window', { agenteeqDesktop: false });
    define('navigator', { maxTouchPoints: 0 });
    define('innerHeight', 900);
    define('scrollY', 0);
    define('matchMedia', (query) => ({
      matches: query.includes('(hover: hover)'),
      addEventListener() {},
    }));
    define('requestAnimationFrame', (callback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    define('cancelAnimationFrame', (id) => frames.delete(id));
    define('addEventListener', (name, callback) => {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    });
    define('getComputedStyle', () => ({ overflowY: 'visible' }));
    define('scrollTo', (_x, y) => { globalThis.scrollY = y; });

    plynulePosouvani();
    assert.equal('plynule' in html.dataset, true);
    let prevented = false;
    const event = {
      target: body, deltaX: 0, deltaY: 400, deltaMode: 0,
      defaultPrevented: false, ctrlKey: false, metaKey: false,
      preventDefault() { prevented = true; },
    };
    for (const listener of listeners.get('wheel') || []) listener(event);
    assert.equal(prevented, true, 'a large desktop wheel uses controlled easing');
    let previous = 0;
    for (let time = 250; time <= 1750; time += 250) {
      const [id, callback] = frames.entries().next().value || [];
      if (!callback) break;
      frames.delete(id);
      callback(time);
      assert.ok(globalThis.scrollY >= previous, 'scroll must never reverse');
      previous = globalThis.scrollY;
    }
    assert.equal(Math.round(globalThis.scrollY), 400,
      'throttled WebKit must still reach the requested 400px');
    assert.equal(frames.size, 0, 'animation should settle without pending frames');
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
