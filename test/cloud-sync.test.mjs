import test from 'node:test';
import assert from 'node:assert/strict';
import { POVOLENA, jenPovolena, tokenyPoDnech, utrataPoMesicich, limityProCloud, agentiProCloud, napojeniProCloud, createCloudSync } from '../src/cloud-sync.js';
import { startTestServer, api } from './helpers.mjs';

// Synchronizace souhrnů do účtu (src/cloud-sync.js). Hlavní slib: do cloudu jdou jen čísla –
// nikdy text konverzací, jejich názvy, cesty ke složkám ani poznámky k výdajům.

const NYNI = Date.UTC(2026, 8, 24, 12);
const hodina = (d, h) => `2026-09-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}`;
const TAJNE = 'Tajný projekt Sokol';
const relace = [
  { id: 'claude-code:a', provider: 'anthropic', status: 'working', title: TAJNE, cwd: '/Users/eva/Tajné/sokol', lastPrompt: 'Heslo je 1234', hourly: { [hodina(24, 9)]: 1000, [hodina(24, 10)]: 500, [hodina(23, 9)]: 200 } },
  { id: 'codex:b', provider: 'openai', status: 'needs_input', title: 'Další', hourly: { [hodina(24, 11)]: 300 } },
  { id: 'web:chatgpt:c', provider: 'openai', status: 'waiting', title: 'ChatGPT · konverzace 1f2e', hourly: {} },
  { id: 'claude-code:d', provider: 'anthropic', status: 'failed', hourly: { '2026-07-01T09': 999 } },
];
const zaznamy = [
  { service: 'claude', kind: 'subscription', amount: 100, currency: 'USD', date: '2026-06-01', recurring: 'monthly', note: 'Firemní karta Sokol' },
  { service: 'openai-api', kind: 'credits', amount: 25, currency: 'USD', date: '2026-09-06', note: 'kredity' },
  { service: 'cursor', kind: 'subscription', amount: 20, currency: 'USD', date: '2026-05-01', recurring: 'monthly', endDate: '2026-07-31' },
  { service: 'claude', kind: 'extra', amount: 5, currency: 'EUR', date: '2026-09-10' },
  { service: 'Neznámá služba!', kind: 'divny', amount: 7, currency: 'CZK', date: '2026-09-11' },
];
const kurz = { USD: 23, EUR: 25, CZK: 1 };
const prevod = (e) => e.amount * kurz[e.currency];

test('tokeny po dnech: vstup + výstup z hodinových součtů, počet konverzací a jen posledních 35 dní', () => {
  const r = tokenyPoDnech(relace, NYNI);
  assert.deepEqual(r, [
    { day: '2026-09-23', provider: 'anthropic', tokens: 200, sessions: 1 },
    { day: '2026-09-24', provider: 'anthropic', tokens: 1500, sessions: 1 },
    { day: '2026-09-24', provider: 'openai', tokens: 300, sessions: 1 },
  ]);
});

test('útrata po měsících: předplatné každý měsíc do konce, jednorázové jen ve svém měsíci, poznámka nikdy', () => {
  const r = utrataPoMesicich(zaznamy, { mesice: ['2026-07', '2026-08', '2026-09'], prevod, mena: 'CZK' });
  const klic = (x) => `${x.month} ${x.service} ${x.kind}`;
  const mapa = Object.fromEntries(r.map((x) => [klic(x), x.amount]));
  assert.equal(mapa['2026-09-01 claude subscription'], 2300);
  assert.equal(mapa['2026-07-01 cursor subscription'], 460);
  assert.equal(mapa['2026-08-01 cursor subscription'], undefined, 'ukončené předplatné se dál nepočítá');
  assert.equal(mapa['2026-09-01 openai-api credits'], 575);
  assert.equal(mapa['2026-08-01 openai-api credits'], undefined);
  assert.equal(mapa['2026-09-01 claude extra'], 125);
  assert.equal(r.some((x) => x.service.includes(' ')), false, 'služba mimo povolený tvar se neposílá');
  assert.equal(JSON.stringify(r).includes('Sokol'), false);
  assert.ok(r.every((x) => x.currency === 'CZK'));
});

