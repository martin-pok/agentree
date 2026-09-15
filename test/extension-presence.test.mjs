import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, api } from './helpers.mjs';
import { normalizeData } from '../src/datastore.js';

// Aplikace musí o rozšíření říkat pravdu. Dřív „věděla“ o rozšíření jen z konverzací poslaných
// za posledních pár minut a jen v paměti – po restartu ukazovala „nenainstalováno“, i když bylo
// spárované, a nesliboval se vklad zadání, který by přitom fungoval.

const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

test('stav rozšíření: nespárováno, spárováno, ozvalo se, zastaralá verze', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  const token = JSON.parse(await fs.readFile(path.join(srv.dataHome, 'data.json'), 'utf8')).ingestToken;
  const stav = async () => (await a.get('/api/state')).body.integrations.extension;
  const hello = (body, headers = { 'X-Agenteeq-Token': token }) => a.send('POST', '/api/extension/hello', body, headers);

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
    await new Promise((r) => setTimeout(r, 400));
    const data = JSON.parse(await fs.readFile(path.join(srv.dataHome, 'data.json'), 'utf8'));
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
