// Okno rozšíření pro QA skripty (qa-contrast, qa-tvary): skutečný extension/popup.html s atrapou
// Chrome API. Měří se vzhled, ne chování (to hlídá qa-extension.mjs), takže atrapa jen vrací data,
// se kterými se okno vykreslí v každém stavu.

// Stavy, které pokrývají všechny části okna: seznam konverzací se všemi tóny, poznámku o nové
// verzi, nastavení služeb, ověření stránky, spárování kódem a aplikaci, která neběží.
export const STAVY_OKNA = ['neběží', 'nespárováno', 'spárováno', 'služby', 'ověření'];

function atrapa({ stav, ted }) {
  const sparovano = !['neběží', 'nespárováno'].includes(stav);
  const data = { disabledSites: ['grok'], lastStatus: { ok: true, site: 'chatgpt', at: ted - 240000 } };
  const otevrene = sparovano ? {
    a: { site: 'chatgpt', tab: 1, okno: 1, generating: true, od: ted - 42000, at: ted },
    b: { site: 'claude', tab: 2, okno: 1, generating: false, limit: true, at: ted - 30000 },
    c: { site: 'gemini', tab: 3, okno: 1, generating: false, konec: ted - 180000, at: ted - 60000 },
  } : {};
  const diagnostika = stav === 'ověření'
    ? { site: 'gemini', konverzace: 'adresa', pole: 'zadne', zpravy: { user: 2, assistant: 1, zdroj: 'obecne' }, generuje: false, limit: true, videl: { generovani: true, konec: true } }
    : { site: 'chatgpt', konverzace: 'adresa', pole: 'presne', zpravy: { user: 12, assistant: 11, zdroj: 'presne' }, generuje: true, limit: false, videl: { generovani: true, konec: false } };
  window.chrome = {
    storage: {
      local: { get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, data[x]])), set: async (o) => Object.assign(data, o) },
      session: { get: async () => ({ otevrene, otevreneTvar: 1 }), set: async () => {} },
    },
    runtime: { getManifest: () => ({ version: '0.0.0' }), sendMessage: async () => ({ paired: sparovano, status: { expectedVersion: stav === 'spárováno' ? '0.0.1' : '0.0.0' } }) },
    tabs: { query: async () => [{ id: 1 }], sendMessage: async () => (sparovano ? diagnostika : null), update: async () => {} },
  };
  const puvodni = window.fetch;
  window.fetch = async (u, i) => {
    if (!String(u).includes('/api/health')) return puvodni(u, i);
    if (stav === 'neběží') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ ok: true, ready: true }), { headers: { 'Content-Type': 'application/json' } });
  };
}

// Otevře okno v daném stavu a dojde do pohledu, který se měří. Vrací stránku připravenou k měření.
export async function otevriOkno(browser, url, stav, { colorScheme = 'light' } = {}) {
  const page = await browser.newPage({ viewport: { width: 344, height: 900 }, colorScheme, reducedMotion: 'reduce' });
  await page.addInitScript(atrapa, { stav, ted: Date.now() });
  await page.goto(`${url}/popup.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('headline').textContent !== 'Chvilku…');
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
