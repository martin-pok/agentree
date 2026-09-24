import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTI, WEBY, createNapojeni, prikazPrihlaseni } from '../src/napojeni.js';
import { startTestServer, api, openStream, waitFor, pairExtension, EXTENSION_ORIGIN } from './helpers.mjs';

// Napojení modelů tlačítkem (src/napojeni.js). Přihlašuje se u dodavatele; Agenteeq jen spustí jeho
// přihlášení a ptá se, jestli je hotovo. V testech odpovídá místo claude/codex atrapa.

test('stav přihlášení se čte jen z ověřeného výstupu – neznámý výstup je „nevím“, ne „ne“', () => {
  const claude = AGENTI['claude-code'].precti;
  assert.equal(claude({ stdout: '{"loggedIn":true,"authMethod":"claude.ai"}' }), true);
  assert.equal(claude({ stdout: '{"loggedIn":false}' }), false);
  assert.equal(claude({ stdout: 'command not found' }), null);
  assert.equal(claude({ stdout: '{"cosi":1}' }), null);
  const codex = AGENTI.codex.precti;
  // Codex píše stav na stderr (codex-rs/cli/src/login.rs).
  assert.equal(codex({ stdout: '', stderr: 'Logged in using ChatGPT\n' }), true);
  assert.equal(codex({ stdout: '', stderr: 'Logged in using an API key - sk-…abcd\n' }), true);
  assert.equal(codex({ stdout: '', stderr: 'Not logged in\n' }), false);
  assert.equal(codex({ stdout: '', stderr: 'Error checking login status: …' }), null);
});

test('příkaz přihlášení je pevný, cesta k nástroji se v shellu neroztrhne', () => {
  assert.equal(prikazPrihlaseni('/Users/eva/Design & Web/bin/claude', ['auth', 'login']), "'/Users/eva/Design & Web/bin/claude' auth login");
  assert.equal(prikazPrihlaseni("/opt/it's/codex", ['login']), "'/opt/it'\\''s/codex' login");
});

// Atrapa nástrojů: `prihlasen` se dá přepnout, jako by člověk dokončil přihlášení v prohlížeči.
function atrapa({ prihlasen = { claude: false, codex: false }, terminalOk = true } = {}) {
  const zapis = { terminal: [], open: [], emit: [], run: [] };
  const n = createNapojeni({
    bins: () => ({ claude: '/usr/local/bin/claude', codex: '/usr/local/bin/codex' }),
    run: async (bin, args) => {
      zapis.run.push([bin, ...args]);
      if (bin.endsWith('claude')) return { ok: true, stdout: JSON.stringify({ loggedIn: prihlasen.claude }), stderr: '' };
      return { ok: prihlasen.codex, stdout: '', stderr: prihlasen.codex ? 'Logged in using ChatGPT' : 'Not logged in' };
    },
    terminal: async (prikaz) => { zapis.terminal.push(prikaz); return terminalOk ? { ok: true } : { ok: false, error: 'macOS nepovolil ovládání Terminálu.' }; },
    open: async (url) => { zapis.open.push(url); return { ok: true }; },
    emit: (u) => zapis.emit.push(u),
    plan: async (id) => (id === 'claude-code' ? 'Claude Max' : ''),
    extension: () => zapis.rozsireni || { state: 'missing' },
    intervalMs: 5,
    limitMs: 400,
  });
  return { n, zapis, prihlasen };
}

test('napojení Claude Code: přihlášení se spustí v Terminálu a po dokončení přijde potvrzení s plánem', async () => {
  const { n, zapis, prihlasen } = atrapa();
  const r = await n.napojit('claude-code');
  assert.deepEqual({ ok: r.ok, ceka: r.ceka }, { ok: true, ceka: true });
  assert.deepEqual(zapis.terminal, ["'/usr/local/bin/claude' auth login"]);
  await new Promise((res) => setTimeout(res, 30));
  assert.equal(zapis.emit.length, 0, 'dokud se člověk nepřihlásí, nic se nepotvrzuje');
  prihlasen.claude = true;
  await waitFor(() => zapis.emit.length);
  assert.deepEqual(zapis.emit[0], { id: 'claude-code', label: 'Claude Code', udalost: 'napojeno', plan: 'Claude Max' });
  assert.equal(n.ceka('claude-code'), false, 'po potvrzení se přestane hlídat');
});

test('už napojený Codex se jen potvrdí, Terminál se neotvírá', async () => {
  const { n, zapis } = atrapa({ prihlasen: { claude: false, codex: true } });
  const r = await n.napojit('codex');
  assert.equal(r.uz, true);
  assert.deepEqual(zapis.terminal, []);
  assert.equal(zapis.emit[0].udalost, 'napojeno');
  assert.equal(zapis.emit[0].uz, true);
});

test('když přihlášení nedoběhne, hlídání skončí zprávou „vypršelo“; zrušení hlídání zastaví hned', async () => {
  const { n, zapis } = atrapa();
  await n.napojit('codex');
  await waitFor(() => zapis.emit.find((u) => u.udalost === 'vyprselo'), 3000);
  assert.equal(n.ceka('codex'), false);

  const druhy = atrapa();
  await druhy.n.napojit('claude-code');
  druhy.n.zrusit('claude-code');
  const volaniPoZruseni = druhy.zapis.run.length;
  await new Promise((res) => setTimeout(res, 40));
  assert.equal(druhy.zapis.run.length, volaniPoZruseni, 'po zrušení se nástroj už neptá');
});

