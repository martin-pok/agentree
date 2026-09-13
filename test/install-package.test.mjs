import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, api, tempDir } from './helpers.mjs';
import { findInstallPackage } from '../src/app.js';
import { VERSION } from '../src/config.js';

// Instalace pro další lidi (Nastavení → Aplikace na tomto Macu): server zjišťuje, jestli hotový
// instalační balíček (dist/Agenteeq-<verze>-macOS-<arch>.zip, viz scripts/build-macos.mjs) existuje,
// a nabízí „Ukázat ve Finderu“. Cesta se vždy odvozuje ze serveru (distDir), nikdy z požadavku klienta.

test('findInstallPackage: chybějící balíček vrací null', async () => {
  const dir = await tempDir('agenteeq-dist-empty-');
  assert.equal(await findInstallPackage(dir), null);
  assert.equal(await findInstallPackage(dir, '9.9.9', 'arm64'), null);
});

test('findInstallPackage: existující balíček vrátí název, cestu a velikost', async () => {
  const dir = await tempDir('agenteeq-dist-');
  const name = 'Agenteeq-1.2.3-macOS-arm64.zip';
  const file = path.join(dir, name);
  const body = Buffer.alloc(12345, 1);
  await fs.writeFile(file, body);

  const pkg = await findInstallPackage(dir, '1.2.3', 'arm64');
  assert.ok(pkg);
  assert.equal(pkg.name, name);
  assert.equal(pkg.path, file);
  assert.equal(pkg.size, body.length);
  assert.equal(pkg.version, '1.2.3');
  assert.equal(pkg.arch, 'arm64');
  assert.ok(pkg.createdAt > 0);

  // Jiná verze nebo architektura se nenajde, i když ve složce nějaký balíček je.
  assert.equal(await findInstallPackage(dir, '1.2.4', 'arm64'), null);
  assert.equal(await findInstallPackage(dir, '1.2.3', 'x64'), null);
});

test('/api/state a /api/install/reveal: balíček chybí, pak existuje (režim dry nic nespouští)', async () => {
  const distDir = await tempDir('agenteeq-dist-http-');
  const s = await startTestServer({}, { distDir });
  try {
    const client = api(s.url);

    // 1) Balíček zatím neexistuje.
    let state = await client.get('/api/state');
    assert.equal(state.body.integrations.install.package, null);

    const missing = await client.send('POST', '/api/install/reveal', {});
    assert.equal(missing.status, 404);
    assert.match(missing.body.error, /build:mac/);

    // Ochrana proti CSRF platí stejně jako u ostatních mutací.
    const noHeader = await client.send('POST', '/api/install/reveal', {}, {});
    assert.equal(noHeader.status, 403);

    // 2) Balíček se objeví na disku (přesně tak, jak ho ukládá scripts/build-macos.mjs).
    const name = `Agenteeq-${VERSION}-macOS-${process.arch}.zip`;
    const file = path.join(distDir, name);
    const body = Buffer.alloc(4096, 7);
    await fs.writeFile(file, body);

    state = await client.get('/api/state');
    const pkg = state.body.integrations.install.package;
    assert.ok(pkg, 'balíček je vidět v integrations.install.package');
    assert.equal(pkg.name, name);
    assert.equal(pkg.size, body.length);

    // 3) V režimu dry (test i ruční QA) se nic nespustí, jen se vrátí plán.
    const r = await client.send('POST', '/api/install/reveal', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.dry, true);
    assert.deepEqual(r.body.plan, { kind: 'open', args: ['-R', file], label: 'Finder' });
  } finally {
    await s.close();
  }
});
