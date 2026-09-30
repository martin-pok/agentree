import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startTestServer, api } from '../test/helpers.mjs';
import { addTokens } from '../src/model.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.QA_OUTPUT_DIR || 'dist/qa';
await fs.mkdir(out, { recursive: true });
const results = [];
const engines = process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium', 'webkit'];

// Postranní panel: poslední položka nabídky (Nastavení) je celá vidět na každé výšce okna
// 620–1200 px při šířce 881, 1180 i 1440 px, česky i anglicky. Dřív se nabídka potichu rolovala
// a na okně 1440 × 950 Nastavení schovala celé. Měří se nejhorší obsah: dva řádky zdrojů tokenů,
// patička s hlášením o výpadku spojení a nakonec i víc zdrojů, než se kdy vypíše. Profil, který
// místo uvolňuje, se přitom nesmí oříznout – musí se přeskládat, ne „nějak vejít“. Zátěžový případ
// (patička o 48 px vyšší, jako by prohlížeč měřil písmo jinak) ověří, že profil místo ořezu
// zvolí menší podobu, nebo se schová celý.
//
// Po změně velikosti okna se měří až v ustáleném stavu: okno má novou velikost, panel výšku
// podle ní a rozvržení panelu se dva snímky po sobě nezměnilo. Hned po velké změně okna má i
// Chromium panel už v nové výšce, ale profil ještě ve staré podobě (avatar 80 px v kontejneru
// 60 px) – ustálí se až o snímek později. Pevné čekání proto nestačilo a WebKit na pomalém stroji
// měřil ještě během přeskládání (jednorázově „Nastavení skryté o 86 px“ při 1180 × 650).
async function zkontrolujPostranniPanel(browser, engine, errors) {
  const server = await startTestServer();
  try {
    for (const [id, app, provider] of [['a', 'Codex', 'openai'], ['b', 'Claude Code', 'anthropic'], ['c', 'Cursor', 'cursor']]) {
      const s = server.app.store.ensure({ connector: 'codex', localId: `qa-panel-${id}`, provider, app });
      Object.assign(s, { title: `QA panel ${id}`, lastAt: Date.now(), startedAt: Date.now() - 60000 });
      addTokens(s, Date.now(), { input: 1200000, output: 300000 });
      server.app.store.commit(s);
    }
    await api(server.url).send('PUT', '/api/settings', { welcomeCompleted: true, onboardingDismissed: true, lastSeenVersion: '999.0.0' });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
    for (const jazyk of ['cs', 'en']) {
      assert.equal((await api(server.url).send('PUT', '/api/settings', { language: jazyk })).status, 200);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`postranní panel ${jazyk}: ${e.message}`));
      await p.goto(`${server.url}/#/prehled`);
      await p.waitForFunction(() => document.querySelectorAll('.budget-src span').length === 2);
      await p.evaluate(() => document.fonts.ready);
      assert.equal(await p.evaluate(() => document.documentElement.lang), jazyk);
      const zmer = () => p.evaluate(() => {
        const sb = document.querySelector('.sidebar');
        const sbr = sb.getBoundingClientRect();
        const dole = sbr.bottom - parseFloat(getComputedStyle(sb).paddingBottom);
        const nav = document.querySelector('.nav');
        const nr = nav.getBoundingClientRect();
        const polozky = [...nav.querySelectorAll('a')].filter((a) => getComputedStyle(a).display !== 'none');
        const posledni = polozky.at(-1).getBoundingClientRect();
        const pr = document.querySelector('.profile').getBoundingClientRect();
        const obsah = document.querySelector('.profile-in');
        const schovany = getComputedStyle(obsah).visibility === 'hidden';
        const zdroje = document.querySelector('.budget-src');
        const popisek = document.querySelector('.budget-label');
        return {
          polozek: polozky.length,
          posledni: polozky.at(-1).getAttribute('href'),
          skryto: Math.round(Math.max(0, posledni.bottom - Math.min(nr.bottom, dole), nr.top - posledni.top)),
          roluje: nav.scrollHeight > nav.clientHeight + 1,
          paticka: Math.round(Math.max(0, document.querySelector('.side-foot').getBoundingClientRect().bottom - dole)),
          schovany,
          profil: schovany ? 0 : Math.round(Math.max(0, obsah.getBoundingClientRect().bottom - pr.bottom)),
          pres: Math.round(Math.max(0, pr.bottom - nr.top)),
          radkyZdroju: zdroje && getComputedStyle(zdroje).display !== 'none' ? Math.round(zdroje.getBoundingClientRect().height / 16.8) : 0,
          popisekUseknuty: !schovany && popisek.scrollWidth > popisek.clientWidth + 1,
        };
      });
      const chyby = [];
      for (const [pripad, priprava] of [
        ['', () => {}],
        // Patička s hlášením o výpadku spojení je nejvyšší, jakou může mít.
        [' bez spojení', () => document.getElementById('side-foot').insertAdjacentHTML('afterbegin', '<span class="source-state" data-qa-panel><i class="dot dot--down"></i>Bez spojení se serverem</span>')],
        // K tomu víc zdrojů, než aplikace vypisuje: rozpis má i tak nejvýš dva celé řádky.
        [' bez spojení a se šesti zdroji', () => { document.querySelector('.budget-src').insertAdjacentHTML('beforeend', '<span data-qa-panel>Gemini CLI <b>1 M</b></span><span data-qa-panel>Qwen Code <b>1 M</b></span><span data-qa-panel>Copilot CLI <b>1 M</b></span><span data-qa-panel>Ollama <b>1 M</b></span>'); }],
        // Zátěž: patička o 48 px vyšší. Profil smí ustoupit do menší podoby nebo se schovat, ne oříznout.
        [' s patičkou vyšší o 48 px', () => document.getElementById('side-foot').insertAdjacentHTML('beforeend', '<div data-qa-panel style="height:48px"></div>')],
      ]) {
        await p.evaluate(priprava);
        for (const sirka of [881, 1180, 1440]) {
          for (let vyska = 620; vyska <= 1200; vyska += 30) {
            await p.setViewportSize({ width: sirka, height: vyska });
            await p.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h
              && Math.abs(document.querySelector('.sidebar').getBoundingClientRect().height - (h - 96)) < 1, [sirka, vyska]);
            await p.evaluate(() => new Promise((hotovo) => {
              const podpis = () => ['.sidebar', '.profile', '.profile-in', '.profile-in .avatar', '.nav', '.side-foot']
                .map((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? `${r.top},${r.width},${r.height}` : '-'; }).join('|');
              let pred = '';
              let stejne = 0;
              (function snimek() {
                const ted = podpis();
                stejne = ted === pred ? stejne + 1 : 0;
                pred = ted;
                if (stejne >= 2) hotovo(); else requestAnimationFrame(snimek);
              })();
            }));
            const m = await zmer();
            const kde = `${engine} ${jazyk} ${sirka}×${vyska}${pripad}`;
            if (m.polozek !== 8 || !/nastaveni$/.test(m.posledni)) chyby.push(`${kde}: v nabídce je ${m.polozek} položek, poslední ${m.posledni}`);
            if (m.skryto || m.roluje) chyby.push(`${kde}: Nastavení je skryté o ${m.skryto} px${m.roluje ? ', nabídka roluje' : ''}`);
            if (m.paticka) chyby.push(`${kde}: patička přečnívá z panelu o ${m.paticka} px`);
            if (m.profil) chyby.push(`${kde}: profil je oříznutý o ${m.profil} px`);
            // V běžném stavu má panel na každé výšce místo aspoň na profil na jeden řádek.
            if (!pripad && m.schovany) chyby.push(`${kde}: profil se schoval, ač má být vidět`);
            if (m.pres) chyby.push(`${kde}: profil zasahuje do nabídky o ${m.pres} px`);
            if (m.radkyZdroju > 2) chyby.push(`${kde}: rozpis zdrojů má ${m.radkyZdroju} řádky`);
            if (m.popisekUseknuty) chyby.push(`${kde}: popisek dnešních tokenů je uříznutý`);
          }
        }
      }
      await p.close();
      assert.deepEqual(chyby, [], `${engine}: postranní panel\n${chyby.join('\n')}`);
    }
    await ctx.close();
  } finally {
    await server.close();
  }
}

