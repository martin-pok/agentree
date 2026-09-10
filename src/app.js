import os from 'node:os';
import { loadConfig, VERSION, EXTENSION_DIR } from './config.js';
import { DataStore } from './datastore.js';
import { Store } from './store.js';
import { AlertEngine } from './alerts.js';
import { createNotifier } from './notify.js';
import { createSecrets } from './secrets.js';
import { spendSummary, SERVICES, KINDS, CURRENCIES } from './spend.js';
import { claudeSettingsPath, hooksStatus } from './hooks-installer.js';
import { run, HOUR } from './util.js';
import { createClaudeCodeConnector } from './connectors/claude-code.js';
import { createCodexConnector } from './connectors/codex.js';
import { createCursorConnector } from './connectors/cursor.js';
import { createGeminiFamilyConnector } from './connectors/gemini-family.js';
import { createCopilotCliConnector, createVsCodeCopilotConnector } from './connectors/copilot.js';
import { createWebConnector, WEB_SITES } from './connectors/web.js';
import { createCloudBillingConnector } from './connectors/cloud-billing.js';
import { createProcessesConnector } from './connectors/processes.js';
import { detectApps, openTargets, planOpen, executeOpen, ALL_APPS } from './openers.js';

export async function createApp(config = loadConfig()) {
  const datastore = new DataStore(config.dataDir);
  await datastore.load();
  const store = new Store({ config, datastore });
  const secrets = createSecrets({ keychain: config.keychain });
  const notifier = createNotifier({ enabled: config.nativeNotify });
  const alerts = new AlertEngine({ store, datastore, notifier });
  const host = { name: os.hostname().replace(/\.local$/, ''), user: os.userInfo().username, fullName: '' };
  const log = (...args) => { if (!config.quiet) console.log(...args); };

  let apps = {};
  store.decorate = (summary) => { summary.open = openTargets(summary, apps); };

  async function openSession(id, target) {
    const s = store.summary(id);
    if (!s) return { status: 404, error: 'Session nenalezena.' };
    if (config.openMode === 'off') return { status: 422, error: 'Otevírání aplikací je dostupné jen na macOS.' };
    const plan = planOpen(s, target, apps);
    if (!plan) return { status: 422, error: 'Tuto akci pro session nelze provést.' };
    const r = await executeOpen(plan, { dry: config.openMode === 'dry' });
    if (!r.ok) return { status: 502, error: r.error };
    return { ok: true, label: plan.label, ...(r.dry ? { dry: true, plan } : {}) };
  }

  const ctx = { config, store, datastore, secrets, onSpendChanged: () => spendChanged() };
  const list = [
    createClaudeCodeConnector(ctx),
    createCodexConnector(ctx),
    createCursorConnector(ctx),
    createCopilotCliConnector(ctx),
    createVsCodeCopilotConnector(ctx),
    createGeminiFamilyConnector(ctx, { id: 'gemini-cli', name: 'Gemini CLI', dir: '.gemini', provider: 'google', app: 'Gemini CLI' }),
    createGeminiFamilyConnector(ctx, { id: 'qwen-code', name: 'Qwen Code', dir: '.qwen', provider: 'alibaba', app: 'Qwen Code' }),
    createWebConnector(ctx),
    createCloudBillingConnector(ctx),
  ];
  if (config.processes) list.push(createProcessesConnector(ctx));
  const connectors = Object.fromEntries(list.map((c) => [c.id, c]));

  // Počet u konektorů se sessions = sessions viditelné v okně sledování (ne počet souborů na disku).
  const SESSION_CONNECTORS = new Set(['claude-code', 'codex', 'cursor', 'copilot-cli', 'vscode-copilot', 'gemini-cli', 'qwen-code', 'web']);

  function connectorList() {
    const visible = store.list();
    return list.map((c) => {
      let status;
      try { status = c.status(); } catch (err) { status = { state: 'error', detail: err.message }; }
      if (SESSION_CONNECTORS.has(c.id)) {
        const count = visible.filter((s) => s.connector === c.id).length;
        status = { ...status, count };
        if (status.state === 'connected' && c.id !== 'web') {
          const word = count === 1 ? 'session' : 'sessions';
          status.detail = `${count} ${word} s aktivitou za ${config.windowDays} dní.${status.hooksActive ? ' Okamžité události jsou aktivní.' : ''}`;
        }
      }
      return { id: c.id, name: c.name, provider: c.provider, kind: c.kind, verified: c.verified, source: c.source, description: c.description, ...status };
    });
  }

  function spend() {
    return spendSummary(datastore.data.spend, Date.now(), connectors['cloud-billing'].autoEntries());
  }

  function spendPayload() {
    const sp = datastore.data.spend;
    return { ...spend(), ledger: sp.ledger, budgetsConfig: sp.budgets, rates: sp.rates, services: SERVICES, kinds: KINDS, currencies: CURRENCIES };
  }

  function spendChanged() {
    if (!store.ready) return;
    alerts.checkBudgets(spend());
    store.emit('spend', spendPayload());
  }

  async function integrations() {
    return {
      claudeHooks: await hooksStatus(claudeSettingsPath(config.sourceHome), datastore.data.ingestToken),
      extension: { path: EXTENSION_DIR, sites: WEB_SITES, token: datastore.data.ingestToken },
      cloud: connectors['cloud-billing'].providers(),
      keychain: secrets.available,
      nativeNotify: notifier.enabled,
    };
  }

  async function state() {
    return {
      version: VERSION,
      now: Date.now(),
      ready: store.ready,
      windowDays: config.windowDays,
      host,
      sessions: store.list(),
      runtimes: store.runtimes,
      limits: store.limitList(),
      credits: store.creditList(),
      connectors: connectorList(),
      spend: spendPayload(),
      alerts: { unread: alerts.unread(), items: alerts.list().slice(0, 100) },
      settings: datastore.data.settings,
      integrations: await integrations(),
    };
  }

  const timers = [];
  let connectorsJson = '';

  async function start() {
    const t0 = Date.now();
    const whoami = run('id', ['-F']).then((r) => { if (r.ok) host.fullName = r.stdout.trim(); });
    apps = config.openMode === 'dry' ? ALL_APPS : config.openMode === 'exec' ? await detectApps() : {};
    const results = await Promise.allSettled(list.map((c) => c.start()));
    results.forEach((r, i) => { if (r.status === 'rejected') console.error(`Dirigent: konektor ${list[i].id} selhal:`, r.reason?.message || r.reason); });
    await whoami;
    store.reevaluate();
    store.ready = true;
    alerts.start();
    alerts.checkBudgets(spend());
    connectorsJson = JSON.stringify(connectorList());

    const every = (fn, ms) => { const t = setInterval(() => { Promise.resolve().then(fn).catch(() => {}); }, ms); t.unref?.(); timers.push(t); };
    every(() => store.reevaluate(), 5000);
    every(async () => {
      for (const c of list) if (c.kind === 'local' && c.id !== 'processes' && c.id !== 'cursor') await c.scan();
    }, config.scanIntervalMs);
    every(() => {
      const next = JSON.stringify(connectorList());
      if (next !== connectorsJson) { connectorsJson = next; store.emit('connectors', JSON.parse(next)); }
    }, 5000);
    every(() => spendChanged(), HOUR);
    log(`Dirigent: načteno ${store.list().length} sessions za ${Date.now() - t0} ms.`);
  }

  async function stop() {
    for (const t of timers) clearInterval(t);
    for (const c of list) {
      try { c.stop(); } catch { /* ignorovat při ukončení */ }
    }
    await datastore.flush();
  }

  return { config, host, datastore, store, alerts, secrets, notifier, connectors, connectorList, spendPayload, spendChanged, integrations, state, start, stop, openSession };
}
