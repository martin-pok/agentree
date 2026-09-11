import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { createSession, deriveStatus } from '../src/model.js';
import { createCodexConnector, mapCodexItem, windowLabel } from '../src/connectors/codex.js';
import { applyGeminiChat } from '../src/connectors/gemini-family.js';
import { applyVsCodeChat, applyCopilotEvent } from '../src/connectors/copilot.js';
import { applyCursorComposer } from '../src/connectors/cursor.js';
import { validateWebPayload, applyWebPayload } from '../src/connectors/web.js';
import { parsePs, etimeToSec } from '../src/connectors/processes.js';
import { tempDir, writeJsonl, fakeDatastore } from './helpers.mjs';

test('Codex: vynulované počítadlo tokenů nezahodí dosavadní spotřebu (součet i hodinový graf sedí)', async () => {
  const home = await tempDir();
  const config = loadConfig({ AGENTREE_SOURCE_HOME: home, AGENTREE_HOME: home });
  const store = new Store({ config, datastore: fakeDatastore() });
  const connector = createCodexConnector({ config, store });
  const id = '01a05188-51d8-7903-85aa-9818c9b94627';
  const t0 = Date.now() - 3 * 3600e3;
  const at = (min) => new Date(t0 + min * 60e3).toISOString();
  const usage = (input, cached, output) => ({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output } } } });
  await writeJsonl(path.join(home, '.codex', 'sessions', '2026', '09', '05', `rollout-2026-09-05T10-00-00-${id}.jsonl`), [
    { timestamp: at(0), type: 'session_meta', payload: { id, cwd: '/Users/x/web', originator: 'Codex Desktop', timestamp: at(0) } },
    { timestamp: at(1), ...usage(10000, 4000, 500) },
    { timestamp: at(2), ...usage(10000, 4000, 500) },
    { timestamp: at(70), ...usage(30000, 5000, 1000) },
    { timestamp: at(71), ...usage(3000, 1000, 200) },
    { timestamp: at(130), ...usage(9000, 2000, 700) },
  ]);
  await connector.start();
  connector.stop();
  const s = store.get(`codex:${id}`);
  const total = s.tokens.input + s.tokens.output + s.tokens.cacheWrite;
  const hourly = Object.values(s.hourly).reduce((a, b) => a + b, 0);
  assert.equal(total, 26000 + 7700, 'před vynulováním 26 000 + po něm 7 700');
  assert.equal(hourly, total, 'hodinové součty = celkový počet');
  assert.equal(s.tokens.cacheRead, 5000 + 2000);
});

test('Codex: přepis z item_completed, stav úlohy, limity a kredity', async () => {
  const home = await tempDir();
  const config = loadConfig({ AGENTREE_SOURCE_HOME: home, AGENTREE_HOME: home });
  const datastore = fakeDatastore();
  const store = new Store({ config, datastore });
  const connector = createCodexConnector({ config, store });
  const id = '01a0546a-6679-76d3-9454-ba9f37a24013';
  const now = Date.now();
  const ts = (s) => new Date(now - 60000 + s * 1000).toISOString();
  const file = path.join(home, '.codex', 'sessions', '2026', '09', '10', `rollout-2026-09-10T10-00-00-${id}.jsonl`);
  await writeJsonl(file, [
    { timestamp: ts(0), type: 'session_meta', payload: { id, cwd: '/Users/x/web', originator: 'Codex Desktop', timestamp: ts(0) } },
    { timestamp: ts(1), type: 'turn_context', payload: { model: 'gpt-5.6-terra', cwd: '/Users/x/web' } },
    { timestamp: ts(1), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Stará zpráva' }] } },
    { timestamp: ts(2), type: 'event_msg', payload: { type: 'task_started' } },
    { timestamp: ts(2), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: 'Přidej dark mode' }] } } },
    { timestamp: ts(3), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'CommandExecution', command: 'npm run build', status: 'completed' } } },
    { timestamp: ts(4), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50 } }, rate_limits: { limit_id: 'codex', primary: { used_percent: 81, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 86400 }, credits: { has_credits: true, balance: '247.44' }, plan_type: 'plus' } } },
  ]);
  await writeJsonl(path.join(home, '.codex', 'session_index.jsonl'), [
    { id, thread_name: 'Starý název', updated_at: ts(0) },
    { id, thread_name: 'BRIEF GENERATOR', updated_at: ts(5) },
  ]);
  await connector.start();
  connector.stop();
  const s = store.get(`codex:${id}`);
  assert.ok(s, 'session existuje');
  assert.equal(s.title, 'BRIEF GENERATOR', 'název vlákna z indexu, platí nejnovější');
  assert.equal(s.app, 'Codex · ChatGPT app');
  assert.equal(s.model, 'gpt-5.6-terra');
  assert.deepEqual(s.transcript.map((e) => e.role), ['user', 'tool'], 'po item_completed se starý formát zahodí');
  assert.equal(s.firstPrompt, 'Přidej dark mode');
  assert.equal(deriveStatus(s, Date.now()).status, 'working');
  assert.equal(s.tokens.input, 200);
  assert.equal(s.tokens.cacheRead, 800);
  assert.equal(s.resume, `codex resume ${id}`);
  const limit = store.limitList()[0];
  assert.equal(limit.usedPercent, 81);
  assert.equal(limit.label, 'Týdenní limit');
  assert.equal(datastore.data.credits.codex.balance, 247.44);

  await writeJsonl(file, [{ timestamp: ts(10), type: 'event_msg', payload: { type: 'task_complete' } }], { append: true });
  await connector.scan();
  assert.equal(deriveStatus(s, Date.now()).status, 'waiting');
});

