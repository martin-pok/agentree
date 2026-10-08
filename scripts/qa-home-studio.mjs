// Přehled a robot v prohlížeči (Chromium a WebKit – stejný engine jako okno aplikace pro Mac).
// Ověřuje skutečným klikáním, ne jen vzhled:
//   - pole pro zadání: výběr agenta z lišty (otevření, hledání, šipky, Enter, Esc, klik mimo),
//     koncept textu přežije změnu agenta, Spustit v ukázce opravdu odešle zadání;
//   - robot: na Přehledu v panelu u pozdravu, jinde plovoucí s radou, která nepřekrývá nadpis;
//   - levý panel má zaoblené rohy; žádné vodorovné přetečení na 1440/880/375 px; čistá konzole.
// Spuštění: npm run qa:studio  (snímky v dist/home-studio)
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pripravUkazku } from './demo-fixture.mjs';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = 'dist/home-studio';
await fs.mkdir(out, { recursive: true });
const demo = await pripravUkazku({}, { oznacit: false });

async function prohlizec(typ) {
  try {
    return await pw[typ].launch(typ === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  } catch (err) {
    if (process.env.CI) throw err;
    console.log(`SKIP ${typ}: na tomhle počítači není (${err.message.split('\n')[0]})`);
    return null;
  }
}

try {
  for (const typ of ['chromium', 'webkit']) {
    const browser = await prohlizec(typ);
    if (!browser) continue;
    try {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`${demo.url}/#/prehled`);
      await page.locator('.lpick-btn').waitFor();
      await page.evaluate(() => document.fonts.ready);

      // Pole pro zadání a výběr agenta.
      assert.equal(await page.locator('.lchip:visible').count(), 0, 'nabídka agentů je zavřená');
      await page.locator('[data-l-prompt]').fill('Ověř navigaci');
      await page.locator('.lpick-btn').click();
      assert.equal(await page.locator('.lpick-btn').getAttribute('aria-expanded'), 'true');
      assert.ok(await page.locator('[data-l-hledat]').evaluate((n) => n === document.activeElement), 'po otevření má fokus hledání');
      await page.screenshot({ path: `${out}/${typ}-vyber-agenta.png` });
      await page.locator('[data-l-hledat]').fill('codex');
      const viditelne = await page.locator('.lpick-pop .lchip:visible').allTextContents();
      assert.ok(viditelne.length >= 1 && viditelne.every((t) => /codex/i.test(t)), `hledání filtruje: ${viditelne}`);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('.lpick-pop').isHidden(), true, 'Enter vybere a zavře');
      assert.match(await page.locator('.lpick-btn').innerText(), /Codex/);
      assert.equal(await page.locator('[data-l-prompt]').inputValue(), 'Ověř navigaci', 'koncept zůstal');
      // Šipky a Esc.
      await page.locator('.lpick-btn').click();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('lchip')), true, 'šipka dolů přejde na agenta');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.lpick-pop').isHidden(), true, 'Esc zavře');
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('lpick-btn')), true, 'fokus se vrátí na tlačítko');
      // Klik mimo.
      await page.locator('.lpick-btn').click();
      await page.mouse.click(5, 990);
      assert.equal(await page.locator('.lpick-pop').isHidden(), true, 'klik mimo zavře');
      // Spustit: ukázka nic nespouští, ale požadavek musí odejít a vrátit odpověď.
      await page.locator('.lpick-btn').click();
      await page.locator('.lpick-pop [data-agent="claude-code"]').click();
      const odeslano = page.waitForRequest((r) => r.url().endsWith('/api/launch') && r.method() === 'POST', { timeout: 5000 }).catch(() => null);
      await page.locator('[data-l="go"]').click();
      const pozadavek = await odeslano;
      assert.ok(pozadavek, 'Spustit odeslalo zadání');
      assert.equal(JSON.parse(pozadavek.postData()).prompt, 'Ověř navigaci');

      // Robot na Přehledu je v panelu u pozdravu; vpravo dole je tlačítko pomocníka.
      assert.equal(await page.locator('.home-intro .home-robot .robot').count(), 1, 'robot v panelu pozdravu');
      assert.equal(await page.locator('.robot-guide').count(), 0, 'žádný pruh s robotem přes obsah');
      await page.screenshot({ path: `${out}/${typ}-prehled.png` });

      // Levý panel má zaoblené rohy.
      const rohy = await page.locator('.sidebar').evaluate((n) => parseFloat(getComputedStyle(n).borderBottomLeftRadius));
      assert.ok(rohy >= 16, `levý panel je zaoblený (${rohy}px)`);

      // Pomocník: otevřít, „jak zapnu…“ → odkaz do Nastavení, který tam opravdu vede.
      await page.locator('.pm-fab').click();
      await page.locator('.pm-okno:not([hidden])').waitFor();
      assert.ok(await page.locator('.pm-vstup').evaluate((n) => n === document.activeElement), 'po otevření má fokus pole');
      await page.locator('.pm-vstup').fill('Jak zapnu upozornění na telefon?');
      await page.keyboard.press('Enter');
      await page.locator('.pm-cil').first().waitFor();
      await page.screenshot({ path: `${out}/${typ}-pomocnik-jak.png` });
      // Pomalý stroj: Nastavení dočte data až po chvíli, mezitím člověk píše další dotaz.
      const pomalu = (route) => (route.request().method() === 'GET' ? new Promise((r) => setTimeout(r, 700)).then(() => route.continue()) : route.continue());
      await page.route('**/api/**', pomalu);
      await page.locator('.pm-cil').first().click();
      await page.waitForFunction(() => location.hash.startsWith('#/nastaveni'));
      // „Najdi chat …“ → konverzace z přehledu jde otevřít.
      await page.locator('.pm-vstup').fill('najdi chat, kde jsme řešili migraci API');
      // Zvýraznění v Nastavení doběhne až po načtení dat a fokus psaní nesmí ukrást (Enter by přepnul nastavení).
      await page.locator('.is-called-out').first().waitFor();
      await page.waitForTimeout(600);
      assert.ok(await page.locator('.pm-vstup').evaluate((n) => n === document.activeElement), 'psaní v pomocníkovi drží fokus i po skoku do Nastavení');
      await page.unroute('**/api/**', pomalu);
      await page.keyboard.press('Enter');
      await page.locator('.pm-vysledek').first().waitFor({ timeout: 10000 }).catch(async () => {
        const stav = await page.evaluate(() => ({
          hash: location.hash,
          okno: document.querySelector('.pm-okno')?.hidden ? 'zavřené' : 'otevřené',
          fokus: document.activeElement?.className || document.activeElement?.tagName,
          zpravy: [...document.querySelectorAll('.pm-msg')].slice(-2).map((n) => n.innerText.slice(0, 200)),
        }));
        assert.fail(`${typ}: pomocník neukázal výsledek hledání – ${JSON.stringify(stav)}`);
      });
      assert.match(await page.locator('.pm-vysledek b').first().innerText(), /migrace API/i);
      await page.screenshot({ path: `${out}/${typ}-pomocnik-hledani.png` });
      await page.locator('.pm-vysledek a').first().click();
      await page.waitForFunction(() => location.hash.startsWith('#/agent/'));
      // Esc zavře a fokus se vrátí na tlačítko; rozhovor přežije zavření.
      await page.locator('.pm-fab').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.pm-okno').isHidden(), true, 'Esc zavře');
      await page.locator('.pm-fab').click();
      assert.ok(await page.locator('.pm-msg--ja').count() >= 2, 'rozhovor zůstal');
      await page.keyboard.press('Escape');

      // Nastavení: tlačítko nekoliduje s nadpisem; skrýt a zase zobrazit přepínačem.
      await page.goto(`${demo.url}/#/nastaveni`);
      await page.locator('.pm-fab').waitFor();
      const titulek = await page.locator('.page-title').boundingBox();
      const fab = await page.locator('.pm-fab').boundingBox();
      assert.ok(fab.y > titulek.y + titulek.height, 'tlačítko nekoliduje s nadpisem');
      await page.locator('[data-jump="set-ucet"]').click();
      await page.locator('[data-setting="pomocnikZobrazit"]').click();
      await page.waitForFunction(() => document.querySelector('.pomocnik')?.hidden === true);
      await page.locator('[data-setting="pomocnikZobrazit"]').click();
      await page.waitForFunction(() => document.querySelector('.pomocnik')?.hidden === false);

      for (const [w, h] of [[1440, 1000], [880, 1000], [375, 812]]) {
        await page.setViewportSize({ width: w, height: h });
        for (const r of ['prehled', 'agenti', 'nastaveni']) {
          await page.goto(`${demo.url}/#/${r}`);
          await page.waitForTimeout(300);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${typ} ${r} ${w}px přetéká`);
        }
        await page.goto(`${demo.url}/#/prehled`);
        await page.screenshot({ path: `${out}/${typ}-prehled-${w}.png` });
      }
      assert.deepEqual(errors, [], `${typ}: chyby v konzoli`);
      console.log(`PASS ${typ}: výběr agenta (klik, hledání, šipky, Enter, Esc, klik mimo), koncept zůstal, Spustit odeslal zadání, pomocník (jak zapnu → Nastavení, najdi chat → otevřít, Esc, skrytí v Nastavení), robot v panelu, zaoblený panel, bez přetečení, čistá konzole`);
      await ctx.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await demo.close();
}
