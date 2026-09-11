import path from 'node:path';
import { readJson, writeJsonAtomic, randomToken, debounce } from './util.js';
import { DEFAULT_SPEND } from './spend.js';
import { normalizeProjects } from './projects.js';

export const DEFAULT_SETTINGS = {
  onboardingDismissed: false,
  notifications: {
    needsInput: true,
    limits: true,
    limitReset: true,
    budget: true,
    done: true,
    doneMinSeconds: 120,
    native: true,
    browser: false,
  },
  disabledConnectors: [],
};

const ALERTS_MAX = 300;

export function normalizeData(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
  const sp = d.spend && typeof d.spend === 'object' ? d.spend : {};
  return {
    version: 1,
    ingestToken: typeof d.ingestToken === 'string' && d.ingestToken.length >= 32 ? d.ingestToken : randomToken(),
    settings: {
      ...DEFAULT_SETTINGS,
      ...s,
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(s.notifications || {}) },
      disabledConnectors: Array.isArray(s.disabledConnectors) ? s.disabledConnectors.filter((x) => typeof x === 'string') : [],
      onboardingDismissed: s.onboardingDismissed === true,
      avatar: Number.isInteger(s.avatar) && s.avatar >= 0 && s.avatar < 64 ? s.avatar : null,
    },
    projects: normalizeProjects(d.projects),
    license: d.license && typeof d.license.key === 'string' && d.license.key.length < 4000 ? { key: d.license.key, activatedAt: Number(d.license.activatedAt) || Date.now() } : null,
    usage: { launches: Number(d.usage?.launches) || 0 },
    spend: {
      currency: typeof sp.currency === 'string' ? sp.currency : DEFAULT_SPEND.currency,
      rates: { ...DEFAULT_SPEND.rates, ...(sp.rates || {}), CZK: 1 },
      budgets: {
        total: Number(sp.budgets?.total) || 0,
        services: sp.budgets?.services && typeof sp.budgets.services === 'object' ? { ...sp.budgets.services } : {},
      },
      ledger: Array.isArray(sp.ledger) ? sp.ledger.filter((e) => e && typeof e.id === 'string') : [],
    },
    alerts: Array.isArray(d.alerts) ? d.alerts.slice(-ALERTS_MAX) : [],
    alertKeys: d.alertKeys && typeof d.alertKeys === 'object' ? d.alertKeys : {},
    credits: d.credits && typeof d.credits === 'object' ? d.credits : {},
  };
}

// Trvalá data aplikace (~/.agentree/data.json): nastavení, rozpočty, výdaje, upozornění.
export class DataStore {
  constructor(dir) {
    this.file = path.join(dir, 'data.json');
    this.data = null;
    this.writing = Promise.resolve();
    this.scheduleSave = debounce(() => { this.flush(); }, 300);
  }

  async load() {
    const raw = await readJson(this.file, null);
    this.data = normalizeData(raw);
    await this.flush();
    return this.data;
  }

  save() {
    this.scheduleSave();
  }

  flush() {
    this.scheduleSave.cancel();
    const snapshot = JSON.parse(JSON.stringify(this.data));
    this.writing = this.writing.then(() => writeJsonAtomic(this.file, snapshot)).catch((err) => {
      console.error('Agentree: nepodařilo se uložit data', err.message);
    });
    return this.writing;
  }

  pushAlert(alert) {
    this.data.alerts.push(alert);
    if (this.data.alerts.length > ALERTS_MAX) this.data.alerts.splice(0, this.data.alerts.length - ALERTS_MAX);
    this.save();
  }
}
