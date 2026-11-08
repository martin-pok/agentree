import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { tempDir } from './helpers.mjs';

// Vlastník 8. 11. 2026: „appka se načítá strašně dlouho“. Okno se otevře s konverzacemi z posledních
// dvou dnů; starší se dočtou na pozadí tiše (bez stovek zpráv do živého proudu) a okno si pak stáhne
// stav jednou (resync). Upozornění se zapnou až po dočtení – stará chyba se neohlásí jako nová.
async function prepis(home, id, staroMs, chyba = false) {
  const dir = path.join(home, '.claude', 'projects', '-Users-m-proj');
  await fs.mkdir(dir, { recursive: true });
  const at = (ms) => new Date(Date.now() - staroMs - ms).toISOString();
  const radky = [
    { type: 'user', timestamp: at(60e3), cwd: '/Users/m/proj', message: { role: 'user', content: 'Oprav testy' } },
    chyba
      ? { type: 'assistant', timestamp: at(50e3), isApiErrorMessage: true, message: { id: `e-${id}`, model: 'claude-opus-5', stop_reason: 'stop_sequence', content: [{ type: 'text', text: 'API Error: 500' }] } }
      : { type: 'assistant', timestamp: at(50e3), message: { id: `m-${id}`, model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo.' }], usage: { input_tokens: 10, output_tokens: 5 } } },
  ];
  const f = path.join(dir, `${id}.jsonl`);
  await fs.writeFile(f, radky.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const m = new Date(Date.now() - staroMs);
  await fs.utimes(f, m, m);
}

test('rychlý start: okno s nedávnými, starší se dočtou tiše a okno dostane jeden resync', async () => {
  const home = await tempDir('agenteeq-start-');
  const data = await tempDir('agenteeq-start-data-');
  await prepis(home, '11111111-1111-4111-8111-111111111111', 60e3);
  await prepis(home, '22222222-2222-4222-8222-222222222222', 5 * 864e5, true);
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: data, AGENTEEQ_QUIET: '1', AGENTEEQ_PROCESSES: '0', AGENTEEQ_CHATGPT_APP: '0', AGENTEEQ_NATIVE_NOTIFY: '0', AGENTEEQ_KEYCHAIN: '0', AGENTEEQ_CLOUD: '0', AGENTEEQ_UCET_URL: '0', AGENTEEQ_OPEN: 'dry', AGENTEEQ_OLLAMA_URL: 'http://127.0.0.1:9', AGENTEEQ_SCAN_MS: '60000' });
  const app = await createApp(config);
  try {
    await app.start();
    assert.equal(app.store.ready, true, 'okno může začít hned');
    assert.ok(app.store.get('claude-code:11111111-1111-4111-8111-111111111111'), 'nedávná konverzace je načtená před otevřením okna');
    assert.equal(app.store.get('claude-code:22222222-2222-4222-8222-222222222222'), undefined, 'starší čeká na dočtení');
    const udalosti = [];
    app.store.on('session', (s) => udalosti.push(['session', s.id]));
    app.store.on('resync', () => udalosti.push(['resync']));
    await app.dokonceno();
    assert.ok(app.store.get('claude-code:22222222-2222-4222-8222-222222222222'), 'starší konverzace je po dočtení vidět');
    assert.deepEqual(udalosti.filter(([n, id]) => n === 'session' && id.includes('2222')), [], 'dočtená konverzace nejde do proudu po jedné');
    assert.equal(udalosti.filter(([n]) => n === 'resync').length, 1, 'okno dostane jeden pokyn ke stažení stavu');
    assert.equal(app.alerts.list().filter((a) => a.sessionId?.includes('2222')).length, 0, 'stará chyba se neohlásí jako nová');
  } finally { await app.stop(); }
});
