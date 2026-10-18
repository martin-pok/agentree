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
      // Okno upozornění: seznam se při překreslení shellu (změna spojení, agentů…) nesmí postavit
      // znovu, jinak posuvník uprostřed rolování skočí nahoru.
      await page.evaluate(async () => {
        const { state, emit } = await import('/js/state.js');
        state.alerts.items = Array.from({ length: 12 }, (_, i) => ({ id: `qa${i}`, title: `Upozornění ${i}`, body: `Text ${i}`, level: 'info', kind: 'x', at: Date.now() - i * 60000, read: false }));
        state.alerts.unread = 12;
        emit('alerts');
      });
      await page.locator('#bell').click();
      const seznam = page.locator('.pop-list');
      await seznam.waitFor();
      await seznam.evaluate((l) => { l.scrollTop = l.scrollHeight; });
      const predPrekreslenim = await seznam.evaluate((l) => l.scrollTop);
      assert.ok(predPrekreslenim > 40, `${typ}: seznam upozornění má co rolovat`);
      await page.evaluate(async () => { const { emit } = await import('/js/state.js'); emit('conn', 'sessions', 'alerts'); });
      await page.waitForTimeout(400);
      assert.equal(await seznam.evaluate((l) => l.scrollTop), predPrekreslenim, `${typ}: překreslení shellu vrátilo seznam upozornění nahoru`);
      await page.keyboard.press('Escape');
      await page.locator('.pop-list').waitFor({ state: 'hidden' });
      await page.evaluate(() => document.fonts.ready);

      // Při otevřeném zvonečku se smí posouvat seznam, nikdy dlouhá stránka pod ním.
      const initialScroll = await page.evaluate(() => {
        document.querySelector('#view').style.minHeight = '2000px';
        document.documentElement.style.scrollBehavior = 'auto';
        scrollTo(0, 20);
        document.documentElement.style.scrollBehavior = '';
        return scrollY;
      });
      await page.locator('#bell').click();
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY), 'hidden', `${typ}: pozadí upozornění je zamčené`);
      assert.equal(await page.evaluate(() => scrollY), initialScroll, `${typ}: otevření upozornění nemění polohu stránky`);
      const popCenter = await page.locator('.notif-pop').boundingBox();
      await page.mouse.move(popCenter.x + popCenter.width / 2, popCenter.y + 28);
      await page.mouse.wheel(0, 360);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => scrollY), initialScroll, `${typ}: kolečko nad hlavičkou upozornění nesmí posunout stránku`);
      await page.locator('.pop-list').evaluate((list) => {
        while (list.children.length < 12) list.append(list.firstElementChild.cloneNode(true));
      });
      const listCenter = await page.locator('.pop-list').boundingBox();
      await page.mouse.move(listCenter.x + listCenter.width / 2, listCenter.y + listCenter.height / 2);
      await page.mouse.wheel(0, 360);
      await page.waitForTimeout(180);
      assert.ok(await page.locator('.pop-list').evaluate((list) => list.scrollTop > 0), `${typ}: dlouhý seznam upozornění se posouvá`);
      assert.equal(await page.evaluate(() => scrollY), initialScroll, `${typ}: kolečko v seznamu nesmí posunout stránku`);
      await page.locator('.pop-list').evaluate((list) => { list.scrollTop = list.scrollHeight; });
      await page.mouse.wheel(0, 360);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => scrollY), initialScroll, `${typ}: konec seznamu upozornění nesmí posunout stránku`);
      await page.locator('#bell').click();
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY), 'hidden', `${typ}: zavření upozornění odemkne stránku`);
      assert.equal(await page.evaluate(() => scrollY), initialScroll, `${typ}: zavření upozornění nemění polohu stránky`);
      await page.evaluate(() => {
        document.querySelector('#view').style.minHeight = '';
        document.documentElement.style.scrollBehavior = 'auto';
        scrollTo(0, 0);
        document.documentElement.style.scrollBehavior = '';
      });

      // Pole pro zadání a výběr agenta.
      assert.equal(await page.locator('.lchip:visible').count(), 0, 'nabídka agentů je zavřená');
      await page.locator('[data-l-prompt]').fill('Ověř navigaci');
      await page.locator('.lpick-btn').click();
      assert.equal(await page.locator('.lpick-btn').getAttribute('aria-expanded'), 'true');
      assert.ok(await page.locator('[data-l-hledat]').evaluate((n) => n === document.activeElement), 'po otevření má fokus hledání');
      // Nabídka leží nad kartami pod ní (ne pod nimi) a ovládací prvky spouštěče mají stejnou výšku jako „Spustit“.
      const nahore = await page.locator('.lpick-pop').evaluate((pop) => {
        const r = pop.getBoundingClientRect();
        const bod = document.elementFromPoint(r.left + r.width / 2, r.bottom - 12);
        return Boolean(bod && pop.contains(bod));
      });
      assert.equal(nahore, true, `${typ}: nabídka agentů je přes obsah pod ní`);
      if ((page.viewportSize()?.width || 0) > 720) {
        const vysky = await page.evaluate(() => [...document.querySelectorAll('.launch-bar .lpick-btn, .launch-controls > *, .launch-go')].map((e) => Math.round(e.getBoundingClientRect().height)));
        assert.ok(vysky.length >= 4 && vysky.every((h) => h === 44), `${typ}: ovládací prvky spouštěče jsou 44 px (${vysky})`);
      }
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

      // Bubliny robotů: najetí na robota agenta → věta v bublině, která nic nezakryje;
      // klepnutí na robota u pozdravu → gesto a věta.
      await page.mouse.move(5, 5);
      const agentRobot = page.locator('.pb-agent-logo').first();
      await agentRobot.scrollIntoViewIfNeeded();
      await agentRobot.hover();
      await page.locator('.rb.is-in').waitFor();
      const kolize = await page.evaluate(() => {
        const b = document.querySelector('.rb').getBoundingClientRect();
        const robot = document.querySelector('.pb-agent-logo');
        return [...document.querySelectorAll('.sidebar, a, button, h1, h2, h3, p, .pb-agent-text')]
          .filter((el) => !el.contains(robot) && !robot.contains(el))
          .filter((el) => { const o = el.getBoundingClientRect(); return o.width && Math.min(b.right, o.right) > Math.max(b.left, o.left) + 1 && Math.min(b.bottom, o.bottom) > Math.max(b.top, o.top) + 1; })
          .map((el) => el.tagName + '.' + el.className);
      });
      assert.deepEqual(kolize, [], 'bublina robota nic nezakrývá');
      assert.ok((await page.locator('.rb-text').innerText()).length > 3, 'bublina má text');
      await page.screenshot({ path: `${out}/${typ}-bublina.png` });
      await page.mouse.move(5, 5);
      await page.waitForFunction(() => document.querySelector('.rb').hidden);
      await page.evaluate(() => scrollTo(0, 0));
      await page.locator('.home-robot').click();
      await page.locator('.rb.is-in').waitFor();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('.rb').hidden);

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
      // Zpožděný požadavek může doběhnout až po vypnutí zpomalení – pak ho už Playwright nechá projít sám.
      const pokracuj = (route) => route.continue().catch(() => {});
      const pomalu = (route) => (route.request().method() === 'GET' ? new Promise((r) => setTimeout(r, 700)).then(() => pokracuj(route)) : pokracuj(route));
      await page.route('**/api/**', pomalu);
      await page.locator('.pm-cil').first().click();
      await page.waitForFunction(() => location.hash.startsWith('#/nastaveni'));
      // „Najdi chat …“ → konverzace z přehledu jde otevřít.
      await page.locator('.pm-vstup').fill('najdi chat, kde jsme řešili migraci API');
      // Zvýraznění v Nastavení doběhne až po načtení dat a fokus psaní nesmí ukrást (Enter by přepnul nastavení).
      await page.locator('.is-called-out').first().waitFor();
      await page.waitForTimeout(600);
      const fokus = await page.evaluate(() => { const a = document.activeElement; return a === document.querySelector('.pm-vstup') ? 'ok' : `${a?.tagName}.${a?.className} ${a?.id || ''} ${a?.getAttribute?.('data-setting') || ''}`; });
      assert.equal(fokus, 'ok', 'psaní v pomocníkovi drží fokus i po skoku do Nastavení');
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

      // Notion: vzhled se upravuje pouze v detailu konkrétního agenta, nikoli z Přehledu.
      await page.locator('[data-agent-appearance]').waitFor();
      await page.locator('[data-agent-appearance]').click();
      await page.locator('.studio-dialog--single[open]').waitFor();
      assert.equal(await page.locator('.studio-dialog--single select').count(), 0, 'editor nikdy nevyvolá systémový dropdown');
      const dlg = page.locator('.studio-dialog--single');
      assert.equal(await dlg.locator('[data-pick="hat"]').count(), 12, 'záložka Hlava: žádná + 11 čepic');
      await dlg.locator('[data-pick="hat"][data-value="cap"]').click();
      await dlg.locator('[data-pick="color"][data-value="#367b68"]').click();
      await dlg.locator('input[name="nickname"]').fill('Testovací agent');
      assert.equal(await dlg.locator('[data-pick="hat"][data-value="cap"]').getAttribute('aria-pressed'), 'true');
      await dlg.locator('.studio-preview .robot-wear--head').waitFor();
      // Čepice, obličej a oblečení se kombinují. Převlek je oblečení na celé tělo: nahradí jen oblečení,
      // čepice i doplněk na obličej na něm zůstanou.
      await dlg.locator('[data-tab="face"]').click();
      await dlg.locator('[data-pick="face"][data-value="sunglasses"]').click();
      await dlg.locator('[data-tab="outfit"]').click();
      await dlg.locator('[data-pick="outfit"][data-value="scarf"]').click();
      assert.equal(await dlg.locator('.studio-preview .robot-wear').count(), 2, 'čepice + brýle sdílejí vrstvu hlavy, šála je další');
      await dlg.locator('[data-tab="costume"]').click();
      await dlg.locator('[data-pick="costume"][data-value="astronaut"]').click();
      assert.equal(await dlg.locator('[data-pick="costume"][data-value="astronaut"]').getAttribute('aria-pressed'), 'true');
      await dlg.locator('[data-tab="outfit"]').click();
      assert.equal(await dlg.locator('[data-pick="outfit"][data-value="none"]').getAttribute('aria-pressed'), 'true', 'převlek nahradí oblečení');
      await dlg.locator('[data-tab="hat"]').click();
      assert.equal(await dlg.locator('[data-pick="hat"][data-value="cap"]').getAttribute('aria-pressed'), 'true', 'čepice na převleku zůstane');
      await dlg.locator('[data-tab="face"]').click();
      assert.equal(await dlg.locator('[data-pick="face"][data-value="sunglasses"]').getAttribute('aria-pressed'), 'true', 'brýle na převleku zůstanou');
      await dlg.locator('[data-tab="outfit"]').click();
      await dlg.locator('[data-pick="outfit"][data-value="tee"]').click();
      await dlg.locator('[data-tab="costume"]').click();
      assert.equal(await dlg.locator('[data-pick="costume"][data-value="none"]').getAttribute('aria-pressed'), 'true', 'oblečení nahradí převlek');
      await dlg.locator('[data-tab="hat"]').click();
      // Klávesnice: šipky přepínají záložky.
      await dlg.locator('[data-tab="hat"]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await dlg.locator('[data-tab="face"]').getAttribute('aria-selected'), 'true');
      await dlg.locator('[data-tab="hat"]').click();
      if ((page.viewportSize()?.width || 0) > 720) {
        const rozmer = await dlg.evaluate((d) => ({ scroll: d.scrollHeight, vyska: d.clientHeight, okno: innerHeight }));
        assert.ok(rozmer.scroll <= rozmer.vyska + 1 && rozmer.vyska <= rozmer.okno, `${typ}: dialog vzhledu se vejde bez scrollování ${JSON.stringify(rozmer)}`);
      }
      await page.screenshot({ path: `${out}/${typ}-vzhled-agenta.png` });
      await page.evaluate(async () => { const { applyAppearance } = await import('/js/appearance.js'); applyAppearance('dark'); });
      await page.waitForFunction(() => !document.documentElement.classList.contains('meni-motiv'));
      await page.screenshot({ path: `${out}/${typ}-vzhled-agenta-tma.png` });
      await page.evaluate(async () => { const { applyAppearance } = await import('/js/appearance.js'); applyAppearance('light'); });
      await page.locator('.studio-dialog--single button[type="submit"]').click();
      await page.locator('.studio-dialog--single').waitFor({ state: 'detached' });
      await page.locator('.session-kicker .robot-wear').first().waitFor();
      await page.locator('[data-agent-appearance]').click();
      assert.equal(await page.locator('.studio-dialog--single input[name="nickname"]').inputValue(), 'Testovací agent', 'vzhled se uloží právě tomuto agentovi');
      await page.keyboard.press('Escape');
      await page.locator('.studio-dialog--single').waitFor({ state: 'detached' });
      // Kliknutí mimo okno ho zavře; kliknutí uvnitř (i na jeho okraj) ne.
      await page.locator('[data-agent-appearance]').click();
      await page.locator('.studio-dialog--single[open]').waitFor();
      await page.locator('.studio-dialog--single .look-stage').click();
      assert.equal(await page.locator('.studio-dialog--single[open]').count(), 1, 'kliknutí dovnitř okno nezavře');
      await page.mouse.click(4, 4);
      await page.locator('.studio-dialog--single').waitFor({ state: 'detached' });
      await page.goto(`${demo.url}/#/prehled`);
      assert.equal(await page.locator('.studio-customize').count(), 0, 'na Přehledu nesmí být globální editor');
      await page.goto(`${demo.url}/#/nastaveni`);

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
        await page.locator('.home-intro').waitFor();
        // Jednotná šířka obsahu: pozdrav, pole pro zadání i sekce Přehledu sedí přesně mezi levou
        // hranou nadpisu stránky a pravou hranou horní lišty – stejně jako každá jiná stránka.
        const hrany = await page.evaluate(() => {
          const r = (s) => document.querySelector(s)?.getBoundingClientRect();
          const levo = r('.page-title').left, pravo = r('.topbar').right;
          return ['.home-intro', '.launch-compose', '.home-dvojice', '.home-live']
            .filter((s) => r(s)?.width)
            .map((s) => [s, Math.round(r(s).left - levo), Math.round(r(s).right - pravo)])
            .filter(([, l, p]) => Math.abs(l) > 1 || Math.abs(p) > 1);
        });
        assert.deepEqual(hrany, [], `${typ} ${w}px: bloky Přehledu drží šířku obsahu`);
        await page.screenshot({ path: `${out}/${typ}-prehled-${w}.png` });
      }
      // Responzivita dialogu Vzhled agenta: telefon, telefon naležato, tablet a počítač. Nic nesmí přetékat,
      // „Uložit vzhled“ je vidět bez rolování, záložky jsou v jedné řadě a na dotyk aspoň 40 px vysoké.
      const stav = await (await fetch(`${demo.url}/api/state`)).json();
      const idAgenta = (stav.sessions || [])[0]?.id;
      assert.ok(idAgenta, `${typ}: ukázka má aspoň jednoho agenta`);
      for (const [nazev, w, h, dotyk] of [['telefon', 375, 667, true], ['telefon naležato', 812, 375, true], ['tablet', 768, 1024, true], ['počítač', 1440, 900, false]]) {
        const c = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: dotyk, isMobile: dotyk && w < 800 && typ === 'chromium', reducedMotion: 'reduce' });
        const pg = await c.newPage();
        const chybyOkna = [];
        pg.on('pageerror', (e) => chybyOkna.push(e.message));
        await pg.goto(`${demo.url}/#/agent/${encodeURIComponent(idAgenta)}`);
        await pg.locator('[data-agent-appearance]').click();
        const dd = pg.locator('.studio-dialog--single[open]');
        await dd.waitFor();
        const m = await dd.evaluate((x) => {
          const r = (e) => e.getBoundingClientRect();
          const tabs = [...x.querySelectorAll('.look-tab')].map(r);
          const dlg = r(x);
          const save = r(x.querySelector('button[type=submit]'));
          const scroll = x.querySelector('.look-scroll');
          return {
            vodorovne: x.scrollWidth > x.clientWidth + 1 || scroll.scrollWidth > scroll.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1,
            ulozitVidet: save.top >= 0 && save.bottom <= innerHeight + 1 && save.left >= 0 && save.right <= innerWidth + 1,
            vOkne: dlg.left >= -1 && dlg.right <= innerWidth + 1 && dlg.top >= -1 && dlg.bottom <= innerHeight + 1,
            radkyZalozek: new Set(tabs.map((t) => Math.round(t.top))).size,
            nejnizsiZalozka: Math.min(...tabs.map((t) => t.height)),
            nejuzsiDlazdice: Math.min(...[...x.querySelectorAll('.look-grid .look-tile')].map((t) => r(t).width)),
            zavrit: Math.min(r(x.querySelector('[data-close]')).width, r(x.querySelector('[data-close]')).height),
            pozadiZamcene: document.documentElement.classList.contains('look-open'),
          };
        });
        const kde = `${typ} ${nazev} ${w}x${h}`;
        assert.equal(m.vodorovne, false, `${kde}: dialog přetéká do strany`);
        assert.equal(m.ulozitVidet, true, `${kde}: Uložit vzhled musí být vidět bez rolování`);
        assert.equal(m.vOkne, true, `${kde}: dialog se vejde do okna`);
        assert.equal(m.radkyZalozek, 1, `${kde}: záložky v jedné řadě`);
        assert.ok(m.nejuzsiDlazdice >= 70, `${kde}: dlaždice jsou dost široké (${m.nejuzsiDlazdice})`);
        assert.ok(m.zavrit >= 40, `${kde}: tlačítko zavřít je aspoň 40 px`);
        assert.equal(m.pozadiZamcene, true, `${kde}: stránka pod oknem se nehýbe`);
        if (dotyk) assert.ok(m.nejnizsiZalozka >= 40, `${kde}: záložky mají aspoň 40 px (${m.nejnizsiZalozka})`);
        if (w < 721) {
          // Tah za úchyt: malý tah okno nezavře, velký ano (syntetické dotykové události, platí v Chromiu i WebKitu).
          const tah = (od, doY) => pg.locator('.look-grip').evaluate((g, [a, b]) => {
            const udalost = (typ2, y) => g.dispatchEvent(new PointerEvent(typ2, { pointerId: 7, pointerType: 'touch', clientX: 100, clientY: y, bubbles: true }));
            udalost('pointerdown', a); udalost('pointermove', b); udalost('pointerup', b);
          }, [od, doY]);
          await tah(100, 140);
          assert.equal(await pg.locator('.studio-dialog--single[open]').count(), 1, `${kde}: malý tah za úchyt okno nezavře`);
          await tah(100, 260);
          await pg.locator('.studio-dialog--single').waitFor({ state: 'detached' });
          assert.equal(await pg.evaluate(() => document.documentElement.classList.contains('look-open')), false, `${kde}: po zavření se stránka odemkne`);
        }
        assert.deepEqual(chybyOkna, [], `${kde}: chyby v konzoli`);
        await pg.screenshot({ path: `${out}/${typ}-vzhled-${nazev.replace(/ /g, '-')}.png` });
        await c.close();
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
