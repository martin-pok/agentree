import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { UpdateService, RELEASE_URL } from '../src/updates.js';
import { tempDir } from './helpers.mjs';

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const name = 'Agenteeq-0.47.0-macOS-arm64.zip';
const url = 'https://github.com/martin-pok/agentree/releases/download/v0.47.0/' + name;

function metadata(bytes) {
  return {
    tag_name: 'v0.47.0', draft: false, prerelease: false,
    assets: [{ name, size: bytes.length, digest: 'sha256:' + sha(bytes), browser_download_url: url }],
  };
}
function makeService(dir, fetchImpl) {
  return new UpdateService({ version: '0.46.0', dataDir: dir, fetchImpl, platform: 'darwin', arch: 'arm64' });
}
function fakeStream(chunks, { broken = false } = {}) {
  let at = 0;
  return new ReadableStream({
    pull(controller) {
      if (at >= chunks.length) {
        if (broken) controller.error(new Error('Connection reset midway'));
        else controller.close();
        return;
      }
      controller.enqueue(chunks[at++]);
    },
  });
}
const files = async dir => fs.readdir(path.join(dir, 'updates')).catch(e => {
  if (e.code === 'ENOENT') return [];
  throw e;
});

test('large installer is written incrementally to a private file, not buffered with arrayBuffer', async () => {
  const dir = await tempDir('agenteeq-update-stream-');
  const pieces = Array.from({ length: 32 }, (_, i) => Buffer.alloc(256 * 1024, i % 251));
  const bytes = Buffer.concat(pieces);
  const service = makeService(dir, async (request) => request === RELEASE_URL
    ? new Response(JSON.stringify(metadata(bytes)), { status: 200 })
    : {
        ok: true,
        headers: new Headers(),
        body: fakeStream(pieces),
        arrayBuffer() { throw new Error('must never buffer normal streamed responses'); },
      });
  assert.equal((await service.check()).status, 'available');
  const result = await service.download();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.update.status, 'downloaded');
  assert.equal(result.update.downloaded.size, bytes.length);
  assert.deepEqual(await fs.readFile(result.update.downloaded.path), bytes);
  assert.deepEqual(await files(dir), [name], 'verified file must have no staging leftovers');
  if (process.platform !== 'win32') {
    const stat = await fs.stat(result.update.downloaded.path);
    assert.equal(stat.mode & 0o777, 0o600, 'downloaded archive is readable only by its owner');
  }
});

test('interrupted byte stream leaves no completed archive and no staging file', async () => {
  const dir = await tempDir('agenteeq-update-interrupted-');
  const bytes = Buffer.from('123456789abcdef');
  const service = makeService(dir, async request => request === RELEASE_URL
    ? new Response(JSON.stringify(metadata(bytes)), { status: 200 })
    : { ok: true, headers: new Headers(), body: fakeStream([bytes.subarray(0, 4)], { broken: true }) });
  assert.equal((await service.check()).status, 'available');
  const result = await service.download();
  assert.equal(result.status, 502);
  assert.equal(service.state().status, 'available');
  assert.deepEqual(await files(dir), [], 'not even a partly written .tmp file may remain');
});

test('mismatched checksum and published size never promote an incomplete archive', async () => {
  const dir = await tempDir('agenteeq-update-corrupt-stream-');
  const bytes = Buffer.from('expected file body');
  const service = makeService(dir, async request => request === RELEASE_URL
    ? new Response(JSON.stringify(metadata(bytes)), { status: 200 })
    : { ok: true, headers: new Headers(), body: fakeStream([Buffer.from('a bad file with!')]) });
  assert.equal((await service.check()).status, 'available');
  assert.equal((await service.download()).status, 502);
  assert.deepEqual(await files(dir), [], 'incorrect SHA must prevent atomic rename');
});

test('chunked content larger than published size cancels reader and removes staged file', async () => {
  const dir = await tempDir('agenteeq-update-too-large-');
  const bytes = Buffer.from('size=4');
  let canceled = false;
  const service = makeService(dir, async request => request === RELEASE_URL
    ? new Response(JSON.stringify(metadata(bytes)), { status: 200 })
    : {
        ok: true, headers: new Headers(),
        body: { getReader: () => ({
          read: async () => ({ done: false, value: Buffer.alloc(bytes.length + 1) }),
          cancel: async () => { canceled = true; },
          releaseLock: () => {},
        }) },
      });
  assert.equal((await service.check()).status, 'available');
  assert.equal((await service.download()).status, 502);
  assert.equal(canceled, true);
  assert.deepEqual(await files(dir), []);
});

