// Regresní testy z auditu pravdivosti stavů (žádost o povolení po schválení, pomocní agenti,
// selhání po obnoveném tahu, přerušení v Codexu, spárování procesů, stará cache vzdálených relací).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { deriveStatus, createSession } from '../src/model.js';
import { applyClaudeLine, newFileState, createClaudeCodeConnector } from '../src/connectors/claude-code.js';
import { createCodexConnector } from '../src/connectors/codex.js';
import { applyRemoteSession } from '../src/connectors/claude-desktop-code.js';
import { nesparovane } from '../src/bezici-agenti.js';
import { installHooks, hooksStatus, hookCommand, rozhodnutiCommand, HOOK_EVENTS, HOOK_EVENTS_ZAKLAD } from '../src/hooks-installer.js';
import { prehledProRozsireni } from '../src/prehled-rozsireni.js';
import { selectAgents, pocetProListu } from '../public/js/agent-selection.js';
import { tempDir, writeJsonl, fakeDatastore } from './helpers.mjs';

const MIN = 60e3;
const HOUR = 60 * MIN;
const iso = (t) => new Date(t).toISOString();
const SID = 'S1111111';

async function claude() {
  const home = await tempDir();
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: path.join(home, 'app') });
  const store = new Store({ config, datastore: fakeDatastore() });
  const c = createClaudeCodeConnector({ store, config });
  return { home, store, c, dir: path.join(home, '.claude', 'projects', '-x') };
}
const user = (t, text) => ({ type: 'user', timestamp: iso(t), sessionId: SID, cwd: '/x', message: { role: 'user', content: text } });
const toolUse = (t, id, name, input = {}) => ({ type: 'assistant', timestamp: iso(t), sessionId: SID, cwd: '/x', message: { id: `m${id}`, model: 'claude-x', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }], usage: { input_tokens: 1, output_tokens: 1 } } });
const toolRes = (t, id) => ({ type: 'user', timestamp: iso(t), sessionId: SID, cwd: '/x', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const side = (o) => ({ ...o, isSidechain: true });
const hook = (event, extra = {}) => ({ session_id: SID, hook_event_name: event, ...extra });
const povoleni = (tool) => hook('Notification', { notification_type: 'permission_prompt', message: `Claude needs your permission to use ${tool}` });

test('hook: žádost o povolení skončí s dalším nástrojem nebo s doběhnutím schváleného', async () => {
  const { store, c, dir } = await claude();
  const now = Date.now();
  await writeJsonl(path.join(dir, `${SID}.jsonl`), [user(now - 5 * MIN, 'run tests'), toolUse(now - 5 * MIN + 1000, 'tu1', 'Bash', { command: 'npm test' })]);
  await c.scan();
  const s = store.get(`claude-code:${SID}`);
  await c.ingestHook(hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'tu1' }), now - 5 * MIN + 1500);
  await c.ingestHook(povoleni('Bash'), now - 5 * MIN + 2000);
  assert.equal(deriveStatus(s, now - 5 * MIN + 3000).status, 'needs_input');
  // Doběhnutí souběžného čtení žádost o Bash neruší.
  await c.ingestHook(hook('PostToolUse', { tool_name: 'Read', tool_use_id: 'r0' }), now - 5 * MIN + 2500);
  assert.equal(deriveStatus(s, now - 5 * MIN + 3000).status, 'needs_input');
  // Schválený příkaz doběhl.
  await c.ingestHook(hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'tu1' }), now - MIN);
  assert.equal(s.pending, null);
  assert.equal(deriveStatus(s, now).status, 'working');

  // Další nástroj po žádosti = žádost je vyřízená.
  await c.ingestHook(hook('PreToolUse', { tool_name: 'Edit', tool_use_id: 'e1' }), now - 50e3);
  await c.ingestHook(povoleni('Edit'), now - 49e3);
  assert.equal(s.pending?.toolUseId, 'e1');
  await c.ingestHook(hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'b2' }), now - 10e3);
  assert.equal(s.pending, null);
  assert.equal(deriveStatus(s, now).status, 'working');
});

