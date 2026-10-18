// Konec do konce: jedno vyčerpané okno limitu = jedno upozornění. Dřív přišlo jedno za konverzaci,
// která na limit narazila („Claude Code: vyčerpaný limit“), a druhé za okno účtu („Claude: Limit 5 h
// vyčerpán“) – u Claude Code i Codexu, se dvěma konverzacemi na stejném okně tři.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startTestServer, tempDir, writeJsonl, api, waitFor } from './helpers.mjs';

test('vyčerpané okno Claude i Codexu hlásí jedno upozornění, i když na ně narazí víc konverzací', { timeout: 30000 }, async (t) => {
  const home = await tempDir('agenteeq-limit-jednou-');
  const iso = (ms) => new Date(ms).toISOString();
  const now = Date.now();
  const claude = (n) => path.join(home, '.claude', 'projects', '-Users-x-a', `${n}.jsonl`);
  const codexId = '0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
  const codex = path.join(home, '.codex', 'sessions', '2026', '10', '18', `rollout-2026-10-18T03-00-00-${codexId}.jsonl`);
  for (const n of ['a', 'b']) await writeJsonl(claude(n), [{ type: 'user', timestamp: iso(now - 5000), cwd: '/Users/x/a', message: { content: 'Pokračuj' } }]);
  await writeJsonl(codex, [
    { timestamp: iso(now - 5000), type: 'session_meta', payload: { id: codexId, cwd: '/Users/x/b', originator: 'codex_cli_rs', timestamp: iso(now - 5000) } },
    { timestamp: iso(now - 4000), type: 'event_msg', payload: { type: 'task_started' } },
  ]);
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  t.after(() => srv.close());
  const stav = async () => (await api(srv.url).get('/api/state')).body;
  await waitFor(async () => (await stav()).sessions.length === 3);

  const reset = Math.floor((Date.now() + 3 * 3600e3) / 1000);
  const odmitnuti = { type: 'assistant', timestamp: iso(Date.now()), isApiErrorMessage: true, apiErrorStatus: 429, error: 'rate_limit', quotaLimits: { status: 'rejected', resetsAt: reset, rateLimitType: 'five_hour' }, message: { id: 'e', model: '<synthetic>', content: [{ type: 'text', text: "You've hit your session limit" }] } };
  for (const n of ['a', 'b']) await writeJsonl(claude(n), [odmitnuti], { append: true });
  await writeJsonl(codex, [{ timestamp: iso(Date.now()), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 20, output_tokens: 2 } }, rate_limits: { limit_id: 'codex', primary: { used_percent: 100, window_minutes: 300, resets_at: reset }, secondary: { used_percent: 41, window_minutes: 10080, resets_at: reset + 86400 } } } }], { append: true });

  await waitFor(async () => (await stav()).sessions.every((s) => s.status === 'limited'), 6000);
  const limity = (await api(srv.url).get('/api/alerts')).body.items.filter((a) => a.kind === 'limit');
  assert.equal(limity.filter((a) => /^Claude/.test(a.title)).length, 1, limity.map((a) => a.title).join(' | '));
  assert.equal(limity.filter((a) => /^Codex/.test(a.title)).length, 1, limity.map((a) => a.title).join(' | '));
});
