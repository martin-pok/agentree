import { DAY, round2 } from '../util.js';
import { ui } from '../texty.js';
import { VERSION } from '../config.js';

// Náklady a spotřeba organizace z oficiálních Admin API. Neověřeno proti skutečným klíčům – viz docs/CONNECTORS.md
// a docs/CLOUD-ACCOUNTS.md (matice schopností a zdroje pro každý poskytovatele).
const amountOf = (r) => {
  const a = r?.amount ?? r?.cost ?? r?.value;
  if (typeof a === 'number') return a;
  if (typeof a === 'string') return Number(a) || 0;
  if (a && typeof a === 'object') return Number(a.value ?? a.amount) || 0;
  return 0;
};

// Číslo, nebo 0 – API teoreticky může poslat chybějící/neplatné pole, nikdy si tokeny nevymýšlíme.
const numOf = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Přečte tělo odpovědi jen do stropu bajtů, jinak vrátí null (přetečení se řeší jako chyba, ne pádem).
async function readBoundedJson(res, maxBytes) {
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const ANTHROPIC_DAILY_BUCKETS = 31;
const MAX_PAGES = 12;
// Anthropic průběžně dopočítává denní report (obvykle do pěti minut). Deset minut drží data čerstvá,
// aniž by aplikace zbytečně zatěžovala administrační API při každém vykreslení obrazovky.
const CLOUD_REFRESH_MS = 10 * 60 * 1000;

// Anthropic vrací při denním rozlišení nejvýš 31 košů na stránku. Původní jeden dotaz za 180 dní
// proto mohl skončit chybou nebo vrátit jen část období. Stránky dočítá `fetchPages` níže.
async function fetchAnthropicPages(fetchImpl, pathname, key, redirect) {
  const start = new Date(Date.now() - 180 * DAY).toISOString();
  const end = new Date().toISOString();
  return fetchPages(fetchImpl, {
    vendor: 'Anthropic',
    redirect,
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'User-Agent': `Agenteeq/${VERSION} (https://agenteeq.app)`,
    },
    url(page) {
      const url = new URL(`https://api.anthropic.com${pathname}`);
      url.searchParams.set('starting_at', start);
      url.searchParams.set('ending_at', end);
      url.searchParams.set('bucket_width', '1d');
      url.searchParams.set('limit', String(ANTHROPIC_DAILY_BUCKETS));
      if (page) url.searchParams.set('page', page);
      return url;
    },
  });
}

// OpenAI má stejné stránkování (`has_more` + `next_page` → parametr `page`), jen jiné stropy:
// /organization/costs vrací nejvýš 180 denních košů na stránku, /organization/usage/* jen 31.
// 180 dní zpět od teď zasáhne 181 kalendářních dní (začátek je uprostřed dne), takže jediný
// dotaz s limitem 180 tiše vynechal nejnovější den – právě ten, který člověk v Útratě hledá.
// Usage s limitem 180 je navíc mimo specifikaci (max 31) a vracel chybu.
export const OPENAI_LIMIT = { costs: 180, usage: 31 };

async function fetchOpenAIPages(fetchImpl, pathname, key, redirect, limit) {
  const start = String(Math.floor((Date.now() - 180 * DAY) / 1000));
  return fetchPages(fetchImpl, {
    vendor: 'OpenAI',
    redirect,
    headers: { Authorization: `Bearer ${key}` },
    url(page) {
      const url = new URL(`https://api.openai.com${pathname}`);
      url.searchParams.set('start_time', start);
      url.searchParams.set('bucket_width', '1d');
      url.searchParams.set('limit', String(limit));
      if (page) url.searchParams.set('page', page);
      return url;
    },
  });
}

// Společné čtení stránkovaného reportu: dočte všechny navazující stránky, ale s pevným stropem,
// aby po chybném kurzoru nevznikla nekonečná smyčka ani neomezený přenos. Částečný výsledek se
// nikdy nevydává za celé období – neúplné stránkování je chyba.
// Hlášky jsou vypsané celé pro každého dodavatele, aby šly přeložit (src/texty.js).
const CHYBY = {
  OpenAI: {
    status: (n) => ui('OpenAI odpověděla {0}', n),
    spatna: () => ui('OpenAI vrátila neočekávanou nebo příliš velkou odpověď.'),
    neuplna: () => ui('OpenAI vrátila neúplné stránkování.'),
    mnoho: () => ui('OpenAI vrátila příliš mnoho stránek.'),
  },
  Anthropic: {
    status: (n) => ui('Anthropic odpověděla {0}', n),
    spatna: () => ui('Anthropic vrátila neočekávanou nebo příliš velkou odpověď.'),
    neuplna: () => ui('Anthropic vrátila neúplné stránkování.'),
    mnoho: () => ui('Anthropic vrátila příliš mnoho stránek.'),
  },
};

