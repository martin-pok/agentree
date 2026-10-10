import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { UpdateService, assetName, compareVersions, parseVersion, RELEASE_URL } from '../src/updates.js';
import { api, startTestServer, tempDir } from './helpers.mjs';

// Otisk, který GitHub u přílohy vydání zveřejňuje (pole `digest`), pro obsah atrapy 'zip!'.
const OTISK = `sha256:${crypto.createHash('sha256').update('zip!').digest('hex')}`;
const release = (version = '0.30.0', digest = OTISK) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  assets: [{ name: `Agenteeq-${version}-macOS-arm64.zip`, size: 4, digest, browser_download_url: `https://github.com/martin-pok/agentree/releases/download/v${version}/Agenteeq-${version}-macOS-arm64.zip` }],
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
  // Mac s Intelem: žádná příloha (jen Apple Silicon), Windows x64 beze změny.
  assert.equal(assetName('0.34.0', { platform: 'darwin', arch: 'x64' }), '');
  assert.equal(assetName('0.34.0', { platform: 'win32', arch: 'x64' }), 'Agenteeq-0.34.0-Windows-x64.zip');

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

test('aktualizace: chybějící Content-Length neodmítne balíček s platnou velikostí a SHA-256', async () => {
  const dir = await tempDir('agenteeq-updates-chunked-');
  const fetchImpl = async (url) => {
    if (url === RELEASE_URL) return new Response(JSON.stringify(release()), { status: 200 });
    // Real-world chunked download: no Content-Length header, still verify body and digest.
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('zip!')); controller.close(); },
    }), { status: 200 });
  };
  const service = new UpdateService({ version: '0.29.9', dataDir: dir, fetchImpl, platform: 'darwin', arch: 'arm64' });
  assert.equal((await service.check()).status, 'available');
  const result = await service.download();
  assert.equal(result.ok, true);
  assert.equal(await fs.readFile(result.update.downloaded.path, 'utf8'), 'zip!');
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
    assert.match(reveal.body.plan.args[1], /updates[\\/]Agenteeq-0\.31\.0-macOS-arm64\.zip$/);
    const remote = await s.app.state({ local: false });
    assert.equal(remote.updates.status, 'disabled');
    assert.equal(remote.updates.downloaded, null);
    assert.equal((await client.send('PUT', '/api/settings', { updateMode: 'automatic' })).body.settings.updateMode, 'automatic');
    assert.equal((await client.send('PUT', '/api/settings', { updateMode: 'surprise' })).status, 422);
  } finally { await s.close(); }
});

