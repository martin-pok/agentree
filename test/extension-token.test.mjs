import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, api, waitFor, pairExtension, EXTENSION_ORIGIN } from './helpers.mjs';

// Do 0.24.0 dostalo každé spárované rozšíření token hooků Claude Code. Kdo ho získal z kteréhokoli
// prohlížeče, mohl podvrhnout hooky i data ostatních prohlížečů a nové spárování ho nezměnilo
// (docs/SECURITY.md, nález #7). Teď má každá instalace vlastní token platný jen z jejího původu.

const DRUHY_PUVOD = 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba';

test('token rozšíření: vlastní pro každou instalaci, oddělený od hooků', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  const hookToken = srv.app.datastore.data.ingestToken;
  const hello = (token, origin = EXTENSION_ORIGIN) => a.send('POST', '/api/extension/hello', { version: '0.0.1' }, { 'X-Agenteeq-Token': token, Origin: origin });
  const hook = (token) => a.send('POST', '/api/hooks/claude-code', { hook_event_name: 'Stop', session_id: crypto.randomUUID(), cwd: '/tmp' }, { 'X-Agenteeq-Token': token });

  const prvni = await pairExtension(srv.url, { installationId: 'profil-prace-0001' });
  assert.equal(prvni.status, 200);

  await t.test('token rozšíření neotevře hooky a token hooků neotevře rozšíření', async () => {
    assert.equal((await hook(prvni.token)).status, 401);
    assert.equal((await hello(hookToken)).status, 401);
    assert.ok([200, 202, 204].includes((await hook(hookToken)).status), 'hooky dál fungují se svým tokenem');
    assert.equal((await hello(prvni.token)).status, 200);
  });

  await t.test('na disku leží jen hash tokenu, ne token', async () => {
    const data = await waitFor(async () => {
      const d = JSON.parse(await fs.readFile(path.join(srv.dataHome, 'data.json'), 'utf8'));
      return d.extensionInstallations?.length ? d : null;
    });
    const text = JSON.stringify(data);
    assert.ok(!text.includes(prvni.token), 'surový token se nesmí uložit');
    assert.equal(data.extensionInstallations[0].tokenHash, crypto.createHash('sha256').update(prvni.token).digest('hex'));
    assert.equal(data.extensionInstallations[0].origin, EXTENSION_ORIGIN);
  });

  const druha = await pairExtension(srv.url, { origin: DRUHY_PUVOD, installationId: 'profil-doma-00002' });

  await t.test('druhá instalace má jiný token a každý platí jen ze svého původu', async () => {
    assert.equal(druha.status, 200);
    assert.notEqual(druha.token, prvni.token);
    assert.equal((await hello(druha.token, DRUHY_PUVOD)).status, 200);
    assert.equal((await hello(prvni.token, DRUHY_PUVOD)).status, 401);
    assert.equal((await hello(druha.token, EXTENSION_ORIGIN)).status, 401);
  });

  await t.test('nové spárování téže instalace zneplatní její starý token, jiné instalace nechá být', async () => {
    const znovu = await pairExtension(srv.url, { installationId: 'profil-prace-0001' });
    assert.equal(znovu.status, 200);
    assert.equal((await hello(prvni.token)).status, 401, 'starý token už neplatí');
    assert.equal((await hello(znovu.token)).status, 200);
    assert.equal((await hello(druha.token, DRUHY_PUVOD)).status, 200, 'druhý prohlížeč zůstal spárovaný');
    assert.equal(srv.app.datastore.data.extensionInstallations.length, 2);
  });

  await t.test('instalací je nejvýš pět, nejstarší vypadne', async () => {
    const nove = [];
    for (let i = 0; i < 5; i++) nove.push(await pairExtension(srv.url, { installationId: `dalsi-profil-${i}0000` }));
    assert.equal(srv.app.datastore.data.extensionInstallations.length, 5);
    assert.equal((await hello(druha.token, DRUHY_PUVOD)).status, 401, 'nejstarší instalace vypadla');
    for (const n of nove) assert.equal((await hello(n.token)).status, 200);
  });
});

test('párování bez ID instalace (starší rozšíření) drží jeden token na původ', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  const hello = (token) => a.send('POST', '/api/extension/hello', {}, { 'X-Agenteeq-Token': token, Origin: EXTENSION_ORIGIN });
  const prvni = await pairExtension(srv.url);
  const druhe = await pairExtension(srv.url, { installationId: 'neplatne id!' });
  assert.equal(prvni.status, 200);
  assert.equal(druhe.status, 200);
  assert.equal((await hello(prvni.token)).status, 401, 'nové spárování nahradilo staré');
  assert.equal((await hello(druhe.token)).status, 200);
  assert.equal(srv.app.datastore.data.extensionInstallations.length, 1);
});
