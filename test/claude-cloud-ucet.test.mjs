import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { relaceZApi, nactiCloudoveRelace, nactiCloudovouRelaci, slucRelace, CLOUD_API, zpravaZUdalosti, slucPrepis } from '../src/connectors/claude-desktop-code.js';
import { prihlaseniClaudeCode } from '../src/platform.js';
import { tempDir, startTestServer, waitFor } from './helpers.mjs';

// Stav cloudových agentů Claude Code přímo z účtu (týž dotaz jako `claude --teleport`). Žádný test
// nesahá na skutečnou klíčenku, skutečné přihlášení ani síť: přihlášení i fetch jsou podstrčené.
const ted = Date.parse('2026-10-24T10:00:00Z');
const iso = (ms) => new Date(ted + ms).toISOString();
const surova = (o = {}) => ({ id: 'session_019pjCMAW6NZjG9fzTfPLyCe', title: 'AGTQ – nejnovější', status: 'active', worker_status: 'running', created_at: iso(-3600e3), last_event_at: iso(-5e3), config: { model: 'claude-opus-5-5', sources: [{ type: 'git_repository', url: 'https://github.com/martin-pok/agentree' }] }, ...o });
const odpoved = (status, body, hlavicky = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(hlavicky), json: async () => body });

test('relace z účtu: tvar jako seznam v cache, stav podle worker_status a archivace', () => {
  const r = relaceZApi(surova());
  assert.equal(r.id, 'session_019pjCMAW6NZjG9fzTfPLyCe');
  assert.equal(r.type, 'session');
  assert.equal(r.session_status, 'running');
  assert.equal(r.updated_at, iso(-5e3));
  assert.equal(r.session_context.model, 'claude-opus-5-5');
  assert.equal(relaceZApi(surova({ worker_status: 'requires_action' })).session_status, 'requires_action');
  assert.equal(relaceZApi(surova({ status: 'archived' })).session_status, 'archived');
  assert.equal(relaceZApi(surova({ worker_status: undefined })).session_status, 'idle');
  assert.equal(relaceZApi(surova({ id: 'cse_019pjCMAW6NZjG9fzTfPLyCe' })).id, 'session_019pjCMAW6NZjG9fzTfPLyCe');
  assert.equal(relaceZApi(surova({ id: '../etc' })), null);
  assert.equal(relaceZApi(surova({ last_event_at: 'nesmysl', updated_at: undefined, created_at: undefined })), null);
});

