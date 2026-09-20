import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve('extension');
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
await fs.mkdir('dist/qa-extension', { recursive: true });
const results = [];
try {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await (engine === 'chromium' ? chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) : webkit.launch());
    try {
      for (const theme of ['light', 'dark']) for (const state of ['offline', 'unpaired', 'revoked', 'paired', 'outdated']) {
        const page = await browser.newPage({ viewport: { width: 344, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(({ state }) => {
          const data = { disabledSites: [], lastStatus: { ok: true, site: 'chatgpt', at: Date.now() } };
          window.fixture = { data, paired: ['paired', 'outdated'].includes(state), fail: true };
          window.chrome = {
            storage: { local: { get: async () => data, set: async o => Object.assign(data, o) } },
            runtime: { getManifest: () => ({ version: '0.12.0' }), sendMessage: async m => {
              if (m.type === 'agenteeq:pair') {
                if (fixture.fail) return { ok: false, error: 'Kód vypršel. Vytvoř nový v aplikaci.' };
                fixture.paired = true; return { ok: true };
              }
              return { paired: fixture.paired, revoked: state === 'revoked', status: { expectedVersion: state === 'outdated' ? '0.13.0' : '0.12.0' } };
            } },
          };
          window.fetch = async () => { if (state === 'offline') throw new Error('offline'); return new Response(JSON.stringify({ ok: true })); };
        }, { state });
        await page.goto(`http://127.0.0.1:${server.address().port}/popup.html`);
        await page.waitForFunction(() => document.getElementById('headline').textContent !== 'Chvilku…');
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        // Chrome zobrazí z okna rozšíření nejvýš 600 px. Vyšší okno se posouvá a stav i spárování
        // zmizí pod okrajem – změřeno ve skutečném Chromu, proto to hlídá test.
        const vyska = await page.evaluate(() => document.body.getBoundingClientRect().height);
        assert.ok(vyska <= 600, `${engine} ${theme} ${state}: okno má ${Math.round(vyska)} px, Chrome ukáže jen 600`);
        assert.equal(await page.locator('input[type=checkbox]').count(), 9);
        // Přepínače služeb se nabízejí, až rozšíření posílá data; jinde je karta schovaná.
        const sluzbyVidet = await page.locator('#sites-card').isVisible();
        assert.equal(sluzbyVidet, ['paired', 'outdated'].includes(state), `${state}: viditelnost seznamu služeb`);
        if (sluzbyVidet) {
          await page.locator('input[type=checkbox]').first().focus();
          await page.keyboard.press('Space');
          assert.ok(await page.evaluate(() => fixture.data.disabledSites.includes('chatgpt')));
        }
        if (['unpaired', 'revoked'].includes(state)) {
          await page.locator('#code').fill('bad'); await page.locator('#pair').click();
          assert.equal(await page.locator('#code').getAttribute('aria-invalid'), 'true');
          await page.locator('#code').fill('abcdefghijklmnop'); await page.locator('#pair').click();
          await page.waitForFunction(() => document.getElementById('pair-msg').textContent.includes('vypršel'));
          await page.evaluate(() => { fixture.fail = false; }); await page.locator('#pair').click();
          await page.waitForFunction(() => document.getElementById('pairing').hidden);
          assert.ok((await page.locator('#pill-text').textContent()).includes('Připojeno'));
        }
        if (state === 'offline') assert.ok((await page.locator('#headline').textContent()).includes('neběží'));
        if (state === 'outdated') assert.equal(await page.locator('#outdated').isVisible(), true);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `dist/qa-extension/${engine}-${theme}-${state}.png`, fullPage: true });
        results.push({ engine, theme, state, passed: true }); await page.close();
      }
    } finally { await browser.close(); }
  }
  await fs.writeFile('dist/qa-extension/results.json', JSON.stringify(results, null, 2));
  console.log(`${results.length} popup scenarios passed; Chrome APIs mocked, live vendor selectors not verified.`);
} finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
