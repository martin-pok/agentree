// Vizuální regresní kontrola načítací scény bez přístupu ke skutečným přepisům.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loaderHtml } from '../public/js/loader.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve('public');
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, ''));
  if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
  try {
    const body = await fs.readFile(file);
    const type = file.endsWith('.css') ? 'text/css' : 'font/ttf';
    res.writeHead(200, { 'Content-Type': type }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
await fs.mkdir('dist/qa-loader', { recursive: true });
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      for (const theme of ['light', 'dark']) for (const width of [375, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 680 }, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setContent(`<!doctype html><html data-theme="${theme}"><head>
          <link rel="stylesheet" href="${url}/fonts/fonts.css">
          <link rel="stylesheet" href="${url}/styles.css">
          <link rel="stylesheet" href="${url}/loader.css">
          <style>body{margin:0;background:var(--paper)}main{min-height:100vh;display:grid;place-items:center}</style>
          </head><body><main>${loaderHtml('Načítám agenty…')}</main></body></html>`);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('.loader-scene').isVisible(), true);
        assert.equal(await page.locator('[role="status"]').innerText(), 'Načítám agenty…');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.loader-text')).fontSize) >= 12), true);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `dist/qa-loader/${name}-${theme}-${width}.png` });
        await page.close();
      }
    } finally { await browser.close(); }
  }
  console.log('Načítací scéna: Chromium + WebKit, světlý/tmavý režim, 375/1440 px ✓');
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
