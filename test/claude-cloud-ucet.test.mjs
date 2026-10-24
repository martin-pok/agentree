import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { relaceZApi, nactiCloudoveRelace, slucRelace, CLOUD_API } from '../src/connectors/claude-desktop-code.js';
import { prihlaseniClaudeCode } from '../src/platform.js';
import { tempDir, startTestServer, waitFor } from './helpers.mjs';

// Stav cloudových agentů Claude Code přímo z účtu (týž dotaz jako `claude --teleport`). Žádný test
// nesahá na skutečnou klíčenku, skutečné přihlášení ani síť: přihlášení i fetch jsou podstrčené.
const ted = Date.parse('2026-10-24T10:00:00Z');
const iso = (ms) => new Date(ted + ms).toISOString();
const surova = (o = {}) => ({ id: 'session_019pjCMAW6NZjG9fzTfPLyCe', title: 'AGTQ – nejnovější', status: 'active', worker_status: 'running', created_at: iso(-3600e3), last_event_at: iso(-5e3), config: { model: 'claude-opus-5-5', sources: [{ type: 'git_repository', url: 'https://github.com/martin-pok/agentree' }] }, ...o });
const odpoved = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

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

test('sloučení s cache Claude Desktopu: novější stav vyhrává, při shodě pozdější načtení', () => {
  const cache = { observedAt: ted - 600e3, sessions: [{ ...relaceZApi(surova({ worker_status: 'idle' })), updated_at: iso(-700e3), _observedAt: ted - 600e3 }] };
  const ucet = { observedAt: ted, sessions: [relaceZApi(surova())] };
  const [r] = slucRelace(cache, ucet);
  assert.equal(r.session_status, 'running');
  assert.equal(r._observedAt, ted);
  const stejna = { observedAt: ted, sessions: [{ ...cache.sessions[0], _observedAt: undefined }] };
  delete stejna.sessions[0]._observedAt;
  assert.equal(slucRelace(cache, stejna)[0]._observedAt, ted);
  assert.equal(slucRelace(null, ucet).length, 1);
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
