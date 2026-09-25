import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSite } from './build-site.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { out } = await buildSite();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  for (const candidate of [rel, `${rel}/index.html`]) {
    const file = path.resolve(out, candidate);
    if (!file.startsWith(path.resolve(out) + path.sep)) break;
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` }).end(body);
      return;
    } catch { /* Try directory index before sending headers. */ }
  }
  res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const output = 'dist/qa-site';
// Stránka slibuje, že nic nedotahuje z cizích serverů. Tohle to drží: všechno mimo vlastní
// původ se odmítne a zapíše. Zároveň to brání tomu, aby klik na Stáhnout odvedl kontrolu pryč.
const puvod = new URL(url).origin;
async function jenMistni(page, cizi) {
  await page.route('**/*', (route) => {
    const cil = route.request().url();
    if (cil.startsWith(puvod) || cil.startsWith('data:') || cil.startsWith('blob:')) return route.continue();
    cizi.push(cil);
    return route.abort();
  });
}
await fs.mkdir(output, { recursive: true });
const results = [];
try {
  for (const engine of (process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium', 'webkit'])) {
    const browser = await (engine === 'chromium' ? chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) }) : webkit.launch());
    try {
      for (const theme of ['light', 'dark']) {
        for (const width of [360, 375, 768, 900, 1440]) {
          const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce' });
          const errors = [];
          const cizi = [];
          await jenMistni(page, cizi);
          page.on('pageerror', e => errors.push(e.message));
          page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
          await page.goto(url);
          await page.evaluate(() => document.fonts.ready);
          assert.equal(await page.locator('h1').count(), 1);
          // Produkt ukazují výřezy (obrázky). Vložený rám tu byl a na iPhonu blokoval posouvání.
          assert.equal(await page.locator('iframe').count(), 0, `${engine} ${theme} ${width}: ve stránce je rám`);
          await page.evaluate(async () => { for (const img of document.querySelectorAll('.detail img')) { img.loading = 'eager'; await img.decode().catch(() => {}); } });
          const nenactene = await page.evaluate(() => [...document.querySelectorAll('.detail img')].filter((i) => i.getBoundingClientRect().width && !(i.complete && i.naturalWidth)).map((i) => i.currentSrc || i.src));
          assert.deepEqual(nenactene, [], `${engine} ${theme} ${width}: výřezy se nenačetly`);
          // Telefon dostane výřezy z telefonního rozvržení, širší obrazovka ty z Macu.
          const zdroje = await page.evaluate(() => [...document.querySelectorAll('.detail img')].filter((i) => i.getBoundingClientRect().width).map((i) => i.currentSrc));
          // Karty scény berou telefonní výřez i na tabletu (v přirozené velikosti čitelnější), oznámení
          // je telefonní všude – je to plovoucí karta.
          const telefonni = (z) => width <= 620 || /upozorneni/.test(z) || (width <= 900 && /rozhodnuti|limit/.test(z));
          assert.equal(zdroje.every((z) => z.includes('-mobil') === telefonni(z)), true, `${engine} ${theme} ${width}: ${zdroje.join(', ')}`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine} ${theme} ${width}: overflow`);
          assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0, 'reduced motion');
          await page.locator('a[href="#rozsireni"]').click();
          await page.waitForFunction(() => document.getElementById('rozsireni').open);
          assert.equal(await page.locator('#rozsireni').getAttribute('open'), '');
          await page.locator('#rozsireni summary').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('#rozsireni').getAttribute('open'), null);
          const brokenAnchors = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(h.slice(1))));
          assert.deepEqual(brokenAnchors, []);
          const smallText = await page.evaluate(() => [...document.querySelectorAll('p, span, a, button, summary')].filter(e => e.getBoundingClientRect().height && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent.slice(0, 30)));
          assert.deepEqual(smallText, []);
          await page.evaluate(() => scrollTo(0, 0));
          if ([375, 1440].includes(width)) await page.screenshot({ path: `${output}/${engine}-${theme}-${width}.png`, fullPage: true });
          assert.deepEqual(errors, []);
          assert.deepEqual(cizi, [], `${engine} ${theme} ${width}: stránka sáhla mimo vlastní server`);
          results.push({ engine, theme, width, passed: true, height: await page.evaluate(() => document.documentElement.scrollHeight) });
          await page.close();
        }
      }
      // Posouvání přes výřezy. Kolečko v obou jádrech, tah prstem v Chromiu (WebKit v Playwrightu
      // dotykové posouvání neumí). Kontrolní tah na volné ploše musí stránku posunout, jinak by
      // měření nic nedokazovalo – přesně tak prošla prohlídka, která na iPhonu posouvání blokovala.
      for (const [sirka, vyska, dotyk] of [[1440, 900, false], [390, 844, engine === 'chromium']]) {
        const kontext = await browser.newContext({ viewport: { width: sirka, height: vyska }, hasTouch: dotyk, isMobile: dotyk, reducedMotion: 'reduce' });
        const p = await kontext.newPage();
        await jenMistni(p, []);
        await p.goto(url);
        await p.evaluate(() => document.fonts.ready);
        const cile = await p.evaluate(() => [...document.querySelectorAll('.scene-in, .chapter-figure')].map((_, i) => i));
        assert.ok(cile.length >= 4, `${engine} ${sirka}: výřezů k posouvání je ${cile.length}`);
        const naStred = (i) => p.evaluate((i) => {
          const el = document.querySelectorAll('.scene-in, .chapter-figure')[i];
          const r = el.getBoundingClientRect();
          scrollTo({ top: scrollY + r.top + Math.min(r.height, innerHeight) / 2 - innerHeight / 2, behavior: 'instant' });
          const b = el.getBoundingClientRect();
          return { x: Math.round(Math.min(b.left + b.width / 2, innerWidth / 2 + 120)), y: Math.round(Math.max(120, Math.min(b.top + b.height / 2, innerHeight - 140))), nahore: document.elementFromPoint(Math.min(b.left + b.width / 2, innerWidth / 2 + 120), Math.max(120, Math.min(b.top + b.height / 2, innerHeight - 140)))?.closest('.scene-in, .chapter-figure') === el };
        }, i);
        const cdp = dotyk ? await kontext.newCDPSession(p) : null;
        const tah = async (x, y) => {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let k = 1; k <= 12; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - k * 25 }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        };
        // Posun se měří, až stránka doběhne (plynulé posouvání kolečkem, setrvačnost po tahu).
        const ustaleno = () => p.evaluate(() => new Promise((hotovo) => {
          let posledni = scrollY, klid = 0;
          const t = setInterval(() => { klid = scrollY === posledni ? klid + 1 : 0; posledni = scrollY; if (klid >= 4) { clearInterval(t); hotovo(scrollY); } }, 50);
          setTimeout(() => { clearInterval(t); hotovo(scrollY); }, 4000);
        }));
        const posun = async (akce) => {
          const pred = await ustaleno();
          await akce();
          await p.waitForTimeout(80);
          return (await ustaleno()) - pred;
        };
        if (dotyk) {
          await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          const kontrola = await posun(() => tah(Math.round(sirka / 2), 260));
          assert.ok(kontrola > 100, `${engine} ${sirka}: kontrolní tah na volné ploše posunul jen o ${kontrola} px – měření neplatí`);
        }
        for (const i of cile) {
          const bod = await naStred(i);
          await p.waitForTimeout(100);
          assert.ok(bod.nahore, `${engine} ${sirka}: výřez ${i} překrývá něco jiného`);
          if (dotyk) {
            const prstem = await posun(() => tah(bod.x, bod.y));
            assert.ok(prstem > 100, `${engine} ${sirka}: tah prstem přes výřez ${i} posunul stránku o ${prstem} px`);
          } else {
            await p.mouse.move(bod.x, bod.y);
            const koleckem = await posun(() => p.mouse.wheel(0, 400));
            assert.ok(koleckem > 100, `${engine} ${sirka}: kolečko nad výřezem ${i} posunulo stránku o ${koleckem} px`);
          }
        }
        await kontext.close();
      }

      // Nástup výřezů řídí posouvání. Po dojetí do okna musí být výřez celý vidět – `overflow:
      // hidden` na sekci jednou udělal ze sekce posuvný kontejner a výřez zůstal napůl průhledný.
      {
        const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
        await jenMistni(p, []);
        await p.goto(url);
        const pruhlednost = [];
        for (const sel of ['.chapter--dolu .chapter-shot', '.chapter--dolu .chapter-float', '.chapter--flip .stack-front', '.chapter--flip .stack-back', '.chapter:not(.chapter--dolu):not(.chapter--flip) .chapter-shot']) {
          await p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); scrollTo({ top: scrollY + r.top + r.height / 2 - innerHeight / 2, behavior: 'instant' }); }, sel);
          await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          await p.waitForTimeout(150);
          pruhlednost.push([sel, await p.evaluate((sel) => getComputedStyle(document.querySelector(sel)).opacity, sel)]);
        }
        const ocekavano = { '.chapter--flip .stack-back': '0.5' };
        for (const [sel, o] of pruhlednost) assert.equal(o, ocekavano[sel] || '1', `${engine}: ${sel} po dojetí do okna má průhlednost ${o}`);
        // A nástup je opravdu napojený na okno: výřez, který právě vyjel zespodu, je ještě
        // průhledný. Kdyby animace měřila vůči sekci (posuvný kontejner), byl by rovnou celý.
        if (await p.evaluate(() => CSS.supports('animation-timeline: view()'))) {
          const vjizdi = await p.evaluate(async () => {
            const el = document.querySelector('.chapter:not(.chapter--dolu):not(.chapter--flip) .chapter-shot');
            scrollTo({ top: 0, behavior: 'instant' });
            const r = el.getBoundingClientRect();
            scrollTo({ top: r.top - innerHeight + 24, behavior: 'instant' });
            await new Promise((h) => requestAnimationFrame(() => requestAnimationFrame(h)));
            return Number(getComputedStyle(el).opacity);
          });
          assert.ok(vjizdi < 0.5, `${engine}: výřez na spodním okraji okna má průhlednost ${vjizdi} – nástup podle posouvání neběží`);
        }
        await p.close();
      }

      const staticPage = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
      await jenMistni(staticPage, []);
      await staticPage.goto(url);
      // Bez JavaScriptu musí stránka pořád prodávat: nadpis, snímek produktu i tlačítko ke stažení.
      assert.ok(await staticPage.locator('h1').isVisible(), 'nadpis bez JS');
      assert.ok(await staticPage.locator('.scene-main img').isVisible(), 'výřez produktu bez JS');
      assert.ok(await staticPage.locator('[data-stahnout="mac-arm64"]').first().isVisible(), 'stažení bez JS');
      await staticPage.locator('#rozsireni summary').click();
      assert.ok(await staticPage.locator('#rozsireni ol').isVisible());
      await staticPage.close();
      const motionPage = await browser.newPage({ reducedMotion: 'no-preference' });
      await jenMistni(motionPage, []);
      // Tlačítko Stáhnout je skutečný odkaz ven. Tady zkoušíme jeho odezvu na stisk, ne stahování,
      // takže odchod ze stránky zastavíme – jinak by kontrola skončila na GitHubu.
      await motionPage.addInitScript(() => addEventListener('click', (e) => {
        if (e.target.closest?.('a[href^="http"]')) e.preventDefault();
      }, true));
      await motionPage.goto(url);
      await motionPage.evaluate(() => document.fonts.ready);
      // Nekonečnou smyčku poznáme z jejího zápisu, ne z měření času.
      assert.deepEqual(await motionPage.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming?.().iterations === Infinity).map(a => a.animationName || a.transitionProperty)), [], 'Nekonečná animace');
      // Animace řízené posouváním (ViewTimeline) neběží samy – stojí, dokud se stránka nehne –, takže
      // se do „nic nesmí běžet“ nepočítají. Hlídá se jen to, co běží podle hodin.
      const podleHodin = () => document.getAnimations().filter(a => a.playState === 'running' && (!a.timeline || a.timeline instanceof DocumentTimeline));
      // Nástupní animace musí dojet, než začneme klikat. Pod zátěží se Playwrightu
      // prvek jeví ustálený i uprostřed animace (dva snímky se stejným rámečkem),
      // takže bez tohoto čekání test chytal doběh nástupu místo skutečné smyčky.
      await motionPage.waitForFunction(`(${podleHodin})().length === 0`, null, { timeout: 5000 });
      const button = motionPage.locator('.hero .btn');
      await button.hover();
      // Najetí zvedá, stisk stlačuje. Dvě rozlišitelné odezvy, ne jedna pro obojí.
      await motionPage.waitForFunction(() => {
        const el = document.querySelector('.hero .btn');
        return el.matches(':hover') && new DOMMatrixReadOnly(getComputedStyle(el).transform).f < -0.5;
      });
      await motionPage.mouse.down();
      await motionPage.waitForFunction(() => {
        const el = document.querySelector('.hero .btn');
        const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return el.matches(':active') && matrix.a < 0.99 && matrix.f > -0.5;
      });
      await motionPage.mouse.up();
      await motionPage.evaluate(() => document.getElementById('prohlidka').scrollIntoView());
      await motionPage.waitForTimeout(900);
      assert.equal(await motionPage.evaluate(`(${podleHodin})().length`), 0, 'No perpetual decorative animation');
      await motionPage.close();
    } finally { await browser.close(); }
  }
  await fs.writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
