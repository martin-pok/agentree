// Kontrast podle WCAG 2.2 AA – měřený na skutečně vykreslené ploše: `npm run qa:contrast`
//
// Rozdíl oproti kontrole v `scripts/qa-desktop.mjs`: ta porovnává dvojice tokenů z `:root`, tedy
// to, co jsme zamýšleli. Tenhle skript projde **každý viditelný text** a spočítá jeho kontrast
// proti pozadí, které pod ním doopravdy leží – včetně poloprůhledných vrstev nad sebou. Odhalí
// tak i případ, kdy jsou oba tokeny v pořádku, ale jejich kombinace na konkrétním místě ne
// (přesně tak se našel odznak „Ověřeno“ s poměrem 4,45:1).
//
// Pokrývá aplikaci (všechny obrazovky, světlý i tmavý režim, 1440 a 375 px), landing page
// a okno rozšíření pro Chrome. Playwright se bere stejně jako v qa-desktop.mjs – z PLAYWRIGHT_PATH
// nebo z globální instalace, aby projekt zůstal bez závislostí.
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

// Prvky s přechodem na pozadí nejdou přečíst z `backgroundColor`. U vlastních ploch proto bereme
// **nejsvětlejší zastávku** přechodu, což je pro slonovinový text nejhorší možný případ.
// Hlavní pruh aplikace má ve Dni světlý nádech a v Noci tmavý: pro tmavý text ve Dni je nejhorší
// nejtmavší zastávka (modrá), pro světlý text v Noci nejsvětlejší – obojí složené na podklad stránky.
const PRECHODY = { stage: '#1A1722', 'pulse-bar': '#C8D8F2', 'pulse-bar@dark': '#1E2330', hero: '#1A1722', 'ext-win-head': '#1A1722', 'shot-frame': '#1A1722' };

// Měření běží uvnitř stránky: potřebuje vidět skutečné vypočtené styly každého uzlu.
function zmer(prechody) {
  const parse = (c) => {
    // `color-mix()` prohlížeč vrací jako `color(srgb r g b / a)` v rozsahu 0–1. Bez tohoto převodu
    // by se taková vrstva tiše přeskočila a měřilo by se proti pozadí pod ní.
    const srgb = String(c).match(/color\(srgb\s+([^)]+)\)/);
    if (srgb) {
      const [rgb, alfa] = srgb[1].split('/');
      const [r, g, b] = rgb.trim().split(/\s+/).map((v) => Number(v) * 255);
      return { r, g, b, a: alfa === undefined ? 1 : Number(alfa) };
    }
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: 1 });
  const pres = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const jas = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const pomer = (a, b) => { const l1 = jas(a), l2 = jas(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

  // Pozadí se skládá odspodu: jde se po předcích, dokud se nenarazí na neprůhlednou vrstvu.
  function pozadi(el) {
    const vrstvy = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const trida = Object.keys(prechody).find((c) => !c.includes('@') && n.classList.contains(c));
      const tmave = document.documentElement.dataset.theme === 'dark' && prechody[`${trida}@dark`];
      if (cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage) && trida) { vrstvy.push(hex(tmave || prechody[trida])); break; }
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) { vrstvy.push(bg); if (bg.a === 1) break; }
    }
    if (!vrstvy.length || vrstvy[vrstvy.length - 1].a < 1) vrstvy.push(parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 });
    let zaklad = vrstvy[vrstvy.length - 1];
    for (let i = vrstvy.length - 2; i >= 0; i--) zaklad = pres(vrstvy[i], zaklad);
    return zaklad;
  }

  const nalezy = [];
  const videno = new Set();
  const chodec = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = chodec.nextNode(); t; t = chodec.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || videno.has(el)) continue;
    videno.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = pozadi(el);
    const barva = fg.a < 1 ? pres(fg, bg) : fg;
    const px = parseFloat(cs.fontSize);
    const vaha = Number(cs.fontWeight) || 400;
    // AA: velký text (24 px, nebo 18,66 px tučně) stačí 3:1, jinak 4,5:1.
    const pozadovano = px >= 24 || (px >= 18.66 && vaha >= 700) ? 3 : 4.5;
    const vysledek = pomer(barva, bg);
    if (vysledek + 0.01 < pozadovano) {
      nalezy.push({
        text: t.textContent.trim().slice(0, 60),
        prvek: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''),
        pomer: Math.round(vysledek * 100) / 100, pozadovano, px, vaha,
        popredi: cs.color, pozadi: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      });
    }
  }
  return nalezy;
}

