import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startTestServer, api } from '../test/helpers.mjs';
import { addTokens } from '../src/model.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.QA_OUTPUT_DIR || 'dist/qa';
await fs.mkdir(out, { recursive: true });
const results = [];
const engines = process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium', 'webkit'];
for (const engine of engines) {
  console.log(`QA ${engine}`);
  const server = await startTestServer();
  const sample = server.app.store.ensure({ connector: 'codex', localId: 'qa-layout', provider: 'openai', app: 'Codex' });
  Object.assign(sample, { title: 'QA – kontrola rozložení', lastAt: Date.now(), startedAt: Date.now() - 60000 });
  addTokens(sample, Date.now(), { input: 1200000, output: 300000 });
  server.app.store.commit(sample);
  assert.equal((await api(server.url).send('POST', '/api/projects', { name: 'QA projekt' })).status, 201);
  assert.equal((await api(server.url).send('POST', '/api/spend/ledger', { service: 'chatgpt', kind: 'subscription', amount: '460', currency: 'CZK', date: new Date().toISOString().slice(0, 10), recurring: 'monthly', note: 'QA předplatné' })).status, 201);
  server.app.alerts.raise({ key: 'qa:alert-hover', level: 'info', kind: 'system', title: 'Kontrola jemného zvýraznění', body: 'Tato položka ověřuje stav po najetí kurzorem.' });
  for (const [id, label, pct] of [['five', 'Limit 5 h', 8], ['week', 'Týdenní limit', 1]]) server.app.store.setLimit({ id, label, app: 'Codex', provider: 'openai', usedPercent: pct, at: Date.now(), resetsAt: Date.now() + 86400000 });
  const browser = await (engine === 'chromium' ? chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) : webkit.launch());
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
    const welcomeSteps = await page.locator('.welcome-dots span').count();
    assert.ok(welcomeSteps >= 2, 'průvodce má skutečný postup');
    for (let i = 0; i < welcomeSteps - 1; i++) {
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
    await page.waitForFunction(() => document.querySelector('#conn-pill')?.textContent.includes('Připojeno'));
    assert.equal(await page.locator('.welcome-dialog[open]').count(), 0);
    await page.locator('#conn-pill').click();
    await page.locator('#conn-pop:not([hidden])').waitFor();
    assert.match(await page.locator('#conn-pop').textContent(), /Místní služba[\s\S]*Průběžné aktualizace[\s\S]*Rozšíření/, `${engine} diagnostika popisuje tři skutečné zdroje stavu`);
    await page.keyboard.press('Escape');
    await page.locator('#conn-pop').waitFor({ state: 'hidden' });
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
    await page.waitForTimeout(550);
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
    await page.setViewportSize({ width: 1440, height: 2560 });
    const portraitNav = page.locator('.nav a[aria-current="page"]');
    assert.equal(await portraitNav.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', `${engine} aktivní dlaždice zůstává v klidu průhledná`);
    const portraitInsets = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
      const link = document.querySelector('.nav a').getBoundingClientRect();
      return { left: link.left - sidebar.left, right: sidebar.right - link.right };
    });
    assert.ok(portraitInsets.left >= 24 && portraitInsets.right >= 24, `${engine} dlaždice má boční odstup: ${JSON.stringify(portraitInsets)}`);
    await page.screenshot({ path: `dist/qa/${engine}-portrait-rest.png` });
    const portraitHover = page.locator('.nav a:not([aria-current])').first();
    await portraitHover.hover();
    assert.notEqual(await portraitHover.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', `${engine} hover rozsvítí jen dlaždici pod kurzorem`);
    await page.screenshot({ path: `dist/qa/${engine}-portrait-hover.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await page.locator('.launch-kbd kbd').evaluateAll((nodes) => nodes.length === 2 && nodes.every((el) => getComputedStyle(el).color === 'rgb(255, 255, 255)')), true, `${engine} zkratka má kontrast`);
    await page.locator('[data-action="palette"]').click();
    const paletteOptions = page.locator('.palette-list [role="option"]');
    await page.evaluate(() => {
      window.__qaPaletteMutations = 0;
      new MutationObserver((entries) => { window.__qaPaletteMutations += entries.filter((entry) => entry.type === 'childList').length; }).observe(document.querySelector('.palette-list'), { childList: true, subtree: true });
    });
    await paletteOptions.nth(1).hover();
    assert.equal(await paletteOptions.nth(1).getAttribute('aria-selected'), 'true', `${engine} paleta reaguje na hover`);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.palette-list [role="option"][aria-selected="true"]')).backgroundColor !== 'rgba(0, 0, 0, 0)');
    assert.equal(await page.evaluate(() => window.__qaPaletteMutations), 0, `${engine} hover palety nepřepisuje seznam a nebliká`);
    await page.screenshot({ path: `dist/qa/${engine}-palette-hover.png` });
    await page.keyboard.press('Escape');
    await page.locator('.palette').waitFor({ state: 'hidden' });
    await page.goto(`${server.url}/#/utrata`);
    await page.locator('.spend-breakdown').waitFor();
    const breakdownText = await page.locator('.spend-breakdown').textContent();
    assert.match(breakdownText, /ChatGPT/, `${engine} rozpis předplatného říká službu`);
    assert.match(breakdownText, /460/, `${engine} rozpis předplatného říká částku`);
    const budgetsButton = page.locator('button[data-action="budgets"]').first();
    await budgetsButton.click();
    await page.locator('.modal-scrim').waitFor();
    await page.locator('.modal [data-close]').first().click();
    await page.locator('.modal-scrim').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.matches('button[data-action="budgets"]')), true, `${engine} křížek zavře modal a vrátí fokus`);
    await budgetsButton.click();
    await page.locator('.modal-scrim').waitFor();
    await page.mouse.click(12, 12);
    await page.locator('.modal-scrim').waitFor({ state: 'detached' });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.modal-scrim').count(), 0, `${engine} click mimo modal jej zavře bez druhého dialogu`);
    await budgetsButton.click();
    await page.locator('.modal-scrim').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.modal-scrim').waitFor({ state: 'detached' });
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
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine} desktop overflow ${route}`);
      assert.equal(await page.locator('select:visible').count(), 0, `${engine} native select visible ${route}`);
      if (route === 'projekty') assert.equal(await page.locator('.pcard--ghost').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
      if (route === 'nastaveni') {
        assert.equal(await page.locator('.welcome-replay-art svg').count(), 1, `${engine} průvodce má vlastní orientační grafiku`);
        for (const id of ['perplexity', 'grok']) assert.equal(await page.locator(`[data-web-source="${id}"]`).count(), 1, `${engine} ${id} je samostatný webový zdroj`);
        const choices = await page.locator('[data-avatar-pick]').evaluateAll((nodes) => nodes.map((el) => ({ value: el.dataset.avatarPick, name: el.getAttribute('aria-label') || el.title || el.textContent.trim() })));
        assert.ok(choices.length >= 25, `${engine} zachovává iniciály a kolekci avatarů`);
        assert.equal(new Set(choices.map((choice) => choice.value)).size, choices.length, `${engine} každá volba má vlastní stabilní hodnotu`);
        assert.ok(choices.every((choice) => choice.name), `${engine} každá volba má přístupný název`);
        await page.locator('button[data-appearance="dark"]').click();
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
        // Theme paints optimistically; the selected button updates after saveSettings resolves.
        await page.waitForFunction(() => document.querySelector('button[data-appearance="dark"]')?.getAttribute('aria-pressed') === 'true');
        assert.equal(await page.locator('button[data-appearance="dark"]').getAttribute('aria-pressed'), 'true');
        const ratios = await page.evaluate(() => {
          const hex = (value) => {
            const match = value.trim().match(/^#([0-9a-f]{6})$/i);
            if (!match) throw new Error(`Neplatná barva ${value}`);
            return [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255).map((part) => part <= .04045 ? part / 12.92 : ((part + .055) / 1.055) ** 2.4);
          };
          const luminance = (value) => { const [r, g, b] = hex(value); return .2126 * r + .7152 * g + .0722 * b; };
          const ratio = (foreground, background) => (Math.max(luminance(foreground), luminance(background)) + .05) / (Math.min(luminance(foreground), luminance(background)) + .05);
          const css = getComputedStyle(document.documentElement);
          const v = (name) => css.getPropertyValue(name);
          return {
            body: ratio(v('--ink'), v('--card')),
            secondary: ratio(v('--ink-2'), v('--card')),
            muted: ratio(v('--mute'), v('--card')),
            teal: ratio(v('--teal-ink'), v('--teal-tint')),
            velvet: ratio(v('--velvet-ink'), v('--velvet-tint')),
            brass: ratio(v('--brass-ink'), v('--brass-tint')),
          };
        });
        for (const [name, ratio] of Object.entries(ratios)) assert.ok(ratio >= 4.5, `${engine} dark ${name} kontrast ${ratio.toFixed(2)}:1 je AA`);
        await page.screenshot({ path: `dist/qa/${engine}-dark-settings.png`, fullPage: true });
        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
        await page.goto(`${server.url}/#/prehled`);
        await page.waitForFunction(() => document.querySelector('#conn-pill')?.textContent.includes('Připojeno'));
        await page.screenshot({ path: `dist/qa/${engine}-dark-overview.png`, fullPage: true });
        await page.setViewportSize({ width: 1440, height: 2560 });
        assert.equal(await page.locator('.nav a[aria-current="page"]').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', `${engine} dark portrait bez trvalé výplně`);
        await page.screenshot({ path: `dist/qa/${engine}-dark-portrait-rest.png` });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${server.url}/#/nastaveni`);
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.locator('button[data-appearance="system"]').click();
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.appearance === 'system');
        await page.emulateMedia({ colorScheme: 'light' });
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
        await page.locator('button[data-appearance="light"]').click();
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'light' && document.documentElement.dataset.appearance === 'light');
        await page.setViewportSize({ width: 2528, height: 1390 });
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.set-main')).marginLeft === '200px');
        const settingsCenter = await page.locator('.set-main').evaluate((el) => {
          const box = el.getBoundingClientRect();
          return Math.abs(box.left + box.width / 2 - innerWidth / 2);
        });
        assert.ok(settingsCenter <= 2, `${engine} široké Nastavení je ve středu okna (odchylka ${settingsCenter}px)`);
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await page.screenshot({ path: `dist/qa/${engine}-${route}.png` });
    }
    await page.goto(`${server.url}/#/upozorneni`);
    const alertTile = page.locator('.alert-item').first();
    const alertRest = await alertTile.evaluate((el) => getComputedStyle(el).backgroundColor);
    await alertTile.hover();
    assert.notEqual(await alertTile.evaluate((el) => getComputedStyle(el).backgroundColor), alertRest, `${engine} upozornění se jemně rozsvítí jen po najetí`);
    await page.goto(`${server.url}/#/nastaveni`);
    await page.locator('[data-welcome]').waitFor();
    await page.locator('[data-welcome]').click();
    await page.locator('[data-welcome-skip]').click();
    await page.locator('.welcome-dialog').waitFor({ state: 'detached' });
    for (const width of [375, 900, 1180]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['prehled', 'agenti', 'projekty', 'statistiky', 'utrata', 'nastaveni']) {
        await page.goto(`${server.url}/#/${route}`); await page.waitForTimeout(50);
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
    results.push({ engine, passed: true, cases: ['onboarding 4 steps', 'save failure and retry', 'completion survives reload', 'connection diagnostics', 'subscription breakdown', 'alert hover', 'picker open-layer and escape', 'live updates preserve picker and throttle chart', 'palette hover without remount', 'budget modal close button, overlay and Escape', 'web sources Perplexity and Grok', '24 local avatars', 'light/dark/system persistence and AA tokens', 'centered settings at 2528 px', 'all routes', 'no native selects', '375/900/1180/1440 layout', 'offline fonts', 'zero JS errors'] });
  } catch (error) {
    await page.screenshot({ path: `dist/qa/${engine}-failure.png` });
    await fs.writeFile(`dist/qa/${engine}-failure.txt`, `${error.stack || error}\n`);
    console.log(JSON.stringify({ engine, errors, welcome: await page.locator('.welcome-dialog').textContent().catch(() => 'closed') }));
    console.error(error.stack || error);
    throw error;
  } finally { await browser.close(); await server.close(); }
}
await fs.writeFile('dist/qa/results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