test('same-name in-flight downloads use unique temp files and do not leave corruption', async () => {
  const dir = await tempDir('agenteeq-update-concurrent-');
  const bytes = Buffer.from('correct archive');
  const service = makeService(dir, async request => request === RELEASE_URL
    ? new Response(JSON.stringify(metadata(bytes)), { status: 200 })
    : new Response(fakeStream([bytes.subarray(0, 7), bytes.subarray(7)]), { status: 200 }));
  assert.equal((await service.check()).status, 'available');
  const results = await Promise.all([service.download(), service.download()]);
  assert.ok(results.every(r => r.ok), JSON.stringify(results));
  assert.deepEqual(await files(dir), [name]);
  assert.deepEqual(await fs.readFile(path.join(dir, 'updates', name)), bytes);
});


test('three simultaneous identical download requests share one network transfer and one atomic file', async () => {
  const dir = await tempDir('agenteeq-update-coalesce-');
  const bytes = Buffer.alloc(512 * 1024, 73);
  let transfers = 0;
  let releaseBody;
  const waiting = new Promise(resolve => { releaseBody = resolve; });
  const service = makeService(dir, async request => {
    if (request === RELEASE_URL) return new Response(JSON.stringify(metadata(bytes)), { status: 200 });
    transfers++;
    return waiting;
  });
  assert.equal((await service.check()).status, 'available');
  const a = service.download();
  const b = service.download();
  const c = service.download();
  assert.strictEqual(a, b, 'all same-asset calls must reuse one Promise');
  assert.strictEqual(b, c);
  assert.equal(transfers, 1, 'one download, not three network requests');
  releaseBody(new Response(fakeStream([bytes.subarray(0, 4), bytes.subarray(4)])));
  const values = await Promise.all([a, b, c]);
  assert.ok(values.every(x => x.ok));
  assert.equal(transfers, 1);
  assert.deepEqual(await files(dir), [name]);
  assert.deepEqual(await fs.readFile(path.join(dir, 'updates', name)), bytes);
});

test('asset SHA changed while old download is pending: new transfer is not coalesced with stale bytes', async () => {
  const dir = await tempDir('agenteeq-update-coalesce-digest-');
  const bytesA = Buffer.from('archive-old-digest-A');
  const bytesB = Buffer.from('archive-new-digest-B');
  let current = bytesA;
  let resolveOld;
  const oldTransfer = new Promise(resolve => { resolveOld = resolve; });
  let transfers = 0;
  const service = makeService(dir, async request => {
    if (request === RELEASE_URL) return new Response(JSON.stringify(metadata(current)), { status: 200 });
    transfers++;
    return transfers === 1 ? oldTransfer : new Response(bytesB, { status: 200 });
  });
  assert.equal((await service.check()).status, 'available');
  const stale = service.download();
  current = bytesB;
  assert.equal((await service.check()).status, 'available');
  const fresh = service.download();
  assert.notStrictEqual(stale, fresh);
  assert.equal((await fresh).ok, true);
  resolveOld(new Response(bytesA, { status: 200 }));
  assert.equal((await stale).status, 409, 'outdated content must never be promoted to available');
  assert.equal(transfers, 2);
  assert.equal(service.state().status, 'downloaded');
  assert.deepEqual(await fs.readFile(service.downloadedPath()), bytesB);
  assert.deepEqual(await files(dir), [name], 'stale generation leaves no temporary files');
});

test('failed shared transfer is removed from in-flight cache so retry can succeed', async () => {
  const dir = await tempDir('agenteeq-update-coalesce-retry-');
  const bytes = Buffer.from('correct validated archive');
  let transfers = 0;
  const service = makeService(dir, async request => {
    if (request === RELEASE_URL) return new Response(JSON.stringify(metadata(bytes)), { status: 200 });
    transfers++;
    return transfers === 1
      ? { ok: true, headers: new Headers(), body: fakeStream([bytes.subarray(0, 2)], { broken: true }) }
      : new Response(bytes, { status: 200 });
  });
  assert.equal((await service.check()).status, 'available');
  const brokenA = service.download();
  const brokenB = service.download();
  assert.strictEqual(brokenA, brokenB);
  assert.equal((await brokenA).status, 502);
  assert.equal((await brokenB).status, 502);
  assert.deepEqual(await files(dir), [], 'failed shared transfer never leaves a published archive');
  const retry = await service.download();
  assert.equal(retry.ok, true, retry.error);
  assert.equal(transfers, 2);
  assert.deepEqual(await fs.readFile(service.downloadedPath()), bytes);
});