test('hook: PreToolUse zpracovaný až po žádosti o povolení ji nezruší', async () => {
  const { store, c } = await claude();
  const now = Date.now();
  await c.ingestHook(hook('UserPromptSubmit', { prompt: 'go' }), now - 10e3);
  await c.ingestHook(povoleni('Bash'), now - 5e3);
  // Dorazil dřív (menší čas), zpracoval se později: patří k téže žádosti.
  await c.ingestHook(hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'b1' }), now - 5e3 - 5);
  const s = store.get(`claude-code:${SID}`);
  assert.equal(deriveStatus(s, now).status, 'needs_input');
  assert.equal(s.pending.toolUseId, 'b1');
  await c.ingestHook(hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'b1' }), now);
  assert.equal(s.pending, null);
});

test('pomocný agent: výsledek nástroje v jeho souboru vyřídí žádost o povolení na rodiči', async () => {
  const { store, c, dir } = await claude();
  const now = Date.now();
  await writeJsonl(path.join(dir, `${SID}.jsonl`), [user(now - 10 * MIN, 'go'), toolUse(now - 10 * MIN + 1000, 'task1', 'Task', { description: 'refactor', prompt: 'x' })]);
  const sub = path.join(dir, SID, 'subagents', 'agent-abc123.jsonl');
  await writeJsonl(sub, [side(user(now - 10 * MIN + 2000, 'x')), side(toolUse(now - 9 * MIN, 'e1', 'Edit', { file_path: '/x/a.js' }))]);
  await c.scan();
  // Hook pomocníka nese session_id rodiče (staré propojení bez PreToolUse/PostToolUse).
  await c.ingestHook(povoleni('Edit'), now - 9 * MIN + 1000);
  const rodic = store.get(`claude-code:${SID}`);
  assert.equal(deriveStatus(rodic, now - 9 * MIN + 2000).status, 'needs_input');
  await writeJsonl(sub, [side(toolRes(now - 8 * MIN, 'e1')), side(toolUse(now - MIN, 'r2', 'Read', { file_path: '/x/b.js' }))], { append: true });
  await c.scan();
  assert.equal(rodic.pending, null);
  assert.equal(deriveStatus(rodic, now).status, 'working');
});

test('pomocný agent pracující přes 30 min drží rodiče v práci', async () => {
  const { store, c, dir } = await claude();
  const now = Date.now();
  await writeJsonl(path.join(dir, `${SID}.jsonl`), [user(now - 40 * MIN, 'go'), toolUse(now - 40 * MIN + 1000, 'task1', 'Task', { description: 'big job', prompt: 'x' })]);
  const sub = path.join(dir, SID, 'subagents', 'agent-abc123.jsonl');
  await writeJsonl(sub, [side(user(now - 40 * MIN, 'x')), side(toolUse(now - 20e3, 'r1', 'Read', { file_path: '/x/a' }))]);
  await c.scan();
  store.ready = true;
  store.reevaluate(now);
  const list = store.list(now);
  const rodic = selectAgents(list).find((s) => s.id === `claude-code:${SID}`);
  assert.equal(rodic.status, 'working');
  assert.equal(rodic.stale, false);
  assert.deepEqual(pocetProListu(list), { pracuje: 1, nejiste: 0 });
});

test('pomocný agent čekající na povolení se počítá na viditelném rodiči (přehled, rozšíření, Dock)', async () => {
  const { store, c, dir } = await claude();
  const now = Date.now();
  await writeJsonl(path.join(dir, `${SID}.jsonl`), [user(now - 3 * MIN, 'go'), toolUse(now - 3 * MIN + 1000, 'task1', 'Task', { description: 'job', prompt: 'x' })]);
  const sub = path.join(dir, SID, 'subagents', 'agent-abc123.jsonl');
  await writeJsonl(sub, [side(user(now - 3 * MIN, 'x')), side(toolUse(now - 2 * MIN, 'e1', 'Edit', { file_path: '/x/a' }))]);
  await c.scan();
  store.reevaluate(now);
  const list = store.list(now);
  const vidim = selectAgents(list);
  assert.deepEqual(vidim.map((s) => [s.id, s.status]), [[`claude-code:${SID}`, 'needs_input']]);
  assert.equal(vidim[0].pozornostOd, 'claude-code:agent-abc123');
  assert.equal(prehledProRozsireni(list).zdravi.cekaNaTebe, 1);
  // Vstup se nemění – výběr vrací kopii rodiče.
  assert.equal(list.find((s) => s.id === `claude-code:${SID}`).status, 'working');
  // Rodič, který sám selhal, svůj stav drží.
  const selhany = selectAgents([{ id: 'p', status: 'failed', lastAt: 1 }, { id: 'd', parentId: 'p', status: 'needs_input', lastAt: 2 }]);
  assert.equal(selhany[0].status, 'failed');
});

