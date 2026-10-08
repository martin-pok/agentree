import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, deriveStatus } from '../src/model.js';
import { applyClaudeLine, newFileState, druhCekani } from '../src/connectors/claude-code.js';

// „Čeká na tvé povolení“ bez hooků (src/model.js#deriveStatus): z přepisu je vidět jen nástroj bez
// výsledku. Úprava souboru, která čeká přes 20 s, je skoro jistě žádost o povolení; čtení se nikdy
// neptá; Bash a MCP umí běžet dlouho samy, takže po 90 s jen „možná“. Režim oprávnění to upřesní.

// V minulosti: markRunning ořezává časy z budoucnosti na teď.
const T0 = Date.now() - 3600e3;
const ts = (ms) => new Date(T0 + ms).toISOString();

function relace(nastroj, { permissionMode } = {}) {
  const s = createSession({ connector: 'claude-code', localId: 'P1', provider: 'anthropic', app: 'Claude Code' });
  const st = newFileState();
  applyClaudeLine(st, s, { type: 'user', timestamp: ts(0), cwd: '/tmp/x', ...(permissionMode ? { permissionMode } : {}), message: { role: 'user', content: 'Uprav README' } });
  applyClaudeLine(st, s, { type: 'assistant', timestamp: ts(1000), message: { id: 'm1', model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: nastroj, input: { file_path: '/tmp/x/README.md', command: 'npm test' } }], usage: {} } });
  return { s, st };
}
const stav = (s, poMs) => deriveStatus(s, T0 + 1000 + poMs);

test('povolení: úprava souboru přes 20 s bez výsledku = nejspíš čeká na povolení (jako odhad)', () => {
  const { s } = relace('Edit');
  assert.equal(s.toolWaitKind, 'uprava');
  assert.equal(stav(s, 10e3).status, 'working', 'krátké čekání je běžná práce');
  const r = stav(s, 25e3);
  assert.equal(r.status, 'needs_input');
  assert.match(r.reason, /^Nejspíš čeká na tvé povolení/, 'odhad musí být jako odhad poznat');
});

test('povolení: výsledek nástroje odhad hned zruší', () => {
  const { s, st } = relace('Write');
  applyClaudeLine(st, s, { type: 'user', timestamp: ts(30e3), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }] } });
  assert.equal(s.toolWaitKind, '');
  assert.equal(deriveStatus(s, T0 + 31e3).status, 'working');
});

test('povolení: čtení se neptá nikdy, Bash jen „možná“ po 90 s', () => {
  const cteni = relace('Grep').s;
  assert.equal(stav(cteni, 10 * 60e3 - 2000).reason.includes('povolení'), false);
  const bash = relace('Bash').s;
  assert.equal(stav(bash, 60e3).status, 'working');
  assert.doesNotMatch(stav(bash, 60e3).reason, /povolení/);
  const r = stav(bash, 120e3);
  assert.equal(r.status, 'working', 'dlouhý příkaz může prostě běžet');
  assert.match(r.reason, /možná čeká na tvé povolení/);
});

test('povolení: režim bez ptaní a úpravy bez ptaní odhad vypnou', () => {
  assert.equal(stav(relace('Edit', { permissionMode: 'acceptEdits' }).s, 60e3).status, 'working');
  assert.doesNotMatch(stav(relace('Edit', { permissionMode: 'acceptEdits' }).s, 200e3).reason, /povolení/);
  const bypass = relace('Bash', { permissionMode: 'bypassPermissions' }).s;
  assert.doesNotMatch(stav(bypass, 200e3).reason, /povolení/);
  // acceptEdits se na Bash ptá dál.
  assert.match(stav(relace('Bash', { permissionMode: 'acceptEdits' }).s, 120e3).reason, /možná čeká/);
});

test('povolení: s hooky rozhodují hooky, ne odhad', () => {
  const { s } = relace('Edit');
  s.hookAt = T0;
  assert.equal(stav(s, 60e3).status, 'working');
});

test('povolení: druh čekání podle nástrojů', () => {
  assert.equal(druhCekani([]), '');
  assert.equal(druhCekani(['Read', 'Grep']), 'cteni');
  assert.equal(druhCekani(['Read', 'Edit']), 'uprava');
  assert.equal(druhCekani(['Bash']), 'dlouhy');
  assert.equal(druhCekani(['mcp__github__create_issue']), 'dlouhy');
});
