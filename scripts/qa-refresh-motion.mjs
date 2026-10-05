import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startTestServer, api } from '../test/helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.QA_OUTPUT_DIR || 'dist/qa';
await fs.mkdir(out, { recursive: true });

const launch = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
  : {};
const server = await startTestServer();
const browser = await chromium.launch(launch);

try {
  await api(server.url).send('PUT', '/api/settings', { welcomeCompleted: true, onboardingDismissed: true, lastSeenVersion: '999.0.0' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  await context.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${server.url}/#/prehled`);
  await page.locator('#refresh-app').waitFor();

  let requests = 0;
  await page.route('**/api/connectors/rescan', async (route) => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.continue();
  });
  const response = page.waitForResponse((r) => r.url().endsWith('/api/connectors/rescan') && r.request().method() === 'POST');
  await page.locator('#refresh-app').click();
  await page.locator('#refresh-app').click();
  await page.waitForFunction(() => document.querySelector('#refresh-app')?.getAttribute('aria-busy') === 'true');
  const moving = await page.locator('#refresh-app .icon').evaluate((element) => ({
    name: getComputedStyle(element).animationName,
    running: element.getAnimations().some((animation) => animation.playState === 'running'),
  }));
  assert.deepEqual(moving, { name: 'refresh-rotation', running: true }, 'ikona obnovy musí při načítání plynule rotovat');
  assert.equal(await page.locator('#refresh-app').isDisabled(), false, 'tlačítko obnovy nesmí při práci změnit velikost ani přijít o fokus');
  await page.screenshot({ path: `${out}/refresh-motion.png` });
  assert.equal((await response).status(), 200);
  await page.waitForFunction(() => !document.querySelector('#refresh-app')?.hasAttribute('aria-busy'));
  assert.equal(requests, 1, 'opakované kliknutí nesmí spustit souběžnou obnovu');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedResponse = page.waitForResponse((r) => r.url().endsWith('/api/connectors/rescan') && r.request().method() === 'POST');
  await page.locator('#refresh-app').click();
  await page.waitForFunction(() => document.querySelector('#refresh-app')?.getAttribute('aria-busy') === 'true');
  assert.equal(await page.locator('#refresh-app .icon').evaluate((element) => getComputedStyle(element).animationName), 'none', 'omezený pohyb nesmí nechat rotaci běžet');
  await reducedResponse;
  await page.waitForFunction(() => !document.querySelector('#refresh-app')?.hasAttribute('aria-busy'));
  assert.deepEqual(errors, [], `chyby prohlížeče: ${errors.join('; ')}`);
  await context.close();
  console.log(JSON.stringify({ passed: true, screenshot: `${out}/refresh-motion.png` }));
} finally {
  await browser.close();
  await server.close();
}
