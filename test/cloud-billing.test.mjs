import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOpenAICosts,
  parseAnthropicCosts,
  parseOpenAIUsage,
  parseAnthropicUsage,
  parseOpenAICostModels,
  parseAnthropicCostModels,
  parseOpenAIUsageModels,
  parseAnthropicUsageModels,
  openAILineItemModel,
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
  const anthropic = parseAnthropicCosts({ data: [{ starting_at: '2026-01-01', results: [{ amount: 300 }] }] });
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
  const anthropicCosts = { data: [{ starting_at: '2026-01-01', results: [{ amount: 125 }] }] };
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

test('Konektor: Anthropic dočte denní report ze všech stránek, posílá ISO čas a nevydává část dat za celé období', async () => {
  const pages = [];
  const fetchImpl = routedFetch([
    ['api.openai.com/v1/organization/costs', () => okJson({ data: [] })],
    ['api.openai.com/v1/organization/usage/completions', () => okJson({ data: [] })],
    ['api.anthropic.com/v1/organizations/cost_report', (href, opts) => {
      const url = new URL(href); pages.push({ path: 'cost', url, opts });
      return okJson(url.searchParams.get('page') ? {
        data: [{ starting_at: '2026-01-02T00:00:00Z', results: [{ amount: 200 }] }], has_more: false,
      } : {
        data: [{ starting_at: '2026-01-01T00:00:00Z', results: [{ amount: 100 }] }], has_more: true, next_page: 'cost-next',
      });
    }],
    ['api.anthropic.com/v1/organizations/usage_report/messages', (href, opts) => {
      const url = new URL(href); pages.push({ path: 'usage', url, opts });
      return okJson(url.searchParams.get('page') ? {
        data: [{ starting_at: '2026-01-02T00:00:00Z', results: [{ uncached_input_tokens: 20 }] }], has_more: false,
      } : {
        data: [{ starting_at: '2026-01-01T00:00:00Z', results: [{ uncached_input_tokens: 10 }] }], has_more: true, next_page: 'usage-next',
      });
    }],
  ]);
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY, 'anthropic-admin': ANTHROPIC_KEY }), { fetchImpl });
  await connector.scan();
  const provider = connector.providers()['anthropic-admin'];
  assert.equal(provider.state, 'connected');
  assert.deepEqual(connector.autoEntries().filter((x) => x.service === 'anthropic-api').map((x) => x.amount), [1, 2]);
  assert.deepEqual(provider.tokens['2026-01-01'], { input: 10, output: 0, cacheRead: 0, cacheWrite: 0 });
  assert.deepEqual(provider.tokens['2026-01-02'], { input: 20, output: 0, cacheRead: 0, cacheWrite: 0 });
  assert.equal(pages.length, 4, 'náklady i spotřeba musí dočíst druhou stránku');
  for (const { path, url, opts } of pages) {
    assert.equal(url.searchParams.get('bucket_width'), '1d');
    assert.equal(url.searchParams.get('limit'), '31');
    assert.match(url.searchParams.get('starting_at'), /T.*Z$/);
    assert.match(url.searchParams.get('ending_at'), /T.*Z$/);
    assert.equal(opts.redirect, path === 'cost' ? 'error' : 'manual');
    assert.match(opts.headers['User-Agent'], /^Agenteeq\//);
  }
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

test('Konektor: dřívější útrata po selhání dalšího dotazu nezůstane jako zdánlivě aktuální', async () => {
  let healthy = true;
  const fetchImpl = routedFetch([
    ['api.openai.com/v1/organization/costs', () => healthy ? okJson({ data: [{ start_time: Math.floor(Date.UTC(2026, 0, 1) / 1000), results: [{ amount: 4 }] }] }) : errStatus(503)],
    ['api.openai.com/v1/organization/usage/completions', () => okJson({ data: [] })],
    ['api.anthropic.com/v1/organizations/cost_report', () => okJson({ data: [] })],
    ['api.anthropic.com/v1/organizations/usage_report/messages', () => okJson({ data: [] })],
  ]);
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY, 'anthropic-admin': ANTHROPIC_KEY }), { fetchImpl });
  await connector.scan();
  assert.equal(connector.autoEntries().some((x) => x.service === 'openai-api'), true);
  healthy = false;
  await connector.scan();
  const provider = connector.providers()['openai-admin'];
  assert.equal(provider.state, 'error');
  assert.equal(provider.at, 0);
  assert.deepEqual(provider.tokens, {});
  assert.equal(connector.autoEntries().some((x) => x.service === 'openai-api'), false);
});

