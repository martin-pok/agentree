import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSite } from './build-site.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { out } = await buildSite();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  for (const candidate of [rel, `${rel}/index.html`]) {
    const file = path.resolve(out, candidate);
    if (!file.startsWith(path.resolve(out) + path.sep)) break;
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` }).end(body);
      return;
    } catch { /* Try directory index before sending headers. */ }
  }
  res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const output = 'dist/qa-site';
await fs.mkdir(output, { recursive: true });
const results = [];
try {
  for (const engine of (process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium', 'webkit'])) {
    const browser = await (engine === 'chromium' ? chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) }) : webkit.launch());
    try {
      for (const theme of ['light', 'dark']) {
        for (const width of [360, 375, 768, 900, 1440]) {
          const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce' });
          const errors = [];
          page.on('pageerror', e => errors.push(e.message));
          page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
          await page.goto(url);
          await page.evaluate(() => document.fonts.ready);
          assert.equal(await page.locator('h1').count(), 1);
          for (const [view, title] of [['projects', 'Projekt · nový web'], ['limits', 'Limity a útrata'], ['overview', 'Přehled']]) {
            await page.locator(`[data-tour="${view}"]`).focus();
            await page.keyboard.press('Enter');
            assert.equal(await page.locator('#preview-title').textContent(), title);
            assert.equal(await page.locator('[data-tour][aria-pressed="true"]').count(), 1);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine} ${theme} ${width} ${view}: overflow`);
            assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0, 'reduced motion');
          }
          await page.locator('a[href="#rozsireni"]').click();
          await page.waitForFunction(() => document.getElementById('rozsireni').open);
          assert.equal(await page.locator('#rozsireni').getAttribute('open'), '');
          await page.locator('#rozsireni summary').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('#rozsireni').getAttribute('open'), null);
          const brokenAnchors = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(h.slice(1))));
          assert.deepEqual(brokenAnchors, []);
          const smallText = await page.evaluate(() => [...document.querySelectorAll('p, span, a, button, summary')].filter(e => e.getBoundingClientRect().height && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent.slice(0, 30)));
          assert.deepEqual(smallText, []);
          await page.evaluate(() => scrollTo(0, 0));
          if ([375, 1440].includes(width)) await page.screenshot({ path: `${output}/${engine}-${theme}-${width}.png`, fullPage: true });
          assert.deepEqual(errors, []);
          results.push({ engine, theme, width, passed: true, height: await page.evaluate(() => document.documentElement.scrollHeight) });
          await page.close();
        }
      }
      const staticPage = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
      await staticPage.goto(url);
      assert.ok(await staticPage.locator('#preview-title').isVisible());
      await staticPage.locator('#rozsireni summary').click();
      assert.ok(await staticPage.locator('#rozsireni ol').isVisible());
      await staticPage.close();
      const motionPage = await browser.newPage({ reducedMotion: 'no-preference' });
      await motionPage.goto(url);
      await motionPage.evaluate(() => document.fonts.ready);
      // Nekonečnou smyčku poznáme z jejího zápisu, ne z měření času.
      assert.deepEqual(await motionPage.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming?.().iterations === Infinity).map(a => a.animationName || a.transitionProperty)), [], 'Nekonečná animace');
      // Nástupní animace musí dojet, než začneme klikat. Pod zátěží se Playwrightu
      // prvek jeví ustálený i uprostřed animace (dva snímky se stejným rámečkem),
      // takže bez tohoto čekání test chytal doběh nástupu místo skutečné smyčky.
      await motionPage.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'), null, { timeout: 5000 });
      const button = motionPage.locator('.hero .btn');
      await button.hover();
      await motionPage.waitForFunction(() => {
        const el = document.querySelector('.hero .btn');
        return el.matches(':hover') && new DOMMatrixReadOnly(getComputedStyle(el).transform).f < -0.5;
      });
      await motionPage.mouse.down();
      await motionPage.waitForFunction(() => {
        const el = document.querySelector('.hero .btn');
        const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return el.matches(':active') && Math.abs(matrix.a - 0.98) < 0.001 && Math.abs(matrix.f - 1) < 0.1;
      });
      await motionPage.mouse.up();
      assert.equal(await motionPage.evaluate(() => getComputedStyle(document.body, '::before').animationName), 'none', 'Mesh never animates paint');
      await motionPage.locator('[data-tour="projects"]').click();
      await motionPage.waitForTimeout(900);
      assert.equal(await motionPage.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0, 'No perpetual decorative animation');
      await motionPage.close();
    } finally { await browser.close(); }
  }
  await fs.writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
