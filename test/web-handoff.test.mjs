import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, api, pairExtension, EXTENSION_ORIGIN } from './helpers.mjs';

// Gemini ani Qwen neumí převzít zadání z adresy. Po spuštění z Agenteeq si ho proto vyzvedne
// rozšíření v prohlížeči a vloží do pole zprávy. Zadání je text uživatele – nesmí ho dostat nikdo
// jiný, nesmí se dát vyzvednout dvakrát a nesmí zůstat viset.

test('předání zadání do webové služby přes rozšíření', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  const hookToken = JSON.parse(await fs.readFile(path.join(srv.dataHome, 'data.json'), 'utf8')).ingestToken;
  const { token } = await pairExtension(srv.url);
  const vyzvednout = (site, headers = { 'X-Agenteeq-Token': token, Origin: EXTENSION_ORIGIN }) => a.send('POST', '/api/extension/handoff', { site }, headers);

  await t.test('bez spuštění není co vyzvednout', async () => {
    const r = await vyzvednout('gemini');
    assert.equal(r.status, 200);
    assert.equal(r.body.prompt, null);
  });

  await t.test('spuštění Gemini nechá zadání připravené a hlásí, že ho zkopírovalo', async () => {
    const r = await a.send('POST', '/api/launch', { agent: 'gemini', mode: 'web', prompt: 'Navrhni název kavárny' });
    assert.equal(r.status, 200);
    assert.equal(r.body.copyPrompt, true);
    assert.equal(r.body.copied, true, 'schránku plní server, ne okno');
    // Rozšíření se už v předchozím kroku ozvalo s platným tokenem, takže vložení slíbit lze.
    // Stav bez spárování hlídá test/extension-presence.test.mjs.
    assert.equal(r.body.autofill, true);
  });

  await t.test('bez tokenu rozšíření zadání nedostane nikdo', async () => {
    assert.equal((await vyzvednout('gemini', {})).status, 401);
    assert.equal((await vyzvednout('gemini', { 'X-Agenteeq-Token': 'x'.repeat(token.length), Origin: EXTENSION_ORIGIN })).status, 401);
    assert.equal((await vyzvednout('gemini', { 'X-Agenteeq-Token': hookToken, Origin: EXTENSION_ORIGIN })).status, 401, 'token hooků zadání nevyzvedne');
    assert.equal((await vyzvednout('gemini', { 'X-Agenteeq-Token': token, Origin: 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba' })).status, 401, 'token platí jen z původu, kterému byl vydán');
    assert.equal((await vyzvednout('gemini', { 'X-Agenteeq-Token': token })).status, 401, 'bez původu token neplatí');
  });

  await t.test('jiná služba zadání neukradne', async () => {
    assert.equal((await vyzvednout('chatgpt')).body.prompt, null);
  });

  await t.test('správná služba ho dostane právě jednou', async () => {
    const r = await vyzvednout('gemini');
    assert.equal(r.body.prompt, 'Navrhni název kavárny');
    assert.equal(r.body.prefilled, false, 'Gemini adresu se zadáním neumí');
    assert.equal((await vyzvednout('gemini')).body.prompt, null);
  });

  await t.test('služba s předvyplněním z adresy dostane příznak, aby zadání nezdvojila', async () => {
    await a.send('POST', '/api/launch', { agent: 'claude-web', mode: 'web', prompt: 'Shrň článek' });
    const r = await vyzvednout('claude');
    assert.equal(r.body.prompt, 'Shrň článek', 'Claude.ai se v rozšíření jmenuje „claude“');
    assert.equal(r.body.prefilled, true);
  });

  await t.test('nesmyslný vstup nespadne', async () => {
    for (const site of [null, 42, '', '../etc', { x: 1 }]) {
      const r = await vyzvednout(site);
      assert.equal(r.status, 200);
      assert.equal(r.body.prompt, null);
    }
  });
});
