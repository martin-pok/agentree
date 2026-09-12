import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { createSession, deriveStatus } from '../src/model.js';
import { createCodexConnector, mapCodexItem, windowLabel } from '../src/connectors/codex.js';
import { applyGeminiChat } from '../src/connectors/gemini-family.js';
import { applyVsCodeChat, applyCopilotEvent } from '../src/connectors/copilot.js';
import { applyCursorComposer } from '../src/connectors/cursor.js';
import { validateWebPayload, applyWebPayload } from '../src/connectors/web.js';
import { parsePs, etimeToSec } from '../src/connectors/processes.js';
import { createClaudeDesktopUsageConnector, applyPlanUsageSample, findLatestSample, planUsageSeries } from '../src/connectors/claude-desktop-usage.js';
import { tempDir, writeJsonl, fakeDatastore } from './helpers.mjs';

test('Codex: automatická kontrola a pomocný agent patří k rodiči, plánovaná úloha má svůj název (ne název složky)', async () => {
  const home = await tempDir();
  const config = loadConfig({ AGENTREE_SOURCE_HOME: home, AGENTREE_HOME: home });
  const store = new Store({ config, datastore: fakeDatastore() });
  const connector = createCodexConnector({ config, store });
  const parent = '01a090ab-2039-7192-8923-6a97897b911a';
  const review = '01a090bd-1fc8-78d0-9619-443ffbbed5b2';
  const spawned = '01a0917b-6cb4-7072-aefb-58791e31bc59';
  const task = '01a01bba-ebbc-78c2-b292-39b4116d4211';
  const now = Date.now();
  const ts = (s) => new Date(now - 120000 + s * 1000).toISOString();
  const dir = path.join(home, '.codex', 'sessions', '2026', '09', '11');
  const cwd = '/Users/x/Projects/POKORNY DESIGN';
  await writeJsonl(path.join(dir, `rollout-2026-09-11T15-32-09-${parent}.jsonl`), [
    { timestamp: ts(0), type: 'session_meta', payload: { id: parent, cwd, originator: 'codex_work_desktop', source: 'vscode', thread_source: 'user', timestamp: ts(0) } },
    { timestamp: ts(1), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: 'Oprav seznam agentů' }] } } },
  ]);
  await writeJsonl(path.join(dir, `rollout-2026-09-11T15-51-48-${review}.jsonl`), [
    { timestamp: ts(2), type: 'session_meta', payload: { id: review, session_id: parent, parent_thread_id: parent, cwd, originator: 'codex_work_desktop', source: { subagent: { other: 'guardian' } }, thread_source: 'guardian_review', timestamp: ts(2) } },
    { timestamp: ts(3), type: 'event_msg', payload: { type: 'task_started' } },
    { timestamp: ts(4), type: 'event_msg', payload: { type: 'task_complete' } },
  ]);
  await writeJsonl(path.join(dir, `rollout-2026-09-11T19-19-40-${spawned}.jsonl`), [
    { timestamp: ts(5), type: 'session_meta', payload: { id: spawned, parent_thread_id: parent, cwd, originator: 'codex_work_desktop', source: { subagent: { thread_spawn: { parent_thread_id: parent, depth: 1, agent_nickname: 'Fermat' } } }, thread_source: 'subagent', timestamp: ts(5) } },
  ]);
  await writeJsonl(path.join(dir, `rollout-2026-09-11T20-00-00-${task}.jsonl`), [
    { timestamp: ts(6), type: 'session_meta', payload: { id: task, cwd: home, originator: 'codex_work_desktop', source: 'vscode', timestamp: ts(6) } },
    { timestamp: ts(7), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: '<scheduled-task name="pd-intake" file="/x/SKILL.md">Zkontroluj poptávky</scheduled-task>' }] } } },
  ]);
  await connector.start();
  connector.stop();
  const sum = (id) => store.summary(`codex:${id}`);
  assert.equal(sum(parent).parentId, null, 'uživatelská konverzace nemá rodiče');
  assert.equal(sum(parent).title, 'Oprav seznam agentů');
  assert.equal(sum(review).parentId, `codex:${parent}`);
  assert.deepEqual(sum(review).subagent, { kind: 'review', label: 'Automatická kontrola Codexu' });
  assert.equal(sum(review).title, 'Automatická kontrola Codexu', 'ne název složky „POKORNY DESIGN“');
  assert.equal(sum(spawned).parentId, `codex:${parent}`);
  assert.equal(sum(spawned).title, 'Pomocný agent Fermat');
  assert.equal(sum(task).parentId, null, 'plánovaná úloha je samostatné vlákno');
  assert.equal(sum(task).title, 'Plánovaná úloha · pd-intake', 'ne název domovské složky');
});

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
  const r = Object.fromEntries(parsePs(`${out}\n85200 00:12 0.0 3072 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT\n85301 00:05 0.0 4096 /opt/homebrew/bin/codex exec --skip-git-repo-check`).map((x) => [x.id, x]));
  assert.equal(r['claude-desktop'].processes, 1);
  assert.equal(r['claude-code'].processes, 1);
  assert.equal(r.chatgpt.processes, 1, 'aplikace ChatGPT se pozná ze svého hlavního procesu');
  assert.equal(r.codex.processes, 1, 'vnitřní codex app-server v ChatGPT.app se nepočítá jako samostatný Codex CLI');
  assert.equal(r.cursor.running, false);
  assert.equal(etimeToSec('01-22:59:09'), 86400 + 22 * 3600 + 59 * 60 + 9);
});

