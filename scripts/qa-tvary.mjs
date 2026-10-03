// Tvary ovládacích prvků, měřené na vykreslené ploše: `npm run qa:tvary`
//
// Pravidlo značky (docs/DESIGN.md, tokeny v public/styles.css :root): všechno, na co se klepe a má
// jeden řádek – tlačítko, čip, filtr, výběr, pole, položka menu, přepínač – je kapsle, ikonové
// tlačítko je kruh. Plochy mají zaoblení z tokenů a nic nesmí mít ostré rohy. Skript projde
// aplikaci (všechny obrazovky, 1440 i 375 px, otevřenou paletu i upozornění), web a okno
// rozšíření a nahlásí každý prvek, který pravidlo porušuje. Měří se vypočtený tvar, takže chybu
// odhalí i tam, kde je kapsle zapsaná číslem, které k výšce prvku náhodou přestalo sedět.
//
// Stejným průchodem hlídá dvě další pravidla z DESIGN.md:
//   – výška jednořádkového ovládacího prvku s vlastní plochou je ze stupnice 32 / 40 / 48 px
//     (vnitřní tlačítko malé segmentové volby 28 px a hlavní výzva webu 56 px jsou jediné výjimky),
//   – řez písma se při výběru nemění: vybraná volba má stejnou váhu písma jako nevybraná vedle ní.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
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
// Stupnice výšek ovládacích prvků (docs/DESIGN.md, oddíl Tlačítka) a jediné povolené výjimky:
// vnitřní kapsle malé segmentové volby (28 px v rámu 32 px; v aplikaci `.seg--sm`, na webu
// přepínač jazyka `.lang`) a hlavní výzva webu `.btn--lg` (56 px).
const STUPNICE = [32, 40, 48];
const VYJIMKY_APLIKACE = [{ vyber: '.seg--sm button', vyska: 28 }];
const VYJIMKY_WEBU = [{ vyber: '.seg--sm button, .lang a', vyska: 28 }, { vyber: '.btn--lg', vyska: 56 }];

