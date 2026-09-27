// Tvary ovládacích prvků, měřené na vykreslené ploše: `npm run qa:tvary`
//
// Pravidlo značky (docs/DESIGN.md, tokeny v public/styles.css :root): všechno, na co se klepe a má
// jeden řádek – tlačítko, čip, filtr, výběr, pole, položka menu, přepínač – je kapsle, ikonové
// tlačítko je kruh. Plochy mají zaoblení z tokenů a nic nesmí mít ostré rohy. Skript projde
// aplikaci (všechny obrazovky, 1440 i 375 px, otevřenou paletu i upozornění), web a okno
// rozšíření a nahlásí každý prvek, který pravidlo porušuje. Měří se vypočtený tvar, takže chybu
// odhalí i tam, kde je kapsle zapsaná číslem, které k výšce prvku náhodou přestalo sedět.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer, api } from '../test/helpers.mjs';
import { buildSite } from './build-site.mjs';
import { staticServer } from './qa-server.mjs';
import { STAVY_OKNA, otevriOkno } from './qa-rozsireni.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROUTES = ['prehled', 'agenti', 'projekty', 'statistiky', 'utrata', 'upozorneni', 'dovednosti', 'nastaveni'];
const SIRKY = [1440, 375];
// Nejvyšší jednořádkový ovládací prvek má 48 px. Vyšší prvky jsou karty a řádky seznamů.
const MAX_JEDNORADKOVY = 48;
// Řádky seznamů, které mají i víceřádkovou podobu. Aby všechny položky jednoho seznamu vypadaly
// stejně, drží zaoblení řádku (--r-md) i ty, které se zrovna vejdou na jeden řádek.
const RADKY = ['.choice', '.pick'];

function zmer({ maxJednoradkovy, radky }) {
  const OVLADACI = 'button, select, summary, input, textarea, a, label, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"]';
  const pruhledne = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const nalezy = [];
  for (const el of document.querySelectorAll(OVLADACI)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.right < 0) continue;
    const tag = el.tagName.toLowerCase();
    const typ = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && ['hidden', 'range', 'file', 'radio'].includes(typ)) continue;
    const plocha = !pruhledne(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none'
      || (parseFloat(cs.borderTopWidth) > 0 && !pruhledne(cs.borderTopColor));
    // Odkaz a popisek v textu nejsou ovládací prvky s tvarem, dokud nemají vlastní plochu. Totéž
    // platí pro tlačítko, které vypadá jako odkaz: bez plochy a bez vnitřního odsazení.
    if ((tag === 'a' || tag === 'label') && (cs.display === 'inline' || !plocha)) continue;
    if (tag === 'button' && !plocha && parseFloat(cs.paddingLeft) === 0 && parseFloat(cs.paddingRight) === 0) continue;
    const rohy = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map((k) => {
      const v = cs[k].split(' ')[0];
      return v.endsWith('%') ? (parseFloat(v) / 100) * Math.min(r.width, r.height) : parseFloat(v) || 0;
    });
    const popis = () => ({
      prvek: tag + (typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''),
      text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      rozmer: `${Math.round(r.width)}×${Math.round(r.height)}`, zaobleni: rohy.map((x) => Math.round(x)).join('/'),
    });
    const nejmensi = Math.min(...rohy);
    if (tag === 'input' && typ === 'checkbox') {
      // Zaškrtávací políčko je jediná výjimka: zaoblený čtverec, ne kruh (ten patří přepínači jedné volby).
      if (plocha && (nejmensi < 2 || nejmensi >= Math.min(r.width, r.height) / 2 - 1)) nalezy.push({ ...popis(), chyba: 'zaškrtávací políčko má být zaoblený čtverec' });
      continue;
    }
    const celaSirka = r.width >= window.innerWidth - 1;
    if (tag === 'textarea' || r.height > maxJednoradkovy || radky.some((s) => el.matches(s))) {
      if (plocha && !celaSirka && nejmensi < 6) nalezy.push({ ...popis(), chyba: 'ostré rohy' });
      continue;
    }
    const kapsle = Math.min(r.width, r.height) / 2 - 1;
    if (nejmensi < kapsle) nalezy.push({ ...popis(), chyba: 'není kapsle' });
  }
  return nalezy;
}