test('Claude Desktop · historie limitů: poslední vzorek se zapíše jako 5h/týden (a extra usage, pokud je)', () => {
  const home = '/tmp/nepouzito';
  const config = loadConfig({ AGENTREE_SOURCE_HOME: home, AGENTREE_HOME: home });
  const store = new Store({ config, datastore: fakeDatastore() });
  const at = Date.now() - 60000;
  assert.equal(applyPlanUsageSample(store, { t: at, org: 'org_x', u: { fh: 99, sd: 41, xu: 64.35 } }), true);
  const byId = Object.fromEntries(store.limitList().map((l) => [l.id, l]));
  assert.equal(byId['claude:five_hour:history'].usedPercent, 99);
  assert.equal(byId['claude:five_hour:history'].label, 'Limit 5 h');
  assert.equal(byId['claude:five_hour:history'].windowMinutes, 300);
  assert.equal(byId['claude:five_hour:history'].source, 'plan-history');
  assert.equal(byId['claude:five_hour:history'].kind, 'window');
  assert.equal(byId['claude:seven_day:history'].usedPercent, 41);
  assert.equal(byId['claude:seven_day:history'].windowMinutes, 10080);
  // `xu` je vyčerpaný limit extra usage v procentech (viz komentář v konektoru: sousední fh/sd jsou
  // procenta, stavový řádek Claude Code hlásí stejnou trojici a hodnota nikdy nepřekročila 100).
  assert.equal(byId['claude:spend_limit:history'].usedPercent, 64.35);
  assert.equal(byId['claude:spend_limit:history'].value, 64.35, 'původní hodnota zůstává k dispozici');
  assert.equal(byId['claude:spend_limit:history'].label, 'Extra usage');
  assert.equal(byId['claude:spend_limit:history'].kind, 'spend');
  assert.equal(byId['claude:spend_limit:history'].id.endsWith(':history'), true, 'id se nikdy nesrazí s přesným údajem ze stavového řádku');
  // Vlastní id ('…:history') se nikdy nepřepisuje přes id stavového řádku ('claude:five_hour') a naopak —
  // ui.js#currentLimits dá při souběhu přednost zdroji 'statusline', tahle historie zůstane jen záloha.
  assert.equal(Object.keys(byId).sort().join(','), 'claude:five_hour:history,claude:seven_day:history,claude:spend_limit:history');
});

test('Claude Desktop · historie limitů: chybějící xu nic nezapisuje, chybný vzorek se přeskočí', () => {
  const home = '/tmp/nepouzito';
  const config = loadConfig({ AGENTREE_SOURCE_HOME: home, AGENTREE_HOME: home });
  const store = new Store({ config, datastore: fakeDatastore() });
  applyPlanUsageSample(store, { t: Date.now(), org: 'org_x', u: { fh: 10, sd: 5 } });
  assert.equal(store.limitList().length, 2, 'bez xu vzniknou jen dva limity');
  assert.equal(applyPlanUsageSample(store, { t: 0, u: { fh: 1 } }), false, 'neplatné t se zahodí');
  assert.equal(applyPlanUsageSample(store, null), false);
  assert.equal(findLatestSample({ samples: [] }), null);
  assert.equal(findLatestSample({}), null);
  assert.deepEqual(findLatestSample({ samples: [{ t: 1 }, { t: 2 }] }), { t: 2 }, 'bere se poslední vzorek');
});

