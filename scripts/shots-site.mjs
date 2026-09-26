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
  // Pruh stavu z Přehledu. Na Macu ve 1520 px širokém okně – tam se do řádku vejdou všichni
  // agenti a na webu nic není uříznuté. Telefon řádek agentů posouvá do strany, takže na úzkém
  // výřezu by poslední agent byl vždycky useknutý: tam jen horní část s počty.
  { soubor: 'stav', trasa: 'prehled', prvek: '.pulse-bar', sirka: 1520, cssMobil: '.pb-strip { display: none !important; } .pulse-bar { padding-bottom: 22px !important; }' },
  { soubor: 'rozhodnuti', trasa: 'prehled', prvek: '.decision' },
  { soubor: 'limit', trasa: 'prehled', prvek: '.lwin' },
  { soubor: 'agenti', trasa: 'agenti', prvek: '.card.table', do: '.card.table a.row:nth-of-type(4)' },
  // Karta s aktivitou rozloženou do více dní, ať je na grafu co vidět.
  { soubor: 'projekt-lumen', trasa: 'projekty', prvek: '.pgrid > .pcard:nth-child(2)' },
  // Útrata jen z telefonního rozvržení: měřidlo nad částkou se vejde do dlaždice, široký pruh
  // z Macu ne. Končí pod první částkou.
  { soubor: 'utrata', trasa: 'utrata', prvek: '.spend-hero', vyskaMobil: 366, jenUzke: true },
];
const ROZVRZENI = [
  { pripona: '', sirka: 1280, vyska: 800, hustota: 3 },
  { pripona: '-mobil', sirka: 390, vyska: 844, hustota: 3 },
];

// Pozadí okna a jeho záře patří aplikaci, ne detailu. Bez nich zůstane průhledný roh karty a web
// může detail položit na vlastní scénu. Postranní panel (na telefonu spodní lišta, která je
// přišpendlená k okraji a vlezla by do každého vyššího detailu) je neviditelný, ale zabírá své
// místo, takže rozvržení obrazovky zůstane stejné jako v aplikaci. Stejně tak úchyt pro
// přesouvání karet projektů – ovládání aplikace, ne obsah. Nástupy a pulzování vypíná
// `reducedMotion`.
const PRUHLEDNE = `
  html, body, .shell, .main { background: transparent !important; }
  body::before, .stage { display: none !important; }
  .sidebar, .sidebar * { visibility: hidden !important; }
  .pcard-grip { visibility: hidden !important; }
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

// Hodiny prohlížeče stojí na čase vzniku scény: „obnova za 2 h“ by se jinak během focení změnilo
// na delší „za 1 h 55 min“, text by se zalomil a výřez by vyšel pokaždé jinak vysoký (rozměry
// v index.html by pak neseděly). Časové pásmo je pražské, ať časy odpovídají českému webu.
const ted = Date.now();
await fs.mkdir(CIL, { recursive: true });
const browser = await chromium.launch();
const prehled = [];
try {
  // Kompozice na webu stojí na tmavé scéně v obou režimech stránky, proto jen tmavý vzhled.
  for (const jazyk of ['cs', 'en']) {
    const demo = await pripravUkazku({}, { oznacit: false, jazyk });
    try {
      await api(demo.url).send('PUT', '/api/settings', { appearance: 'dark' });
      for (const r of ROZVRZENI) {
        for (const detail of DETAILY) {
          if (detail.jenUzke && !r.pripona) continue;
          const sirkaOkna = (!r.pripona && detail.sirka) || r.sirka;
          const page = await browser.newPage({
            viewport: { width: sirkaOkna, height: r.vyska }, deviceScaleFactor: r.hustota,
            colorScheme: 'dark', reducedMotion: 'reduce', isMobile: r.sirka < 600, hasTouch: r.sirka < 600,
            timezoneId: 'Europe/Prague', locale: jazyk === 'en' ? 'en-GB' : 'cs-CZ',
          });
          await page.clock.setFixedTime(ted + 60000);
          await page.goto(`${demo.url}/#/${detail.trasa}`, { waitUntil: 'load' });
          await page.addStyleTag({ content: PRUHLEDNE + (r.pripona && detail.cssMobil ? detail.cssMobil : '') });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForFunction(() => !document.querySelector('.loader, .skel, .skeleton'), null, { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(700);
          const { png, sirka, vyska } = await vyfot(page, detail, Boolean(r.pripona));
          const webp = await naWebp(page, png);
          const soubor = `${detail.soubor}${r.pripona}${jazyk === 'en' ? '-en' : ''}.webp`;
          await fs.writeFile(path.join(CIL, soubor), webp);
          prehled.push({ soubor, sirka, vyska, kB: Math.round(webp.length / 1024) });
          console.log(`${soubor.padEnd(24)} ${sirka}×${vyska} CSS px  ${(webp.length / 1024).toFixed(0)} kB`);
          await page.close();
        }
      }
    } finally { await demo.close(); }
  }
  // Rozměry v CSS pixelech si bere HTML (width/height u <img>), aby stránka při načítání neposkakovala.
  await fs.writeFile(path.join(CIL, 'rozmery.json'), `${JSON.stringify(Object.fromEntries(prehled.map(({ soubor, sirka, vyska }) => [soubor, [sirka, vyska]])), null, 2)}\n`);
} finally { await browser.close(); }