test('limity, agenti a napojení: jen čísla a stavy, žádné hlášky ani popisky', () => {
  const l = limityProCloud([{ id: 'claude-code:five_hour', provider: 'anthropic', app: 'Claude Code', label: '5h okno', usedPercent: 142.3, windowMinutes: 300, resetsAt: NYNI + 3600e3, reached: true, plan: 'max', text: 'Limit do 17:00 – projekt Sokol', at: NYNI }]);
  assert.deepEqual(l, [{ provider: 'anthropic', window_key: 'claude-code-five-hour', used_pct: 100, reached: true, resets_at: new Date(NYNI + 3600e3).toISOString(), measured_at: new Date(NYNI).toISOString() }]);
  assert.deepEqual(agentiProCloud(relace), { working: 1, needs_you: 1, waiting: 1, failed: 1 });
  const n = napojeniProCloud([{ id: 'claude-code', state: 'connected', lastEventAt: NYNI, detail: '/Users/eva/Tajné' }, { id: 'cursor', state: 'missing' }, { id: 'web', state: 'idle' }]);
  assert.deepEqual(n.map((x) => [x.provider, x.kind, x.state]), [['claude-code', 'agent', 'connected'], ['web', 'web', 'connected']]);
  assert.equal(JSON.stringify(n).includes('Tajn'), false);
});

test('seznam povolených polí: co v něm není, neodejde – ani název, ani cesta, ani text', () => {
  const r = jenPovolena('usage_daily', { device_id: 'd', day: '2026-09-24', provider: 'anthropic', tokens: 1, sessions: 1, title: TAJNE, cwd: '/Users/eva', text: 'Heslo' });
  assert.deepEqual(Object.keys(r).sort(), ['day', 'device_id', 'provider', 'sessions', 'tokens']);
  for (const [tabulka, pole] of Object.entries(POVOLENA)) {
    for (const zakazane of ['title', 'text', 'cwd', 'note', 'prompt', 'lastPrompt', 'message', 'label', 'detail', 'email']) {
      assert.equal(pole.includes(zakazane), false, `${tabulka}.${zakazane} do cloudu nesmí`);
    }
  }
});

// Atrapa PostgREST: zapisuje požadavky a vrací, co by vrátil server.
function atrapa({ chyba = false } = {}) {
  const volani = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    volani.push({ method: init.method, cesta: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : null, prefer: init.headers.Prefer, auth: init.headers.Authorization });
    if (chyba) throw new TypeError('fetch failed');
    const ok = (json, status = 200) => ({ ok: true, status, json: async () => json });
    if (u.pathname === '/rest/v1/devices' && init.method === 'POST') return ok([{ id: '11111111-2222-4333-8444-555555555555' }], 201);
    if (u.pathname === '/rest/v1/devices' && init.method === 'PATCH') return ok([{ id: '11111111-2222-4333-8444-555555555555' }]);
    if (u.pathname === '/rest/v1/profiles' && init.method === 'GET') return ok([{ sync_enabled: true }]);
    return { ok: true, status: 204, json: async () => { throw new Error('prázdné'); } };
  };
  const datastore = { data: { cloud: { syncEnabled: false, syncAt: 0, devices: {} } }, save() {} };
  const s = createCloudSync({
    config: { ucet: { url: 'https://ucty.example', klic: 'pk' } },
    ucet: { pristup: async () => 'pristup-1', uzivatelId: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    datastore,
    verze: '0.25.0',
    now: () => NYNI,
    fetchImpl,
    zdroje: { sessions: () => relace, utrata: () => utrataPoMesicich(zaznamy, { mesice: ['2026-09'], prevod, mena: 'CZK' }), limity: () => [], konektory: () => [{ id: 'claude-code', state: 'connected', lastEventAt: NYNI }] },
  });
  return { s, volani, datastore };
}

