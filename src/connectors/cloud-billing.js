import { HOUR, DAY, round2 } from '../util.js';

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

export function parseOpenAICosts(json) {
  const daily = {};
  for (const bucket of json?.data || []) {
    const day = new Date((bucket.start_time || 0) * 1000).toISOString().slice(0, 10);
    for (const r of bucket.results || []) daily[day] = (daily[day] || 0) + amountOf(r);
  }
  return daily;
}

export function parseAnthropicCosts(json) {
  const daily = {};
  for (const bucket of json?.data || []) {
    const day = String(bucket.starting_at || bucket.start_time || '').slice(0, 10);
    if (!day) continue;
    const results = Array.isArray(bucket.results) ? bucket.results : [bucket];
    for (const r of results) daily[day] = (daily[day] || 0) + amountOf(r);
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
    'openai-admin': { state: 'missing', detail: 'Přidej OpenAI Admin API klíč.', daily: {}, usage: {}, at: 0 },
    'anthropic-admin': { state: 'missing', detail: 'Přidej Anthropic Admin API klíč.', daily: {}, usage: {}, at: 0 },
  };
  let timer = null;

  async function fetchOpenAI(key) {
    const url = new URL('https://api.openai.com/v1/organization/costs');
    url.searchParams.set('start_time', String(Math.floor((Date.now() - 180 * DAY) / 1000)));
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.set('limit', '180');
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`OpenAI odpověděla ${res.status}`);
    return parseOpenAICosts(await res.json());
  }

  async function fetchAnthropic(key) {
    const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
    url.searchParams.set('starting_at', new Date(Date.now() - 180 * DAY).toISOString().slice(0, 10));
    url.searchParams.set('ending_at', new Date().toISOString().slice(0, 10));
    const res = await fetchImpl(url, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Anthropic odpověděla ${res.status}`);
    return parseAnthropicCosts(await res.json());
  }

  // Spotřeba tokenů OpenAI (Admin klíč, stejný jako pro náklady). Nenásleduje přesměrování a
  // odpověď se čte jen do stropu 5 MB – chyba se vždy vrátí jako Error, nikdy nepropadne dál.
  async function fetchOpenAIUsage(key) {
    const url = new URL('https://api.openai.com/v1/organization/usage/completions');
    url.searchParams.set('start_time', String(Math.floor((Date.now() - 180 * DAY) / 1000)));
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.set('limit', '180');
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${key}` }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`OpenAI odpověděla ${res.status}`);
    const json = await readBoundedJson(res, 5_000_000);
    if (json === null) throw new Error('OpenAI vrátila neočekávanou nebo příliš velkou odpověď.');
    return parseOpenAIUsage(json);
  }

  // Spotřeba tokenů Anthropic (stejný Admin klíč jako pro cost_report).
  async function fetchAnthropicUsage(key) {
    const url = new URL('https://api.anthropic.com/v1/organizations/usage_report/messages');
    url.searchParams.set('starting_at', new Date(Date.now() - 180 * DAY).toISOString());
    url.searchParams.set('ending_at', new Date().toISOString());
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.set('limit', '31');
    const res = await fetchImpl(url, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Anthropic odpověděla ${res.status}`);
    const json = await readBoundedJson(res, 5_000_000);
    if (json === null) throw new Error('Anthropic vrátila neočekávanou nebo příliš velkou odpověď.');
    return parseAnthropicUsage(json);
  }

  const USAGE_FETCHERS = { 'openai-admin': fetchOpenAIUsage, 'anthropic-admin': fetchAnthropicUsage };

  async function refresh() {
    if (!config.cloudFetch) return;
    for (const [id, fetcher] of [['openai-admin', fetchOpenAI], ['anthropic-admin', fetchAnthropic]]) {
      const key = await secrets.get(id);
      const st = state[id];
      if (!key) {
        Object.assign(st, { state: 'missing', detail: id === 'openai-admin' ? 'Přidej OpenAI Admin API klíč.' : 'Přidej Anthropic Admin API klíč.', daily: {}, usage: {} });
        continue;
      }
      try {
        st.daily = await fetcher(key);
        // Spotřeba tokenů je vedlejší – chybu nebo výpadek jen zaznamenáme do detailu, náklady zůstávají platné.
        try {
          st.usage = await USAGE_FETCHERS[id](key);
        } catch {
          st.usage = {};
        }
        Object.assign(st, { state: 'connected', detail: 'Denní náklady a spotřeba tokenů organizace za 180 dní.', at: Date.now() });
      } catch (err) {
        Object.assign(st, { state: 'error', detail: String(err.message).slice(0, 160) });
      }
    }
    ctx.onSpendChanged?.();
  }

  return {
    id: 'cloud-billing',
    name: 'Náklady za API',
    provider: 'other',
    kind: 'cloud',
    verified: false,
    source: 'OpenAI Admin API · Anthropic Admin API',
    description: 'Automaticky doplní útratu a spotřebu tokenů za API do grafů a rozpočtů.',
    async start() {
      await refresh().catch(() => {});
      timer = setInterval(() => refresh().catch(() => {}), HOUR);
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
    tokenUsage() {
      return Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.usage]));
    },
    providers() {
      return Object.fromEntries(
        Object.entries(state).map(([k, v]) => [
          k,
          { state: v.state, detail: v.detail, at: v.at, source: v.state === 'missing' ? null : secrets.source(k), tokens: v.usage },
        ])
      );
    },
    status() {
      const connected = Object.values(state).filter((v) => v.state === 'connected').length;
      const errors = Object.values(state).filter((v) => v.state === 'error');
      return {
        state: errors.length ? 'error' : connected ? 'connected' : 'missing',
        detail: errors.length ? errors[0].detail : connected ? `Připojeno ${connected} z 2 API.` : 'Žádný API klíč. Útratu můžeš zapisovat ručně.',
        count: connected,
        watching: Boolean(timer),
        lastEventAt: Math.max(...Object.values(state).map((v) => v.at)),
      };
    },
  };
}