test('seznam z účtu: přihlášení, hlavičky a chyby, které se nikdy nevydávají za „nic neběží“', async () => {
  let dotaz;
  const fetchImpl = async (url, init) => { dotaz = { url, init }; return odpoved(200, { data: [surova(), { id: 'x' }] }); };
  const ok = await nactiCloudoveRelace({ prihlaseni: async () => ({ accessToken: 'tok', expiresAt: ted + 60e3 }), fetchImpl, now: ted });
  assert.equal(dotaz.url, CLOUD_API);
  assert.equal(dotaz.init.headers.Authorization, 'Bearer tok');
  assert.equal(dotaz.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(ok.sessions.length, 1);
  assert.equal(ok.observedAt, ted);
  const chyba = (o) => assert.rejects(nactiCloudoveRelace({ now: ted, prihlaseni: async () => ({ accessToken: 'tok', expiresAt: ted + 60e3 }), ...o }));
  await chyba({ prihlaseni: async () => null });
  await chyba({ prihlaseni: async () => ({ accessToken: 'tok', expiresAt: ted - 1 }) });
  await chyba({ fetchImpl: async () => odpoved(401, {}) });
  await chyba({ fetchImpl: async () => odpoved(500, {}) });
  await chyba({ fetchImpl: async () => { throw new Error('offline'); } });
  await chyba({ fetchImpl: async () => odpoved(200, { nic: true }) });
  // Vypršelé přihlášení se neobnovuje (obnova by odhlásila Claude Code) – dotaz vůbec neodejde.
  let odeslano = false;
  await assert.rejects(nactiCloudoveRelace({ now: ted, prihlaseni: async () => ({ accessToken: 'tok', expiresAt: ted - 1 }), fetchImpl: async () => { odeslano = true; return odpoved(200, { data: [] }); } }));
  assert.equal(odeslano, false);
});

test('sloučení s cache Claude Desktopu: platí pozdější pozorování, i když má starší cache „novější“ čas', () => {
  // Cache uložila relaci jako běžící před 10 minutami s updated_at novějším než last_event_at z účtu.
  const cache = { observedAt: ted - 600e3, sessions: [{ ...relaceZApi(surova()), updated_at: iso(-1e3), _observedAt: ted - 600e3 }] };
  const ucet = { observedAt: ted, sessions: [relaceZApi(surova({ worker_status: 'idle', last_event_at: iso(-60e3) }))] };
  const [r] = slucRelace(cache, ucet);
  assert.equal(r.session_status, 'idle', 'čerstvý stav z účtu přebije starou cache');
  assert.equal(r._observedAt, ted);
  assert.equal(slucRelace(ucet, cache)[0].session_status, 'idle', 'nezáleží na pořadí zdrojů');
  assert.equal(slucRelace(null, ucet).length, 1);
});

test('čekání na schválení: název nástroje z pending_action, jinak nic domyšleného', () => {
  const r = relaceZApi(surova({ worker_status: 'requires_action', external_metadata: { pending_action: { tool_name: 'Bash', tool_use_id: 't1' } } }));
  assert.match(r.post_turn_summary.needs_action, /Bash/);
  assert.equal(relaceZApi(surova({ worker_status: 'requires_action', external_metadata: { pending_action: { tool_name: '<img src=x>' } } })).post_turn_summary, undefined);
  assert.equal(relaceZApi(surova({ worker_status: 'running', external_metadata: { pending_action: { tool_name: 'Bash' } } })).post_turn_summary, undefined);
});

test('dotaz na účet: token nikdy nejde přes přesměrování, 429 nese pauzu, detail relace a 404', async () => {
  let init;
  await nactiCloudoveRelace({ now: ted, prihlaseni: async () => ({ accessToken: 'tok', expiresAt: 0 }), fetchImpl: async (u, i) => { init = i; return odpoved(200, { data: [] }); } });
  assert.equal(init.redirect, 'error');
  const e = await nactiCloudoveRelace({ now: ted, prihlaseni: async () => ({ accessToken: 'tok', expiresAt: 0 }), fetchImpl: async () => odpoved(429, {}, { 'retry-after': '42' }) }).catch((x) => x);
  assert.equal(e.pauzaMs, 42000);
  assert.doesNotMatch(e.message, /tok/);
  let url;
  const d = await nactiCloudovouRelaci('session_019pjCMAW6NZjG9fzTfPLyCe', { now: ted, prihlaseni: async () => ({ accessToken: 'tok', expiresAt: 0 }), fetchImpl: async (u) => { url = u; return odpoved(200, { session: surova({ worker_status: 'idle' }) }); } });
  assert.equal(url, `${CLOUD_API}/session_019pjCMAW6NZjG9fzTfPLyCe`);
  assert.equal(d.session_status, 'idle');
  assert.equal(d._observedAt, ted);
  assert.equal(await nactiCloudovouRelaci('session_019pjCMAW6NZjG9fzTfPLyCe', { now: ted, prihlaseni: async () => ({ accessToken: 'tok', expiresAt: 0 }), fetchImpl: async () => odpoved(404, {}) }), null);
  assert.equal(await nactiCloudovouRelaci('../../v1/x', { now: ted, prihlaseni: async () => ({ accessToken: 'tok', expiresAt: 0 }), fetchImpl: async () => { throw new Error('nesmí odejít'); } }), null);
});

test('přihlášení Claude Code: klíčenka jen když je povolená, se jménem položky jako Claude Code; jinde soubor', async () => {
  const volani = [];
  const runImpl = async (cmd, args) => { volani.push([cmd, args]); return { ok: true, stdout: JSON.stringify({ claudeAiOauth: { accessToken: 'a1', expiresAt: 123 } }) + '\n' }; };
  assert.equal(await prihlaseniClaudeCode({ sourceHome: '/x', keychain: false, uzivatel: 'martin' }, { runImpl, jeMac: true }), null);
  assert.equal(volani.length, 0);
  assert.deepEqual(await prihlaseniClaudeCode({ sourceHome: '/x', keychain: true, uzivatel: 'martin' }, { runImpl, jeMac: true }), { accessToken: 'a1', expiresAt: 123 });
  assert.deepEqual(volani[0], ['/usr/bin/security', ['find-generic-password', '-a', 'martin', '-w', '-s', 'Claude Code-credentials']]);
  await prihlaseniClaudeCode({ sourceHome: '/x', keychain: true, uzivatel: 'martin', claudeConfigDir: '/Users/martin/.claude-prace' }, { runImpl, jeMac: true });
  assert.equal(volani[1][1].at(-1), `Claude Code-credentials-${crypto.createHash('sha256').update('/Users/martin/.claude-prace').digest('hex').slice(0, 8)}`);
  assert.equal(await prihlaseniClaudeCode({ sourceHome: '/x', keychain: true, uzivatel: 'a b' }, { runImpl, jeMac: true }), null);
  const home = await tempDir('agenteeq-src-');
  assert.equal(await prihlaseniClaudeCode({ sourceHome: home }, { jeMac: false }), null);
  await fs.mkdir(path.join(home, '.claude'), { recursive: true });
  await fs.writeFile(path.join(home, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'b2', expiresAt: 9 } }));
  assert.deepEqual(await prihlaseniClaudeCode({ sourceHome: home }, { jeMac: false }), { accessToken: 'b2', expiresAt: 9 });
});

