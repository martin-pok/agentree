import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pripravUkazku } from './demo-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = 'dist/robot-app';
await fs.mkdir(out, { recursive: true });
const demo = await pripravUkazku();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const errors = [];
const checks = [];
try {
 const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce', serviceWorkers: 'block', timezoneId: 'Europe/Prague' });
 page.on('pageerror', e => errors.push(e.message));
 async function capture(name) {
   await page.evaluate(() => document.fonts.ready);
   await page.waitForTimeout(600);
   await page.screenshot({ path: `${out}/${name}.png` });
   await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
   checks.push({ name, title: await page.locator('h1').innerText(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
   assert(!checks.at(-1).overflow, `${name}: horizontal overflow`);
   console.log(`Captured ${name}`);
 }
 for (const route of ['prehled', 'agenti', 'projekty', 'statistiky', 'utrata', 'upozorneni', 'dovednosti', 'nastaveni']) {
   await page.goto(`${demo.url}/#/${route}`);
   await capture(route);
   if (route === 'agenti') {
     await page.locator('.card.table a.row').first().click();
     await capture('detail-agenta');
   }
   if (route === 'projekty') {
     await page.locator('.pgrid a.pcard').first().click();
     await capture('detail-projektu');
   }
 }
 await page.locator('[data-jump="set-ucet"]').click();
 await page.locator('[data-region="appearance"]').scrollIntoViewIfNeeded();
 await capture('vzhled');
 assert.deepEqual(errors, []);
 await fs.writeFile(`${out}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
} finally { await browser.close(); await demo.close(); }
