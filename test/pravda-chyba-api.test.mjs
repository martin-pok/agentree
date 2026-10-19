// Konec do konce: Claude Code tah, který skončil chybou API, je na serveru „selhalo“ – ne
// „Hotovo, čeká na další zadání“ – a upozornění neříká, že selhalo spuštění.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startTestServer, api, tempDir, writeJsonl, waitFor } from './helpers.mjs';

test('Claude Code: chyba API 500 → stav failed s textem chyby a upozornění „skončil chybou“', async (t) => {
  const home = await tempDir('agenteeq-chyba-api-');
  const now = Date.now();
  const iso = (ms) => new Date(now + ms).toISOString();
  const chyba = 'API Error: 500 {"type":"error","error":{"type":"api_error","message":"Internal server error"}}';
  const soubor = path.join(home, '.claude', 'projects', '-Users-x-proj', 'chyba.jsonl');
  await writeJsonl(soubor, [
    { type: 'user', timestamp: iso(-60e3), cwd: '/Users/x/proj', sessionId: 'chyba', message: { role: 'user', content: 'Oprav testy' } },
    { type: 'assistant', timestamp: iso(-58e3), sessionId: 'chyba', message: { id: 'm1', model: 'claude-opus-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/Users/x/proj/a.js' } }], usage: { input_tokens: 10, output_tokens: 5 } } },
    { type: 'user', timestamp: iso(-57e3), sessionId: 'chyba', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
  ]);
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  t.after(() => srv.close());
  const relace = async () => (await api(srv.url).get('/api/state')).body.sessions.find((x) => x.id === 'claude-code:chyba');
  assert.equal((await waitFor(relace)).status, 'working');
  // Upozornění vzniká při změně stavu za běhu (stav načtený při startu je starý a nehlásí se).
  await writeJsonl(soubor, [
    { type: 'assistant', timestamp: new Date().toISOString(), sessionId: 'chyba', isApiErrorMessage: true, message: { id: 'e1', model: '<synthetic>', content: [{ type: 'text', text: chyba }] } },
  ], { append: true });
  const s = await waitFor(async () => { const x = await relace(); return x?.status === 'failed' ? x : null; });
  assert.equal(s.status, 'failed');
  assert.equal(s.done, false);
  assert.equal(s.reason, chyba);
  assert.deepEqual(s.tokens, { input: 10, output: 5, cacheWrite: 0, cacheRead: 0 }, 'tokeny z úspěšné části tahu zůstávají');
  const alert = await waitFor(async () => (await api(srv.url).get('/api/alerts')).body.items.find((a) => a.kind === 'failed' && a.sessionId === s.id));
  assert.equal(alert.title, 'Claude Code: skončil chybou');
});
