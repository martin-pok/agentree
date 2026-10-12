// Celá obrazovka Přehledu pro úvod webu (site/detail/prehled*.webp). Zdroj je stejná ukázková
// scéna jako u detailů (scripts/shots-site.mjs), takže web neukazuje nic, co aplikace neumí.
// Fotí se tmavý vzhled (web stojí na tmavé scéně) v okně Macu 1440 × 1080 (aby byli vidět celí roboti v „Právě teď“) a na telefonu 390 × 844.
// Spuštění: npm run shots:hero (potřebuje Playwright s Chromiem).
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pripravUkazku } from './demo-fixture.mjs';
import { api } from '../test/helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const CIL = path.join(fileURLToPath(new URL('..', import.meta.url)), 'site', 'detail');
const OKNA = [
  { pripona: '', sirka: 1440, vyska: 1080, hustota: 2 },
  { pripona: '-mobil', sirka: 390, vyska: 844, hustota: 3 },
];

const ted = Date.now();
// Rozměry v CSS px pro test webu (site/detail/rozmery.json, test/site.test.mjs).
const ROZMERY = path.join(CIL, 'rozmery.json');
const rozmery = JSON.parse(await fs.readFile(ROZMERY, 'utf8'));
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
try {
  for (const jazyk of ['cs', 'en']) {
    const demo = await pripravUkazku({}, { oznacit: false, jazyk });
    try {
      await api(demo.url).send('PUT', '/api/settings', { appearance: 'dark' });
      for (const o of OKNA) {
        const page = await browser.newPage({
          viewport: { width: o.sirka, height: o.vyska }, deviceScaleFactor: o.hustota, colorScheme: 'dark',
          reducedMotion: 'reduce', isMobile: o.sirka < 600, hasTouch: o.sirka < 600,
          timezoneId: 'Europe/Prague', locale: jazyk === 'en' ? 'en-GB' : 'cs-CZ',
        });
        await page.clock.setFixedTime(ted + 60000);
        await page.goto(`${demo.url}/#/prehled`, { waitUntil: 'load' });
        // Plovoucí pomocník a bubliny robotů patří živé aplikaci, ne fotce.
        await page.addStyleTag({ content: '.pm-fab, .rb, .toast { display: none !important; }' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1200);
        const png = await page.screenshot({ type: 'png' });
        const webp = await page.evaluate(async (data) => {
          const obr = new Image();
          obr.src = `data:image/png;base64,${data}`;
          await obr.decode();
          const platno = new OffscreenCanvas(obr.naturalWidth, obr.naturalHeight);
          platno.getContext('2d').drawImage(obr, 0, 0);
          const blob = await platno.convertToBlob({ type: 'image/webp', quality: 0.86 });
          return [...new Uint8Array(await blob.arrayBuffer())];
        }, png.toString('base64'));
        const soubor = `prehled${o.pripona}${jazyk === 'en' ? '-en' : ''}.webp`;
        await fs.writeFile(path.join(CIL, soubor), Buffer.from(webp));
        rozmery[soubor] = [o.sirka, o.vyska];
        console.log(`${soubor.padEnd(24)} ${o.sirka}×${o.vyska}  ${(webp.length / 1024).toFixed(0)} kB`);
        await page.close();
      }
    } finally {
      await demo.close();
    }
  }
  await fs.writeFile(ROZMERY, `${JSON.stringify(rozmery, null, 2)}\n`);
} finally {
  await browser.close();
}
