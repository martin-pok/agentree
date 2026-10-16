// Okno rozšíření pro QA skripty (qa-contrast, qa-tvary, qa-extension, snímky pro obchod): skutečný
// extension/popup.html s atrapou Chrome API. Atrapa jen vrací data, se kterými se okno vykreslí
// v každém stavu; chování (klik, párování, filtr) ověřuje qa-extension.mjs.

// Stavy, které pokrývají všechny části okna: reflektor se všemi tóny, časovou osu se skupinami
// Teď / Dnes / Dříve, klid, nezjištěný stav, poznámku o nové verzi, oba listy (služby a ověření),
// spárování kódem a aplikaci, která neběží.
export const STAVY_OKNA = ['neběží', 'nespárováno', 'rušno', 'klid', 'nezjištěno', 'zastaralá', 'služby', 'ověření'];

// Skutečná fixture z briefu návrhu (titulky, nástroje, časy). Žádné ceny ani procenta – okno je neumí.
// Anglická podoba týchž titulků pro anglické snímky (okno samo data nepřekládá – jsou to data).
const EN = {
  'Migrace API na v2': 'API migration to v2', 'Čeká na povolení: Bash': 'Waiting for permission: Bash', 'Úklid závislostí v monorepu': 'Monorepo dependency cleanup',
  'Ptá se: smazat složku legacy/?': 'Asks: delete the legacy/ folder?', 'Generování release notes': 'Release notes', 'Narazil na limit, obnova ve 14:00': 'Hit a limit, resets at 14:00',
  'Refaktor platebního modulu': 'Payments module refactor', 'Upravuje src/platby.js': 'Editing src/payments.js', 'Testy pro přihlášení': 'Login tests', 'Spouští testy': 'Running tests',
  'Landing page – hero': 'Landing page – hero', 'Upravuje site/index.html': 'Editing site/index.html', 'Překlad dokumentace': 'Docs translation', 'Čte docs/INSTALL.md': 'Reading docs/INSTALL.md',
  'Shrnutí novinek z AI': 'AI news digest', 'Překlad do čínštiny': 'Chinese translation', 'Lokální test promptu': 'Local prompt test',
  'Plán marketingu na Q4 - ChatGPT': 'Q4 marketing plan - ChatGPT', 'Rozbor smlouvy s dodavatelem - Claude': 'Supplier contract review - Claude',
  'Nápady na název funkce - Google Gemini': 'Feature name ideas - Google Gemini', 'Srovnání cen hostingu - Perplexity': 'Hosting price comparison - Perplexity',
};
export function fixtura(stav, ted, jazyk = 'cs') {
  if (jazyk === 'en') return JSON.parse(JSON.stringify(fixtura(stav, ted)), (k, v) => (typeof v === 'string' && EN[v] ? EN[v] : v));
  const vcera = (h, m) => { const d = new Date(ted); d.setDate(d.getDate() - 1); d.setHours(h, m, 0, 0); return +d; };
  const rusno = {
    zdravi: { stav: 'pozor', veta: 'Potřebují tě 2 agenti', pracuje: 4, cekaNaTebe: 2, selhalo: 0, limit: 1, procesyNevim: false },
    rozhodnuti: [
      { id: 'claude-code:r1', title: 'Migrace API na v2', app: 'Claude Code', reason: 'Čeká na povolení: Bash', status: 'needs_input', at: ted - 60e3 },
      { id: 'codex:r2', title: 'Úklid závislostí v monorepu', app: 'Codex', reason: 'Ptá se: smazat složku legacy/?', status: 'needs_input', at: ted - 180e3 },
      { id: 'claude-code:r3', title: 'Generování release notes', app: 'Claude Code', reason: 'Narazil na limit, obnova ve 14:00', status: 'limited', at: ted - 540e3 },
    ],
    pracuji: [
      { id: 'codex:w1', title: 'Refaktor platebního modulu', app: 'Codex', reason: 'Upravuje src/platby.js', at: ted - 5e3 },
      { id: 'claude-code:w2', title: 'Testy pro přihlášení', app: 'Claude Code', reason: 'Spouští testy', at: ted - 12e3 },
      { id: 'cursor:w3', title: 'Landing page – hero', app: 'Cursor', reason: 'Upravuje site/index.html', at: ted - 40e3 },
      { id: 'gemini-cli:w4', title: 'Překlad dokumentace', app: 'Gemini CLI', reason: 'Čte docs/INSTALL.md', at: ted - 120e3 },
    ],
    nedavne: [
      { id: 'web:grok:n1', title: 'Shrnutí novinek z AI', app: 'Grok', status: 'idle', at: ted - 2 * 3600e3 },
      { id: 'web:qwen:n2', title: 'Překlad do čínštiny', app: 'Qwen Chat', status: 'idle', at: vcera(16, 20) },
      { id: 'local:ollama:n3', title: 'Lokální test promptu', app: 'Ollama', status: 'idle', at: vcera(11, 5) },
    ],
  };
  const klid = {
    zdravi: { stav: 'ok', veta: 'V pořádku, nikdo nepracuje', pracuje: 0, cekaNaTebe: 0, selhalo: 0, limit: 0, procesyNevim: false },
    rozhodnuti: [], pracuji: [],
    nedavne: [
      { id: 'codex:n0', title: 'Refaktor platebního modulu', app: 'Codex', status: 'waiting', at: ted - 3 * 3600e3 },
      ...rusno.nedavne,
    ],
  };
  const nezjisteno = {
    zdravi: { stav: 'nevim', veta: 'Nepodařilo se zjistit, co na počítači běží', pracuje: 0, cekaNaTebe: 0, selhalo: 0, limit: 0, procesyNevim: true },
    rozhodnuti: [], pracuji: [], nedavne: rusno.nedavne.slice(0, 2),
  };
  const prehled = { rušno: rusno, služby: rusno, zastaralá: rusno, ověření: rusno, klid, nezjištěno: nezjisteno }[stav] || null;
  const chaty = {
    'chatgpt:a': { site: 'chatgpt', tab: 11, okno: 1, generating: true, od: ted - 42e3, at: ted },
    'claude:b': { site: 'claude', tab: 12, okno: 1, generating: false, konec: ted - 240e3, at: ted - 30e3 },
    'gemini:c': { site: 'gemini', tab: 13, okno: 1, generating: false, at: ted - 60e3 },
    'perplexity:d': { site: 'perplexity', tab: 14, okno: 1, generating: false, konec: ted - 100e3, at: ted - 90e3 },
  };
  const tituly = { 11: 'Plán marketingu na Q4 - ChatGPT', 12: 'Rozbor smlouvy s dodavatelem - Claude', 13: 'Nápady na název funkce - Google Gemini', 14: 'Srovnání cen hostingu - Perplexity' };
  const otevrene = stav === 'klid'
    ? { 'claude:b': { ...chaty['claude:b'], konec: ted - 25 * 60e3 }, 'perplexity:d': chaty['perplexity:d'] }
    : stav === 'nezjištěno' ? { 'gemini:c': chaty['gemini:c'] } : chaty;
  return { prehled, otevrene, tituly };
}

