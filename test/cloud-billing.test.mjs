import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOpenAICosts,
  parseAnthropicCosts,
  parseOpenAIUsage,
  parseAnthropicUsage,
  createCloudBillingConnector,
} from '../src/connectors/cloud-billing.js';

// Testovací tajný klíč – nikdy se nesmí objevit v žádném výstupu konektoru (stav, detail chyby, útrata, tokeny).
const OPENAI_KEY = 'sk-tajny-openai-klic-nikdy-nezverejnit';
const ANTHROPIC_KEY = 'sk-ant-admin01-tajny-anthropic-klic-nikdy-nezverejnit';

function fakeSecrets(keys) {
  return {
    async get(id) {
      return keys[id] ?? null;
    },
    source() {
      return 'env';
    },
  };
}

function fakeCtx(keys, { cloudFetch = true } = {}) {
  return { config: { cloudFetch }, secrets: fakeSecrets(keys), onSpendChanged: () => {} };
}

// Nikdy nedovolí, aby se text tajemství objevil v serializovaném výstupu.
function assertNoSecret(value, ...secrets) {
  const text = JSON.stringify(value);
  for (const s of secrets) assert.equal(text.includes(s), false, `výstup obsahuje tajný klíč: ${s}`);
}

test('parseOpenAIUsage: sečte tokeny a počet požadavků podle dne z bucketů usage/completions', () => {
  const json = {
    data: [
      {
        object: 'bucket',
        start_time: Math.floor(Date.UTC(2026, 0, 1) / 1000),
        end_time: Math.floor(Date.UTC(2026, 0, 2) / 1000),
        results: [
          { input_tokens: 1000, output_tokens: 500, input_cached_tokens: 800, num_model_requests: 5 },
          { input_tokens: 200, output_tokens: 100, input_cached_tokens: 0, num_model_requests: 1 },
        ],
      },
      {
        object: 'bucket',
        start_time: Math.floor(Date.UTC(2026, 0, 2) / 1000),
        end_time: Math.floor(Date.UTC(2026, 0, 3) / 1000),
        results: [],
      },
    ],
  };
  const daily = parseOpenAIUsage(json);
  assert.deepEqual(daily['2026-01-01'], { input: 1200, output: 600, cachedInput: 800, requests: 6 });
  assert.deepEqual(daily['2026-01-02'], { input: 0, output: 0, cachedInput: 0, requests: 0 });
});

test('parseOpenAIUsage: chybějící nebo neplatná pole se počítají jako 0, nikdy se nevymýšlí', () => {
  const json = { data: [{ start_time: Math.floor(Date.UTC(2026, 0, 5) / 1000), results: [{ input_tokens: 'hodně' }, {}] }] };
  const daily = parseOpenAIUsage(json);
  assert.deepEqual(daily['2026-01-05'], { input: 0, output: 0, cachedInput: 0, requests: 0 });
});

test('parseOpenAIUsage: prázdná nebo chybějící data vrátí prázdný objekt', () => {
  assert.deepEqual(parseOpenAIUsage({}), {});
  assert.deepEqual(parseOpenAIUsage(null), {});
  assert.deepEqual(parseOpenAIUsage({ data: [] }), {});
});

test('parseAnthropicUsage: sečte nekešované/výstupní tokeny a cache podle dne z usage_report/messages', () => {
  const json = {
    data: [
      {
        starting_at: '2026-01-01T00:00:00Z',
        ending_at: '2026-01-02T00:00:00Z',
        results: [
          {
            model: 'claude-opus-5',
            uncached_input_tokens: 1500,
            output_tokens: 500,
            cache_read_input_tokens: 200,
            cache_creation: { ephemeral_1h_input_tokens: 10, ephemeral_5m_input_tokens: 20 },
          },
          { model: 'claude-sonnet-5', uncached_input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } },
        ],
      },
    ],
    has_more: false,
    next_page: null,
  };
  const daily = parseAnthropicUsage(json);
  assert.deepEqual(daily['2026-01-01'], { input: 1600, output: 550, cacheRead: 200, cacheWrite: 30 });
});

test('parseAnthropicUsage: bucket bez starting_at se přeskočí, chybějící cache_creation nespadne', () => {
  const json = {
    data: [
      { ending_at: '2026-01-02T00:00:00Z', results: [{ output_tokens: 1 }] },
      { starting_at: '2026-01-03T00:00:00Z', results: [{ uncached_input_tokens: 10 }] },
    ],
  };
  const daily = parseAnthropicUsage(json);
  assert.equal(Object.keys(daily).length, 1);
  assert.deepEqual(daily['2026-01-03'], { input: 10, output: 0, cacheRead: 0, cacheWrite: 0 });
});

