import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { migrateLegacyData } from '../src/migrate.js';
import { tempDir } from './helpers.mjs';

test('migrace dat: jednou zkopíruje, nepřepíše, original zůstane', async () => {
  const root = await tempDir();
  const legacyDir = path.join(root, '.legacy');
  const dataDir = path.join(root, '.agenteeq');
  await fs.mkdir(legacyDir, { recursive: true });
  const original = JSON.stringify({ ingestToken: 'a'.repeat(48), alerts: [{ id: 'x' }] });
  await fs.writeFile(path.join(legacyDir, 'data.json'), original);

  const first = await migrateLegacyData({ dataDir, legacyDir });
  assert.equal(first.migrated, true);
  assert.equal(await fs.readFile(path.join(dataDir, 'data.json'), 'utf8'), original);
  assert.equal((await fs.stat(path.join(dataDir, 'data.json'))).mode & 0o777, 0o600);
  assert.equal(await fs.readFile(path.join(legacyDir, 'data.json'), 'utf8'), original, 'originál beze změny');

  await fs.writeFile(path.join(dataDir, 'data.json'), '{"novy":true}');
  const second = await migrateLegacyData({ dataDir, legacyDir });
  assert.deepEqual(second, { migrated: false, reason: 'exists' });
  assert.equal(await fs.readFile(path.join(dataDir, 'data.json'), 'utf8'), '{"novy":true}');
});

test('migrace dat: bez staré složky nebo při vlastní datové složce nic nedělá', async () => {
  const root = await tempDir();
  assert.deepEqual(await migrateLegacyData({ dataDir: path.join(root, 'a'), legacyDir: path.join(root, 'neni') }), { migrated: false, reason: 'no-legacy' });
  assert.deepEqual(await migrateLegacyData({ dataDir: path.join(root, 'a'), legacyDir: null }), { migrated: false, reason: 'disabled' });
});
