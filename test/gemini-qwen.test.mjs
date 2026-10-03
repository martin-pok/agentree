import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createSession } from '../src/model.js';
import { parseGeminiJsonl, applyGeminiChat, applyQwenJsonl, geminiTokens } from '../src/connectors/gemini-family.js';
import { startTestServer, api, tempDir } from './helpers.mjs';

// Tvar záznamů je převzatý ze zdrojového kódu obou nástrojů (gemini-cli a qwen-code,
// packages/core/src/services/chatRecordingService.ts), ne odhadnutý. Dřív konektor četl jen
// starý jednosouborový .json – moderní Gemini CLI ani Qwen Code tak neukázaly nic.

const H = 3600e3;
const iso = (t) => new Date(t).toISOString();
const tokenyCelkem = (s) => Object.values(s.hourly || {}).reduce((a, b) => a + b, 0);
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

async function pockej(fn, ms = 8000) {
  const konec = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > konec) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('Gemini tokeny: vstup bez mezipaměti + nástroje, výstup + přemýšlení', () => {
  assert.deepEqual(geminiTokens({ input: 1000, cached: 400, tool: 50, output: 200, thoughts: 30, total: 1280 }), { input: 650, output: 230, cacheRead: 400 });
  assert.deepEqual(geminiTokens({}), { input: 0, output: 0, cacheRead: 0 }, 'chybějící údaje nejsou chyba');
});

test('Gemini JSONL: stejné id = poslední záznam platí, tokeny se nezdvojí', () => {
  const t = Date.now() - H;
  const j = parseGeminiJsonl(jsonl([
    { sessionId: 's1', projectHash: 'p', startTime: iso(t), lastUpdated: iso(t) },
    { id: 'u1', timestamp: iso(t + 1000), type: 'user', content: [{ text: 'Oprav test' }] },
    { id: 'g1', timestamp: iso(t + 2000), type: 'gemini', content: [{ text: 'Opravuji.' }], model: 'gemini-3-pro' },
    // Tokeny se k odpovědi dopíšou až po jejím dokončení – tentýž záznam znovu, s tokeny.
    { id: 'g1', timestamp: iso(t + 2000), type: 'gemini', content: [{ text: 'Opraveno.' }], model: 'gemini-3-pro', tokens: { input: 1000, output: 100, cached: 600, thoughts: 20, tool: 0, total: 1120 } },
  ]));
  assert.equal(j.sessionId, 's1');
  assert.equal(j.messages.length, 2, 'dva záznamy téže odpovědi jsou jedna zpráva');
  const s = createSession({ connector: 'gemini-cli', localId: 's1', provider: 'google', app: 'Gemini CLI' });
  applyGeminiChat(s, j, t + 2000);
  assert.equal(tokenyCelkem(s), 520, '(1000 − 600) + (100 + 20)');
  assert.equal(s.transcript.at(-1).text, 'Opraveno.', 'platí poslední verze odpovědi');
});

test('Gemini JSONL: přetočení a přepsání historie', () => {
  const t = Date.now() - H;
  const radky = [
    { sessionId: 's2', projectHash: 'p', startTime: iso(t) },
    { id: 'a', timestamp: iso(t), type: 'user', content: 'první' },
    { id: 'b', timestamp: iso(t + 1), type: 'gemini', content: 'odpověď', tokens: { input: 10, output: 5, cached: 0 } },
    { id: 'c', timestamp: iso(t + 2), type: 'user', content: 'zahozené' },
    { $rewindTo: 'c' },
  ];
  assert.deepEqual(parseGeminiJsonl(jsonl(radky)).messages.map((m) => m.id), ['a', 'b'], '$rewindTo zahodí zprávu i vše po ní');
  const prepsano = parseGeminiJsonl(jsonl([...radky, { $set: { messages: [{ id: 'z', timestamp: iso(t + 9), type: 'user', content: 'nový začátek' }] } }]));
  assert.deepEqual(prepsano.messages.map((m) => m.id), ['z'], '$set.messages nahradí historii');
});

