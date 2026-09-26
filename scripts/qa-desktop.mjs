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
    // Nabídka na monitoru na výšku musí vypadat stejně jako na šířku – jinak uživatel přechází
    // mezi dvěma různými aplikacemi podle toho, jak má otočený monitor.
    const vzhledNabidky = () => page.evaluate(() => {
      const aktivni = document.querySelector('.nav a[aria-current="page"]');
      const bezny = [...document.querySelectorAll('.nav a')].find((a) => !a.hasAttribute('aria-current'));
      const st = (el, pseudo) => { const c = getComputedStyle(el, pseudo); return [c.backgroundColor, c.color, c.fontWeight, c.fontSize, c.borderRadius, c.padding, c.width].join('|'); };
      const sb = document.querySelector('.sidebar').getBoundingClientRect();
      const r = bezny.getBoundingClientRect();
      return { aktivni: st(aktivni), bezny: st(bezny), pruh: st(aktivni, '::before'), odstup: `${Math.round(r.left - sb.left)}/${Math.round(sb.right - r.right)}` };
    });
    const naSirku = await vzhledNabidky();
    await page.setViewportSize({ width: 1440, height: 2560 });
    await page.waitForTimeout(400);
    const naVysku = await vzhledNabidky();
    for (const klic of ['aktivni', 'bezny', 'odstup']) {
      assert.equal(naVysku[klic], naSirku[klic], `${engine} nabídka na výšku (${klic}) vypadá jinak než na šířku`);
    }
    assert.equal(naVysku.pruh.split('|')[0], naSirku.pruh.split('|')[0], `${engine} označení aktivní stránky má jinou barvu`);
    assert.equal(await page.evaluate(() => { const a = [...document.querySelectorAll('.nav a')].map((x) => x.getBoundingClientRect()); return a.some((x, i) => i && x.top < a[i - 1].bottom - 0.5); }), false, `${engine} položky nabídky se překrývají`);
    assert.equal(await page.evaluate(() => { const n = document.querySelector('.nav'); return n.scrollHeight > n.clientHeight + 1; }), false, `${engine} nabídka se na výšku musí vejít bez rolování`);
    await page.screenshot({ path: `dist/qa/${engine}-portrait-rest.png` });
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
    // Nabídka a kalendář v modálním okně (aria-modal) musí být uvnitř něj – co je mimo, prohlížeč
    // vyřadí ze stromu přístupnosti a čtečka obrazovky položky nepřečte. getByRole to vidí stejně.
    await page.locator('.toolbar button[data-action="add"]').click();
    await page.locator('.modal-scrim').waitFor();
    await page.locator('.modal button.picker-trigger[aria-label^="Služba"]').click();
    assert.ok(await page.getByRole('option').count() >= 10, `${engine} položky nabídky v okně jsou dostupné čtečce`);
    await page.getByRole('option', { name: 'Claude', exact: true }).click();
    assert.equal(await page.locator('.modal button.picker-trigger[aria-label^="Služba"]').getAttribute('aria-label'), 'Služba: Claude');
    // Vybraná položka se jmenuje jen „Claude“ – fajfka z CSS do názvu pro čtečku nepatří.
    await page.locator('.modal button.picker-trigger[aria-label^="Služba"]').click();
    assert.equal(await page.getByRole('option', { name: 'Claude', exact: true, selected: true }).count(), 1, `${engine} vybraná položka nemá v názvu fajfku`);
    await page.keyboard.press('Escape');
    await page.locator('.modal button.dd-date').click();
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.dd-cal')?.closest('.modal'))), true, `${engine} kalendář je uvnitř okna`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.dd-cal').count(), 0, `${engine} Esc zavře kalendář`);
    assert.equal(await page.locator('.modal-scrim').count(), 1, `${engine} Esc v kalendáři nezavře celé okno`);
    await page.keyboard.press('Escape');
    await page.locator('.modal-scrim').waitFor({ state: 'detached' });
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
        for (const id of ['perplexity', 'grok']) assert.equal(await page.locator(`[data-web-source="${id}"]`).count(), 1, `${engine} ${id} je samostatný webový zdroj`);
        const choices = await page.locator('[data-avatar-pick]').evaluateAll((nodes) => nodes.map((el) => ({ value: el.dataset.avatarPick, name: el.getAttribute('aria-label') || el.title || el.textContent.trim() })));
        assert.ok(choices.length >= 25, `${engine} zachovává iniciály a kolekci avatarů`);
        assert.equal(new Set(choices.map((choice) => choice.value)).size, choices.length, `${engine} každá volba má vlastní stabilní hodnotu`);
        assert.ok(choices.every((choice) => choice.name), `${engine} každá volba má přístupný název`);
        await page.click('.set-nav [data-jump="set-ucet"]'); // vzhled je ve skupině Účet a vzhled
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
        const tmavaSirka = await page.locator('.nav a[aria-current="page"]').evaluate((el) => getComputedStyle(el).backgroundColor);
        await page.setViewportSize({ width: 1440, height: 2560 });
        await page.waitForTimeout(300);
        assert.equal(await page.locator('.nav a[aria-current="page"]').evaluate((el) => getComputedStyle(el).backgroundColor), tmavaSirka, `${engine} tmavý režim na výšku mění vzhled aktivní položky`);
        await page.screenshot({ path: `dist/qa/${engine}-dark-portrait-rest.png` });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${server.url}/#/nastaveni`);
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.click('.set-nav [data-jump="set-ucet"]');
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
    // Menu Nastavení přepíná skupiny a nic se přitom nehne: nadpis, menu ani stránka. Dřív klik
    // posunul stránku ke kotvě a nadpis „Nastavení“ odjel z obrazovky.
    for (const [sirka, vyska] of [[1440, 900], [375, 812]]) {
      await page.setViewportSize({ width: sirka, height: vyska });
      await page.goto(`${server.url}/#/nastaveni`);
      await page.reload();
      await page.locator('.settings2').waitFor();
      await page.waitForFunction(() => document.querySelector('#conn-pill')?.textContent.includes('Připojeno'));
      await page.waitForTimeout(300);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      const poloha = () => page.evaluate(() => ({
        y: scrollY,
        nadpis: Math.round(document.getElementById('page-title').getBoundingClientRect().top),
        menu: Math.round(document.querySelector('.set-nav').getBoundingClientRect().top),
      }));
      const pred = await poloha();
      const skupiny = await page.$$eval('.set-nav [data-jump]', (b) => b.map((x) => x.dataset.jump));
      for (const skupina of [...skupiny.slice(1), skupiny[0]]) {
        await page.click(`.set-nav [data-jump="${skupina}"]`);
        await page.waitForTimeout(100);
        assert.deepEqual(await poloha(), pred, `${engine} ${sirka}: klik na ${skupina} v menu Nastavení pohnul stránkou`);
        assert.deepEqual(await page.$$eval('.set-group', (g) => g.filter((x) => !x.hidden).map((x) => x.id)), [skupina], `${engine} ${sirka}: ${skupina} neukázala svou skupinu`);
        assert.equal(await page.getAttribute(`.set-nav [data-jump="${skupina}"]`, 'aria-current'), 'true');
      }
      // Posunutý dolů v dlouhé skupině: menu zůstane, kde je, a nová skupina začne u něj.
      await page.evaluate(() => scrollTo({ top: 700, behavior: 'instant' }));
      await page.waitForTimeout(100);
      const menuPred = (await poloha()).menu;
      await page.click(`.set-nav [data-jump="${skupiny[1]}"]`);
      await page.waitForTimeout(100);
      const po = await page.evaluate(() => ({
        menu: Math.round(document.querySelector('.set-nav').getBoundingClientRect().top),
        skupina: Math.round(document.querySelector('.set-group:not([hidden])').getBoundingClientRect().top),
      }));
      assert.equal(po.menu, menuPred, `${engine} ${sirka}: posunuté menu Nastavení se po kliknutí pohnulo`);
      assert.ok(po.skupina >= 0 && po.skupina < vyska / 2, `${engine} ${sirka}: nová skupina nezačíná u menu (${po.skupina} px)`);
      await page.click(`.set-nav [data-jump="${skupiny.at(-1)}"]`);
      // Skok na kartu rozšíření odjinud (průvodce, „Co je nového“) ukáže její skupinu.
      await page.evaluate(() => { sessionStorage.setItem('agenteeq.jump', 'extension'); window.dispatchEvent(new Event('agenteeq-jump')); });
      await page.waitForFunction(() => !document.querySelector('[data-region="extension"]').closest('.set-group').hidden, null, { timeout: 3000 });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Plynulé posouvání (public/js/plynule-posouvani.js). Hlavní kontext běží s „omezit pohyb“,
    // kde se zapnout nesmí; na počítači bez omezení krok kolečka dojede plynule a přesně, hover
    // efekty se během posouvání vypnou a klik hned po posunu projde, zamčená stránka se nehne
    // a cizí posun (přepnutí obrazovky volá scrollTo) má před dojezdem přednost.
    assert.equal(await page.evaluate(() => 'plynule' in document.documentElement.dataset), false, `${engine}: plynulé posouvání se zapnulo i s „omezit pohyb“`);
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
      await ctx.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`plynulé posouvání: ${e.message}`));
      await p.goto(`${server.url}/#/nastaveni`);
      await p.locator('.settings2').waitFor();
      assert.equal(await p.evaluate(() => 'plynule' in document.documentElement.dataset), true, `${engine}: plynulé posouvání se v aplikaci nezapnulo`);
      // Karty Nastavení se plní až po prvním vykreslení; do té doby je stránka krátká.
      await p.waitForFunction(() => document.documentElement.scrollHeight - innerHeight > 1000, null, { timeout: 5000 })
        .catch(() => { throw new Error(`${engine}: Nastavení jsou na zkoušku posouvání krátká`); });
      await p.mouse.move(900, 500);
      const vzorky = p.evaluate(() => new Promise((hotovo) => {
        const v = [];
        let posouva = false;
        const t0 = performance.now();
        (function f() {
          v.push(scrollY);
          if (document.documentElement.classList.contains('is-scrolling')) posouva = true;
          if (performance.now() - t0 < 1500) requestAnimationFrame(f); else hotovo({ v, posouva });
        })();
      }));
      await p.mouse.wheel(0, 400);
      const { v, posouva } = await vzorky;
      const konec = v.at(-1);
      const mezi = new Set(v.filter((y) => y > 2 && y < konec - 2).map(Math.round)).size;
      assert.ok(Math.abs(konec - 400) <= 2, `${engine}: kolečko 400 px v aplikaci dojelo na ${konec}`);
      assert.ok(mezi >= 5, `${engine}: posun kolečkem v aplikaci neběžel plynule (mezipoloh ${mezi})`);
      assert.ok(v.every((y, i) => i === 0 || y >= v[i - 1] - 0.5), `${engine}: dojezd v aplikaci se vracel`);
      assert.ok(posouva, `${engine}: během posouvání chybí html.is-scrolling (hover efekty se nevypnou)`);
      await p.waitForFunction(() => !document.documentElement.classList.contains('is-scrolling'));
      // Klik hned po posunu musí projít. Dřív obsah během posouvání vypínal ukazatel a WebKit, který
      // při kliknutí posune prvek do okna, klik pustil do prázdna (<main> zachytil ukazatel).
      const skladaci = p.locator('.view details.src-fold > summary').first();
      const bylOtevreny = await skladaci.evaluate((el) => el.parentElement.open);
      await skladaci.scrollIntoViewIfNeeded();
      await p.mouse.wheel(0, 60);
      await p.waitForTimeout(40);
      await skladaci.click({ force: true, timeout: 3000 }); // bez čekání na „klikatelnost“ – přesně jako člověk
      assert.equal(await skladaci.evaluate((el) => el.parentElement.open), !bylOtevreny, `${engine}: klik hned po posunu kolečkem nezabral`);
      await p.waitForFunction(() => !document.documentElement.classList.contains('is-scrolling'));

      await p.locator('[data-action="palette"]').click();
      await p.waitForFunction(() => document.body.classList.contains('has-modal'));
      const predZamkem = await p.evaluate(() => scrollY);
      await p.mouse.move(60, 860); // pozadí vyhledávání, ne jeho seznam – ten si kolečko vezme sám
      await p.mouse.wheel(0, 400);
      await p.waitForTimeout(400);
      assert.equal(await p.evaluate(() => scrollY), predZamkem, `${engine}: stránka pod otevřeným vyhledáváním dojížděla`);
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => !document.body.classList.contains('has-modal'));

      await p.mouse.wheel(0, 1200);
      await p.waitForTimeout(60);
      await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0); document.documentElement.style.scrollBehavior = ''; });
      await p.waitForTimeout(600);
      assert.equal(await p.evaluate(() => scrollY), 0, `${engine}: dojezd přepsal posun, který udělala aplikace`);
      await ctx.close();
    }
    assert.deepEqual(errors, []);
    results.push({ engine, passed: true, cases: ['onboarding 4 steps', 'save failure and retry', 'completion survives reload', 'picker open-layer and escape', 'live updates preserve picker and throttle chart', 'palette hover without remount', 'budget modal close button, overlay and Escape', 'web sources Perplexity and Grok', '24 local avatars', 'light/dark/system persistence and AA tokens', 'centered settings at 2528 px', 'all routes', 'no native selects', '375/900/1180/1440 layout', 'smooth wheel scrolling', 'offline fonts', 'zero JS errors'] });
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
