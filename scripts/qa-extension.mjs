// Okno rozšíření v prohlížeči: `npm run qa:extension` (Chromium a WebKit, QA_ENGINE omezí na jeden).
// Skutečný extension/popup.html s atrapou Chrome API; měří se chování (klik, párování, filtr,
// klávesnice, listy), pravdivost stavů a rozměry okna. Snímky jdou do dist/qa-extension.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { atrapa, fixtura, OKNO } from './qa-rozsireni.mjs';
import { nactiAxe, axePoruseni } from './axe-kontrola.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve('extension');
const AXE = nactiAxe();
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
await fs.mkdir('dist/qa-extension', { recursive: true });
const results = [];
const launch = (engine) => (engine === 'chromium' ? chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) : webkit.launch());

// Měření společná všem stavům: velké číslo nikde, okno 600 px, nic nepřetéká do strany, pata na
// jednom řádku, česká sazba a čistá konzole.
async function spolecne(page, kde, errors) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('#refresh-popup').isVisible(), true, `${kde}: obnova musí být dostupná v každém stavu`);
  assert.equal(await page.locator('#hero-num').count(), 0, `${kde}: velké číslo se nevrací`);
  const velkeCislo = await page.evaluate(() => [...document.querySelectorAll('body *')].some((x) => /^\s*\d+\s*$/.test(x.textContent) && x.children.length === 0
    && x.getClientRects().length && parseFloat(getComputedStyle(x).fontSize) >= 28));
  assert.equal(velkeCislo, false, `${kde}: žádné velké samostatné číslo`);
  assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /(^|\s)[vkszouaiVKSZOUAI] /m, `${kde}: předložka na konci řádku`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${kde}: nic nepřetéká do strany`);
  const vyska = await page.evaluate(() => document.body.getBoundingClientRect().height);
  assert.ok(vyska <= 600, `${kde}: okno má ${Math.round(vyska)} px, Chrome ukáže jen 600`);
  // Žádná pata s „Otevřít Agenteeq“: aplikaci otevírá jen značka v hlavičce a dvě viditelná
  // ovládání nikdy nenesou stejný nebo podobný popisek (vlastník: „nesmí to být tak zmatečné“).
  assert.equal(await page.locator('footer, #app-link, #retry').count(), 0, `${kde}: žádná pata s druhým „Otevřít“`);
  const popisky = await page.evaluate(() => [...document.querySelectorAll('a, button')].filter((x) => x.getClientRects().length && !x.closest('[hidden], #konverzace'))
    .map((x) => (x.getAttribute('aria-label') || x.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean));
  assert.equal(new Set(popisky).size, popisky.length, `${kde}: dvě ovládání se stejným popiskem: ${popisky.join(' | ')}`);
  assert.equal(popisky.filter((x) => /^otevřít( v)? agenteeq|^open( in)? agenteeq/.test(x)).length, 0, `${kde}: nejasné „Otevřít Agenteeq“`);
  // Hlavička se vejde: značka, stav, obnova a služby na jednom řádku.
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.top > *')].every((x) => x.getBoundingClientRect().right <= innerWidth + 0.5 && x.getBoundingClientRect().height <= 32.5)), `${kde}: hlavička přetéká`);
  assert.equal(await page.locator('#sites input[type=checkbox]').count(), 11);
  assert.equal(await page.locator('#sites-open').isVisible(), true, `${kde}: služby a port jsou dostupné vždy`);
  // Obrys zaostření nemění tvar: kapsle zůstane kapslí, kruh kruhem.
  await page.locator('#refresh-popup').focus();
  assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).borderRadius), '50%');
  await page.evaluate(() => document.activeElement?.blur());
  assert.deepEqual(errors, [], `${kde}: konzole bez chyb`);
}

try {
  // QA_ENGINE=chromium omezí běh na jeden prohlížeč (lokálně bez WebKitu); CI jede oba.
  for (const engine of process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium', 'webkit']) {
    const browser = await launch(engine);
    try {
      for (const theme of ['light', 'dark']) for (const state of ['offline', 'unpaired', 'revoked', 'paired', 'outdated', 'novejsi', 'neovereno', 'overeni', 'overeni-chyby']) {
        const page = await browser.newPage({ viewport: OKNO, colorScheme: theme, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error' && !/favicon\.ico$/.test(m.location()?.url || '')) errors.push(`${m.text()} ${m.location()?.url || ''}`); });
        await page.addInitScript(({ state }) => {
          const ted = Date.now();
          const data = { disabledSites: [], lastStatus: { ok: true, site: 'chatgpt', at: ted } };
          window.fixture = { data, paired: ['paired', 'outdated', 'novejsi', 'neovereno', 'overeni', 'overeni-chyby'].includes(state), fail: true };
          // Ověření stránky: aktivní karta je podporovaná služba a její skript odpovídá diagnostikou.
          const diagnostika = state === 'overeni'
            ? { site: 'chatgpt', konverzace: 'adresa', pole: 'presne', zpravy: { user: 3, assistant: 3, zdroj: 'presne' }, generuje: false, limit: false, videl: { generovani: true, konec: true } }
            : { site: 'mscopilot', konverzace: 'karta', pole: 'zadne', zpravy: { user: 2, assistant: 1, zdroj: 'obecne' }, generuje: true, limit: true, videl: { generovani: true, konec: false } };
          window.otevrene = { 'chatgpt:a': { site: 'chatgpt', tab: 5, okno: 2, generating: true, od: ted - 42000, at: ted } };
          window.prehledFixture = {
            zdravi: { stav: 'pozor', veta: 'Na tvé rozhodnutí čeká agentů: 1', pracuje: 2, cekaNaTebe: 1, selhalo: 0, limit: 0 },
            rozhodnuti: [{ id: 'claude-code:a1', title: 'Migrace API na v2', app: 'Claude Code', reason: 'Čeká na povolení: Bash', status: 'needs_input', at: ted - 60000 }],
            pracuji: [
              { id: 'codex:b2', title: 'Refaktor platebního modulu', app: 'Codex', reason: 'Upravuje src/platby.js', at: ted - 5000 },
              { id: 'claude-code:c3', title: 'Testy pro přihlášení', app: 'Claude Code', reason: 'Spouští testy', at: ted - 12000 },
            ],
            nedavne: [{ id: 'local:ollama:n3', title: 'Lokální test promptu', app: 'Ollama', status: 'idle', at: ted - 26 * 3600e3 }],
          };
          window.chrome = {
            storage: { local: { get: async () => data, set: async o => Object.assign(data, o), remove: async () => {} }, session: { get: async () => ({ otevrene: window.otevrene }), set: async () => {} } },
            runtime: { reload: () => { fixture.znovuNacteno = (fixture.znovuNacteno || 0) + 1; }, getManifest: () => ({ version: '0.12.0', content_scripts: [{ matches: ['https://chatgpt.com/*'] }] }), sendMessage: async m => {
              // Souhrn agentů z aplikace (POST /api/extension/prehled): jeden čeká, dva pracují, jedna nedávná.
              if (m.type === 'agenteeq:prehled') return ['paired', 'outdated', 'novejsi'].includes(state) && fixture.paired ? window.prehledFixture : null;
              // Klik na agenta otevře rovnou konverzaci (open-agent): pozadí ji otevře v Chromu nebo aplikaci.
              if (m.type === 'agenteeq:open-agent') { fixture.focusedAgent = m.id; return { ok: true, kde: 'chrome' }; }
              if (m.type === 'agenteeq:open-app') { fixture.openApp = true; return { ok: true }; }
              if (m.type === 'agenteeq:pair') {
                if (fixture.fail) return { ok: false, error: 'Kód vypršel. Vytvoř nový v aplikaci.' };
                fixture.paired = true; return { ok: true };
              }
              // „neovereno“: aplikace odpovídá na /api/health, ale ověření rozšíření selže.
              // „novejsi“: rozšíření (0.12.0) je novější než aplikace (0.11.0), jako Store vs. Stable.
              return { paired: fixture.paired, online: fixture.paired && state !== 'neovereno', revoked: state === 'revoked', status: { expectedVersion: state === 'outdated' ? '0.13.0' : state === 'novejsi' ? '0.11.0' : '0.12.0' } };
            } },
          };
          // Aktivní karta mimo podporované služby (skript v ní neběží); kliknutí na řádek přepne kartu.
          window.chrome.tabs = { query: async () => [{ id: 99 }], get: async (id) => ({ id, title: id === 5 ? 'Plán marketingu na Q4 - ChatGPT' : 'ChatGPT' }), sendMessage: async (_id, m) => { if (m.type === 'agenteeq:refresh') { fixture.refreshes = (fixture.refreshes || 0) + 1; return { ok: true }; } throw new Error('bez skriptu'); }, update: async (id) => { fixture.prepnuto = id; } };
          window.chrome.windows = { update: async (id) => { fixture.okno = id; } };
          window.close = () => { fixture.zavreno = true; };
          if (state.startsWith('overeni')) {
            window.chrome.tabs = {
              update: async (id) => { fixture.prepnuto = id; },
              get: async (id) => ({ id, title: '' }),
              query: async () => [{ id: 7 }],
              sendMessage: async (_tab, m) => (m.type === 'agenteeq:refresh' ? (fixture.refreshes = (fixture.refreshes || 0) + 1, { ok: true }) : m.type === 'agenteeq:diagnostika' ? diagnostika
                : { format: 'agenteeq-vzorek', verze: 1, site: diagnostika.site, adresa: { host: 'chatgpt.com', cesta: '/c/x-id' }, prvku: 812, zkraceno: false, strom: { t: 'body' } }),
            };
          }
          window.fetch = async () => { if (state === 'offline') throw new Error('offline'); return new Response(JSON.stringify({ ok: true })); };
        }, { state });
        await page.goto(`${base}/popup.html`);
        await page.waitForFunction(() => document.body.dataset.stav !== 'nacitam');
        const kde = `${engine} ${theme} ${state}`;
        // WCAG 2.2 A/AA (axe-core) v každém stavu okna, ve světlém i tmavém vzhledu.
        assert.deepEqual(await axePoruseni(page, AXE), [], `${kde}: porušení WCAG 2.2 A/AA (axe)`);
        const text = () => page.evaluate(() => document.body.innerText);
        if (state === 'paired') {
          await page.locator('#refresh-popup').click();
          await page.waitForFunction(() => fixture.refreshes === 1 && !document.getElementById('refresh-popup').disabled);
          assert.equal(await page.evaluate(() => fixture.refreshes), 1, 'obnova znovu načte stav otevřené karty');
        }
        if (['paired', 'outdated', 'novejsi', 'overeni', 'overeni-chyby'].includes(state)) {
          assert.equal(await page.locator('#pill-text').textContent(), 'Připojeno');
          // Odpovídající chat ukazuje, jak dlouho už odpovídá, a titulek z karty bez názvu služby.
          assert.match(await page.locator('#scroll').innerText(), /odpovídá · 0:4\d/);
        }
        assert.equal(await page.locator('.radek--tato').isVisible(), state.startsWith('overeni'), `${state}: aktuální karta jen na podporované stránce`);
        assert.equal(await page.locator('#check-open').isVisible(), state.startsWith('overeni'), `${state}: ověření jen na podporované stránce`);
        if (['paired', 'outdated', 'novejsi'].includes(state)) {
          // Reflektor: jedna hlavní věc s pravdivou akcí. Agenteeq neumí schvalovat, jen otevřít agenta.
          assert.match(await page.locator('#spot').innerText(), /Potřebuje tě[\s\S]*Migrace API na v2[\s\S]*Čeká na povolení: Bash/);
          const cta = page.locator('#spot-stage .cta');
          assert.equal((await cta.innerText()).trim().replace(/\u00a0/g, ' '), 'Otevřít konverzaci');
          // Aplikaci otevírá značka v hlavičce s jasným jménem pro čtečku.
          assert.equal(await page.locator('#brand').getAttribute('aria-label'), 'Otevřít aplikaci Agenteeq');
          assert.equal(await page.locator('#brand').evaluate((x) => x.tagName), 'BUTTON', 'hlavička používá akci, ne navigační odkaz');
          assert.equal(await page.locator('#brand').isEnabled(), true, 'spárovaný popup umí vyvolat nativní aplikaci');
          assert.equal(await page.locator('#brand').getAttribute('href'), null, 'hlavička nemá cestu na technickou stránku serveru');
          assert.doesNotMatch(await text(), /Rozhodnout|Otevřít v Claude Code/, 'akce neslibuje, co Agenteeq neumí');
          assert.equal(await page.locator('#pager').isVisible(), false, 'jedna položka nemá stránkování');
          assert.equal(await page.locator('#souhrn').textContent(), 'Potřebuje tě 1 agent · 2 pracují');
          // Časová osa: pracující agenti, chat v kartě a nedávná konverzace z aplikace (nedavne[]).
          assert.deepEqual(await page.locator('.group-h').evaluateAll((h) => h.map((x) => x.firstChild.textContent.trim())), ['Teď', 'Dříve']);
          assert.match(await page.locator('#konverzace').innerText(), /Plán marketingu na Q4[\s\S]*Refaktor platebního modulu[\s\S]*Lokální test promptu[\s\S]*Ollama/);
        }
        if (state === 'paired') {
          await cta(page);
          // Řádek konverzace v jiné kartě do ní kliknutím přepne a okno se zavře.
          await page.locator('#konverzace li', { hasText: 'Plán marketingu na Q4' }).locator('button').click();
          assert.deepEqual(await page.evaluate(() => [fixture.prepnuto, fixture.okno, fixture.zavreno]), [5, 2, true]);
          // Agent v ose otevře rovnou svou konverzaci (open-agent), nedávná konverzace taky.
          await page.locator('#konverzace li', { hasText: 'Refaktor platebního modulu' }).locator('button').click();
          await page.waitForFunction(() => fixture.focusedAgent === 'codex:b2');
          await page.locator('#konverzace li', { hasText: 'Lokální test promptu' }).locator('button').click();
          await page.waitForFunction(() => fixture.focusedAgent === 'local:ollama:n3');
          // Klávesnice v ose: šipky přesouvají zaostření mezi řádky.
          await page.locator('#konverzace button.radek').first().focus();
          await page.keyboard.press('ArrowDown');
          assert.equal(await page.evaluate(() => document.activeElement.closest('li')?.textContent.includes('Refaktor')), true, 'šipka dolů vede na další řádek');
          await page.keyboard.press('End');
          assert.equal(await page.evaluate(() => document.activeElement.closest('li')?.textContent.includes('Lokální test')), true);
        }
        if (state === 'paired' || state.startsWith('overeni')) {
          // Služby jsou list (dialog) nad oknem; Esc ho zavře a zaostření se vrátí na tlačítko.
          await page.locator('#sites-open').click();
          assert.equal(await page.locator('#sites-open').getAttribute('aria-expanded'), 'true');
          assert.equal(await page.locator('#view-sluzby').isVisible(), true);
          assert.equal(await page.locator('#view-sluzby [role=dialog]').getAttribute('aria-modal'), 'true');
          await page.locator('#sites input[type=checkbox]').first().focus();
          await page.keyboard.press('Space');
          assert.ok(await page.evaluate(() => fixture.data.disabledSites.includes('chatgpt')));
          assert.equal(await page.locator('#sites-count').textContent(), '10 z 11');
          if (state === 'paired') {
            await page.locator('#port').fill('80');
            await page.locator('#port-form button').click();
            assert.equal(await page.locator('#port-msg').textContent(), 'Port je číslo od 1024 do 65535.');
            assert.equal(await page.locator('#port').getAttribute('aria-invalid'), 'true');
          }
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#view-sluzby').isVisible(), false, 'Esc zavře list');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'sites-open', 'zaostření se vrátí tam, odkud list otevřel');
          // Vypnutá služba hned zmizí z osy.
          assert.doesNotMatch((await page.locator('#konverzace button.radek').allInnerTexts()).join(' '), /ChatGPT|Plán marketingu/);
          assert.doesNotMatch(await page.locator('#spot').innerText(), /ChatGPT|Plán marketingu/, 'ani v reflektoru');
        }
        if (state === 'paired') {
          // Filtr Vše · Agenti · Chaty a pravdivý prázdný stav.
          await page.locator('[data-filtr="chaty"]').click();
          assert.equal(await page.locator('[data-filtr="chaty"]').getAttribute('aria-pressed'), 'true');
          assert.equal(await page.locator('#prazdne-konverzace').textContent(), 'Žádný chat v\u00a0prohlížeči.');
          await page.evaluate(async () => {
            fixture.data.disabledSites = [];
            window.otevrene = {
              a: { site: 'chatgpt', tab: 5, okno: 2, generating: true, od: Date.now() - 42000, at: Date.now() },
              b: { site: 'claude', tab: 6, okno: 2, generating: false, limit: true, at: Date.now() },
              c: { site: 'gemini', tab: 7, okno: 2, generating: false, limit: false, at: Date.now() },
            };
            await render();
          });
          assert.equal(await page.locator('#konverzace li').count(), 3);
          assert.match(await page.locator('#konverzace').innerText(), /narazil na limit/);
          await page.locator('[data-filtr="agenti"]').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('#konverzace li').count(), 3, 'dva pracující agenti a nedávná konverzace');
          assert.doesNotMatch(await page.locator('#konverzace').innerText(), /ChatGPT|Gemini/);
          await page.locator('[data-filtr="vse"]').click();
          assert.equal(await page.locator('#konverzace li').count(), 6);
          // Nové rozhodnutí: okno nepřeskočí, jen označí šipku a počet; ←/→ na reflektoru listuje.
          await page.evaluate(() => {
            // Nová data jdou i do odpovědi aplikace, jinak by je pravidelná obnova okna (2 s) přepsala.
            prehled = { ...prehled, zdravi: { ...prehled.zdravi, cekaNaTebe: 2 }, rozhodnuti: [{ id: 'codex:new', title: 'Úklid závislostí', app: 'Codex', reason: 'Ptá se: smazat složku legacy/?', status: 'needs_input', at: Date.now() }, ...prehled.rozhodnuti] };
            window.prehledFixture = prehled;
            vykresli();
          });
          assert.equal(await page.locator('#pager').isVisible(), true);
          assert.equal(await page.locator('#pager-count').textContent(), '2 / 2', 'skutečný počet a pozice zobrazené položky');
          assert.match(await page.locator('#spot .spot-title').innerText(), /Migrace API na v2/, 'okno samo nepřeskočí');
          assert.equal(await page.locator('#spot-prev').evaluate((b) => b.classList.contains('ma-nove')), true, 'nová položka je označená na šipce');
          await page.locator('#spot').focus();
          await page.keyboard.press('ArrowLeft');
          assert.match(await page.locator('#spot .spot-title').innerText(), /Úklid závislostí/);
          assert.equal(await page.locator('#pager-count').textContent(), '1 / 2');
          assert.equal(await page.locator('#spot-prev').evaluate((b) => b.classList.contains('ma-nove')), false);
          await page.waitForFunction(() => /Úklid závislostí/.test(document.getElementById('announce').textContent)); // změna jde i čtečce
        }
        if (['unpaired', 'revoked'].includes(state)) {
          assert.equal(await page.locator('#pill-text').textContent(), 'Nespárováno');
          assert.match(await page.locator('#pairing').innerText(), state === 'revoked' ? /Spáruj rozšíření znovu[\s\S]*Předchozí spárování už neplatí/ : /Spáruj rozšíření kódem/);
          // Jednorázový kód má 16 znaků [A-Za-z0-9_-] – kratší, delší ani jiné znaky se neodešlou.
          assert.equal(await page.locator('#code').getAttribute('maxlength'), '16');
          for (const spatny of ['bad', 'abcdefghijklmno', 'abcdefghijklmno!']) {
            await page.locator('#code').fill(spatny); await page.locator('#pair').click();
            assert.equal(await page.locator('#code').getAttribute('aria-invalid'), 'true', `kód „${spatny}“ je neplatný`);
            assert.equal(await page.locator('#pair-msg').textContent(), 'Kód má 16 znaků – zkopíruj ho z Agenteeq celý.');
          }
          await page.locator('#code').fill('abcdefghijklmnop'); await page.locator('#pair').click();
          await page.waitForFunction(() => document.getElementById('pair-msg').textContent.includes('vypršel'));
          // Chaty v kartách rozšíření ukáže i bez spárování.
          assert.match(await page.locator('#konverzace').innerText(), /Plán marketingu na Q4/);
          await page.evaluate(() => { fixture.fail = false; }); await page.locator('#pair').click();
          await page.waitForFunction(() => document.getElementById('pairing').hidden);
          assert.ok((await page.locator('#pill-text').textContent()).includes('Připojeno'));
        }
        if (state.startsWith('overeni')) {
          await page.locator('#check-open').focus();
          await page.keyboard.press('Enter');
          await page.waitForFunction(() => document.querySelectorAll('#checks li').length >= 4);
          assert.equal(await page.locator('#view-overeni').isVisible(), true);
          const radky = await page.locator('#checks li').allTextContents();
          assert.ok(radky.every((t) => t.trim().length > 10), 'každý řádek nese stav větou');
          if (state === 'overeni') assert.ok(radky.includes('Tvoje zprávy 3 · odpovědi 3') && radky.includes('Začátek i konec odpovědi zachycen'));
          else assert.ok(radky.some((t) => t.includes('přibližně')) && radky.some((t) => t.includes('nenalezeno')) && radky.some((t) => t.includes('limit')));
          assert.equal(await page.locator('#check-site').textContent(), state === 'overeni' ? 'ChatGPT' : 'Microsoft Copilot');
          await page.locator(state === 'overeni' ? '#check-yes' : '#check-no').click();
          assert.equal(await page.locator(state === 'overeni' ? '#check-yes' : '#check-no').getAttribute('aria-pressed'), 'true');
          const [stazeni] = await Promise.all([page.waitForEvent('download'), page.locator('#check-save').click()]);
          const soubor = JSON.parse(await fs.readFile(await stazeni.path(), 'utf8'));
          assert.equal(soubor.format, 'agenteeq-vzorek');
          assert.equal(soubor.potvrzeni, state === 'overeni' ? 'sedi' : 'nesedi');
          assert.equal(soubor.diagnostika.site, soubor.site);
          assert.match(stazeni.suggestedFilename(), /^agenteeq-vzorek-[\w-]+-\d{4}-\d{2}-\d{2}\.json$/);
          await page.waitForFunction(() => document.getElementById('check-msg').textContent.includes('Uloženo'));
          await page.screenshot({ path: `dist/qa-extension/${engine}-${theme}-${state}-list.png` });
          await page.locator('#view-overeni .panel [data-close]').click();
          assert.equal(await page.locator('#view-overeni').isVisible(), false, 'Zavřít vede na hlavní pohled');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'check-open');
          // Test výš vypnul ChatGPT – aktuální karta to musí hned říct; Microsoft Copilot zůstal zapnutý a odpovídá.
          assert.match(await page.locator('.radek--tato').innerText(), state === 'overeni' ? /sledování této služby je vypnuté/ : /odpovídá/);
        }
        if (state === 'offline') {
          assert.equal(await page.locator('#pill-text').textContent(), 'Neběží');
          assert.match(await page.locator('#spot').innerText(), /Agenteeq na tomto počítači neběží[\s\S]*Stáhnout Agenteeq/);
          assert.equal(await page.locator('#download').getAttribute('href'), 'https://agentree-fawn.vercel.app/');
          // Jediná hlavní výzva je „Stáhnout“; znovu to zkusí obnova v hlavičce, značka není odkaz na nedostupnou adresu.
          assert.equal(await page.locator('.btn--primary:visible').count(), 1, 'jedna hlavní výzva');
          assert.equal(await page.locator('#brand').getAttribute('href'), null);
          // Nezjištěno ≠ nic neběží: bez aplikace okno počty agentů nehádá.
          assert.match(await page.locator('#souhrn').textContent(), /nezjištěno/);
          assert.doesNotMatch(await text(), /nikdo nepracuje|nic neběží|V pořádku/i);
          // Chaty v kartách rozšíření vidí i bez aplikace.
          assert.match(await page.locator('#konverzace').innerText(), /Plán marketingu na Q4[\s\S]*odpovídá/);
        }
        if (state === 'outdated') {
          assert.match(await page.locator('#outdated').innerText(), /0\.13\.0/);
          // Aktualizace jedním klepnutím přímo v okně: rozbalená kopie se znovu načte ze složky,
          // kterou aplikace přepsala, a pokus se zapamatuje (po načtení odjinud to okno řekne).
          await page.locator('#outdated-btn').click();
          await page.waitForFunction(() => window.fixture.znovuNacteno === 1);
          assert.equal(await page.evaluate(async () => (await window.chrome.storage.local.get()).aktualizacePokus?.cil), '0.13.0');
        }
        // Starší aplikace nesmí rozšíření nabízet „novou“ verzi, která je ve skutečnosti starší.
        if (state === 'novejsi') assert.equal(await page.locator('#outdated').isVisible(), false, 'aplikace je starší než rozšíření');
        if (state === 'neovereno') {
          // Nepodařené ověření není „neběží“ (s odkazem ke stažení) ani „nespárováno“.
          assert.match((await page.locator('#spot').innerText()).replace(/\u00a0/g, ' '), /Nepodařilo se ověřit spojení s Agenteeq[\s\S]*Aplikace běží/);
          assert.equal(await page.locator('#pill-text').textContent(), 'Neověřeno');
          assert.equal(await page.locator('#spot-intro').isVisible(), false, 'žádná nabídka ke stažení');
          assert.equal(await page.locator('#download').isVisible(), false);
          assert.equal(await page.locator('#pairing').isVisible(), false, 'žádná výzva ke spárování');
          assert.doesNotMatch(await text(), /neběží|Stáhnout|Nespárováno|nikdo nepracuje/i);
          assert.match(await text(), /nezjištěno/);
          // Chaty v kartách rozšíření ukazuje dál.
          assert.match(await page.locator('#konverzace').innerText(), /Plán marketingu na Q4/);
        }
        if (state === 'paired') {
          await page.locator('#brand').click();
          await page.waitForFunction(() => fixture.openApp === true && fixture.zavreno === true);
          assert.equal(page.url(), `${base}/popup.html`, 'otevření aplikace nepřesměruje Chrome na localhost');
        }
        await page.mouse.move(0, 0);
        await spolecne(page, kde, errors);
        await page.screenshot({ path: `dist/qa-extension/${engine}-${theme}-${state}.png` });
        results.push({ engine, theme, state, passed: true }); await page.close();
      }

      // Skutečná data z briefu návrhu (qa-rozsireni.mjs): rušno, klid, nezjištěno a bez aplikace.
      for (const theme of ['light', 'dark']) for (const stav of ['rušno', 'klid', 'nezjištěno', 'neběží', 'nespárováno']) {
        const page = await browser.newPage({ viewport: OKNO, colorScheme: theme, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error' && !/favicon\.ico$/.test(m.location()?.url || '')) errors.push(`${m.text()} ${m.location()?.url || ''}`); });
        const ted = Date.now();
        await page.addInitScript(atrapa, { stav, ted, f: fixtura(stav, ted) });
        await page.goto(`${base}/popup.html`);
        await page.waitForFunction(() => document.body.dataset.stav !== 'nacitam');
        await page.waitForTimeout(100);
        const kde = `${engine} ${theme} ${stav}`;
        // Co je vidět bez posunu: řádky osy celé nad patou a kolik různých log na nich je.
        const videt = () => page.evaluate(() => {
          const pata = innerHeight;
          const radky = [...document.querySelectorAll('#konverzace .radek')].filter((r) => r.getBoundingClientRect().bottom <= pata + 1);
          return { radky: radky.length, loga: new Set(radky.map((r) => r.querySelector('.tile img')?.getAttribute('src')).filter(Boolean)).size };
        });
        if (stav === 'rušno') {
          assert.equal(await page.locator('#pager-count').textContent(), '1 / 3', `${kde}: skutečný počet rozhodnutí`);
          const v = await videt();
          assert.ok(v.radky >= 2 && v.loga >= 2, `${kde}: bez posunu jsou vidět konverzace od různých poskytovatelů (${JSON.stringify(v)})`);
          assert.match((await page.locator('#konverzace').innerText()).replace(/\u00a0/g, ' '), /Shrnutí novinek z\sAI[\s\S]*Překlad do čínštiny[\s\S]*Lokální test promptu/, 'nedávné konverzace napříč nástroji');
          // Stav se v řádcích neopakuje jako štítek: skupina „Teď“ a barva činnosti stačí.
          assert.equal(await page.locator('#konverzace .pill, #konverzace .stitek').count(), 0);
          await page.locator('#spot-next').click();
          assert.match((await page.locator('#spot .spot-title').innerText()).replace(/\u00a0/g, ' '), /Úklid závislostí v\smonorepu/);
          await page.locator('#spot-next').click();
          assert.match((await page.locator('#spot').innerText()).replace(/\u00a0/g, ' '), /Narazil na limit[\s\S]*obnova ve\s14:00/);
          assert.equal(await page.locator('#spot').getAttribute('data-tone'), 'brass');
        }
        if (stav === 'klid') {
          assert.match((await page.locator('#spot').innerText()).replace(/\u00a0/g, ' '), /Všechno je v klidu/);
          const v = await videt();
          assert.ok(v.radky >= 4, `${kde}: v klidu je vidět aspoň 4 nedávné konverzace (${v.radky})`);
        }
        if (stav === 'nezjištěno') {
          assert.match((await page.locator('#spot').innerText()).replace(/\u00a0/g, ' '), /Nepodařilo se zjistit, co na počítači běží[\s\S]*nezjištěno/);
          assert.equal(await page.locator('#pill').getAttribute('data-tone'), 'warn');
          assert.doesNotMatch((await page.evaluate(() => document.body.innerText)).replace(/\u00a0/g, ' '), /Všechno je v klidu|nikdo nepracuje|V pořádku/i, `${kde}: nezjištěno se nevydává za klid`);
        }
        await page.mouse.move(0, 0);
        await spolecne(page, kde, errors);
        await page.screenshot({ path: `dist/qa-extension/${engine}-${theme}-${stav}.png` });
        results.push({ engine, theme, state: stav, passed: true }); await page.close();
      }

      // Užší okno (320 px) a zvětšení 200 % (polovina výšky): nic nepřetéká, obsah jde posunout.
      for (const [nazev, viewport, sirka] of [['320px', { width: 320, height: 600 }, '320px'], ['zoom-200', { width: 380, height: 300 }, '380px']]) {
        const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        const ted = Date.now();
        await page.addInitScript(atrapa, { stav: 'rušno', ted, f: fixtura('rušno', ted) });
        await page.addInitScript((w) => { document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--w', w)); }, sirka);
        await page.goto(`${base}/popup.html`);
        await page.waitForFunction(() => document.body.dataset.stav !== 'nacitam');
        await page.evaluate(() => document.fonts.ready);
        // Při selhání vypíše, které prvky přetékají (CI má novější Chromium než vývojový stroj).
        const pretok = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, iw: innerWidth,
          prvky: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).slice(0, 6)
            .map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.classList.length ? '.' + [...e.classList].join('.') : ''} right=${Math.round(e.getBoundingClientRect().right)}`) }));
        assert.equal(pretok.sw > pretok.iw, false, `${engine} ${nazev}: nic nepřetéká do strany ${JSON.stringify(pretok)}`);
        assert.ok(await page.evaluate(() => [...document.querySelectorAll('.top > *')].every((x) => x.getBoundingClientRect().right <= innerWidth + 0.5)), `${engine} ${nazev}: hlavička se vejde`);
        assert.ok(await page.evaluate(() => [...document.querySelectorAll('.filter, #pager, #spot-stage .cta')].every((x) => x.getBoundingClientRect().right <= innerWidth + 0.5)), `${engine} ${nazev}: ovládání je celé vidět`);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `dist/qa-extension/${engine}-${nazev}.png`, fullPage: true });
        results.push({ engine, theme: 'light', state: nazev, passed: true }); await page.close();
      }
    } finally { await browser.close(); }
  }
  // Angličtina: okno se řídí _locales (chrome.i18n). Nesmí v něm zůstat nic česky a nic nesmí
  // přetékat do strany ani s delšími anglickými texty.
  const prohlizec = await launch('chromium');
  try {
    for (const state of ['offline', 'unpaired', 'paired', 'sluzby', 'overeni']) {
      const page = await prohlizec.newPage({ viewport: OKNO, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(({ state }) => {
        const ted = Date.now();
        const data = { disabledSites: ['grok'], lastStatus: { ok: true, site: 'claude', at: ted - 180000 } };
        const sparovano = !['offline', 'unpaired'].includes(state);
        window.chrome = {
          i18n: { getMessage: (k) => (k === 'jazyk' ? 'en' : '') },
          storage: { local: { get: async () => data, set: async (o) => Object.assign(data, o) }, session: { get: async () => ({ otevrene: {
            a: { site: 'chatgpt', tab: 1, okno: 1, generating: true, od: ted - 42000, at: ted },
            b: { site: 'claude', tab: 2, okno: 1, generating: false, konec: ted - 180000, at: ted },
            c: { site: 'codex-web', tab: 3, okno: 1, generating: false, limit: true, at: ted },
          } }), set: async () => {} } },
          // Souhrn z aplikace nese českou větu (starší server); okno ji skládá samo v angličtině.
          runtime: { getManifest: () => ({ version: '0.12.0' }), sendMessage: async (m) => (m?.type === 'agenteeq:prehled'
            ? (sparovano ? { zdravi: { stav: 'pozor', veta: 'Na tvé rozhodnutí čeká agentů: 1', pracuje: 1, cekaNaTebe: 1, selhalo: 0, limit: 0 },
              rozhodnuti: [{ id: 'claude-code:x', title: 'API migration', app: 'Claude Code', reason: 'Waiting for permission: Bash', status: 'needs_input', at: ted - 60000 }],
              pracuji: [{ id: 'codex:y', title: 'Payments refactor', app: 'Codex', reason: 'Editing src/payments.js', at: ted - 5000 }],
              nedavne: [{ id: 'cursor:z', title: 'Landing page', app: 'Cursor', status: 'waiting', at: ted - 3600e3 }] } : null)
            : { paired: sparovano, online: sparovano, status: { expectedVersion: '0.13.0' } }) },
          tabs: { query: async () => [{ id: 1 }], update: async () => {}, sendMessage: async (_t, m) => (m.type === 'agenteeq:diagnostika'
            ? { site: 'chatgpt', konverzace: 'adresa', pole: 'obecne', zpravy: { user: 1, assistant: 2, zdroj: 'obecne' }, generuje: true, limit: true, videl: { generovani: true, konec: false } } : null) },
        };
        window.fetch = async () => { if (state === 'offline') throw new Error('offline'); return new Response(JSON.stringify({ ok: true })); };
      }, { state });
      await page.goto(`${base}/popup.html`);
      await page.waitForFunction(() => document.body.dataset.stav !== 'nacitam');
      if (state === 'sluzby') await page.locator('#sites-open').click();
      if (state === 'overeni') { await page.locator('#check-open').click(); await page.waitForFunction(() => document.querySelectorAll('#checks li').length >= 4); }
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
      const text = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label],[placeholder],[title]')].map((e) => `${e.getAttribute('aria-label') || ''} ${e.getAttribute('placeholder') || ''} ${e.getAttribute('title') || ''}`).join(' '));
      assert.doesNotMatch(text, /[ěščřžýáíéůúďťňó]/i, `en ${state}: v okně zůstala čeština`);
      // Čeština bez diakritiky: „z“ v počtu („9 z 10“) a slova, která v angličtině nejsou.
      assert.doesNotMatch(text, /\d\s+z\s+\d|(^|\s)(ve|na|se|je|pro|nebo|tady|jsi)\s/i, `en ${state}: v okně zůstala čeština bez diakritiky`);
      assert.ok(await page.evaluate(() => [...document.querySelectorAll('.top > *')].every((x) => x.getBoundingClientRect().right <= innerWidth + 0.5)), `en ${state}: hlavička se vejde`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `en ${state}: nic nepřetéká do strany`);
      const ocekavane = { offline: 'Agenteeq isn’t running on this computer', unpaired: 'Pair the extension with a code', paired: 'What’s happening', sluzby: 'Tracked services', overeni: 'Page check' }[state];
      assert.ok(text.includes(ocekavane), `en ${state}: chybí „${ocekavane}“`);
      if (state === 'paired') {
        assert.match(text, /replying · 0:4\d/);
        assert.match(text, /1 agent needs you · 1 working/);
        assert.match(text, /Open conversation/);
        assert.match(text, /Open the Agenteeq app/);
        assert.match(text, /Codex on the web/);
        assert.match(text, /reply finished/);
        assert.match(text, /Earlier|Today|Now/);
      }
      if (state === 'offline') assert.match(text, /Agents on this computer: unknown/);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `dist/qa-extension/en-${state}.png` });
      results.push({ engine: 'chromium', theme: 'light', state: `en-${state}`, passed: true });
      await page.close();
    }
  } finally { await prohlizec.close(); }
  await fs.writeFile('dist/qa-extension/results.json', JSON.stringify(results, null, 2));
  console.log(`${results.length} popup scenarios passed; Chrome APIs mocked, live vendor selectors not verified.`);
} finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }

// Hlavní tlačítko reflektoru otevře konverzaci agenta (open-agent); po úspěchu se okno zavře.
async function cta(page) {
  const tlacitko = page.locator('#spot-stage .cta');
  assert.equal(await tlacitko.getAttribute('href'), null, 'Chrome must never navigate to a 403 localhost tab');
  await tlacitko.click();
  await page.waitForFunction(() => fixture.focusedAgent === 'claude-code:a1' && fixture.zavreno === true);
  assert.equal(await tlacitko.getAttribute('aria-busy'), null, 'button always clears busy state after opening');
  await page.evaluate(() => { fixture.zavreno = false; });
}
