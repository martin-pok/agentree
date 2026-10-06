import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeJsonAtomic } from '../src/util.js';

// Windows: přejmenování na soubor, který má na okamžik otevřený jiný proces (antivir, indexování,
// čtenář dat), selže s EPERM. Zápis se nesmí ztratit – zkusí se znovu a dočasný soubor nezůstane.
test('atomický zápis přežije krátký zámek souboru (EPERM na Windows)', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-zapis-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'data.json');
  const puvodni = fs.rename;
  let selhani = 2;
  const m = mock.method(fs, 'rename', async (a, b) => {
    if (selhani-- > 0) throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    return puvodni(a, b);
  });
  t.after(() => m.mock.restore());
  await writeJsonAtomic(file, { ok: 1 });
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { ok: 1 });
  assert.equal(m.mock.callCount(), 3);
  assert.deepEqual((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp')), []);
});

test('atomický zápis: trvalá chyba se nahlásí a dočasný soubor se uklidí', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-zapis-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const m = mock.method(fs, 'rename', async () => { throw Object.assign(new Error('no space'), { code: 'ENOSPC' }); });
  t.after(() => m.mock.restore());
  await assert.rejects(writeJsonAtomic(path.join(dir, 'data.json'), { ok: 1 }), /no space/);
  assert.equal(m.mock.callCount(), 1, 'neprechodná chyba se neopakuje');
  assert.deepEqual(await fs.readdir(dir), []);
});
