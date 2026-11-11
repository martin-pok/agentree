// Chaos test (edge cases): nový uživatel, který se v aplikaci neorientuje, a zlomyslný tester, který
// cíleně hledá chyby. Náhodně (ale opakovatelně – AGENTEEQ_CHAOS_SEED) kliká na všechno, píše
// nesmysly a extrémní texty, mačká klávesy, rychle přepíná stránky, mění velikost okna, chodí zpět
// a vpřed a na chvíli mu „vypadne“ server. Po každém kroku hlídá: chyba JavaScriptu, zamrznutí
// hlavního vlákna, víc otevřených oken naráz, přetečení stránky, nekonečný růst DOM a paměti
// a návrat spojení po výpadku. Spouští se nad čistým profilem (první spuštění s průvodcem).
//
//   npm run qa:chaos            (QA_ENGINE=chromium|webkit, AGENTEEQ_CHAOS_KROKY=600)
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startTestServer } from '../test/helpers.mjs';
import { addTokens } from '../src/model.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.QA_OUTPUT_DIR || 'dist/qa';
await fs.mkdir(out, { recursive: true });
const engines = process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium'];
const KROKY = Number(process.env.AGENTEEQ_CHAOS_KROKY) || 600;
const SEED = Number(process.env.AGENTEEQ_CHAOS_SEED) || 20261111;

