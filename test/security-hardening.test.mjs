import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecrets } from '../src/secrets.js';
import { createCloudBillingConnector } from '../src/connectors/cloud-billing.js';
import { startTestServer, api, tempDir } from './helpers.mjs';
import { DataStore } from '../src/datastore.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('security: foreign origins cannot read state, transcripts or SSE; same-origin works', async () => {
  const s = await startTestServer();
  try {
    for (const p of ['/api/state', '/api/stream', '/api/runs', '/api/sessions/fake/transcript']) {
      for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
        const r = await fetch(s.url + p, { headers });
        assert.equal(r.status, 403, p);
        assert.equal(r.headers.get('access-control-allow-origin'), null);
      }
    }
    assert.equal((await fetch(s.url + '/api/state', { headers: { Origin: s.url } })).status, 200);
    assert.equal((await fetch(s.url + '/')).headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal((await api(s.url).send('PUT', '/api/settings', { avatar: 1 }, { 'X-Agenteeq': '1', Origin: 'https://evil.example' })).status, 403);
    assert.equal((await api(s.url).send('POST', '/api/extension/pair-code', {}, { Origin: 'https://evil.example' })).status, 403);
  } finally { await s.close(); }
});

test('security: SSE client limit and disconnect release', async () => {
  const s = await startTestServer();
  const controllers = [];
  try {
    for (let i = 0; i < 32; i++) {
      const c = new AbortController(); controllers.push(c);
      assert.equal((await fetch(s.url + '/api/stream', { signal: c.signal })).status, 200);
    }
    assert.equal((await fetch(s.url + '/api/stream')).status, 503);
    controllers.pop().abort();
    await new Promise(r => setTimeout(r, 50));
    const c = new AbortController(); controllers.push(c);
    assert.equal((await fetch(s.url + '/api/stream', { signal: c.signal })).status, 200);
  } finally { controllers.forEach(c => c.abort()); await s.close(); }
});

test('security: keychain values travel on stdin only; no insecure argv fallback', async () => {
  const calls = [];
  const value = 'sk-qa-placeholder-not-a-real-key-12345';
  const secrets = createSecrets({ keychain: true }, { helper: process.execPath, runImpl: async (...args) => { calls.push(args); return { ok: true, stdout: '' }; } });
  await secrets.set('openai-admin', value);
  assert.deepEqual(calls[0][1], ['set', 'openai-admin']);
  assert.equal(calls[0][2].input, value);
  assert.ok(!JSON.stringify(calls[0].slice(0, 2)).includes(value));
  await assert.rejects(secrets.set('openai-admin', 'sk-' + 'a'.repeat(5000)));
  await assert.rejects(createSecrets({ keychain: true }, { helper: '/nonexistent/agenteeq-keychain' }).set('openai-admin', value), /desktopovou/);
});

test('security: billing credentials never follow redirects; failures remain contained', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    throw new TypeError('fetch failed');
  });
  const c = createCloudBillingConnector({ config: { cloudFetch: true }, secrets: { get: async () => 'QA-only', source: () => 'test' } });
  await c.scan();
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.options.redirect === 'error'));
  assert.deepEqual(calls.map(c => new URL(c.url).hostname), ['api.openai.com', 'api.anthropic.com']);
  assert.equal(c.status().state, 'error');
  assert.ok(!JSON.stringify(c.providers()).includes('QA-only'));
});

// Poškozená data se nikdy neztratí: původní bajty zůstanou v souboru „data.json.poskozeno-…“, data se
// obnoví z poslední dobré zálohy, a aplikace přitom naběhne. Dřív kvůli ochraně dat nenaběhla vůbec –
// s automatickým spouštěním to byl nekonečný pád bez vysvětlení.
test('reliability: corrupt persistent data are preserved byte-for-byte and restored from backup', async () => {
  for (const input of ['{"unfinished":', 'null', '[]']) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-corrupt-qa-'));
    const file = dir + '/data.json';

    // Dobrý stav s nastavením → uložení vytvoří zálohu → soubor se poškodí mimo aplikaci.
    const prvni = new DataStore(dir);
    await prvni.load();
    prvni.data.settings.appearance = 'dark';
    await prvni.flush();
    prvni.data.settings.appearance = 'system';
    await prvni.flush();
    await fs.writeFile(file, input, { mode: 0o600 });

    const druhy = new DataStore(dir);
    await druhy.load();
    assert.equal(druhy.recovery.from, 'backup');
    assert.equal(druhy.data.settings.appearance, 'dark', 'data jsou z poslední dobré zálohy, ne prázdná');
    const zachovano = (await fs.readdir(dir)).find((f) => f.startsWith('data.json.poskozeno-'));
    assert.ok(zachovano, 'poškozený soubor zůstal vedle');
    assert.equal(await fs.readFile(`${dir}/${zachovano}`, 'utf8'), input, 'původní bajty beze změny');
    const upozorneni = druhy.data.alerts.find((x) => x.kind === 'system');
    assert.ok(upozorneni && upozorneni.body.includes(zachovano), 'uživatel se dozví, co se stalo a kde je původní soubor');
  }
});

