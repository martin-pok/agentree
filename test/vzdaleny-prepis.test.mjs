import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestServer, api, waitFor } from './helpers.mjs';
import { pushEntry } from '../src/model.js';
import { remoteScope } from '../src/remote-scope.js';

// Spárované zařízení (telefon přes domácí síť nebo Tailscale, docs/REMOTE.md) vidí souhrny, ne celé
// přepisy konverzací ani výstup agentů. Přepis zůstává jen na hostiteli – v odpovědi, v proudu SSE
// i na samostatné adrese přepisu.

const JMENO = 'mac-mini.tailabcd.ts.net';
const TAJNE = 'Tajný kód klienta Sokol';

function pozadavek(port, cesta, { method = 'GET', headers = {}, body, host = JMENO } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: cesta, method, headers: { Host: host, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data, cookie: res.headers['set-cookie'] }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Proud SSE: vrátí přijatý text a funkci k ukončení.
function proud(port, headers) {
  let text = '';
  const req = http.request({ host: '127.0.0.1', port, path: '/api/stream', headers });
  req.on('response', (res) => res.on('data', (c) => { text += c; }));
  req.on('error', () => {});
  req.end();
  return { text: () => text, zavri: () => req.destroy() };
}

test('telefon: detail konverzace jen se souhrnem, přepis a výstup agenta jen na hostiteli', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const port = Number(new URL(s.url).port);
  // Jako za `tailscale serve`: spojení po smyčce, ale vlastní jméno v MagicDNS (tests/tailscale).
  s.app.datastore.data.settings.tailscaleAccess = true;
  const puvodni = s.app.lan.hosts;
  s.app.lan.hosts = () => [JMENO];
  t.after(() => { s.app.lan.hosts = puvodni; s.app.datastore.data.settings.tailscaleAccess = false; });

  const { store } = s.app;
  const sess = store.ensure({ connector: 'claude-code', localId: 'prepis-1', provider: 'anthropic', app: 'Claude Code' });
  sess.title = 'Úprava webu';
  sess.lastAt = Date.now();
  pushEntry(sess, { at: Date.now(), role: 'user', text: TAJNE });
  store.commit(sess);

  const { pin } = (await api(s.url).send('POST', '/api/lan/pin', {})).body;
  const par = await pozadavek(port, '/api/lan/pair', { method: 'POST', headers: { 'X-Agenteeq': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: pin.code, label: 'iPhone' }) });
  assert.equal(par.status, 200, par.body);
  const cookie = String(par.cookie?.[0] || '').split(';')[0];

  // Hostitel vidí přepis celý.
  const doma = await api(s.url).get('/api/sessions/claude-code%3Aprepis-1');
  assert.equal(doma.status, 200);
  assert.ok(JSON.stringify(doma.body.transcript).includes(TAJNE));

  // Telefon: souhrn ano (stav, název), přepis ne.
  const telefon = await pozadavek(port, '/api/sessions/claude-code%3Aprepis-1', { headers: { Cookie: cookie } });
  assert.equal(telefon.status, 200, telefon.body);
  const telo = JSON.parse(telefon.body);
  assert.equal(telo.session.title, 'Úprava webu');
  assert.deepEqual(telo.transcript, []);
  assert.equal(telo.prepisJenNaHostiteli, true);
  assert.equal(telefon.body.includes(TAJNE), false);

  const prepis = await pozadavek(port, '/api/sessions/claude-code%3Aprepis-1/transcript', { headers: { Cookie: cookie } });
  assert.equal(prepis.status, 403);
  assert.equal(prepis.body.includes(TAJNE), false);
  assert.equal((await pozadavek(port, '/api/runs/x/log', { headers: { Cookie: cookie } })).status, 403);

  // Proud: hostitel dostane událost s textem přepisu, telefon ne (souhrn konverzace ano).
  const mac = proud(port, { Host: `127.0.0.1:${port}` });
  const tel = proud(port, { Host: JMENO, Cookie: cookie });
  t.after(() => { mac.zavri(); tel.zavri(); });
  await waitFor(() => mac.text().includes('event: hello') && tel.text().includes('event: hello'));
  pushEntry(sess, { at: Date.now() + 1, role: 'assistant', text: `${TAJNE} – odpověď` });
  store.commit(sess);
  await waitFor(() => mac.text().includes('event: transcript'));
  await waitFor(() => tel.text().includes('event: session'));
  assert.ok(mac.text().includes('odpověď'));
  assert.equal(tel.text().includes('event: transcript'), false, 'telefon nedostane událost přepisu');
  assert.equal(tel.text().includes(TAJNE), false, 'text přepisu do telefonu neodejde');
});

test('rozsah telefonu: přepis a výstup agenta ne, souhrny ano', () => {
  assert.equal(remoteScope('GET', '/api/sessions/abc/transcript').ok, false);
  assert.equal(remoteScope('GET', '/api/runs/abc/log').ok, false);
  for (const p of ['/api/state', '/api/sessions/abc', '/api/stream']) assert.equal(remoteScope('GET', p).ok, true, p);
});