// Proces bez přepisu není konverzace. Musí mít vlastní ověřený stav, bez falešného „čeká na
// zadání“, bez otevření aplikace a bez přiřazení k projektu. Po skončení se místo obecného 404
// zobrazí přesný důvod. Výpis procesů je řízený, takže QA nečte data z počítače, na kterém běží.
async function zkontrolujProcesBezPrepisu(browser, engine, errors) {
  const vypisProcesu = async () => ({ ok: true, stdout: ' 4242 00:01 0.0 100 /usr/local/bin/claude' });
  const server = await startTestServer({ AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '60000' }, { vypisProcesu });
  try {
    // Snímek má kontrolovat detail procesu, ne překrytý úvodní průvodce nového profilu.
    await api(server.url).send('PUT', '/api/settings', { welcomeCompleted: true, onboardingDismissed: true, lastSeenVersion: '999.0.0' });
    const id = 'claude-code:proces-4242';
    await new Promise((resolve, reject) => {
      const end = Date.now() + 3000;
      (async function check() {
        if (server.app.store.summary(id)) return resolve();
        if (Date.now() > end) return reject(new Error(`${engine}: proces bez přepisu se neobjevil`));
        setTimeout(check, 25);
      })();
    });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`proces bez přepisu: ${e.message}`));
    await page.goto(`${server.url}/#/agent/${encodeURIComponent(id)}`);
    await page.getByText('Detekovaný proces bez přepisu', { exact: true }).waitFor();
    assert.equal(await page.getByText('Čeká na zadání', { exact: true }).count(), 0, `${engine}: proces se vydává za čekající konverzaci`);
    assert.equal(await page.locator('[data-open-target], [data-action="assign"]').count(), 0, `${engine}: proces nabízí akci pro neexistující konverzaci`);
    assert.equal(await page.getByText('Bez přepisu nelze ověřit hlavního ani pomocného agenta.', { exact: true }).count(), 1, `${engine}: detail procesu nepopisuje hranici jistoty`);
    await page.screenshot({ path: `dist/qa/${engine}-detected-process.png` });
    server.app.store.remove(id);
    await page.reload();
    await page.getByText('Detekovaný proces už není aktivní', { exact: true }).waitFor();
    await page.getByText('Detekovaný proces už v přehledu není. Pokud vytvořil přepis, najdeš ho mezi agenty.', { exact: true }).waitFor();
    await ctx.close();
  } finally {
    await server.close();
  }
}