test('Qwen Code: záznamy, tokeny a větev relace bez dvojího počítání', () => {
  const t = Date.now() - H;
  const zaklad = { cwd: '/Users/x/web', version: '0.1', gitBranch: 'main' };
  const puvodni = [
    { ...zaklad, uuid: 'u1', parentUuid: null, sessionId: 'Q', timestamp: iso(t), type: 'user', message: { role: 'user', parts: [{ text: 'Přidej test' }] } },
    { ...zaklad, uuid: 'a1', parentUuid: 'u1', sessionId: 'Q', timestamp: iso(t + 1000), type: 'assistant', model: 'qwen3-coder', message: { role: 'model', parts: [{ text: 'Přidávám.' }, { functionCall: { name: 'write_file', args: { path: 'a.test.js' } } }] }, usageMetadata: { promptTokenCount: 900, cachedContentTokenCount: 500, candidatesTokenCount: 80, thoughtsTokenCount: 20, totalTokenCount: 1000 } },
    { ...zaklad, uuid: 's1', parentUuid: 'a1', sessionId: 'Q', timestamp: iso(t + 1500), type: 'system', subtype: 'custom_title', systemPayload: { customTitle: 'Testy webu' } },
  ];
  const s = createSession({ connector: 'qwen-code', localId: 'Q', provider: 'alibaba', app: 'Qwen Code' });
  applyQwenJsonl(s, jsonl(puvodni), t + 1500);
  assert.equal(tokenyCelkem(s), 500, '(900 − 500) + (80 + 20)');
  assert.equal(s.title, 'Testy webu');
  assert.equal(s.cwd, '/Users/x/web');
  assert.equal(s.branch, 'main');
  assert.equal(s.model, 'qwen3-coder');
  assert.deepEqual(s.transcript.map((e) => e.role), ['user', 'assistant', 'tool']);

  // /branch kopíruje zprávy rodiče doslova (stejné uuid, nový sessionId, značka forkedFrom).
  const vetev = [
    ...puvodni.slice(0, 2).map((r) => ({ ...r, sessionId: 'B', forkedFrom: { sessionId: 'Q', messageUuid: r.uuid } })),
    { ...zaklad, uuid: 'a2', parentUuid: 'a1', sessionId: 'B', timestamp: iso(t + 5000), type: 'assistant', model: 'qwen3-coder', message: { role: 'model', parts: [{ text: 'Pokračuji ve větvi.' }] }, usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 0, candidatesTokenCount: 10 } },
  ];
  const b = createSession({ connector: 'qwen-code', localId: 'B', provider: 'alibaba', app: 'Qwen Code' });
  applyQwenJsonl(b, jsonl(vetev), t + 5000);
  assert.equal(tokenyCelkem(b), 110, 'větev počítá jen svou vlastní práci');
});

test('Gemini CLI a Qwen Code v aplikaci: skutečné cesty, pomocník a ignorované soubory', async () => {
  const home = await tempDir('gemini-qwen-');
  const t = Date.now() - H;
  const gChats = path.join(home, '.gemini', 'tmp', 'abc123', 'chats');
  await fs.mkdir(path.join(gChats, 'hlavni-relace'), { recursive: true });
  await fs.writeFile(path.join(gChats, 'session-2026-09-22T10-00-hlavni-r.jsonl'), jsonl([
    { sessionId: 'hlavni-relace', projectHash: 'abc123', startTime: iso(t), lastUpdated: iso(t) },
    { id: 'u1', timestamp: iso(t), type: 'user', content: 'Refaktoruj modul' },
    { id: 'g1', timestamp: iso(t + 1000), type: 'gemini', content: 'Hotovo.', model: 'gemini-3-pro', tokens: { input: 300, output: 40, cached: 100, total: 340 } },
  ]));
  // Pomocný agent leží ve složce rodiče.
  await fs.writeFile(path.join(gChats, 'hlavni-relace', 'pomocnik-1.jsonl'), jsonl([
    { sessionId: 'pomocnik-1', projectHash: 'abc123', startTime: iso(t) },
    { id: 'x', timestamp: iso(t + 2000), type: 'gemini', content: 'Prohledáno.', tokens: { input: 50, output: 5, cached: 0 } },
  ]));
  const qChats = path.join(home, '.qwen', 'projects', '-Users-x-web', 'chats');
  await fs.mkdir(qChats, { recursive: true });
  await fs.writeFile(path.join(qChats, 'qwen-relace.jsonl'), jsonl([
    { uuid: 'u1', parentUuid: null, sessionId: 'qwen-relace', timestamp: iso(t), type: 'user', cwd: '/Users/x/web', version: '0.1', message: { role: 'user', parts: [{ text: 'Ahoj' }] } },
    { uuid: 'a1', parentUuid: 'u1', sessionId: 'qwen-relace', timestamp: iso(t + 1000), type: 'assistant', cwd: '/Users/x/web', version: '0.1', model: 'qwen3-coder', message: { role: 'model', parts: [{ text: 'Dobrý den' }] }, usageMetadata: { promptTokenCount: 70, candidatesTokenCount: 7 } },
  ]));
  await fs.writeFile(path.join(qChats, 'qwen-relace.runtime.json'), JSON.stringify({ pid: 1 }), 'utf8');

  const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    const stav = await pockej(async () => {
      const s = (await api(demo.url).send('GET', '/api/state')).body;
      const g = s.sessions.filter((x) => x.connector === 'gemini-cli');
      const q = s.sessions.filter((x) => x.connector === 'qwen-code');
      return g.length === 2 && q.length === 1 ? { s, g, q } : null;
    });
    assert.ok(stav, 'Gemini CLI (2 relace) i Qwen Code (1 relace) jsou v přehledu');
    const hlavni = stav.g.find((x) => x.id === 'gemini-cli:hlavni-relace');
    const pomocnik = stav.g.find((x) => x.id === 'gemini-cli:pomocnik-1');
    assert.equal(tokenyCelkem(hlavni), 240);
    assert.equal(pomocnik.parentId, 'gemini-cli:hlavni-relace', 'pomocník patří pod rodiče');
    assert.equal(tokenyCelkem(stav.q[0]), 77);
    assert.equal(stav.q[0].cwd, '/Users/x/web');
    const konektory = Object.fromEntries(stav.s.connectors.map((c) => [c.id, c]));
    assert.equal(konektory['gemini-cli'].state, 'connected');
    assert.equal(konektory['qwen-code'].state, 'connected');
    assert.equal(konektory['qwen-code'].count, 1, 'soubor *.runtime.json není konverzace');
  } finally { await demo.close(); }
});