export function atrapa({ stav, ted, jazyk = 'cs', f }) {
  const { prehled, otevrene, tituly } = f;
  const sparovano = !['neběží', 'nespárováno'].includes(stav);
  const data = { disabledSites: ['grok'], lastStatus: { ok: true, site: 'chatgpt', at: ted - 240000 } };
  const diagnostika = { site: 'gemini', konverzace: 'adresa', pole: 'zadne', zpravy: { user: 2, assistant: 1, zdroj: 'obecne' }, generuje: false, limit: true, videl: { generovani: true, konec: true } };
  window.chrome = {
    i18n: { getMessage: (k) => (k === 'jazyk' ? jazyk : '') },
    storage: {
      local: { get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, data[x]])), set: async (o) => Object.assign(data, o), remove: async () => {} },
      session: { get: async () => ({ otevrene }), set: async () => {} },
    },
    runtime: {
      getManifest: () => ({ version: '0.0.0' }),
      sendMessage: async (m) => (m?.type === 'agenteeq:prehled' ? (sparovano ? prehled : null)
        : { paired: sparovano, online: sparovano, status: { expectedVersion: stav === 'zastaralá' ? '0.0.1' : '0.0.0' } }),
    },
    tabs: {
      query: async () => [{ id: stav === 'ověření' ? 13 : 1 }],
      get: async (id) => ({ id, title: tituly[id] || '' }),
      sendMessage: async (_t, m) => (stav === 'ověření' && m.type === 'agenteeq:diagnostika' ? diagnostika : null),
      update: async () => {},
    },
  };
  const puvodni = window.fetch;
  window.fetch = async (u, i) => {
    if (!String(u).includes('/api/health')) return puvodni(u, i);
    if (stav === 'neběží') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ ok: true, ready: true }), { headers: { 'Content-Type': 'application/json' } });
  };
}

// Okno je 380 px široké a 600 px vysoké (víc Chrome neukáže).
export const OKNO = { width: 380, height: 600 };

// Otevře okno v daném stavu a dojde do pohledu, který se měří. Vrací stránku připravenou k měření.
export async function otevriOkno(browser, url, stav, { colorScheme = 'light', jazyk = 'cs', deviceScaleFactor = 1 } = {}) {
  const page = await browser.newPage({ viewport: OKNO, colorScheme, reducedMotion: 'reduce', deviceScaleFactor });
  const ted = Date.now();
  await page.addInitScript(atrapa, { stav, ted, jazyk, f: fixtura(stav, ted, jazyk) });
  await page.goto(`${url}/popup.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.stav !== 'nacitam');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  if (stav === 'služby') await page.click('#sites-open');
  if (stav === 'ověření') {
    await page.click('#check-open');
    await page.waitForFunction(() => document.querySelectorAll('#checks li').length >= 4);
    await page.click('#check-no');
  }
  await page.waitForTimeout(200);
  return page;
}
