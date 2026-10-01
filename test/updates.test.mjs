import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { UpdateService, assetName, compareVersions, parseVersion, RELEASE_URL } from '../src/updates.js';
import { api, startTestServer, tempDir } from './helpers.mjs';

const release = (version = '0.30.0') => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  assets: [{ name: `Agenteeq-${version}-macOS-arm64.zip`, size: 4, browser_download_url: `https://github.com/martin-pok/agentree/releases/download/v${version}/Agenteeq-${version}-macOS-arm64.zip` }],
});

function fetchForUpdate(payload = release()) {
  return async (url) => {
    if (url === RELEASE_URL) return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    if (String(url).startsWith('https://github.com/martin-pok/agentree/releases/download/')) return new Response(Buffer.from('zip!'), { status: 200, headers: { 'content-length': '4' } });
    throw new Error(`Nečekaná URL ${url}`);
  };
}

test('aktualizace: přijímá jen platné semver a přesný balíček platformy', async () => {
  assert.deepEqual(parseVersion('v1.20.3'), [1, 20, 3]);
  assert.equal(parseVersion('1.2'), null);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.4', '1.2.3'), 1);
  assert.equal(assetName('0.30.0', { platform: 'darwin', arch: 'arm64' }), 'Agenteeq-0.30.0-macOS-arm64.zip');
  assert.equal(assetName('0.30.0', { platform: 'linux', arch: 'arm64' }), '');

  const service = new UpdateService({ version: '0.29.9', dataDir: await tempDir('agenteeq-updates-'), fetchImpl: fetchForUpdate(), platform: 'darwin', arch: 'arm64' });
  const available = await service.check();
  assert.equal(available.status, 'available');
  assert.equal(available.latestVersion, '0.30.0');
  assert.equal(available.asset.name, 'Agenteeq-0.30.0-macOS-arm64.zip');

  const wrongOrigin = new UpdateService({ version: '0.29.9', dataDir: await tempDir('agenteeq-updates-'), fetchImpl: fetchForUpdate({ ...release(), assets: [{ ...release().assets[0], browser_download_url: 'https://example.test/Agenteeq-0.30.0-macOS-arm64.zip' }] }), platform: 'darwin', arch: 'arm64' });
  assert.equal((await wrongOrigin.check()).status, 'unsupported');
});

test('aktualizace: stažení je lokální, atomické a nové ověření ho nemaže', async () => {
  const dir = await tempDir('agenteeq-updates-');
  const service = new UpdateService({ version: '0.29.9', dataDir: dir, fetchImpl: fetchForUpdate(), platform: 'darwin', arch: 'arm64' });
  await service.check();
  const downloaded = await service.download();
  assert.equal(downloaded.ok, true);
  assert.equal(downloaded.update.status, 'downloaded');
  assert.equal(await fs.readFile(downloaded.update.downloaded.path, 'utf8'), 'zip!');
  assert.equal((await service.check()).status, 'downloaded');
  assert.equal(path.dirname(service.downloadedPath()), path.join(dir, 'updates'));
});

test('aktualizace: chyba zdroje ani poškozený balíček se nikdy nevydává za aktuální vydání', async () => {
  const unavailable = new UpdateService({ version: '0.29.9', dataDir: await tempDir('agenteeq-updates-'), fetchImpl: async () => { throw new Error('offline'); }, platform: 'darwin', arch: 'arm64' });
  const failed = await unavailable.check();
  assert.equal(failed.status, 'error');
  assert.notEqual(failed.status, 'current');

  const mismatched = new UpdateService({ version: '0.29.9', dataDir: await tempDir('agenteeq-updates-'), fetchImpl: async (url) => {
    if (url === RELEASE_URL) return new Response(JSON.stringify(release()), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(Buffer.from('bad'), { status: 200, headers: { 'content-length': '3' } });
  }, platform: 'darwin', arch: 'arm64' });
  await mismatched.check();
  const refused = await mismatched.download();
  assert.equal(refused.status, 502);
  assert.equal(mismatched.state().status, 'available');
});

test('HTTP aktualizace: lokální UI ověří, stáhne a ve zkušebním režimu ukáže jen vlastní balíček', async () => {
  // Testuje macOS balíček nezávisle na systému, na kterém běží CI. Produkce dál vybírá
  // platformu procesu; sem ji vkládáme záměrně, aby se ověřilo lokální rozhraní i na Windows/Linuxu.
  const dataHome = await tempDir('agenteeq-updates-http-');
  const updateService = new UpdateService({ version: '0.30.0', dataDir: dataHome, fetchImpl: fetchForUpdate(release('0.31.0')), platform: 'darwin', arch: 'arm64' });
  const s = await startTestServer({ AGENTEEQ_CLOUD: '1', AGENTEEQ_HOME: dataHome }, { updateService });
  try {
    const client = api(s.url);
    const initial = (await client.get('/api/state')).body;
    assert.ok(initial.updates, 'stav aktualizace je součástí živého snímku');
    const checked = await client.send('POST', '/api/updates/check', {});
    assert.equal(checked.status, 200);
    assert.equal(checked.body.updates.status, 'available');
    const downloaded = await client.send('POST', '/api/updates/download', {});
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.body.update.status, 'downloaded');
    const reveal = await client.send('POST', '/api/updates/reveal', {});
    assert.equal(reveal.status, 200);
    assert.equal(reveal.body.dry, true);
    assert.equal(reveal.body.plan.args[0], '-R');
    assert.match(reveal.body.plan.args[1], /updates\/Agenteeq-0\.31\.0-macOS-arm64\.zip$/);
    const remote = await s.app.state({ local: false });
    assert.equal(remote.updates.status, 'disabled');
    assert.equal(remote.updates.downloaded, null);
    assert.equal((await client.send('PUT', '/api/settings', { updateMode: 'automatic' })).body.settings.updateMode, 'automatic');
    assert.equal((await client.send('PUT', '/api/settings', { updateMode: 'surprise' })).status, 422);
  } finally { await s.close(); }
});
