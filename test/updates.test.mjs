import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { UpdateService, assetName, compareVersions, parseVersion, RELEASE_URL, PREVIEW_RELEASES_URL } from '../src/updates.js';
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
    if (url === PREVIEW_RELEASES_URL) return new Response(JSON.stringify([payload]), { status: 200, headers: { 'content-type': 'application/json' } });
    if (String(url).startsWith('https://github.com/martin-pok/agentree/releases/download/')) return new Response(Buffer.from('zip!'), { status: 200, headers: { 'content-length': '4' } });
    throw new Error(`Nečekaná URL ${url}`);
  };
}

test('aktualizace: přijímá jen platné semver a přesný balíček platformy', async () => {
  assert.deepEqual(parseVersion('v1.20.3'), [1, 20, 3]);
  assert.equal(parseVersion('1.2'), null);
  assert.equal(parseVersion('9007199254740991.0.0')?.[0], Number.MAX_SAFE_INTEGER);
  for (const unsafe of ['9007199254740992.0.0', '999999999999999999999999.0.0', '0.9007199254740993.0', '1.0.99999999999999999999']) {
    assert.equal(parseVersion(unsafe), null, `unsafe version should be rejected: ${unsafe}`);
    assert.equal(compareVersions(unsafe, '1.0.0'), null);
    assert.equal(assetName(unsafe, { platform: 'darwin', arch: 'arm64' }), '');
  }
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
    assert.equal((await client.send('PUT', '/api/settings', { updateChannel: 'preview' })).body.settings.updateChannel, 'preview');
    assert.equal((await client.send('PUT', '/api/settings', { updateChannel: 'unknown' })).status, 422);
    assert.equal((await client.send('PUT', '/api/settings', { updateChannel: 'stable' })).body.settings.updateChannel, 'stable');
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


test('Preview channel is opt-in, chooses highest published semver and never a draft', async () => {
  const releases = [
    { ...release('0.46.2'), prerelease: true },
    { ...release('0.46.4'), prerelease: true },
    { ...release('0.46.3'), prerelease: true },
    { ...release('0.46.5'), draft: true, prerelease: true },
    { ...release('0.46.1'), prerelease: false },
    { ...release('0.99.0'), tag_name: 'not-a-release', prerelease: true },
  ];
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (url === PREVIEW_RELEASES_URL) return new Response(JSON.stringify(releases), { status: 200 });
    if (url === RELEASE_URL) return new Response(JSON.stringify(release('0.46.0')), { status: 200 });
    throw new Error('Unexpected URL ' + url);
  };
  const service = new UpdateService({ version: '0.46.1', channel: 'preview',
    dataDir: await tempDir('preview-channel-'), fetchImpl, platform: 'darwin', arch: 'arm64' });
  const preview = await service.check();
  assert.equal(preview.channel, 'preview');
  assert.equal(preview.status, 'available');
  assert.equal(preview.latestVersion, '0.46.4');
  assert.equal(preview.asset.name, 'Agenteeq-0.46.4-macOS-arm64.zip');
  assert.deepEqual(seen, [PREVIEW_RELEASES_URL]);
  const stable = await service.check('stable');
  assert.equal(stable.channel, 'stable');
  assert.equal(stable.status, 'current');
  assert.equal(stable.asset, null, 'changing channel removes any Preview download offer');
  assert.deepEqual(seen, [PREVIEW_RELEASES_URL, RELEASE_URL]);
});

test('Preview channel rejects missing digest and mismatched release asset links', async () => {
  const original = release('0.46.4');
  for (const asset of [
    { ...original.assets[0], digest: null },
    { ...original.assets[0], browser_download_url: 'https://github.com/martin-pok/agentree/releases/download/v0.46.3/Agenteeq-0.46.4-macOS-arm64.zip' },
    { ...original.assets[0], browser_download_url: 'https://evil.example/Agenteeq-0.46.4-macOS-arm64.zip' },
  ]) {
    const service = new UpdateService({ version: '0.46.3', channel: 'preview',
      dataDir: await tempDir('preview-invalid-'), platform: 'darwin', arch: 'arm64',
      fetchImpl: async () => new Response(JSON.stringify([{ ...original, prerelease: true, assets: [asset] }]), { status: 200 }) });
    const result = await service.check();
    assert.equal(result.status, 'unsupported');
    assert.equal(result.asset, null);
  }
});

test('late Preview response cannot replace Stable after channel switch', async () => {
  let resolvePreview;
  const oldResponse = new Promise((resolve) => { resolvePreview = resolve; });
  const service = new UpdateService({ version: '0.46.1', channel: 'preview',
    dataDir: await tempDir('preview-race-'), platform: 'darwin', arch: 'arm64',
    fetchImpl: async (url) => url === PREVIEW_RELEASES_URL ? oldResponse : new Response(JSON.stringify(release('0.46.0')), { status: 200 }) });
  const first = service.check();
  const stable = await service.check('stable');
  assert.equal(stable.channel, 'stable');
  assert.equal(stable.status, 'current');
  resolvePreview(new Response(JSON.stringify([{ ...release('0.46.4'), prerelease: true }]), { status: 200 }));
  await first;
  assert.equal(service.state().channel, 'stable');
  assert.equal(service.state().status, 'current');
  assert.equal(service.state().asset, null);
});

test('Preview channel rejects invalid constructor and check arguments', async () => {
  assert.throws(() => new UpdateService({ version: '0.46.1', channel: 'unknown' }), /Neplatný kanál aktualizací|Invalid update channel/);
  const service = new UpdateService({ version: '0.46.1', channel: 'stable',
    dataDir: await tempDir('stable-invalid-'), fetchImpl: fetchForUpdate() });
  await assert.rejects(service.check('unknown'), /Neplatný kanál aktualizací|Invalid update channel/);
});


test('Preview → Stable → Preview: late first Preview response cannot overwrite newer Preview result', async () => {
  let resolveOld;
  const oldResponse = new Promise(resolve => { resolveOld = resolve; });
  let previews = 0;
  const service = new UpdateService({
    version: '0.46.1', channel: 'preview', dataDir: await tempDir('preview-aba-race-'),
    platform: 'darwin', arch: 'arm64',
    fetchImpl: async (url) => {
      if (url === RELEASE_URL) return new Response(JSON.stringify(release('0.46.0')), { status: 200 });
      if (url === PREVIEW_RELEASES_URL) {
        previews += 1;
        return previews === 1 ? oldResponse : new Response(JSON.stringify([{ ...release('0.46.5'), prerelease: true }]), { status: 200 });
      }
      throw new Error('Unexpected URL: ' + url);
    },
  });
  const stale = service.check();
  assert.equal((await service.check('stable')).status, 'current');
  const latest = await service.check('preview');
  assert.equal(latest.status, 'available');
  assert.equal(latest.latestVersion, '0.46.5');
  resolveOld(new Response(JSON.stringify([{ ...release('0.46.4'), prerelease: true }]), { status: 200 }));
  await stale;
  assert.equal(previews, 2);
  assert.equal(service.state().channel, 'preview');
  assert.equal(service.state().latestVersion, '0.46.5');
  assert.equal(service.state().asset.name, 'Agenteeq-0.46.5-macOS-arm64.zip');
});

test('Preview → Stable → Preview: late rejected request cannot replace good result with error', async () => {
  let rejectOld;
  const oldResponse = new Promise((resolve, reject) => { rejectOld = reject; });
  let previews = 0;
  const service = new UpdateService({
    version: '0.46.1', channel: 'preview', dataDir: await tempDir('preview-aba-error-'),
    platform: 'darwin', arch: 'arm64',
    fetchImpl: async (url) => {
      if (url === RELEASE_URL) return new Response(JSON.stringify(release('0.46.0')), { status: 200 });
      previews += 1;
      return previews === 1 ? oldResponse : new Response(JSON.stringify([{ ...release('0.46.5'), prerelease: true }]), { status: 200 });
    },
  });
  const stale = service.check();
  await service.check('stable');
  assert.equal((await service.check('preview')).latestVersion, '0.46.5');
  rejectOld(new Error('original preview request timed out'));
  await stale;
  assert.equal(service.state().status, 'available');
  assert.equal(service.state().latestVersion, '0.46.5');
});

test('Downloaded release is invalidated when same URL has a changed GitHub SHA-256 digest', async () => {
  let sha = OTISK;
  const service = new UpdateService({
    version: '0.29.9', dataDir: await tempDir('updates-replaced-digest-'),
    platform: 'darwin', arch: 'arm64',
    fetchImpl: async (url) => url === RELEASE_URL
      ? new Response(JSON.stringify(release('0.30.0', sha)), { status: 200 })
      : new Response(Buffer.from('zip!'), { status: 200 }),
  });
  assert.equal((await service.check()).status, 'available');
  assert.equal((await service.download()).ok, true);
  assert.equal(service.state().status, 'downloaded');
  sha = 'sha256:' + crypto.createHash('sha256').update('nope').digest('hex');
  const next = await service.check();
  assert.equal(next.status, 'available', 'changed checksum must invalidate previous cached download');
  assert.equal(next.downloaded, null);
  assert.equal(service.downloadedPath(), null);
  assert.equal((await service.download()).status, 502, 'old bytes do not match new release digest');
});

test('Old download from Preview cannot be accepted after Preview → Stable → Preview channel switch', async () => {
  let resolveZip;
  const pendingZip = new Promise(resolve => { resolveZip = resolve; });
  const newest = { ...release('0.46.4'), prerelease: true };
  const service = new UpdateService({
    version: '0.46.1', channel: 'preview', dataDir: await tempDir('preview-download-aba-'),
    platform: 'darwin', arch: 'arm64',
    fetchImpl: async (url) => {
      if (url === PREVIEW_RELEASES_URL) return new Response(JSON.stringify([newest]), { status: 200 });
      if (url === RELEASE_URL) return new Response(JSON.stringify(release('0.46.0')), { status: 200 });
      return pendingZip;
    },
  });
  assert.equal((await service.check()).status, 'available');
  const staleDownload = service.download();
  assert.equal((await service.check('stable')).status, 'current');
  assert.equal((await service.check('preview')).status, 'available');
  resolveZip(new Response(Buffer.from('zip!'), { status: 200 }));
  const stale = await staleDownload;
  assert.equal(stale.status, 409, 'an old request cannot complete after the channel generation changed');
  assert.equal(service.state().status, 'available');
  assert.equal(service.downloadedPath(), null);
});


test('a previously verified ZIP is independently checked again before installation or reveal', async () => {
  const dir = await tempDir('agenteeq-update-reverify-');
  const service = new UpdateService({ version: '0.29.9', dataDir: dir, fetchImpl: fetchForUpdate(), platform: 'darwin', arch: 'arm64' });
  assert.equal((await service.check()).status, 'available');
  const first = await service.download();
  assert.equal(first.ok, true);
  const file = first.update.downloaded.path;
  assert.equal(await service.verifiedDownloadedPath(), file, 'untouched and SHA-verified local ZIP remains installable');

  // Size and filename are identical. A stat-only check would accept this.
  await fs.writeFile(file, 'evil');
  assert.equal(await service.verifiedDownloadedPath(), null, 'same-size corruption must fail before install');
  assert.equal(service.state().status, 'available');
  assert.equal(service.state().downloaded, null);
  assert.equal(service.downloadedPath(), null);

  assert.equal((await service.download()).ok, true, 'a bad local ZIP can be fetched anew');
  assert.equal(await service.verifiedDownloadedPath(), file);
  await fs.rm(file);
  assert.equal(await service.verifiedDownloadedPath(), null, 'deleted file invalidates cached update');
  assert.equal(service.state().status, 'available');
});

test('desktop install/reveal reject changed or deleted ZIP and never dispatch it to native shell', async () => {
  const home = await tempDir('agenteeq-reverify-native-');
  const updater = new UpdateService({ version: '0.29.9', dataDir: home, fetchImpl: fetchForUpdate(), platform: 'darwin', arch: 'arm64' });
  const s = await startTestServer({ AGENTEEQ_HOME: home, AGENTEEQ_CLOUD: '1', AGENTEEQ_SELF_INSTALL: '1' }, { updateService: updater });
  try {
    const events = [];
    s.app.nastavDesktop(event => events.push(event));
    const client = api(s.url);
    assert.equal((await client.send('POST', '/api/updates/check', {})).status, 200);
    assert.equal((await client.send('POST', '/api/updates/download', {})).status, 200);
    const file = updater.downloadedPath();
    assert.ok(file);
    await fs.writeFile(file, 'oops');
    const rejected = await client.send('POST', '/api/updates/install', {});
    assert.equal(rejected.status, 409);
    assert.match(rejected.body.error, /aktualizační balíček/i);
    assert.equal(updater.state().status, 'available');
    assert.deepEqual(events, [], 'native install-update event MUST NOT be emitted for corrupt ZIP');
    assert.equal((await client.send('POST', '/api/updates/download', {})).status, 200);
    await fs.rm(updater.downloadedPath());
    const reveal = await client.send('POST', '/api/updates/reveal', {});
    assert.equal(reveal.status, 409);
    assert.equal(updater.state().status, 'available');
    assert.deepEqual(events, [], 'reveal also must not leak an invalid ZIP');
    assert.equal((await client.get('/api/state')).body.updates.status, 'available');
  } finally { await s.close(); }
});

test('a symlink cannot stand in for a SHA-matching downloaded update ZIP', { skip: process.platform === 'win32' && 'Windows symlinks require elevated privileges or Developer Mode in CI' }, async () => {
  const home = await tempDir('agenteeq-update-symlink-');
  const service = new UpdateService({ version: '0.29.9', dataDir: home, fetchImpl: fetchForUpdate(), platform: 'darwin', arch: 'arm64' });
  await service.check();
  assert.equal((await service.download()).ok, true);
  const file = service.downloadedPath();
  const alias = path.join(home, 'outside.zip');
  await fs.copyFile(file, alias);
  await fs.rm(file);
  await fs.symlink(alias, file);
  assert.equal(await service.verifiedDownloadedPath(), null);
  assert.equal(service.state().status, 'available');
});

test('Preview ignores unrepresentable GitHub SemVer tags and selects the genuine latest release', async () => {
  const valid = { ...release('0.46.8'), prerelease: true };
  const unsafe = { ...release('9007199254740992.0.0'), prerelease: true };
  const service = new UpdateService({
    version: '0.46.6', dataDir: await tempDir('updates-unsafe-tags-'),
    platform: 'darwin', arch: 'arm64', channel: 'preview',
    fetchImpl: async (url) => {
      assert.equal(url, PREVIEW_RELEASES_URL);
      return new Response(JSON.stringify([unsafe, valid]), { status: 200 });
    },
  });
  const result = await service.check();
  assert.equal(result.status, 'available');
  assert.equal(result.latestVersion, '0.46.8');
  assert.equal(result.asset.name, 'Agenteeq-0.46.8-macOS-arm64.zip');
});