// Existující chování (náklady) zůstává beze změny – regresní test parserů z předchozí verze konektoru.
test('parseOpenAICosts a parseAnthropicCosts: beze změny (regresní test)', () => {
  const openai = parseOpenAICosts({ data: [{ start_time: Math.floor(Date.UTC(2026, 0, 1) / 1000), results: [{ amount: { value: 1.5 } }, { amount: '0.5' }] }] });
  assert.equal(openai['2026-01-01'], 2);
  const anthropic = parseAnthropicCosts({ data: [{ starting_at: '2026-01-01', results: [{ amount: 3 }] }] });
  assert.equal(anthropic['2026-01-01'], 3);
});

function routedFetch(routes) {
  return async (url, opts) => {
    const href = String(url);
    for (const [match, handler] of routes) {
      if (href.includes(match)) return handler(href, opts);
    }
    throw new Error(`Neočekávaná adresa ve testu: ${href}`);
  };
}

const okJson = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const errStatus = (status) => ({ ok: false, status, json: async () => ({}), text: async () => '' });

test('Konektor: bez klíče je stav "missing" a tokeny/náklady jsou prázdné', async () => {
  const connector = createCloudBillingConnector(fakeCtx({}), { fetchImpl: async () => { throw new Error('nemělo se volat'); } });
  await connector.scan();
  const providers = connector.providers();
  assert.equal(providers['openai-admin'].state, 'missing');
  assert.equal(providers['anthropic-admin'].state, 'missing');
  assert.deepEqual(providers['openai-admin'].tokens, {});
  assert.deepEqual(connector.autoEntries(), []);
});

test('Konektor: AGENTEEQ_CLOUD=0 (config.cloudFetch=false) nikdy nezavolá síť', async () => {
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY }, { cloudFetch: false }), {
    fetchImpl: async () => { throw new Error('nemělo se volat'); },
  });
  await connector.scan();
  assert.equal(connector.providers()['openai-admin'].state, 'missing');
});

test('Konektor: úspěšné napojení natáhne náklady i spotřebu tokenů odděleně (žádné sčítání metrik)', async () => {
  const openaiCosts = { data: [{ start_time: Math.floor(Date.UTC(2026, 0, 1) / 1000), results: [{ amount: 2.5 }] }] };
  const openaiUsage = { data: [{ start_time: Math.floor(Date.UTC(2026, 0, 1) / 1000), results: [{ input_tokens: 100, output_tokens: 50, input_cached_tokens: 0, num_model_requests: 1 }] }] };
  const anthropicCosts = { data: [{ starting_at: '2026-01-01', results: [{ amount: 1.25 }] }] };
  const anthropicUsage = { data: [{ starting_at: '2026-01-01T00:00:00Z', results: [{ uncached_input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } }] }] };

  const seenOpts = [];
  const fetchImpl = routedFetch([
    ['api.openai.com/v1/organization/costs', () => okJson(openaiCosts)],
    ['api.openai.com/v1/organization/usage/completions', (href, opts) => { seenOpts.push(opts); return okJson(openaiUsage); }],
    ['api.anthropic.com/v1/organizations/cost_report', () => okJson(anthropicCosts)],
    ['api.anthropic.com/v1/organizations/usage_report/messages', (href, opts) => { seenOpts.push(opts); return okJson(anthropicUsage); }],
  ]);

  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY, 'anthropic-admin': ANTHROPIC_KEY }), { fetchImpl });
  await connector.scan();

  const providers = connector.providers();
  assert.equal(providers['openai-admin'].state, 'connected');
  assert.equal(providers['anthropic-admin'].state, 'connected');
  assert.deepEqual(providers['openai-admin'].tokens['2026-01-01'], { input: 100, output: 50, cachedInput: 0, requests: 1 });
  assert.deepEqual(providers['anthropic-admin'].tokens['2026-01-01'], { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 });

  const tokenUsage = connector.tokenUsage();
  assert.deepEqual(tokenUsage['openai-admin'], providers['openai-admin'].tokens);

  // Náklady (autoEntries, v USD) nejsou ovlivněné tím, že přibyla spotřeba tokenů – jiná metrika, jiné pole.
  const entries = connector.autoEntries();
  assert.equal(entries.length, 2);
  assert.ok(entries.every((e) => typeof e.amount === 'number' && e.currency === 'USD'));

  // Nové endpointy nenásledují přesměrování.
  for (const opts of seenOpts) assert.equal(opts.redirect, 'manual');
});

test('Konektor: 401 od nákladového endpointu nastaví stav "error" a klíč se nikde neobjeví', async () => {
  const fetchImpl = routedFetch([
    ['api.openai.com/v1/organization/costs', () => errStatus(401)],
    ['api.anthropic.com/v1/organizations/cost_report', () => errStatus(401)],
  ]);
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY, 'anthropic-admin': ANTHROPIC_KEY }), { fetchImpl });
  await connector.scan();
  const providers = connector.providers();
  assert.equal(providers['openai-admin'].state, 'error');
  assert.match(providers['openai-admin'].detail, /401/);
  assert.equal(providers['anthropic-admin'].state, 'error');
  assertNoSecret(providers, OPENAI_KEY, ANTHROPIC_KEY);
  assertNoSecret(connector.status(), OPENAI_KEY, ANTHROPIC_KEY);
});