test('cloudový běh bez cache Claude Desktopu: z účtu je vidět jako pracující a čerstvý', async () => {
  let worker = 'running';
  const server = await startTestServer({}, { claudeCloud: { enabled: true, intervalMs: 60e3,
    prihlaseni: async () => ({ accessToken: 'tok', expiresAt: Date.now() + 3600e3 }),
    fetchImpl: async () => odpoved(200, { data: [surova({ worker_status: worker, last_event_at: new Date(Date.now() - 2000).toISOString(), created_at: new Date(Date.now() - 600e3).toISOString() })] }) } });
  try {
    const id = 'claude-desktop-code:session_019pjCMAW6NZjG9fzTfPLyCe';
    await waitFor(() => server.app.store.summary(id)?.status === 'working', 3000);
    assert.equal(server.app.store.summary(id).stale, false);
    worker = 'requires_action';
    await server.app.connectors['claude-desktop-code'].scan(true);
    await waitFor(() => server.app.store.summary(id)?.status === 'needs_input', 3000);
    const st = server.app.connectors['claude-desktop-code'].status();
    assert.equal(st.state, 'connected');
    assert.match(st.detail, /přímo z účtu Claude/);
  } finally { await server.close(); }
});

test('přihlášení se nečte pořád: drží se do vypršení, po nezdaru 10 minut pauza (Klíčenka se neptá dokola)', async () => {
  let cteni = 0, platne = false;
  const server = await startTestServer({}, { claudeCloud: { enabled: true, intervalMs: 60e3,
    prihlaseni: async () => { cteni++; return platne ? { accessToken: 'tok', expiresAt: Date.now() + 3600e3 } : null; },
    fetchImpl: async () => odpoved(200, { data: [] }) } });
  try {
    const c = server.app.connectors['claude-desktop-code'];
    assert.equal(cteni, 1);
    assert.match(c.status().detail, /nepodařilo přečíst/);
    platne = true;
    await c.scan(); await c.scan();
    assert.equal(cteni, 1, 'po nezdaru se Klíčenka hned znovu nečte');
    await c.scan(true);
    assert.equal(cteni, 2, 'ruční obnova zkusí přihlášení znovu');
    await c.scan(true); await c.scan(true);
    assert.equal(cteni, 2, 'platné přihlášení se drží v paměti');
    assert.equal(c.status().state, 'connected');
  } finally { await server.close(); }
});

