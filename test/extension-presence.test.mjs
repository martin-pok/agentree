import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, api, waitFor, pairExtension } from './helpers.mjs';
import { normalizeData } from '../src/datastore.js';

// Aplikace musí o rozšíření říkat pravdu. Dřív „věděla“ o rozšíření jen z konverzací poslaných
// za posledních pár minut a jen v paměti – po restartu ukazovala „nenainstalováno“, i když bylo
// spárované, a nesliboval se vklad zadání, který by přitom fungoval.

const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

test('stav rozšíření: nespárováno, spárováno, ozvalo se, zastaralá verze', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  // Token vydá až spárování; výchozí hlavičky se skládají při každém volání.
  let token = null;
  const stav = async () => (await a.get('/api/state')).body.integrations.extension;
  const hello = (body, headers = { 'X-Agenteeq-Token': token, Origin: ORIGIN }) => a.send('POST', '/api/extension/hello', body, headers);

  await t.test('bez spárování je rozšíření „missing“ a vklad zadání se neslibuje', async () => {
    const e = await stav();
    assert.equal(e.state, 'missing');
    assert.equal(e.pairedAt, 0);
    const r = await a.send('POST', '/api/launch', { agent: 'gemini', mode: 'web', prompt: 'x' });
    assert.equal(r.body.autofill, false);
  });

  await t.test('ohlášení bez tokenu neprojde a nic nezmění', async () => {
    assert.equal((await hello({ version: '9.9.9' }, {})).status, 401);
    assert.equal((await stav()).state, 'missing');
  });

  await t.test('po spárování je rozšíření připravené a vklad zadání se slibuje', async () => {
    const code = (await a.send('POST', '/api/extension/pair-code', {})).body.code;
    const res = await fetch(`${srv.url}/api/extension/pair`, { method: 'POST', headers: { Origin: ORIGIN, 'X-Agenteeq-Pair-Code': code } });
    assert.equal(res.status, 200);
    token = (await res.json()).token;
    const e = await stav();
    assert.equal(e.state, 'ready');
    assert.ok(e.pairedAt > 0 && e.seenAt > 0);
    const r = await a.send('POST', '/api/launch', { agent: 'gemini', mode: 'web', prompt: 'x' });
    assert.equal(r.body.autofill, true);
  });

  await t.test('ohlášení uloží verzi; jiná verze než aplikace = „obnov rozšíření“', async () => {
    const r = await hello({ version: '0.0.1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.version, '0.0.1');
    assert.equal(r.body.outdated, true);
    const verze = (await a.get('/api/health')).body.version;
    const ok = await hello({ version: verze });
    assert.equal(ok.body.outdated, false);
    assert.equal(ok.body.expectedVersion, verze);
  });

  await t.test('nesmyslná verze se ignoruje, stará zůstane', async () => {
    const verze = (await a.get('/api/health')).body.version;
    const r = await hello({ version: '<script>' });
    assert.equal(r.body.version, verze);
  });

  await t.test('spárování i verze se ukládají na disk – přežijí restart', async () => {
    // Datastore zapisuje se zpožděním (debounce 300 ms v src/datastore.js). Čekat pevnou
    // dobu je závod: na vytíženém stroji se zápis nestihne a test spadne na tom, že soubor
    // ještě nemá verzi – přesně tak padal běh na macOS runneru. Čeká se proto na stav,
    // ne na čas; co se ověřuje, zůstává stejné.
    const data = await waitFor(async () => {
      const d = JSON.parse(await fs.readFile(path.join(srv.dataHome, 'data.json'), 'utf8'));
      return d.extension?.pairedAt > 0 && /^\d+\.\d+\.\d+$/.test(d.extension.version || '') ? d : null;
    });
    assert.ok(data.extension.pairedAt > 0);
    assert.match(data.extension.version, /^\d+\.\d+\.\d+$/);
  });

  await t.test('webový zdroj spárovaného rozšíření bez konverzace není „nenalezeno“', async () => {
    const web = (await a.get('/api/state')).body.connectors.find((c) => c.id === 'web');
    assert.equal(web.state, 'idle');
    assert.match(web.detail, /připojené/);
  });

  await t.test('poslední viděná verze se ukládá jen ve správném tvaru', async () => {
    assert.equal((await a.send('PUT', '/api/settings', { lastSeenVersion: 'nesmysl' })).status, 422);
    const r = await a.send('PUT', '/api/settings', { lastSeenVersion: '0.11.0' });
    assert.equal(r.status, 200);
    assert.equal(r.body.settings.lastSeenVersion, '0.11.0');
  });
});

test('načtení dat: záznam o rozšíření se očistí', () => {
  const d = normalizeData({ extension: { pairedAt: 'x', seenAt: -5, version: '1.2' }, settings: { lastSeenVersion: 42 } });
  assert.deepEqual(d.extension, { pairedAt: 0, seenAt: 0, version: '' });
  assert.equal(d.settings.lastSeenVersion, '');
  const ok = normalizeData({ extension: { pairedAt: 10, seenAt: 20, version: '0.11.0' } });
  assert.deepEqual(ok.extension, { pairedAt: 10, seenAt: 20, version: '0.11.0' });
});

test('načtení dat: instalace rozšíření mají jen hash tokenu, platný původ a je jich nejvýš pět', () => {
  const hash = 'a'.repeat(64);
  const platna = (i) => ({ id: `instalace-${i}`, origin: ORIGIN, tokenHash: hash, pairedAt: i });
  const d = normalizeData({ extensionInstallations: [
    { id: 'x'.repeat(8), origin: 'https://evil.example', tokenHash: hash },
    { id: 'x'.repeat(8), origin: ORIGIN, tokenHash: 'nehash' },
    { id: 'id s mezerou', origin: ORIGIN, tokenHash: hash },
    platna(0),
    ...[1, 2, 3, 4, 5].map(platna),
  ] });
  assert.equal(d.extensionInstallations.length, 5);
  assert.deepEqual(d.extensionInstallations.map((x) => x.id), [1, 2, 3, 4, 5].map((i) => `instalace-${i}`), 'zůstanou nejnovější');
  const sTokenem = normalizeData({ extensionInstallations: [{ id: 'x'.repeat(8), origin: ORIGIN, token: 'surovy-token', tokenHash: hash, pairedAt: 1 }] });
  assert.deepEqual(sTokenem.extensionInstallations, [{ id: 'x'.repeat(8), origin: ORIGIN, tokenHash: hash, pairedAt: 1 }], 'surový token se nikdy neuloží');
  assert.deepEqual(normalizeData({}).extensionInstallations, []);
});

// Do 0.24.0 dostávalo rozšíření token hooků. Ten pro rozšíření přestal platit, takže rozšíření
// spárované postaru se nesmí hlásit jako připojené – musí se říct, že ho stačí spárovat znovu.
test('stav rozšíření spárovaného postaru: „spáruj znovu“, ne „připojeno“', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  Object.assign(srv.app.datastore.data.extension, { pairedAt: Date.now() - 60_000, seenAt: Date.now() - 60_000, version: '0.24.0' });
  const pred = (await a.get('/api/state')).body.integrations.extension;
  assert.equal(pred.state, 'missing');
  assert.equal(pred.repair, true);
  assert.equal(pred.pairedAt, 0);
  assert.equal(pred.outdated, false, 'o verzi se nerozhoduje, dokud rozšíření není spárované');
  assert.equal((await a.send('POST', '/api/launch', { agent: 'gemini', mode: 'web', prompt: 'x' })).body.autofill, false, 'vložení zadání se neslibuje');
  const r = await pairExtension(srv.url);
  assert.equal(r.status, 200);
  const po = (await a.get('/api/state')).body.integrations.extension;
  assert.equal(po.state, 'ready');
  assert.equal(po.repair, false);
});
