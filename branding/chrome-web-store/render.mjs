#!/usr/bin/env node
// Render pixel-accurate Chrome Web Store assets from the real SVG/HTML sources.
// Playwright is a build/QA-only dependency (installed in CI); never shipped to the app.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
];
const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  headless: true,
});
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    try {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const url = pathToFileURL(path.join(here, 'source', job.source)).href;
      await page.goto(url, { waitUntil: 'load' });
      if (job.svg) {
        await page.evaluate(({width, height}) => {
          const svg = document.querySelector('svg');
          if (!svg) throw new Error('Missing SVG root');
          svg.setAttribute('width', String(width));
          svg.setAttribute('height', String(height));
          document.documentElement.style.cssText = 'margin:0;padding:0;background:transparent';
          document.body.style.cssText = 'margin:0;padding:0;background:transparent';
        }, job);
      }
      await page.evaluate(() => document.fonts.ready);
      if (errors.length) throw new Error(`${job.source}: ${errors.join('; ')}`);
      const png = await page.screenshot({ omitBackground: Boolean(job.transparent), animations: 'disabled' });
      for (const dir of job.dirs) await fs.writeFile(path.join(dir, job.name), png);
      console.log(`✓ ${job.name} (${job.width}×${job.height})`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