test('bez Terminálu dostane člověk příkaz k ručnímu spuštění', async () => {
  const { n } = atrapa({ terminalOk: false });
  const r = await n.napojit('claude-code');
  assert.equal(r.status, 422);
  assert.match(r.error, /claude' auth login/);
  assert.equal(n.ceka('claude-code'), false);
});

test('webový chat se napojí přes rozšíření: otevře se služba a potvrdí ho první stav z ní', async () => {
  const { n, zapis } = atrapa();
  const bez = await n.napojit('web:chatgpt');
  assert.equal(bez.status, 409, 'bez rozšíření se jen poradí, co dělat');
  assert.equal(bez.rozsireni, true);
  zapis.rozsireni = { state: 'ready', sites: {} };
  const r = await n.napojit('web:chatgpt');
  assert.equal(r.ceka, true);
  assert.deepEqual(zapis.open, [WEBY.chatgpt.url]);
  n.webOzvalo('gemini');
  assert.equal(zapis.emit.length, 0, 'ozvala se jiná služba');
  n.webOzvalo('chatgpt');
  assert.deepEqual(zapis.emit[0], { id: 'web:chatgpt', label: 'ChatGPT', udalost: 'napojeno' });
  assert.equal((await n.napojit('web:neznamy')).status, 404);
});

test('přehled: nenainstalovaný nástroj, nevím, napojeno a webové chaty podle rozšíření', async () => {
  const { n, zapis } = atrapa({ prihlasen: { claude: true, codex: false } });
  zapis.rozsireni = { state: 'active', sites: { claude: Date.now() } };
  const p = Object.fromEntries((await n.prehled()).map((x) => [x.id, x]));
  assert.deepEqual({ napojeno: p['claude-code'].napojeno, plan: p['claude-code'].plan }, { napojeno: true, plan: 'Claude Max' });
  assert.equal(p.codex.napojeno, false);
  assert.equal(p['web:claude'].napojeno, true);
  assert.equal(p['web:chatgpt'].napojeno, null, 'rozšíření je, jen z ChatGPT zatím nic nepřišlo');
  const nic = createNapojeni({ bins: () => ({}), run: async () => ({}), terminal: async () => ({ ok: true }), open: async () => ({ ok: true }) });
  const p2 = Object.fromEntries((await nic.prehled()).map((x) => [x.id, x]));
  assert.equal(p2['claude-code'].nainstalovano, false);
  assert.equal(p2['web:chatgpt'].nainstalovano, false);
});

test('HTTP: napojení jen z tohoto Macu, potvrzení přijde živým proudem i z rozšíření', async () => {
  const stav = { claude: false };
  const napojeniRun = async (bin) => (bin.endsWith('claude')
    ? { ok: true, stdout: JSON.stringify({ loggedIn: stav.claude }), stderr: '' }
    : { ok: false, stdout: '', stderr: 'Not logged in' });
  const srv = await startTestServer({}, { napojeniRun });
  const proud = await openStream(srv.url);
  try {
    const klient = api(srv.url);
    await srv.app.refreshLaunch();
    const prehled = await klient.get('/api/napojeni');
    assert.equal(prehled.status, 200);
    assert.equal(prehled.body.napojeni.find((x) => x.id === 'claude-code').napojeno, false);
    const zTelefonu = await fetch(`${srv.url}/api/napojeni`, { headers: { 'X-Forwarded-For': '100.64.0.9' } });
    assert.equal(zTelefonu.status, 403);

    const r = await klient.send('POST', '/api/napojeni/claude-code', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.ceka, true);
    stav.claude = true;
    const u = await waitFor(() => proud.events.find((e) => e.event === 'napojeni' && e.data.id === 'claude-code'), 6000);
    assert.equal(u.data.udalost, 'napojeno');

    assert.equal((await klient.send('POST', '/api/napojeni/nic-takoveho', {})).status, 404);
    const web = await klient.send('POST', '/api/napojeni/web:chatgpt', {});
    assert.equal(web.status, 409);
    assert.equal(web.body.rozsireni, true);

    // Se spárovaným rozšířením: první stav z ChatGPT napojení potvrdí.
    const par = await pairExtension(srv.url);
    assert.equal((await klient.send('POST', '/api/napojeni/web:chatgpt', {})).status, 200);
    const ingest = await klient.send('POST', '/api/ingest/web', { site: 'chatgpt', conversationId: 'abc-1', url: 'https://chatgpt.com/c/abc-1', generating: false, counts: { user: 1, assistant: 1 } }, { 'X-Agenteeq-Token': par.token, Origin: EXTENSION_ORIGIN });
    assert.equal(ingest.status, 200);
    const w = await waitFor(() => proud.events.find((e) => e.event === 'napojeni' && e.data.id === 'web:chatgpt'));
    assert.equal(w.data.label, 'ChatGPT');
  } finally {
    proud.close();
    await srv.close();
  }
});
