import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, api } from './helpers.mjs';
// Konec do konce: skutečný server nad přepisy Claude Code a Codexu na disku. Agent se objeví do 2 s
// od zápisu, stav jde pracuje → čeká → rozhodnutí → limit a limity mají správná čísla.
test('detekce a limity: Claude Code a Codex od zápisu na disk po stav v přehledu', { timeout: 60000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-home-'));
  const now = Date.now(); const ts = (s) => new Date(now + s * 1000).toISOString();
  const jl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  // Codex session
  const cid = randomUUID();
  const cdir = path.join(home, '.codex', 'sessions', '2026', '10', '18'); await fs.mkdir(cdir, { recursive: true });
  const cfile = path.join(cdir, `rollout-2026-10-18T03-00-00-${cid}.jsonl`);
  // Claude Code session
  const kid = randomUUID();
  const kdir = path.join(home, '.claude', 'projects', '-Users-x-proj'); await fs.mkdir(kdir, { recursive: true });
  const kfile = path.join(kdir, `${kid}.jsonl`);
  const s = await startTestServer({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_SCAN_MS: '1000' });
  const stav = async () => (await api(s.url).get('/api/state')).body;
  const cekej = async (popis, fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { const st = await stav(); const v = fn(st); if (v) return st; await new Promise((r) => setTimeout(r, 100)); } assert.fail(`${popis}: nedošlo do ${ms} ms`); };
  const ses = (st, id) => (st.sessions || []).find((x) => x.id.endsWith(id));
  // 1) Codex začne pracovat
  await fs.writeFile(cfile, jl([
    { timestamp: ts(0), type: 'session_meta', payload: { id: cid, cwd: '/Users/x/web', originator: 'codex_cli_rs', timestamp: ts(0) } },
    { timestamp: ts(1), type: 'event_msg', payload: { type: 'task_started' } },
    { timestamp: ts(1), type: 'event_msg', payload: { type: 'user_message', message: 'Přidej ceník' } },
    { timestamp: ts(2), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 1200, cached_input_tokens: 0, output_tokens: 80 } }, rate_limits: { limit_id: 'codex', primary: { used_percent: 42, window_minutes: 300, resets_at: Math.floor(now / 1000) + 3600 }, secondary: { used_percent: 17, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 5 * 86400 }, plan_type: 'plus' } } },
  ]));
  let st = await cekej('Codex se objeví jako pracující', (st) => ses(st, cid)?.status === 'working' && ses(st, cid).status);
  // 2) Codex dokončí
  await fs.appendFile(cfile, jl([{ timestamp: ts(5), type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'Hotovo' } }]));
  await cekej('Codex přejde z „pracuje“ jinam', (st) => ses(st, cid) && ses(st, cid).status !== 'working' && ses(st, cid).status);
  // 3) Claude Code: pracuje (tool_use), pak se ptá (AskUserQuestion)
  await fs.writeFile(kfile, jl([
    { type: 'user', timestamp: ts(0), cwd: '/Users/x/proj', sessionId: kid, message: { role: 'user', content: 'Oprav testy' } },
    { type: 'assistant', timestamp: ts(1), sessionId: kid, message: { id: 'm1', model: 'claude-opus-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }], usage: { input_tokens: 10, output_tokens: 5 } } },
  ]));
  await cekej('Claude Code se objeví jako pracující', (st) => ses(st, kid)?.status === 'working' && ses(st, kid).status);
  await fs.appendFile(kfile, jl([
    { type: 'user', timestamp: ts(3), sessionId: kid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
    { type: 'assistant', timestamp: ts(4), sessionId: kid, message: { id: 'm2', model: 'claude-opus-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [{ question: 'Smazat staré snapshoty?', options: [{ label: 'Ano' }, { label: 'Ne' }] }] } }], usage: { input_tokens: 1, output_tokens: 5 } } },
  ]));
  await cekej('Claude Code čeká na rozhodnutí', (st) => ses(st, kid)?.status === 'needs_input' && ses(st, kid).status);
  // 4) Claude Code narazí na limit (429)
  await fs.appendFile(kfile, jl([
    { type: 'user', timestamp: ts(6), sessionId: kid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'q1', content: 'Ano' }] } },
    { type: 'assistant', timestamp: ts(7), sessionId: kid, isApiErrorMessage: true, error: 'rate_limit', message: { id: 'm3', model: '<synthetic>', content: [{ type: 'text', text: "Claude AI usage limit reached|" + Math.floor((now + 7200e3) / 1000) }] } },
  ]));
  st = await cekej('Claude Code hlásí limit', (st) => ['limited'].includes(ses(st, kid)?.status) && ses(st, kid).status, 6000);
  // 5) Tokeny a přepis
  const det = await api(s.url).get(`/api/sessions/${encodeURIComponent(ses(st, kid).id)}`);
  const tr = await api(s.url).get(`/api/sessions/${encodeURIComponent(ses(st, kid).id)}/transcript`);
    assert.deepEqual((st.limits || []).filter((l) => l.app === 'Codex').map((l) => [l.label, l.usedPercent]), [['Limit 5 h', 42], ['Týdenní limit', 17]]);
    assert.ok((st.limits || []).some((l) => l.app === 'Claude' && l.resetsAt > now), 'vyčerpaný limit Claude s časem obnovy');
    assert.equal(tr.status, 200);
    assert.ok(tr.body.entries.length >= 4, 'přepis Claude Code');
    assert.deepEqual(det.body.session.tokens, { input: 11, output: 10, cacheWrite: 0, cacheRead: 0 });
    const nap = (await api(s.url).get('/api/napojeni')).body.napojeni;
    assert.deepEqual(['claude-code', 'codex'].map((id) => nap.find((n) => n.id === id)?.nainstalovano), [true, true], 'nalezené nástroje jsou v Propojení');
    await s.close();
});
