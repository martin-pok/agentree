import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { povolenyEndpoint, vytvorVapid, vapidHlavicka, zasifruj, posli } from '../src/webpush.js';
import { normalizePush, PUSH_ODBERY_MAX } from '../src/datastore.js';
import { createPush } from '../src/push.js';
import { AlertEngine } from '../src/alerts.js';
import { remoteScope } from '../src/remote-scope.js';
import { fakeDatastore, startTestServer, api, tempDir } from './helpers.mjs';

// RFC 8291, příloha A: celá zpráva včetně hlavičky aes128gcm musí sedět bajt po bajtu.
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  hlavicka: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  sifra: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

const ODBER = (endpoint = 'https://web.push.apple.com/QGuQyavXutnMH', p256dh = RFC.p256dh) => ({ endpoint, keys: { p256dh, auth: RFC.auth } });

test('Web Push: šifrování odpovídá testovacímu vektoru RFC 8291', () => {
  const vystup = zasifruj(Buffer.from(RFC.plaintext, 'base64url'), RFC, { asPrivate: RFC.asPrivate, salt: RFC.salt });
  const cekane = Buffer.concat([Buffer.from(RFC.hlavicka, 'base64url'), Buffer.from(RFC.sifra, 'base64url')]);
  assert.equal(vystup.toString('base64url'), cekane.toString('base64url'));
});

test('Web Push: telefon zprávu rozšifruje (náhodná sůl i klíč odesílatele)', () => {
  // Druhá strana podle RFC 8291: přijímací klíč telefonu a jeho tajemství auth.
  const telefon = crypto.createECDH('prime256v1');
  telefon.generateKeys();
  const auth = crypto.randomBytes(16);
  const zprava = JSON.stringify({ title: 'Čeká na tebe', body: 'Agent potřebuje povolení', route: '#/agent/x' });
  const data = zasifruj(zprava, { p256dh: telefon.getPublicKey().toString('base64url'), auth: auth.toString('base64url') });
  const salt = data.subarray(0, 16);
  assert.equal(data.readUInt32BE(16), 4096);
  const idlen = data[20];
  const asPublic = data.subarray(21, 21 + idlen);
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const ecdh = telefon.computeSecret(asPublic);
  const ikm = hmac(hmac(auth, ecdh), Buffer.concat([Buffer.from('WebPush: info\0'), telefon.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const telo = data.subarray(21 + idlen);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(telo.subarray(-16));
  const otevreno = Buffer.concat([d.update(telo.subarray(0, -16)), d.final()]);
  assert.equal(otevreno.at(-1), 2, 'oddělovač poslední části');
  assert.equal(otevreno.subarray(0, -1).toString(), zprava);
});

test('Web Push: hlavička VAPID je platný JWT ES256 pro původ push služby', () => {
  const vapid = vytvorVapid();
  assert.equal(Buffer.from(vapid.publicKey, 'base64url').length, 65);
  const ted = Date.UTC(2026, 9, 8, 12);
  const h = vapidHlavicka('https://fcm.googleapis.com/fcm/send/abc', vapid, { ted });
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h);
  assert.equal(k, vapid.publicKey);
  const [hlava, telo, podpis] = jwt.split('.');
  const obsah = JSON.parse(Buffer.from(telo, 'base64url'));
  assert.equal(obsah.aud, 'https://fcm.googleapis.com');
  assert.equal(obsah.exp, Math.floor(ted / 1000) + 12 * 3600);
  assert.equal(JSON.parse(Buffer.from(hlava, 'base64url')).alg, 'ES256');
  const verejny = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: vapid.privateJwk.x, y: vapid.privateJwk.y }, format: 'jwk' });
  assert.equal(crypto.verify('sha256', Buffer.from(`${hlava}.${telo}`), { key: verejny, dsaEncoding: 'ieee-p1363' }, Buffer.from(podpis, 'base64url')), true);
});

