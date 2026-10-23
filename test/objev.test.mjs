import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { nalezeneNastroje, cestaNapojeni, APLIKACE, PROGRAMY } from '../src/objev.js';
import { RUNTIMES } from '../src/connectors/processes.js';
import { startTestServer, api } from './helpers.mjs';

// Okno „Našli jsme na tvém Macu“ (src/objev.js, public/js/objev-ui.js). Nalezeno smí být jen to,
// co je ověřené; neověřené hledání se hlásí jako „nehledalo se“, ne jako „nic tu není“.

const katalog = (id) => RUNTIMES.find((r) => r.id === id);

test('objev: každý název aplikace a programu patří nástroji z katalogu', () => {
  for (const id of [...Object.keys(APLIKACE), ...Object.keys(PROGRAMY)]) assert.ok(katalog(id), id);
  // Jména, která nosí i jiné běžné programy, se nehledají (goose je i nástroj na migrace databází).
  for (const id of ['goose', 'amp', 'crush', 'droid']) assert.equal(PROGRAMY[id], undefined, id);
});

test('objev: cesta napojení podle toho, co o nástroji Agenteeq opravdu umí', () => {
  assert.equal(cestaNapojeni(katalog('claude-code')), 'prihlaseni');
  assert.equal(cestaNapojeni(katalog('codex')), 'prihlaseni');
  assert.equal(cestaNapojeni(katalog('claude-desktop')), 'zaznamy');
  assert.equal(cestaNapojeni(katalog('cursor')), 'zaznamy');
  assert.equal(cestaNapojeni(katalog('pwa-chatgpt')), 'rozsireni');
  assert.equal(cestaNapojeni(katalog('pwa-google-ai-studio')), 'rozsireni');
  assert.equal(cestaNapojeni(katalog('warp')), 'beh');
});

test('objev: nalezeno jen ověřené – běží, aplikace na disku, program v PATH, nebo tu dřív běžel', () => {
  const r = nalezeneNastroje({
    runtimes: [{ id: 'cursor', running: true }],
    zaznamy: { warp: { stav: 'novy', poprve: 1, naposledy: 1 }, zed: { stav: 'ignorovany', poprve: 1, naposledy: 1 } },
    bins: () => ({ claude: '/usr/local/bin/claude', aider: '/opt/bin/aider' }),
    app: (jmena) => jmena.includes('ChatGPT'),
    napojeni: [{ id: 'claude-code', napojeno: true, nainstalovano: true }],
    pripojene: new Set(['codex']),
    webStav: 'missing',
  });
  const podle = Object.fromEntries(r.nastroje.map((n) => [n.id, n]));
  assert.equal(r.hledano, true);
  assert.deepEqual(Object.keys(podle).sort(), ['aider', 'chatgpt', 'claude-code', 'cursor', 'warp', 'zed']);
  assert.equal(r.nastroje[0].id, 'cursor', 'běžící nástroj je první');
  assert.equal(podle.cursor.kde, 'bezi');
  assert.equal(podle.chatgpt.kde, 'aplikace');
  assert.equal(podle['claude-code'].kde, 'program');
  assert.equal(podle.warp.kde, 'drive');
  // Napojeno jen podle ověřeného: přihlášení potvrzené nástrojem, konektor s daty.
  assert.equal(podle['claude-code'].napojeno, true);
  assert.equal(podle.chatgpt.napojeno, true, 'konektor Codexu má data');
  assert.equal(podle.cursor.napojeno, false);
  assert.equal(podle.zed.ignorovano, true);
  assert.equal(podle.aider.overeno, false, 'neověřené rozpoznání nese Beta');
  assert.equal(r.web.sparovano, false);
  assert.ok(r.web.sluzby.includes('ChatGPT'));
});

test('objev: nehledalo se = „nevím“, ne „nic tu není“; přihlášení, které nejde ověřit, není napojené', () => {
  const r = nalezeneNastroje({ bins: () => null, app: () => null });
  assert.equal(r.hledano, false);
  assert.deepEqual(r.nastroje, []);
  const s = nalezeneNastroje({ runtimes: [{ id: 'codex', running: true }], napojeni: [{ id: 'codex', napojeno: null }], webStav: 'quiet' });
  assert.equal(s.nastroje[0].napojeno, null);
  assert.equal(s.web.sparovano, true);
});

test('objev: /api/objev jen u Macu a okno se po zavření už samo neukáže', async () => {
  const srv = await startTestServer();
  try {
    const klient = api(srv.url);
    await srv.app.refreshLaunch();
    const r = await klient.get('/api/objev');
    assert.equal(r.status, 200);
    const ids = r.body.nastroje.map((n) => n.id);
    assert.ok(ids.includes('claude-code') && ids.includes('codex'), ids.join(','));
    assert.equal(r.body.nastroje.find((n) => n.id === 'claude-code').cesta, 'prihlaseni');
    const zTelefonu = await fetch(`${srv.url}/api/objev`, { headers: { 'X-Forwarded-For': '100.64.0.9' } });
    assert.equal(zTelefonu.status, 403);

    assert.equal((await klient.get('/api/state')).body.settings.objevHotovo, false);
    const ulozeno = await klient.send('PUT', '/api/settings', { objevHotovo: true });
    assert.equal(ulozeno.status, 200);
    assert.equal(ulozeno.body.settings.objevHotovo, true);
    await srv.app.datastore.flush?.();
    const disk = JSON.parse(await fs.readFile(srv.app.datastore.file, 'utf8'));
    assert.equal(disk.settings.objevHotovo, true);
  } finally {
    await srv.close();
  }
});
