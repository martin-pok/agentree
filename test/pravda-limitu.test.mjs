import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { AlertEngine } from '../src/alerts.js';
import { applyDesktopUsage } from '../src/connectors/claude-desktop-code.js';
import { quotaLimit, createClaudeCodeConnector } from '../src/connectors/claude-code.js';
import { createCodexConnector } from '../src/connectors/codex.js';
import { currentLimits, limitState } from '../public/js/ui.js';
import { fakeDatastore, tempDir } from './helpers.mjs';

// Limity musí odpovídat skutečnosti: každý případ tu dřív ukazoval jiné číslo, než platilo.
const H = 3600e3;

async function prostredi(settings = {}) {
  const home = await tempDir();
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: path.join(home, 'app') });
  const ds = fakeDatastore(settings);
  const store = new Store({ config, datastore: ds });
  store.ready = true;
  return { home, config, ds, store };
}

test('Codex: vyčerpaný týden neoznačí okno 5 h jako vyčerpané', async () => {
  const { home, config, store } = await prostredi();
  const id = '01a0546a-6679-76d3-9454-ba9f37a24015';
  const now = Date.now();
  const ts = (s) => new Date(now - 30000 + s * 1000).toISOString();
  const f = path.join(home, '.codex', 'sessions', '2026', '10', '18', `rollout-2026-10-18T10-00-00-${id}.jsonl`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const rl = { limit_id: 'codex', primary: { used_percent: 20, window_minutes: 300, resets_at: Math.floor(now / 1000) + 3600 }, secondary: { used_percent: 100, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 3 * 86400 }, rate_limit_reached_type: 'secondary' };
  fs.writeFileSync(f, [{ timestamp: ts(0), type: 'session_meta', payload: { id, originator: 'codex_cli_rs' } }, { timestamp: ts(2), type: 'event_msg', payload: { type: 'token_count', rate_limits: rl } }].map((r) => JSON.stringify(r)).join('\n') + '\n');
  const c = createCodexConnector({ config, store });
  await c.start(); c.stop();
  const okna = Object.fromEntries(currentLimits(store.limitList(), now).map((l) => [l.windowMinutes, limitState(l, now).label]));
  assert.equal(okna[300], '20 %');
  assert.equal(okna[10080], 'Vyčerpáno');
});

test('Claude: dvě licence jsou dvě okna a cizí čas obnovy se nepůjčuje', () => {
  const now = Date.parse('2026-10-18T10:00:00Z');
  const a = { id: 'claude:five_hour:acctA', accountId: 'acctA', provider: 'anthropic', app: 'Claude', label: 'Limit 5 h', usedPercent: 97, windowMinutes: 300, resetsAt: now + H, at: now - 60e3, source: 'statusline' };
  const b = { ...a, id: 'claude:five_hour:acctB', accountId: 'acctB', usedPercent: 10, resetsAt: now + 3 * H, at: now - 30e3 };
  assert.deepEqual(currentLimits([a, b], now).map((l) => l.usedPercent).sort((x, y) => x - y), [10, 97]);
  const desktop = { id: 'claude:five_hour:desktop', provider: 'anthropic', app: 'Claude', label: 'Limit 5 h', usedPercent: 5, windowMinutes: 300, resetsAt: null, at: now - 10e3, source: 'desktop-usage' };
  const vysledek = currentLimits([a, b, desktop], now).find((l) => l.id === desktop.id);
  assert.equal(vysledek?.resetsAt ?? null, null, 'záznam bez účtu si nesmí půjčit čas obnovy jiné licence');
});

test('Claude: historie změřená před známou obnovou okna se neukazuje', () => {
  const now = Date.parse('2026-10-18T10:00:00Z');
  const presny = { id: 'claude:five_hour', provider: 'anthropic', app: 'Claude', label: 'Limit 5 h', usedPercent: 95, windowMinutes: 300, resetsAt: now - 5 * 60e3, at: now - 40 * 60e3, source: 'statusline' };
  const historie = { id: 'claude:five_hour:history', provider: 'anthropic', app: 'Claude', label: 'Limit 5 h', usedPercent: 96, windowMinutes: 300, resetsAt: null, at: now - 15 * 60e3, source: 'plan-history' };
  assert.deepEqual(currentLimits([presny, historie], now), []);
});

test('stavový řádek po obnově okna nepřepíše čerstvé měření ani nevyhlásí vyčerpání', async () => {
  const { config, ds, store } = await prostredi();
  const reset = Date.parse('2026-10-18T12:00:00Z');
  const clock = reset + 60e3;
  const eng = new AlertEngine({ store, datastore: ds, notifier: { native: async () => {} }, now: () => clock });
  eng.start();
  const c = createClaudeCodeConnector({ store, config });
  c.ingestStatusline({ session_id: 'sessBBBB2222', rate_limits: { five_hour: { used_percentage: 3, resets_at: (reset + 5 * H) / 1000 } } }, clock);
  c.ingestStatusline({ session_id: 'sessCCCC3333', rate_limits: { five_hour: { used_percentage: 100, resets_at: reset / 1000 } } }, clock + 5000);
  c.stop();
  assert.equal(store.limits.get('claude:five_hour').usedPercent, 3);
  assert.deepEqual(ds.data.alerts.filter((a) => a.kind === 'limit'), []);
});

test('jedno okno hlášené třemi zdroji = jedno upozornění na vyčerpání i na obnovu', async () => {
  const { config, ds, store } = await prostredi({ limitReset: true });
  const T = Date.parse('2026-10-18T10:00:00Z');
  const reset = Date.parse('2026-10-18T12:00:00Z');
  let clock = T;
  const eng = new AlertEngine({ store, datastore: ds, notifier: { native: async () => {} }, now: () => clock });
  eng.start();
  {
    const c = createClaudeCodeConnector({ store, config });
    c.ingestStatusline({ session_id: 'sessAAAA1111', rate_limits: { five_hour: { used_percentage: 100, resets_at: reset / 1000 } } }, T);
    store.setLimit(quotaLimit({ isApiErrorMessage: true, quotaLimits: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: reset / 1000 }, message: { content: 'limit' } }, T + 1000));
    applyDesktopUsage(store, { at: T + 2000, five_hour: { usedPercent: 100, resetsAt: reset }, seven_day: null });
    c.stop();
    assert.equal(ds.data.alerts.filter((a) => a.kind === 'limit').length, 1);
    clock = reset + 60e3;
    eng.checkLimitResets(clock);
    assert.equal(ds.data.alerts.filter((a) => a.kind === 'limit_reset').length, 1);
  }
});

