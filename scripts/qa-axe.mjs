// Automatická kontrola WCAG 2.2 A/AA (axe-core) na všech obrazovkách aplikace včetně detailu agenta
// a projektu a hlavních dialogů: světlý i tmavý vzhled, počítač i telefon. Selže na každém porušení –
// kontrast, názvy tlačítek, ARIA, popisky polí. Web a okno rozšíření kontrolují qa:site a qa:extension.
// 320 × 256 CSS px je přiblížení 400 % (WCAG 1.4.10 Přeskládání): stránka nesmí jezdit do stran.
// Klávesnice (WCAG 2.1.1, 2.1.2, 2.4.7): Tab projde celou obrazovku dokola bez pasti a každá
// zastávka má viditelný fokus – vlastní obrys/stín, nebo stín obalu s :focus-within (pole skládače).
// axe-core je jen nástroj QA (npm install --no-save), do aplikace ani package.json nepatří.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { pripravUkazku } from './demo-fixture.mjs';
import { api } from '../test/helpers.mjs';
import { nactiAxe, axePoruseni } from './axe-kontrola.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const axe = nactiAxe();
const ZAKLADNI_TRASY = ['prehled', 'upozorneni', 'agenti', 'projekty', 'statistiky', 'utrata', 'dovednosti', 'nastaveni'];
// Dialogy a panely: kde se otevírají, čím a co se kontroluje. Neotevřený dialog je chyba, ne přeskok.
const DIALOGY = [
  { nazev: 'Nový projekt', trasa: 'projekty', klik: '[data-action="new"]', oblast: '.modal-scrim [role="dialog"]' },
  { nazev: 'Rozpočty', trasa: 'utrata', klik: '.toolbar [data-action="budgets"]', oblast: '.modal-scrim [role="dialog"]' },
  // Na telefonu je Nápověda v jiné sekci Nastavení: skok na kartu jako odkazy `data-karta` v aplikaci.
  { nazev: 'Co je nového', trasa: 'nastaveni', karta: 'help', klik: '[data-whats-new]', oblast: '.modal-scrim [role="dialog"]' },
  // Okno „Našli jsme na tvém Macu“ (public/js/objev-ui.js): seznam i potvrzovací obrazovka.
  { nazev: 'Nalezené nástroje', trasa: 'nastaveni', karta: 'models', klik: '[data-objev]', oblast: '.objev-dialog[open]' },
  { nazev: 'Potvrzení přístupu', trasa: 'nastaveni', karta: 'models', klik: '[data-objev]', dalsi: '.objev-dialog [data-objev-napojit]', oblast: '.objev-dialog[open] [data-objev-povolit]', kontrola: '.objev-dialog[open]' },
  { nazev: 'Rychlé hledání', trasa: 'prehled', klik: '[data-action="palette"]', oblast: '.palette:not([hidden])' },
  { nazev: 'Upozornění', trasa: 'prehled', klik: '#bell', oblast: '#notif-pop:not([hidden])' },
  { nazev: 'Pomocník', trasa: 'prehled', klik: '.pm-fab', oblast: '#pm-okno' },
];

