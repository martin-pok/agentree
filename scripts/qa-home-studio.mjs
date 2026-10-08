import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pripravUkazku } from './demo-fixture.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = 'dist/home-studio';
await fs.mkdir(out, { recursive: true });
const demo = await pripravUkazku();
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
 const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto(`${demo.url}/#/prehled`);
 await page.locator('.studio-customize').waitFor();
 await page.locator('.guide-toggle').click();
 await page.reload();
 await page.locator('.robot-guide.is-quiet').waitFor();
 await page.locator('.guide-toggle').click();
 await page.evaluate(() => document.fonts.ready);
 await page.waitForTimeout(400);
 assert.equal(await page.locator('.lchip:visible').count(), 0);
 await page.locator('[data-l-prompt]').fill('Ověř navigaci');
 await page.locator('.studio-choice > summary').click();
 await page.locator('[data-agent="codex"]').click();
 assert.equal(await page.locator('[data-l-prompt]').inputValue(), 'Ověř navigaci');
 assert.equal(await page.locator('.studio-choice').getAttribute('open'), null);
 await page.locator('.studio-customize').click();
 await page.locator('[name="nickname"]').fill('Atlas');
 await page.locator('[name="color"]').selectOption('#367b68');
 await page.screenshot({ path: `${out}/personalization.png` });
 await page.locator('.studio-dialog button[type="submit"]').click();
 await page.reload();
 await page.locator('.studio-nickname').filter({ hasText: 'Atlas' }).waitFor();
 await page.locator('[data-l-prompt]').fill('');
 await page.locator('.page-title').click();
 await page.screenshot({ path: `${out}/homepage.png`, fullPage: true });
 if (process.env.CAPTURE_ROBOTS) {
  await fs.mkdir(`${out}/frames`, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (let i = 0; i < 40; i++) {
   await page.locator('.home-live').screenshot({ path: `${out}/frames/${String(i).padStart(3, '0')}.png` });
   await page.waitForTimeout(75);
  }
 }
 for (const width of [1280, 880, 375]) {
  await page.setViewportSize({ width, height: 1000 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
 }
 await page.locator('.home-history > summary').click();
 assert(await page.locator('[data-region="chart"]').isVisible());
 assert.deepEqual(errors, []);
 console.log('PASS: collapsed controls, agent selection, draft preserved, appearance saved after reload, responsive widths, expandable history, no browser errors');
} finally { await browser.close(); await demo.close(); }
