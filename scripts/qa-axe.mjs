// Automatická kontrola WCAG 2.2 A/AA (axe-core) na všech obrazovkách aplikace: světlý i tmavý vzhled,
// počítač i telefon. Selže na každém porušení – kontrast, názvy tlačítek, ARIA, popisky polí.
// 320 × 256 CSS px je přiblížení 400 % (WCAG 1.4.10 Přeskládání): stránka nesmí jezdit do stran.
// Klávesnice (WCAG 2.1.1, 2.1.2, 2.4.7): Tab projde celou obrazovku dokola bez pasti a každá
// zastávka má viditelný fokus – vlastní obrys/stín, nebo stín obalu s :focus-within (pole skládače).
// axe-core je jen nástroj QA (npm install --no-save), do aplikace ani package.json nepatří.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pripravUkazku } from './demo-fixture.mjs';
import { api } from '../test/helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const axe = fs.readFileSync(require.resolve(process.env.AXE_PATH || 'axe-core/axe.min.js'), 'utf8');
const TRASY = ['prehled', 'upozorneni', 'agenti', 'projekty', 'statistiky', 'utrata', 'dovednosti', 'nastaveni'];

async function projdiKlavesnici(page) {
  await page.evaluate(() => document.activeElement?.blur());
  const videne = new Set();
  const chyby = [];
  for (let i = 0; i < 300; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(40); // přepočet :focus-visible
    const z = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const obrys = (x) => { const c = getComputedStyle(x); return (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== 'none'; };
      const b = e.getBoundingClientRect();
      return {
        id: e.id || `${e.tagName}|${e.getAttribute('aria-label') || e.textContent.trim().slice(0, 30)}|${Math.round(b.x)},${Math.round(b.y + scrollY)}`,
        popis: `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).join('.')}` : ''}`,
        vidno: b.width > 0 && b.height > 0 && (obrys(e) || (e.parentElement?.matches(':focus-within') && obrys(e.parentElement))),
      };
    });
    if (!z) continue;
    if (videne.has(z.id)) return chyby;
    videne.add(z.id);
    if (!z.vidno) chyby.push(`${z.popis} nemá viditelný fokus (WCAG 2.4.7)`);
  }
  return [...chyby, 'Tab se po 300 zastávkách nevrátil na začátek – past klávesnice (WCAG 2.1.2)'];
}

const demo = await pripravUkazku({}, { oznacit: false });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
const nalezy = [];
try {
  for (const vzhled of ['light', 'dark']) {
    // Vzhled jde přes uložené nastavení jako u uživatele. Přepsání data-theme v prohlížeči by
    // aplikace po načtení nastavení vrátila zpět – tmavá první obrazovka by se pak netestovala.
    await api(demo.url).send('PUT', '/api/settings', { appearance: vzhled });
    for (const [w, h] of [[1440, 900], [375, 812], [320, 256]]) {
      // CSP aplikace zakazuje vložený skript – axe se smí vložit jen v tomto kontextu QA.
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', bypassCSP: true, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      for (const trasa of TRASY) {
        await page.goto(`${demo.url}/#/${trasa}`);
        await page.waitForTimeout(1200);
        const motiv = await page.evaluate(() => document.documentElement.dataset.theme);
        if (motiv !== vzhled) nalezy.push(`${vzhled} ${w}px /${trasa}: místo vzhledu ${vzhled} se vykreslil ${motiv} – kontrola by netestovala, co tvrdí`);
        const preteka = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (preteka > 0) nalezy.push(`${vzhled} ${w}px /${trasa}: stránka přetéká do strany o ${preteka} px (WCAG 1.4.10)`);
        await page.addScriptTag({ content: axe });
        const v = await page.evaluate(async () => (await globalThis.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        })).violations.map((x) => `${x.id} (${x.impact}): ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`));
        for (const x of v) nalezy.push(`${vzhled} ${w}px /${trasa}: ${x}`);
        if (vzhled === 'light' && w !== 320) for (const x of await projdiKlavesnici(page)) nalezy.push(`${w}px /${trasa}: ${x}`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await demo.close();
}
assert.deepEqual(nalezy, [], `porušení WCAG 2.2 A/AA:\n${nalezy.join('\n')}`);
console.log(`WCAG 2.2 A/AA (axe): ${TRASY.length} obrazovek × světlý/tmavý × 1440/375/320 px bez porušení a bez vodorovného posunu; Tab projde každou obrazovku dokola s viditelným fokusem.`);