const problemy = [];
function vypis(kde, nalezy) {
  if (!nalezy.length) { console.log(`  ${kde}: v pořádku`); return; }
  console.log(`  ${kde}: NEVYHOVUJE (${nalezy.length})`);
  for (const n of nalezy) {
    console.log(`     „${n.text}“ – ${n.pomer}:1, potřeba ${n.pozadovano}:1 (${n.px}px/${n.vaha}, ${n.popredi} na ${n.pozadi}) ${n.prvek}`);
    problemy.push({ kde, ...n });
  }
}

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});

/* ---------- Aplikace ---------- */
console.log('Aplikace');
// Podstrčený výpis procesů místo skutečného `ps`: měří se i karta „Zachytil jsem agenta“ a Moje
// nástroje v Nastavení. PID nad maximem macOS i Linuxu – nic se nečte ze skutečných procesů.
const PS = [
  '  9000201 1 00:20:00  2.0 300000 /Applications/Warp.app/Contents/MacOS/stable',
  '  9000202 1 00:05:00  1.0 150000 /Users/qa/Applications/Chrome Apps.localized/Google AI Studio.app/Contents/MacOS/app_mode_loader',
  '  9000203 1 00:02:00  1.0 150000 /Applications/Perplexity.app/Contents/MacOS/Perplexity',
].join('\n');
const app = await startTestServer(
  { AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '500' },
  { vypisProcesu: async () => ({ ok: true, stdout: PS }) },
);
// Trocha obsahu, aby se měřily i stavy s daty, ne jen prázdné obrazovky.
app.app.store.commit(Object.assign(app.app.store.ensure({ connector: 'codex', localId: 'qa-kontrast', provider: 'openai', app: 'Codex' }), { title: 'QA kontrast', status: 'needs_input', lastAt: Date.now(), startedAt: Date.now() - 60000 }));
for (let i = 0; i < 3; i++) {
  const dir = path.join(app.sourceHome, '.agents', 'skills', `vlastni-${i}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\nname: Vlastní dovednost ${i}\ndescription: Ukázka vlastního zdroje\n---\nText.\n`);
}
for (const [rootDir, name] of [['.claude', 'Claude'], ['.codex', 'Codex']]) {
  const dir = path.join(app.sourceHome, rootDir, 'skills', 'qa-dovednost');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name} dovednost\ndescription: Kontrola filtru zdroje\n---\nText.\n`);
}
// Útrata z Admin API s rozpadem po modelech (jinak by se rozbalený panel a řádek „Organizace přes
// API“ ve Statistikách neměřily). Atrapa konektoru – síť se v QA nikdy nevolá.
{
  const den = new Date().toISOString().slice(0, 10);
  const cb = app.app.connectors['cloud-billing'];
  cb.autoEntries = () => [{ id: `auto:anthropic-admin:${den}`, service: 'anthropic-api', kind: 'api', amount: 12.5, currency: 'USD', date: den, recurring: null, note: 'Admin API', auto: true }];
  cb.modelEntries = () => [
    { service: 'anthropic-api', date: den, model: 'claude-opus-5', amount: 10, currency: 'USD', tokens: { input: 1200000, output: 300000, cached: 5000000 } },
    { service: 'anthropic-api', date: den, model: null, amount: 2.5, currency: 'USD', tokens: null },
  ];
  cb.providers = () => ({ 'anthropic-admin': { state: 'connected', detail: '', at: Date.now(), source: 'env', tokens: { [den]: { input: 1200000, output: 300000 } }, tokensError: null }, 'openai-admin': { state: 'connected', detail: '', at: Date.now(), source: 'env', tokens: null, tokensError: 'OpenAI odpověděla 403' } });
}
await api(app.url).send('POST', '/api/projects', { name: 'QA projekt' });
await api(app.url).send('PUT', '/api/settings', { welcomeCompleted: true, onboardingDismissed: true });
for (let i = 0; i < 100 && !((await api(app.url).send('GET', '/api/state')).body.detekce?.nove?.length >= 3); i++) await new Promise((r) => setTimeout(r, 100));
if ((await api(app.url).send('POST', '/api/nastroje/warp/pridat', {})).status !== 200) throw new Error('Detekce v QA nezachytila Warp – karta by se neměřila.');

for (const rezim of ['light', 'dark']) {
  await api(app.url).send('PUT', '/api/settings', { appearance: rezim });
  for (const sirka of SIRKY) {
    const page = await browser.newPage({ viewport: { width: sirka, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    for (const trasa of ROUTES) {
      await page.goto(`${app.url}/#/${trasa}`, { waitUntil: 'domcontentloaded' });
      // Čekáme na text, ne na první uzel: některé obrazovky vykreslí nejdřív prázdné oblasti.
      await page.waitForFunction(() => (document.querySelector('#view')?.innerText || '').trim().length > 0, null, { timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
      await page.keyboard.press('Escape'); // „Co je nového“ po aktualizaci
      await page.waitForTimeout(500);
      vypis(`${rezim} ${sirka}px /${trasa}`, await page.evaluate(zmer, PRECHODY));
      if (trasa === 'utrata') {
        // Plovoucí karta detekce může tlačítko překrývat – klik se proto pošle přímo prvku.
        await page.evaluate(() => { for (let i = 0, b; i < 20 && (b = document.querySelector('[data-models][aria-expanded="false"]')); i++) b.click(); });
        await page.waitForSelector('tr.ledger-models:not([hidden])');
        vypis(`${rezim} ${sirka}px /${trasa} › rozpad po modelech`, await page.evaluate(zmer, PRECHODY));
      }
      // Nastavení ukazují vždy jen jednu skupinu – měří se každá zvlášť, ať nic nezůstane neměřené.
      if (trasa === 'nastaveni') {
        const skupiny = await page.$$eval('.set-nav [data-jump]', (b) => b.map((x) => x.dataset.jump));
        for (const skupina of skupiny.slice(1)) {
          await page.click(`.set-nav [data-jump="${skupina}"]`);
          await page.waitForTimeout(150);
          vypis(`${rezim} ${sirka}px /${trasa} › ${skupina}`, await page.evaluate(zmer, PRECHODY));
        }
      }
    }
    await page.close();
  }
}
await app.close();

