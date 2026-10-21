import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { startTestServer, api } from '../test/helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const server = await startTestServer();
const results = [];
await fs.mkdir('dist/qa', { recursive: true });

try {
  await api(server.url).send('PUT', '/api/settings', { welcomeCompleted: true, objevHotovo: true, onboardingDismissed: true, lastSeenVersion: '999.0.0' });
  for (const engine of (process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium', 'webkit'])) {
    const browser = await (engine === 'chromium'
      ? chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
      : webkit.launch());
    try {
      for (const width of [1440, 375]) for (const language of ['cs', 'en']) {
        await api(server.url).send('PUT', '/api/settings', { language });
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        await context.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
        const page = await context.newPage();
        const pageErrors = [];
        const consoleErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        try {
          await page.goto(`${server.url}/#/prehled`);
          await page.locator('.pm-fab').click();
          const ask = async (question, count) => {
            await page.locator('.pm-vstup').fill(question);
            await page.locator('.pm-vstup').press('Enter');
            await page.waitForFunction((n) => document.querySelectorAll('.pm-log .pm-msg--ja').length === n, count);
            await page.waitForFunction((n) => document.querySelectorAll('.pm-log .pm-msg--on:not(.pm-pise)').length === n + 1, count);
          };
          const overview = language === 'cs' ? 'jak tahle app funguje?' : 'How does this app work?';
          for (let i = 1; i <= 5; i++) await ask(overview, i);
          const answer = await page.locator('.pm-log .pm-msg--on').last().innerText();
          assert.match(answer, language === 'cs' ? /Projekty seskupují/ : /Projects group/);
          assert.equal(await page.locator('.pm-log .pm-msg--on').last().locator('.pm-cile').count(), 0, 'overview must not suggest unrelated links');
          assert.ok(await page.locator('.pm-log').evaluate((log) => log.scrollHeight > log.clientHeight + 300), 'chat history must be scrollable');

          // A delayed server answer reproduces a reply arriving while the user reads an older question.
          let release;
          const held = new Promise((resolve) => { release = resolve; });
          await context.route('**/api/pomocnik', async (route) => { await held; await route.continue(); });
          await page.locator('.pm-vstup').fill('najdi chat o qa-neexistujici-tema');
          await page.locator('.pm-vstup').press('Enter');
          await page.locator('.pm-pise').waitFor();
          const box = await page.locator('.pm-log').boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, -2000);
          await page.waitForFunction(() => document.querySelector('.pm-log').scrollTop < 200);
          // Mouse wheel scrolling can still be in flight (especially in WebKit).
          // Fix the user-intended reading location after the gesture settles,
          // then verify both sync re-render and delayed server replies preserve it.
          await page.waitForTimeout(180);
          const reading = await page.locator('.pm-log').evaluate((log) => { log.scrollTop = 0; return log.scrollTop; });
          assert.equal(reading, 0, 'reader is looking at oldest visible chat message');
          await page.evaluate(() => document.dispatchEvent(new CustomEvent('agenteeq:pomocnik')));
          assert.ok(Math.abs((await page.locator('.pm-log').evaluate((log) => log.scrollTop)) - reading) <= 2, 're-render must retain reading position');
          release();
          await page.locator('.pm-pise').waitFor({ state: 'detached' });
          assert.ok(Math.abs((await page.locator('.pm-log').evaluate((log) => log.scrollTop)) - reading) <= 2, 'late reply must retain reading position');

          // Sending a new question deliberately resumes following the conversation.
          await ask(overview, 7);
          const distance = await page.locator('.pm-log').evaluate((log) => log.scrollHeight - log.clientHeight - log.scrollTop);
          assert.ok(distance <= 2, `own message must scroll to bottom (${distance}px)`);
          assert.deepEqual(pageErrors, []);
          assert.deepEqual(consoleErrors, []);
          await context.route('**/api/pomocnik', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
          await ask('najdi chat o nedostupnem hledani', 8);
          assert.match(await page.locator('.pm-log .pm-msg--on').last().innerText(), language === 'cs' ? /Chyba 503/ : /Error 503/);
          const failedDistance = await page.locator('.pm-log').evaluate((log) => log.scrollHeight - log.clientHeight - log.scrollTop);
          assert.ok(failedDistance <= 2, 'failed search reply should follow when the reader was at the bottom');
          assert.deepEqual(pageErrors, [], 'a failed search must not throw in the page');
          assert.ok(consoleErrors.every((message) => /503/.test(message)), `only the deliberately failed HTTP request may appear in the console: ${consoleErrors}`);
          results.push({ engine, width, language, passed: true });
        } catch (error) {
          await page.screenshot({ path: `dist/qa/assistant-${engine}-${width}-${language}-failure.png` }).catch(() => {});
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
console.log(JSON.stringify(results));