test('Konektor: náklady projdou, ale spotřeba tokenů selže (403) – náklady platí, spotřeba je „nezjištěno“, ne nula', async () => {
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
  assert.equal(connector.autoEntries().some((x) => x.service === 'openai-api'), true, 'náklady zůstávají');
  // Dřív tu byl prázdný objekt – na pohled „žádná spotřeba“. Nezjištěná hodnota je null s důvodem.
  assert.equal(providers['openai-admin'].tokens, null);
  assert.match(providers['openai-admin'].tokensError, /403/);
  assert.match(providers['openai-admin'].detail, /nepodařilo zjistit/);
  assert.equal(connector.tokenUsage()['openai-admin'], null);
  assert.match(connector.status().detail, /nepodařilo zjistit/);
  assert.equal(connector.status().state, 'connected');
  assertNoSecret(providers, OPENAI_KEY, ANTHROPIC_KEY);
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
  assert.equal(providers['openai-admin'].tokens, null);
  assert.match(providers['openai-admin'].tokensError, /302/);
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
  // Náklady i tak zůstávají v pořádku, tokeny se u příliš velké odpovědi nedoplní a je to vidět.
  assert.equal(providers['openai-admin'].state, 'connected');
  assert.equal(providers['openai-admin'].tokens, null);
  assert.match(providers['openai-admin'].tokensError, /příliš velkou/);
});

test('Anthropic cost_report: částka je v centech (příklad z dokumentace "123.45" = 1,2345 $)', () => {
  const den = parseAnthropicCosts({ data: [{ starting_at: '2026-10-01T00:00:00Z', results: [{ amount: '123.45', currency: 'USD' }, { amount: '76.55', currency: 'USD' }] }] });
  assert.ok(Math.abs(den['2026-10-01'] - 2) < 1e-9, `čekáme 2 $, ne ${den['2026-10-01']}`);
  // OpenAI posílá dolary – jeho částka se nedělí.
  const openai = parseOpenAICosts({ data: [{ start_time: Math.floor(Date.UTC(2026, 9, 1) / 1000), results: [{ amount: { value: 2, currency: 'usd' } }] }] });
  assert.equal(openai['2026-10-01'], 2);
});