// Opakovatelná náhoda (mulberry32): nalezenou chybu jde přesně zopakovat stejným seedem.
function nahoda(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZLE_TEXTY = [
  '', ' ', '   \t  ', 'a', 'x'.repeat(5000), '😀🤖👨‍👩‍👧‍👦🏳️‍🌈'.repeat(40), 'مرحبا بالعالم שלום', 'Ž̴̡̛̫a̷͙̓l̵̰͝g̶̣̈o̴͕͝',
  '<script>window.__chaosXss=1</script>', '"><img src=x onerror="window.__chaosXss=2">', 'javascript:window.__chaosXss=3',
  "'; DROP TABLE projects; --", '../../../../etc/passwd', '%00%0a%0d', '\u0000\u0007\u001b[31m', '{{constructor.constructor("window.__chaosXss=4")()}}',
  '-1', '0', '1e309', 'NaN', '9'.repeat(400), 'Design & Web', 'C:\\Windows\\System32', '~/Desktop',
];
const KLAVESY = ['Escape', 'Escape', 'Tab', 'Shift+Tab', 'Enter', ' ', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown', 'Backspace', 'Meta+k', 'Control+k', '/', '?'];
const TRASY = ['prehled', 'upozorneni', 'agenti', 'projekty', 'statistiky', 'utrata', 'dovednosti', 'nastaveni', 'agent/codex%3Achaos-1', 'agent/neexistuje', 'projekt/neexistuje', 'nesmysl/%3Cscript%3E', ''];
const VELIKOSTI = [[1440, 900], [375, 812], [320, 568], [900, 700], [2560, 1400], [1180, 820]];

async function seed(server) {
  const now = Date.now();
  for (let i = 1; i <= 6; i++) {
    const s = server.app.store.ensure({ connector: 'codex', localId: `chaos-${i}`, provider: 'openai', app: 'Codex' });
    Object.assign(s, { title: i === 2 ? 'x'.repeat(400) : i === 3 ? '<img src=x onerror="window.__chaosXss=9">' : `Chaos agent ${i}`, lastAt: now - i * 60e3, startedAt: now - i * 120e3, cwd: i === 4 ? '/Users/qa/Design & Web' : '/Users/qa/proj' });
    if (i === 5) s.failure = { at: now, text: 'Limit vyčerpán' };
    addTokens(s, now - i * 1000, { input: 1000 * i, output: 200 * i });
    server.app.store.commit(s);
  }
  server.app.store.setLimit({ id: 'chaos-5h', label: 'Limit 5 h', app: 'Codex', provider: 'openai', usedPercent: 99.6, at: now, resetsAt: now + 3600e3 });
}

for (const engine of engines) {
  const rnd = nahoda(SEED);
  const vyber = (a) => a[Math.floor(rnd() * a.length)];
  const server = await startTestServer();
  await seed(server);
  const browser = await (engine === 'webkit' ? webkit : chromium).launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
  let offline = false;
  await context.route('**/api/**', (route) => (offline ? route.abort('internetdisconnected') : route.fallback()));
  const page = await context.newPage();
  const chyby = [];
  const log = [];
  page.on('pageerror', (e) => chyby.push(`JS chyba po kroku ${log.length}: ${e.message}\n  ${log.slice(-4).join('\n  ')}`));
  page.on('dialog', (d) => (rnd() < 0.5 ? d.accept() : d.dismiss()).catch(() => {}));
  page.on('popup', (p) => p.close().catch(() => {}));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Při simulovaném výpadku sítě jsou chyby požadavků očekávané; jinde ne.
    if (offline || /net::|Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_FAILED/.test(t)) return;
    chyby.push(`console.error po kroku ${log.length}: ${t}\n  ${log.slice(-4).join('\n  ')}`);
  });
  await page.goto(server.url);
  await page.waitForTimeout(800);
  let nejvicUzlu = 0, startUzlu = 0, startPamet = 0, nejvicPamet = 0, nejdelsiOdezva = 0;

  // Odezva hlavního vlákna: když evaluate neodpoví do 4 s, aplikace zamrzla.
  const odezva = async () => {
    const t0 = Date.now();
    const ok = await Promise.race([page.evaluate(() => 1).then(() => true).catch(() => true), new Promise((r) => setTimeout(() => r(false), 4000))]);
    const ms = Date.now() - t0;
    nejdelsiOdezva = Math.max(nejdelsiOdezva, ms);
    if (!ok) chyby.push(`ZAMRZNUTÍ: hlavní vlákno neodpovědělo 4 s po kroku ${log.length}\n  ${log.slice(-4).join('\n  ')}`);
  };

  for (let krok = 0; krok < KROKY; krok++) {
    const r = rnd();
    try {
      if (r < 0.42) {
        // Klik na náhodný viditelný ovládací prvek – nový uživatel zkouší, „co to dělá“.
        const prvky = page.locator('a[href]:visible, button:visible:not([disabled]), [role="button"]:visible, [role="tab"]:visible, [role="switch"]:visible, summary:visible, input[type="checkbox"]:visible, input[type="radio"]:visible, label:visible, [role="option"]:visible');
        const n = await prvky.count();
        if (n) {
          const i = Math.floor(rnd() * n);
          const el = prvky.nth(i);
          const popis = ((await el.getAttribute('aria-label').catch(() => '')) || (await el.innerText({ timeout: 300 }).catch(() => '')) || '').trim().slice(0, 40);
          const kolik = rnd() < 0.12 ? 5 : rnd() < 0.15 ? 2 : 1;
          log.push(`klik${kolik > 1 ? ` ×${kolik}` : ''} „${popis}“`);
          for (let k = 0; k < kolik; k++) await el.click({ timeout: 700, force: rnd() < 0.2, noWaitAfter: true }).catch(() => {});
        }
      } else if (r < 0.58) {
        // Psaní nesmyslů a extrémních textů do náhodného pole.
        const pole = page.locator('input:visible:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]), textarea:visible:not([disabled]), [contenteditable="true"]:visible');
        const n = await pole.count();
        if (n) {
          const el = pole.nth(Math.floor(rnd() * n));
          const text = vyber(ZLE_TEXTY);
          log.push(`píše ${JSON.stringify(text.slice(0, 24))}${text.length > 24 ? `… (${text.length})` : ''}`);
          await el.fill(text, { timeout: 700 }).catch(() => {});
          if (rnd() < 0.4) await el.press('Enter', { timeout: 500 }).catch(() => {});
        }
      } else if (r < 0.72) {
        const k = vyber(KLAVESY);
        const kolik = rnd() < 0.15 ? 8 : 1;
        log.push(`klávesa ${k}${kolik > 1 ? ` ×${kolik}` : ''}`);
        for (let i = 0; i < kolik; i++) await page.keyboard.press(k).catch(() => {});
      } else if (r < 0.82) {
        const t = vyber(TRASY);
        log.push(`trasa #/${t}`);
        await page.evaluate((h) => { location.hash = `#/${h}`; }, t).catch(() => {});
      } else if (r < 0.86) {
        const smer = rnd() < 0.5 ? 'zpět' : 'vpřed';
        log.push(smer);
        await (smer === 'zpět' ? page.goBack({ timeout: 1500 }) : page.goForward({ timeout: 1500 })).catch(() => {});
      } else if (r < 0.9) {
        const [w, h] = vyber(VELIKOSTI);
        log.push(`okno ${w}×${h}`);
        await page.setViewportSize({ width: w, height: h });
      } else if (r < 0.95) {
        log.push('kolečko');
        await page.mouse.move(rnd() * 800, rnd() * 600);
        await page.mouse.wheel(0, (rnd() - 0.3) * 4000);
      } else if (r < 0.975) {
        // Rychlé přepínání: deset tras za sebou bez čekání.
        log.push('zběsilé přepínání stránek');
        for (let i = 0; i < 10; i++) await page.evaluate((h) => { location.hash = `#/${h}`; }, vyber(TRASY)).catch(() => {});
      } else if (!offline) {
        // Výpadek serveru uprostřed práce – aplikace se musí sama vzpamatovat.
        log.push('výpadek serveru');
        offline = true;
        await page.waitForTimeout(400);
        for (let i = 0; i < 3; i++) await page.locator('button:visible').first().click({ timeout: 500, noWaitAfter: true }).catch(() => {});
        await page.waitForTimeout(2500);
        offline = false;
        log.push('server zpět');
        const zpet = await page.waitForFunction(() => document.querySelector('#conn-pill .dot--live'), null, { timeout: 25000 }).then(() => true).catch(() => false);
        if (!zpet) chyby.push(`Po výpadku se spojení do 25 s neobnovilo (krok ${krok})\n  ${log.slice(-6).join('\n  ')}`);
      }
    } catch (e) {
      if (!/Target closed|has been closed|Execution context was destroyed/.test(e.message)) chyby.push(`Krok ${krok} (${log.at(-1)}): ${e.message.split('\n')[0]}`);
    }
    await page.waitForTimeout(40 + rnd() * 120);
    await odezva();
    if (krok % 25 === 0 || krok === KROKY - 1) {
      const s = await page.evaluate(() => ({
        xss: window.__chaosXss || 0,
        modaly: document.querySelectorAll('dialog[open], .modal-scrim').length,
        toasty: document.querySelectorAll('#toasts .toast').length,
        uzly: document.getElementsByTagName('*').length,
        pamet: performance.memory?.usedJSHeapSize || 0,
        sirka: document.documentElement.scrollWidth - innerWidth,
        zavoj: document.querySelectorAll('.obnova-zavoj').length,
        prazdno: !(document.querySelector('#view')?.innerText || '').trim() && !document.querySelector('dialog[open]'),
        trasa: location.hash,
      })).catch(() => null);
      if (!s) continue;
      if (!startUzlu) { startUzlu = s.uzly; startPamet = s.pamet; }
      nejvicUzlu = Math.max(nejvicUzlu, s.uzly);
      nejvicPamet = Math.max(nejvicPamet, s.pamet);
      if (s.xss) chyby.push(`XSS se spustil (${s.xss}) po kroku ${krok}`);
      if (s.modaly > 2) chyby.push(`${s.modaly} otevřená okna naráz po kroku ${krok}\n  ${log.slice(-6).join('\n  ')}`);
      if (s.toasty > 1) chyby.push(`${s.toasty} hlášky naráz po kroku ${krok}`);
      if (s.sirka > 1) chyby.push(`Stránka ${s.trasa} přetéká do strany o ${s.sirka} px po kroku ${krok}`);
      if (s.zavoj > 1) chyby.push(`Víc závojů obnovy naráz po kroku ${krok}`);
      if (s.prazdno && !offline) {
        await page.waitForTimeout(1500);
        const porad = await page.evaluate(() => !(document.querySelector('#view')?.innerText || '').trim() && !document.querySelector('dialog[open]')).catch(() => false);
        if (porad) chyby.push(`Prázdná obrazovka na ${s.trasa} po kroku ${krok}\n  ${log.slice(-6).join('\n  ')}`);
      }
    }
  }
  // Na konci: aplikace musí jít normálně použít – zavřít okna a dojít na Přehled.
  for (let i = 0; i < 4; i++) await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => { location.hash = '#/prehled'; });
  const zije = await page.locator('#view').innerText({ timeout: 8000 }).then((t) => t.trim().length > 0).catch(() => false);
  if (!zije) chyby.push('Po chaosu nejde otevřít Přehled');
  await page.screenshot({ path: `${out}/chaos-${engine}.png` });
  if (startUzlu && nejvicUzlu > startUzlu * 6 + 4000) chyby.push(`DOM nekontrolovaně roste: ${startUzlu} → ${nejvicUzlu} uzlů`);
  if (startPamet && nejvicPamet > startPamet * 5 + 80e6) chyby.push(`Paměť nekontrolovaně roste: ${(startPamet / 1e6).toFixed(0)} → ${(nejvicPamet / 1e6).toFixed(0)} MB`);
  await browser.close();
  await server.close();
  const souhrn = { engine, seed: SEED, kroky: KROKY, nejdelsiOdezvaMs: nejdelsiOdezva, uzly: [startUzlu, nejvicUzlu], pametMB: [Math.round(startPamet / 1e6), Math.round(nejvicPamet / 1e6)], chyby: [...new Set(chyby)] };
  console.log(JSON.stringify(souhrn, null, 2));
  assert.equal(souhrn.chyby.length, 0, `${engine}: chaos našel ${souhrn.chyby.length} problémů (seed ${SEED})`);
}