async function projdiKlavesnici(page) {
  await page.evaluate(() => document.activeElement?.blur());
  const videne = new Set();
  const chyby = [];
  for (let i = 0; i < 300; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(40); // přepočet :focus-visible
    // Posun k fokusu a schování/vysunutí horní lišty se musí ustálit, jinak by se měřil přechod.
    await page.evaluate(() => new Promise((hotovo) => {
      let posl = '', stejne = 0;
      const konec = performance.now() + 1500;
      const krok = () => {
        const r = document.activeElement?.getBoundingClientRect() || { x: 0, y: 0 };
        const k = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(scrollY)}`;
        stejne = k === posl ? stejne + 1 : 0;
        posl = k;
        if (stejne >= 3 || performance.now() > konec) hotovo(); else requestAnimationFrame(krok);
      };
      requestAnimationFrame(krok);
    }));
    const z = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const obrys = (x) => { const c = getComputedStyle(x); return (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== 'none'; };
      const b = e.getBoundingClientRect();
      // WCAG 2.4.11 (Fokus nezakrytý): z devíti bodů prvku musí aspoň jeden být v okně a navrchu –
      // ne celý pod lepicí lištou, spodní navigací, plovoucím tlačítkem nebo mimo okno.
      let videt = 0;
      const pod = new Set();
      for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.2, 0.5, 0.8]) {
        const x = b.left + b.width * fx;
        const y = b.top + b.height * fy;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { pod.add('mimo okno'); continue; }
        const h = document.elementFromPoint(x, y);
        if (!h || h === e || e.contains(h) || h.contains(e) || h.closest('label')?.contains(e)) { videt++; continue; }
        pod.add(`${h.tagName.toLowerCase()}${h.id ? `#${h.id}` : ''}${typeof h.className === 'string' && h.className ? `.${h.className.trim().split(/\s+/)[0]}` : ''}`);
      }
      return {
        id: e.id || `${e.tagName}|${e.getAttribute('aria-label') || e.textContent.trim().slice(0, 30)}|${Math.round(b.x)},${Math.round(b.y + scrollY)}`,
        popis: `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).join('.')}` : ''}`,
        vidno: b.width > 0 && b.height > 0 && (obrys(e) || (e.parentElement?.matches(':focus-within') && obrys(e.parentElement))),
        zakryto: b.width > 0 && b.height > 0 && videt === 0 ? [...pod].join(', ') : '',
      };
    });
    if (!z) continue;
    if (videne.has(z.id)) return chyby;
    videne.add(z.id);
    if (!z.vidno) chyby.push(`${z.popis} nemá viditelný fokus (WCAG 2.4.7)`);
    if (z.zakryto) chyby.push(`${z.popis} má fokus celý zakrytý (${z.zakryto}) (WCAG 2.4.11)`);
  }
  return [...chyby, 'Tab se po 300 zastávkách nevrátil na začátek – past klávesnice (WCAG 2.1.2)'];
}

// Dialog z klávesnice (WCAG 2.1.1, 2.4.3): Enter na spouštěči ho otevře, fokus jde dovnitř (nebo u
// nemodálního panelu zůstane na spouštěči a Tab vede rovnou do panelu), modální dialog Tab nepustí do
// stránky pod ním, Escape zavře a fokus se vrátí na spouštěč – uživatel klávesnice se neztratí.
async function dialogKlavesnici(page, d) {
  const chyby = [];
  await page.goto('about:blank');
  await page.goto(`${demo.url}/#/${d.trasa}`);
  await page.waitForTimeout(1000);
  if (d.karta) {
    await page.evaluate((karta) => { const a = Object.assign(document.createElement('a'), { href: '#/nastaveni' }); a.dataset.karta = karta; document.body.append(a); a.click(); a.remove(); }, d.karta);
    await page.waitForTimeout(800);
  }
  const spoust = page.locator(d.klik).locator('visible=true').first();
  if (!(await spoust.count())) return [`spouštěč ${d.klik} není vidět`];
  await spoust.focus();
  await page.evaluate(() => { document.activeElement.dataset.qaSpoustec = ''; });
  await page.keyboard.press('Enter');
  if (!(await page.waitForSelector(d.oblast, { state: 'visible', timeout: 4000 }).then(() => true, () => false))) return ['Enter na spouštěči dialog neotevřel'];
  await page.waitForTimeout(300);
  const stav = () => page.evaluate((sel) => {
    const o = document.querySelector(sel);
    const a = document.activeElement;
    return {
      modalni: Boolean(o && (o.matches(':modal') || o.getAttribute('aria-modal') === 'true' || o.closest('.modal-scrim'))),
      uvnitr: Boolean(o && o.contains(a)),
      spoustec: Boolean(a && 'qaSpoustec' in a.dataset),
      otevreno: Boolean(o && o.checkVisibility()),
      kde: a ? a.outerHTML.slice(0, 60) : 'nic',
    };
  }, d.oblast);
  const s = await stav();
  if (!s.uvnitr && !s.spoustec) chyby.push(`po otevření je fokus mimo dialog i spouštěč (${s.kde})`);
  if (!s.uvnitr && s.spoustec) {
    await page.keyboard.press('Tab');
    if (!(await stav()).uvnitr) chyby.push('Tab ze spouštěče nevede do otevřeného panelu');
  }
  if (s.modalni) {
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    const t = await stav();
    // Nativní modální <dialog> pustí Tab jen do lišty prohlížeče (activeElement = body), ne do stránky.
    if (!t.uvnitr && !(await page.evaluate(() => document.activeElement === document.body))) chyby.push(`Tab utekl z modálního dialogu do stránky (${t.kde})`);
  }
  // Escape platí pro dialog, ve kterém je fokus.
  await page.evaluate((sel) => { const o = document.querySelector(sel); if (o && !o.contains(document.activeElement)) o.querySelector('button, a[href], input, textarea, select')?.focus(); }, d.oblast);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const z = await stav();
  if (z.otevreno) chyby.push('Escape dialog nezavřel');
  else if (!z.spoustec) chyby.push(`po zavření se fokus nevrátil na spouštěč (${z.kde})`);
  return chyby;
}