test('OpenAI costs i usage dočtou další stránku (has_more/next_page) – nejnovější den nezmizí', async () => {
  const den = (d) => Math.floor(Date.UTC(2026, 9, d) / 1000);
  const volani = [];
  const fetchImpl = routedFetch([
    ['api.openai.com/v1/organization/costs', (href, opts) => {
      const url = new URL(href); volani.push({ cesta: 'costs', url, opts });
      return okJson(url.searchParams.get('page') === 'costs-2'
        ? { object: 'page', data: [{ start_time: den(3), results: [{ amount: { value: 7, currency: 'usd' } }] }], has_more: false, next_page: null }
        : { object: 'page', data: [{ start_time: den(1), results: [{ amount: { value: 1, currency: 'usd' } }] }], has_more: true, next_page: 'costs-2' });
    }],
    ['api.openai.com/v1/organization/usage/completions', (href, opts) => {
      const url = new URL(href); volani.push({ cesta: 'usage', url, opts });
      return okJson(url.searchParams.get('page') === 'usage-2'
        ? { object: 'page', data: [{ start_time: den(3), results: [{ input_tokens: 30, output_tokens: 3 }] }], has_more: false, next_page: null }
        : { object: 'page', data: [{ start_time: den(1), results: [{ input_tokens: 10, output_tokens: 1 }] }], has_more: true, next_page: 'usage-2' });
    }],
  ]);
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY }), { fetchImpl });
  await connector.scan();
  const p = connector.providers()['openai-admin'];
  assert.equal(p.state, 'connected');
  assert.deepEqual(connector.autoEntries().map((x) => [x.date, x.amount]), [['2026-10-01', 1], ['2026-10-03', 7]]);
  assert.equal(p.tokens['2026-10-03'].input, 30, 'druhá stránka spotřeby se musí dočíst');
  assert.equal(volani.filter((v) => v.cesta === 'costs').length, 2);
  assert.equal(volani.filter((v) => v.cesta === 'usage').length, 2);
  for (const { cesta, url, opts } of volani) {
    // Stropy podle specifikace OpenAI: costs 1–180, usage při 1d nejvýš 31.
    assert.equal(url.searchParams.get('limit'), cesta === 'costs' ? '180' : '31');
    assert.equal(url.searchParams.get('bucket_width'), '1d');
    assert.equal(opts.redirect, cesta === 'costs' ? 'error' : 'manual');
  }
  assertNoSecret(connector.providers(), OPENAI_KEY);
});

test('OpenAI: chybějící next_page u has_more nebo nekonečné stránkování je chyba, ne částečná data', async () => {
  const neuplne = routedFetch([
    ['api.openai.com/v1/organization/costs', () => okJson({ data: [{ start_time: 1, results: [{ amount: 1 }] }], has_more: true, next_page: null })],
  ]);
  const a = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY }), { fetchImpl: neuplne });
  await a.scan();
  assert.equal(a.providers()['openai-admin'].state, 'error');
  assert.match(a.providers()['openai-admin'].detail, /neúplné stránkování/);
  assert.equal(a.autoEntries().length, 0);

  let pocet = 0;
  const donekonecna = routedFetch([
    ['api.openai.com/v1/organization/costs', () => { pocet++; return okJson({ data: [], has_more: true, next_page: 'dalsi' }); }],
  ]);
  const b = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY }), { fetchImpl: donekonecna });
  await b.scan();
  assert.equal(b.providers()['openai-admin'].state, 'error');
  assert.ok(pocet <= 12, `strop stránek, bylo ${pocet}`);
});

test('Anthropic cost_report: částka je v centech (příklad z dokumentace "123.45" = 1,2345 $)', () => {
  const den = parseAnthropicCosts({ data: [{ starting_at: '2026-10-01T00:00:00Z', results: [{ amount: '123.45', currency: 'USD' }, { amount: '76.55', currency: 'USD' }] }] });
  assert.ok(Math.abs(den['2026-10-01'] - 2) < 1e-9, `čekáme 2 $, ne ${den['2026-10-01']}`);
  // OpenAI posílá dolary – jeho částka se nedělí.
  const openai = parseOpenAICosts({ data: [{ start_time: Math.floor(Date.UTC(2026, 9, 1) / 1000), results: [{ amount: { value: 2, currency: 'usd' } }] }] });
  assert.equal(openai['2026-10-01'], 2);
});

// ---------- 0.34.0: rozpad po modelech ----------