test('Konektor: 429 od nákladového endpointu se ohlásí jako chyba se statusovým kódem', async () => {
  const fetchImpl = routedFetch([
    ['api.openai.com/v1/organization/costs', () => errStatus(429)],
    ['api.anthropic.com/v1/organizations/cost_report', () => errStatus(429)],
  ]);
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY, 'anthropic-admin': ANTHROPIC_KEY }), { fetchImpl });
  await connector.scan();
  const providers = connector.providers();
  assert.equal(providers['openai-admin'].state, 'error');
  assert.match(providers['openai-admin'].detail, /429/);
  assert.equal(providers['anthropic-admin'].state, 'error');
  assert.match(providers['anthropic-admin'].detail, /429/);
});

test('Konektor: timeout/výpadek sítě se nikdy nepropaguje jako výjimka ven ze scan()', async () => {
  const fetchImpl = async () => {
    throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
  };
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY, 'anthropic-admin': ANTHROPIC_KEY }), { fetchImpl });
  await assert.doesNotReject(() => connector.scan());
  const providers = connector.providers();
  assert.equal(providers['openai-admin'].state, 'error');
  assert.equal(providers['anthropic-admin'].state, 'error');
  assertNoSecret(providers, OPENAI_KEY, ANTHROPIC_KEY);
});

test('Konektor: náklady projdou, ale spotřeba tokenů selže (403) – stav zůstává "connected", tokeny prázdné', async () => {
  const openaiCosts = { data: [{ start_time: Math.floor(Date.UTC(2026, 0, 1) / 1000), results: [{ amount: 1 }] }] };
  const fetchImpl = routedFetch([
    ['api.openai.com/v1/organization/costs', () => okJson(openaiCosts)],
    ['api.openai.com/v1/organization/usage/completions', () => errStatus(403)],
    ['api.anthropic.com/v1/organizations/cost_report', () => okJson({ data: [] })],
    ['api.anthropic.com/v1/organizations/usage_report/messages', () => errStatus(403)],
  ]);
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY, 'anthropic-admin': ANTHROPIC_KEY }), { fetchImpl });
  await connector.scan();
  const providers = connector.providers();
  assert.equal(providers['openai-admin'].state, 'connected');
  assert.deepEqual(providers['openai-admin'].tokens, {});
  assert.equal(providers['openai-admin'].detail.includes('403'), false);
});

test('Konektor: přesměrování od endpointu spotřeby se nenásleduje a bere se jako chyba dané dílčí volání', async () => {
  const openaiCosts = { data: [{ start_time: Math.floor(Date.UTC(2026, 0, 1) / 1000), results: [{ amount: 1 }] }] };
  const fetchImpl = routedFetch([
    ['api.openai.com/v1/organization/costs', () => okJson(openaiCosts)],
    ['api.openai.com/v1/organization/usage/completions', () => ({ ok: false, status: 302, json: async () => ({}), text: async () => '' })],
    ['api.anthropic.com/v1/organizations/cost_report', () => okJson({ data: [] })],
    ['api.anthropic.com/v1/organizations/usage_report/messages', () => okJson({ data: [] })],
  ]);
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY, 'anthropic-admin': ANTHROPIC_KEY }), { fetchImpl });
  await connector.scan();
  const providers = connector.providers();
  assert.equal(providers['openai-admin'].state, 'connected');
  assert.deepEqual(providers['openai-admin'].tokens, {});
});

test('Konektor: příliš velká odpověď spotřeby tokenů se odmítne (strop na velikost) a nespadne', async () => {
  const bigResults = Array.from({ length: 200000 }, () => ({ input_tokens: 1, output_tokens: 1 }));
  const huge = { data: [{ start_time: Math.floor(Date.UTC(2026, 0, 1) / 1000), results: bigResults }] };
  const openaiCosts = { data: [] };
  const fetchImpl = routedFetch([
    ['api.openai.com/v1/organization/costs', () => okJson(openaiCosts)],
    ['api.openai.com/v1/organization/usage/completions', () => okJson(huge)],
    ['api.anthropic.com/v1/organizations/cost_report', () => okJson({ data: [] })],
    ['api.anthropic.com/v1/organizations/usage_report/messages', () => okJson({ data: [] })],
  ]);
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY, 'anthropic-admin': ANTHROPIC_KEY }), { fetchImpl });
  await connector.scan();
  const providers = connector.providers();
  // Náklady i tak zůstávají v pořádku, tokeny se u příliš velké odpovědi jen nedoplní.
  assert.equal(providers['openai-admin'].state, 'connected');
  assert.deepEqual(providers['openai-admin'].tokens, {});
});
