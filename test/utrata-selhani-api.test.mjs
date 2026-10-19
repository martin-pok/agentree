// Konec do konce: Admin API Anthropicu a OpenAI proti místnímu mock serveru (tvary odpovědí podle
// oficiální dokumentace cost_report / usage_report a /organization/costs / usage/completions).
// Selhání jednoho zdroje nesmí Útrata ukázat jako celý součet a selhání obou ne jako „nepřipojeno“
// ani jako nulu (CLAUDE.md: nepodařilo se zjistit ≠ nic).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestServer, api, waitFor } from './helpers.mjs';

globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const { spendHeroHtml } = await import('../public/js/views/spend.js');

const DAY = 86400e3;
const utcDen = (ts) => new Date(ts).toISOString().slice(0, 10);

// Mock dodavatelů: `rezim[vendor]` = 'ok' | status (401, 429, 500…). Anthropic posílá dvě stránky,
// aby se ověřilo i dočtení stránkování.
function mockServer(rezim) {
  const dotazy = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    dotazy.push({ host: req.headers['x-mock-host'], path: url.pathname, query: Object.fromEntries(url.searchParams), auth: req.headers.authorization || req.headers['x-api-key'] || '' });
    const vendor = req.headers['x-mock-host'] === 'api.anthropic.com' ? 'anthropic' : 'openai';
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (rezim[vendor] !== 'ok') return send(rezim[vendor], { error: { type: 'error', message: 'nope' } });
    const dnes = Date.now();
    if (vendor === 'anthropic') {
      const bucket = (ts, results) => ({ starting_at: `${utcDen(ts)}T00:00:00Z`, ending_at: `${utcDen(ts + DAY)}T00:00:00Z`, results });
      if (url.pathname.endsWith('/cost_report')) {
        if (!url.searchParams.get('page')) return send(200, { data: [bucket(dnes - DAY, [{ amount: '250.00', currency: 'USD', model: 'claude-opus-5-5', description: 'x', cost_type: 'tokens' }])], has_more: true, next_page: 'p2' });
        return send(200, { data: [bucket(dnes, [{ amount: '123.45', currency: 'USD', model: 'claude-opus-5-5', cost_type: 'tokens' }, { amount: '100', currency: 'USD', model: null, cost_type: 'web_search' }])], has_more: false, next_page: null });
      }
      return send(200, { data: [bucket(dnes, [{ model: 'claude-opus-5-5', uncached_input_tokens: 1500, output_tokens: 500, cache_read_input_tokens: 200, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 10 } }])], has_more: false, next_page: null });
    }
    const start = Math.floor(dnes / DAY) * 86400;
    if (url.pathname.endsWith('/costs')) {
      return send(200, { object: 'page', data: [{ object: 'bucket', start_time: start, end_time: start + 86400, results: [{ object: 'organization.costs.result', amount: { value: 0.06, currency: 'usd' }, line_item: 'gpt-6, input', project_id: null }] }], has_more: false, next_page: null });
    }
    return send(200, { object: 'page', data: [{ object: 'bucket', start_time: start, end_time: start + 86400, results: [{ object: 'organization.usage.completions.result', input_tokens: 100, output_tokens: 20, input_cached_tokens: 40, num_model_requests: 2, model: 'gpt-6' }] }], has_more: false, next_page: null });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, dotazy, port: server.address().port })));
}

async function spust(t, rezim) {
  const mock = await mockServer(rezim);
  const puvodni = globalThis.fetch;
  // Admin API → mock; jakákoli jiná síť (kurzy, aktualizace) poctivě selže. Místní server projde.
  globalThis.fetch = (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === '127.0.0.1') return puvodni(input, init);
    if (url.hostname !== 'api.anthropic.com' && url.hostname !== 'api.openai.com') return Promise.reject(new Error('offline'));
    const headers = { ...(init.headers || {}), 'x-mock-host': url.hostname };
    return puvodni(`http://127.0.0.1:${mock.port}${url.pathname}${url.search}`, { ...init, headers });
  };
  process.env.ANTHROPIC_ADMIN_KEY = 'sk-ant-admin01-testtesttesttesttesttest';
  process.env.OPENAI_ADMIN_KEY = 'sk-admin-testtesttesttesttesttest';
  const s = await startTestServer({ AGENTEEQ_CLOUD: '1' });
  t.after(async () => {
    await s.close();
    globalThis.fetch = puvodni;
    delete process.env.ANTHROPIC_ADMIN_KEY;
    delete process.env.OPENAI_ADMIN_KEY;
    mock.server.close();
  });
  const spend = await waitFor(async () => {
    const sp = (await api(s.url).get('/api/state')).body.spend;
    return sp.billing.connected || sp.billing.failed?.length === 2 ? sp : null;
  }, 8000);
  return { s, spend, mock };
}