test('Claude Desktop · historie limitů (konektor): poslední vzorek ze souboru, chybějící i poškozený soubor server nespadnou', async () => {
  const home = await tempDir();
  const config = loadConfig({ AGENTREE_SOURCE_HOME: home, AGENTREE_HOME: home });
  const store = new Store({ config, datastore: fakeDatastore() });
  const connector = createClaudeDesktopUsageConnector({ config, store });

  // 1) Soubor zatím neexistuje — konektor nesmí spadnout, stav je „missing“.
  await connector.start();
  assert.equal(connector.status().state, 'missing');
  assert.equal(store.limitList().length, 0);
  connector.stop();

  // 2) Soubor existuje se vzorky — poslední vzorek se zapíše.
  const dir = path.join(home, 'Library', 'Application Support', 'Claude');
  const file = path.join(dir, 'plan-usage-history.json');
  const now = Date.now();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify({
    version: 2,
    samples: [
      { t: now - 30 * 60000, org: 'org_x', u: { fh: 20, sd: 10 } },
      { t: now, org: 'org_x', u: { fh: 99, sd: 41, xu: 64.35 } },
    ],
  }));
  const connector2 = createClaudeDesktopUsageConnector({ config, store });
  await connector2.start();
  const byId = Object.fromEntries(store.limitList().map((l) => [l.id, l]));
  assert.equal(byId['claude:five_hour:history'].usedPercent, 99, 'zapíše se jen poslední vzorek, ne první');
  assert.equal(byId['claude:seven_day:history'].usedPercent, 41);
  assert.equal(byId['claude:spend_limit:history'].usedPercent, 64.35, 'extra usage je procento vyčerpaného limitu');
  assert.equal(connector2.status().state, 'connected');
  connector2.stop();

  // 3) Poškozený JSON — nesmí shodit ani zůstat v chybovém zacyklení, jen se nahlásí chyba.
  await fs.writeFile(file, '{ toto neni platny json');
  const connector3 = createClaudeDesktopUsageConnector({ config, store });
  await assert.doesNotReject(connector3.start());
  assert.equal(connector3.status().state, 'error');
  connector3.stop();
});

test('Historie vytížení plánu: filtruje okno, řadí, ředí body a nikdy nevydá identifikátor organizace', () => {
  const now = Date.UTC(2026, 8, 12, 12, 0, 0);
  const day = 86400000;
  const json = {
    version: 2,
    samples: [
      { t: now - 40 * day, org: 'org_tajne', u: { fh: 10, sd: 10, xu: 1 } }, // mimo okno
      { t: now - 2 * day, org: 'org_tajne', u: { fh: 88, sd: 50 } },
      { t: now - 3 * day, org: 'org_tajne', u: { fh: 120, sd: -4, xu: 64.35 } }, // pořadí i rozsah
      { t: 'nesmysl', org: 'org_tajne', u: { fh: 5 } },
    ],
  };
  const out = planUsageSeries(json, { days: 30, now });

  assert.equal(out.samples, 2, 'starý vzorek i vzorek bez času vypadnou');
  assert.deepEqual(out.fiveHour.map((p) => p.value), [100, 88], 'řazeno podle času, procenta ořezaná na 0–100');
  assert.deepEqual(out.sevenDay.map((p) => p.value), [0, 50]);
  assert.deepEqual(out.extraUsage, [{ at: now - 3 * day, value: 64.35 }], 'extra usage se neořezává, jednotku neznáme');
  assert.equal(out.from, now - 3 * day);
  assert.equal(out.to, now - 2 * day);
  assert.equal(JSON.stringify(out).includes('org'), false, 'identifikátor organizace ven nesmí');
});

test('Historie vytížení plánu: hustá data se naředí a poslední bod zůstane', () => {
  const now = Date.UTC(2026, 8, 12, 12, 0, 0);
  const samples = Array.from({ length: 1000 }, (_, i) => ({ t: now - (1000 - i) * 60000, u: { fh: i % 101 } }));
  const out = planUsageSeries({ samples }, { days: 30, now, maxPoints: 100 });

  assert.ok(out.fiveHour.length <= 101, `bodů má být nejvýš 101, je ${out.fiveHour.length}`);
  assert.equal(out.fiveHour[out.fiveHour.length - 1].at, now - 60000, 'poslední vzorek se nesmí zahodit');
  assert.equal(out.samples, 1000);
});
