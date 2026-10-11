import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, JAZYKY, INSTALACE, preloadPrimarnihoPisma, hlavickyWebu } from '../scripts/build-site.mjs';
import { tempDir } from './helpers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROUTES = [
  { file: 'site/index.html', output: 'index.html', url: 'https://agentree-fawn.vercel.app/', lang: 'cs' },
  { file: 'site/en/index.html', output: 'en/index.html', url: 'https://agentree-fawn.vercel.app/en', lang: 'en' },
  { file: 'site/instalace/index.html', output: 'instalace/index.html', url: 'https://agentree-fawn.vercel.app/instalace', lang: 'cs' },
  { file: 'site/en/install/index.html', output: 'en/install/index.html', url: 'https://agentree-fawn.vercel.app/en/install', lang: 'en' },
  { file: 'site/soukromi/index.html', output: 'soukromi/index.html', url: 'https://agentree-fawn.vercel.app/soukromi', lang: 'cs' },
  { file: 'site/en/privacy/index.html', output: 'en/privacy/index.html', url: 'https://agentree-fawn.vercel.app/en/privacy', lang: 'en' },
];

test('web font preload targets the actual Satoshi WOFF2, never the unused Urbanist TTF', async () => {
  for (const route of ROUTES) {
    const original = await fs.readFile(path.join(ROOT, route.file), 'utf8');
    assert.doesNotMatch(original, /rel="preload"[^>]*urbanist-500\.ttf/i, route.file);
    assert.equal(preloadPrimarnihoPisma(original, false), original, 'fallback build cannot preload missing font');
    const prepared = preloadPrimarnihoPisma(original, true);
    assert.match(prepared, /rel="preload" href="\/fonts\/satoshi\/Satoshi-Variable\.woff2" as="font" type="font\/woff2" crossorigin/);
    assert.equal((preloadPrimarnihoPisma(prepared, true).match(/Satoshi-Variable\.woff2/g) || []).length, 1,
      'font hint must be idempotent');
  }
});

test('built landing and install pages do not request nonexistent fonts', async () => {
  const out = await tempDir('site-perf-');
  const result = await buildSite({ out });
  const hasFont = result.files.includes('fonts/satoshi/Satoshi-Variable.woff2');
  for (const { output } of ROUTES) {
    const html = await fs.readFile(path.join(out, output), 'utf8');
    const preload = html.includes('href="/fonts/satoshi/Satoshi-Variable.woff2"');
    assert.equal(preload, hasFont, output);
    assert.doesNotMatch(html, /rel="preload"[^>]*\.ttf/i, output);
  }
});

test('every indexable page has unique canonical, consistent Open Graph URL and language', async () => {
  const sitemap = await fs.readFile(path.join(ROOT, 'site/sitemap.xml'), 'utf8');
  const seen = new Set();
  for (const route of ROUTES) {
    const html = await fs.readFile(path.join(ROOT, route.file), 'utf8');
    assert.match(html, new RegExp('<html lang="' + route.lang + '"'));
    const canonical = html.match(/<link rel="canonical" href="([^"]+)">/g) || [];
    assert.equal(canonical.length, 1, 'one canonical per document: ' + route.file);
    assert.ok(html.includes('<link rel="canonical" href="' + route.url + '">'));
    assert.ok(html.includes('<meta property="og:url" content="' + route.url + '">'));
    assert.ok(sitemap.includes('<loc>' + route.url + '</loc>'), 'sitemap missing ' + route.url);
    assert.equal((html.match(/<meta name="description"/g) || []).length, 1);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title && title.length >= 18 && !seen.has(title), 'missing or duplicated title');
    seen.add(title);
    assert.ok(html.includes('hreflang="cs"') && html.includes('hreflang="en"'), 'cross-language mapping');
    assert.doesNotMatch(html, /<meta name="robots" content="noindex"/i);
  }
});

test('above-fold screenshot is high-priority; offscreen screenshots are lazy and sized', async () => {
  for (const route of ROUTES.slice(0, 2)) {
    const html = await fs.readFile(path.join(ROOT, route.file), 'utf8');
    const images = [...html.matchAll(/<img\b[^>]*src="\/detail\/[^"]+"[^>]*>/g)].map(x => x[0]);
    assert.ok(images.length >= 2);
    assert.match(images[0], /fetchpriority="high"/);
    assert.doesNotMatch(images[0], /loading="lazy"/);
    for (const img of images) {
      assert.match(img, /width="\d+"/);
      assert.match(img, /height="\d+"/);
      assert.match(img, /alt="[^"]+"/);
    }
    for (const img of images.slice(1)) assert.match(img, /loading="lazy"/);
  }
});

test('static budgets guard marketing page against heavy regressions', async () => {
  const budgets = [
    ['site/lp.css', 180_000], ['site/lp.js', 25_000],
    ['site/detail/prehled.webp', 180_000], ['site/detail/prehled-en.webp', 180_000],
    ['site/detail/prehled-mobil.webp', 130_000], ['site/detail/prehled-mobil-en.webp', 130_000],
  ];
  for (const [name, max] of budgets) {
    const stat = await fs.stat(path.join(ROOT, name));
    assert.ok(stat.size <= max, name + ' exceeds transfer-size budget: ' + stat.size + ' > ' + max);
  }
  const js = await fs.readFile(path.join(ROOT, 'site/lp.js'), 'utf8');
  assert.match(js, /scena\.addEventListener\('pointermove'/);
  assert.match(js, /scenaViditelna/);
  assert.doesNotMatch(js, /(?:window\.)?addEventListener\('pointermove'/);
});

test('browser can conditionally revalidate unchanged JS and CSS rather than redownload', async () => {
  const headers = await hlavickyWebu();
  for (const uri of ['/lp.js', '/lp.css', '/js/app.js', '/sw.js']) {
    assert.equal(headers(uri)['Cache-Control'], 'public, max-age=0, must-revalidate', uri);
  }
});