test('Admin API: oba zdroje v pořádku – stránkování, centy, model, žádné selhání', async (t) => {
  const { spend, mock } = await spust(t, { anthropic: 'ok', openai: 'ok' });
  assert.deepEqual(spend.billing.failed, []);
  const anth = spend.automatic.filter((r) => r.service === 'anthropic-api').reduce((a, r) => a + r.amount, 0);
  // 250 + 123,45 + 100 centů = 4,7345 $ → po dnech zaokrouhleno 2,50 + 2,23.
  assert.equal(Math.round(anth * 100) / 100, 4.73);
  assert.equal(spend.automatic.filter((r) => r.service === 'openai-api').reduce((a, r) => a + r.amount, 0), 0.06);
  const cost = mock.dotazy.filter((d) => d.path.endsWith('/cost_report'));
  assert.equal(cost.length, 2, 'druhá stránka cost_report dočtena');
  assert.equal(cost[1].query.page, 'p2');
  assert.equal(cost[0].query.limit, '31');
  assert.ok(mock.dotazy.every((d) => /^(Bearer )?sk-/.test(d.auth)), 'klíč jde v hlavičce dodavatele');
  // OpenAI: koše začínají půlnocí UTC, aby se náklady z rána nepřipsaly předchozímu dni.
  for (const d of mock.dotazy.filter((x) => x.host === 'api.openai.com')) assert.equal(Number(d.query.start_time) % 86400, 0, d.path);
});

test('Admin API: Anthropic 401, OpenAI v pořádku – Útrata řekne, že součet je neúplný', async (t) => {
  const { spend } = await spust(t, { anthropic: 401, openai: 'ok' });
  assert.equal(spend.billing.connected, true);
  assert.deepEqual(spend.billing.failed.map((f) => f.id), ['anthropic-admin']);
  assert.match(spend.billing.failed[0].detail, /401/);
  assert.equal(spend.automatic.some((r) => r.service === 'anthropic-api'), false, 'žádná stará ani vymyšlená data Anthropicu');
  const html = spendHeroHtml(spend);
  assert.match(html, /data-billing-failed/);
  assert.match(html, /Anthropic \(Anthropic odpověděla 401\)/);
  assert.match(html, /neúplné/);
});

test('Admin API: oba zdroje selžou (500, 429) – ne „nepřipojeno“, ne nula', async (t) => {
  const { spend } = await spust(t, { anthropic: 500, openai: 429 });
  assert.equal(spend.billing.connected, false);
  assert.deepEqual(spend.billing.failed.map((f) => f.id).sort(), ['anthropic-admin', 'openai-admin']);
  const html = spendHeroHtml(spend);
  assert.match(html, /Náklady za API se nepodařilo načíst/);
  assert.match(html, /OpenAI odpověděla 429/);
  assert.match(html, /Anthropic odpověděla 500/);
  assert.doesNotMatch(html, /nejsou připojené|Propojit API/);
  assert.doesNotMatch(html, /Náklady z API tento měsíc/, 'žádný součet, který by se dal číst jako 0');
});

test('Útrata bez klíčů zůstává „nepřipojeno“ (žádné selhání si nevymýšlí)', () => {
  const html = spendHeroHtml({ billing: { connected: false, at: null, failed: [] }, month: { total: 0 }, budgetsConfig: {}, currency: 'CZK' });
  assert.match(html, /Náklady za API nejsou připojené/);
  // Starší server bez `failed` se chová stejně.
  assert.match(spendHeroHtml({ billing: { connected: false, at: null }, month: { total: 0 }, budgetsConfig: {}, currency: 'CZK' }), /nejsou připojené/);
});
