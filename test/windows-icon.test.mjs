import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('Windows ICO is built from the identical SVG-derived source used in Chrome extension', async () => {
  const make = await fs.readFile(path.join(root, 'scripts/make-ico.mjs'), 'utf8');
  const build = await fs.readFile(path.join(root, 'scripts/build-windows.mjs'), 'utf8');
  assert.match(make, /'extension', 'icons', 'icon-128\.png'/, 'old desktop icon must never be the source');
  assert.match(build, /run\(process\.execPath, \['scripts\/make-ico\.mjs'\]\)/, 'Windows build must refresh ICO before rc.exe');
  assert.ok(build.indexOf("run(process.execPath, ['scripts/make-ico.mjs'])") < build.indexOf("run('rc.exe'"));
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-ico-'));
  try {
    const target = path.join(temp, 'Windows.ico');
    execFileSync(process.execPath, ['scripts/make-ico.mjs'], {
      cwd: root, env: { ...process.env, AGENTEEQ_ICON_OUT: target }, timeout: 20000,
    });
    const b = await fs.readFile(target);
    assert.equal(b.readUInt16LE(0), 0);
    assert.equal(b.readUInt16LE(2), 1);
    assert.equal(b.readUInt16LE(4), sizes.length);
    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i], at = 6 + i*16;
      assert.equal(b[at], size === 256 ? 0 : size);
      assert.equal(b[at+1], size === 256 ? 0 : size);
      const bytes = b.readUInt32LE(at+8), offset = b.readUInt32LE(at+12);
      assert.ok(bytes > 80 && offset + bytes <= b.length, `image ${size} payload`);
      assert.ok(b.subarray(offset, offset+8).equals(pngMagic), `image ${size} has PNG payload`);
      assert.equal(b.readUInt32BE(offset+16), size);
      assert.equal(b.readUInt32BE(offset+20), size);
    }
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