test('selhání spuštění překryje novější doběhlý tah', () => {
  const now = Date.now();
  const s = createSession({ connector: 'claude-code', localId: SID, provider: 'anthropic', app: 'Claude Code' });
  const st = newFileState();
  s.failure = { text: 'Skončilo s kódem 1.', at: now - 30 * MIN };
  assert.equal(deriveStatus(s, now).status, 'failed');
  applyClaudeLine(st, s, user(now - 10 * MIN, 'again'));
  applyClaudeLine(st, s, { type: 'assistant', timestamp: iso(now - 9 * MIN), message: { id: 'z', model: 'claude-x', stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] } });
  const d = deriveStatus(s, now);
  assert.equal(d.status, 'waiting');
  assert.equal(d.done, true);
});

test('Claude Code: přerušený tah není „hotovo“', () => {
  const now = Date.now();
  const s = createSession({ connector: 'claude-code', localId: SID, provider: 'anthropic', app: 'Claude Code' });
  const st = newFileState();
  applyClaudeLine(st, s, user(now - 3 * MIN, 'go'));
  applyClaudeLine(st, s, toolUse(now - 2 * MIN, 't1', 'Bash', { command: 'ls' }));
  applyClaudeLine(st, s, user(now - MIN, '[Request interrupted by user]'));
  const d = deriveStatus(s, now);
  assert.equal(d.status, 'waiting');
  assert.equal(d.done, false);
  assert.equal(d.reason, 'Přerušeno, čeká na další zadání');
  applyClaudeLine(st, s, user(now - 30e3, 'jinak'));
  applyClaudeLine(st, s, { type: 'assistant', timestamp: iso(now - 20e3), message: { id: 'z', model: 'claude-x', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] } });
  assert.equal(deriveStatus(s, now).done, true, 'nový tah přerušení překryje');
});

test('Codex: turn_aborted ukončí práci, ale nehlásí „hotovo“', async () => {
  const home = await tempDir();
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: path.join(home, 'app') });
  const store = new Store({ config, datastore: fakeDatastore() });
  const c = createCodexConnector({ store, config });
  const now = Date.now();
  const d = new Date(now);
  const uuid = '0199aaaa-bbbb-7ccc-8ddd-eeeeffff0001';
  const f = path.join(home, '.codex', 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'), `rollout-2026-10-18T10-00-00-${uuid}.jsonl`);
  await writeJsonl(f, [
    { timestamp: iso(now - 3 * MIN), type: 'session_meta', payload: { id: uuid, cwd: '/x', originator: 'codex_cli_rs', timestamp: iso(now - 3 * MIN) } },
    { timestamp: iso(now - 3 * MIN), type: 'event_msg', payload: { type: 'task_started' } },
    { timestamp: iso(now - 3 * MIN), type: 'event_msg', payload: { type: 'user_message', message: 'do x' } },
    { timestamp: iso(now - 2 * MIN), type: 'event_msg', payload: { type: 'turn_aborted', reason: 'interrupted' } },
  ]);
  try {
    await c.start();
    await c.idle?.();
    const s = store.get(`codex:${uuid}`);
    const st = deriveStatus(s, now);
    assert.equal(st.status, 'waiting');
    assert.equal(st.done, false);
    assert.equal(s.transcript.at(-1).text, 'Přerušeno uživatelem');
  } finally {
    c.stop?.();
  }
});

test('procesy: pomocný agent si nevezme volný proces Claude Code', () => {
  const now = Date.now();
  const mk = (id, lastAt, extra = {}) => ({ ...createSession({ connector: 'claude-code', localId: id, provider: 'anthropic', app: 'Claude Code' }), cwd: '/x', lastAt, ...extra });
  const sessions = [mk('S1', now - 5000), mk('agent-a', now - 120e3, { parentId: 'claude-code:S1' })];
  const procesy = [{ pid: 1, runtime: 'claude-code', od: now - 3600e3, cwd: '/x' }, { pid: 2, runtime: 'claude-code', od: now - 60e3, cwd: '/x' }];
  assert.deepEqual(nesparovane(procesy, sessions).map((p) => p.pid), [2]);
});

