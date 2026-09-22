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
// Stránka slibuje, že nic nedotahuje z cizích serverů. Tohle to drží: všechno mimo vlastní
// původ se odmítne a zapíše. Zároveň to brání tomu, aby klik na Stáhnout odvedl kontrolu pryč.
const puvod = new URL(url).origin;
async function jenMistni(page, cizi) {
  await page.route('**/*', (route) => {
    const cil = route.request().url();
    if (cil.startsWith(puvod) || cil.startsWith('data:') || cil.startsWith('blob:')) return route.continue();
    cizi.push(cil);
    return route.abort();
  });
}
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
          const cizi = [];
          await jenMistni(page, cizi);
          page.on('pageerror', e => errors.push(e.message));
          page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
          await page.goto(url);
          await page.evaluate(() => document.fonts.ready);
          assert.equal(await page.locator('h1').count(), 1);
          for (const view of ['projekty', 'utrata', 'prehled']) {
            await page.locator(`[data-tour="${view}"]`).focus();
            await page.keyboard.press('Enter');
            // Prohlídka přepíná skutečné snímky aplikace: musí se vyměnit obrázek i všechny
            // jeho varianty (tmavá, telefon), jinak by si někdo v tmavém režimu prohlížel Přehled
            // s popiskem Útraty.
            const adresy = await page.evaluate(() => [...document.querySelectorAll('#tour-figure [data-vzor]')].map(e => e.srcset || e.getAttribute('src')));
            assert.equal(adresy.every(a => a.includes(view)), true, `${engine} ${theme} ${width}: ${view} → ${adresy.join(', ')}`);
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
          assert.deepEqual(cizi, [], `${engine} ${theme} ${width}: stránka sáhla mimo vlastní server`);
          results.push({ engine, theme, width, passed: true, height: await page.evaluate(() => document.documentElement.scrollHeight) });
          await page.close();
        }
      }
      const staticPage = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
      await jenMistni(staticPage, []);
      await staticPage.goto(url);
      // Bez JavaScriptu musí stránka pořád prodávat: nadpis, snímek produktu i tlačítko ke stažení.
      assert.ok(await staticPage.locator('h1').isVisible(), 'nadpis bez JS');
      assert.ok(await staticPage.locator('#tour-figure img').isVisible(), 'snímek produktu bez JS');
      assert.ok(await staticPage.locator('[data-stahnout="mac-arm64"]').first().isVisible(), 'stažení bez JS');
      await staticPage.locator('#rozsireni summary').click();
      assert.ok(await staticPage.locator('#rozsireni ol').isVisible());
      await staticPage.close();
      const motionPage = await browser.newPage({ reducedMotion: 'no-preference' });
      await jenMistni(motionPage, []);
      // Tlačítko Stáhnout je skutečný odkaz ven. Tady zkoušíme jeho odezvu na stisk, ne stahování,
      // takže odchod ze stránky zastavíme – jinak by kontrola skončila na GitHubu.
      await motionPage.addInitScript(() => addEventListener('click', (e) => {
        if (e.target.closest?.('a[href^="http"]')) e.preventDefault();
      }, true));
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
      // Najetí zvedá, stisk stlačuje. Dvě rozlišitelné odezvy, ne jedna pro obojí.
      await motionPage.waitForFunction(() => {
        const el = document.querySelector('.hero .btn');
        return el.matches(':hover') && new DOMMatrixReadOnly(getComputedStyle(el).transform).f < -0.5;
      });
      await motionPage.mouse.down();
      await motionPage.waitForFunction(() => {
        const el = document.querySelector('.hero .btn');
        const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return el.matches(':active') && matrix.a < 0.99 && matrix.f > -0.5;
      });
      await motionPage.mouse.up();
      await motionPage.locator('[data-tour="projekty"]').click();
      await motionPage.waitForTimeout(900);
      assert.equal(await motionPage.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0, 'No perpetual decorative animation');
      await motionPage.close();
    } finally { await browser.close(); }
  }
  await fs.writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