async function fetchPages(fetchImpl, { vendor, redirect, headers, url }) {
  const chyba = CHYBY[vendor];
  const data = [];
  let page = null;
  for (let pages = 0; pages < MAX_PAGES; pages++) {
    const res = await fetchImpl(url(page), { headers, redirect, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(chyba.status(res.status));
    const json = await readBoundedJson(res, 5_000_000);
    if (json === null || !Array.isArray(json.data)) throw new Error(chyba.spatna());
    data.push(...json.data);
    if (!json.has_more) return { data };
    if (typeof json.next_page !== 'string' || !json.next_page) throw new Error(chyba.neuplna());
    page = json.next_page;
  }
  throw new Error(chyba.mnoho());
}

export function parseOpenAICosts(json) {
  const daily = {};
  for (const bucket of json?.data || []) {
    const day = new Date((bucket.start_time || 0) * 1000).toISOString().slice(0, 10);
    for (const r of bucket.results || []) daily[day] = (daily[day] || 0) + amountOf(r);
  }
  return daily;
}

// Anthropic vrací částku v nejmenších jednotkách měny jako desetinný řetězec: "123.45" v USD
// znamená 1,2345 $ (GET /v1/organizations/cost_report, pole `amount`). Čtené jako dolary by
// útrata vyšla stokrát vyšší. OpenAI naopak posílá dolary (`amount.value`).
export function parseAnthropicCosts(json) {
  const daily = {};
  for (const bucket of json?.data || []) {
    const day = String(bucket.starting_at || bucket.start_time || '').slice(0, 10);
    if (!day) continue;
    const results = Array.isArray(bucket.results) ? bucket.results : [bucket];
    for (const r of results) daily[day] = (daily[day] || 0) + amountOf(r) / 100;
  }
  return daily;
}

// Denní spotřeba tokenů organizace u OpenAI – GET /v1/organization/usage/completions (Admin klíč).
// Tokeny se nikdy nesčítají do částky útraty (jiná metrika, viz AGENTS.md „Zachovej význam metrik“).
export function parseOpenAIUsage(json) {
  const daily = {};
  for (const bucket of json?.data || []) {
    const day = new Date((bucket.start_time || 0) * 1000).toISOString().slice(0, 10);
    const acc = (daily[day] ||= { input: 0, output: 0, cachedInput: 0, requests: 0 });
    for (const r of bucket.results || []) {
      acc.input += numOf(r?.input_tokens);
      acc.output += numOf(r?.output_tokens);
      acc.cachedInput += numOf(r?.input_cached_tokens);
      acc.requests += numOf(r?.num_model_requests);
    }
  }
  return daily;
}

// Denní spotřeba tokenů organizace u Anthropic – GET /v1/organizations/usage_report/messages (Admin klíč).
export function parseAnthropicUsage(json) {
  const daily = {};
  for (const bucket of json?.data || []) {
    const day = String(bucket.starting_at || '').slice(0, 10);
    if (!day) continue;
    const acc = (daily[day] ||= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    for (const r of bucket.results || []) {
      acc.input += numOf(r?.uncached_input_tokens);
      acc.output += numOf(r?.output_tokens);
      acc.cacheRead += numOf(r?.cache_read_input_tokens);
      acc.cacheWrite += numOf(r?.cache_creation?.ephemeral_1h_input_tokens) + numOf(r?.cache_creation?.ephemeral_5m_input_tokens);
    }
  }
  return daily;
}

export function createCloudBillingConnector(ctx, { fetchImpl = globalThis.fetch } = {}) {
  const { config, secrets } = ctx;
  const state = {
    'openai-admin': { state: 'missing', detail: ui('Přidej OpenAI Admin API klíč.'), daily: {}, usage: {}, usageError: null, at: 0 },
    'anthropic-admin': { state: 'missing', detail: ui('Přidej Anthropic Admin API klíč.'), daily: {}, usage: {}, usageError: null, at: 0 },
  };
  let timer = null;

  async function fetchOpenAI(key) {
    return parseOpenAICosts(await fetchOpenAIPages(fetchImpl, '/v1/organization/costs', key, 'error', OPENAI_LIMIT.costs));
  }

  async function fetchAnthropic(key) {
    return parseAnthropicCosts(await fetchAnthropicPages(fetchImpl, '/v1/organizations/cost_report', key, 'error'));
  }

  // Spotřeba tokenů OpenAI (Admin klíč, stejný jako pro náklady). Nenásleduje přesměrování a
  // odpověď se čte jen do stropu 5 MB – chyba se vždy vrátí jako Error, nikdy nepropadne dál.
  async function fetchOpenAIUsage(key) {
    return parseOpenAIUsage(await fetchOpenAIPages(fetchImpl, '/v1/organization/usage/completions', key, 'manual', OPENAI_LIMIT.usage));
  }

  // Spotřeba tokenů Anthropic (stejný Admin klíč jako pro cost_report).
  async function fetchAnthropicUsage(key) {
    return parseAnthropicUsage(await fetchAnthropicPages(fetchImpl, '/v1/organizations/usage_report/messages', key, 'manual'));
  }

  const USAGE_FETCHERS = { 'openai-admin': fetchOpenAIUsage, 'anthropic-admin': fetchAnthropicUsage };

  async function refresh() {
    if (!config.cloudFetch) return;
    for (const [id, fetcher] of [['openai-admin', fetchOpenAI], ['anthropic-admin', fetchAnthropic]]) {
      const key = await secrets.get(id);
      const st = state[id];
      if (!key) {
        Object.assign(st, { state: 'missing', detail: id === 'openai-admin' ? ui('Přidej OpenAI Admin API klíč.') : ui('Přidej Anthropic Admin API klíč.'), daily: {}, usage: {}, usageError: null, at: 0 });
        continue;
      }
      try {
        st.daily = await fetcher(key);
        // Spotřeba tokenů je vedlejší: když selže, náklady zůstávají platné. Selhání se ale nesmí
        // tvářit jako „žádná spotřeba“ – `usage` je pak null (nezjištěno, ne nula) a důvod je
        // v `usageError` i v detailu, který Nastavení ukazuje u klíče.
        let usageError = null;
        try {
          st.usage = await USAGE_FETCHERS[id](key);
        } catch (err) {
          st.usage = null;
          usageError = String(err?.message || err).slice(0, 160);
        }
        Object.assign(st, {
          state: 'connected',
          usageError,
          detail: usageError ? ui('Náklady načteny. Spotřebu tokenů se nepodařilo zjistit: {0}', usageError) : ui('Denní náklady a spotřeba tokenů organizace za 180 dní.'),
          at: Date.now(),
        });
      } catch (err) {
        // Po selhání nesmí graf ani rozpočet dál používat poslední úspěšná data. Nevíme, zda se
        // od nich stav u poskytovatele nezměnil, proto je vyřadíme až do další ověřené odpovědi.
        Object.assign(st, { state: 'error', detail: String(err.message).slice(0, 160), daily: {}, usage: {}, usageError: null, at: 0 });
      }
    }
    ctx.onSpendChanged?.();
  }

  return {
    id: 'cloud-billing',
    name: ui('Náklady za API'),
    provider: 'other',
    kind: 'cloud',
    verified: false,
    source: 'OpenAI Admin API · Anthropic Admin API',
    description: ui('Automaticky doplní útratu a spotřebu tokenů za API do grafů a rozpočtů.'),
    async start() {
      await refresh().catch(() => {});
      timer = setInterval(() => refresh().catch(() => {}), CLOUD_REFRESH_MS);
      timer.unref?.();
    },
    scan: refresh,
    stop() {
      clearInterval(timer);
    },
    idle: async () => {},
    // Automatické položky útraty (v USD) pro souhrn rozpočtu.
    autoEntries() {
      const out = [];
      for (const [id, service] of [['openai-admin', 'openai-api'], ['anthropic-admin', 'anthropic-api']]) {
        for (const [date, amount] of Object.entries(state[id].daily)) {
          if (amount > 0) out.push({ id: `auto:${id}:${date}`, service, kind: 'api', amount: round2(amount), currency: 'USD', date, recurring: null, note: 'Admin API', auto: true });
        }
      }
      return out;
    },
    // Denní spotřeba tokenů organizace podle poskytovatele – samostatná metrika, nikdy nesčítat s útratou.
    // null = spotřebu se nepodařilo zjistit (není to „žádná spotřeba“).
    tokenUsage() {
      return Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.usage]));
    },
    providers() {
      return Object.fromEntries(
        Object.entries(state).map(([k, v]) => [
          k,
          { state: v.state, detail: v.detail, at: v.at, source: v.state === 'missing' ? null : secrets.source(k), tokens: v.usage, tokensError: v.usageError || null },
        ])
      );
    },
    status() {
      const connected = Object.values(state).filter((v) => v.state === 'connected').length;
      const errors = Object.values(state).filter((v) => v.state === 'error');
      const partial = Object.values(state).find((v) => v.state === 'connected' && v.usageError);
      return {
        state: errors.length ? 'error' : connected ? 'connected' : 'missing',
        detail: errors.length ? errors[0].detail : partial ? partial.detail : connected ? ui('Připojeno {0} z 2 API.', connected) : ui('Žádný API klíč. Útratu můžeš zapisovat ručně.'),
        count: connected,
        watching: Boolean(timer),
        lastEventAt: Math.max(...Object.values(state).map((v) => v.at)),
      };
    },
  };
}
