// Skutečné snímky běžící aplikace pro web. Zdroj je stejná ukázková scéna jako prohlídka,
// takže obrázky na webu nemohou ukazovat něco, co aplikace neumí.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pripravUkazku } from './demo-fixture.mjs';
import { api } from '../test/helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const KOREN = fileURLToPath(new URL('..', import.meta.url));
const CIL = path.join(KOREN, 'site', 'shots');

// Aplikace má vlastní rozvržení pro telefon, takže na úzké obrazovky patří snímek z telefonu,
// ne zmenšené okno z Macu – to by na webu byla nečitelná kaše.
const TRASY = [['prehled', '#/prehled'], ['projekty', '#/projekty'], ['utrata', '#/utrata']];
const ZABERY = TRASY.flatMap(([soubor, trasa]) => [
  { soubor, trasa, sirka: 1280, vyska: 800 },
  { soubor: `${soubor}-mobil`, trasa, sirka: 390, vyska: 760, mobil: true },
]);

const demo = await pripravUkazku();
await fs.mkdir(CIL, { recursive: true });
const browser = await chromium.launch();
try {
  const klient = api(demo.url);
  for (const rezim of ['light', 'dark']) {
    // Vzhled si aplikace drží v nastavení na serveru, ne v prohlížeči.
    await klient.send('PUT', '/api/settings', { appearance: rezim });
    for (const zaber of ZABERY) {
      const page = await browser.newPage({
        viewport: { width: zaber.sirka, height: zaber.vyska },
        deviceScaleFactor: 2, colorScheme: rezim, reducedMotion: 'reduce',
      });
      await page.goto(`${demo.url}/${zaber.trasa}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => !document.querySelector('.loader, .skel'), null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(600);
      // JPEG: snímky jsou ve dvojnásobné hustotě, po zmenšení na obrazovce není rozdíl vidět,
      // ale stránka váží zlomek toho, co by vážila v PNG.
      const cesta = path.join(CIL, `${zaber.soubor}-${rezim}.jpg`);
      // Výřez je přesně plocha okna aplikace: `.shell` má min-height na celou obrazovku, takže
      // okno je vždy stejně vysoké a obsah nad rámec se v něm roluje. Kdyby se bralo podle výšky
      // obsahu, vyšla by každá obrazovka jinak vysoká (Projekty mají obsahu míň) a snímky by při
      // přepínání na webu skákaly.
      const ramec = zaber.mobil ? null : await page.locator('.shell').boundingBox();
      const vyrez = ramec
        ? { x: Math.round(ramec.x), y: Math.round(ramec.y), width: Math.round(ramec.width), height: Math.round(zaber.vyska - 2 * ramec.y) }
        : undefined;
      await page.screenshot({ path: cesta, type: 'jpeg', quality: 88, clip: vyrez });
      const { size } = await fs.stat(cesta);
      console.log(`${zaber.soubor}-${rezim}.jpg  ${(size / 1024).toFixed(0)} kB`);
      await page.close();
    }
  }
} finally { await browser.close(); await demo.close(); }