const problemy = [];
function vypis(kde, nalezy) {
  if (!nalezy.length) { console.log(`  ${kde}: v pořádku`); return; }
  console.log(`  ${kde}: NEVYHOVUJE (${nalezy.length})`);
  for (const n of nalezy) { console.log(`     ${n.chyba}: ${n.prvek} „${n.text}“ ${n.rozmer}, zaoblení ${n.zaobleni}`); problemy.push({ kde, ...n }); }
}
const PARAM = { maxJednoradkovy: MAX_JEDNORADKOVY, radky: RADKY };
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});

/* ---------- Aplikace ---------- */
console.log('Aplikace');
const app = await startTestServer();
app.app.store.commit(Object.assign(app.app.store.ensure({ connector: 'codex', localId: 'qa-tvary', provider: 'openai', app: 'Codex' }), { title: 'QA tvary', lastAt: Date.now(), startedAt: Date.now() - 60000 }));
await api(app.url).send('POST', '/api/projects', { name: 'QA projekt' });
await api(app.url).send('PUT', '/api/settings', { welcomeCompleted: true, onboardingDismissed: true, appearance: 'light' });
for (const sirka of SIRKY) {
  const page = await browser.newPage({ viewport: { width: sirka, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  for (const trasa of ROUTES) {
    await page.goto(`${app.url}/#/${trasa}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (document.querySelector('#view')?.innerText || '').trim().length > 0, null, { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    vypis(`${sirka}px /${trasa}`, await page.evaluate(zmer, PARAM));
    if (trasa === 'nastaveni') {
      const skupiny = await page.$$eval('.set-nav [data-jump]', (b) => b.map((x) => x.dataset.jump));
      for (const skupina of skupiny.slice(1)) {
        await page.click(`.set-nav [data-jump="${skupina}"]`);
        await page.waitForTimeout(150);
        vypis(`${sirka}px /${trasa} › ${skupina}`, await page.evaluate(zmer, PARAM));
      }
    }
  }
  // Vrstvy, které se otevírají až na pokyn: paleta příkazů a (na počítači) upozornění.
  await page.goto(`${app.url}/#/prehled`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (document.querySelector('#view')?.innerText || '').trim().length > 0, null, { timeout: 20000 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  vypis(`${sirka}px paleta příkazů`, await page.evaluate(zmer, PARAM));
  await page.keyboard.press('Escape');
  if (sirka > 900) {
    await page.click('.icon-btn.bell');
    await page.waitForTimeout(300);
    vypis(`${sirka}px upozornění`, await page.evaluate(zmer, PARAM));
  }
  await page.close();
}
await app.close();

/* ---------- Web ---------- */
console.log('Web');
const { out } = await buildSite();
const web = await staticServer(out);
for (const stranka of ['/', '/en', '/soukromi', '/en/privacy', '/app/']) {
  for (const sirka of SIRKY) {
    const page = await browser.newPage({ viewport: { width: sirka, height: 1000 }, reducedMotion: 'reduce' });
    await page.goto(web.url + stranka, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (stranka === '/app/') await page.waitForSelector('.pair-box');
    vypis(`${sirka}px ${stranka}`, await page.evaluate(zmer, PARAM));
    await page.close();
  }
}
await new Promise((r) => web.server.close(r));

/* ---------- Okno rozšíření ---------- */
console.log('Rozšíření pro Chrome');
const ext = await staticServer(path.join(root, 'extension'));
for (const stav of STAVY_OKNA) {
  const page = await otevriOkno(browser, ext.url, stav);
  vypis(`344px okno (${stav})`, await page.evaluate(zmer, PARAM));
  await page.close();
}
await new Promise((r) => ext.server.close(r));

await browser.close();
if (problemy.length) {
  console.error(`\nNEVYHOVUJE: ${problemy.length} prvků porušuje pravidlo tvarů (docs/DESIGN.md).`);
  process.exit(1);
}
console.log('\nVšechny ovládací prvky v aplikaci, na webu i v okně rozšíření mají tvar podle pravidla značky.');
