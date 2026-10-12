import test from 'node:test';
import assert from 'node:assert/strict';
import { lzeOdpovedet, planOdpovedi, ODPOVED_MAX } from '../src/odpoved.js';

const UUID = 'aaaaaaaa-1111-2222-3333-444444444444';
const s = { id: `claude-code:${UUID}`, connector: 'claude-code', localId: UUID, cwd: '/Users/x/web' };
const ok = { procesy: [], behy: [], claude: '/usr/local/bin/claude' };

test('odpověď: konverzace Claude Code pokračuje na pozadí přes --resume, bez shellu', () => {
  const r = planOdpovedi(s, { text: '  Ano, pokračuj a „Design & Web“ nech být.  ' }, ok);
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan.argv, ['/usr/local/bin/claude', '-p', '--resume', UUID, '--permission-mode', 'plan', '--', 'Ano, pokračuj a „Design & Web“ nech být.']);
  assert.equal(r.plan.cwd, '/Users/x/web');
  assert.equal(r.plan.sessionId, s.id, 'běh patří k téže konverzaci');
  assert.equal(planOdpovedi(s, { text: 'x', permission: 'acceptEdits' }, ok).plan.argv[5], 'acceptEdits');
});

test('odpověď: nikdy souběžně s otevřeným Terminálem, při neznámém stavu ani při běhu z aplikace', () => {
  assert.equal(lzeOdpovedet(s, { ...ok, procesy: [{ runtime: 'claude-code', cwd: '/Users/x/web/' }] }).kod, 'bezi-proces');
  assert.equal(lzeOdpovedet(s, { ...ok, procesy: [{ runtime: 'codex', cwd: '/Users/x/web' }, { runtime: 'claude-code', cwd: '/Users/x/jinde' }] }).lze, true, 'jiná složka nebo jiný nástroj nevadí');
  const nevim = lzeOdpovedet(s, { ...ok, procesy: null });
  assert.equal(nevim.kod, 'nevim', 'nepodařilo se zjistit ≠ nic neběží');
  assert.match(nevim.proc, /Nepodařilo se zjistit/);
  assert.equal(lzeOdpovedet(s, { ...ok, behy: [{ sessionId: s.id, status: 'running' }] }).kod, 'bezi-beh');
  assert.equal(lzeOdpovedet(s, { ...ok, behy: [{ sessionId: s.id, status: 'done' }] }).lze, true);
});

test('odpověď: jen Claude Code s platným id, programem a složkou; text se ověří', () => {
  assert.equal(lzeOdpovedet({ ...s, connector: 'codex' }, ok).kod, 'nastroj');
  assert.equal(lzeOdpovedet({ ...s, localId: 'proces-123' }, ok).kod, 'id', 'detekovaný proces bez přepisu nejde obnovit');
  assert.equal(lzeOdpovedet(s, { ...ok, claude: false }).kod, 'program', 'hledal se a nenašel');
  assert.equal(lzeOdpovedet({ ...s, cwd: 'relativni' }, ok).kod, 'slozka');
  assert.equal(planOdpovedi(s, { text: '   ' }, ok).status, 422);
  assert.equal(planOdpovedi(s, { text: 'x'.repeat(ODPOVED_MAX + 1) }, ok).status, 422);
  assert.equal(planOdpovedi(s, { text: 'x', permission: 'bypassPermissions' }, ok).field, 'permission', 'oprávnění jen z bezpečného seznamu');
  assert.equal(planOdpovedi({ ...s, connector: 'codex' }, { text: 'x' }, ok).status, 409);
});

