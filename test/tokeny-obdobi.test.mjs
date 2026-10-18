// Tokeny a odhad ceny přes API za období („30 dní“, „dnes“) počítají jen to, co se v období
// skutečně spotřebovalo – každý model svou cenou a zápis do cache na hodinu zvlášť. Pásmo s
// půlhodinovým posunem (Indie, UTC+5:30) hlídá, že „dnes“ nepřijde o první půlhodinu dne.
process.env.TZ = 'Asia/Kolkata';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Prohlížečové API jen v rozsahu, který moduly při načtení potřebují.
globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
globalThis.document ??= { addEventListener() {}, documentElement: { dataset: {} } };
const { applyClaudeLine, newFileState } = await import('../src/connectors/claude-code.js');
const { createSession, summarize, addTokens } = await import('../src/model.js');
const { odhadCenyApi } = await import('../public/js/cenik-api.js');
const { tokensSince } = await import('../public/js/data.js');
const { startOfDay } = await import('../public/js/format.js');
const { projectStats } = await import('../public/js/projects-ui.js');
const { state } = await import('../public/js/state.js');

const DEN = 864e5;
const now = Date.now();
const usd = (o) => Math.round(o.usd * 100) / 100;

function relace() {
  const st = newFileState();
  st.ownSessionId = 'S1';
  const s = createSession({ connector: 'claude-code', localId: 'S1', provider: 'anthropic', app: 'Claude Code' });
  let n = 0;
  const zprava = (pred, model, usage, id = `msg_${++n}`) => applyClaudeLine(st, s, {
    type: 'assistant', sessionId: 'S1', uuid: `u${++n}`, timestamp: new Date(now - pred).toISOString(),
    message: { id, model, role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'x' }], usage },
  });
  return { s, zprava, souhrn: () => summarize(s, now, 30 * DEN) };
}

const MILION = { input_tokens: 1e6, output_tokens: 1e6, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

test('30 dní: tokeny a odhad ceny nepočítají starší historii konverzace, která byla v období jen aktivní', () => {
  const { zprava, souhrn } = relace();
  zprava(40 * DEN, 'claude-sonnet-4-5', MILION);
  zprava(60e3, 'claude-sonnet-4-5', { input_tokens: 100, output_tokens: 100 });
  const s = souhrn();
  const od = now - 30 * DEN;
  assert.ok(s.lastAt >= od, 'konverzace je v období aktivní');
  assert.equal(usd(odhadCenyApi([s], od)), 0, 'milion tokenů ze 40 dní zpátky do 30 dní nepatří');
  assert.equal(odhadCenyApi([s], od).sCenou, 200);

  state.sessions.clear();
  state.sessions.set(s.id, { ...s, projectId: 'p1' });
  assert.equal(projectStats({ id: 'p1' }, now).tokens, 200, 'KPI „Tokeny · 30 dní“ i karta projektu');
  state.sessions.clear();
});

test('odhad ceny: každý model svou cenou, ne celá konverzace cenou posledního modelu', () => {
  const { zprava, souhrn } = relace();
  zprava(5 * 60e3, 'claude-opus-4-1-20250805', MILION);
  zprava(60e3, 'claude-haiku-4-5', { input_tokens: 1e6, output_tokens: 0 });
  const s = souhrn();
  assert.equal(s.model, 'claude-haiku-4-5');
  assert.equal(usd(odhadCenyApi([s])), 15 + 75 + 1);
});

test('odhad ceny: oprava streamované zprávy (stejné message.id) zůstane u svého modelu a hodiny', () => {
  const { zprava, souhrn } = relace();
  zprava(3 * 60e3, 'claude-opus-4-1', { input_tokens: 1e6, output_tokens: 5 }, 'msg_A');
  zprava(2 * 60e3, 'claude-opus-4-1', MILION, 'msg_A');
  zprava(60e3, 'claude-haiku-4-5', { input_tokens: 0, output_tokens: 0 });
  const s = souhrn();
  assert.equal(s.tokens.output, 1e6);
  assert.equal(usd(odhadCenyApi([s])), 15 + 75);
  const modely = Object.values(s.hourlyUsage).flatMap((h) => Object.keys(h));
  assert.deepEqual([...new Set(modely)], ['claude-opus-4-1']);
});

test('odhad ceny: zápis do cache na hodinu stojí dvojnásobek vstupu, ne cenu 5minutového', () => {
  const { zprava, souhrn } = relace();
  zprava(60e3, 'claude-sonnet-4-5', {
    input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 2e6,
    cache_creation: { ephemeral_5m_input_tokens: 1e6, ephemeral_1h_input_tokens: 1e6 },
  });
  const s = souhrn();
  assert.equal(s.tokens.cacheWrite, 2e6);
  assert.equal(usd(odhadCenyApi([s])), 3.75 + 6);
});

test('odhad ceny: hodiny bez rozpadu podle modelu (např. Codex) se nedohadují', () => {
  const o = odhadCenyApi([{ model: 'gpt-5', hourly: { [new Date(now).toISOString().slice(0, 13)]: 500 }, hourlyUsage: {} }], now - DEN);
  assert.deepEqual(o, { usd: 0, sCenou: 0, bezCeny: 500, modelyBezCeny: ['gpt-5'] });
});

test('dnes v pásmu UTC+5:30: tokeny z 0:10 místního času patří do dneška', () => {
  assert.equal(new Date(Date.UTC(2026, 9, 18, 0, 0)).getMinutes(), 30, 'test opravdu běží v indickém čase');
  const d = new Date(now);
  d.setHours(0, 10, 0, 0);
  const s = createSession({ connector: 'x', localId: '1', provider: 'anthropic', app: 'x' });
  addTokens(s, d.getTime(), { input: 100, output: 0 });
  assert.equal(tokensSince([s], startOfDay(d.getTime())), 100);
  assert.equal(odhadCenyApi([s], startOfDay(d.getTime())).bezCeny, 100);
});

test('cena z Claude Code (cost.total_cost_usd) je v detailu konverzace označená jako odhad', async () => {
  const src = await fs.readFile(new URL('../public/js/views/session.js', import.meta.url), 'utf8');
  assert.match(src, /tr\('Cena podle ceníku API'\)\}\s*<span class="badge">\$\{tr\('odhad'\)\}<\/span>/);
});