const demo = await pripravUkazku({}, { oznacit: false });
const stav = (await api(demo.url).get('/api/state')).body;
const TRASY = [...ZAKLADNI_TRASY, `agent/${encodeURIComponent(stav.sessions[0].id)}`, `projekt/${encodeURIComponent(stav.projects.items[0].id)}`];
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
        for (const x of await axePoruseni(page, axe)) nalezy.push(`${vzhled} ${w}px /${trasa}: ${x}`);
        if (vzhled === 'light' && w !== 320) for (const x of await projdiKlavesnici(page)) nalezy.push(`${w}px /${trasa}: ${x}`);
      }
      if (w !== 320) {
        for (const d of DIALOGY) {
          await page.goto(`${demo.url}/#/${d.trasa}`);
          await page.waitForTimeout(1000);
          if (d.karta) {
            await page.evaluate((karta) => { const a = Object.assign(document.createElement('a'), { href: '#/nastaveni' }); a.dataset.karta = karta; document.body.append(a); a.click(); a.remove(); }, d.karta);
            await page.waitForTimeout(800);
          }
          const spoust = page.locator(d.klik).locator('visible=true').first();
          if (!(await spoust.count())) { nalezy.push(`${vzhled} ${w}px ${d.nazev}: spouštěč ${d.klik} na /${d.trasa} není vidět`); continue; }
          await spoust.click();
          const otevreno = await page.waitForSelector(d.kontrola || d.oblast, { state: 'visible', timeout: 5000 }).then(() => true, () => false);
          if (!otevreno) { nalezy.push(`${vzhled} ${w}px ${d.nazev}: dialog ${d.oblast} se neotevřel`); continue; }
          if (d.dalsi) {
            await page.locator(d.dalsi).first().click();
            const dalsi = await page.waitForSelector(d.oblast, { state: 'visible', timeout: 5000 }).then(() => true, () => false);
            if (!dalsi) { nalezy.push(`${vzhled} ${w}px ${d.nazev}: ${d.oblast} se neukázalo`); continue; }
          }
          await page.waitForTimeout(400);
          for (const x of await axePoruseni(page, axe, d.kontrola || d.oblast)) nalezy.push(`${vzhled} ${w}px dialog ${d.nazev}: ${x}`);
          await page.keyboard.press('Escape');
          // Escape na potvrzení vrací na seznam; okno pak zavře „Hotovo“ (dva Escape po sobě bez klepnutí Chrome nedoručí).
          if (d.kontrola) await page.locator('.objev-dialog [data-objev-hotovo]').click({ timeout: 3000 }).catch(() => {});
        }
        if (vzhled === 'light') for (const d of DIALOGY.filter((x) => !x.dalsi)) for (const x of await dialogKlavesnici(page, d)) nalezy.push(`${w}px dialog ${d.nazev}: ${x}`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await demo.close();
}
assert.deepEqual(nalezy, [], `porušení WCAG 2.2 A/AA:\n${nalezy.join('\n')}`);
console.log(`WCAG 2.2 A/AA (axe): ${TRASY.length} obrazovek × světlý/tmavý × 1440/375/320 px a ${DIALOGY.length} dialogů × světlý/tmavý × 1440/375 px bez porušení a bez vodorovného posunu; Tab projde každou obrazovku dokola s viditelným a nezakrytým fokusem; dialogy jdou z klávesnice otevřít, Escape je zavře a fokus se vrátí na spouštěč.`);
