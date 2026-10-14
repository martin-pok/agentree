import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { containPopoverWheel } from '../public/js/scroll-containment.js';

function interaction({ top, delta, height = 200, scrollHeight = 600, hidden = false, ctrlKey = false, inside = true }) {
  const list = { scrollTop: top, clientHeight: height, scrollHeight };
  const host = { hidden, contains(el) { return el === list; } };
  let blocked = 0;
  const e = {
    deltaY: delta, ctrlKey,
    target: { closest() { return inside ? list : null; } },
    preventDefault() { blocked++; },
  };
  return { handled: containPopoverWheel(host, e), blocked };
}

test('notification list contains scroll at either boundary but leaves middle scrolling native', () => {
  assert.deepEqual(interaction({ top: 0, delta: -5 }), { handled: true, blocked: 1 });
  assert.deepEqual(interaction({ top: 400, delta: 8 }), { handled: true, blocked: 1 });
  assert.deepEqual(interaction({ top: 1, delta: -1 }), { handled: true, blocked: 1 });
  assert.deepEqual(interaction({ top: 399.8, delta: 5 }), { handled: true, blocked: 1 });
  assert.deepEqual(interaction({ top: 220, delta: -9 }), { handled: false, blocked: 0 });
  assert.deepEqual(interaction({ top: 220, delta: 8 }), { handled: false, blocked: 0 });
  assert.deepEqual(interaction({ top: 0, delta: 0 }), { handled: false, blocked: 0 });
  assert.deepEqual(interaction({ top: 0, delta: -1, ctrlKey: true }), { handled: false, blocked: 0 },
    'do not interfere with wheel-based browser zoom');
  assert.deepEqual(interaction({ top: 0, delta: -1, hidden: true }), { handled: false, blocked: 0 });
  assert.deepEqual(interaction({ top: 0, delta: 5, inside: false }), { handled: true, blocked: 1 },
    'wheel on popover header/footer must never propagate to background');
  assert.deepEqual(interaction({ top: 0, delta: 1, scrollHeight: 100 }), { handled: true, blocked: 1 },
    'a non-scrollable short notification list must not move the page');
});

test('native app popover installs a non-passive wheel boundary handler', async () => {
  const js = await fs.readFile(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(js, /pop\.addEventListener\('wheel', \(event\) => containPopoverWheel\(pop, event\), \{ passive: false \}\)/);
  assert.match(css, /\.notif-pop \{ overscroll-behavior: contain; \}/);
  assert.match(css, /\.pop-list \{[^}]*overscroll-behavior: contain;/);
});

test('account sign-out needs affirmative action; delete stays separately danger-confirmed', async () => {
  const src = await fs.readFile(new URL('../public/js/views/settings.js', import.meta.url), 'utf8');
  const start = src.indexOf("a.dataset.action === 'ucet-odhlasit'");
  const stop = src.indexOf("a.dataset.action === 'ucet-smazat'", start);
  assert.ok(start >= 0 && stop > start);
  const block = src.slice(start, stop);
  assert.match(block, /if \(await confirmDialog\(/);
  assert.match(block, /title: tr\('Odhlásit se'\)/);
  assert.match(block, /await api\.ucetOdhlasit\(\)/);
  assert.ok(block.indexOf('confirmDialog') < block.indexOf('api.ucetOdhlasit()'), 'no sign-out on cancel');
  assert.match(src.slice(stop, stop + 560), /if \(await confirmDialog\(\{ title: tr\('Smazat účet Agenteeq'\)/);
  const en = await fs.readFile(new URL('../public/js/i18n/en.js', import.meta.url), 'utf8');
  assert.match(en, /"Odhlášením se vypne synchronizace souhrnů\./);
});
