// Automatická kontrola WCAG 2.2 A/AA (axe-core) na všech obrazovkách aplikace: světlý i tmavý vzhled,
// počítač i telefon. Selže na každém porušení – kontrast, názvy tlačítek, ARIA, popisky polí.
// axe-core je jen nástroj QA (npm install --no-save), do aplikace ani package.json nepatří.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pripravUkazku } from './demo-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const axe = fs.readFileSync(require.resolve(process.env.AXE_PATH || 'axe-core/axe.min.js'), 'utf8');
const TRASY = ['prehled', 'upozorneni', 'agenti', 'projekty', 'statistiky', 'utrata', 'dovednosti', 'nastaveni'];

const demo = await pripravUkazku({}, { oznacit: false });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
const nalezy = [];
try {
  for (const vzhled of ['light', 'dark']) {
    for (const [w, h] of [[1440, 900], [375, 812]]) {
      // CSP aplikace zakazuje vložený skript – axe se smí vložit jen v tomto kontextu QA.
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', bypassCSP: true, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      for (const trasa of TRASY) {
        await page.goto(`${demo.url}/#/${trasa}`);
        await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, vzhled);
        await page.waitForTimeout(1200);
        await page.addScriptTag({ content: axe });
        const v = await page.evaluate(async () => (await globalThis.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        })).violations.map((x) => `${x.id} (${x.impact}): ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`));
        for (const x of v) nalezy.push(`${vzhled} ${w}px /${trasa}: ${x}`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await demo.close();
}
assert.deepEqual(nalezy, [], `porušení WCAG 2.2 A/AA:\n${nalezy.join('\n')}`);
console.log(`WCAG 2.2 A/AA (axe): ${TRASY.length} obrazovek × světlý/tmavý × 1440/375 px bez porušení.`);