test('HTTP: detail konverzace říká, jestli lze odpovědět, a endpoint vrací důvod, proč ne', async (t) => {
  const { startTestServer, api, tempDir, writeJsonl } = await import('./helpers.mjs');
  const path = await import('node:path');
  const home = await tempDir('agenteeq-src-');
  await writeJsonl(path.join(home, '.claude', 'projects', '-Users-x-web', `${UUID}.jsonl`), [
    { type: 'user', timestamp: new Date().toISOString(), cwd: '/Users/x/web', sessionId: UUID, message: { content: 'Uprav hlavičku' } },
    { type: 'assistant', timestamp: new Date().toISOString(), message: { content: [{ type: 'text', text: 'Mám to upravit i na mobilu?' }] } },
  ]);
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  t.after(() => srv.close());
  const id = `claude-code:${UUID}`;
  for (let i = 0; i < 50 && !srv.app.store.sessions.get(id); i++) await new Promise((r) => setTimeout(r, 100));
  const d = await api(srv.url).send('GET', `/api/sessions/${encodeURIComponent(id)}`);
  assert.equal(d.status, 200);
  assert.equal(d.body.odpoved.lze, false);
  assert.ok(d.body.odpoved.proc, 'důvod je vždy vysvětlený');
  const r = await api(srv.url).send('POST', `/api/sessions/${encodeURIComponent(id)}/odpoved`, { text: 'Ano' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, d.body.odpoved.proc);
  assert.equal((await api(srv.url).send('POST', '/api/sessions/neni/odpoved', { text: 'Ano' })).status, 404);
});

test('odpověď: běžící Claude Code s nezjištěnou složkou je „nevím“, ne „jinde nic neběží“', () => {
  // lsof nebo /proc selhaly (nebo Windows, kde se složka nečte): proces může běžet právě v téhle konverzaci.
  for (const cwd of ['', undefined, 'relativni']) {
    const r = lzeOdpovedet(s, { ...ok, procesy: [{ runtime: 'claude-code', cwd }] });
    assert.equal(r.lze, false, `složka ${JSON.stringify(cwd)}`);
    assert.equal(r.kod, 'nevim');
    assert.match(r.proc, /Nepodařilo se zjistit/);
  }
  assert.equal(lzeOdpovedet(s, { ...ok, procesy: [{ runtime: 'codex', cwd: '' }] }).lze, true, 'jiný nástroj bez složky nevadí');
  assert.equal(lzeOdpovedet(s, { ...ok, procesy: [{ runtime: 'claude-code', cwd: '' }, { runtime: 'claude-code', cwd: '/Users/x/web' }] }).kod, 'bezi-proces', 'zjištěná shoda má přednost');
});

test('odpověď: běh z Agenteeq, který se teprve zastavuje, odpověď blokuje taky', () => {
  assert.equal(lzeOdpovedet(s, { ...ok, behy: [{ sessionId: s.id, status: 'stopping' }] }).kod, 'bezi-beh');
  assert.equal(lzeOdpovedet(s, { ...ok, behy: [{ sessionId: s.id, status: 'stopped' }] }).lze, true);
});

test('odpověď: „systém to neumí“, „ještě se nehledalo“ a „hledalo se a nenašlo“ jsou tři různé věci', () => {
  const system = lzeOdpovedet(s, { ...ok, dostupne: false, claude: null });
  assert.equal(system.kod, 'system');
  assert.match(system.proc, /jen na macOS/);
  const nevim = lzeOdpovedet(s, { ...ok, claude: null });
  assert.equal(nevim.kod, 'nevim');
  assert.doesNotMatch(nevim.proc, /nenašel/, 'nehledalo se = nevíme, ne „nenašel se“');
  assert.match(lzeOdpovedet(s, { ...ok, claude: false }).proc, /nenašel/);
});

test('HTTP: kde odpovídat z aplikace nejde (spouštění na pozadí vypnuté), neříká se „program se nenašel“', async (t) => {
  const { startTestServer, api, tempDir, writeJsonl } = await import('./helpers.mjs');
  const path = await import('node:path');
  const home = await tempDir('agenteeq-src-');
  await writeJsonl(path.join(home, '.claude', 'projects', '-Users-x-web', `${UUID}.jsonl`), [
    { type: 'user', timestamp: new Date().toISOString(), cwd: '/Users/x/web', sessionId: UUID, message: { content: 'Uprav hlavičku' } },
  ]);
  // AGENTEEQ_OPEN=0 vypne spouštění agentů stejně jako systém mimo macOS (src/config.js).
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_OPEN: '0' });
  t.after(() => srv.close());
  const id = `claude-code:${UUID}`;
  for (let i = 0; i < 50 && !srv.app.store.sessions.get(id); i++) await new Promise((r) => setTimeout(r, 100));
  const d = await api(srv.url).send('GET', `/api/sessions/${encodeURIComponent(id)}`);
  assert.equal(d.body.odpoved.lze, false);
  assert.equal(d.body.odpoved.kod, 'system');
  assert.doesNotMatch(d.body.odpoved.proc, /nenašel/);
});
