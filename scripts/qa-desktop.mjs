import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startTestServer, api } from '../test/helpers.mjs';
import { addTokens } from '../src/model.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
await fs.mkdir('dist/qa', { recursive: true });
const results = [];
for (const engine of ['chromium', 'webkit']) {
  console.log(`QA ${engine}`);
  const server = await startTestServer();
  const sample = server.app.store.ensure({ connector: 'codex', localId: 'qa-layout', provider: 'openai', app: 'Codex' });
  Object.assign(sample, { title: 'QA — kontrola rozložení', lastAt: Date.now(), startedAt: Date.now() - 60000 });
  addTokens(sample, Date.now(), { input: 1200000, output: 300000 });
  server.app.store.commit(sample);
  assert.equal((await api(server.url).send('POST', '/api/projects', { name: 'QA projekt' })).status, 201);
  for (const [id, label, pct] of [['five', 'Limit 5 h', 8], ['week', 'Týdenní limit', 1]]) server.app.store.setLimit({ id, label, app: 'Codex', provider: 'openai', usedPercent: pct, at: Date.now(), resetsAt: Date.now() + 86400000 });
  const browser = await (engine === 'chromium' ? chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }) : webkit.launch());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('500') && !m.text().includes('net::')) errors.push(m.text()); });
  // Prove fonts and UI require no internet.
  await context.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
  try {
    await page.goto(server.url);
    await page.locator('.welcome-dialog[open]').waitFor();
    await page.screenshot({ path: `dist/qa/${engine}-welcome.png` });
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-welcome-next]').click();
      await page.waitForFunction((n) => document.querySelectorAll('.welcome-dots span')[n]?.getAttribute('aria-current') === 'step', i + 1);
    }
    await page.route('**/api/settings', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"QA failure"}' }));
    await page.locator('[data-welcome-next]').click();
    await page.locator('.welcome-error:not([hidden])').waitFor();
    assert.equal(await page.locator('.welcome-dialog[open]').count(), 1);
    await page.unroute('**/api/settings');
    await page.locator('[data-welcome-next]').click();
    await page.locator('.welcome-dialog').waitFor({ state: 'detached' });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#conn-pill')?.textContent.includes('Živě'));
    assert.equal(await page.locator('.welcome-dialog[open]').count(), 0);
    for (const selector of ['.token-card', '.calm']) {
      assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
    }
    const projectPicker = page.locator('[data-l-project] + .picker-trigger');
    assert.ok(await projectPicker.evaluate(el => parseFloat(getComputedStyle(el).paddingRight) >= 16));
    await projectPicker.screenshot({ path: `dist/qa/${engine}-project-picker.png` });
    await projectPicker.click();
    const pickerMenu = page.locator('.picker-menu');
    await pickerMenu.waitFor();
    assert.equal(await projectPicker.evaluate(el => getComputedStyle(el).boxShadow), 'none', `${engine} otevřený picker nekreslí druhý obrys`);
    const [sourceBox, menuBox] = await Promise.all([projectPicker.boundingBox(), pickerMenu.boundingBox()]);
    assert.ok(menuBox.y >= sourceBox.y + sourceBox.height + 6, `${engine} nabídka začíná až pod zdrojem`);
    assert.equal(await pickerMenu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(18, r.height / 2))?.closest('.picker-menu') === el;
    }), true, `${engine} nabídka je v horní vrstvě`);
    await page.screenshot({ path: `dist/qa/${engine}-project-picker-open.png` });
    await page.evaluate(() => {
      const chart = document.querySelector('[data-region="chart"]');
      window.__qaChartMutations = 0;
      new MutationObserver((entries) => { window.__qaChartMutations += entries.length; }).observe(chart, { childList: true, subtree: true });
    });
    for (let i = 0; i < 12; i++) {
      sample.tokens.input += 1;
      sample.hourly[new Date().toISOString().slice(0, 13)] = (sample.hourly[new Date().toISOString().slice(0, 13)] || 0) + 1;
      sample.lastAt = Date.now();
      server.app.store.commit(sample);
      await page.waitForTimeout(35);
    }
    await page.waitForTimeout(650);
    assert.equal(await pickerMenu.count(), 1, `${engine} živá data nezavřou otevřený picker`);
    assert.equal(await projectPicker.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.evaluate(() => window.__qaChartMutations <= 4), `${engine} graf se nepřekresluje při každé živé události`);
    await page.keyboard.press('Escape');
    await pickerMenu.waitFor({ state: 'detached' });
    // Long project names must truncate without pushing the chevron out of the pill.
    await page.evaluate(() => {
      const select = document.querySelector('[data-l-project]');
      select.options[0].textContent = 'Dlouhý název projektu pro kontrolu bezpečného odsazení';
      select.dispatchEvent(new Event('change'));
    });
    assert.ok(await projectPicker.evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.evaluate(() => { const s = document.querySelector('[data-l-project]'); s.options[0].textContent = 'Bez projektu'; s.dispatchEvent(new Event('change')); });
    await page.locator('[data-action="period"] + .picker-trigger').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-action="period"]').inputValue(), 'month');
    await page.locator('[data-action="period"] + .picker-trigger').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.picker-menu').count(), 0);
    await page.screenshot({ path: `dist/qa/${engine}-overview.png`, fullPage: true });
    assert.equal(await page.locator('.launch-kbd kbd').evaluateAll((nodes) => nodes.length === 2 && nodes.every((el) => getComputedStyle(el).color === 'rgb(255, 255, 255)')), true, `${engine} zkratka má kontrast`);
    await page.locator('[data-action="palette"]').click();
    const paletteOptions = page.locator('.palette-list [role="option"]');
    await paletteOptions.nth(1).hover();
    assert.equal(await paletteOptions.nth(1).getAttribute('aria-selected'), 'true', `${engine} paleta reaguje na hover`);
    assert.notEqual(await paletteOptions.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', `${engine} paleta má čitelný hover`);
    await page.screenshot({ path: `dist/qa/${engine}-palette-hover.png` });
    await page.keyboard.press('Escape');
    await page.goto(`${server.url}/#/agent/codex%3Aqa-layout`);
    await page.locator('.gauges--sm .gauge').first().waitFor();
    for (const width of [375, 900, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.locator('.gauges--sm').evaluate(el => [...el.querySelectorAll('.gauge')].every(g => {
        const dial = g.querySelector('.gauge-dial').getBoundingClientRect();
        const value = g.querySelector('.gauge-value').getBoundingClientRect();
        const label = g.querySelector('.gauge-label').getBoundingClientRect();
        const sub = g.querySelector('.gauge-sub').getBoundingClientRect();
        return value.top > dial.top + 16 && value.bottom < dial.bottom - 16 && label.top >= dial.bottom + 7 && sub.top >= label.bottom + 7;
      })), `${engine} ${width} gauge safe zone`);
    }
    await page.locator('.gauges--sm').screenshot({ path: `dist/qa/${engine}-limits-safe-zone.png` });
    for (const route of ['agenti', 'projekty', 'statistiky', 'utrata', 'upozorneni', 'nastaveni']) {
      await page.goto(`${server.url}/#/${route}`);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine} desktop overflow ${route}`);
      assert.equal(await page.locator('select:visible').count(), 0, `${engine} native select visible ${route}`);
      if (route === 'projekty') assert.equal(await page.locator('.pcard--ghost').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
      if (route === 'nastaveni') {
        for (const id of ['perplexity', 'grok']) assert.equal(await page.locator(`[data-web-source="${id}"]`).count(), 1, `${engine} ${id} je samostatný webový zdroj`);
      }
      await page.screenshot({ path: `dist/qa/${engine}-${route}.png` });
    }
    await page.locator('[data-welcome]').click();
    await page.locator('[data-welcome-skip]').click();
    await page.locator('.welcome-dialog').waitFor({ state: 'detached' });
    for (const width of [375, 900, 1180]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['prehled', 'agenti', 'projekty', 'statistiky', 'utrata', 'nastaveni']) {
        await page.goto(`${server.url}/#/${route}`); await page.waitForTimeout(150);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine} ${width} overflow ${route}`);
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('[data-welcome]').click();
    await page.screenshot({ path: `dist/qa/${engine}-welcome-mobile.png` });
    assert.equal(await page.locator('.welcome-dialog').evaluate((el) => el.scrollWidth > el.clientWidth), false);
    await page.locator('[data-welcome-skip]').click();
    await page.locator('.welcome-dialog').waitFor({ state: 'detached' });
    const snapshot = await api(server.url).get('/api/state');
    assert.equal(snapshot.body.settings.welcomeCompleted, true);
    assert.deepEqual(errors, []);
    results.push({ engine, passed: true, cases: ['onboarding 4 steps', 'save failure and retry', 'completion survives reload', 'picker open-layer and escape', 'live updates preserve picker and throttle chart', 'palette hover', 'web sources Perplexity and Grok', 'all routes', 'no native selects', '375/900/1180/1440 layout', 'offline fonts', 'zero JS errors'] });
  } catch (error) {
    await page.screenshot({ path: `dist/qa/${engine}-failure.png` });
    console.log(JSON.stringify({ engine, errors, welcome: await page.locator('.welcome-dialog').textContent().catch(() => 'closed') }));
    throw error;
  } finally { await browser.close(); await server.close(); }
}
await fs.writeFile('dist/qa/results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
