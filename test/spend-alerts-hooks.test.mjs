import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateEntry, validateBudgets, monthlyTotals, spendSummary, budgetAlertCandidates, convert, addMonths, DEFAULT_SPEND } from '../src/spend.js';
import { installHooks, uninstallHooks, hooksStatus, HOOK_EVENTS } from '../src/hooks-installer.js';
import { AlertEngine } from '../src/alerts.js';
import { Store } from '../src/store.js';
import { loadConfig } from '../src/config.js';
import { plistXml } from '../src/launch-agent.js';
import { tempDir, fakeDatastore } from './helpers.mjs';

const spend = (over = {}) => ({ ...structuredClone(DEFAULT_SPEND), ...over });

test('validace výdaje', () => {
  const bad = validateEntry({ service: 'x', kind: 'extra', amount: '-1', currency: 'CZK', date: '2026-13-01' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.service && bad.errors.amount);
  const ok = validateEntry({ service: 'claude', kind: 'extra', amount: '499,90', currency: 'CZK', date: '2026-09-02', note: ' Extra usage ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.amount, 499.9);
  assert.equal(ok.value.note, 'Extra usage');
});

test('měsíční součty: opakované předplatné, ukončení a převod měn', () => {
  const sp = spend({
    ledger: [
      { id: '1', service: 'chatgpt', kind: 'subscription', amount: 20, currency: 'USD', date: '2026-07-05', recurring: 'monthly', endDate: '2026-08-31' },
      { id: '2', service: 'claude', kind: 'extra', amount: 500, currency: 'CZK', date: '2026-08-12', recurring: null },
    ],
  });
  const rows = monthlyTotals(sp, ['2026-06', '2026-07', '2026-08', '2026-09']);
  assert.deepEqual(rows.map((r) => r.total), [0, 460, 960, 0]);
  assert.equal(rows[2].services.claude, 500);
  assert.equal(convert(10, 'EUR', sp), 250);
  assert.equal(addMonths('2026-11', 3), '2027-02');
  assert.equal(addMonths('2026-01', -1), '2025-12');
});

test('rozpočty, prognóza a upozornění jen na nejvyšší práh', () => {
  const now = new Date(2026, 8, 15, 12).getTime();
  const sp = spend({
    budgets: { total: 1000, services: { claude: 400 } },
    ledger: [
      { id: 'a', service: 'claude', kind: 'extra', amount: 450, currency: 'CZK', date: '2026-09-10' },
      { id: 'b', service: 'chatgpt', kind: 'subscription', amount: 400, currency: 'CZK', date: '2026-09-01', recurring: 'monthly' },
    ],
  });
  const sum = spendSummary(sp, now);
  assert.equal(sum.month.total, 850);
  assert.equal(sum.recurring, 400);
  assert.equal(sum.forecast, 400 + (450 / 15) * 30);
  const alerts = budgetAlertCandidates(sum);
  assert.equal(alerts.length, 2);
  const claude = alerts.find((a) => a.key.includes(':claude:'));
  assert.equal(claude.level, 'critical');
  assert.deepEqual(claude.alsoKeys, ['budget:2026-09:claude:80']);
  const total = alerts.find((a) => a.key.includes(':total:'));
  assert.equal(total.key, 'budget:2026-09:total:80');
});

test('validace rozpočtů a kurzů', () => {
  const cur = { currency: 'CZK', rates: { CZK: 1, USD: 23, EUR: 25 }, budgets: { total: 0, services: { grok: 100 } } };
  const r = validateBudgets({ total: '3 000', services: { claude: '800', grok: '' }, rates: { USD: '22,5' } }, cur);
  assert.equal(r.ok, true);
  assert.equal(r.value.budgets.total, 3000);
  assert.deepEqual(r.value.budgets.services, { claude: 800 });
  assert.equal(r.value.rates.USD, 22.5);
  assert.equal(cur.budgets.services.grok, 100, 'původní objekt se nemění');
  assert.equal(validateBudgets({ total: '-5' }, cur).ok, false);
});

test('instalace Claude hooků zachová nastavení uživatele a je idempotentní', async () => {
  const dir = await tempDir();
  const file = path.join(dir, '.claude', 'settings.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const original = { theme: 'dark', permissions: { allow: ['Bash(npm test)'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say hotovo' }] }] } };
  await fs.writeFile(file, JSON.stringify(original, null, 2));
  const token = 'a'.repeat(48);

  const first = await installHooks(file, { port: 4620, token, now: 1 });
  await installHooks(file, { port: 4620, token, now: 2 });
  const json = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(json.theme, 'dark');
  assert.deepEqual(json.permissions, original.permissions);
  for (const ev of HOOK_EVENTS) {
    const ours = json.hooks[ev].flatMap((g) => g.hooks).filter((h) => h.command.includes('/api/hooks/claude-code'));
    assert.equal(ours.length, 1, `${ev}: právě jeden hook`);
  }
  assert.ok(json.hooks.Stop.some((g) => g.hooks.some((h) => h.command === 'say hotovo')), 'uživatelův hook zůstal');
  assert.ok(first.backup && (await fs.readFile(first.backup, 'utf8')).includes('say hotovo'));
  const st = await hooksStatus(file, token);
  assert.equal(st.installed, true);
  assert.equal(st.current, true);
  assert.equal((await hooksStatus(file, 'b'.repeat(48))).current, false);

  await uninstallHooks(file, { now: 3 });
  const after = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(after, original);
});

