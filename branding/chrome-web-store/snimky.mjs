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
import { unexpectedScreenshotFailures } from './request-qa.mjs';
import { otevriOkno, OKNO } from '../../scripts/qa-rozsireni.mjs';

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

// 1) Okno rozšíření ve třech stavech, dvojnásobné rozlišení (v kompozici se zmenší – ostré písmo).
//    Vykreslí se ze skutečného extension/popup.html se stejnou atrapou a ukázkovými daty jako QA
//    (scripts/qa-rozsireni.mjs): „spárováno“ = rušno (rozhodnutí v reflektoru, časová osa),
//    „služby“ = list sledovaných služeb, „odpojeno“ = aplikace neběží. Česky i anglicky.
async function okno(stav, soubor, jazyk) {
  const mapa = { sparovano: 'rušno', sluzby: 'služby', odpojeno: 'neběží' };
  const page = await otevriOkno(browser, `${base}/extension`, mapa[stav], { jazyk, deviceScaleFactor: 2 });
  await page.mouse.move(0, 0); // kurzor nad řádkem by ho na snímku zvýraznil
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(zdroj, soubor), clip: { x: 0, y: 0, width: OKNO.width, height: OKNO.height } });
  await page.close();
  return OKNO.height;
}

try {
  for (const jazyk of ['cs', 'en']) {
  const pripona = jazyk === 'cs' ? '' : `-${jazyk}`;
  const vysky = {
    paired: await okno('sparovano', `okno-sparovano${pripona}.png`, jazyk),
    sluzby: await okno('sluzby', `okno-sluzby${pripona}.png`, jazyk),
    odpojeno: await okno('odpojeno', `okno-odpojeno${pripona}.png`, jazyk),
  };
  const cil = jazyk === 'cs' ? vystup : path.join(vystup, jazyk);
  await fs.mkdir(cil, { recursive: true });
  // 2) Kompozice přesně 1280 × 800, poměr 1:1 (obchod jiné rozměry odmítne).
  for (const n of [1, 2, 3]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const chyby = [];
    const selhanePozadavky = [];
    page.on('pageerror', (e) => chyby.push(e.message));
    page.on('requestfailed', (r) => selhanePozadavky.push({
      url: r.url(), kind: r.resourceType(), error: r.failure()?.errorText,
    }));
    await page.goto(`${base}/branding/chrome-web-store/source/snimek-${n}.html?lang=${jazyk}&paired=${vysky.paired}&sluzby=${vysky.sluzby}&odpojeno=${vysky.odpojeno}`);
    await page.evaluate(() => document.fonts.ready);
    // Switching lang=en replaces the original Czech <img> URL on the same page.
    // Chromium cancels the obsolete fetch with ERR_ABORTED; this is expected,
    // but a missing/unreadable FINAL image is never acceptable for Store media.
    try {
      await page.waitForFunction(() => document.images.length > 0
        && [...document.images].every((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
        null, { timeout: 8000 });
    } catch {
      const images = await page.evaluate(() => [...document.images].map((img) => ({
        src: img.currentSrc || img.src, complete: img.complete, width: img.naturalWidth, height: img.naturalHeight,
      })));
      throw new Error(`snímek ${n}: požadované obrázky nejsou dekódované: ${JSON.stringify(images)}`);
    }
    await page.waitForTimeout(200);
    const { preteka, obrazky } = await page.evaluate(() => ({
      preteka: [...document.querySelectorAll('.canvas *')].some((el) => {
        const r = el.getBoundingClientRect();
        return r.width && (r.right > 1280.5 || r.bottom > 800.5 || r.left < -0.5 || r.top < -0.5);
      }),
      obrazky: [...document.images].map(img => img.currentSrc || img.src),
    }));
    const necekane = unexpectedScreenshotFailures(selhanePozadavky, obrazky)
      .map((r) => `${r.url} ${r.error}`);
    if (chyby.length || necekane.length || preteka) {
      throw new Error(`snímek ${n}: ${preteka ? 'obsah přetéká plátno' : [...chyby, ...necekane].join('; ')}`);
    }
    await page.screenshot({ path: path.join(cil, `snimek-${n}-1280x800.png`), clip: { x: 0, y: 0, width: 1280, height: 800 } });
    console.log(`✓ ${path.relative(vystup, path.join(cil, `snimek-${n}-1280x800.png`))}`);
    await page.close();
  }
  }
} finally {
  await browser.close();
  server.close();
}
