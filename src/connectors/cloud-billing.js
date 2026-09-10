import { HOUR, DAY, round2 } from '../util.js';

// Náklady organizace z oficiálních Admin API. Neověřeno proti skutečným klíčům — viz docs/CONNECTORS.md.
const amountOf = (r) => {
  const a = r?.amount ?? r?.cost ?? r?.value;
  if (typeof a === 'number') return a;
  if (typeof a === 'string') return Number(a) || 0;
  if (a && typeof a === 'object') return Number(a.value ?? a.amount) || 0;
  return 0;
};

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

export function createCloudBillingConnector(ctx) {
  const { config, secrets } = ctx;
  const state = {
    'openai-admin': { state: 'missing', detail: 'Přidej OpenAI Admin API klíč.', daily: {}, at: 0 },
    'anthropic-admin': { state: 'missing', detail: 'Přidej Anthropic Admin API klíč.', daily: {}, at: 0 },
  };
  let timer = null;

  async function fetchOpenAI(key) {
    const url = new URL('https://api.openai.com/v1/organization/costs');
    url.searchParams.set('start_time', String(Math.floor((Date.now() - 180 * DAY) / 1000)));
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.set('limit', '180');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`OpenAI odpověděla ${res.status}`);
    return parseOpenAICosts(await res.json());
  }

  async function fetchAnthropic(key) {
    const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
    url.searchParams.set('starting_at', new Date(Date.now() - 180 * DAY).toISOString().slice(0, 10));
    url.searchParams.set('ending_at', new Date().toISOString().slice(0, 10));
    const res = await fetch(url, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Anthropic odpověděla ${res.status}`);
    return parseAnthropicCosts(await res.json());
  }

  async function refresh() {
    if (!config.cloudFetch) return;
    for (const [id, fetcher] of [['openai-admin', fetchOpenAI], ['anthropic-admin', fetchAnthropic]]) {
      const key = await secrets.get(id);
      const st = state[id];
      if (!key) {
        Object.assign(st, { state: 'missing', detail: id === 'openai-admin' ? 'Přidej OpenAI Admin API klíč.' : 'Přidej Anthropic Admin API klíč.', daily: {} });
        continue;
      }
      try {
        st.daily = await fetcher(key);
        Object.assign(st, { state: 'connected', detail: 'Denní náklady organizace za 180 dní.', at: Date.now() });
      } catch (err) {
        Object.assign(st, { state: 'error', detail: String(err.message).slice(0, 160) });
      }
    }
    ctx.onSpendChanged?.();
  }

  return {
    id: 'cloud-billing',
    name: 'Náklady z Admin API',
    provider: 'other',
    kind: 'cloud',
    verified: false,
    source: 'OpenAI Admin API · Anthropic Admin API',
    description: 'Automaticky doplní útratu za API do grafů a rozpočtů.',
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
    providers() {
      return Object.fromEntries(Object.entries(state).map(([k, v]) => [k, { state: v.state, detail: v.detail, at: v.at, source: v.state === 'missing' ? null : secrets.source(k) }]));
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
