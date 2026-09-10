import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, deriveStatus } from '../src/model.js';
import { applyClaudeLine, newFileState, parseResets, describeTool, todosProgress } from '../src/connectors/claude-code.js';

const T0 = Date.parse('2026-09-10T10:00:00Z');
const at = (sec) => new Date(T0 + sec * 1000).toISOString();

function feed(lines, hooks = {}) {
  const s = createSession({ connector: 'claude-code', localId: 'abc', provider: 'anthropic', app: 'Claude Code' });
  const st = newFileState();
  for (const l of lines) applyClaudeLine(st, s, l, hooks);
  return { s, st };
}

test('zadání → nástroj → výsledek → konec tahu', () => {
  const lines = [
    { type: 'user', timestamp: at(0), cwd: '/Users/x/proj', gitBranch: 'main', message: { role: 'user', content: 'Oprav testy' } },
    { type: 'assistant', timestamp: at(2), message: { id: 'm1', model: 'claude-opus-5', stop_reason: 'tool_use', content: [{ type: 'text', text: 'Spustím testy.' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test', description: 'Spustit testy' } }], usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 } } },
  ];
  const { s, st } = feed(lines);
  assert.equal(deriveStatus(s, T0 + 5000).status, 'working');
  assert.equal(s.activity, 'Spouští příkaz: Spustit testy');
  assert.equal(st.pendingTools.size, 1);

  for (const l of [
    { type: 'assistant', timestamp: at(2), message: { id: 'm1', model: 'claude-opus-5', stop_reason: 'tool_use', content: [], usage: { input_tokens: 10, output_tokens: 50, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 } } },
    { type: 'user', timestamp: at(30), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok 12 tests' }] } },
    { type: 'assistant', timestamp: at(35), message: { id: 'm2', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo.' }], usage: { input_tokens: 1, output_tokens: 10 } } },
  ]) applyClaudeLine(st, s, l);

  assert.equal(s.turns, 1);
  assert.equal(s.cwd, '/Users/x/proj');
  assert.equal(s.branch, 'main');
  assert.deepEqual(s.transcript.map((e) => e.role), ['user', 'assistant', 'tool', 'result', 'assistant']);
  assert.equal(s.tokens.output, 60, 'opakovaná zpráva se stejným id se nepočítá dvakrát');
  assert.equal(s.tokens.input, 11);
  assert.equal(s.tokens.cacheWrite, 100);
  assert.equal(s.tokens.cacheRead, 1000);
  assert.equal(Object.values(s.hourly).reduce((a, b) => a + b, 0), 171);
  assert.equal(s.running, false);
  assert.equal(deriveStatus(s, T0 + 40000).status, 'waiting');
});

test('dlouhé přemýšlení bez zápisu není „hotovo“; dlouho čekající nástroj bez hooků je „možná čeká na povolení“', () => {
  const { s, st } = feed([
    { type: 'user', timestamp: at(0), message: { content: 'Napiš celou aplikaci' } },
    { type: 'assistant', timestamp: at(5), message: { id: 'x', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'rm -rf dist', description: 'Smazat build' } }] } },
  ]);
  s.staleMs = 30 * 60e3;
  const long = deriveStatus(s, T0 + 5000 + 120e3);
  assert.equal(long.status, 'working');
  assert.equal(long.reason, 'Spouští příkaz: Smazat build · možná čeká na tvé povolení');
  s.hookAt = T0;
  assert.equal(deriveStatus(s, T0 + 125e3).reason, 'Spouští příkaz: Smazat build', 's hooky víme jistě, proto bez domněnky');
  applyClaudeLine(st, s, { type: 'user', timestamp: at(130), message: { content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'ok' }] } });
  assert.equal(s.toolWaitSince, 0);
  const stale = deriveStatus(s, T0 + 130e3 + 31 * 60e3);
  assert.equal(stale.status, 'waiting');
  assert.equal(stale.stale, true, 'bez konce tahu je to jen nečinnost, ne dokončení');
});

test('AskUserQuestion přepne na „potřebuje rozhodnutí“ a odpověď ho zruší', () => {
  const { s, st } = feed([
    { type: 'user', timestamp: at(0), message: { content: 'Navrhni logo' } },
    { type: 'assistant', timestamp: at(3), message: { id: 'q', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'ask1', name: 'AskUserQuestion', input: { questions: [{ question: 'Jaký styl?' }] } }] } },
  ]);
  assert.equal(deriveStatus(s, T0 + 60000).status, 'needs_input');
  assert.equal(deriveStatus(s, T0 + 60000).reason, 'Jaký styl?');
  applyClaudeLine(st, s, { type: 'user', timestamp: at(90), message: { content: [{ type: 'tool_result', tool_use_id: 'ask1', content: 'Minimalistický' }] } });
  assert.equal(s.pending, null);
  assert.equal(deriveStatus(s, T0 + 91000).status, 'working');
});

