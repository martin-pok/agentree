#!/usr/bin/env node
// Snímky obrazovky pro Chrome Web Store (1280 × 800, povinný aspoň jeden, nejvýš pět).
//
// Nic se nekreslí od ruky: okno rozšíření se vykreslí ze skutečného extension/popup.html (stejná
// atrapa API Chromu jako scripts/qa-extension.mjs) a výřez aplikace je skutečné rozhraní se
// smyšlenými daty z webu (site/detail). Kompozice je v source/snimek-*.html, výstup v export/.
//
//   PLAYWRIGHT_PATH=/cesta/k/playwright node branding/chrome-web-store/snimky.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const TYPY = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

// Jeden server pro celé repo: kompozice odkazují na /extension, /site/detail a /public/fonts.
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, `.${decodeURIComponent(new URL(req.url, 'http://x').pathname)}`);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  // Nejdřív načíst, až pak odpovědět – chybějící soubor musí dostat 404, ne rozbitou odpověď.
  const obsah = await fs.readFile(file).catch(() => null);
  if (!obsah) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPY[path.extname(file)] || 'application/octet-stream' }).end(obsah);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
const vystup = path.join(here, 'export');
const zdroj = path.join(here, 'source');

// 1) Okno rozšíření ve dvou stavech, dvojnásobné rozlišení (v kompozici se zmenší – ostré písmo).
//    „spárováno“: na stránce ChatGPT agent právě odpovídá, v dalších kartách Claude.ai dopsal
//    a Gemini narazil na limit. „služby“: nastavení sledovaných služeb, Grok vypnutý.
async function okno(stav, soubor) {
  const page = await browser.newPage({ viewport: { width: 344, height: 600 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const ted = Date.now();
    const data = { disabledSites: ['grok'], lastStatus: { ok: true, site: 'claude', at: ted - 180000 } };
    const otevrene = {
      'chatgpt:a': { site: 'chatgpt', tab: 1, okno: 1, generating: true, od: ted - 42000, at: ted },
      'claude:b': { site: 'claude', tab: 2, okno: 1, generating: false, konec: ted - 180000, at: ted - 60000 },
      'gemini:c': { site: 'gemini', tab: 3, okno: 1, generating: false, limit: true, at: ted - 30000 },
    };
    window.chrome = {
      storage: { local: { get: async () => data, set: async (o) => Object.assign(data, o) }, session: { get: async () => ({ otevrene }), set: async () => {} } },
      runtime: { getManifest: () => ({ version: '0.28.1' }), sendMessage: async () => ({ paired: true, revoked: false, status: { expectedVersion: '0.28.1' } }) },
      tabs: { query: async () => [{ id: 1 }], sendMessage: async (_t, m) => (m.type === 'agenteeq:diagnostika' ? { site: 'chatgpt', konverzace: 'adresa', pole: 'presne', zpravy: { user: 6, assistant: 5, zdroj: 'presne' }, generuje: true, limit: false, videl: { generovani: true, konec: false } } : null) },
    };
    window.fetch = async () => new Response(JSON.stringify({ ok: true }));
  });
  await page.goto(`${base}/extension/popup.html`);
  await page.waitForFunction(() => document.getElementById('headline').textContent !== 'Chvilku…');
  await page.waitForFunction(() => document.querySelector('.radek--tato'));
  if (stav === 'sluzby') await page.locator('#sites-open').click();
  await page.mouse.move(0, 0); // kurzor nad řádkem by ho na snímku zvýraznil
  await page.evaluate(() => document.fonts.ready);
  const vyska = Math.ceil(await page.evaluate(() => document.body.getBoundingClientRect().height));
  await page.screenshot({ path: path.join(zdroj, soubor), clip: { x: 0, y: 0, width: 344, height: vyska } });
  await page.close();
  return vyska;
}

try {
  const vysky = { paired: await okno('sparovano', 'okno-sparovano.png'), sluzby: await okno('sluzby', 'okno-sluzby.png') };
  // 2) Kompozice přesně 1280 × 800, poměr 1:1 (obchod jiné rozměry odmítne).
  for (const n of [1, 2, 3]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const chyby = [];
    page.on('pageerror', (e) => chyby.push(e.message));
    page.on('requestfailed', (r) => chyby.push(`${r.url()} ${r.failure()?.errorText}`));
    await page.goto(`${base}/branding/chrome-web-store/source/snimek-${n}.html?paired=${vysky.paired}&sluzby=${vysky.sluzby}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const preteka = await page.evaluate(() => [...document.querySelectorAll('.canvas *')].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width && (r.right > 1280.5 || r.bottom > 800.5 || r.left < -0.5 || r.top < -0.5);
    }));
    if (chyby.length || preteka) throw new Error(`snímek ${n}: ${preteka ? 'obsah přetéká plátno' : chyby.join('; ')}`);
    await page.screenshot({ path: path.join(vystup, `snimek-${n}-1280x800.png`), clip: { x: 0, y: 0, width: 1280, height: 800 } });
    console.log(`✓ snimek-${n}-1280x800.png`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
