// Detaily skutečné aplikace pro web. Zdroj je stejná ukázková scéna jako živá prohlídka, takže
// obrázky na webu nemohou ukazovat něco, co aplikace neumí. Na web nejdou celé obrazovky
// s postranním panelem a spodní lištou, ale jednotlivé části rozhraní vyfocené s průhledným
// pozadím: web je pak skládá do vlastní kompozice a nechá je prolnout do scény.
//
// Spuštění: npm run shots:site (potřebuje Playwright s Chromiem, viz CONTRIBUTING / CLAUDE.md).
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pripravUkazku } from './demo-fixture.mjs';
import { api } from '../test/helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const KOREN = fileURLToPath(new URL('..', import.meta.url));
const CIL = path.join(KOREN, 'site', 'detail');

// Každý detail je prvek ve skutečné obrazovce. `do` omezí výřez na několik prvních položek
// (tabulka agentů, mřížka projektů), aby detail zůstal detailem a ne celou obrazovkou.
// Telefon má v aplikaci vlastní rozvržení, proto se každý detail fotí zvlášť i v něm – zmenšený
// detail z Macu by na telefonu byl nečitelný.
export const DETAILY = [
  { soubor: 'stav', trasa: 'prehled', prvek: '.pulse-bar' },
  { soubor: 'rozhodnuti', trasa: 'prehled', prvek: '.decision' },
  { soubor: 'limit', trasa: 'prehled', prvek: '.lwin' },
  { soubor: 'upozorneni', trasa: 'upozorneni', prvek: '.card:has(.alert-list)' },
  { soubor: 'agenti', trasa: 'agenti', prvek: '.card.table', do: '.card.table a.row:nth-of-type(4)' },
  // Projekty jsou na webu dvě karty přes sebe, každá zvlášť; na telefonu jen druhá – ta má
  // aktivitu rozloženou do více dní, ať je na grafu co vidět.
  { soubor: 'projekt-atlas', trasa: 'projekty', prvek: '.pgrid > .pcard:nth-child(1)', jenSiroke: true },
  { soubor: 'projekt-lumen', trasa: 'projekty', prvek: '.pgrid > .pcard:nth-child(2)' },
  // Na telefonu je měřidlo nad čísly; stačí měřidlo a první částka, zbytek by byl jen dlouhý sloupec.
  { soubor: 'utrata', trasa: 'utrata', prvek: '.spend-hero', vyskaMobil: 400 },
];
const ROZVRZENI = [
  { pripona: '', sirka: 1280, vyska: 800, hustota: 3 },
  { pripona: '-mobil', sirka: 390, vyska: 844, hustota: 3 },
];

// Pozadí okna a jeho záře patří aplikaci, ne detailu. Bez nich zůstane průhledný roh karty a web
// může detail položit na vlastní scénu. Postranní panel (na telefonu spodní lišta, která je
// přišpendlená k okraji a vlezla by do každého vyššího detailu) je neviditelný, ale zabírá své
// místo, takže rozvržení obrazovky zůstane stejné jako v aplikaci. Nástupy a pulzování vypíná
// `reducedMotion`.
const PRUHLEDNE = `
  html, body, .shell, .main { background: transparent !important; }
  body::before, .stage { display: none !important; }
  .sidebar, .sidebar * { visibility: hidden !important; }
`;

async function naWebp(page, png) {
  return page.evaluate(async (data) => {
    const obr = new Image();
    obr.src = `data:image/png;base64,${data}`;
    await obr.decode();
    const platno = new OffscreenCanvas(obr.naturalWidth, obr.naturalHeight);
    platno.getContext('2d').drawImage(obr, 0, 0);
    const blob = await platno.convertToBlob({ type: 'image/webp', quality: 0.9 });
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, png.toString('base64')).then((bajty) => Buffer.from(bajty));
}

async function vyfot(page, detail, mobil) {
  const prvek = page.locator(detail.prvek).first();
  await prvek.waitFor({ state: 'visible', timeout: 10000 });
  await prvek.scrollIntoViewIfNeeded();
  const box = await prvek.boundingBox();
  let vyska = box.height;
  if (detail.do) {
    const konec = await page.locator(detail.do).first().boundingBox();
    if (konec) vyska = Math.min(vyska, konec.y + konec.height - box.y);
  }
  if (mobil && detail.vyskaMobil) vyska = Math.min(vyska, detail.vyskaMobil);
  // Výřez na celé pixely: detail se na webu zvětšuje a půlpixelový okraj by byl vidět jako lem.
  const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(vyska) };
  const png = await page.screenshot({ clip, omitBackground: true, type: 'png' });
  return { png, sirka: clip.width, vyska: clip.height };
}

const demo = await pripravUkazku({}, { oznacit: false });
await fs.mkdir(CIL, { recursive: true });
const browser = await chromium.launch();
const prehled = [];
try {
  // Kompozice na webu stojí na tmavé scéně v obou režimech stránky, proto jen tmavý vzhled.
  await api(demo.url).send('PUT', '/api/settings', { appearance: 'dark' });
  for (const r of ROZVRZENI) {
    for (const detail of DETAILY) {
      if (detail.jenSiroke && r.pripona) continue;
      const page = await browser.newPage({
        viewport: { width: r.sirka, height: r.vyska }, deviceScaleFactor: r.hustota,
        colorScheme: 'dark', reducedMotion: 'reduce', isMobile: r.sirka < 600, hasTouch: r.sirka < 600,
      });
      await page.goto(`${demo.url}/#/${detail.trasa}`, { waitUntil: 'load' });
      await page.addStyleTag({ content: PRUHLEDNE });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => !document.querySelector('.loader, .skel, .skeleton'), null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(700);
      const { png, sirka, vyska } = await vyfot(page, detail, Boolean(r.pripona));
      const webp = await naWebp(page, png);
      const soubor = `${detail.soubor}${r.pripona}.webp`;
      await fs.writeFile(path.join(CIL, soubor), webp);
      prehled.push({ soubor, sirka, vyska, kB: Math.round(webp.length / 1024) });
      console.log(`${soubor.padEnd(24)} ${sirka}×${vyska} CSS px  ${(webp.length / 1024).toFixed(0)} kB`);
      await page.close();
    }
  }
  // Rozměry v CSS pixelech si bere HTML (width/height u <img>), aby stránka při načítání neposkakovala.
  await fs.writeFile(path.join(CIL, 'rozmery.json'), `${JSON.stringify(Object.fromEntries(prehled.map(({ soubor, sirka, vyska }) => [soubor, [sirka, vyska]])), null, 2)}\n`);
} finally { await browser.close(); await demo.close(); }