test('Codex: mapování položek a popisky limitů', () => {
  assert.equal(mapCodexItem({ type: 'UserMessage', content: [{ type: 'text', text: '## Referenced ChatGPT conversation' }] }), null);
  assert.deepEqual(mapCodexItem({ type: 'AgentMessage', content: [{ type: 'Text', text: '4' }] }), { role: 'assistant', text: '4' });
  assert.equal(mapCodexItem({ type: 'FileChange', changes: [{ path: '/a/b/c.ts' }] }).text, 'c.ts');
  assert.equal(windowLabel(300), 'Limit 5 h');
  assert.equal(windowLabel(10080), 'Týdenní limit');
});

test('Gemini CLI: zprávy, nástroje a tokeny', () => {
  const s = createSession({ connector: 'gemini-cli', localId: 'g', provider: 'google', app: 'Gemini CLI' });
  const now = Date.now();
  applyGeminiChat(s, {
    sessionId: 'g',
    startTime: new Date(now - 60000).toISOString(),
    messages: [
      { type: 'user', timestamp: new Date(now - 50000).toISOString(), content: 'Vysvětli kód' },
      { type: 'gemini', timestamp: new Date(now - 40000).toISOString(), content: 'Tady je vysvětlení', model: 'gemini-3-pro', tokens: { input: 100, output: 20, cached: 40, thoughts: 5 }, toolCalls: [{ name: 'read_file', status: 'success' }] },
    ],
  }, now - 40000, now);
  assert.deepEqual(s.transcript.map((e) => e.role), ['user', 'assistant', 'tool']);
  assert.equal(s.tokens.input, 60);
  assert.equal(s.tokens.output, 25);
  assert.equal(s.model, 'gemini-3-pro');
  assert.equal(s.running, false);
});

test('Copilot ve VS Code a Copilot CLI', () => {
  const now = Date.now();
  const v = createSession({ connector: 'vscode-copilot', localId: 'v', provider: 'github', app: 'Copilot · VS Code' });
  applyVsCodeChat(v, {
    sessionId: 'v',
    creationDate: now - 10000,
    lastMessageDate: now - 1000,
    requests: [{ timestamp: now - 5000, modelId: 'copilot/gpt-5', message: { text: 'Přidej test' }, response: [{ value: 'Přidávám. ' }, { kind: 'toolInvocationSerialized', toolId: 'editFile', pastTenseMessage: { value: 'Upraven app.test.ts' } }] }],
  }, now - 1000, now);
  assert.deepEqual(v.transcript.map((e) => e.role), ['user', 'assistant', 'tool']);
  assert.equal(v.model, 'gpt-5');
  assert.equal(v.running, true, 'požadavek bez výsledku je rozpracovaný');

  const c = createSession({ connector: 'copilot-cli', localId: 'c', provider: 'github', app: 'Copilot CLI' });
  applyCopilotEvent(c, { type: 'user.message', timestamp: new Date(now - 3000).toISOString(), data: { content: 'Spusť testy' } });
  applyCopilotEvent(c, { type: 'tool.execution_start', timestamp: new Date(now - 2000).toISOString(), data: { toolName: 'bash', arguments: { command: 'npm test' } } });
  assert.equal(c.running, true);
  assert.equal(c.activity, 'bash: npm test');
  applyCopilotEvent(c, { type: 'assistant.turn_end', timestamp: new Date(now - 1000).toISOString(), data: {} });
  assert.equal(c.running, false);
});