test('Rozpad po modelech: denní součet nákladů je přesně součet seskupených řádků (regrese)', () => {
  const anth = {
    data: [{
      starting_at: '2026-10-01T00:00:00Z',
      results: [
        { amount: '123.45', currency: 'USD', model: 'claude-opus-5', cost_type: 'tokens', token_type: 'uncached_input_tokens' },
        { amount: '76.55', currency: 'USD', model: 'claude-opus-5', cost_type: 'tokens', token_type: 'output_tokens' },
        { amount: '10.10', currency: 'USD', model: 'claude-sonnet-5', cost_type: 'tokens', token_type: 'output_tokens' },
        { amount: '5', currency: 'USD', model: null, cost_type: 'web_search', token_type: null },
      ],
    }],
  };
  const models = parseAnthropicCostModels(anth)['2026-10-01'];
  const daily = parseAnthropicCosts(anth)['2026-10-01'];
  assert.equal(daily, Object.values(models).reduce((a, b) => a + b, 0));
  assert.ok(Math.abs(daily - 2.151) < 1e-9, 'součet všech řádků v centech / 100');
  assert.ok(Math.abs(models['claude-opus-5'] - 2) < 1e-9);
  assert.ok(Math.abs(models[''] - 0.05) < 1e-9, 'náklad bez modelu se neztratí');

  const oa = {
    data: [{
      start_time: Math.floor(Date.UTC(2026, 9, 1) / 1000),
      results: [
        { amount: { value: 1.25, currency: 'usd' }, line_item: 'gpt-6-astra, input_tokens' },
        { amount: { value: 0.75, currency: 'usd' }, line_item: 'gpt-6-astra, output_tokens' },
        { amount: { value: 0.3, currency: 'usd' }, line_item: 'gpt-6-mini, input_tokens' },
        { amount: { value: 0.1, currency: 'usd' }, line_item: null },
      ],
    }],
  };
  const om = parseOpenAICostModels(oa)['2026-10-01'];
  assert.equal(parseOpenAICosts(oa)['2026-10-01'], Object.values(om).reduce((a, b) => a + b, 0));
  assert.deepEqual(Object.keys(om).sort(), ['', 'gpt-6-astra', 'gpt-6-mini']);
  assert.equal(om['gpt-6-astra'], 2);
  assert.equal(openAILineItemModel('web search tool calls'), 'web search tool calls');
  assert.equal(openAILineItemModel(undefined), '');
});

test('Rozpad tokenů po modelech: součet modelů = denní součet stejné odpovědi', () => {
  const oa = { data: [{ start_time: Math.floor(Date.UTC(2026, 9, 1) / 1000), results: [
    { model: 'gpt-6-astra', input_tokens: 1000, output_tokens: 200, input_cached_tokens: 400, num_model_requests: 3 },
    { model: 'gpt-6-mini', input_tokens: 50, output_tokens: 5, input_cached_tokens: 0, num_model_requests: 1 },
  ] }] };
  const m = parseOpenAIUsageModels(oa)['2026-10-01'];
  const d = parseOpenAIUsage(oa)['2026-10-01'];
  assert.equal(m['gpt-6-astra'].input + m['gpt-6-mini'].input, d.input);
  assert.equal(m['gpt-6-astra'].output + m['gpt-6-mini'].output, d.output);
  assert.deepEqual(m['gpt-6-astra'], { input: 1000, output: 200, cached: 400 });

  const an = { data: [{ starting_at: '2026-10-01T00:00:00Z', results: [
    { model: 'claude-opus-5', uncached_input_tokens: 1500, output_tokens: 500, cache_read_input_tokens: 200, cache_creation: { ephemeral_1h_input_tokens: 10, ephemeral_5m_input_tokens: 20 } },
    { model: 'claude-sonnet-5', uncached_input_tokens: 100, output_tokens: 50 },
  ] }] };
  const am = parseAnthropicUsageModels(an)['2026-10-01'];
  const ad = parseAnthropicUsage(an)['2026-10-01'];
  assert.equal(am['claude-opus-5'].input + am['claude-sonnet-5'].input, ad.input);
  assert.equal(am['claude-opus-5'].cached, ad.cacheRead + ad.cacheWrite);
});

