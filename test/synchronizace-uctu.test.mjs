import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSync } from '../src/cloud-sync.js';
import { normalizeData } from '../src/datastore.js';
import { startTestServer, api } from './helpers.mjs';

// Synchronizace souhrnů do účtu: „0 zařízení“ při zapnuté synchronizaci, volba po restartu,
// poctivé „Synchronizovat teď“ a úklid starých řádků (útrata se nesmí počítat dvakrát).
// Vše proti atrapě PostgREST – skutečný server účtů testy nikdy nevolají (AGENTEEQ_UCET_URL=0).

const UZIVATEL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ZARIZENI = '11111111-2222-4333-8444-555555555555';
const NYNI = Date.UTC(2026, 9, 5, 12);

// Atrapa PostgREST. `zarizeniChyba`: jak dlouho založení zařízení selhává (check constraint apod.).
function atrapa({ datastore, zarizeniChyba = null, profil = false, vUctu = {} } = {}) {
  const volani = [];
  const stav = { zarizeniChyba };
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const tabulka = u.pathname.replace('/rest/v1/', '');
    volani.push({ method: init.method, tabulka, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : null });
    const ok = (json, status = 200) => ({ ok: true, status, json: async () => json });
    if (tabulka === 'devices') {
      if (stav.zarizeniChyba) return { ok: false, status: 400, json: async () => ({ message: stav.zarizeniChyba }) };
      return ok([{ id: ZARIZENI }], init.method === 'POST' ? 201 : 200);
    }
    if (tabulka === 'profiles' && init.method === 'GET') return ok([{ sync_enabled: profil }]);
    if (init.method === 'GET') return ok(vUctu[tabulka] || []);
    return { ok: true, status: 204, json: async () => { throw new Error('prázdné'); } };
  };
  const ds = datastore || { data: { cloud: { syncEnabled: false, syncAt: 0, devices: {} } }, save() {} };
  const s = createCloudSync({
    config: { ucet: { url: 'https://ucty.example', klic: 'pk' } },
    ucet: { pristup: async () => 'pristup', uzivatelId: () => UZIVATEL },
    datastore: ds,
    verze: '0.36.3',
    now: () => NYNI,
    fetchImpl,
    zdroje: {
      sessions: () => [],
      mesiceUtraty: () => ['2026-08', '2026-09', '2026-10'],
      utrata: () => [{ month: '2026-10-01', service: 'openai-api', kind: 'api', currency: 'CZK', amount: 230 }],
      limity: () => [{ id: 'claude-code:five_hour', provider: 'anthropic', usedPercent: 40, at: NYNI }],
      konektory: () => [{ id: 'claude-code', state: 'connected', lastEventAt: NYNI }],
    },
  });
  return { s, volani, ds, stav };
}

test('„0 zařízení“: když se počítač nepodaří založit, volba se do účtu nezapíše a chyba je vidět', async () => {
  const { s, volani, ds, stav } = atrapa({ zarizeniChyba: 'new row violates check constraint "devices_app_version_check"' });
  const st = await s.zapnoutPoPrihlaseni();
  assert.equal(st.ok, false);
  assert.equal(volani.some((v) => v.tabulka === 'profiles'), false, 'bez zařízení se „zapnuto“ do účtu nepíše');
  assert.equal(volani.some((v) => ['usage_daily', 'spend_monthly', 'limits', 'agent_status', 'connections'].includes(v.tabulka)), false);
  assert.match(st.chyba, /se nepodařilo přidat do účtu: new row violates check constraint/);
  assert.equal(st.zarizeni, false, 'rozhraní pozná, že počítač v účtu chybí');
  assert.equal(st.zapnuto, true, 'na tomto počítači volba platí');
  assert.equal(ds.data.cloud.volbaCeka, true, 'do účtu se dopíše později');

  // Další běh (časovač, restart) registraci dožene a teprve pak zapíše volbu.
  stav.zarizeniChyba = null;
  volani.length = 0;
  const znovu = await s.synchronizuj();
  assert.equal(znovu.ok, true);
  assert.equal(znovu.chyba, '');
  assert.equal(znovu.zarizeni, true);
  const poradi = volani.map((v) => `${v.method} ${v.tabulka}`);
  assert.ok(poradi.indexOf('POST devices') >= 0 && poradi.indexOf('POST devices') < poradi.indexOf('PATCH profiles'), poradi.join(', '));
  assert.equal(ds.data.cloud.volbaCeka, false);
});

test('přepínač: zapnutí bez založeného zařízení selže celé – účet nezůstane zapnutý s nulou zařízení', async () => {
  const { s, volani } = atrapa({ zarizeniChyba: 'permission denied for table devices' });
  await assert.rejects(s.nastav(true), /se nepodařilo přidat do účtu: permission denied/);
  assert.equal(volani.some((v) => v.tabulka === 'profiles'), false);
  assert.equal(s.status().zapnuto, false);
});

