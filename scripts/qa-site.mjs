import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSite, hlavickyWebu } from './build-site.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { out } = await buildSite();
const hlavickyPro = await hlavickyWebu();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  for (const candidate of [rel, `${rel}/index.html`]) {
    const file = path.resolve(out, candidate);
    if (!file.startsWith(path.resolve(out) + path.sep)) break;
    try {
      const body = await fs.readFile(file);
      // Stejné hlavičky jako na hostingu (vercel.json): CSP a spol. se zkouší na skutečných stránkách.
      res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, ...hlavickyPro(new URL(req.url, 'http://localhost').pathname) }).end(body);
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
// Deterministic, read-only GitHub PUBLIC release metadata. QA must not depend on
// live internet, nor disable external-request blocking to test Preview links.
const PREVIEW_API = 'https://api.github.com/repos/martin-pok/agentree/releases?per_page=20';
// Podvržené vydání je vždy o jednu opravnou verzi novější než záložní odkaz v HTML, aby se
// přepnutí ověřilo i po každém dalším zveřejněném Preview. Žádné skutečné vydání nepředstírá.
const [, zalohaMajor, zalohaMinor, zalohaPatch] = (await fs.readFile(path.join(out, 'instalace', 'index.html'), 'utf8'))
  .match(/data-preview-version="(\d+)\.(\d+)\.(\d+)"/);