test('vzdálený Claude Code: staré rozhodnutí zůstává vidět, historická chyba není aktuální selhání', () => {
  const now = Date.now();
  const s = createSession({ connector: 'claude-desktop-code', localId: 'session_abcdefgh12', provider: 'anthropic', app: 'x' });
  applyRemoteSession(s, { id: 'session_abcdefgh12', updated_at: iso(now - 6 * HOUR), created_at: iso(now - 7 * HOUR), session_status: 'idle', status_bucket: 'SESSION_STATUS_BUCKET_BLOCKED', title: 't' }, null, now - 6 * HOUR, now);
  const d = deriveStatus(s, now);
  assert.equal(d.status, 'needs_input');
  assert.equal(d.stale, true);
  assert.match(d.reason, / · stav z \d{1,2}\. \d{1,2}\. \d{2}:\d{2}$/);
  const s2 = createSession({ connector: 'claude-desktop-code', localId: 'session_abcdefgh13', provider: 'anthropic', app: 'x' });
  applyRemoteSession(s2, { id: 'session_abcdefgh13', updated_at: iso(now - 20 * HOUR), created_at: iso(now - 21 * HOUR), session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_FAILED' }, null, now - 20 * HOUR, now);
  const d2 = deriveStatus(s2, now);
  assert.equal(d2.status, 'observed');
  assert.equal(d2.done, false);
  assert.equal(d2.stale, true);
});

test('rozšíření: agent bez čerstvého stavu neznamená „nikdo nepracuje“ (jako lišta macOS)', () => {
  const nejisty = { id: 'r1', status: 'waiting', stale: true, title: 'Vzdálený', app: 'Claude', lastAt: 1, reason: '' };
  const p = prehledProRozsireni([nejisty]);
  assert.equal(p.zdravi.nejiste, 1);
  assert.equal(p.zdravi.veta, 'U 1 agenta chybí čerstvý stav');
  assert.equal(prehledProRozsireni([nejisty, { ...nejisty, id: 'r2' }]).zdravi.veta, 'U 2 agentů chybí čerstvý stav');
  assert.equal(prehledProRozsireni([{ ...nejisty, stale: false }]).zdravi.veta, 'V pořádku, nikdo nepracuje');
});

test('hooky: staré propojení bez událostí nástrojů funguje, ale nabídne obnovu; obnova je doplní jednou', async () => {
  const home = await tempDir();
  const file = path.join(home, '.claude', 'settings.json');
  const headersFile = path.join(home, 'app', 'claude-hooky-hlavicky');
  const token = 'a'.repeat(48);
  await installHooks(file, { port: 4620, token, headersFile });
  // Nastavení, jak ho zapsala verze se základní sadou událostí.
  const json = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const ev of HOOK_EVENTS) if (!HOOK_EVENTS_ZAKLAD.includes(ev)) delete json.hooks[ev];
  await fs.writeFile(file, JSON.stringify(json));
  const stare = await hooksStatus(file, token, headersFile);
  assert.deepEqual([stare.installed, stare.partial, stare.current, stare.funguje], [true, false, false, true]);
  assert.deepEqual(stare.chybi, ['PreToolUse', 'PostToolUse', 'PermissionRequest']);

  await installHooks(file, { port: 4620, token, headersFile });
  await installHooks(file, { port: 4620, token, headersFile });
  const nove = await hooksStatus(file, token, headersFile);
  assert.deepEqual([nove.installed, nove.current, nove.chybi.length], [true, true, 0]);
  const vysledek = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const ev of HOOK_EVENTS) {
    // PermissionRequest má vlastní příkaz: jeho odpověď (rozhodnutí z Agenteeq) jde na stdout.
    const prikaz = ev === 'PermissionRequest' ? rozhodnutiCommand(4620, headersFile) : hookCommand(4620, headersFile);
    // Na Windows je příkaz zakódovaný (-EncodedCommand), adresa v něm doslova není: porovnává se celý příkaz.
    const nase = vysledek.hooks[ev].filter((g) => g.hooks.some((h) => h.command === prikaz));
    assert.equal(nase.length, 1, `${ev}: jediný záznam i po opakované instalaci`);
    assert.equal(nase[0].hooks[0].command, prikaz);
    assert.equal(nase[0].matcher, ['PreToolUse', 'PostToolUse', 'PermissionRequest'].includes(ev) ? '*' : undefined);
    assert.equal(nase[0].hooks[0].timeout, ev === 'PermissionRequest' ? 60 : 5);
  }
});