test('Web Push: Mac posílá jen na známé push služby přes HTTPS', () => {
  for (const ok of ['https://web.push.apple.com/x', 'https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) {
    assert.equal(povolenyEndpoint(ok), true, ok);
  }
  for (const ne of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://evil.com/fcm.googleapis.com', 'https://push.apple.com.evil.com/x', 'https://192.168.1.1/x', 'https://127.0.0.1/x', 'javascript:alert(1)', '']) {
    assert.equal(povolenyEndpoint(ne), false, ne);
  }
});

test('Web Push: odeslání nese správné hlavičky; 410 znamená zapomenout odběr', async () => {
  const vapid = vytvorVapid();
  let zachyceno = null;
  const ok = await posli(ODBER(), { title: 'x' }, vapid, { odeslat: async (url, h, telo) => { zachyceno = { url, h, telo }; return 201; } });
  assert.deepEqual(ok, { ok: true, status: 201, zrusit: false });
  assert.equal(zachyceno.h['Content-Encoding'], 'aes128gcm');
  assert.equal(zachyceno.h.TTL, '3600');
  assert.match(zachyceno.h.Authorization, /^vapid t=.+, k=/);
  assert.equal(Number(zachyceno.h['Content-Length']), zachyceno.telo.length);
  assert.equal((await posli(ODBER(), {}, vapid, { odeslat: async () => 410 })).zrusit, true);
  assert.equal((await posli(ODBER(), {}, vapid, { odeslat: async () => 500 })).zrusit, false);
  const sit = await posli(ODBER(), {}, vapid, { odeslat: async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); } });
  assert.deepEqual(sit, { ok: false, status: 0, zrusit: false, chyba: 'ENOTFOUND' });
  let volano = false;
  const cizi = await posli(ODBER('https://192.168.1.10/push'), {}, vapid, { odeslat: async () => { volano = true; return 201; } });
  assert.equal(cizi.zrusit, true);
  assert.equal(volano, false, 'na adresu mimo seznam se nic neposílá');
});

test('data: odběry a klíč VAPID projdou kontrolou, rozbité se zahodí', () => {
  const vapid = vytvorVapid();
  const dobry = { id: 'abcdef12-3456', ...ODBER(), nazev: 'iPhone', zarizeni: 'd1', vytvoreno: 1 };
  const r = normalizePush({ vapid, odbery: [dobry, { ...dobry, id: 'x' }, { ...dobry, id: 'abcdefgh', keys: { p256dh: 'kratky', auth: RFC.auth } }, null] });
  assert.equal(r.vapid.publicKey, vapid.publicKey);
  assert.deepEqual(r.odbery.map((o) => o.id), ['abcdef12-3456']);
  assert.deepEqual(normalizePush(undefined), { vapid: null, odbery: [] });
  assert.equal(normalizePush({ vapid: { publicKey: 'x', privateJwk: {} } }).vapid, null);
  const mnoho = Array.from({ length: PUSH_ODBERY_MAX + 5 }, (_, i) => ({ ...dobry, id: `odber-${String(i).padStart(4, '0')}` }));
  assert.equal(normalizePush({ odbery: mnoho }).odbery.length, PUSH_ODBERY_MAX);
});

function pushDatastore() {
  const ds = fakeDatastore();
  ds.data.push = { vapid: null, odbery: [] };
  ds.save = () => {};
  return ds;
}

