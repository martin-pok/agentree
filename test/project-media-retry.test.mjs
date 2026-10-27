import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
globalThis.document = { addEventListener() {}, documentElement: { dataset: {} }, querySelectorAll: () => [] };
globalThis.CSS = { escape: (s) => s };
const { prednactiMedia, projectCover } = await import('../public/js/projects-ui.js');
const project = { id: 'retry', cover: { file: 'cover.png' } };
const images = [];
class ImageMock extends EventTarget {
  complete = false;
  naturalWidth = 0;
  set src(url) { this.url = url; images.push(this); }
  get src() { return this.url; }
  decode() { return Promise.resolve(); }
  fail() { this.complete = true; this.dispatchEvent(new Event('error')); }
  load() { this.complete = true; this.naturalWidth = 100; this.dispatchEvent(new Event('load')); }
}
globalThis.Image = ImageMock;

test('project media recovers after a transient failure and reloads a broken rendered image', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const rendered = { complete: true, naturalWidth: 0, classList: { add() { assert.fail('broken image must reload before reveal'); } } };
  document.querySelectorAll = () => [rendered];
  prednactiMedia([project]);
  assert.equal(images.length, 1);
  images[0].fail();
  t.mock.timers.tick(1000);
  assert.equal(images.length, 2);
  images[1].load();
  await Promise.resolve();
  assert.equal(rendered.src, images[1].src);
  assert.match(projectCover(project), /is-nacteno/);
  prednactiMedia([project]);
  assert.equal(images.length, 2, 'successful cached image is reused');
  prednactiMedia([]);
});

test('retry is bounded, can restart on a fresh snapshot and stops for removed projects', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  images.length = 0;
  prednactiMedia([project]);
  images[0].fail();
  t.mock.timers.tick(1000);
  images[1].fail();
  t.mock.timers.tick(2000);
  images[2].fail();
  t.mock.timers.tick(60000);
  assert.equal(images.length, 3, 'permanent error cannot cause a retry loop');
  prednactiMedia([project]);
  assert.equal(images.length, 4, 'a fresh snapshot retries an exhausted URL');
  images[3].fail();
  prednactiMedia([]);
  t.mock.timers.tick(60000);
  assert.equal(images.length, 4, 'removed project cancels pending retry');
});