test('běžící relace, která vypadla ze seznamu, se dotáže zvlášť a nezůstane viset jako „pracuje“', async () => {
  let seznam = [surova()];
  const dotazy = [];
  const server = await startTestServer({}, { claudeCloud: { enabled: true, intervalMs: 60e3, aktivniMs: 60e3,
    prihlaseni: async () => ({ accessToken: 'tok', expiresAt: Date.now() + 3600e3 }),
    fetchImpl: async (u) => {
      dotazy.push(u);
      if (u === CLOUD_API) return odpoved(200, { data: seznam.map((x) => ({ ...x, last_event_at: new Date(Date.now() - 1000).toISOString(), created_at: new Date(Date.now() - 600e3).toISOString() })) });
      return odpoved(200, { session: surova({ worker_status: 'idle', last_event_at: new Date(Date.now() - 500).toISOString(), created_at: new Date(Date.now() - 600e3).toISOString() }) });
    } } });
  try {
    const id = 'claude-desktop-code:session_019pjCMAW6NZjG9fzTfPLyCe';
    await waitFor(() => server.app.store.summary(id)?.status === 'working', 3000);
    seznam = [];
    await server.app.connectors['claude-desktop-code'].scan(true);
    assert.ok(dotazy.includes(`${CLOUD_API}/session_019pjCMAW6NZjG9fzTfPLyCe`));
    await waitFor(() => server.app.store.summary(id)?.status !== 'working', 3000);
  } finally { await server.close(); }
});

// Vlastník 24. 10. 2026: přepis a detail běhu musí naběhnout hned a čerstvý, ne až když Claude
// Desktop zapíše cache. Události relace se berou z účtu; obálka i plochá zpráva SDK.
test('přepis cloudového běhu z účtu: hned při otevření detailu, bez cache Claude Desktopu', async () => {
  const sid = 'session_019pjCMAW6NZjG9fzTfPLyCe';
  const kdy = (ms) => new Date(Date.now() - ms).toISOString();
  const udalosti = () => ({ data: [
    { created_at: kdy(20e3), user: { uuid: 'u1', internal_anthropic_catchall: { message: { role: 'user', content: 'Oprav dialog projektu' }, parent_tool_use_id: null } } },
    { type: 'assistant', uuid: 'a1', created_at: kdy(10e3), parent_tool_use_id: null, message: { role: 'assistant', content: [{ type: 'text', text: 'Opravuji rozložení.' }], usage: { input_tokens: 120, output_tokens: 30 } } },
  ] });
  const dotazy = [];
  const server = await startTestServer({}, { claudeCloud: { enabled: true, intervalMs: 60e3,
    prihlaseni: async () => ({ accessToken: 'tok', expiresAt: Date.now() + 3600e3 }),
    fetchImpl: async (u) => {
      dotazy.push(u);
      if (u === `${CLOUD_API}/${sid}/events?limit=100`) return odpoved(200, udalosti());
      return odpoved(200, { data: [surova({ worker_status: 'idle', last_event_at: kdy(5e3), created_at: kdy(600e3) })] });
    } } });
  try {
    const id = `claude-desktop-code:${sid}`;
    await waitFor(() => server.app.store.summary(id), 3000);
    const r = await fetch(`${server.url}/api/sessions/${encodeURIComponent(id)}`, { headers: server.headers });
    const detail = await r.json();
    const texty = JSON.stringify(detail.transcript);
    assert.match(texty, /Oprav dialog projektu/, 'zadání z účtu je v přepisu hned při prvním otevření');
    assert.match(texty, /Opravuji rozložení/);
    assert.ok(dotazy.includes(`${CLOUD_API}/${sid}/events?limit=100`));
  } finally { await server.close(); }
});

test('události relace: obálka i plochá zpráva, sloučení s cache bez dvojic', () => {
  assert.equal(zpravaZUdalosti({ created_at: iso(0), nic: {} }), null);
  const z = zpravaZUdalosti({ created_at: iso(-1e3), assistant: { uuid: 'a1', internal_anthropic_catchall: { message: { content: [] } } } });
  assert.equal(z.type, 'assistant');
  assert.equal(z.uuid, 'a1');
  assert.equal(z.created_at, iso(-1e3));
  const cache = { writtenAt: 5, tree: { kind: 'code_session', messages: [{ type: 'user', uuid: 'u1', created_at: iso(-3e3) }] } };
  const spolu = slucPrepis(cache, { at: ted, messages: [{ type: 'user', uuid: 'u1', created_at: iso(-3e3) }, z] });
  assert.deepEqual(spolu.tree.messages.map((m) => m.uuid), ['u1', 'a1']);
  assert.equal(slucPrepis(cache, null), cache);
});