test('odběry: zapíná jen spárovaný telefon, stejná adresa se nezdvojí, odpárování odběr zruší', async () => {
  const ds = pushDatastore();
  let parovane = new Set(['tel-1', 'tel-2']);
  const odeslane = [];
  const push = createPush({ datastore: ds, zarizeni: () => parovane, odeslat: async (o, z) => { odeslane.push([o.zarizeni, z.title]); return { ok: true, status: 201 }; } });

  assert.equal(push.prihlas({ subscription: ODBER() }).status, 403, 'bez zařízení ne');
  assert.equal(push.prihlas({ subscription: ODBER('https://evil.example/x'), zarizeni: 'tel-1' }).status, 422);
  assert.equal(push.prihlas({ subscription: { endpoint: ODBER().endpoint, keys: { p256dh: 'x', auth: 'y' } }, zarizeni: 'tel-1' }).status, 422);

  const a = push.prihlas({ subscription: ODBER(), nazev: 'iPhone', zarizeni: 'tel-1' });
  const znovu = push.prihlas({ subscription: ODBER(), nazev: 'iPhone', zarizeni: 'tel-1' });
  assert.equal(a.odber.id, znovu.odber.id, 'stejná adresa = stejný odběr');
  push.prihlas({ subscription: ODBER('https://fcm.googleapis.com/fcm/send/b'), nazev: 'Pixel', zarizeni: 'tel-2' });

  const stav = push.stav();
  assert.equal(stav.odbery.length, 2);
  assert.equal(stav.odbery[0].endpoint, undefined, 'adresa ani klíče odběru ven nejdou');
  assert.equal(stav.odbery[0].keys, undefined);
  assert.deepEqual(push.stav({ zarizeni: 'tel-2' }).odbery.map((o) => o.nazev), ['Pixel'], 'telefon vidí jen svůj odběr');

  assert.deepEqual(await push.posliVsem({ title: 'Ahoj' }), { odeslano: 2, chyby: 0 });
  assert.ok(ds.data.push.odbery.every((o) => o.naposledyOk > 0));
  assert.deepEqual(await push.posliVsem({ title: 'Jen 1' }, { zarizeni: 'tel-1' }), { odeslano: 1, chyby: 0 });
  assert.deepEqual(odeslane.at(-1), ['tel-1', 'Jen 1']);

  // Cizí telefon odběr nezruší; vlastní ano.
  assert.equal(push.odhlas({ endpoint: ODBER().endpoint, zarizeni: 'tel-2' }).status, 404);
  assert.deepEqual(push.odhlas({ endpoint: ODBER().endpoint, zarizeni: 'tel-1' }), { ok: true });

  parovane = new Set();
  assert.deepEqual(push.stav().odbery, [], 'odpárovaný telefon nemá odběr');
});

test('odběry: push služba, která odběr nezná (410), ho smaže; jiná chyba se zapíše', async () => {
  const ds = pushDatastore();
  const odpoved = { 'tel-1': { ok: false, status: 410, zrusit: true }, 'tel-2': { ok: false, status: 503, zrusit: false } };
  const push = createPush({ datastore: ds, zarizeni: () => new Set(['tel-1', 'tel-2']), odeslat: async (o) => odpoved[o.zarizeni] });
  push.prihlas({ subscription: ODBER(), zarizeni: 'tel-1' });
  push.prihlas({ subscription: ODBER('https://fcm.googleapis.com/fcm/send/b'), zarizeni: 'tel-2' });
  assert.deepEqual(await push.posliVsem({ title: 'x' }), { odeslano: 0, chyby: 2 });
  assert.deepEqual(ds.data.push.odbery.map((o) => [o.zarizeni, o.chyba]), [['tel-2', 'HTTP 503']], 'selhání se nehlásí jako doručené');
});

test('upozornění: na telefon jde totéž co do systému, ztlumené ne', () => {
  const ds = fakeDatastore({ quietHours: false });
  ds.data.settings.language = 'cs';
  ds.pushAlert = (a) => ds.data.alerts.unshift(a);
  ds.save = () => {};
  const store = { emit() {} };
  const alerts = new AlertEngine({ store, datastore: ds, notifier: { native: async () => {} } });
  const telefon = [];
  alerts.doTelefonu = (z) => { telefon.push(z); return Promise.resolve(); };
  alerts.raise({ key: 'a', level: 'action', kind: 'needs_input', title: 'Čeká na tebe', body: 'Povolit zápis', sessionId: 'claude-code:abc' });
  assert.deepEqual(telefon[0], { title: 'Čeká na tebe', body: 'Povolit zápis', route: '#/agent/claude-code%3Aabc', tag: 'needs_input', id: telefon[0].id });
  alerts.raise({ key: 'b', level: 'info', kind: 'detekce', title: 'x', bezNativniho: true });
  assert.equal(telefon.length, 1, 'bez vlastního oznámení ani na telefon');
  ds.data.settings.notifications.quietHours = true;
  ds.data.settings.notifications.quietFrom = '00:00';
  ds.data.settings.notifications.quietTo = '23:59';
  alerts.raise({ key: 'c', level: 'action', kind: 'needs_input', title: 'y' });
  assert.equal(telefon.length, 1, 'noční ticho platí i pro telefon');
});