function groupedRoutes(seen, { usageFails = false } = {}) {
  const den = Math.floor(Date.UTC(2026, 9, 1) / 1000);
  return routedFetch([
    ['api.openai.com/v1/organization/costs', (href) => { seen.push(new URL(href)); return okJson({ data: [{ start_time: den, results: [
      { amount: { value: 3, currency: 'usd' }, line_item: 'gpt-6-astra, output_tokens' },
      { amount: { value: 1, currency: 'usd' }, line_item: 'gpt-6-mini, input_tokens' },
    ] }] }); }],
    ['api.openai.com/v1/organization/usage/completions', (href) => { seen.push(new URL(href)); return usageFails ? errStatus(403) : okJson({ data: [{ start_time: den, results: [
      { model: 'gpt-6-astra', input_tokens: 900, output_tokens: 100 },
      { model: 'gpt-6-nano', input_tokens: 10, output_tokens: 1 },
    ] }] }); }],
    ['api.anthropic.com/v1/organizations/cost_report', (href) => { seen.push(new URL(href)); return okJson({ data: [{ starting_at: '2026-10-01T00:00:00Z', results: [
      { amount: '250', currency: 'USD', model: 'claude-opus-5' },
    ] }] }); }],
    ['api.anthropic.com/v1/organizations/usage_report/messages', (href) => { seen.push(new URL(href)); return okJson({ data: [{ starting_at: '2026-10-01T00:00:00Z', results: [
      { model: 'claude-opus-5', uncached_input_tokens: 70, output_tokens: 30 },
    ] }] }); }],
  ]);
}

test('Konektor: dotazy jsou seskupené podle modelu/popisu a rozpad sedí s denní útratou', async () => {
  const seen = [];
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY, 'anthropic-admin': ANTHROPIC_KEY }), { fetchImpl: groupedRoutes(seen) });
  await connector.scan();
  const by = (part) => seen.find((u) => u.pathname.endsWith(part));
  assert.deepEqual(by('/organization/costs').searchParams.getAll('group_by'), ['line_item']);
  assert.deepEqual(by('/usage/completions').searchParams.getAll('group_by'), ['model']);
  assert.deepEqual(by('/cost_report').searchParams.getAll('group_by[]'), ['description']);
  assert.deepEqual(by('/usage_report/messages').searchParams.getAll('group_by[]'), ['model']);

  const entries = connector.modelEntries();
  for (const svc of ['openai-api', 'anthropic-api']) {
    const daily = connector.autoEntries().find((e) => e.service === svc).amount;
    const sum = entries.filter((e) => e.service === svc).reduce((a, e) => a + e.amount, 0);
    assert.equal(Math.round(sum * 100) / 100, daily, `${svc}: součet modelů = denní částka`);
  }
  const nano = entries.find((e) => e.model === 'gpt-6-nano');
  assert.deepEqual({ amount: nano.amount, tokens: nano.tokens }, { amount: 0, tokens: { input: 10, output: 1, cached: 0 } }, 'model jen ve spotřebě má nulový náklad, ne vymyšlený');
  assert.deepEqual(entries.find((e) => e.model === 'gpt-6-mini').tokens, { input: 0, output: 0, cached: 0 });
  assert.deepEqual(entries.find((e) => e.model === 'claude-opus-5'), { service: 'anthropic-api', date: '2026-10-01', model: 'claude-opus-5', amount: 2.5, currency: 'USD', tokens: { input: 70, output: 30, cached: 0 } });
  assertNoSecret(entries, OPENAI_KEY, ANTHROPIC_KEY);
});

test('Konektor: selhání spotřeby = tokens null u modelů (náklady zůstávají); selhání nákladů rozpad vymaže', async () => {
  const connector = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY }), { fetchImpl: groupedRoutes([], { usageFails: true }) });
  await connector.scan();
  const entries = connector.modelEntries();
  assert.equal(entries.length, 2);
  assert.ok(entries.every((e) => e.tokens === null));
  assert.equal(entries.reduce((a, e) => a + e.amount, 0), 4);

  let fail = false;
  const ok = groupedRoutes([]);
  const c2 = createCloudBillingConnector(fakeCtx({ 'openai-admin': OPENAI_KEY }), { fetchImpl: async (u, o) => (fail ? errStatus(500) : ok(u, o)) });
  await c2.scan();
  assert.ok(c2.modelEntries().length > 0);
  fail = true;
  await c2.scan();
  assert.deepEqual(c2.modelEntries(), [], 'staré modely nesmí po chybě zůstat jako aktuální');
});