/* ---------- Landing page ---------- */
console.log('Landing page');
const { out } = await buildSite();
const web = await staticServer(out);
// /app = rozcestník statické kopie rozhraní (bez serveru). Tam se jednou ztratil text hlavního tlačítka.
for (const stranka of ['/', '/en', '/app/']) {
  for (const rezim of ['light', 'dark']) {
    for (const sirka of SIRKY) {
      const page = await browser.newPage({ viewport: { width: sirka, height: 1000 }, colorScheme: rezim, reducedMotion: 'reduce' });
      await page.goto(web.url + stranka, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      if (stranka === '/app/') await page.waitForSelector('.pair-box');
      vypis(`${rezim} ${sirka}px ${stranka}`, await page.evaluate(zmer, PRECHODY));
      await page.close();
    }
  }
}
await new Promise((r) => web.server.close(r));

/* ---------- Okno rozšíření ---------- */
// Okno používá API Chromu, které mimo rozšíření neexistuje; atrapa je v qa-rozsireni.mjs.
console.log('Rozšíření pro Chrome');
const ext = await staticServer(path.join(root, 'extension'));
for (const stav of STAVY_OKNA) {
  for (const rezim of ['light', 'dark']) {
    const page = await otevriOkno(browser, ext.url, stav, { colorScheme: rezim });
    vypis(`${rezim} 344px okno (${stav})`, await page.evaluate(zmer, PRECHODY));
    await page.close();
  }
}
await new Promise((r) => ext.server.close(r));

await browser.close();

if (problemy.length) {
  console.error(`\nNEVYHOVUJE: ${problemy.length} textů pod hranicí WCAG 2.2 AA.`);
  process.exit(1);
}
console.log('\nVšechny texty v aplikaci, na webu i v okně rozšíření splňují WCAG 2.2 AA.');