test('chyba limitu → stav „limit“, čas obnovení a zrušení po úspěšné odpovědi', () => {
  const limits = [];
  let resolvedAt = 0;
  const { s, st } = feed(
    [
      { type: 'user', timestamp: at(0), message: { content: 'Pokračuj' } },
      { type: 'assistant', timestamp: at(1), isApiErrorMessage: true, message: { id: 'e1', model: '<synthetic>', content: [{ type: 'text', text: "You've hit your session limit · resets 1am (Europe/Prague)" }] } },
    ],
    { onLimit: (l) => limits.push(l), onSuccess: (ts) => { resolvedAt = ts; } },
  );
  assert.equal(deriveStatus(s, T0 + 2000).status, 'limited');
  assert.equal(limits.length, 1);
  assert.equal(limits[0].id, 'claude:session');
  assert.ok(limits[0].resetsAt > T0);
  applyClaudeLine(st, s, { type: 'assistant', timestamp: at(7200), message: { id: 'ok', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Pokračuji.' }] } }, { onSuccess: (ts) => { resolvedAt = ts; } });
  assert.equal(s.limit, null);
  assert.equal(resolvedAt, T0 + 7200 * 1000);
});

test('přerušení uživatelem ukončí práci', () => {
  const { s } = feed([
    { type: 'user', timestamp: at(0), message: { content: 'Udělej refaktor' } },
    { type: 'assistant', timestamp: at(2), message: { id: 'a', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'Edit', input: { file_path: '/a/b.js' } }] } },
    { type: 'user', timestamp: at(4), message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } },
  ]);
  assert.equal(s.running, false);
  assert.equal(s.transcript.at(-1).text, 'Přerušeno uživatelem');
});

test('vložený systémový kontext se nepočítá jako zadání', () => {
  const { s } = feed([
    { type: 'user', timestamp: at(0), message: { content: '<command-name>/clear</command-name>' } },
    { type: 'user', timestamp: at(1), message: { content: 'Skutečné zadání' } },
  ]);
  assert.equal(s.turns, 1);
  assert.equal(s.firstPrompt, 'Skutečné zadání');
});

test('parseResets počítá nejbližší budoucí čas', () => {
  const late = new Date(2026, 8, 10, 23, 30).getTime();
  assert.equal(parseResets('resets 1am (Europe/Prague)', late), new Date(2026, 8, 11, 1, 0).getTime());
  const morning = new Date(2026, 8, 10, 10, 0).getTime();
  assert.equal(parseResets('resets 3:30pm', morning), new Date(2026, 8, 10, 15, 30).getTime());
  assert.equal(parseResets('bez času', morning), null);
});

test('popis nástrojů a průběh úkolů', () => {
  assert.equal(describeTool('Edit', { file_path: '/x/y/app.js' }), 'Upravuje soubor: app.js');
  assert.equal(describeTool('mcp__asana__get_task', {}), 'Používá nástroj: asana · get task');
  assert.deepEqual(todosProgress([{ status: 'completed', content: 'a' }, { status: 'in_progress', content: 'b', activeForm: 'Dělám b' }, { status: 'pending', content: 'c' }]), { done: 1, total: 3, current: 'Dělám b' });
});