test('Cursor: bubliny, generování a čekání na schválení', () => {
  const now = Date.now();
  const s = createSession({ connector: 'cursor', localId: 'k', provider: 'cursor', app: 'Cursor' });
  applyCursorComposer(s, {
    header: { createdAt: now - 60000, lastUpdatedAt: now - 1000 },
    head: { hasBlockingPendingActions: true },
    data: { generatingBubbleIds: ['b2'], todos: [{ status: 'completed' }, { status: 'in_progress', content: 'Testy' }] },
    bubbles: [
      { type: 1, text: 'Oprav build', createdAt: new Date(now - 50000).toISOString() },
      { type: 2, text: '', createdAt: new Date(now - 40000).toISOString(), toolFormerData: { name: 'run_terminal_command_v2', status: 'completed' } },
    ],
    folder: '/Users/x/app',
    now,
    dbChangedAt: now,
  });
  assert.deepEqual(s.transcript.map((e) => e.role), ['user', 'tool']);
  assert.equal(s.transcript[1].tool, 'run terminal command');
  assert.deepEqual(s.progress, { done: 1, total: 2, current: 'Testy' });
  assert.equal(deriveStatus(s, now).status, 'needs_input');
});

test('Web: validace a streamovaná odpověď se aktualizuje na místě', () => {
  assert.equal(validateWebPayload({ site: 'neznamy' }).ok, false);
  assert.equal(validateWebPayload({ site: 'chatgpt', conversationId: 'a b', url: 'https://chatgpt.com' }).ok, false);
  const s = createSession({ connector: 'web', localId: 'chatgpt:1', provider: 'openai', app: 'ChatGPT', source: 'web' });
  const base = { site: 'chatgpt', conversationId: 'abc-1', url: 'https://chatgpt.com/c/abc-1', title: 'Plán', generating: true };
  const now = Date.now();
  applyWebPayload(s, validateWebPayload({ ...base, messages: [{ role: 'user', text: 'Ahoj' }, { role: 'assistant', text: 'Ahoj, jak' }] }).value, now);
  const seq = s.transcript[1].seq;
  assert.equal(deriveStatus(s, now).status, 'working');
  applyWebPayload(s, validateWebPayload({ ...base, generating: false, messages: [{ role: 'user', text: 'Ahoj' }, { role: 'assistant', text: 'Ahoj, jak ti mohu pomoci?' }] }).value, now + 3000);
  assert.equal(s.transcript.length, 2);
  assert.equal(s.transcript[1].seq, seq);
  assert.equal(s.transcript[1].text, 'Ahoj, jak ti mohu pomoci?');
  assert.equal(deriveStatus(s, now + 4000).status, 'waiting');
});

test('Procesy: rozpoznání AI aplikací z výpisu ps', () => {
  const out = [
    '57811 01-22:59:09 13.6 204800 /Applications/Claude.app/Contents/MacOS/Claude',
    '57825 01-22:59:01 23.3 102400 /Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper',
    '83564 10:29 0.5 51200 /Users/m/Library/Application Support/Claude/claude-code/2.1.260/claude.app/Contents/MacOS/claude --output-format stream-json',
    '83563 10:29 0.0 1024 /Applications/Claude.app/Contents/Helpers/disclaimer -- /Users/m/claude-code/claude',
    '85123 00:31 0.0 2048 /Applications/ChatGPT.app/Contents/Resources/codex -c features.x app-server',
  ].join('\n');
  const r = Object.fromEntries(parsePs(out).map((x) => [x.id, x]));
  assert.equal(r['claude-desktop'].processes, 1);
  assert.equal(r['claude-code'].processes, 1);
  assert.equal(r.codex.running, true);
  assert.equal(r.cursor.running, false);
  assert.equal(etimeToSec('01-22:59:09'), 86400 + 22 * 3600 + 59 * 60 + 9);
});