const NOVEJSI_PREVIEW = `${zalohaMajor}.${zalohaMinor}.${Number(zalohaPatch) + 1}`;
const PREVIEW_FIXTURE = JSON.stringify([{
  tag_name: `v${NOVEJSI_PREVIEW}`, draft: false, prerelease: true,
  assets: [{
    name: `Agenteeq-${NOVEJSI_PREVIEW}-macOS-arm64.dmg`,
    size: 50_000_000, digest: 'sha256:' + 'a'.repeat(64),
    browser_download_url: `https://github.com/martin-pok/agentree/releases/download/v${NOVEJSI_PREVIEW}/Agenteeq-${NOVEJSI_PREVIEW}-macOS-arm64.dmg`,
  }],
}]);
async function jenMistni(page, cizi) {
  await page.route('**/*', (route) => {
    const cil = route.request().url();
    if (cil === PREVIEW_API) return route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: PREVIEW_FIXTURE,
    });
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
      // Real platform paths: first paint, the correct download, keyboard switching,
      // language/install continuity, and the Windows instructions before Mac instructions.
      for (const platform of ['Win32', 'MacIntel']) {
        const expected = platform === 'Win32' ? 'windows' : 'mac';
        const p = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' });
        const errors = [];
        const external = [];
        await p.addInitScript(({ platform }) => {
          Object.defineProperty(navigator, 'platform', { configurable: true, value: platform });
          Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: platform === 'Win32' ? 'Windows' : 'macOS' } });
        }, { platform });
        await jenMistni(p, external);
        p.on('pageerror', error => errors.push(error.message));
        await p.goto(url);
        assert.equal(await p.locator('html').getAttribute('data-os'), expected, `${engine}: ${platform} detection`);
        assert.equal(await p.locator('.hero [data-stahnout]:visible').getAttribute('data-stahnout'), expected === 'windows' ? 'windows-x64' : 'mac-arm64');
        assert.match(await p.locator('.hero [data-stahnout]:visible').getAttribute('href'), expected === 'windows' ? /Agenteeq-Windows-x64\.zip$/ : /Agenteeq-macOS-arm64\.dmg$/);
        assert.equal(await p.locator('#vyzkouset .steps:visible').count(), 1, `${engine}: one install procedure`);
        await p.evaluate(async () => { for (const img of document.querySelectorAll('.detail img')) { img.loading = 'eager'; await img.decode().catch(() => {}); } });
        await p.screenshot({ path: path.join(output, `${engine}-${expected}-375-home.png`), fullPage: true });
        await p.locator(`[data-os-choice="${expected === 'windows' ? 'mac' : 'windows'}"]`).focus();
        await p.keyboard.press('Enter');
        assert.equal(await p.locator('html').getAttribute('data-os'), expected === 'windows' ? 'mac' : 'windows', `${engine}: manual switch`);
        await p.reload();
        assert.equal(await p.locator('html').getAttribute('data-os'), expected === 'windows' ? 'mac' : 'windows', `${engine}: switch persists`);
        await p.goto(`${url}/instalace`);
        assert.equal(await p.locator('html').getAttribute('data-os'), expected === 'windows' ? 'mac' : 'windows', `${engine}: install route keeps selection`);
        await p.locator('[data-os-choice="windows"]').click();
        assert.equal(await p.locator('.install-page .hero .install-hero-scene:visible').count(), 1, `${engine}: one hero diagram`);
        assert.equal(await p.locator('#windows').isVisible(), true, `${engine}: Windows installation visible`);
        assert.equal(await p.locator('#mac').isVisible(), false, `${engine}: Mac installation hidden on Windows`);
        assert.equal(await p.locator('.install-page .hero .specs:visible').count(), 1, `${engine}: one platform requirement`);
        assert.equal(await p.locator('#potize details:visible').count(), 4, `${engine}: Windows-specific installation help`);
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine}: Windows mobile overflow`);
        assert.equal(await p.locator('main > section').nth(1).getAttribute('id'), 'windows', `${engine}: Windows steps first`);
        await p.screenshot({ path: path.join(output, `${engine}-windows-375-install.png`), fullPage: true });
        if (expected === 'windows') {
          await p.setViewportSize({ width: 1440, height: 900 });
          await p.screenshot({ path: path.join(output, `${engine}-windows-1440-install.png`), fullPage: true });
          await p.goto(url);
          await p.screenshot({ path: path.join(output, `${engine}-windows-1440-home.png`), fullPage: true });
          await p.goto(`${url}/en`);
          assert.equal(await p.locator('html').getAttribute('data-os'), 'windows', `${engine}: English page keeps Windows`);
          assert.equal(await p.locator('.hero [data-stahnout]:visible').textContent(), 'Download for Windows');
          await p.goto(`${url}/en/install`);
          assert.equal(await p.locator('#windows').isVisible(), true, `${engine}: English Windows installation visible`);
          assert.equal(await p.locator('#mac').isVisible(), false, `${engine}: English Mac installation hidden`);
          await p.goto(`${url}/instalace#mac`);
          assert.equal(await p.locator('html').getAttribute('data-os'), 'mac', `${engine}: direct Mac anchor overrides Windows device preference`);
          assert.equal(await p.locator('#mac').isVisible(), true, `${engine}: direct Mac instructions visible`);
        }
        assert.deepEqual(errors, [], `${engine}: platform path errors`);
        assert.deepEqual(external, [], `${engine}: platform path external requests`);
        await p.close();
      }
      // Verify real browser/CSP integration, not merely the metadata parser.
      // Public metadata is intercepted above with an exact deterministic
      // fixture; the production site fetches only near the download block.
      {
        const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const cizi = [];
        const chyby = [];
        await jenMistni(p, cizi);
        p.on('pageerror', e => chyby.push(e.message));
        await p.goto(url + '/instalace');
        await p.locator('[data-preview-mac]').scrollIntoViewIfNeeded();
        await p.waitForFunction((verze) => document.querySelector('[data-preview-mac]')?.getAttribute('href')
          ?.includes(`/releases/download/v${verze}/`), NOVEJSI_PREVIEW, { timeout: 5000 });
        assert.equal(await p.locator('.preview-option[data-os-only="mac"] [data-preview-notes]').getAttribute('href'),
          `https://github.com/martin-pok/agentree/releases/tag/v${NOVEJSI_PREVIEW}`);
        assert.ok((await p.locator('.preview-option[data-os-only="mac"] [data-preview-label]').innerText()).includes(NOVEJSI_PREVIEW));
        assert.match(await p.locator('[data-stahnout="mac-arm64"]').first().getAttribute('href'),
          /releases\/latest\/download\/Agenteeq-macOS-arm64\.dmg/);
        assert.deepEqual(cizi, [], 'Preview must never fetch unrelated third-party resources');
        assert.deepEqual(chyby, [], 'Preview must not cause an unhandled browser exception');
        await p.close();
      }
      // Robot u karet soukromí sleduje myš jen při povoleném pohybu. Ověřené na
      // skutečně vykresleném SVG v obou jádrech, včetně návratu očí do středu.
      {
        const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
        await jenMistni(p, []);
        await p.goto(url);
        await p.locator('.privacy-peek').scrollIntoViewIfNeeded();
        const points = await p.evaluate(() => {
          const section = document.getElementById('soukromi').getBoundingClientRect();
          const robot = document.querySelector('[data-privacy-robot] .robot').getBoundingClientRect();
          return { left: section.left + 12, right: section.right - 12, y: Math.max(90, Math.min(innerHeight - 90, robot.top + robot.height / 2)) };
        });
        const gazeX = () => p.evaluate(() => parseFloat(document.querySelector('[data-privacy-robot] .robot').style.getPropertyValue('--gaze-x')));
        await p.mouse.move(points.left, points.y);
        await p.waitForFunction(() => parseFloat(document.querySelector('[data-privacy-robot] .robot').style.getPropertyValue('--gaze-x')) < -0.5);
        assert.ok(await gazeX() >= -3, `${engine}: oči překročily levý okraj`);
        await p.mouse.move(points.right, points.y);
        await p.waitForFunction(() => parseFloat(document.querySelector('[data-privacy-robot] .robot').style.getPropertyValue('--gaze-x')) > 0.5);
        assert.ok(await gazeX() <= 3, `${engine}: oči překročily pravý okraj`);
        assert.notEqual(await p.locator('.privacy-peek .robot-gaze').evaluate(el => getComputedStyle(el).transform), 'none', `${engine}: SVG oči se nepohybují`);
        await p.mouse.move(0, 0);
        await p.waitForFunction(() => !document.querySelector('[data-privacy-robot] .robot').style.getPropertyValue('--gaze-x'));
        await p.emulateMedia({ reducedMotion: 'reduce' });
        await p.mouse.move(points.right, points.y);
        assert.equal(await p.locator('.privacy-peek .robot-gaze').evaluate(el => getComputedStyle(el).transform), 'none', `${engine}: omezený pohyb nechal oči běžet`);
        await p.close();
      }
      for (const theme of ['light', 'dark']) {
        for (const width of [360, 375, 768, 900, 1440]) for (const stranka of ['/', '/en']) {
          const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce' });
          const errors = [];
          const cizi = [];
          await jenMistni(page, cizi);
          page.on('pageerror', e => errors.push(e.message));
          page.on('console', m => { if (m.type() === 'error' || /Content.Security.Policy|Permissions.Policy/i.test(m.text())) errors.push(m.text()); });
          page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
          await page.goto(url + (stranka === '/' ? '' : stranka));
          await page.evaluate(() => document.fonts.ready);
          assert.equal(await page.locator('h1').count(), 1);
          // Přepínač jazyka je v liště na každé šířce celý vidět, nic nepřekrývá a označuje
          // jazyk, který je právě otevřený.
          const lista = await page.evaluate(() => {
            const box = (s) => document.querySelector(s)?.getBoundingClientRect();
            const lang = box('.nav .lang'), cta = box('.nav .btn'), znacka = box('.nav .brand');
            const pres = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            return {
              videt: innerWidth <= 620 ? Boolean(document.querySelector('[data-mobile-menu-toggle]') && getComputedStyle(document.querySelector('[data-mobile-menu-toggle]')).display !== 'none') : Boolean(lang && lang.width > 0 && lang.left >= 0 && lang.right <= innerWidth),
              prekryv: Boolean(pres(lang, cta) || pres(lang, znacka)),
              jazyk: document.documentElement.lang,
              aktualni: document.querySelector(innerWidth <= 620 ? '.mobile-menu-languages [aria-current="page"]' : '.lang [aria-current="page"]')?.getAttribute('lang'),
            };
          });
          const cekanyJazyk = stranka === '/en' ? 'en' : 'cs';
          assert.equal(lista.videt, true, `${engine} ${theme} ${width} ${stranka}: přepínač jazyka není celý vidět`);
          assert.equal(lista.prekryv, false, `${engine} ${theme} ${width} ${stranka}: přepínač jazyka překrývá logo nebo tlačítko`);
          assert.deepEqual([lista.jazyk, lista.aktualni], [cekanyJazyk, cekanyJazyk], `${engine} ${theme} ${width} ${stranka}: jazyk stránky`);
          // Hlavní obsah lícuje s navigací. FAQ ani instalační postup nemají vlastní užší sloupec.
          const okraje = await page.evaluate(() => {
            const vzor = document.querySelector('.nav > .wrap').getBoundingClientRect();
            return [...document.querySelectorAll('.unit > .wrap:not(.note), footer > .wrap')].filter(el => el.getBoundingClientRect().width > 0).map(el => {
              const r = el.getBoundingClientRect();
              return { sekce: el.closest('section')?.id || 'footer', rozdil: Math.max(Math.abs(r.left - vzor.left), Math.abs(r.right - vzor.right)) };
            });
          });
          assert.ok(okraje.length >= 10);
          assert.deepEqual(okraje.filter(x => x.rozdil > 1), [], `${engine} ${theme} ${width} ${stranka}: různé boční okraje obsahu`);
          // Produkt ukazují výřezy (obrázky). Vložený rám tu byl a na iPhonu blokoval posouvání.
          assert.equal(await page.locator('iframe').count(), 0, `${engine} ${theme} ${width}: ve stránce je rám`);
          await page.evaluate(async () => { for (const img of document.querySelectorAll('.detail img')) { img.loading = 'eager'; await img.decode().catch(() => {}); } });
          const nenactene = await page.evaluate(() => [...document.querySelectorAll('.detail img')].filter((i) => i.getBoundingClientRect().width && !(i.complete && i.naturalWidth)).map((i) => i.currentSrc || i.src));
          assert.deepEqual(nenactene, [], `${engine} ${theme} ${width}: výřezy se nenačetly`);
          // Telefon dostane výřezy z telefonního rozvržení, širší obrazovka ty z Macu.
          const zdroje = await page.evaluate(() => [...document.querySelectorAll('.detail img')].filter((i) => i.getBoundingClientRect().width).map((i) => i.currentSrc));
          assert.equal(zdroje.every(z => z.endsWith('-en.webp') === (cekanyJazyk === 'en')), true, `${engine} ${theme} ${width}: výřezy jsou v jiném jazyce než stránka`);
          // Útrata je z telefonního rozvržení všude (měřidlo nad částkou se vejde do dlaždice),
          // seznam agentů i na tabletu (tabulka z Macu by se zmenšila pod čitelnost).
          const telefonni = (z) => width <= 620 || /utrata/.test(z) || (width <= 900 && /agenti/.test(z));
          assert.equal(zdroje.every((z) => z.includes('-mobil') === telefonni(z)), true, `${engine} ${theme} ${width}: ${zdroje.join(', ')}`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine} ${theme} ${width}: overflow`);
          assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0, 'reduced motion');
          await page.locator('a[href="#rozsireni"]').click();
          await page.waitForFunction(() => document.getElementById('rozsireni').open);
          assert.equal(await page.locator('#rozsireni').getAttribute('open'), '');
          const accordion = await page.evaluate(() => {
            const rows = [...document.querySelectorAll('#vyzkouset .rows > details')];
            const badges = rows.map(row => row.querySelector('.detail-tag').getBoundingClientRect().right);
            const plus = rows.map(row => {
              const summary = row.querySelector('summary');
              const rect = summary.getBoundingClientRect();
              const css = getComputedStyle(summary);
              return rect.right - parseFloat(css.paddingRight) - 14;
            });
            const extension = rows[0];
            return {
              badges, plus,
              borderTop: getComputedStyle(document.querySelector('#vyzkouset .rows')).borderTopWidth,
              highlightBottom: getComputedStyle(extension).borderBottomWidth,
              nextTop: getComputedStyle(rows[1]).borderTopWidth,
              radius: parseFloat(getComputedStyle(extension).borderTopLeftRadius),
              mascot: getComputedStyle(extension.querySelector('.robot-shell')).fill,
            };
          });
          assert.ok(Math.abs(accordion.badges[0] - accordion.badges[1]) <= 1 && Math.abs(accordion.plus[0] - accordion.plus[1]) <= 1, `${engine} ${theme} ${width} ${stranka}: odznaky a plus nejsou v jedné ose`);
          assert.deepEqual([accordion.borderTop, accordion.highlightBottom, accordion.nextTop], ['0px', '0px', '0px'], `${engine} ${theme} ${width} ${stranka}: kolidující linka accordiona`);
          assert.ok(accordion.radius >= 18 && accordion.mascot !== 'rgb(0, 0, 0)', `${engine} ${theme} ${width} ${stranka}: okraje nebo robot rozšíření`);
          if ([375, 1440].includes(width)) await page.locator('#vyzkouset').screenshot({ path: `${output}/${engine}-${theme}-${width}${stranka === '/en' ? '-en' : ''}-stazeni.png` });
          await page.locator('#rozsireni summary').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('#rozsireni').getAttribute('open'), null);
          const brokenAnchors = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(h.slice(1))));
          assert.deepEqual(brokenAnchors, []);
          const smallText = await page.evaluate(() => [...document.querySelectorAll('p, span, a, button, summary')].filter(e => e.getBoundingClientRect().height && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent.slice(0, 30)));
          assert.deepEqual(smallText, []);
          await page.evaluate(() => scrollTo(0, 0));
          if ([375, 1440].includes(width)) await page.screenshot({ path: `${output}/${engine}-${theme}-${width}${stranka === '/en' ? '-en' : ''}.png`, fullPage: true });
          assert.deepEqual(errors, []);
          assert.deepEqual(cizi, [], `${engine} ${theme} ${width}: stránka sáhla mimo vlastní server`);
          results.push({ engine, theme, width, stranka, passed: true, height: await page.evaluate(() => document.documentElement.scrollHeight) });
          await page.close();
        }
        // Stránka Instalace: stejná lišta a okraje jako úvod, tlačítka ke stažení vedou na
        // vydání na GitHubu, žádné vodorovné posouvání ani rozbitá kotva, čistá konzole.
        for (const width of [360, 375, 768, 900, 1440]) for (const stranka of ['/instalace', '/en/install']) {
          const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce' });
          const errors = [];
          const cizi = [];
          await jenMistni(page, cizi);
          page.on('pageerror', e => errors.push(e.message));
          page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
          page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
          await page.goto(url + stranka);
          await page.evaluate(() => document.fonts.ready);
          const kde = `${engine} ${theme} ${width} ${stranka}`;
          assert.equal(await page.locator('h1').count(), 1, kde);
          const cekanyJazyk = stranka.startsWith('/en') ? 'en' : 'cs';
          assert.equal(await page.evaluate(() => document.querySelector('.lang [aria-current="page"]')?.getAttribute('lang')), cekanyJazyk, kde);
          const lista = await page.evaluate(() => {
            const box = (s) => document.querySelector(s)?.getBoundingClientRect();
            const lang = box('.nav .lang'), cta = box('.nav .btn'), znacka = box('.nav .brand');
            const pres = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            const mobileMenu = document.querySelector('[data-mobile-menu-toggle]');
            const mb = mobileMenu?.getBoundingClientRect();
            const actionVisible = innerWidth <= 900
              ? Boolean(mb && mb.width >= 44 && mb.height >= 44 && mb.right <= innerWidth)
              : Boolean(cta && cta.width > 0 && cta.right <= innerWidth);
            return { videt: Boolean(lang && lang.left >= 0 && lang.right <= innerWidth && actionVisible),
              prekryv: Boolean(pres(lang, innerWidth > 900 ? cta : mb) || pres(lang, znacka)) };
          });
          assert.deepEqual(lista, { videt: true, prekryv: false }, `${kde}: lišta`);
          const okraje = await page.evaluate(() => {
            const vzor = document.querySelector('.nav > .wrap').getBoundingClientRect();
            return [...document.querySelectorAll('.unit > .wrap, footer > .wrap')].filter(el => el.getBoundingClientRect().width > 0).map(el => {
              const r = el.getBoundingClientRect();
              return { sekce: el.closest('section')?.id || 'footer', rozdil: Math.max(Math.abs(r.left - vzor.left), Math.abs(r.right - vzor.right)) };
            }).filter(x => x.rozdil > 1);
          });
          assert.deepEqual(okraje, [], `${kde}: různé boční okraje obsahu`);
          // Tlačítka ke stažení: Mac i Windows jsou vidět a vedou na vydání na GitHubu.
          const stazeni = await page.evaluate(() => [...document.querySelectorAll('[data-stahnout]')].map(a => ({ kam: a.dataset.stahnout, href: a.href, videt: a.getBoundingClientRect().width > 0 })));
          assert.ok(stazeni.some(s => s.kam === 'mac-arm64' && s.videt) && stazeni.some(s => s.kam === 'windows-x64' && s.videt), `${kde}: tlačítka ke stažení`);
          for (const s of stazeni) assert.match(s.href, /^https:\/\/github\.com\/martin-pok\/agentree\/releases\/latest(\/download\/Agenteeq-(macOS-arm64\.(zip|dmg)|Windows-x64\.zip))?$/, kde);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${kde}: overflow`);
          assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0, `${kde}: reduced motion`);
          const brokenAnchors = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(h.slice(1))));
          assert.deepEqual(brokenAnchors, [], kde);
          const smallText = await page.evaluate(() => [...document.querySelectorAll('p, span, a, button, summary, li')].filter(e => e.getBoundingClientRect().height && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent.slice(0, 30)));
          assert.deepEqual(smallText, [], kde);
          // Rozbalovací řádek potíží jde otevřít klávesnicí.
          await page.locator('#potize summary').first().focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('#potize details').first().getAttribute('open'), '', kde);
          await page.evaluate(() => scrollTo(0, 0));
          if ([375, 1440].includes(width)) await page.screenshot({ path: `${output}/${engine}-${theme}-${width}-${cekanyJazyk === 'en' ? 'install-en' : 'instalace'}.png`, fullPage: true });
          assert.deepEqual(errors, [], kde);
          assert.deepEqual(cizi, [], `${kde}: stránka sáhla mimo vlastní server`);
          results.push({ engine, theme, width, stranka, passed: true, height: await page.evaluate(() => document.documentElement.scrollHeight) });
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
        const cile = await p.evaluate(() => [...document.querySelectorAll('.hero-shot, .tile')].map((_, i) => i));
        assert.ok(cile.length >= 4, `${engine} ${sirka}: výřezů k posouvání je ${cile.length}`);
        const naStred = (i) => p.evaluate((i) => {
          const el = document.querySelectorAll('.hero-shot, .tile')[i];
          const r = el.getBoundingClientRect();
          scrollTo({ top: scrollY + r.top + Math.min(r.height, innerHeight) / 2 - innerHeight / 2, behavior: 'instant' });
          const b = el.getBoundingClientRect();
          return { x: Math.round(Math.min(b.left + b.width / 2, innerWidth / 2 + 120)), y: Math.round(Math.max(120, Math.min(b.top + b.height / 2, innerHeight - 140))), nahore: document.elementFromPoint(Math.min(b.left + b.width / 2, innerWidth / 2 + 120), Math.max(120, Math.min(b.top + b.height / 2, innerHeight - 140)))?.closest('.hero-shot, .tile') === el };
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

      // Výřez nesmí nastoupit na samém spodním okraji; po vstupu do čitelné části
      // se musí plně ukázat v obou jádrech.
      {
        const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
        await jenMistni(p, []);
        await p.goto(url);
        const pruhlednost = [];
        const dlazdic = await p.locator('.tile').count();
        assert.ok(dlazdic >= 5, `${engine}: dlaždic je ${dlazdic}`);
        const vjizdi = await p.evaluate(async () => {
          const el = document.querySelector('.tile:last-child');
          scrollTo({ top: 0, behavior: 'instant' });
          const r = el.getBoundingClientRect();
          scrollTo({ top: r.top - innerHeight + 24, behavior: 'instant' });
          await new Promise((h) => requestAnimationFrame(() => requestAnimationFrame(h)));
          return { pending: el.classList.contains('motion-pending'), opacity: Number(getComputedStyle(el).opacity) };
        });
        assert.equal(vjizdi.pending, true, `${engine}: dlaždice na spodním okraji se ukázala příliš brzy`);
        assert.ok(vjizdi.opacity < .5, `${engine}: dlaždice na spodním okraji má průhlednost ${vjizdi.opacity}`);
        for (let i = 0; i < dlazdic; i++) {
          const sel = `.tile:nth-child(${i + 1})`;
          await p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); scrollTo({ top: scrollY + r.top + r.height / 2 - innerHeight / 2, behavior: 'instant' }); }, sel);
          await p.waitForFunction((sel) => !document.querySelector(sel).classList.contains('motion-pending'), sel);
          await p.waitForTimeout(950);
          pruhlednost.push([sel, await p.evaluate((sel) => getComputedStyle(document.querySelector(sel)).opacity, sel)]);
        }
        for (const [sel, o] of pruhlednost) assert.equal(o, '1', `${engine}: ${sel} po dojetí do okna má průhlednost ${o}`);
        await p.evaluate(() => document.querySelector('.prikaz')?.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await p.waitForFunction(() => !document.querySelector('.prikaz')?.classList.contains('motion-pending'));
        await p.waitForTimeout(900);
        assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.prikaz')).opacity), '1', `${engine}: instalační blok není vidět`);
        await p.close();
      }

      // Plynulé posouvání kolečkem (site/lp.js). Na počítači stránka po kroku kolečka dojíždí
      // plynule a skončí přesně tam, kam kolečko mířilo; klávesnice a odkazy na sekce fungují
      // dál. Na dotykovém zařízení a s „omezit pohyb“ se nesmí zapnout vůbec – dotyk už jednou
      // kvůli převzatému posouvání na iPhonu nefungoval.
      {
        const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
        const chyby = [];
        p.on('pageerror', (e) => chyby.push(e.message));
        await jenMistni(p, []);
        await p.goto(url);
        await p.evaluate(() => document.fonts.ready);
        assert.equal(await p.evaluate(() => 'plynule' in document.documentElement.dataset), true, `${engine}: plynulé posouvání se na počítači nezapnulo`);
        await p.mouse.move(720, 450);
        const vzorky = p.evaluate(() => new Promise((hotovo) => {
          const v = [];
          const t0 = performance.now();
          (function f() { v.push(scrollY); if (performance.now() - t0 < 1800) requestAnimationFrame(f); else hotovo(v); })();
        }));
        await p.mouse.wheel(0, 400);
        const v = await vzorky;
        const konec = v.at(-1);
        const mezi = new Set(v.filter((y) => y > 2 && y < konec - 2).map(Math.round)).size;
        assert.ok(Math.abs(konec - 400) <= 2, `${engine}: kolečko 400 px dojelo na ${konec}`);
        assert.ok(mezi >= 5, `${engine}: posun kolečkem neběžel plynule (mezipoloh ${mezi})`);
        assert.ok(v.every((y, i) => i === 0 || y >= v[i - 1] - 0.5), `${engine}: dojezd se vracel`);
        const ustal = () => p.evaluate(() => new Promise((hotovo) => {
          let posledni = scrollY, klid = 0;
          const t = setInterval(() => { klid = scrollY === posledni ? klid + 1 : 0; posledni = scrollY; if (klid >= 4) { clearInterval(t); hotovo(scrollY); } }, 50);
          setTimeout(() => { clearInterval(t); hotovo(scrollY); }, 4000);
        }));
        const predKlavesou = await ustal();
        // WebKit headless can leave focus on an internal non-scrollable target after wheel.
        // Give keyboard input an explicit document scroll target, as a real user would via Tab.
        await p.evaluate(() => { document.body.tabIndex = -1; document.body.focus({ preventScroll: true }); });
        await p.keyboard.press('PageDown');
        const poKlavese = await ustal();
        assert.ok(poKlavese - predKlavesou > 300, `${engine}: Page Down posunul jen o ${poKlavese - predKlavesou} px`);
        await p.click('.nav-links a[href="#soukromi"]');
        // WebKit can schedule the native smooth anchor scroll after a quiet 200 ms window.
        // Wait for the actual target position instead of mistaking that pause for completion.
        await p.waitForFunction(() => {
          const top = document.getElementById('soukromi').getBoundingClientRect().top;
          const header = document.querySelector('.nav').getBoundingClientRect().height;
          return top >= header && top <= header + 20;
        }, null, { timeout: 7000 });
        const sekce = await p.evaluate(() => document.getElementById('soukromi').getBoundingClientRect().top);
        const hlavicka = await p.evaluate(() => document.querySelector('.nav').getBoundingClientRect().height);
        assert.ok(sekce >= hlavicka && sekce <= hlavicka + 20, `${engine}: odkaz na sekci skončil na ${sekce} px, hlavička má ${hlavicka} px`);
        await p.waitForFunction(() => document.querySelector('.nav-links a[href="#soukromi"]')?.getAttribute('aria-current') === 'location');
        assert.deepEqual(chyby, [], `${engine}: chyby při plynulém posouvání`);
        await p.close();
        for (const [popis, volby] of [['dotyk', { hasTouch: true, isMobile: engine === 'chromium' }], ['omezit pohyb', { reducedMotion: 'reduce' }]]) {
          const k = await browser.newContext({ viewport: { width: 390, height: 844 }, ...volby });
          const q = await k.newPage();
          await jenMistni(q, []);
          await q.goto(url);
          assert.equal(await q.evaluate(() => 'plynule' in document.documentElement.dataset), false, `${engine}: plynulé posouvání se zapnulo i při: ${popis}`);
          await k.close();
        }
      }

      // Bezpečnostní hlavičky webu (vercel.json) nic nerozbijí: zásady soukromí, rozhraní na /app,
      // přehled účtu i ukázka se vykreslí bez porušení CSP a bez chyb, a hlavičky opravdu přišly.
      for (const cesta of ['/soukromi', '/en/privacy', '/app', '/app?ucet', '/app?ukazka']) {
        const p = await browser.newPage({ viewport: { width: 375, height: 900 } });
        const chyby = [];
        await jenMistni(p, []);
        p.on('pageerror', (e) => chyby.push(e.message));
        p.on('console', (m) => { if (/Content.Security.Policy|Refused to|Permissions.Policy/i.test(m.text())) chyby.push(m.text()); });
        const odpoved = await p.goto(url + cesta);
        const h = odpoved.headers();
        assert.match(h['content-security-policy'] || '', /frame-ancestors 'none'/, `${engine} ${cesta}: chybí CSP`);
        assert.equal(h['x-content-type-options'], 'nosniff', `${engine} ${cesta}: chybí nosniff`);
        assert.match(h['strict-transport-security'] || '', /max-age=\d+/, `${engine} ${cesta}: chybí HSTS`);
        await p.waitForSelector('main, .cloud, .pair, .sidebar, h1');
        await p.waitForTimeout(400);
        assert.deepEqual(chyby, [], `${engine} ${cesta}: porušení CSP nebo chyba stránky`);
        await p.close();
      }

      const staticPage = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
      await jenMistni(staticPage, []);
      await staticPage.goto(url);
      // Bez JavaScriptu musí stránka pořád prodávat: nadpis, snímek produktu i tlačítko ke stažení.
      assert.ok(await staticPage.locator('h1').isVisible(), 'nadpis bez JS');
      assert.ok(await staticPage.locator('.hero-shot img').isVisible(), 'výřez produktu bez JS');
      assert.ok(await staticPage.locator('[data-stahnout="mac-arm64"]').first().isVisible(), 'stažení bez JS');
      await staticPage.locator('#rozsireni summary').click();
      // Rozšíření je v Chrome Web Store: rozbalená sekce nabízí tlačítko do obchodu (bez JS stejně jako s ním).
      const doObchodu = staticPage.locator('#rozsireni a[data-obchod-chrome]');
      assert.ok(await doObchodu.isVisible(), 'tlačítko Přidat do Chromu bez JS');
      assert.match(await doObchodu.getAttribute('href'), /^https:\/\/chromewebstore\.google\.com\/detail\//);
      await staticPage.close();
      const bezPozorovatele = await browser.newPage({ reducedMotion: 'no-preference' });
      await jenMistni(bezPozorovatele, []);
      await bezPozorovatele.addInitScript(() => { delete window.IntersectionObserver; });
      await bezPozorovatele.goto(url);
      assert.equal(await bezPozorovatele.locator('.motion-pending').count(), 0);
      assert.match(await bezPozorovatele.locator('.step-n').first().innerText(), /^1$/);
      await bezPozorovatele.close();
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
      // Funkce, ne řetězec: web má CSP bez 'unsafe-eval' (vercel.json), takže výraz zapsaný řetězcem
      // by prohlížeč odmítl vyhodnotit – stejně jako by odmítl jakýkoli eval na produkci.
      const podleHodin = () => document.getAnimations().filter(a => a.playState === 'running' && (!a.timeline || a.timeline instanceof DocumentTimeline)).length;
      // Nástupní animace musí dojet, než začneme klikat. Pod zátěží se Playwrightu
      // prvek jeví ustálený i uprostřed animace (dva snímky se stejným rámečkem),
      // takže bez tohoto čekání test chytal doběh nástupu místo skutečné smyčky.
      await motionPage.waitForFunction(() => document.getAnimations().filter(a => a.playState === 'running' && (!a.timeline || a.timeline instanceof DocumentTimeline)).length === 0, null, { timeout: 5000 });
      const button = motionPage.locator('.hero .btn:visible');
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
      // Posun spustí nástup nadpisu sekce až ve chvíli, kdy ho observer uvidí (asynchronně).
      // Počkat na něj, jinak by kontrola proběhla dřív, než nástup začne, a doběh by nestihla.
      await motionPage.waitForFunction(() => document.querySelector('#prohlidka .unit-head')?.classList.contains('motion-entered'), null, { timeout: 4000 });
      await motionPage.waitForFunction(() => document.getAnimations().filter(a => a.playState === 'running' && (!a.timeline || a.timeline instanceof DocumentTimeline)).length === 0, null, { timeout: 4000 });
      assert.equal(await motionPage.evaluate(podleHodin), 0, 'No perpetual decorative animation');
      await motionPage.close();
      // Repeatable local Core Web Vitals diagnostics for desktop and mobile.
      // These are lab readings under localhost and MUST NOT be advertised as
      // Google PageSpeed scores or 75th-percentile real-user experience.
      const vitals = [];
      for (const width of [390, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 900 },
          reducedMotion: 'reduce', colorScheme: 'light' });
        await jenMistni(page, []);
        await page.addInitScript(() => {
          // Null means unsupported/unavailable, not a claimed perfect zero.
          window.__agenteeqVitals = { lcp: null, cls: null, longTasks: null };
          const watch = (kind, cb) => {
            if (!window.PerformanceObserver?.supportedEntryTypes?.includes(kind)) return false;
            try {
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) cb(entry);
              }).observe({ type: kind, buffered: true });
              return true;
            } catch { return false; }
          };
          watch('largest-contentful-paint', entry => { window.__agenteeqVitals.lcp = entry.startTime; });
          if (watch('layout-shift', entry => {
            if (!entry.hadRecentInput) window.__agenteeqVitals.cls += entry.value;
          })) window.__agenteeqVitals.cls = 0;
          if (watch('longtask', () => { window.__agenteeqVitals.longTasks++; })) {
            window.__agenteeqVitals.longTasks = 0;
          }
        });
        const resp = await page.goto(url, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(250);
        const values = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          const resources = performance.getEntriesByType('resource');
          return {
            ...window.__agenteeqVitals,
            domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
            loadEvent: Math.round(nav?.loadEventEnd ?? 0),
            resources: resources.length,
            resourceBytes: Math.round(resources.reduce((sum, item) =>
              sum + (item.transferSize || 0), 0)),
          };
        });
        vitals.push({ engine, viewport: width, ...values });
        assert.equal(resp.status(), 200, `${engine} ${width}: landing request`);
        assert.ok(values.cls === null || (Number.isFinite(values.cls) && values.cls <= 0.1),
          `${engine} ${width}: layout shift score ${values.cls}`);
        await page.close();
      }
      await fs.writeFile(`${output}/web-vitals-${engine}.json`, JSON.stringify(vitals, null, 2));
      // Installation guide must never lose its section navigation on mobile,
      // including very short landscape viewports with safe-area constraints.
      for (const route of ['/instalace', '/en/install']) {
        const mobile = await browser.newPage({
          viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
        });
        await jenMistni(mobile, []);
        await mobile.goto(url + route);
        for (const [width, height] of [[390, 844], [568, 320], [844, 390]]) {
          await mobile.setViewportSize({ width, height });
          const toggle = mobile.locator('[data-mobile-menu-toggle]');
          assert.equal(await toggle.isVisible(), true, `${engine} ${route} ${width}: mobile menu missing`);
          await toggle.click();
          const state = await mobile.evaluate(() => {
            const overlay = document.querySelector('[data-mobile-menu]');
            const close = overlay.querySelector('[data-mobile-menu-close]');
            const r = close.getBoundingClientRect();
            return {
              expanded: document.querySelector('[data-mobile-menu-toggle]').getAttribute('aria-expanded'),
              hidden: overlay.getAttribute('aria-hidden'),
              locked: document.body.style.overflow,
              focus: document.activeElement === close,
              accessibleClose: r.width >= 43.5 && r.height >= 43.5 && r.right <= innerWidth + 2
                && r.left >= -2 && r.bottom <= innerHeight + 2,
              horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
            };
          });
          assert.deepEqual(state, { expanded: 'true', hidden: 'false', locked: 'hidden',
            focus: true, accessibleClose: true, horizontalOverflow: false },
          `${engine} ${route} ${width}x${height}: menu accessibility or layout`);
          await mobile.keyboard.press('Escape');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          assert.equal(await mobile.evaluate(() => document.body.style.overflow), '');
        }
        await mobile.close();
      }
      // Breakpoint sweep: recycle two pages instead of reloading dozens of times.
      // Covers narrow phones, foldable/dual-pane logical widths, both sides of every
      // major CSS breakpoint, tablets, laptops and ultrawide monitors.
      // A future phone's exact panel size is unknown; use fluid layout assertions.
      for (const language of ['/', '/en', '/instalace', '/en/install', '/soukromi', '/en/privacy']) {
        const responsive = await browser.newPage({
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
          colorScheme: 'light',
        });
        const errors = [];
        await jenMistni(responsive, errors);
        responsive.on('pageerror', e => errors.push(e.message));
        await responsive.goto(url + (language === '/' ? '' : language));
        for (const width of [320, 344, 360, 390, 402, 430, 600, 620, 621, 700,
          720, 760, 768, 820, 900, 901, 1024, 1280, 1536, 1920, 2560, 3840]) {
          await responsive.setViewportSize({ width, height: width <= 430 ? 844 : 950 });
          const layout = await responsive.evaluate(() => {
            const vw = document.documentElement.clientWidth;
            const selectors = ['.nav-in', '.hero .unit-head', '.hero-figure',
              '#prohlidka .tiles', '#propojeni .integration-tools', '.site-footer .foot-in',
              '.install-page .install-hero-scene', '.install-page .extension-layout', '.doc-body'];
            const overflow = selectors.flatMap(selector => [...document.querySelectorAll(selector)]
              .filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && (r.right > vw + 2 || r.left < -2);
              }).map(el => el.className || el.tagName));
            const menu = document.querySelector('[data-mobile-menu-toggle]');
            const mobile = Boolean(menu && getComputedStyle(menu).display !== 'none');
            const screenHasOverflow = document.documentElement.scrollWidth > vw + 2;
            const shortTargets = [...document.querySelectorAll(
              '.nav .brand, .nav .lang a, [data-mobile-menu-toggle], .site-footer .brand')]
              .filter(el => getComputedStyle(el).display !== 'none')
              .filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && (rect.width < 43.5 || rect.height < 43.5);
              }).map(el => el.className || el.tagName);
            const heading = document.querySelector('h1')?.getBoundingClientRect();
            const cta = document.querySelector('.hero .btn, .install-page .btn')?.getBoundingClientRect();
            const links = [...document.querySelectorAll('.hero .btn, .nav .brand')]
              .filter(el => getComputedStyle(el).display !== 'none')
              .every(el => el.getBoundingClientRect().width > 0);
            return { vw, screenHasOverflow, overflow, shortTargets, mobile,
              hasMenu: Boolean(menu), heading: heading?.width,
              cta: cta?.width || null, links };
          });
          assert.equal(layout.screenHasOverflow, false,
            `${engine} ${language} ${width}px: horizontal page overflow`);
          assert.deepEqual(layout.overflow, [],
            `${engine} ${language} ${width}px: key content crosses viewport`);
          if (width <= 900) assert.deepEqual(layout.shortTargets, [],
            `${engine} ${language} ${width}px: navigation touch targets below 44px`);
          assert.ok(layout.heading > 0 && (layout.cta === null || layout.cta >= 44) && layout.links,
            `${engine} ${language} ${width}px: missing heading, CTA, or logo`);
          assert.equal(layout.mobile, layout.hasMenu && width <= 900,
            `${engine} ${language} ${width}px: mobile navigation breakpoint`);
        }
        assert.deepEqual(errors, [], `${engine} ${language}: errors during breakpoint sweep`);
        await responsive.close();
      }
    } finally { await browser.close(); }
  }
  await fs.writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
