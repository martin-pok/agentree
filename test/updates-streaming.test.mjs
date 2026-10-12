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