for (const engine of engines) {
  console.log(`QA ${engine}`);
  const server = await startTestServer();
  const sample = server.app.store.ensure({ connector: 'codex', localId: 'qa-layout', provider: 'openai', app: 'Codex' });
  Object.assign(sample, { title: 'QA – kontrola rozložení', lastAt: Date.now(), startedAt: Date.now() - 60000 });
  addTokens(sample, Date.now(), { input: 1200000, output: 300000 });
  server.app.store.commit(sample);
  const failed = server.app.store.ensure({ connector: 'codex', localId: 'qa-failed-no-question', provider: 'openai', app: 'Codex' });
  Object.assign(failed, { title: 'QA – limit zastavil agenta', lastAt: Date.now(), failure: { at: Date.now(), text: 'Limit vyčerpán' } });
  server.app.store.commit(failed);
  assert.equal((await api(server.url).send('POST', '/api/projects', { name: 'QA projekt' })).status, 201);
  for (const [id, label, pct] of [['five', 'Limit 5 h', 8], ['week', 'Týdenní limit', 1]]) server.app.store.setLimit({ id, label, app: 'Codex', provider: 'openai', usedPercent: pct, at: Date.now(), resetsAt: Date.now() + 86400000 });
  const browser = await (engine === 'chromium' ? chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) : webkit.launch());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.error(`${engine}: ${page.url()}\n${e.stack || e.message}`); });
  page.on('requestfailed', (r) => { if (r.resourceType() === 'script') console.error(`${engine}: modul ${r.url()} ${r.failure()?.errorText}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('500') && !m.text().includes('net::')) errors.push(m.text()); });
  // Prove fonts and UI require no internet.
  await context.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
  try {
    await page.goto(server.url);
    await page.locator('.welcome-dialog[open]').waitFor();
    await page.screenshot({ path: `dist/qa/${engine}-welcome.png` });
    const welcomeSteps = await page.locator('.welcome-dots span').count();
    assert.ok(welcomeSteps >= 2, 'průvodce má skutečný postup');
    for (let i = 0; i < welcomeSteps - 1; i++) {
      await page.locator('[data-welcome-next]').click();
      await page.waitForFunction((n) => document.querySelectorAll('.welcome-dots span')[n]?.getAttribute('aria-current') === 'step', i + 1);
    }
    await page.route('**/api/settings', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"QA failure"}' }));
    await page.locator('[data-welcome-next]').click();
    await page.locator('.welcome-error:not([hidden])').waitFor();
    assert.equal(await page.locator('.welcome-dialog[open]').count(), 1);
    await page.unroute('**/api/settings');
    await page.locator('[data-welcome-next]').click();
    await page.locator('.welcome-dialog').waitFor({ state: 'detached' });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#conn-pill')?.textContent.includes('Připojeno'));
    await page.waitForFunction(() => document.querySelectorAll('img.logo').length >= 4);
    const malePismo = await page.evaluate(() => {
      const nodes = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const element = node.parentElement;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const size = Number.parseFloat(style.fontSize);
        if (size < 12) nodes.push({ text: node.textContent.trim().slice(0, 48), size, selector: element.tagName.toLowerCase() + (element.className ? `.${String(element.className).split(/\s+/u)[0]}` : '') });
      }
      return nodes;
    });
    assert.deepEqual(malePismo, [], `${engine}: viditelný text menší než 12 px: ${JSON.stringify(malePismo)}`);
    // Logo musí být skutečně dekódovatelné i po aktualizaci; dřívější roční HTTP cache
    // nechala v nativní aplikaci bílé kruhy místo značek služeb.
    const loga = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('img.logo')];
      await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
      return imgs.map((img) => ({ src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight }));
    });
    assert.ok(loga.length >= 4 && loga.every((img) => img.width > 0 && img.height > 0), `${engine}: některé logo se nevykreslilo: ${JSON.stringify(loga)}`);
    const obrazekPriAktualizaci = await page.evaluate(async () => {
      const { fill } = await import('/js/ui.js');
      const vzory = [...document.querySelectorAll('img.logo')].filter((img) => img.naturalWidth > 0);
      const druhy = vzory.find((img) => img.src !== vzory[0].src);
      if (!druhy) return null;
      const host = document.createElement('div');
      host.innerHTML = '<section data-region="qa-logo"></section>';
      document.body.append(host);
      const prvniHtml = vzory[0].outerHTML;
      fill(host, 'qa-logo', `${prvniHtml}<span>První stav</span>`);
      const prvni = host.querySelector('img');
      await prvni.decode();
      fill(host, 'qa-logo', `${prvniHtml}<span>Druhý živý stav</span>`);
      const zachovany = host.querySelector('img') === prvni && host.querySelector('img').naturalWidth > 0;
      fill(host, 'qa-logo', `${druhy.outerHTML}<span>Jiné logo</span>`);
      const zmeneny = host.querySelector('img') !== prvni;
      host.remove();
      return { zachovany, zmeneny };
    });
    assert.deepEqual(obrazekPriAktualizaci, { zachovany: true, zmeneny: true }, `${engine}: živá aktualizace ztratila dekódované logo nebo ponechala staré`);
    const obnova = page.waitForResponse((r) => r.url().endsWith('/api/connectors/rescan') && r.request().method() === 'POST');
    const adresaPredObnovou = page.url();
    await page.locator('#refresh-app').click();
    assert.equal((await obnova).status(), 200, `${engine}: tlačítko obnovy nespustilo nové načtení konektorů`);
    await page.waitForFunction(() => !document.querySelector('#refresh-app')?.disabled);
    assert.equal(page.url(), adresaPredObnovou, `${engine}: ruční obnova nesmí znovu načíst stránku`);
    await page.waitForFunction(() => document.querySelector('#conn-pill')?.textContent.includes('Připojeno'));
    assert.equal(await page.locator('.welcome-dialog[open]').count(), 0);
    for (const selector of ['.token-card', '.calm']) {
      assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
    }
    assert.equal(await page.locator('.pb-stat').nth(0).locator('b').textContent(), '0', `${engine}: selhání není otázka pro uživatele`);
    assert.equal(await page.locator('.pb-stat').nth(1).locator('b').textContent(), '1', `${engine}: selhání zůstává v hlavním pásu`);
    assert.equal(await page.locator('.decision').count(), 0, `${engine}: selhání se nesmí objevit mezi rozhodnutími`);
    assert.equal(await page.locator('.calm p').count(), 0, `${engine}: prázdný stav rozhodnutí nesmí slibovat zobrazení vyčerpaného limitu`);
    const prazdnyStav = await page.locator('.calm--empty').evaluate((el) => {
      const card = el.getBoundingClientRect();
      const content = el.querySelector('.calm-content').getBoundingClientRect();
      return { delta: Math.abs((card.left + card.width / 2) - (content.left + content.width / 2)), vertical: getComputedStyle(el.querySelector('.calm-content')).alignItems };
    });
    assert.ok(prazdnyStav.delta <= 1 && prazdnyStav.vertical === 'center', `${engine}: prázdný stav rozhodnutí není vycentrovaný: ${JSON.stringify(prazdnyStav)}`);
    const odsazeniOdznaku = await page.locator('.nav [data-nav="upozorneni"]').evaluate((item) => {
      const row = item.getBoundingClientRect();
      const badge = item.querySelector('.nav-badge').getBoundingClientRect();
      return Math.round((row.right - badge.right) * 10) / 10;
    });
    assert.equal(odsazeniOdznaku, 12, `${engine}: odznak upozornění musí mít stejný pravý vizuální odstup od pilulky`);
    assert.equal(await page.locator('.metric-note, .lwin-hint, .token-card .note').count(), 0, `${engine}: Přehled znovu ukazuje dlouhé vysvětlivky`);
    assert.match(await page.locator('.budget-label').getAttribute('aria-label'), /Zaznamenané tokeny dnes/);
    await page.locator('.pb-stat').nth(1).click();
    await page.waitForURL('**/#/agenti?stav=failed');
    await page.locator('[data-region="table"] .row:not(.row-head)').first().waitFor();
    assert.equal(await page.locator('[data-region="table"] .row:not(.row-head)').count(), 1, `${engine}: klik na selhání filtruje skutečně selhané agenty`);
    await page.goto(`${server.url}/#/prehled`);
    await page.locator('.token-card').waitFor();
    // Změna, kterou server sám nevyslal do SSE, se po návratu nativního okna do popředí musí
    // propsat bez kliknutí na obnovu. Simulujeme ji přímo v úložišti testovacího serveru.
    server.app.datastore.data.settings.avatar = 7;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.querySelector('[data-face]')?.dataset.face === '7');
    const projectPicker = page.locator('[data-l-project] + .picker-trigger');
    assert.ok(await projectPicker.evaluate(el => parseFloat(getComputedStyle(el).paddingRight) >= 16));
    await projectPicker.screenshot({ path: `dist/qa/${engine}-project-picker.png` });
    await projectPicker.click();
    const pickerMenu = page.locator('.picker-menu');
    await pickerMenu.waitFor();
    assert.equal(await projectPicker.evaluate(el => getComputedStyle(el).boxShadow), 'none', `${engine} otevřený picker nekreslí druhý obrys`);
    const [sourceBox, menuBox] = await Promise.all([projectPicker.boundingBox(), pickerMenu.boundingBox()]);
    assert.ok(menuBox.y >= sourceBox.y + sourceBox.height + 6, `${engine} nabídka začíná až pod zdrojem`);
    assert.equal(await pickerMenu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(18, r.height / 2))?.closest('.picker-menu') === el;
    }), true, `${engine} nabídka je v horní vrstvě`);
    await page.screenshot({ path: `dist/qa/${engine}-project-picker-open.png` });
    await page.evaluate(() => {
      const chart = document.querySelector('[data-region="chart"]');
      window.__qaChartMutations = 0;
      new MutationObserver((entries) => { window.__qaChartMutations += entries.length; }).observe(chart, { childList: true, subtree: true });
    });
    for (let i = 0; i < 12; i++) {
      sample.tokens.input += 1;
      sample.hourly[new Date().toISOString().slice(0, 13)] = (sample.hourly[new Date().toISOString().slice(0, 13)] || 0) + 1;
      sample.lastAt = Date.now();
      server.app.store.commit(sample);
      await page.waitForTimeout(35);
    }
    await page.waitForTimeout(550);
    assert.equal(await pickerMenu.count(), 1, `${engine} živá data nezavřou otevřený picker`);
    assert.equal(await projectPicker.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.evaluate(() => window.__qaChartMutations <= 4), `${engine} graf se nepřekresluje při každé živé události`);
    await page.keyboard.press('Escape');
    await pickerMenu.waitFor({ state: 'detached' });
    // Long project names must truncate without pushing the chevron out of the pill.
    await page.evaluate(() => {
      const select = document.querySelector('[data-l-project]');
      select.options[0].textContent = 'Dlouhý název projektu pro kontrolu bezpečného odsazení';
      select.dispatchEvent(new Event('change'));
    });
    assert.ok(await projectPicker.evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.evaluate(() => { const s = document.querySelector('[data-l-project]'); s.options[0].textContent = 'Bez projektu'; s.dispatchEvent(new Event('change')); });
    await page.locator('[data-action="period"] + .picker-trigger').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-action="period"]').inputValue(), 'month');
    await page.locator('[data-action="period"] + .picker-trigger').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.picker-menu').count(), 0);
    await page.screenshot({ path: `dist/qa/${engine}-overview.png`, fullPage: true });
    // Nabídka na monitoru na výšku musí vypadat stejně jako na šířku – jinak uživatel přechází
    // mezi dvěma různými aplikacemi podle toho, jak má otočený monitor.
    const vzhledNabidky = () => page.evaluate(() => {
      const aktivni = document.querySelector('.nav a[aria-current="page"]');
      const bezny = [...document.querySelectorAll('.nav a')].find((a) => !a.hasAttribute('aria-current'));
      const st = (el, pseudo) => { const c = getComputedStyle(el, pseudo); return [c.backgroundColor, c.color, c.fontWeight, c.fontSize, c.borderRadius, c.padding, c.width].join('|'); };
      const sb = document.querySelector('.sidebar').getBoundingClientRect();
      const r = bezny.getBoundingClientRect();
      return { aktivni: st(aktivni), bezny: st(bezny), pruh: st(aktivni, '::before'), odstup: `${Math.round(r.left - sb.left)}/${Math.round(sb.right - r.right)}` };
    });
    const naSirku = await vzhledNabidky();
    await page.setViewportSize({ width: 1440, height: 2560 });
    await page.waitForTimeout(400);
    const naVysku = await vzhledNabidky();
    for (const klic of ['aktivni', 'bezny', 'odstup']) {
      assert.equal(naVysku[klic], naSirku[klic], `${engine} nabídka na výšku (${klic}) vypadá jinak než na šířku`);
    }
    assert.equal(naVysku.pruh.split('|')[0], naSirku.pruh.split('|')[0], `${engine} označení aktivní stránky má jinou barvu`);
    assert.equal(await page.evaluate(() => { const a = [...document.querySelectorAll('.nav a')].map((x) => x.getBoundingClientRect()); return a.some((x, i) => i && x.top < a[i - 1].bottom - 0.5); }), false, `${engine} položky nabídky se překrývají`);
    assert.equal(await page.evaluate(() => { const n = document.querySelector('.nav'); return n.scrollHeight > n.clientHeight + 1; }), false, `${engine} nabídka se na výšku musí vejít bez rolování`);
    await page.screenshot({ path: `dist/qa/${engine}-portrait-rest.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await page.locator('.launch-kbd kbd').evaluateAll((nodes) => nodes.length === 2 && nodes.every((el) => getComputedStyle(el).color === 'rgb(255, 255, 255)')), true, `${engine} zkratka má kontrast`);
    await page.locator('[data-action="palette"]').click();
    const paletteOptions = page.locator('.palette-list [role="option"]');
    await page.evaluate(() => {
      window.__qaPaletteMutations = 0;
      new MutationObserver((entries) => { window.__qaPaletteMutations += entries.filter((entry) => entry.type === 'childList').length; }).observe(document.querySelector('.palette-list'), { childList: true, subtree: true });
    });
    await paletteOptions.nth(1).hover();
    assert.equal(await paletteOptions.nth(1).getAttribute('aria-selected'), 'true', `${engine} paleta reaguje na hover`);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.palette-list [role="option"][aria-selected="true"]')).backgroundColor !== 'rgba(0, 0, 0, 0)');
    assert.equal(await page.evaluate(() => window.__qaPaletteMutations), 0, `${engine} hover palety nepřepisuje seznam a nebliká`);
    await page.screenshot({ path: `dist/qa/${engine}-palette-hover.png` });
    await page.keyboard.press('Escape');
    await page.locator('.palette').waitFor({ state: 'hidden' });
    await page.goto(`${server.url}/#/utrata`);
    // Nabídka a kalendář v modálním okně (aria-modal) musí být uvnitř něj – co je mimo, prohlížeč
    // vyřadí ze stromu přístupnosti a čtečka obrazovky položky nepřečte. getByRole to vidí stejně.
    await page.locator('.toolbar button[data-action="add"]').click();
    await page.locator('.modal-scrim').waitFor();
    await page.locator('.modal button.picker-trigger[aria-label^="Služba"]').click();
    assert.ok(await page.getByRole('option').count() >= 10, `${engine} položky nabídky v okně jsou dostupné čtečce`);
    await page.getByRole('option', { name: 'Claude', exact: true }).click();
    assert.equal(await page.locator('.modal button.picker-trigger[aria-label^="Služba"]').getAttribute('aria-label'), 'Služba: Claude');
    // Vybraná položka se jmenuje jen „Claude“ – fajfka z CSS do názvu pro čtečku nepatří.
    await page.locator('.modal button.picker-trigger[aria-label^="Služba"]').click();
    assert.equal(await page.getByRole('option', { name: 'Claude', exact: true, selected: true }).count(), 1, `${engine} vybraná položka nemá v názvu fajfku`);
    await page.keyboard.press('Escape');
    await page.locator('.modal button.dd-date').click();
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.dd-cal')?.closest('.modal'))), true, `${engine} kalendář je uvnitř okna`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.dd-cal').count(), 0, `${engine} Esc zavře kalendář`);
    assert.equal(await page.locator('.modal-scrim').count(), 1, `${engine} Esc v kalendáři nezavře celé okno`);
    await page.keyboard.press('Escape');
    await page.locator('.modal-scrim').waitFor({ state: 'detached' });
    const budgetsButton = page.locator('button[data-action="budgets"]').first();
    await budgetsButton.click();
    await page.locator('.modal-scrim').waitFor();
    await page.locator('.modal [data-close]').first().click();
    await page.locator('.modal-scrim').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.matches('button[data-action="budgets"]')), true, `${engine} křížek zavře modal a vrátí fokus`);
    await budgetsButton.click();
    await page.locator('.modal-scrim').waitFor();
    await page.mouse.click(12, 12);
    await page.locator('.modal-scrim').waitFor({ state: 'detached' });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.modal-scrim').count(), 0, `${engine} click mimo modal jej zavře bez druhého dialogu`);
    await budgetsButton.click();
    await page.locator('.modal-scrim').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.modal-scrim').waitFor({ state: 'detached' });
    await page.goto(`${server.url}/#/agent/codex%3Aqa-layout`);
    await page.locator('.gauges--sm .gauge').first().waitFor();
    for (const width of [375, 900, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.locator('.gauges--sm').evaluate(el => [...el.querySelectorAll('.gauge')].every(g => {
        const dial = g.querySelector('.gauge-dial').getBoundingClientRect();
        const value = g.querySelector('.gauge-value').getBoundingClientRect();
        const label = g.querySelector('.gauge-label').getBoundingClientRect();
        const sub = g.querySelector('.gauge-sub').getBoundingClientRect();
        return value.top > dial.top + 16 && value.bottom < dial.bottom - 16 && label.top >= dial.bottom + 7 && sub.top >= label.bottom + 7;
      })), `${engine} ${width} gauge safe zone`);
    }
    await page.locator('.gauges--sm').screenshot({ path: `dist/qa/${engine}-limits-safe-zone.png` });
    for (const route of ['agenti', 'projekty', 'statistiky', 'utrata', 'upozorneni', 'nastaveni']) {
      await page.goto(`${server.url}/#/${route}`);
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine} desktop overflow ${route}`);
      assert.equal(await page.locator('select:visible').count(), 0, `${engine} native select visible ${route}`);
      if (route === 'projekty') assert.equal(await page.locator('.pcard--ghost').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
      if (route === 'nastaveni') {
        for (const id of ['perplexity', 'grok']) assert.equal(await page.locator(`[data-web-source="${id}"]`).count(), 1, `${engine} ${id} je samostatný webový zdroj`);
        const choices = await page.locator('[data-avatar-pick]').evaluateAll((nodes) => nodes.map((el) => ({ value: el.dataset.avatarPick, name: el.getAttribute('aria-label') || el.title || el.textContent.trim() })));
        assert.ok(choices.length >= 25, `${engine} zachovává iniciály a kolekci avatarů`);
        assert.equal(new Set(choices.map((choice) => choice.value)).size, choices.length, `${engine} každá volba má vlastní stabilní hodnotu`);
        assert.ok(choices.every((choice) => choice.name), `${engine} každá volba má přístupný název`);
        await page.click('.set-nav [data-jump="set-ucet"]'); // vzhled je ve skupině Účet a vzhled
        await page.locator('button[data-appearance="dark"]').click();
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
        // Theme paints optimistically; the selected button updates after saveSettings resolves.
        await page.waitForFunction(() => document.querySelector('button[data-appearance="dark"]')?.getAttribute('aria-pressed') === 'true');
        assert.equal(await page.locator('button[data-appearance="dark"]').getAttribute('aria-pressed'), 'true');
        const ratios = await page.evaluate(() => {
          const hex = (value) => {
            const match = value.trim().match(/^#([0-9a-f]{6})$/i);
            if (!match) throw new Error(`Neplatná barva ${value}`);
            return [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255).map((part) => part <= .04045 ? part / 12.92 : ((part + .055) / 1.055) ** 2.4);
          };
          const luminance = (value) => { const [r, g, b] = hex(value); return .2126 * r + .7152 * g + .0722 * b; };
          const ratio = (foreground, background) => (Math.max(luminance(foreground), luminance(background)) + .05) / (Math.min(luminance(foreground), luminance(background)) + .05);
          const css = getComputedStyle(document.documentElement);
          const v = (name) => css.getPropertyValue(name);
          return {
            body: ratio(v('--ink'), v('--card')),
            secondary: ratio(v('--ink-2'), v('--card')),
            muted: ratio(v('--mute'), v('--card')),
            teal: ratio(v('--teal-ink'), v('--teal-tint')),
            velvet: ratio(v('--velvet-ink'), v('--velvet-tint')),
            brass: ratio(v('--brass-ink'), v('--brass-tint')),
          };
        });
        for (const [name, ratio] of Object.entries(ratios)) assert.ok(ratio >= 4.5, `${engine} dark ${name} kontrast ${ratio.toFixed(2)}:1 je AA`);
        await page.screenshot({ path: `dist/qa/${engine}-dark-settings.png`, fullPage: true });
        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
        await page.goto(`${server.url}/#/prehled`);
        await page.waitForFunction(() => document.querySelector('#conn-pill')?.textContent.includes('Připojeno'));
        await page.screenshot({ path: `dist/qa/${engine}-dark-overview.png`, fullPage: true });
        const tmavaSirka = await page.locator('.nav a[aria-current="page"]').evaluate((el) => getComputedStyle(el).backgroundColor);
        await page.setViewportSize({ width: 1440, height: 2560 });
        await page.waitForTimeout(300);
        assert.equal(await page.locator('.nav a[aria-current="page"]').evaluate((el) => getComputedStyle(el).backgroundColor), tmavaSirka, `${engine} tmavý režim na výšku mění vzhled aktivní položky`);
        await page.screenshot({ path: `dist/qa/${engine}-dark-portrait-rest.png` });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${server.url}/#/nastaveni`);
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.click('.set-nav [data-jump="set-ucet"]');
        await page.locator('button[data-appearance="system"]').click();
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.appearance === 'system');
        await page.emulateMedia({ colorScheme: 'light' });
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
        await page.locator('button[data-appearance="light"]').click();
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'light' && document.documentElement.dataset.appearance === 'light');
        await page.setViewportSize({ width: 2528, height: 1390 });
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.set-main')).marginLeft === '200px');
        const settingsCenter = await page.locator('.set-main').evaluate((el) => {
          const box = el.getBoundingClientRect();
          return Math.abs(box.left + box.width / 2 - innerWidth / 2);
        });
        assert.ok(settingsCenter <= 2, `${engine} široké Nastavení je ve středu okna (odchylka ${settingsCenter}px)`);
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await page.screenshot({ path: `dist/qa/${engine}-${route}.png` });
    }
    await page.locator('[data-welcome]').click();
    await page.locator('[data-welcome-skip]').click();
    await page.locator('.welcome-dialog').waitFor({ state: 'detached' });
    for (const width of [375, 900, 1180]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['prehled', 'agenti', 'projekty', 'statistiky', 'utrata', 'nastaveni']) {
        await page.goto(`${server.url}/#/${route}`); await page.waitForTimeout(50);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine} ${width} overflow ${route}`);
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('[data-welcome]').click();
    await page.screenshot({ path: `dist/qa/${engine}-welcome-mobile.png` });
    assert.equal(await page.locator('.welcome-dialog').evaluate((el) => el.scrollWidth > el.clientWidth), false);
    await page.locator('[data-welcome-skip]').click();
    await page.locator('.welcome-dialog').waitFor({ state: 'detached' });
    const snapshot = await api(server.url).get('/api/state');
    assert.equal(snapshot.body.settings.welcomeCompleted, true);
    // Menu Nastavení přepíná skupiny a nic se přitom nehne: nadpis, menu ani stránka. Dřív klik
    // posunul stránku ke kotvě a nadpis „Nastavení“ odjel z obrazovky.
    for (const [sirka, vyska] of [[1440, 900], [375, 812]]) {
      await page.setViewportSize({ width: sirka, height: vyska });
      await page.goto(`${server.url}/#/nastaveni`);
      // WebKit dokončuje asynchronní boot.js až po load. Reload před připojením zrušil
      // jeho health probe a vyvolal chybu importu ve starém dokumentu. Nejprve dokončit start.
      await page.waitForFunction(() => document.querySelector('#conn-pill')?.textContent.includes('Připojeno'));
      await page.reload();
      await page.locator('.settings2').waitFor();
      await page.waitForFunction(() => document.querySelector('#conn-pill')?.textContent.includes('Připojeno'));
      await page.waitForTimeout(300);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      const poloha = () => page.evaluate(() => ({
        y: scrollY,
        nadpis: Math.round(document.getElementById('page-title').getBoundingClientRect().top),
        menu: Math.round(document.querySelector('.set-nav').getBoundingClientRect().top),
      }));
      const pred = await poloha();
      const skupiny = await page.$$eval('.set-nav [data-jump]', (b) => b.map((x) => x.dataset.jump));
      for (const skupina of [...skupiny.slice(1), skupiny[0]]) {
        await page.click(`.set-nav [data-jump="${skupina}"]`);
        await page.waitForTimeout(100);
        assert.deepEqual(await poloha(), pred, `${engine} ${sirka}: klik na ${skupina} v menu Nastavení pohnul stránkou`);
        assert.deepEqual(await page.$$eval('.set-group', (g) => g.filter((x) => !x.hidden).map((x) => x.id)), [skupina], `${engine} ${sirka}: ${skupina} neukázala svou skupinu`);
        assert.equal(await page.getAttribute(`.set-nav [data-jump="${skupina}"]`, 'aria-current'), 'true');
      }
      // Posunutý dolů v dlouhé skupině: menu zůstane, kde je, a nová skupina začne u něj.
      await page.evaluate(() => scrollTo({ top: 700, behavior: 'instant' }));
      await page.waitForTimeout(100);
      const menuPred = (await poloha()).menu;
      await page.click(`.set-nav [data-jump="${skupiny[1]}"]`);
      await page.waitForTimeout(100);
      const po = await page.evaluate(() => ({
        menu: Math.round(document.querySelector('.set-nav').getBoundingClientRect().top),
        skupina: Math.round(document.querySelector('.set-group:not([hidden])').getBoundingClientRect().top),
      }));
      assert.equal(po.menu, menuPred, `${engine} ${sirka}: posunuté menu Nastavení se po kliknutí pohnulo`);
      assert.ok(po.skupina >= 0 && po.skupina < vyska / 2, `${engine} ${sirka}: nová skupina nezačíná u menu (${po.skupina} px)`);
      await page.click(`.set-nav [data-jump="${skupiny.at(-1)}"]`);
      // Skok na kartu rozšíření odjinud (průvodce, „Co je nového“) ukáže její skupinu.
      await page.evaluate(() => { sessionStorage.setItem('agenteeq.jump', 'extension'); window.dispatchEvent(new Event('agenteeq-jump')); });
      await page.waitForFunction(() => !document.querySelector('[data-region="extension"]').closest('.set-group').hidden, null, { timeout: 3000 });
    }
    // Na širokém desktopu má svislé podmenu zůstat ve výšce, kde se otevřelo.
    // Původní sticky top: 24 px ho při dlouhé skupině vytáhl až k hornímu okraji
    // okna, zatímco hlavní postranní panel stál na místě.
    for (const [sirka, vyska] of [[375, 812], [1181, 620], [1440, 900], [1893, 1337]]) {
      await page.setViewportSize({ width: sirka, height: vyska });
      await page.goto(`${server.url}/#/nastaveni`);
      await page.locator('.settings2').waitFor();
      await page.waitForFunction(() => document.querySelector('#conn-pill')?.textContent.includes('Připojeno'));
      await page.locator('.set-nav [data-jump="set-propojeni"]').click();
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(100);
      const merit = () => page.evaluate(() => ({
        y: scrollY,
        nadpis: Math.round(document.getElementById('page-title').getBoundingClientRect().top),
        menu: Math.round(document.querySelector('.set-nav').getBoundingClientRect().top),
        posledni: Math.round(document.querySelector('.set-nav button:last-child').getBoundingClientRect().bottom),
        max: document.documentElement.scrollHeight - innerHeight,
      }));
      const vychozi = await merit();
      assert.equal(await page.locator('.topbar-actions').isVisible(), true, `${engine} ${sirka}: akce v horním řádku musí být nahoře dostupné`);
      assert.ok(vychozi.max > 300, `${engine} ${sirka}: dlouhé Nastavení se musí dát posouvat`);
      for (const y of [300, vychozi.max]) {
        // WebKit v CI po `behavior: 'instant'` polohu nastaví, ale ne v každém běhu
        // vyšle DOM událost scroll. Skutečné gesto ji vždy vyšle; zde ji doplníme, aby
        // test měřil stejnou cestu, která přepíná neblokující stav horní lišty.
        await page.evaluate((top) => { scrollTo({ top, behavior: 'instant' }); dispatchEvent(new Event('scroll')); }, y);
        await page.waitForTimeout(100);
        const po = await merit();
        assert.ok(po.y >= 299, `${engine} ${sirka}: stránka se neposunula (${po.y} px)`);
        assert.ok(Math.abs(po.menu - vychozi.menu) <= 1,
          `${engine} ${sirka}: podmenu vyjelo z ${vychozi.menu} na ${po.menu} px`);
        assert.ok(Math.abs(po.nadpis - vychozi.nadpis) <= 1,
          `${engine} ${sirka}: nadpis Nastavení vyjel z ${vychozi.nadpis} na ${po.nadpis} px`);
        assert.ok(po.posledni < vyska, `${engine} ${sirka}: poslední položka podmenu je mimo okno`);
        if (sirka > 1180) {
          assert.equal(await page.locator('.topbar-actions').isVisible(), false, `${engine} ${sirka}: horní akce při posunu překrývají karty`);
          const pruchozi = await page.evaluate(() => {
            const bar = document.querySelector('.topbar');
            const rect = bar.getBoundingClientRect();
            const content = document.querySelector('.set-main').getBoundingClientRect();
            const zasah = document.elementFromPoint(content.left + 32, rect.top + rect.height / 2);
            return getComputedStyle(bar).backgroundColor === 'rgba(0, 0, 0, 0)' && !bar.contains(zasah);
          });
          assert.ok(pruchozi, `${engine} ${sirka}: prázdný pás zakrývá obsah nebo blokuje kliknutí`);
        }
        if (sirka === 1440 && y === vychozi.max) await page.screenshot({ path: `dist/qa/${engine}-settings-scrolled.png` });
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.topbar-actions')).visibility === 'visible');
      await page.locator('#refresh-app').focus();
      assert.equal(await page.locator('#refresh-app').evaluate((el) => document.activeElement === el), true, `${engine} ${sirka}: obnovené akce nejdou ovládat klávesnicí`);
      await page.evaluate(() => scrollTo({ top: 300, behavior: 'instant' }));
      // Po posunu musí zůstat přepnutí skupin dostupné bez návratu nahoru.
      await page.locator('.set-nav [data-jump="set-ucet"]').click();
      assert.equal(await page.locator('.set-nav [data-jump="set-ucet"]').getAttribute('aria-current'), 'true');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Plynulé posouvání (public/js/plynule-posouvani.js). Hlavní kontext běží s „omezit pohyb“,
    // kde se zapnout nesmí; na počítači bez omezení krok kolečka dojede plynule a přesně, hover
    // efekty se během posouvání vypnou a klik hned po posunu projde, zamčená stránka se nehne
    // a cizí posun (přepnutí obrazovky volá scrollTo) má před dojezdem přednost.
    assert.equal(await page.evaluate(() => 'plynule' in document.documentElement.dataset), false, `${engine}: plynulé posouvání se zapnulo i s „omezit pohyb“`);
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
      await ctx.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`plynulé posouvání: ${e.message}`));
      await p.goto(`${server.url}/#/nastaveni`);
      await p.locator('.settings2').waitFor();
      assert.equal(await p.evaluate(() => 'plynule' in document.documentElement.dataset), true, `${engine}: plynulé posouvání se v aplikaci nezapnulo`);
      // Karty Nastavení se plní až po prvním vykreslení; do té doby je stránka krátká.
      await p.waitForFunction(() => document.documentElement.scrollHeight - innerHeight > 1000, null, { timeout: 5000 })
        .catch(() => { throw new Error(`${engine}: Nastavení jsou na zkoušku posouvání krátká`); });
      // I první vstup musí fungovat z obnovené nenulové polohy, ne pouze odshora.
      await p.evaluate(() => scrollTo({ top: 120, behavior: 'instant' }));
      await p.waitForTimeout(50);
      await p.mouse.move(900, 500);
      const vzorky = p.evaluate(() => new Promise((hotovo) => {
        const v = [];
        let posouva = false;
        const t0 = performance.now();
        (function f() {
          v.push(scrollY);
          if (document.documentElement.classList.contains('is-scrolling')) posouva = true;
          if (performance.now() - t0 < 1500) requestAnimationFrame(f); else hotovo({ v, posouva });
        })();
      }));
      await p.mouse.wheel(0, 400);
      const { v, posouva } = await vzorky;
      const konec = v.at(-1);
      const mezi = new Set(v.filter((y) => y > 2 && y < konec - 2).map(Math.round)).size;
      assert.ok(Math.abs(konec - 520) <= 2, `${engine}: kolečko 400 px z polohy 120 v aplikaci dojelo na ${konec}`);
      assert.ok(mezi >= 5, `${engine}: posun kolečkem v aplikaci neběžel plynule (mezipoloh ${mezi})`);
      assert.ok(v.every((y, i) => i === 0 || y >= v[i - 1] - 0.5), `${engine}: dojezd v aplikaci se vracel`);
      assert.ok(posouva, `${engine}: během posouvání chybí html.is-scrolling (hover efekty se nevypnou)`);
      await p.waitForFunction(() => !document.documentElement.classList.contains('is-scrolling'));
      // Klik hned po posunu musí projít. Dřív obsah během posouvání vypínal ukazatel a WebKit, který
      // při kliknutí posune prvek do okna, klik pustil do prázdna (<main> zachytil ukazatel).
      const skladaci = p.locator('.view details.src-fold > summary').first();
      const bylOtevreny = await skladaci.evaluate((el) => el.parentElement.open);
      await skladaci.scrollIntoViewIfNeeded();
      await p.mouse.wheel(0, 60);
      await p.waitForTimeout(40);
      await skladaci.click({ force: true, timeout: 3000 }); // bez čekání na „klikatelnost“ – přesně jako člověk
      assert.equal(await skladaci.evaluate((el) => el.parentElement.open), !bylOtevreny, `${engine}: klik hned po posunu kolečkem nezabral`);
      await p.waitForFunction(() => !document.documentElement.classList.contains('is-scrolling'));

      // Horní akce se ve scrolovaném Nastavení schovají; vyhledávání zůstává
      // dostupné klávesovou zkratkou bez návratu nahoru.
      await p.keyboard.press('ControlOrMeta+k');
      await p.waitForFunction(() => document.body.classList.contains('has-modal'));
      const predZamkem = await p.evaluate(() => scrollY);
      await p.mouse.move(60, 860); // pozadí vyhledávání, ne jeho seznam – ten si kolečko vezme sám
      await p.mouse.wheel(0, 400);
      await p.waitForTimeout(400);
      assert.equal(await p.evaluate(() => scrollY), predZamkem, `${engine}: stránka pod otevřeným vyhledáváním dojížděla`);
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => !document.body.classList.contains('has-modal'));

      // Dojezd běží, když skript drží `scroll-behavior: auto` na <html> (spust → zastav v
      // public/js/plynule-posouvani.js) a okno se od výchozí polohy už pohnulo.
      const dojezdBezi = (od) => p.waitForFunction((y) => document.documentElement.style.scrollBehavior === 'auto' && Math.abs(scrollY - y) > 40, od, { timeout: 3000 })
        .catch(() => { throw new Error(`${engine}: dojezd po kolečku nezačal`); });
      // Cizí posun musí dojezd přerušit. Playwright ve WebKitu vrátí mouse.wheel dřív, než stránka
      // kolečko zpracuje (událost jde přes UI proces), takže po pevných 60 ms dojezd ještě nemusel
      // začít: kolečko pak přišlo až po skoku aplikace a správně rozjelo nový dojezd z 0 (ve WebKitu
      // 1124 px po 600 ms – přesně dojezd z 0 po ~300 ms). Proto skok až ve chvíli, kdy dojezd
      // prokazatelně běží, a pak čekat, až se sám zastaví.
      await p.mouse.move(900, 500);
      const predDojezdem = await p.evaluate(() => scrollY);
      await p.mouse.wheel(0, 1200);
      await dojezdBezi(predDojezdem);
      // Otestovat produkční skok aplikace (skocNa), ne napodobeninu v testu – a až ve chvíli,
      // kdy dojezd prokazatelně běží (WebKit doručí kolečko později, než Playwright vrátí wheel).
      const hnedPoSkoku = await p.evaluate(async () => {
        (await import('/js/plynule-posouvani.js')).skocNa(0);
        return scrollY;
      });
      assert.equal(hnedPoSkoku, 0, `${engine}: programový skok se neprovedl okamžitě`);
      await p.waitForFunction(() => document.documentElement.style.scrollBehavior === '', null, { timeout: 2000 })
        .catch(() => { throw new Error(`${engine}: dojezd se po skoku aplikace nezastavil`); });
      await p.waitForTimeout(300);
      assert.equal(await p.evaluate(() => scrollY), 0, `${engine}: dojezd přepsal posun, který udělala aplikace`);
      const koleckoDojede = async (krok, zprava) => {
        const pred = await p.evaluate(() => scrollY);
        const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        const cil = Math.min(max, Math.max(0, pred + krok));
        await p.mouse.move(900, 500);
        await p.mouse.wheel(0, krok);
        await p.waitForFunction((y) => Math.abs(scrollY - y) <= 2, cil, { timeout: 3000 })
          .catch(async () => {
            const zasah = await p.evaluate(() => {
              const casti = [];
              for (let el = document.elementFromPoint(900, 500); el && el !== document.body; el = el.parentElement) {
                const styl = getComputedStyle(el);
                casti.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${styl.overflowY} ${el.scrollHeight - el.clientHeight}px top=${el.scrollTop}`);
              }
              return casti.join(' > ');
            });
            throw new Error(`${engine}: ${zprava}, očekáváno ${cil}, skutečně ${pred} → kolečko se zablokovalo; pod kurzorem: ${zasah}`);
          });
        await p.waitForTimeout(100);
      };
      // Nestačí první kolečko od horního okraje. Starý dojezd po cizím posunu převzal
      // událost, ale před prvním snímkem ji zrušil kvůli zastaralé poloze.
      await koleckoDojede(240, 'kolečko po přerušení dojezdu skokem aplikace');
      await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' }));
      await koleckoDojede(-200, 'kolečko po posunu posuvníkem nebo odkazem');
      await p.keyboard.press('PageDown');
      await p.waitForTimeout(500);
      await koleckoDojede(-160, 'kolečko po posunu klávesnicí');
      // Změna obrazovky ruší dojezd a vrací okno nahoru; další vstup musí začít tam.
      const predPrepnutim = await p.evaluate(() => scrollY);
      await p.mouse.wheel(0, 320);
      await dojezdBezi(predPrepnutim);
      await p.evaluate(() => { location.hash = '#/prehled'; });
      await p.locator('.pulse-bar').waitFor();
      await p.evaluate(() => { location.hash = '#/nastaveni'; });
      await p.locator('.settings2').waitFor();
      await p.waitForFunction(() => document.documentElement.scrollHeight - innerHeight > 1000);
      await p.waitForTimeout(400);
      await koleckoDojede(240, 'kolečko po přepnutí obrazovky během dojezdu');
      // Krátké opakované kroky trackpadu a změna směru se nesmějí zaseknout.
      await p.evaluate(() => scrollTo({ top: 400, behavior: 'instant' }));
      await p.waitForTimeout(120);
      await p.evaluate(() => { window.agenteeqDesktop = true; });
      const predTrackpadem = await p.evaluate(() => scrollY);
      await p.mouse.wheel(0, 15);
      assert.ok(await p.evaluate((pred) => scrollY >= pred + 10, predTrackpadem), `${engine}: trackpad v desktopu reaguje se zpožděním`);
      for (let i = 0; i < 7; i++) await p.mouse.wheel(0, 15);
      await p.waitForFunction(() => Math.abs(scrollY - 520) <= 2);
      await koleckoDojede(-120, 'změna směru po malých krocích trackpadu');
      await p.waitForFunction(() => !document.documentElement.classList.contains('is-scrolling'));
      // Vnitřní seznam dostane kolečko nativně, hlavní stránka přitom stojí.
      await p.evaluate(() => {
        const box = document.createElement('div');
        box.id = 'qa-scroll-list';
        box.style.cssText = 'position:fixed;right:40px;top:350px;width:240px;height:150px;overflow:auto;z-index:100;background:white';
        box.innerHTML = '<div style="height:1200px">Posuvný seznam</div>';
        document.body.append(box);
      });
      const predSeznamem = await p.evaluate(() => scrollY);
      await p.mouse.move(1300, 400);
      await p.mouse.wheel(0, 160);
      await p.waitForFunction(() => document.querySelector('#qa-scroll-list').scrollTop > 0);
      assert.ok(Math.abs((await p.evaluate(() => scrollY)) - predSeznamem) <= 1, `${engine}: kolečko uvnitř seznamu posunulo stránku`);
      await p.evaluate(() => document.querySelector('#qa-scroll-list').remove());
      // Zapnutí omezení pohybu během dojezdu ho zastaví; další krok je okamžitý bez animace.
      await p.mouse.move(900, 500);
      const predOmezenim = await p.evaluate(() => scrollY);
      await p.mouse.wheel(0, 300);
      await dojezdBezi(predOmezenim); // jinak by ve WebKitu kolečko mohlo dorazit až po zapnutí omezení
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.waitForFunction(() => !('plynule' in document.documentElement.dataset));
      await p.waitForTimeout(80);
      const poOmezeni = await p.evaluate(() => scrollY);
      await p.waitForTimeout(250);
      assert.equal(await p.evaluate(() => scrollY), poOmezeni, `${engine}: dojezd ignoruje zapnuté omezení pohybu`);
      await p.evaluate(() => scrollTo({ top: 400, behavior: 'instant' }));
      await p.waitForTimeout(120);
      const predNativnim = await p.evaluate(() => scrollY);
      assert.ok(predNativnim >= 390, `${engine}: není odkud ověřit přímý posun nahoru`);
      await p.mouse.move(900, 500);
      await p.mouse.wheel(0, -100);
      await p.waitForFunction((y) => scrollY < y - 20, predNativnim, { timeout: 3000 });
      await ctx.close();
    }
    await zkontrolujPostranniPanel(browser, engine, errors);
    await zkontrolujProcesBezPrepisu(browser, engine, errors);
    assert.deepEqual(errors, []);
    results.push({ engine, passed: true, cases: ['onboarding 4 steps', 'save failure and retry', 'completion survives reload', 'picker open-layer and escape', 'live updates preserve picker and throttle chart', 'foreground refresh updates the open UI without reload', 'budget modal close button, overlay and Escape', 'centered empty decision state and sidebar badge inset', 'sidebar nav fully visible 620–1200 px (881/1180/1440, cs/en, offline, 6 sources)', 'web sources Perplexity and Grok', '24 local avatars', 'light/dark/system persistence and AA tokens', 'centered settings at 2528 px', 'all routes', 'no native selects', '375/900/1180/1440 layout', 'smooth wheel scrolling', 'detected process truthfulness', 'offline fonts', 'zero JS errors'] });
  } catch (error) {
    await page.screenshot({ path: `dist/qa/${engine}-failure.png` });
    await fs.writeFile(`dist/qa/${engine}-failure.txt`, `${error.stack || error}\n`);
    console.log(JSON.stringify({ engine, errors, welcome: await page.locator('.welcome-dialog').textContent().catch(() => 'closed') }));
    console.error(error.stack || error);
    throw error;
  } finally { await browser.close(); await server.close(); }
}
await fs.writeFile('dist/qa/results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