test('aktualizace: balíček se stáhne jen s otiskem z GitHubu a jen když mu obsah odpovídá', async () => {
  // Bez otisku se nic nenabízí: stav říká, že pro tento počítač balíček není, ne „kontroluji“.
  const bezOtisku = new UpdateService({ version: '0.29.9', dataDir: await tempDir('agenteeq-updates-'), fetchImpl: fetchForUpdate(release('0.30.0', null)), platform: 'darwin', arch: 'arm64' });
  assert.equal((await bezOtisku.check()).status, 'unsupported');
  const jinyAlgoritmus = new UpdateService({ version: '0.29.9', dataDir: await tempDir('agenteeq-updates-'), fetchImpl: fetchForUpdate(release('0.30.0', 'md5:abc')), platform: 'darwin', arch: 'arm64' });
  assert.equal((await jinyAlgoritmus.check()).status, 'unsupported');

  // Stejná velikost, jiný obsah: dřív prošlo, protože se kontrolovala jen velikost.
  const dir = await tempDir('agenteeq-updates-');
  const podvrh = new UpdateService({ version: '0.29.9', dataDir: dir, fetchImpl: async (url) => {
    if (url === RELEASE_URL) return new Response(JSON.stringify(release()), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(Buffer.from('zip?'), { status: 200, headers: { 'content-length': '4' } });
  }, platform: 'darwin', arch: 'arm64' });
  assert.equal((await podvrh.check()).status, 'available');
  const odmitnuto = await podvrh.download();
  assert.equal(odmitnuto.status, 502);
  assert.equal(podvrh.state().status, 'available');
  await assert.rejects(fs.access(path.join(dir, 'updates', 'Agenteeq-0.30.0-macOS-arm64.zip')), 'podvržený balíček se na disk neuloží');
});

// Aktualizace jedním klepnutím: server pošle oknu aplikace pro Mac cestu k ověřenému balíčku a verzi,
// výměnu a restart udělá okno (desktop/Agenteeq.swift). Bez okna, které to umí, nic neposílá a řekne proč.
test('HTTP aktualizace: instalace jen se staženým balíčkem a jen přes okno aplikace pro Mac', async () => {
  const dataHome = await tempDir('agenteeq-updates-install-');
  const updateService = new UpdateService({ version: '0.30.0', dataDir: dataHome, fetchImpl: fetchForUpdate(release('0.31.0')), platform: 'darwin', arch: 'arm64' });
  const s = await startTestServer({ AGENTEEQ_CLOUD: '1', AGENTEEQ_HOME: dataHome, AGENTEEQ_SELF_INSTALL: '1' }, { updateService });
  try {
    const client = api(s.url);
    assert.equal((await client.get('/api/state')).body.integrations.selfInstall, true);
    const udalosti = [];
    assert.equal((await client.send('POST', '/api/updates/install', {})).status, 422, 'bez okna aplikace se nic neinstaluje');
    s.app.nastavDesktop((u) => udalosti.push(u));
    await client.send('POST', '/api/updates/check', {});
    assert.equal((await client.send('POST', '/api/updates/install', {})).status, 404, 'nestažený balíček se neinstaluje');
    await client.send('POST', '/api/updates/download', {});
    const r = await client.send('POST', '/api/updates/install', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.restarting, true);
    assert.equal(udalosti.length, 1);
    assert.equal(udalosti[0].type, 'install-update');
    assert.equal(udalosti[0].version, '0.31.0');
    assert.equal(path.dirname(udalosti[0].zip), path.join(dataHome, 'updates'));
    assert.match(udalosti[0].zip, /Agenteeq-0\.31\.0-macOS-arm64\.zip$/);
    const cizi = await fetch(`${s.url}/api/updates/install`, { method: 'POST', headers: { 'X-Forwarded-For': '100.64.0.2', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(cizi.status, 403, 'instalovat jde jen z tohoto Macu');
    assert.equal(udalosti.length, 1);
  } finally { await s.close(); }
});


test('aktualizace: ukončí proud okamžitě při překročení velikosti z releasu', async () => {
  let canceled = false;
  const fetchImpl = async (url) => {
    if (url === RELEASE_URL) return new Response(JSON.stringify(release()), { status: 200 });
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]));
      },
      cancel() { canceled = true; },
    }), { status: 200 });
  };
  const service = new UpdateService({ version: '0.29.9', dataDir: await tempDir('agenteeq-updates-stream-'), fetchImpl, platform: 'darwin', arch: 'arm64' });
  const available = await service.check();
  assert.equal(available.status, 'available');
  const result = await service.download();
  assert.equal(result.status, 502);
  assert.equal(canceled, true, 'nadlimitní proud se musí přerušit');
  assert.equal(service.state().status, 'available', 'chybné stažení nesmí být označené za hotové');
});


test('aktualizace: odmítne nedokončený proud i bez Content-Length', async () => {
  const dir = await tempDir('agenteeq-updates-truncated-');
  const fetchImpl = async (url) => {
    if (url === RELEASE_URL) return new Response(JSON.stringify(release()), { status: 200 });
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('zip'));
        controller.close();
      },
    }), { status: 200 });
  };
  const service = new UpdateService({ version: '0.29.9', dataDir: dir, fetchImpl, platform: 'darwin', arch: 'arm64' });
  assert.equal((await service.check()).status, 'available');
  const result = await service.download();
  assert.equal(result.status, 502);
  assert.equal(service.state().status, 'available');
  await assert.rejects(fs.access(path.join(dir, 'updates', 'Agenteeq-0.30.0-macOS-arm64.zip')));
});

test('aktualizace: neuloží balíček, pokud server uvede neplatný Content-Length', async () => {
  const dir = await tempDir('agenteeq-updates-header-');
  const fetchImpl = async (url) => {
    if (url === RELEASE_URL) return new Response(JSON.stringify(release()), { status: 200 });
    return {
      ok: true,
      headers: new Headers({ 'content-length': '999' }),
      arrayBuffer: async () => Buffer.from('zip!'),
    };
  };
  const service = new UpdateService({ version: '0.29.9', dataDir: dir, fetchImpl, platform: 'darwin', arch: 'arm64' });
  assert.equal((await service.check()).status, 'available');
  assert.equal((await service.download()).status, 502);
  assert.equal(service.state().status, 'available');
  await assert.rejects(fs.access(path.join(dir, 'updates', 'Agenteeq-0.30.0-macOS-arm64.zip')));
});
