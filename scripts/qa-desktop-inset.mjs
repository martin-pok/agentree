import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { startTestServer, api } from '../test/helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.QA_OUTPUT_DIR || 'dist/qa';
await fs.mkdir(out, { recursive: true });

// Stejný příznak přidává WKWebView při documentStart. Jeho obsah začíná na y=0,
// protože okno má fullSizeContentView; horních 44 px překrývá nativní DragStrip.
for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
  const server = await startTestServer();
  let browser;
  try {
    await api(server.url).send('PUT', '/api/settings', {
      welcomeCompleted: true, objevHotovo: true, onboardingDismissed: true, lastSeenVersion: '999.0.0',
    });
    browser = await launcher.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(() => {
      window.agenteeqDesktop = true;
      // Playwright spouští init script dřív než AppKitův WKUserScript; kořen může ještě chybět.
      if (document.documentElement) document.documentElement.classList.add('is-desktop');
      else document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('is-desktop'), { once: true });
    });
    await context.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [width, height] of [[1440, 900], [1000, 700], [900, 620], [880, 620], [375, 812]]) {
      await page.setViewportSize({ width, height });
      for (const route of ['prehled', 'agenti', 'nastaveni']) {
        await page.goto(`${server.url}/#/${route}`);
        await page.locator('#view > *').first().waitFor({ state: 'attached' });
        await page.waitForFunction(() => document.querySelector('.page-title')?.textContent?.trim().length > 0);
        await page.evaluate(() => document.fonts.ready);
        const m = await page.evaluate(() => {
          const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
          const title = rect('.page-title');
          const actions = [...document.querySelector('.topbar-actions').children]
            .filter((el) => getComputedStyle(el).display !== 'none' && !el.hidden)
            .map((el) => el.getBoundingClientRect());
          const sidebar = rect('.sidebar');
          const main = document.querySelector('.main');
          return {
            inset: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--desktop-top-inset')),
            padding: parseFloat(getComputedStyle(main).paddingTop),
            sidebarTop: sidebar.top,
            sidebarBottom: sidebar.bottom,
            // Tlačítko zpět stojí na telefonu na vlastním řádku nad nadpisem – hlavička pak začíná jím.
            titleTop: Math.min(title.top, ...[document.querySelector('#page-back:not([hidden])')].filter(Boolean).map((el) => el.getBoundingClientRect().top)),
            titleBottom: title.bottom,
            actions: actions.map(({ top, bottom, left, right }) => ({ top, bottom, left, right })),
            title: { left: title.left, right: title.right },
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            // Nastavení: viditelné karty (první skupina) a jejich vztah k akcím vpravo nahoře.
            cards: [...document.querySelectorAll('.set-group:not([hidden]) .set-card')]
              .filter((el) => getComputedStyle(el).display !== 'none')
              .map((el) => el.getBoundingClientRect()).map(({ top, bottom, left, right }) => ({ top, bottom, left, right })),
          };
        });
        const where = `${engine} ${width}×${height} ${route}`;
        assert.equal(m.inset, 44, `${where}: společný inset odpovídá nativnímu DragStripu`);
        assert.ok(m.padding >= m.inset, `${where}: hlavní obsah začíná v titulkovém pruhu (${m.padding} px)`);
        assert.ok(m.titleTop >= m.inset - 1, `${where}: nadpis zasahuje do titulkového pruhu (${m.titleTop} px)`);
        assert.ok(m.actions.every((r) => r.top >= m.inset - 1), `${where}: akce zasahují do titulkového pruhu`);
        assert.ok(m.actions.every((r) => r.top >= m.titleBottom - 1 || r.left >= m.title.right - 1 || r.right <= m.title.left + 1), `${where}: akce překrývají nadpis`);
        if (width > 880) {
          assert.ok(Math.abs(m.sidebarTop - m.padding) <= 1, `${where}: panel a obsah nemají společný začátek (${m.sidebarTop}/${m.padding})`);
        } else {
          assert.ok(m.sidebarBottom <= height + 1, `${where}: spodní navigace je mimo okno`);
        }
        assert.ok(m.overflow <= 1, `${where}: vodorovné přetékání ${m.overflow} px`);
        if (route === 'nastaveni') {
          // Lepivá lišta se dřív lepila o --band-h + 56 px níž, než kde v toku stojí, a v aplikaci
          // pro Mac tak sjela o 100 px přes první kartu Propojení.
          assert.ok(Math.abs(m.titleTop - m.padding) <= 2, `${where}: nadpis Nastavení se při otevření posunul (${m.titleTop}/${m.padding})`);
          const kolize = m.cards.filter((c) => m.actions.some((a) => c.top < a.bottom && c.bottom > a.top && c.left < a.right && c.right > a.left));
          assert.equal(kolize.length, 0, `${where}: karta Nastavení zasahuje pod akce vpravo nahoře`);
          // Dvě skupiny voleb v Aktualizacích: vybrané karty se obrysy nesmí dotknout.
          await page.locator('.set-nav [data-jump="set-aplikace"]').click();
          const mezery = await page.evaluate(() => [...document.querySelectorAll('[data-region="updates"] .set-choice')]
            .map((el) => el.getBoundingClientRect())
            .flatMap((r, i, all) => i ? [r.top - all[i - 1].bottom] : []));
          assert.ok(mezery.length >= 1 && mezery.every((d) => d >= 16), `${where}: skupiny voleb Aktualizací jsou nalepené (${mezery})`);
        }
        if (route === 'prehled' && [1440, 900, 375].includes(width)) {
          await page.screenshot({ path: `${out}/${engine}-desktop-inset-${width}.png` });
        }
      }
    }
    // Ochrana sousedních režimů: běžný web nemá macOS titlebar a Windows ho má mimo WebView.
    for (const [mode, expectedMain, expectedSidebar] of [['web', 32, 12], ['windows', 32, 0]]) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      if (mode === 'windows') await other.addInitScript(() => {
        window.agenteeqDesktop = true;
        document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('is-desktop', 'is-windows'), { once: true });
      });
      await other.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
      const p = await other.newPage();
      p.on('pageerror', (error) => errors.push(error.message));
      await p.goto(`${server.url}/#/prehled`);
      await p.locator('#view > *').first().waitFor({ state: 'attached' });
      const measured = await p.evaluate(() => ({
        main: parseFloat(getComputedStyle(document.querySelector('.main')).paddingTop),
        sidebar: document.querySelector('.sidebar').getBoundingClientRect().top,
      }));
      assert.equal(measured.main, expectedMain, `${engine} ${mode}: horní odstup`);
      assert.equal(measured.sidebar, expectedSidebar, `${engine} ${mode}: začátek panelu`);
      await other.close();
    }
    assert.deepEqual(errors, [], `${engine}: chyby skriptů`);
    await context.close();
    console.log(`${engine}: horní inset, Přehled, Agenti a Nastavení na 375–1440 px prošly`);
  } finally {
    await browser?.close();
    await server.close();
  }
}
