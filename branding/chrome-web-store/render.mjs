#!/usr/bin/env node
// Render pixel-accurate Chrome Web Store assets from the real SVG/HTML sources.
// Playwright is a build/QA-only dependency (installed in CI); never shipped to the app.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(here, 'export');
const icons = path.join(root, 'extension', 'icons');
await fs.mkdir(out, { recursive: true });
await fs.mkdir(icons, { recursive: true });
const jobs = [
  { source: 'icon.svg', width: 128, height: 128, name: 'icon-128.png', dirs: [out, icons], svg: true, transparent: true },
  { source: 'icon.svg', width: 48, height: 48, name: 'icon-48.png', dirs: [icons], svg: true, transparent: true },
  { source: 'icon.svg', width: 32, height: 32, name: 'icon-32.png', dirs: [icons], svg: true, transparent: true },
  { source: 'icon-16.svg', width: 16, height: 16, name: 'icon-16.png', dirs: [icons], svg: true, transparent: true },
  { source: 'promo-small.html', width: 440, height: 280, name: 'promo-small-440x280.png', dirs: [out] },
  { source: 'marquee.html', width: 1400, height: 560, name: 'marquee-1400x560.png', dirs: [out] },
  { source: 'promo-small.html', width: 440, height: 280, name: 'promo-small-440x280.png', dirs: [path.join(out, 'en')], lang: 'en' },
  { source: 'marquee.html', width: 1400, height: 560, name: 'marquee-1400x560.png', dirs: [path.join(out, 'en')], lang: 'en' },
];
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROME
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROME }
    : {}),
  headless: true,
});
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    try {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const url = pathToFileURL(path.join(here, 'source', job.source)).href;
      await page.goto(url + (job.lang ? '?lang=en' : ''), { waitUntil: 'load' });
      if (job.svg) {
        await page.evaluate(({width, height}) => {
          const svg = document.querySelector('svg');
          if (!svg) throw new Error('Missing SVG root');
          svg.setAttribute('width', String(width));
          svg.setAttribute('height', String(height));
          document.documentElement.style.cssText = 'margin:0;padding:0;background:transparent';
          if (document.body) document.body.style.cssText = 'margin:0;padding:0;background:transparent';
        }, job);
      }
      await page.evaluate(() => document.fonts.ready);
      if (errors.length) throw new Error(`${job.source}: ${errors.join('; ')}`);
      // Headless Chromium can transiently reject Page.captureScreenshot on a loaded page.
      // Retry exactly once for that transport error; never swallow render failures
      // or relax the canonical-SVG pixel comparison below.
      let png;
      try {
        png = await page.screenshot({ omitBackground: Boolean(job.transparent), animations: 'disabled' });
      } catch (error) {
        if (!/Page\\.captureScreenshot|Unable to capture screenshot/.test(String(error))) throw error;
        console.warn(`Chromium screenshot transport retry: ${job.name}`);
        await page.waitForTimeout(200);
        png = await page.screenshot({ omitBackground: Boolean(job.transparent), animations: 'disabled' });
      }
      let published = png;
      if (job.svg) {
        // The extension ZIP is built from tracked, approved raster icons on release
        // runners. Re-rendering those icons with a different Chromium version
        // changed four PNGs and produced a DIFFERENT Store ZIP for the very same
        // v0.46.8 tag. Never silently replace release icons during Store QA.
        // Do still compare each checked-in icon to the current canonical SVG:
        // significant drift is a hard error and requires deliberate re-export.
        published = await fs.readFile(path.join(icons, job.name));
        const { mean, width, height } = await page.evaluate(async ({ original, generated }) => {
          const pixels = async (base64) => {
            const image = new Image();
            image.src = 'data:image/png;base64,' + base64;
            await image.decode();
            // This page is image/svg+xml; createElement('canvas') would create an SVG element.
            const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(image, 0, 0);
            return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
          };
          const a = await pixels(original), b = await pixels(generated);
          if (a.width !== b.width || a.height !== b.height) throw new Error('PNG icon dimensions differ from SVG rendering');
          let total = 0;
          for (let i = 0; i < a.data.length; i++) total += Math.abs(a.data[i] - b.data[i]);
          return { mean: total / a.data.length, width: a.width, height: a.height };
        }, { original: published.toString('base64'), generated: png.toString('base64') });
        const maxDelta = job.width <= 16 ? 6 : job.width <= 32 ? 4 : job.width <= 48 ? 3 : 2;
        if (width !== job.width || height !== job.height || mean > maxDelta) {
          throw new Error(`Approved icon ${job.name} differs from canonical SVG (${mean.toFixed(2)} RGBA units); re-export and review all sizes explicitly`);
        }
      }
      for (const dir of job.dirs) {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, job.name), published);
      }
      console.log(`✓ ${job.name} (${job.width}×${job.height}) ${job.svg ? '[canonical approved bytes; SVG visually checked]' : ''}`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