test('bez zapnutí se nic neposílá; po zapnutí se založí zařízení a odejdou jen povolené řádky', async () => {
  const { s, volani, datastore } = atrapa();
  await s.synchronizuj();
  assert.equal(volani.length, 0, 'synchronizace je opt-in');

  await s.nastav(true);
  assert.deepEqual(volani[0], { method: 'PATCH', cesta: '/rest/v1/profiles', query: { id: 'eq.aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }, body: { sync_enabled: true }, prefer: 'return=minimal', auth: 'Bearer pristup-1' });
  const zarizeni = volani.find((v) => v.cesta === '/rest/v1/devices');
  assert.deepEqual(Object.keys(zarizeni.body).sort(), ['app_version', 'last_seen_at', 'name', 'platform']);
  const zapisy = volani.filter((v) => v.method === 'POST' && v.cesta !== '/rest/v1/devices');
  assert.deepEqual(zapisy.map((v) => v.cesta).sort(), ['/rest/v1/agent_status', '/rest/v1/connections', '/rest/v1/spend_monthly', '/rest/v1/usage_daily']);
  for (const v of zapisy) {
    const tabulka = v.cesta.split('/').pop();
    assert.equal(v.prefer, 'resolution=merge-duplicates,return=minimal');
    assert.ok(v.query.on_conflict.startsWith('device_id'));
    for (const radek of v.body) {
      for (const k of Object.keys(radek)) assert.ok(POVOLENA[tabulka].includes(k), `${tabulka}.${k} není povolené`);
      assert.equal(radek.device_id, '11111111-2222-4333-8444-555555555555');
    }
  }
  const vse = JSON.stringify(volani);
  for (const tajne of ['Tajn', 'Sokol', 'Heslo', '/Users/', 'kredity', 'konverzace 1f2e']) assert.equal(vse.includes(tajne), false, `do cloudu nesmí „${tajne}“`);
  assert.equal(s.status().zapnuto, true);
  assert.equal(s.status().posledni, NYNI);
  assert.equal(datastore.data.cloud.devices['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'], '11111111-2222-4333-8444-555555555555');

  // Podruhé se zařízení jen obnoví, nové nevznikne.
  const pred = volani.length;
  await s.synchronizuj();
  const dalsi = volani.slice(pred).filter((v) => v.cesta === '/rest/v1/devices');
  assert.deepEqual(dalsi.map((v) => v.method), ['PATCH']);
});

test('vypnutí smaže souhrny z účtu (všech tabulek, jen vlastní), zařízení zůstane', async () => {
  const { s, volani } = atrapa();
  await s.nastav(true);
  const pred = volani.length;
  await s.nastav(false);
  const mazani = volani.slice(pred).filter((v) => v.method === 'DELETE');
  assert.deepEqual(mazani.map((v) => v.cesta).sort(), ['/rest/v1/agent_status', '/rest/v1/connections', '/rest/v1/limits', '/rest/v1/spend_monthly', '/rest/v1/usage_daily']);
  assert.ok(mazani.every((v) => v.query.user_id === 'eq.aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'));
  assert.equal(s.status().zapnuto, false);
  assert.equal(s.status().posledni, 0);
});

test('výpadek sítě: chyba se ukáže, volba zůstane a příště se to zkusí znovu', async () => {
  const { s } = atrapa({ chyba: true });
  await assert.rejects(s.nastav(true), /neodpovídá/);
  const r = atrapa();
  await r.s.nastav(true);
  r.volani.length = 0;
  const vypadek = createCloudSync({ config: { ucet: { url: 'https://ucty.example', klic: 'pk' } }, ucet: { pristup: async () => 't', uzivatelId: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }, datastore: { data: { cloud: { syncEnabled: true, syncAt: 5, devices: {} } }, save() {} }, fetchImpl: async () => { throw new TypeError('fetch failed'); }, zdroje: { sessions: () => [], utrata: () => [], limity: () => [], konektory: () => [] } });
  const st = await vypadek.synchronizuj();
  assert.equal(st.zapnuto, true);
  assert.equal(st.posledni, 5, 'čas poslední úspěšné synchronizace se nepřepíše neúspěchem');
  assert.match(st.chyba, /neodpovídá/);
});

test('HTTP: synchronizace chce přihlášení, náhled i volba jen z tohoto Macu', async () => {
  const srv = await startTestServer();
  try {
    const klient = api(srv.url);
    const bez = await klient.send('POST', '/api/ucet/synchronizace', { zapnuto: true });
    assert.equal(bez.status, 401);
    assert.equal((await klient.send('POST', '/api/ucet/synchronizace', {})).status, 422);
    const nahled = await klient.get('/api/ucet/nahled');
    assert.equal(nahled.status, 200);
    assert.deepEqual(Object.keys(nahled.body.nahled).sort(), ['agent_status', 'connections', 'limits', 'spend_monthly', 'usage_daily']);
    const zTelefonu = await fetch(`${srv.url}/api/ucet/nahled`, { headers: { 'X-Forwarded-For': '100.64.0.2' } });
    assert.equal(zTelefonu.status, 403);
    assert.equal((await klient.get('/api/state')).body.ucet.sync.zapnuto, false);
  } finally {
    await srv.close();
  }
});
