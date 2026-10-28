import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, deriveStatus } from '../src/model.js';
import { applyRemoteSession, hlasenyStav, relaceZApi } from '../src/connectors/claude-desktop-code.js';
import { applyKarta } from '../src/connectors/web.js';
const now = Date.parse('2026-10-28T10:05:00Z');
const iso = (t) => new Date(t).toISOString();
const session = () => createSession({ connector: 'claude-desktop-code', localId: 'session_FixtureTruth123', provider: 'anthropic', app: 'Claude' });
const failed = (at = now - 60000) => ({ id: 'session_FixtureTruth123', session_status: 'idle', status_bucket: 'failed', updated_at: iso(at) });
const cached = (...messages) => ({ tree: { kind: 'code_session', messages } });
const message = (at, content, extra = {}) => ({ type: 'assistant', uuid: iso(at), created_at: iso(at), message: { content: [{ type: 'text', text: content }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, ...extra });

test('a 14-hour cache failure is historical evidence, not a current failure or successful completion', () => {
  const s = applyRemoteSession(session(), failed(now - 14 * 3600000), null, now - 14 * 3600000, now);
  const d = deriveStatus(s, now);
  assert.equal(d.status, 'observed');
  assert.equal(d.stale, true);
  assert.equal(d.done, false);
  assert.match(d.reason, /Aktuální stav nepotvrzen/);
  assert.ok(s.failure, 'keep historical evidence without asserting current failure');
});

test('fresh confirmed remote failures and actual local process errors still report failure', () => {
  assert.equal(deriveStatus(applyRemoteSession(session(), failed(), null, now, now), now).status, 'failed');
  const local = createSession({ connector: 'runs', localId: 'local', app: 'Local' });
  local.failure = { at: now - 14 * 3600000, text: 'Process exited 1' };
  assert.equal(deriveStatus(local, now).status, 'failed');
});

test('quota notices without an SDK error flag stay limited; expiry alone never means success', () => {
  const s = applyRemoteSession(session(), failed(now - 10 * 60000), cached(message(now - 60000, "You've hit your session limit · resets 11am (UTC)")), now, now);
  assert.equal(deriveStatus(s, now).status, 'limited');
  assert.equal(s.failure, null);
  const afterReset = deriveStatus(s, Date.parse('2026-10-28T11:05:00Z'));
  assert.notEqual(afterReset.status, 'failed');
  assert.equal(afterReset.done, false);
  assert.match(afterReset.reason, /nový stav zatím nepřišel/);
});

test('a later successful response supersedes an older failure even if the old list is reread today', () => {
  const s = applyRemoteSession(session(), failed(now - 10 * 60000), cached(message(now - 10000, 'Completed.')), now, now);
  assert.equal(s.failure, null);
  assert.equal(deriveStatus(s, now).status, 'waiting');
  assert.equal(deriveStatus(s, now).done, true);
});

test('a new browser turn stays authoritative after completion; merely opening an idle tab does not prove recovery', () => {
  const s = applyRemoteSession(session(), failed(), null, now, now);
  const payload = { generating: false, counts: { user: 1, assistant: 1 }, url: 'https://claude.ai/code/session_FixtureTruth123' };
  applyKarta(s, payload, now);
  assert.equal(deriveStatus(s, now).status, 'failed');
  applyKarta(s, { ...payload, generating: true }, now + 1000);
  assert.equal(deriveStatus(s, now + 1000).status, 'working');
  applyKarta(s, { ...payload, counts: { user: 2, assistant: 2 } }, now + 2000);
  assert.notEqual(deriveStatus(s, now + 2000).status, 'failed');
  assert.ok(s.turnStartedAt > s.failure.at, 'new turn evidence survives an expired tab heartbeat');
  assert.notEqual(deriveStatus(s, now + 180000).status, 'failed');
});

test('current completion and active worker evidence outrank a previous turn failure summary', () => {
  assert.equal(hlasenyStav({ session_status: 'idle', status_bucket: 'completed', post_turn_summary: { status_category: 'failed' } }), '');
  assert.equal(relaceZApi({ id: 'session_FixtureTruth123', status: 'failed', worker_status: 'running', last_event_at: iso(now) }).session_status, 'running');
  assert.equal(relaceZApi({ id: 'session_FixtureTruth123', status: 'failed', worker_status: 'idle', last_event_at: iso(now) }).session_status, 'failed');
});

test('current successful outcome clears older quota; a newer real error remains a failure', () => {
  const quota = message(now - 60000, "You've hit your session limit · resets 11am (UTC)");
  const complete = { ...failed(now - 1000), status_bucket: 'completed' };
  assert.notEqual(deriveStatus(applyRemoteSession(session(), complete, cached(quota), now, now), now).status, 'limited');
  const error = message(now - 1000, 'API Error: 500 Internal server error', { isApiErrorMessage: true });
  assert.equal(deriveStatus(applyRemoteSession(session(), failed(now - 120000), cached(quota, error), now, now), now).status, 'failed');
});

test('ordinary discussion of limits is not treated as a quota notice', () => {
  const text = "Here is an example: You've hit your session limit · resets 11am (UTC)";
  const s = applyRemoteSession(session(), failed(now - 120000), cached(message(now - 1000, text)), now, now);
  assert.equal(s.limit, null);
  assert.equal(deriveStatus(s, now).status, 'waiting');
});

test('an explicit SDK error result is not hidden by an earlier assistant message', () => {
  const result = { type: 'result', uuid: 'result-error', created_at: iso(now - 1000), is_error: true, errors: ['Worker exited with code 1'] };
  const s = applyRemoteSession(session(), failed(now - 120000), cached(message(now - 2000, 'Checking.'), result), now, now);
  assert.equal(deriveStatus(s, now).status, 'failed');
  assert.match(s.failure.text, /Worker exited/);
});

test('client snapshots and SSE preserve status provenance without changing remote opening semantics', async (t) => {
  const original = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  t.after(() => { if (original) globalThis.requestAnimationFrame = original; else delete globalThis.requestAnimationFrame; });
  const { state, applySnapshot, applyEvent } = await import('../public/js/state.js');
  const s = { ...session(), source: 'desktop-cache', transcriptSeq: 1, observation: { source: 'desktop-cache', at: now } };
  applySnapshot({ sessions: [s], alerts: { unread: 0, items: [] } });
  assert.equal(state.sessions.get(s.id).observation.source, 'desktop-cache');
  applyEvent('session', { ...s, transcriptSeq: 2, observation: { source: 'claude-account', at: now + 1 } });
  assert.equal(state.sessions.get(s.id).observation.source, 'claude-account');
  assert.equal(state.sessions.get(s.id).source, 'desktop-cache', 'legacy source routing stays remote-safe');
});
