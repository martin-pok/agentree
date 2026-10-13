import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (p) => fs.readFile(new URL('../' + p, import.meta.url));

test('Vercel has a true root favicon.ico generated from the official Agenteeq robot mark', async () => {
  const ico = await read('site/favicon.ico');
  assert.ok(ico.length > 500 && ico.length < 100_000, 'small nonempty favicon for Vercel project auto-detection');
  assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved header');
  assert.equal(ico.readUInt16LE(2), 1, 'real ICO image type');
  assert.equal(ico.readUInt16LE(4), 1, 'one approved icon, not a stale mixed icon set');
  assert.equal(ico[6], 32, '32×32 web/Vercel icon');
  assert.equal(ico[7], 32);
  assert.equal(ico.subarray(22, 30).toString('hex'), '89504e470d0a1a0a', 'ICO embeds a PNG image');
  const mark = (await read('public/brand/agenteeq-mark-dark.svg')).toString('utf8');
  assert.match(mark, /oficiální široká hlava robota/);
  assert.match(mark, /<rect x="15" y="34" width="78" height="53" rx="20"\/>/, 'single official rounded robot head');
  assert.doesNotMatch(mark, /trident|trojzubec|three.prong/i);
});

test('every site variant and the embedded web app links matching root ICO and brand SVG', async () => {
  const files = [
    'site/index.html', 'site/en/index.html', 'site/instalace/index.html',
    'site/en/install/index.html', 'site/soukromi/index.html',
    'site/en/privacy/index.html', 'public/index.html',
  ];
  for (const path of files) {
    const html = (await read(path)).toString('utf8');
    assert.match(html, /<link rel="icon" type="image\/x-icon" sizes="32x32" href="\/favicon\.ico">/, path);
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/brand\/agenteeq-mark-dark\.svg">/, path);
  }
});
