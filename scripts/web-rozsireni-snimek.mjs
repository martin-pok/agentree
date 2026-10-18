#!/usr/bin/env node
// Snímek okna rozšíření pro web (sekce „Webové chaty přes rozšíření“ na úvodní stránce
// a na stránce Instalace).
//
// Nic se nekreslí od ruky: okno se vykreslí ze skutečného extension/popup.html se stejnou atrapou
// API Chromu a stejnými ukázkovými daty jako QA a snímky pro Chrome Web Store
// (scripts/qa-rozsireni.mjs, stav „rušno“: dva agenti čekají na tebe, čtyři pracují, otevřené
// webové chaty). Okno má 380 × 600 CSS px a fotí se ve dvojnásobném rozlišení (ostré na retině).
// Písmo je Satoshi jako v balíčku rozšíření (scripts/build-extension.mjs); bez něj se snímek
// nevyrobí, protože by ukazoval jiné okno, než jaké dostane uživatel.
//
// Výstup: site/rozsireni/okno-{svetle,tmave}[-en].webp + rozmery.json (CSS px pro width/height).
//
//   PLAYWRIGHT_PATH=/cesta/k/playwright PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/cesta/k/chromium \
//     node scripts/web-rozsireni-snimek.mjs
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { otevriOkno, OKNO } from './qa-rozsireni.mjs';
import { zajistiSatoshi, SATOSHI_SOUBOR } from './satoshi.mjs';
import { SATOSHI_FACE } from '../src/verze-souboru.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const KOREN = fileURLToPath(new URL('..', import.meta.url));
const ROZSIRENI = path.join(KOREN, 'extension');
const CIL = path.join(KOREN, 'site', 'rozsireni');
const HUSTOTA = 2;
// Kvalita WebP: 0.86 drží písmo ostré a soubor pod rozpočtem (test/site-performance-seo.test.mjs).
const KVALITA = 0.86;
const VZHLEDY = [{ nazev: 'svetle', schema: 'light' }, { nazev: 'tmave', schema: 'dark' }];

try { await zajistiSatoshi(); } catch (chyba) {
  console.error(`Satoshi: ${chyba.message}\nSnímek okna se bez písma rozšíření nevyrobí.`);
  process.exit(1);
}
const satoshi = await fs.readFile(SATOSHI_SOUBOR);

// Složka rozšíření tak, jak ji dostane Chrome z balíčku: fonts.css doplněné o Satoshi.
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  if (rel === 'fonts/satoshi/Satoshi-Variable.woff2') return res.writeHead(200, { 'Content-Type': 'font/woff2' }).end(satoshi);
  const soubor = path.resolve(ROZSIRENI, rel);
  if (!soubor.startsWith(ROZSIRENI + path.sep)) return res.writeHead(403).end();
  let obsah = await fs.readFile(soubor).catch(() => null);
  if (!obsah) return res.writeHead(404).end();
  if (rel === 'fonts/fonts.css') obsah = Buffer.from(`${obsah.toString('utf8')}${SATOSHI_FACE}\n`);
  res.writeHead(200, { 'Content-Type': TYPY[path.extname(soubor)] || 'application/octet-stream' }).end(obsah);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;

async function naWebp(page, png) {
  return page.evaluate(async ({ data, kvalita }) => {
    const obr = new Image();
    obr.src = `data:image/png;base64,${data}`;
    await obr.decode();
    const platno = new OffscreenCanvas(obr.naturalWidth, obr.naturalHeight);
    platno.getContext('2d').drawImage(obr, 0, 0);
    const blob = await platno.convertToBlob({ type: 'image/webp', quality: kvalita });
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { data: png.toString('base64'), kvalita: KVALITA }).then((bajty) => Buffer.from(bajty));
}

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
const rozmery = {};
try {
  await fs.mkdir(CIL, { recursive: true });
  for (const jazyk of ['cs', 'en']) {
    for (const { nazev, schema } of VZHLEDY) {
      const page = await otevriOkno(browser, url, 'rušno', { colorScheme: schema, jazyk, deviceScaleFactor: HUSTOTA });
      const chyby = [];
      page.on('pageerror', (e) => chyby.push(e.message));
      await page.mouse.move(0, 0); // kurzor nad řádkem by ho na snímku zvýraznil
      const pismo = await page.evaluate(() => document.fonts.check("500 16px 'Satoshi'") && [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Satoshi' && f.status === 'loaded'));
      if (!pismo) throw new Error('Okno rozšíření se nevykreslilo písmem Satoshi.');
      const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...OKNO } });
      const webp = await naWebp(page, png);
      if (chyby.length) throw new Error(`Chyba v okně rozšíření: ${chyby.join('; ')}`);
      const soubor = `okno-${nazev}${jazyk === 'en' ? '-en' : ''}.webp`;
      await fs.writeFile(path.join(CIL, soubor), webp);
      rozmery[soubor] = [OKNO.width, OKNO.height];
      console.log(`${soubor.padEnd(22)} ${OKNO.width * HUSTOTA}×${OKNO.height * HUSTOTA} px  ${(webp.length / 1024).toFixed(0)} kB`);
      await page.close();
    }
  }
  await fs.writeFile(path.join(CIL, 'rozmery.json'), `${JSON.stringify(rozmery, null, 2)}\n`);
} finally {
  await browser.close();
  server.close();
}
