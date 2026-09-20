// Kurz koruny z denního kurzovního lístku ČNB. Jediný dotaz ven je obyčejné GET bez jakýchkoli
// údajů o uživateli; poslední známý kurz se ukládá, aby Útrata fungovala i bez internetu.

export const CNB_URL = 'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt';
export const RATE_REFRESH_MS = 6 * 3600e3;

// Formát: první řádek „18.09.2026 #181“, druhý hlavička, dál „země|měna|množství|kód|kurz“ (desetinná čárka).
export function parseCnb(text) {
  if (typeof text !== 'string' || text.length > 20000) return null;
  const lines = text.split(/\r?\n/);
  const head = lines[0]?.match(/^(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (!head) return null;
  const out = { date: `${head[3]}-${head[2]}-${head[1]}` };
  for (const line of lines.slice(2)) {
    const [, , amount, code, rate] = line.split('|');
    if (code !== 'USD' && code !== 'EUR') continue;
    const value = Number(String(rate).replace(',', '.')) / (Number(amount) || 1);
    if (!(value > 1 && value < 200)) return null; // nesmysl je horší než žádný kurz
    out[code] = Math.round(value * 1000) / 1000;
  }
  return out.USD && out.EUR ? out : null;
}

// Použije čerstvý kurz jako aktivní, pokud ho uživatel nepřepsal ručně.
export function applyLiveRates(spend, live) {
  if (!live) return false;
  spend.liveRates = { date: live.date, USD: live.USD, EUR: live.EUR, fetchedAt: live.fetchedAt || Date.now() };
  if (spend.ratesSource === 'manual') return true;
  spend.rates = { ...spend.rates, CZK: 1, USD: live.USD, EUR: live.EUR };
  spend.ratesSource = 'cnb';
  return true;
}

export function rateInfo(spend) {
  const src = spend.ratesSource === 'manual' ? 'manual' : spend.ratesSource === 'cnb' && spend.liveRates ? 'cnb' : 'default';
  return { source: src, date: src === 'cnb' ? spend.liveRates.date : null, live: spend.liveRates || null };
}

export function createRateFeed({ spend, save, changed, enabled = true, fetchFn = globalThis.fetch, intervalMs = RATE_REFRESH_MS }) {
  let timer = null;
  let stopped = false;
  async function refresh() {
    if (!enabled || typeof fetchFn !== 'function') return false;
    try {
      const res = await fetchFn(CNB_URL, { signal: AbortSignal.timeout(8000), headers: { Accept: 'text/plain' } });
      if (!res.ok) return false;
      const live = parseCnb(await res.text());
      if (!live || stopped) return false;
      const before = JSON.stringify([spend().rates, spend().ratesSource, spend().liveRates?.date]);
      applyLiveRates(spend(), { ...live, fetchedAt: Date.now() });
      if (JSON.stringify([spend().rates, spend().ratesSource, spend().liveRates?.date]) !== before) { save(); changed(); }
      return true;
    } catch {
      return false; // bez internetu zůstává poslední známý kurz
    }
  }
  return {
    refresh,
    start() {
      if (!enabled) return;
      const first = setTimeout(() => { refresh(); }, 3000);
      first.unref?.();
      timer = setInterval(() => { refresh(); }, intervalMs);
      timer.unref?.();
    },
    stop() { stopped = true; if (timer) clearInterval(timer); },
  };
}