test('neplatný settings.json se nepřepíše', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'settings.json');
  await fs.writeFile(file, '{ neplatný');
  await assert.rejects(installHooks(file, { port: 4620, token: 'c'.repeat(48) }), (err) => err.code === 'INVALID_SETTINGS');
  assert.equal(await fs.readFile(file, 'utf8'), '{ neplatný');
});

test('upozornění: rozhodnutí, dokončení, limity a deduplikace', async () => {
  const home = await tempDir();
  const config = loadConfig({ DIRIGENT_SOURCE_HOME: home, DIRIGENT_HOME: home });
  const datastore = fakeDatastore({ doneMinSeconds: 60 });
  const store = new Store({ config, datastore });
  const sent = [];
  const alerts = new AlertEngine({ store, datastore, notifier: { native: async (n) => { sent.push(n); return true; } } });
  store.ready = true;
  alerts.start();

  const now = Date.now();
  const s = store.ensure({ connector: 'claude-code', localId: 'x1', provider: 'anthropic', app: 'Claude Code' });
  Object.assign(s, { lastAt: now - 120000, startedAt: now - 130000, running: true, runningAt: now, turnStartedAt: now - 120000, title: 'Refaktor' });
  store.commit(s, now);
  s.pending = { kind: 'permission', text: 'Povolit Bash: rm -rf dist?', at: now };
  store.commit(s, now);
  store.commit(s, now + 1000);
  assert.equal(datastore.data.alerts.length, 1);
  assert.equal(datastore.data.alerts[0].kind, 'needs_input');
  assert.equal(datastore.data.alerts[0].body, 'Povolit Bash: rm -rf dist?');
  assert.equal(sent.length, 0, 'nativní notifikace jsou v nastavení vypnuté');

  s.pending = null;
  store.commit(s, now + 2000);
  s.running = false;
  s.lastAt = now + 3000;
  store.commit(s, now + 3000);
  assert.equal(datastore.data.alerts.at(-1).kind, 'done');

  store.setLimit({ id: 'codex:codex:primary', provider: 'openai', app: 'Codex', label: 'Týdenní limit', usedPercent: 70, resetsAt: 5, reached: false, at: 1 });
  store.setLimit({ id: 'codex:codex:primary', provider: 'openai', app: 'Codex', label: 'Týdenní limit', usedPercent: 83, resetsAt: 5, reached: false, at: 2 });
  store.setLimit({ id: 'codex:codex:primary', provider: 'openai', app: 'Codex', label: 'Týdenní limit', usedPercent: 85, resetsAt: 5, reached: false, at: 3 });
  store.setLimit({ id: 'codex:codex:primary', provider: 'openai', app: 'Codex', label: 'Týdenní limit', usedPercent: 100, resetsAt: 5, reached: true, at: 4 });
  const kinds = datastore.data.alerts.map((a) => a.kind);
  assert.deepEqual(kinds.slice(-2), ['limit_near', 'limit']);
  assert.equal(kinds.filter((k) => k === 'limit_near').length, 1);

  assert.equal(alerts.unread(), 4);
  alerts.markRead('all');
  assert.equal(alerts.unread(), 0);
});

test('LaunchAgent plist escapuje cesty', () => {
  const x = plistXml({ node: '/opt/node & co/bin/node', script: '/Users/a/<dirigent>/bin/dirigent.mjs', logDir: '/tmp/l', pathEnv: '/usr/bin' });
  assert.ok(x.includes('/opt/node &amp; co/bin/node'));
  assert.ok(x.includes('&lt;dirigent&gt;'));
  assert.ok(x.includes('<key>KeepAlive</key><true/>'));
});
