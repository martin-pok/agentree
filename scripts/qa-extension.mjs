import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve('extension');
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
await fs.mkdir('dist/qa-extension', { recursive: true });
const results = [];
try {
  // QA_ENGINE=chromium omezí běh na jeden prohlížeč (lokálně bez WebKitu); CI jede oba.
  for (const engine of process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium', 'webkit']) {
    const browser = await (engine === 'chromium' ? chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) : webkit.launch());
    try {
      for (const theme of ['light', 'dark']) for (const state of ['offline', 'unpaired', 'revoked', 'paired', 'outdated', 'novejsi', 'neovereno', 'overeni', 'overeni-chyby']) {
        const page = await browser.newPage({ viewport: { width: 344, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(({ state }) => {
          const data = { disabledSites: [], lastStatus: { ok: true, site: 'chatgpt', at: Date.now() } };
          window.fixture = { data, paired: ['paired', 'outdated', 'novejsi', 'neovereno', 'overeni', 'overeni-chyby'].includes(state), fail: true };
          // Ověření stránky: aktivní karta je podporovaná služba a její skript odpovídá diagnostikou.
          const diagnostika = state === 'overeni'
            ? { site: 'chatgpt', konverzace: 'adresa', pole: 'presne', zpravy: { user: 3, assistant: 3, zdroj: 'presne' }, generuje: false, limit: false, videl: { generovani: true, konec: true } }
            : { site: 'mscopilot', konverzace: 'karta', pole: 'zadne', zpravy: { user: 2, assistant: 1, zdroj: 'obecne' }, generuje: true, limit: true, videl: { generovani: true, konec: false } };
          window.chrome = {
            storage: { local: { get: async () => data, set: async o => Object.assign(data, o) }, session: { get: async () => ({ otevrene: { 'chatgpt:a': { site: 'chatgpt', tab: 5, okno: 2, generating: true, od: Date.now() - 42000, at: Date.now() } } }), set: async () => {} } },
            runtime: { getManifest: () => ({ version: '0.12.0', content_scripts: [{ matches: ['https://chatgpt.com/*'] }] }), sendMessage: async m => {
              // Souhrn agentů z aplikace (POST /api/extension/prehled): jeden čeká, dva pracují.
              if (m.type === 'agenteeq:prehled') return ['paired', 'outdated', 'novejsi'].includes(state) && fixture.paired ? {
                zdravi: { stav: 'pozor', veta: 'Na tvé rozhodnutí čeká agentů: 1', pracuje: 2, cekaNaTebe: 1, selhalo: 0, limit: 0 },
                rozhodnuti: [{ id: 'claude-code:a1', title: 'Migrace API na v2', app: 'Claude Code', reason: 'Čeká na povolení: Bash', status: 'needs_input', at: Date.now() - 60000 }],
                pracuji: [
                  { id: 'codex:b2', title: 'Refaktor platebního modulu', app: 'Codex', reason: 'Upravuje src/platby.js', at: Date.now() - 5000 },
                  { id: 'claude-code:c3', title: 'Testy pro přihlášení', app: 'Claude Code', reason: 'Spouští testy', at: Date.now() - 12000 },
                ],
              } : null;
              if (m.type === 'agenteeq:focus-agent') {
                fixture.focusedAgent = m.id;
                return { ok: true };
              }
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
          window.chrome.tabs = { query: async () => [{ id: 99 }], sendMessage: async (_id, m) => { if (m.type === 'agenteeq:refresh') { fixture.refreshes = (fixture.refreshes || 0) + 1; return { ok: true }; } throw new Error('bez skriptu'); }, update: async (id) => { fixture.prepnuto = id; } };
          window.chrome.windows = { update: async (id) => { fixture.okno = id; } };
          window.close = () => { fixture.zavreno = true; };
          if (state.startsWith('overeni')) {
            window.chrome.tabs = {
              update: async (id) => { fixture.prepnuto = id; },
              query: async () => [{ id: 7 }],
              sendMessage: async (_tab, m) => (m.type === 'agenteeq:refresh' ? (fixture.refreshes = (fixture.refreshes || 0) + 1, { ok: true }) : m.type === 'agenteeq:diagnostika' ? diagnostika
                : { format: 'agenteeq-vzorek', verze: 1, site: diagnostika.site, adresa: { host: 'chatgpt.com', cesta: '/c/x-id' }, prvku: 812, zkraceno: false, strom: { t: 'body' } }),
            };
          }
          window.fetch = async () => { if (state === 'offline') throw new Error('offline'); return new Response(JSON.stringify({ ok: true })); };
        }, { state });
        await page.goto(`http://127.0.0.1:${server.address().port}/popup.html`);
        await page.waitForFunction(() => document.getElementById('headline').textContent !== 'Chvilku…');
        assert.equal(await page.locator('#refresh-popup').isVisible(), true, 'obnova musí být dostupná v každém stavu');
        if (state === 'paired') {
          await page.locator('#refresh-popup').click();
          await page.waitForFunction(() => fixture.refreshes === 1 && !document.getElementById('refresh-popup').disabled);
          assert.equal(await page.evaluate(() => fixture.refreshes), 1, 'obnova znovu načte stav otevřené karty');
          assert.equal(await page.locator('#refresh-popup').isEnabled(), true);
        }
        if (['paired', 'outdated', 'overeni', 'overeni-chyby'].includes(state)) {
          // Nahoře skutečný počet pracujících agentů a otevřených konverzací z background workeru, ne výmysl.
          const [pracuje, otevreno] = { paired: [3, 1], outdated: [3, 1], overeni: [1, 2], 'overeni-chyby': [2, 2] }[state];
          assert.equal(await page.locator('#hero-num').textContent(), String(pracuje), `${state}: počet pracujících agentů`);
          assert.equal(await page.locator('#headline').textContent(), pracuje === 1 ? 'agent právě pracuje' : 'agenti právě pracují');
          assert.equal(await page.locator('#sub').textContent(), ['paired', 'outdated'].includes(state) ? 'Potřebuje tě 1 agent' : otevreno === 1 ? '1 otevřená konverzace' : '2 otevřené konverzace');
          // Odpovídající agent ukazuje, jak dlouho už odpovídá.
          assert.match(await page.locator('#konverzace').innerText(), /odpovídá · 0:4\d/);
        }
        // Česká sazba: jednopísmenná předložka nikdy nestojí na konci řádku (za ní je nezlomitelná mezera).
        assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /(^|\s)[vkszouaiVKSZOUAI] /m, `${state}: předložka na konci řádku`);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        // Chrome zobrazí z okna rozšíření nejvýš 600 px. Vyšší okno se posouvá a stav i spárování
        // zmizí pod okrajem – změřeno ve skutečném Chromu, proto to hlídá test.
        const vyska = await page.evaluate(() => document.body.getBoundingClientRect().height);
        assert.ok(vyska <= 600, `${engine} ${theme} ${state}: okno má ${Math.round(vyska)} px, Chrome ukáže jen 600`);
        assert.ok(await page.evaluate(() => document.querySelector('footer').getBoundingClientRect().height <= 48), `${engine} ${theme} ${state}: patička se láme`);
        assert.equal(await page.locator('input[type=checkbox]').count(), 9);
        // Přepínače služeb se nabízejí, až rozšíření posílá data; jinde je karta schovaná.
        const sluzbyVidet = await page.locator('#sites-open').isVisible();
        assert.equal(sluzbyVidet, ['paired', 'outdated', 'novejsi', 'overeni', 'overeni-chyby'].includes(state), `${state}: viditelnost seznamu služeb`);
        assert.equal(await page.locator('.radek--tato').isVisible(), state.startsWith('overeni'), `${state}: aktuální karta jen na podporované stránce`);
        if (state === 'paired') {
          // Řádek konverzace v jiné kartě do ní kliknutím přepne a okno se zavře.
          await page.locator('#konverzace button.radek').click();
          assert.deepEqual(await page.evaluate(() => [fixture.prepnuto, fixture.okno, fixture.zavreno]), [5, 2, true]);
        }
        if (sluzbyVidet) {
          // Služby jsou vlastní pohled se zpátečním tlačítkem; musí se vejít do 600 px.
          await page.locator('#sites-open').click();
          assert.equal(await page.locator('#sites-open').getAttribute('aria-expanded'), 'true');
          assert.equal(await page.locator('#view-sluzby').isVisible(), true);
          const sRozbalenymi = await page.evaluate(() => document.body.getBoundingClientRect().height);
          assert.ok(sRozbalenymi <= 600, `${engine} ${theme} ${state}: služby mají ${Math.round(sRozbalenymi)} px`);
          await page.locator('input[type=checkbox]').first().focus();
          await page.keyboard.press('Space');
          assert.ok(await page.evaluate(() => fixture.data.disabledSites.includes('chatgpt')));
          assert.equal(await page.locator('#sites-count').textContent(), '8\u00a0z\u00a09');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#view-sluzby').isVisible(), false, 'Esc vrátí hlavní pohled');
          // Vypnutá služba hned zmizí ze seznamu konverzací (ChatGPT se v seznamu už neukazuje).
          assert.doesNotMatch(await page.locator('#view-hlavni').innerText(), /odpovídá · 0:4\d[\s\S]*ChatGPT|ChatGPT\s*\n\s*odpovídá/);
        }
        if (['unpaired', 'revoked'].includes(state)) {
          await page.locator('#code').fill('bad'); await page.locator('#pair').click();
          assert.equal(await page.locator('#code').getAttribute('aria-invalid'), 'true');
          await page.locator('#code').fill('abcdefghijklmnop'); await page.locator('#pair').click();
          await page.waitForFunction(() => document.getElementById('pair-msg').textContent.includes('vypršel'));
          await page.evaluate(() => { fixture.fail = false; }); await page.locator('#pair').click();
          await page.waitForFunction(() => document.getElementById('pairing').hidden);
          assert.ok((await page.locator('#pill-text').textContent()).includes('Připojeno'));
        }
        if (state.startsWith('overeni')) {
          // Rozbalené ověření schová seznam služeb, aby se okno vešlo do 600 px.
          await page.locator('#check-open').focus();
          await page.keyboard.press('Enter');
          await page.waitForFunction(() => document.querySelectorAll('#checks li').length >= 4);
          assert.equal(await page.locator('#view-overeni').isVisible(), true);
          assert.equal(await page.locator('#sites').isVisible(), false, 'ověření je samostatný pohled');
          const rozbalene = await page.evaluate(() => document.body.getBoundingClientRect().height);
          assert.ok(rozbalene <= 600, `${engine} ${theme} ${state}: rozbalené ověření má ${Math.round(rozbalene)} px`);
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
          await page.locator('#back').click();
          assert.equal(await page.locator('#view-hlavni').isVisible(), true, 'zpět vede na hlavní pohled');
        }
        if (state === 'offline') assert.ok((await page.locator('#headline').textContent()).includes('neběží'));
        if (state.startsWith('overeni')) {
          // Test výš vypnul ChatGPT – aktuální karta to musí hned říct; Microsoft Copilot zůstal zapnutý a odpovídá.
          assert.match(await page.locator('.radek--tato .st').textContent(), state === 'overeni' ? /sledování této služby je vypnuté/ : /odpovídá/);
        }
        if (state === 'outdated') assert.equal(await page.locator('#outdated').isVisible(), true);
        // Starší aplikace nesmí rozšíření nabízet „novou“ verzi, která je ve skutečnosti starší.
        if (state === 'novejsi') assert.equal(await page.locator('#outdated').isVisible(), false, 'aplikace je starší než rozšíření');
        if (state === 'neovereno') {
          // Nepodařené ověření není „neběží“ (s odkazem ke stažení) ani „nespárováno“.
          assert.match(await page.locator('#headline').textContent(), /Nepodařilo se ověřit/);
          assert.equal(await page.locator('#pill-text').textContent(), 'Neověřeno');
          assert.equal(await page.locator('#feats').isVisible(), false, 'žádná nabídka ke stažení');
          assert.equal(await page.locator('#pairing').isVisible(), false, 'žádná výzva ke spárování');
          assert.equal(await page.locator('#app-link-text').textContent(), 'Otevřít Agenteeq');
        }
        if (state === 'paired') {
          // Agenti z aplikace: věta o stavu, kdo čeká a kdo pracuje; číslo nahoře sčítá i chat v prohlížeči.
          assert.equal(await page.locator('#agenti').isVisible(), true, 'přehled agentů je vidět');
          assert.equal(await page.locator('#rozhodnuti .agent').count(), 1);
          assert.equal(await page.locator('#pracuji .agent').count(), 2);
          const focus = page.locator('#rozhodnuti button.agent');
          assert.equal(await focus.count(), 1, 'native agent uses explicit button, not an unauthenticated localhost link');
          assert.equal(await focus.getAttribute('href'), null, 'Chrome must never navigate to a 403 localhost tab');
          await focus.click();
          await page.waitForFunction(() => fixture.focusedAgent === 'claude-code:a1');
          assert.equal(await page.evaluate(() => fixture.focusedAgent), 'claude-code:a1', 'native focus receives existing agent ID only');
          assert.equal(await focus.getAttribute('aria-busy'), null, 'button always clears busy state after successful focus');
          // ChatGPT test výš vypnul, nahoře tedy zůstanou jen dva agenti z aplikace.
          assert.equal(await page.locator('#hero-num').textContent(), '2');
          const vyska = await page.evaluate(() => document.body.getBoundingClientRect().height);
          assert.ok(vyska <= 600, `${engine} ${theme} ${state}: okno má ${Math.round(vyska)} px`);
          // Real Chromium/WebKit interactions: three tracked chats, live counts,
          // filters, keyboard focus and a truthful empty state.
          await page.evaluate(async () => {
            fixture.data.disabledSites = [];
            chrome.storage.session.get = async () => ({ otevrene: {
              a: { site: 'chatgpt', tab: 5, okno: 2, generating: true, od: Date.now() - 42000, at: Date.now() },
              b: { site: 'claude', tab: 6, okno: 2, generating: false, limit: true, at: Date.now() },
              c: { site: 'gemini', tab: 7, okno: 2, generating: false, limit: false, at: Date.now() },
            } });
            await render();
          });
          assert.equal(await page.locator('#filtry-konverzaci').isVisible(), true);
          assert.deepEqual(await page.locator('.pocet-filtr').allTextContents(), ['3', '1', '1']);
          await page.locator('[data-filtr="odpovida"]').click();
          assert.equal(await page.locator('#konverzace li').count(), 1);
          assert.match(await page.locator('#konverzace').innerText(), /ChatGPT/);
          assert.equal(await page.locator('[data-filtr="odpovida"]').getAttribute('aria-pressed'), 'true');
          await page.locator('[data-filtr="pozor"]').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('#konverzace li').count(), 1);
          assert.match(await page.locator('#konverzace').innerText(), /Claude/);
          assert.equal(await page.locator('[data-filtr="pozor"]').getAttribute('aria-pressed'), 'true');
          await page.evaluate(async () => {
            chrome.storage.session.get = async () => ({ otevrene: {
              a: { site: 'chatgpt', tab: 5, generating: true, at: Date.now() },
              b: { site: 'claude', tab: 6, generating: false, limit: false, at: Date.now() },
            } });
            await render();
          });
          assert.equal(await page.locator('#konverzace').isVisible(), false);
          assert.equal(await page.locator('#prazdne-konverzace').isVisible(), true);
          assert.match(await page.locator('#prazdne-konverzace').textContent(), /Žádný webový chat nehlásí limit/);
          assert.ok(await page.evaluate(() => document.body.getBoundingClientRect().height <= 600),
            'prázdný filtr nesmí schovat ostatní ovládání okna pod hranicí 600 px');
          await page.locator('[data-filtr="vse"]').click();
          assert.equal(await page.locator('#konverzace li').count(), 2);
          assert.equal(await page.locator('#prazdne-konverzace').isVisible(), false);
          const filtrVyska = await page.evaluate(() => document.body.getBoundingClientRect().height);
          assert.ok(filtrVyska <= 600, `${engine} ${theme}: filtr nesmí zvětšit Chrome popup nad 600px (měřeno ${Math.round(filtrVyska)}px)`);
          await page.locator('[data-filtr="pozor"]').click();
          await page.evaluate(async () => {
            chrome.storage.session.get = async () => ({ otevrene: {
              a: { site: 'chatgpt', tab: 5, generating: false, at: Date.now() },
            } });
            await render();
          });
          assert.equal(await page.locator('#filtry-konverzaci').isVisible(), false, 'jeden chat nemá zbytečné filtry');
          assert.equal(await page.locator('#konverzace li').count(), 1, 'skrytý filtr nikdy nesmí schovat poslední chat');
        }
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `dist/qa-extension/${engine}-${theme}-${state}.png`, fullPage: true });
        results.push({ engine, theme, state, passed: true }); await page.close();
      }
    } finally { await browser.close(); }
  }
  // Angličtina: okno se řídí _locales (chrome.i18n). Nesmí v něm zůstat nic česky, musí se vejít
  // do 600 px i s delšími anglickými texty a nic nesmí přetékat do strany.
  const prohlizec = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    for (const state of ['offline', 'unpaired', 'paired', 'sluzby', 'overeni']) {
      const page = await prohlizec.newPage({ viewport: { width: 344, height: 900 }, reducedMotion: 'reduce' });
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
            ? (state === 'paired' ? { zdravi: { stav: 'pozor', veta: 'Na tvé rozhodnutí čeká agentů: 1', pracuje: 0, cekaNaTebe: 1, selhalo: 0, limit: 0 }, rozhodnuti: [], pracuji: [] } : null)
            : { paired: sparovano, online: sparovano, status: { expectedVersion: '0.13.0' } }) },
          tabs: { query: async () => [{ id: 1 }], update: async () => {}, sendMessage: async (_t, m) => (m.type === 'agenteeq:diagnostika'
            ? { site: 'chatgpt', konverzace: 'adresa', pole: 'obecne', zpravy: { user: 1, assistant: 2, zdroj: 'obecne' }, generuje: true, limit: true, videl: { generovani: true, konec: false } } : null) },
        };
        window.fetch = async () => { if (state === 'offline') throw new Error('offline'); return new Response(JSON.stringify({ ok: true })); };
      }, { state });
      await page.goto(`http://127.0.0.1:${server.address().port}/popup.html`);
      await page.waitForFunction(() => document.getElementById('headline').textContent !== 'One moment…' && document.getElementById('headline').textContent !== 'Chvilku…');
      if (state === 'sluzby') await page.locator('#sites-open').click();
      if (state === 'overeni') { await page.locator('#check-open').click(); await page.waitForFunction(() => document.querySelectorAll('#checks li').length >= 4); }
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
      const text = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label],[placeholder]')].map((e) => `${e.getAttribute('aria-label') || ''} ${e.getAttribute('placeholder') || ''}`).join(' '));
      assert.doesNotMatch(text, /[ěščřžýáíéůúďťňó]/i, `en ${state}: v okně zůstala čeština`);
      // Čeština bez diakritiky: „z“ v počtu („8 z 9“) a slova, která v angličtině nejsou.
      assert.doesNotMatch(text, /\d\s+z\s+\d|(^|\s)(ve|na|se|je|pro|nebo|tady|jsi)\s/i, `en ${state}: v okně zůstala čeština bez diakritiky`);
      // Patička drží na jednom řádku: text i odkaz.
      assert.ok(await page.evaluate(() => document.querySelector('footer').getBoundingClientRect().height <= 48), `en ${state}: patička se láme`);
      const vyska = await page.evaluate(() => document.body.getBoundingClientRect().height);
      assert.ok(vyska <= 600, `en ${state}: okno má ${Math.round(vyska)} px`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `en ${state}: nic nepřetéká do strany`);
      const ocekavane = { offline: 'Agenteeq isn’t running on this computer', unpaired: 'Pair the extension with a code', paired: '1\nagent working now', sluzby: 'Tracked services', overeni: 'Page check' }[state];
      assert.ok(text.includes(ocekavane), `en ${state}: chybí „${ocekavane}“`);
      if (state === 'paired') {
        assert.match(text, /replying · 0:4\d/);
        assert.match(text, /1 agent needs you/);
        assert.match(text, /Codex on the web/);
        assert.match(text, /finished 3 min ago/);
      }
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `dist/qa-extension/en-${state}.png`, fullPage: true });
      results.push({ engine: 'chromium', theme: 'light', state: `en-${state}`, passed: true });
      await page.close();
    }
  } finally { await prohlizec.close(); }
  await fs.writeFile('dist/qa-extension/results.json', JSON.stringify(results, null, 2));
  console.log(`${results.length} popup scenarios passed; Chrome APIs mocked, live vendor selectors not verified.`);
} finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
