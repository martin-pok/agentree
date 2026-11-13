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
  await api(server.url).send('PUT', '/api/settings', { welcomeCompleted: true, objevHotovo: true, onboardingDismissed: true, lastSeenVersion: '999.0.0' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  await context.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${server.url}/#/prehled`);
  await page.locator('#refresh-app').waitFor();
  // The button exists in the HTML before the app's event delegation and first
  // server snapshot have finished initializing. Clicking that static button
  // immediately after navigation races startup and can silently do nothing.
  // Require a live connection first; then the refresh click tests real behavior.
  await page.waitForFunction(() => document.querySelector('#conn-pill .dot--live'), null, { timeout: 10000 });

  let requests = 0;
  let nacteni = 1;
  page.on('load', () => { nacteni += 1; });
  await page.route('**/api/connectors/rescan', async (route) => {
    requests += 1;
    // Server „pracuje“ 1,5 s: kontroly závoje proběhnou před skutečným přenačtením stránky.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  const response = page.waitForResponse((r) => r.url().endsWith('/api/connectors/rescan') && r.request().method() === 'POST');
  // Obnova končí přenačtením stránky. Na nové stránce je chvíle, kdy tlačítko ještě nemá aria-busy
  // a závoj ještě nevznikl – čekání jen na tyto podmínky pak prošlo dřív, než přišel `load`
  // (CI #410). Proto se na skutečné načtení nové stránky čeká výslovně.
  const prenacteno = page.waitForEvent('load', { timeout: 20000 });
  await page.locator('#refresh-app').click();
  // Myš teď zachytí závoj; druhé kliknutí se proto pošle přímo tlačítku – i tak nesmí spustit druhou obnovu.
  await page.locator('#refresh-app').dispatchEvent('click');
  await page.waitForFunction(() => document.querySelector('#refresh-app')?.getAttribute('aria-busy') === 'true');
  // Obnova se ukazuje přes celou aplikaci: závoj v barvě značky s bílou hlavou robota a odleskem.
  // Po dobu obnovy zachytí myš s kurzorem „pracuji“ (vlastník 11. 11. 2026). Žádný pruh.
  const tlacitko = page.locator('#refresh-app');
  await page.waitForFunction(() => document.querySelector('.obnova-zavoj.is-on'));
  assert.equal(await page.locator('.obnova-zavoj .obnova-hlava').isVisible(), true, 'uprostřed je hlava robota');
  assert.equal(await page.locator('.obnova-zavoj').evaluate((el) => getComputedStyle(el).pointerEvents), 'auto', 'závoj po dobu obnovy zachytí myš');
  assert.equal(await page.locator('.obnova-zavoj').evaluate((el) => getComputedStyle(el).cursor), 'progress', 'kurzor ukazuje, že se pracuje');
  assert.equal(await page.locator('.refresh-status, .refresh-status__track, .topbar [role="progressbar"]').count(), 0, 'žádný pruh ani karta');
  assert.equal(await page.locator('.obnova-zavoj[role="status"]').filter({ hasText: 'Obnovuji aktuální data' }).count(), 1, 'čtečka obrazovky stav slyší');
  assert.notEqual(await page.locator('.oz-lesk').evaluate((el) => getComputedStyle(el).animationName), 'none', 'odlesk se pohybuje');
  const rozmer = await tlacitko.evaluate((el) => [el.offsetWidth, el.offsetHeight]);
  assert.equal(await page.locator('#refresh-app').isDisabled(), false, 'tlačítko obnovy nesmí při práci změnit velikost ani přijít o fokus');
  await page.screenshot({ path: `${out}/refresh-motion.png` });
  assert.equal((await response).status(), 200);
  await prenacteno;
  await page.waitForFunction(() => !document.querySelector('#refresh-app')?.hasAttribute('aria-busy'));
  await page.waitForFunction(() => !document.querySelector('.obnova-zavoj'));
  // Obnova je skutečné přenačtení stránky; po něm přijde souhrn: co se změnilo, nebo že je vše aktuální.
  assert.ok(nacteni >= 2, 'stránka se po obnově opravdu načetla znovu');
  await page.waitForFunction(() => /Vše je aktuální|Aktualizováno/.test(document.body.innerText));
  assert.deepEqual(await tlacitko.evaluate((el) => [el.offsetWidth, el.offsetHeight]), rozmer, 'tlačítko nemění rozměr');
  assert.equal(requests, 1, 'opakované kliknutí nesmí spustit souběžnou obnovu');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedResponse = page.waitForResponse((r) => r.url().endsWith('/api/connectors/rescan') && r.request().method() === 'POST');
  await page.locator('#refresh-app').click();
  await page.waitForFunction(() => document.querySelector('#refresh-app')?.getAttribute('aria-busy') === 'true');
  assert.equal(await page.locator('.oz-lesk').evaluate((element) => getComputedStyle(element).animationName), 'none', 'omezený pohyb vypne odlesk');
  await reducedResponse;
  await page.waitForFunction(() => !document.querySelector('#refresh-app')?.hasAttribute('aria-busy'));
  assert.deepEqual(errors, [], `chyby prohlížeče: ${errors.join('; ')}`);
  await context.close();
  console.log(JSON.stringify({ passed: true, screenshot: `${out}/refresh-motion.png` }));
} finally {
  await browser.close();
  await server.close();
}