function zmer({ maxJednoradkovy, radky, stupnice, vyjimky }) {
  const OVLADACI = 'button, select, summary, input, textarea, a, label, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"]';
  const pruhledne = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const nalezy = [];
  const TEXTOVA_POLE = ['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week'];
  // Obsah prvku leží v jedné řadě, když se všechny jeho viditelné kousky – řádky textu i ikony –
  // protnou s jednou vodorovnou přímkou. Dlaždice s ikonou nad popiskem (spodní lišta na telefonu)
  // nebo tlačítko se dvěma řádky textu jednořádkové nejsou; ikonové tlačítko bez textu se neměří.
  const obsahVJedneRade = (el) => {
    const kusy = [];
    const chodec = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rozsah = document.createRange();
    for (let t = chodec.nextNode(); t; t = chodec.nextNode()) {
      if (!t.textContent.trim()) continue;
      rozsah.selectNodeContents(t);
      for (const k of rozsah.getClientRects()) if (k.height >= 6 && k.width >= 2) kusy.push(k);
    }
    if (!kusy.length) return false;
    for (const g of el.querySelectorAll('svg, img, canvas')) {
      const k = g.getBoundingClientRect();
      if (k.height >= 6 && k.width >= 6) kusy.push(k);
    }
    return Math.max(...kusy.map((k) => k.top)) < Math.min(...kusy.map((k) => k.bottom)) - 1;
  };
  // Stav výběru, jak ho aplikace, web i rozšíření zapisují.
  const vybrany = (el) => (el.hasAttribute('aria-current') && el.getAttribute('aria-current') !== 'false')
    || ['aria-pressed', 'aria-selected', 'aria-checked'].some((a) => el.getAttribute(a) === 'true')
    || el.matches('.is-active, .is-on, .is-selected, .active, .selected')
    || (el.matches('label') && Boolean(el.querySelector('input:checked')));
  const viditelny = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  // Řez popisku: váha písma prvku, ve kterém leží první viditelný text volby.
  const rez = (el) => {
    const chodec = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = chodec.nextNode(); t; t = chodec.nextNode()) {
      if (t.textContent.trim() && t.parentElement && viditelny(t.parentElement)) return getComputedStyle(t.parentElement).fontWeight;
    }
    return getComputedStyle(el).fontWeight;
  };
  const prvniTrida = (el) => (typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '') || '';
  const nahlasenyRez = new Set();
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
    const rohy = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map((k) => {
      const v = cs[k].split(' ')[0];
      return v.endsWith('%') ? (parseFloat(v) / 100) * Math.min(r.width, r.height) : parseFloat(v) || 0;
    });
    const popis = () => ({
      prvek: tag + (typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''),
      text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      rozmer: `${Math.round(r.width * 10) / 10}×${Math.round(r.height * 10) / 10}`, zaobleni: rohy.map((x) => Math.round(x)).join('/'),
    });
    // Řez se při výběru nemění: vybraná volba se porovná s nevybranými volbami téhož druhu vedle
    // ní (stejný rodič, značka a první třída; jinak stejná skupina – tablist, nav, .seg…).
    if (vybrany(el)) {
      const druh = (x) => x !== el && x.tagName === el.tagName && prvniTrida(x) === prvniTrida(el) && !vybrany(x) && viditelny(x);
      let sousede = [...(el.parentElement?.children || [])].filter(druh);
      const skupina = el.closest('[role="tablist"], [role="radiogroup"], [role="group"], [role="listbox"], [role="menu"], nav, .seg');
      if (!sousede.length && skupina) sousede = [...skupina.querySelectorAll(el.tagName)].filter(druh);
      const vlastni = rez(el);
      const jiny = sousede.map(rez).find((w) => w !== vlastni);
      const klic = `${tag}.${prvniTrida(el)}`;
      if (jiny && !nahlasenyRez.has(klic)) {
        nahlasenyRez.add(klic);
        nalezy.push({ ...popis(), chyba: `řez písma se při výběru mění (${jiny} → ${vlastni})` });
      }
    }
    // Odkaz a popisek v textu nejsou ovládací prvky s tvarem, dokud nemají vlastní plochu. Totéž
    // platí pro tlačítko, které vypadá jako odkaz: bez plochy a bez vnitřního odsazení.
    if ((tag === 'a' || tag === 'label') && (cs.display === 'inline' || !plocha)) continue;
    if (tag === 'button' && !plocha && parseFloat(cs.paddingLeft) === 0 && parseFloat(cs.paddingRight) === 0) continue;
    // Výška ze stupnice: jen prvky s vlastní plochou (výška bez plochy není vidět) a s obsahem v jedné
    // řadě. Do stupnice nepatří řádky seznamů (--r-md), víceřádková pole, kruhy (avatar a ikonové
    // tlačítko mají vlastní velikost) a prvek uvnitř věty (display: inline) – ten drží výšku řádku textu.
    const jednoradkovy = tag === 'select' || (tag === 'input' && TEXTOVA_POLE.includes(typ))
      || (tag !== 'textarea' && tag !== 'input' && obsahVJedneRade(el));
    const kruh = Math.abs(r.width - r.height) < 1 && Math.min(...rohy) >= r.height / 2 - 1;
    if (plocha && jednoradkovy && !kruh && cs.display !== 'inline' && !radky.some((s) => el.matches(s))) {
      const vyska = r.height;
      const povoleno = stupnice.some((v) => Math.abs(vyska - v) < 0.5)
        || vyjimky.some((x) => el.matches(x.vyber) && Math.abs(vyska - x.vyska) < 0.5);
      if (!povoleno) nalezy.push({ ...popis(), chyba: `výška ${Math.round(vyska * 10) / 10} px mimo stupnici ${stupnice.join('/')}` });
    }
    const nejmensi = Math.min(...rohy);
    if (plocha && Math.max(...rohy) - nejmensi > 1 && (tag === 'button' || el.matches('[role="button"]'))) {
      nalezy.push({ ...popis(), chyba: 'různé zaoblení rohů jednoho tlačítka' });
    }
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
const PARAM = { maxJednoradkovy: MAX_JEDNORADKOVY, radky: RADKY, stupnice: STUPNICE, vyjimky: VYJIMKY_APLIKACE };
const PARAM_WEB = { ...PARAM, vyjimky: VYJIMKY_WEBU };
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});

