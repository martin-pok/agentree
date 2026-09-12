import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import { createLanAccess, lanAddresses, isLoopback, cookieValue, COOKIE } from '../src/lan.js';
import { loadConfig } from '../src/config.js';
import { startTestServer, api, tempDir } from './helpers.mjs';

const fakeDatastore = () => {
  const data = { settings: { lanAccess: false }, lanDevices: [] };
  return { data, save() {}, async flush() {} };
};

test('přístup z telefonu: rozpoznání vlastního Macu', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.0.53']) assert.equal(isLoopback(a), true, a);
  for (const a of ['192.168.1.20', '10.0.0.5', '8.8.8.8', '', null]) assert.equal(isLoopback(a), false, String(a));
});

test('přístup z telefonu: nabízí jen adresy z privátní sítě, veřejné nikdy', () => {
  const rozhrani = {
    lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    en0: [{ family: 'IPv4', address: '192.168.1.20', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
    en1: [{ family: 'IPv4', address: '10.1.2.3', internal: false }],
    tun0: [{ family: 'IPv4', address: '89.24.55.10', internal: false }],
    docker: [{ family: 'IPv4', address: '172.17.0.1', internal: false }],
  };
  assert.deepEqual(lanAddresses(rozhrani), ['192.168.1.20', '10.1.2.3', '172.17.0.1'], 'veřejná 89.24.55.10 se nenabídne');
});

test('přístup z telefonu: čtení cookie', () => {
  assert.equal(cookieValue(`a=1; ${COOKIE}=abc.def; b=2`), 'abc.def');
  assert.equal(cookieValue('jine=1'), '');
  assert.equal(cookieValue(undefined), '');
});

test('párování: kód platí jen jednou, chybný pokus se počítá a po pěti se zruší', async () => {
  const datastore = fakeDatastore();
  const lan = createLanAccess({ datastore, config: loadConfig({ PORT: '0', AGENTREE_HOME: '/tmp/x', AGENTREE_SOURCE_HOME: '/tmp/x' }) });

  assert.equal((await lan.pair('123456')).status, 403, 'vypnutý přístup nepáruje');
  datastore.data.settings.lanAccess = true;
  assert.equal((await lan.pair('123456')).status, 410, 'bez vytvořeného kódu není co spárovat');

  const { code } = lan.newPin();
  assert.match(code, /^\d{6}$/);
  assert.equal((await lan.pair('000000')).status, 401, 'chybný kód neprojde');

  const ok = await lan.pair(code, 'iPhone Martin');
  assert.ok(ok.token && ok.token.length >= 40, 'token se vrátí jen jednou');
  assert.equal(ok.device.label, 'iPhone Martin');
  assert.equal(datastore.data.lanDevices.length, 1);
  assert.equal(datastore.data.lanDevices[0].hash.length, 64, 'v datech je jen hash');
  assert.equal(JSON.stringify(datastore.data).includes(ok.token), false, 'použitelný token se nikdy neukládá');

  assert.equal(lan.tokenOk(ok.token), true);
  assert.equal(lan.tokenOk(`${ok.token}x`), false);
  assert.equal(lan.tokenOk(''), false);
  assert.equal((await lan.pair(code)).status, 410, 'tentýž kód podruhé neprojde');

  const p2 = lan.newPin();
  for (let i = 0; i < 5; i++) await lan.pair('999999');
  assert.equal((await lan.pair(p2.code)).status, 429, 'po pěti pokusech se kód zneplatní');
});

test('párování: odpárování zařízení zneplatní jeho token', async () => {
  const datastore = fakeDatastore();
  datastore.data.settings.lanAccess = true;
  const lan = createLanAccess({ datastore, config: loadConfig({ PORT: '0', AGENTREE_HOME: '/tmp/x', AGENTREE_SOURCE_HOME: '/tmp/x' }) });
  const { code } = lan.newPin();
  const { token, device } = await lan.pair(code, 'Telefon');
  assert.equal(lan.tokenOk(token), true);
  assert.equal((await lan.revoke('neexistuje')).status, 404);
  assert.deepEqual(await lan.revoke(device.id), { ok: true });
  assert.equal(lan.tokenOk(token), false, 'po odpárování token neplatí');
});

test('HTTP: z místní sítě se bez spárování nedá načíst nic, zapnout to jde jen z Macu', async (t) => {
  const dataHome = await tempDir('agentree-data-');
  const s = await startTestServer({ AGENTREE_HOME: dataHome });
  t.after(() => s.close());

  // Skutečný požadavek z místní sítě: spojení jde na síťovou adresu tohoto Macu, takže server
  // vidí jako protistranu tu adresu, ne 127.0.0.1. Jinak by test nic nedokazoval.
  const lanIp = lanAddresses(os.networkInterfaces())[0];
  const port = Number(new URL(s.url).port);
  const zLan = (cesta, { method = 'GET', headers = {}, body } = {}, host = lanIp) => new Promise((resolve, reject) => {
    const req = http.request({ host: lanIp, port, path: cesta, method, headers: { Host: `${host}:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data, cookie: res.headers['set-cookie'] }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });

  if (!lanIp) return; // Mac bez místní sítě — test nemá co ověřit

  // 1) Dokud je přístup vypnutý, na místní síti vůbec nikdo neposlouchá.
  await assert.rejects(() => zLan('/api/state'), /ECONNREFUSED/, 'vypnuto = žádný listener pro síť');

  // 2) Zapnout to lze jen z tohoto Macu.
  const stav = await api(s.url).send('POST', '/api/lan/enable', {});
  assert.equal(stav.status, 200, stav.body?.error);
  assert.equal(stav.body.lan.enabled, true);

  // 3) Se zapnutým přístupem a bez tokenu: 401, ať se ptá na cokoli.
  for (const cesta of ['/api/state', '/api/skills', '/api/usage/claude']) {
    const r = await zLan(cesta);
    assert.equal(r.status, 401, `${cesta} musí bez spárování vrátit 401`);
  }
  assert.equal((await zLan('/api/lan/pin', { method: 'POST', headers: { 'X-Agentree': '1' } })).status, 401, 'bez tokenu se z telefonu nedá ani vytvořit kód');

  // 4) Párování: chybný kód neprojde, správný vrátí cookie a otevře data.
  const { pin } = (await api(s.url).send('POST', '/api/lan/pin', {})).body;
  assert.match(pin.code, /^\d{6}$/);
  const spatne = await zLan('/api/lan/pair', { method: 'POST', headers: { 'X-Agentree': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '000000' }) });
  assert.equal(spatne.status, 401);

  const dobre = await zLan('/api/lan/pair', { method: 'POST', headers: { 'X-Agentree': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: pin.code, label: 'iPhone' }) });
  assert.equal(dobre.status, 200, dobre.body);
  const dobreTelo = JSON.parse(dobre.body);
  const cookie = String(dobre.cookie?.[0] || '');
  assert.match(cookie, /HttpOnly/, 'token nesmí být čitelný z JavaScriptu');
  assert.match(cookie, /SameSite=Lax/, 'Lax, aby spárovaný telefon nežádal kód po otevření odkazu z jiné aplikace');
  const token = cookie.split(';')[0];

  const sTokenem = await zLan('/api/state', { headers: { Cookie: token } });
  assert.equal(sTokenem.status, 200, 'spárovaný telefon už data dostane');
  assert.equal(JSON.parse(sTokenem.body).lan.enabled, true);

  // 5) Ani spárovaný telefon nesmí párovat další zařízení, zapínat přístup, nic odpárovat
  //    — a nesmí se dozvědět kód ani seznam zařízení.
  const sCookie = { headers: { Cookie: token, 'X-Agentree': '1' }, method: 'POST' };
  assert.equal((await zLan('/api/lan/pin', sCookie)).status, 403, 'kód smí vytvořit jen Mac');
  assert.equal((await zLan('/api/lan/enable', sCookie)).status, 403, 'zapínat smí jen Mac');
  assert.equal((await zLan(`/api/lan/devices/${dobreTelo.device.id}`, { ...sCookie, method: 'DELETE' })).status, 403, 'odpárovat smí jen Mac');
  const lanZTelefonu = JSON.parse((await zLan('/api/lan', { headers: { Cookie: token } })).body);
  assert.equal(lanZTelefonu.pin, null);
  assert.deepEqual(lanZTelefonu.devices, []);
  // Totéž platí pro /api/state — i to je cesta, kudy by se seznam zařízení mohl vynést.
  const stavZTelefonu = JSON.parse((await zLan('/api/state', { headers: { Cookie: token } })).body);
  assert.deepEqual(stavZTelefonu.lan.devices, [], 'telefon nesmí vidět ostatní spárovaná zařízení');
  assert.equal(stavZTelefonu.lan.pin, null);
  assert.equal(JSON.parse((await api(s.url).get('/api/state')).body.lan ? '1' : '0'), 1);
  assert.equal((await api(s.url).get('/api/state')).body.lan.devices.length >= 1, true, 'na Macu se seznam zařízení zobrazuje');

  // 6) Vypnutí zavře listener a odpáruje všechna zařízení — token po vypnutí neplatí.
  await api(s.url).send('POST', '/api/lan/disable', {});
  assert.deepEqual(s.app.datastore.data.lanDevices, [], 'vypnutím zmizí i tokeny');
  assert.equal(s.app.lan.tokenOk(token.split('=')[1]), false, 'token po vypnutí neplatí');
  await assert.rejects(() => zLan('/api/state', { headers: { Cookie: token } }), /ECONNREFUSED/, 'po vypnutí na síti nikdo neposlouchá');
  assert.equal((await api(s.url).get('/api/state')).status, 200, 'na Macu funguje Agentree dál bez omezení');
});