test('reliability: corrupt data without a backup start from defaults, loudly, and keep the original', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-corrupt-qa-'));
  await fs.writeFile(dir + '/data.json', '{"projects": [', { mode: 0o600 });
  const ds = new DataStore(dir);
  await ds.load();
  assert.equal(ds.recovery.from, 'defaults');
  assert.equal(ds.data.alerts.filter((x) => x.kind === 'system' && x.level === 'critical').length, 1);
  const soubory = await fs.readdir(dir);
  const zachovano = soubory.find((f) => f.startsWith('data.json.poskozeno-'));
  assert.equal(await fs.readFile(`${dir}/${zachovano}`, 'utf8'), '{"projects": [');
  assert.ok(soubory.includes('data.json'), 'nový platný soubor vznikl');
});

// Obě kontroly níž si nedostupnost vyrábějí přes POSIXová práva (mode). Windows je nemá:
// soubor v profilu uživatele chrání ACL, které zdědí, a chmod 0o000 tam nic nezamkne.
const BEZ_PRAV = process.platform === 'win32' && 'Windows nemá POSIXová práva (mode), chrání ACL profilu';

test('reliability: a permission problem is not masked as corruption', { skip: BEZ_PRAV || process.getuid?.() === 0 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-corrupt-qa-'));
  await fs.writeFile(dir + '/data.json', '{}', { mode: 0o000 });
  try {
    await assert.rejects(new DataStore(dir).load(), /oprávnění/);
    assert.equal((await fs.readdir(dir)).some((f) => f.startsWith('data.json.poskozeno-')), false, 'nic se nepřejmenovalo');
  } finally {
    await fs.chmod(dir + '/data.json', 0o600);
  }
});

test('soukromí: historie upozornění jde smazat a datová složka patří jen vlastníkovi', async (t) => {
  const dataHome = await tempDir('agenteeq-data-');
  const s = await startTestServer({ AGENTEEQ_HOME: dataHome });
  t.after(() => s.close());

  const bezHlavicky = await fetch(`${s.url}/api/alerts/clear`, { method: 'POST' });
  assert.equal(bezHlavicky.status, 403, 'mazání je změna, bez hlavičky X-Agenteeq neprojde');

  s.app.alerts.raise({ level: 'info', kind: 'done', title: 'Tajný název projektu', body: 'text z konverzace', key: 'k1' });
  assert.equal(s.app.datastore.data.alerts.length, 1);

  const r = await api(s.url).send('POST', '/api/alerts/clear', {});
  assert.equal(r.status, 200);
  assert.equal(r.body.cleared, 1);
  assert.deepEqual(s.app.datastore.data.alerts, [], 'texty upozornění zmizely z paměti');
  assert.deepEqual(s.app.datastore.data.alertKeys, {}, 'klíče proti opakování zmizely také');

  await s.app.datastore.flush();
  const ulozeno = JSON.parse(await fs.readFile(path.join(dataHome, 'data.json'), 'utf8'));
  assert.equal(ulozeno.alerts.length, 0, 'ani na disku po nich nic nezůstalo');

  if (!BEZ_PRAV) {
    const dir = await fs.stat(dataHome);
    assert.equal(dir.mode & 0o077, 0, `do datové složky nesmí vidět nikdo jiný (má ${(dir.mode & 0o777).toString(8)})`);
    const soubor = await fs.stat(path.join(dataHome, 'data.json'));
    assert.equal(soubor.mode & 0o077, 0, 'datový soubor je jen pro vlastníka');
  }
});