/* ---------- Aplikace ---------- */
console.log('Aplikace');
// Podstrčený výpis procesů: měří se i karta „Zachytil jsem agenta“ a Moje nástroje (s nesledovaným
// nástrojem). PID nad maximem macOS i Linuxu – nic se nečte ze skutečných procesů.
const PS = [
  '  9000201 00:20:00  2.0 300000 /Applications/Warp.app/Contents/MacOS/stable',
  '  9000202 00:05:00  1.0 150000 /Users/qa/Applications/Chrome Apps.localized/Google AI Studio.app/Contents/MacOS/app_mode_loader',
  '  9000203 00:02:00  1.0 150000 /Applications/Perplexity.app/Contents/MacOS/Perplexity',
].join('\n');
const app = await startTestServer({ AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '500' }, { vypisProcesu: async () => ({ ok: true, stdout: PS }) });
for (let i = 0; i < 100 && !((await api(app.url).get('/api/state')).body.detekce?.nove?.length >= 3); i++) await new Promise((r) => setTimeout(r, 100));
if ((await api(app.url).send('POST', '/api/nastroje/warp/pridat', {})).status !== 200) throw new Error('Detekce v QA nezachytila Warp – karta by se neměřila.');
await api(app.url).send('POST', '/api/nastroje/perplexity/ignorovat', {});
for (let i = 0; i < 15; i++) {
  const dir = path.join(app.sourceHome, '.agents', 'skills', `vlastni-${i}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\nname: Vlastní dovednost ${i}\ndescription: Ukázka skutečného seznamu vlastních dovedností\n---\nText.\n`);
}
for (const [rootDir, name] of [['.claude', 'Claude'], ['.codex', 'Codex']]) {
  const dir = path.join(app.sourceHome, rootDir, 'skills', 'qa-dovednost');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name} dovednost\ndescription: Kontrola filtru zdroje\n---\nText.\n`);
}
for (const [rel, name] of [
  [['.claude', 'plugins', 'cache', 'claude-plugins-official', 'sample', 'skills', 'official'], 'Oficiální plugin'],
  [['.codex', 'skills', '.system', 'system'], 'Systémová dovednost'],
]) {
  const dir = path.join(app.sourceHome, ...rel);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Kontrola filtru původu\n---\nText.\n`);
}
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
await fs.mkdir('dist/qa', { recursive: true });
await api(app.url).send('PUT', '/api/settings', { appearance: 'dark' });
for (const sirka of SIRKY) {
  const page = await browser.newPage({ viewport: { width: sirka, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await page.goto(`${app.url}/#/dovednosti`);
  await page.waitForFunction(() => document.querySelectorAll('.skill').length >= 15);
  // Nástupy karet jsou řízené viditelností; projdeme celou stránku, aby snímek
  // odpovídal tomu, co uživatel uvidí při skutečném posouvání.
  for (let y = 0; y < await page.evaluate(() => document.documentElement.scrollHeight); y += 600) {
    await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(450);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `dist/qa/skills-populated-dark-${sirka}.png`, fullPage: true });
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
    // Hlavní výzva 56 px patří jen landing page; /app/ je rozhraní aplikace a drží její stupnici.
    vypis(`${sirka}px ${stranka}`, await page.evaluate(zmer, stranka === '/app/' ? PARAM : PARAM_WEB));
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