test('telefon smí zapnout, vyzkoušet a zrušit jen upozornění na sebe', () => {
  for (const p of ['/api/push/subscribe', '/api/push/unsubscribe', '/api/push/test']) assert.equal(remoteScope('POST', p).ok, true, p);
  assert.equal(remoteScope('GET', '/api/push').ok, true);
  assert.equal(remoteScope('DELETE', '/api/push/abc').ok, false);
});

test('HTTP: odběr zapíná spárovaný telefon (přes tailscale serve), Mac ho vidí a zruší', async (t) => {
  const s = await startTestServer({ AGENTEEQ_HOME: await tempDir('agenteeq-data-') });
  t.after(() => s.close());
  // Telefon za `tailscale serve`: spojení přijde po smyčce od proxy na tomhle Macu, s hlavičkami
  // proxy. Server ho podle zTohotoMacu() bere jako cizí zařízení – přesně jako skutečný telefon.
  s.app.datastore.data.settings.tailscaleAccess = true;
  const port = Number(new URL(s.url).port);
  const zTelefonu = (cesta, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: cesta, method, headers: { Host: `127.0.0.1:${port}`, 'X-Forwarded-For': '100.101.102.103', 'X-Forwarded-Proto': 'https', ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null, cookie: res.headers['set-cookie'] }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  const { pin } = (await api(s.url).send('POST', '/api/lan/pin', {})).body;
  const par = await zTelefonu('/api/lan/pair', { method: 'POST', headers: { 'X-Agenteeq': '1', 'Content-Type': 'application/json' }, body: { pin: pin.code, label: 'iPhone' } });
  assert.equal(par.status, 200, JSON.stringify(par.body));
  const cookie = String(par.cookie?.[0] || '').split(';')[0];
  const telefon = { 'X-Agenteeq': '1', 'Content-Type': 'application/json', Cookie: cookie };

  const mac = await api(s.url).get('/api/push');
  assert.equal(Buffer.from(mac.body.publicKey, 'base64url').length, 65, 'Mac má klíč VAPID');
  assert.equal((await api(s.url).send('POST', '/api/push/subscribe', { subscription: ODBER() })).status, 409, 'Mac si odběr nezapíná – má oznámení systému');

  assert.equal((await zTelefonu('/api/push/subscribe', { method: 'POST', headers: { ...telefon, Cookie: '' }, body: { subscription: ODBER() } })).status, 401);
  assert.equal((await zTelefonu('/api/push/subscribe', { method: 'POST', headers: telefon, body: { subscription: ODBER('https://10.0.0.1/x') } })).status, 422);
  const prihlas = await zTelefonu('/api/push/subscribe', { method: 'POST', headers: telefon, body: { subscription: ODBER() } });
  assert.equal(prihlas.status, 200, JSON.stringify(prihlas.body));
  assert.equal(prihlas.body.odber.nazev, 'iPhone', 'odběr nese jméno spárovaného telefonu');

  assert.equal((await zTelefonu('/api/push', { headers: { Cookie: cookie } })).body.odbery.length, 1);
  const naMacu = (await api(s.url).get('/api/push')).body;
  assert.equal(naMacu.odbery.length, 1);
  assert.equal(JSON.stringify(naMacu).includes('push.apple.com'), false, 'adresa odběru se nikam nevrací');

  const zruseno = await api(s.url).send('POST', '/api/push/unsubscribe', { id: naMacu.odbery[0].id });
  assert.equal(zruseno.status, 200);
  assert.deepEqual(zruseno.body.odbery, []);
  assert.equal((await zTelefonu('/api/push/test', { method: 'POST', headers: telefon, body: {} })).status, 409, 'bez odběru se nic neposílá a neříká se „odesláno“');

  // Odpárování zruší i odběr.
  assert.equal((await zTelefonu('/api/push/subscribe', { method: 'POST', headers: telefon, body: { subscription: ODBER() } })).status, 200);
  const zarizeni = (await api(s.url).get('/api/lan')).body.devices[0].id;
  assert.equal((await api(s.url).send('DELETE', `/api/lan/devices/${zarizeni}`)).status, 200);
  assert.deepEqual((await api(s.url).get('/api/push')).body.odbery, []);
});
