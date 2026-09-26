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
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer, api } from '../test/helpers.mjs';
import { buildSite } from './build-site.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROUTES = ['prehled', 'agenti', 'projekty', 'statistiky', 'utrata', 'upozorneni', 'dovednosti', 'nastaveni'];
const SIRKY = [1440, 375];

// Prvky s přechodem na pozadí nejdou přečíst z `backgroundColor`. U vlastních ploch proto bereme
// **nejsvětlejší zastávku** přechodu, což je pro slonovinový text nejhorší možný případ.
const PRECHODY = { stage: '#1A1722', 'pulse-bar': '#191722', hero: '#1A1722', 'ext-win-head': '#1A1722', 'shot-frame': '#1A1722' };

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
      const trida = Object.keys(prechody).find((c) => n.classList.contains(c));
      if (cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage) && trida) { vrstvy.push(hex(prechody[trida])); break; }
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

// Malý statický server pro sestavený web – hosting se tu simulovat nedá a `file://` by rozbilo
// absolutní cesty, na kterých stránka stojí.
function staticServer(dir) {
  const TYPY = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
  const server = http.createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const koren = path.resolve(dir) + path.sep;
    for (const kandidat of [rel, `${rel}/index.html`, 'index.html']) {
      // Porovnání s oddělovačem na konci: bez něj by `dist/web-jine` prošlo jako `dist/web`.
      const soubor = path.resolve(dir, kandidat);
      if (!soubor.startsWith(koren)) break;
      try {
        const body = await fs.readFile(soubor);
        res.writeHead(200, { 'Content-Type': TYPY[path.extname(soubor)] || 'application/octet-stream' }).end(body);
        return;
      } catch { /* zkusíme další kandidát */ }
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});

/* ---------- Aplikace ---------- */
console.log('Aplikace');
const app = await startTestServer();
// Trocha obsahu, aby se měřily i stavy s daty, ne jen prázdné obrazovky.
app.app.store.commit(Object.assign(app.app.store.ensure({ connector: 'codex', localId: 'qa-kontrast', provider: 'openai', app: 'Codex' }), { title: 'QA kontrast', lastAt: Date.now(), startedAt: Date.now() - 60000 }));
await api(app.url).send('POST', '/api/projects', { name: 'QA projekt' });
await api(app.url).send('PUT', '/api/settings', { welcomeCompleted: true, onboardingDismissed: true });

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
for (const stranka of ['/', '/en']) {
  for (const rezim of ['light', 'dark']) {
    for (const sirka of SIRKY) {
      const page = await browser.newPage({ viewport: { width: sirka, height: 1000 }, colorScheme: rezim, reducedMotion: 'reduce' });
      await page.goto(web.url + stranka, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      vypis(`${rezim} ${sirka}px ${stranka}`, await page.evaluate(zmer, PRECHODY));
      await page.close();
    }
  }
}
await new Promise((r) => web.server.close(r));

/* ---------- Okno rozšíření ---------- */
// Okno používá API Chromu, které mimo rozšíření neexistuje. Nahradíme ho minimální atrapou:
// měří se vzhled, ne chování, takže stačí, aby se okno vykreslilo v obou stavech.
console.log('Rozšíření pro Chrome');
const popup = await fs.readFile(path.join(root, 'extension/popup.html'), 'utf8');
const ext = await staticServer(path.join(root, 'extension'));
// „ověření“ = spárováno na stránce podporované služby s rozbalenou kartou ověření (všechny tóny řádků).
for (const [stav, paired] of [['nespárováno', false], ['spárováno', true], ['ověření', true]]) {
  for (const rezim of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 344, height: 900 }, colorScheme: rezim, reducedMotion: 'reduce' });
    await page.addInitScript(({ paired: p, overeni }) => {
      const data = { disabledSites: ['grok'], lastStatus: { ok: true, site: 'chatgpt', at: Date.now() - 240000 } };
      window.chrome = {
        storage: { local: { get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, data[x]])), set: async (o) => Object.assign(data, o) } },
        runtime: { getManifest: () => ({ version: '0.0.0' }), sendMessage: async () => ({ paired: p, status: { expectedVersion: '0.0.0' } }) },
      };
      if (overeni) {
        window.chrome.tabs = {
          query: async () => [{ id: 1 }],
          sendMessage: async () => ({ site: 'gemini', konverzace: 'adresa', pole: 'zadne', zpravy: { user: 2, assistant: 1, zdroj: 'obecne' }, generuje: false, limit: true, videl: { generovani: true, konec: true } }),
        };
      }
      const puvodni = window.fetch;
      window.fetch = async (u, i) => (String(u).includes('/api/health')
        ? new Response(JSON.stringify({ ok: true, ready: true }), { headers: { 'Content-Type': 'application/json' } })
        : puvodni(u, i));
    }, { paired, overeni: stav === 'ověření' });
    await page.goto(`${ext.url}/popup.html`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    if (stav === 'ověření') {
      await page.click('#check-open');
      await page.click('#check-no');
      await page.waitForTimeout(300);
    }
    vypis(`${rezim} 344px okno (${stav})`, await page.evaluate(zmer, PRECHODY));
    await page.close();
  }
}
await new Promise((r) => ext.server.close(r));
void popup;

await browser.close();

if (problemy.length) {
  console.error(`\nNEVYHOVUJE: ${problemy.length} textů pod hranicí WCAG 2.2 AA.`);
  process.exit(1);
}
console.log('\nVšechny texty v aplikaci, na webu i v okně rozšíření splňují WCAG 2.2 AA.');