test('restart: zapnutí, které účet ještě nemá, se neztratí a načtení volby z účtu ho nepřepíše', async () => {
  // Uložená data po přihlášení, kdy účet zrovna neodpovídal: projdou normalizací při startu.
  const data = normalizeData({ cloud: { syncEnabled: true, syncAt: 0, volbaCeka: true, devices: {} } });
  assert.equal(data.cloud.volbaCeka, true, 'datastore volbu nečekající na účet nezahodí');
  const ds = { data, save() {} };
  const { s, volani } = atrapa({ datastore: ds, profil: false });
  await s.nactiVolbu();
  assert.equal(s.status().zapnuto, true, 'účet s „vypnuto“ nesmí přepsat volbu, kterou ještě nemá');
  assert.equal(volani.some((v) => v.method === 'GET' && v.tabulka === 'profiles'), false);
  const st = await s.synchronizuj();
  assert.equal(st.ok, true);
  assert.deepEqual(volani.find((v) => v.method === 'PATCH' && v.tabulka === 'profiles').body, { sync_enabled: true });
});

test('úklid: řádky, které by počítač už neposlal, z účtu zmizí – útrata se nesečte dvakrát', async () => {
  const { s, volani } = atrapa({
    datastore: { data: { cloud: { syncEnabled: true, syncAt: 0, devices: { [UZIVATEL]: ZARIZENI } } }, save() {} },
    vUctu: {
      // Stejný měsíc a služba v předchozí měně aplikace (EUR) – web by jinak sečetl obě.
      spend_monthly: [
        { month: '2026-10-01', service: 'openai-api', kind: 'api', currency: 'CZK' },
        { month: '2026-10-01', service: 'openai-api', kind: 'api', currency: 'EUR' },
        { month: '2026-09-01', service: 'anthropic-api', kind: 'api', currency: 'CZK' },
      ],
      limits: [{ provider: 'anthropic', window_key: 'claude-code-five-hour' }, { provider: 'openai', window_key: 'codex-primary' }],
      connections: [{ provider: 'claude-code' }, { provider: 'cursor' }],
    },
  });
  const st = await s.synchronizuj();
  assert.equal(st.ok, true, st.chyba);
  const cteni = volani.find((v) => v.method === 'GET' && v.tabulka === 'spend_monthly');
  assert.equal(cteni.query.device_id, `eq.${ZARIZENI}`, 'čte jen řádky tohoto počítače');
  assert.equal(cteni.query.month, 'gte.2026-08-01', 'jen v měsících, které počítač počítá');
  const smazane = volani.filter((v) => v.method === 'DELETE').map((v) => `${v.tabulka} ${Object.entries(v.query).map(([k, x]) => `${k}=${x}`).join('&')}`);
  assert.deepEqual(smazane.sort(), [
    `connections device_id=eq.${ZARIZENI}&provider=eq.cursor`,
    `limits device_id=eq.${ZARIZENI}&provider=eq.openai&window_key=eq.codex-primary`,
    `spend_monthly device_id=eq.${ZARIZENI}&month=eq.2026-09-01&service=eq.anthropic-api&kind=eq.api&currency=eq.CZK`,
    `spend_monthly device_id=eq.${ZARIZENI}&month=eq.2026-10-01&service=eq.openai-api&kind=eq.api&currency=eq.EUR`,
  ].sort());
  // Zápis proběhl dřív než úklid – web nikdy nezůstane bez aktuálního řádku.
  const iZapis = volani.findIndex((v) => v.method === 'POST' && v.tabulka === 'spend_monthly');
  const iMazani = volani.findIndex((v) => v.method === 'DELETE');
  assert.ok(iZapis < iMazani);
});

test('„Synchronizovat teď“: úspěch jen tehdy, když souhrny opravdu odešly', async () => {
  const vypnuto = atrapa();
  const v = await vypnuto.s.synchronizuj();
  assert.deepEqual([v.ok, v.duvod], [false, 'vypnuto']);

  const chyba = atrapa({ datastore: { data: { cloud: { syncEnabled: true, syncAt: 7, devices: {} } }, save() {} }, zarizeniChyba: 'nope' });
  const c = await chyba.s.synchronizuj();
  assert.equal(c.ok, false);
  assert.equal(c.posledni, 7, 'neúspěch nepřepíše čas poslední úspěšné synchronizace');

  // Bez platného tokenu se nic nepošle – a řekne se to, místo tichého „hotovo“.
  const bezTokenu = createCloudSync({
    config: { ucet: { url: 'https://ucty.example', klic: 'pk' } },
    ucet: { pristup: async () => null, uzivatelId: () => UZIVATEL },
    datastore: { data: { cloud: { syncEnabled: true, syncAt: 0, devices: {} } }, save() {} },
    fetchImpl: async () => { throw new Error('nemá se volat'); },
    zdroje: { sessions: () => [], utrata: () => [], limity: () => [], konektory: () => [] },
  });
  const b = await bezTokenu.synchronizuj();
  assert.equal(b.ok, false);
  assert.match(b.chyba, /nepodařilo ověřit/);

  // HTTP: bez účtu (testy mají AGENTEEQ_UCET_URL=0) endpoint nehlásí úspěch.
  const srv = await startTestServer();
  try {
    const r = await api(srv.url).send('POST', '/api/ucet/synchronizovat', {});
    assert.equal(r.status, 401);
    assert.match(r.body.error, /nic se neposlalo/);
  } finally {
    await srv.close();
  }
});