test('Codex: dva domovy s různými účty si okna nepřepisují, snímek bez účtu se nezapíše', async () => {
  const home = await tempDir();
  const druhy = path.join(home, 'druhy-codex');
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: path.join(home, 'app'), AGENTEEQ_CODEX_HOME: druhy });
  const store = new Store({ config, datastore: fakeDatastore() });
  store.ready = true;
  const now = Date.now();
  const ts = (s) => new Date(now - 30000 + s * 1000).toISOString();
  const prepis = (domov, id, pct) => {
    const f = path.join(domov, 'sessions', '2026', '10', '19', `rollout-2026-10-19T10-00-00-${id}.jsonl`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const rl = { limit_id: 'codex', primary: { used_percent: pct, window_minutes: 300, resets_at: Math.floor(now / 1000) + 3600 } };
    fs.writeFileSync(f, [{ timestamp: ts(0), type: 'session_meta', payload: { id, originator: 'codex_cli_rs' } }, { timestamp: ts(2), type: 'event_msg', payload: { type: 'token_count', rate_limits: rl } }].map((r) => JSON.stringify(r)).join('\n') + '\n');
  };
  prepis(path.join(home, '.codex'), '01a0546a-6679-76d3-9454-ba9f37a24016', 20);
  prepis(druhy, '01a0546a-6679-76d3-9454-ba9f37a24017', 80);

  const c = createCodexConnector({ config, store });
  c.bindAccounts([{ home: path.join(home, '.codex'), accountId: 'codex:aaaa' }, { home: druhy, accountId: 'codex:bbbb' }]);
  await c.start(); c.stop();
  const okna = store.limitList().filter((l) => l.windowMinutes === 300);
  assert.deepEqual(okna.map((l) => [l.accountId, l.usedPercent]).sort(), [['codex:aaaa', 20], ['codex:bbbb', 80]]);

  // Druhý domov bez ověřeného účtu: jeho 80 % nesmí nikde vystupovat jako limit.
  const store2 = new Store({ config, datastore: fakeDatastore() });
  store2.ready = true;
  const c2 = createCodexConnector({ config, store: store2 });
  c2.bindAccounts([{ home: path.join(home, '.codex'), accountId: 'codex:aaaa' }, { home: path.join(home, 'jiny'), accountId: 'codex:cccc' }]);
  await c2.start(); c2.stop();
  assert.deepEqual(store2.limitList().filter((l) => l.windowMinutes === 300).map((l) => [l.accountId, l.usedPercent]), [['codex:aaaa', 20]]);
});
