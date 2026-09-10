import { EventEmitter } from 'node:events';
import { createSession, summarize, takeDirty, pruneMinutes } from './model.js';
import { DAY } from './util.js';

const CREDIT_POINTS_MAX = 400;

// Centrální stav: sessions, limity, kredity, běhová prostředí. Změny vysílá jako události pro SSE a upozornění.
export class Store extends EventEmitter {
  constructor({ config, datastore }) {
    super();
    this.setMaxListeners(200);
    this.config = config;
    this.datastore = datastore;
    this.windowMs = config.windowDays * DAY;
    this.sessions = new Map();
    this.summaries = new Map();
    this.limits = new Map();
    this.runtimes = [];
    this.runtimesJson = '';
    this.ready = false;
  }

  get(id) {
    return this.sessions.get(id);
  }

  ensure({ connector, localId, provider, app, source = 'local' }) {
    const id = `${connector}:${localId}`;
    let s = this.sessions.get(id);
    if (!s) {
      s = createSession({ connector, localId, provider, app, source });
      this.sessions.set(id, s);
    }
    return s;
  }

  commit(s, now = Date.now()) {
    const { entries, reset } = takeDirty(s);
    if (!this.sessions.has(s.id) || !s.lastAt) return;
    const prev = this.summaries.get(s.id);
    const value = summarize(s, now, this.windowMs);
    const json = JSON.stringify(value);
    if (!prev || prev.json !== json) {
      this.summaries.set(s.id, { json, value });
      if (this.ready) this.emit('session', value, prev?.value || null);
    }
    if (this.ready && (entries.length || reset)) {
      this.emit('transcript', { id: s.id, reset, entries: entries.map((e) => ({ ...e })) });
    }
  }

  remove(id) {
    const existed = this.sessions.delete(id);
    this.summaries.delete(id);
    if (existed && this.ready) this.emit('session:remove', id);
  }

  reevaluate(now = Date.now()) {
    for (const s of this.sessions.values()) {
      pruneMinutes(s, now);
      this.commit(s, now);
    }
  }

  list(now = Date.now()) {
    const out = [];
    for (const { value } of this.summaries.values()) {
      if (now - value.lastAt <= this.windowMs || value.status === 'working' || value.status === 'needs_input') out.push(value);
    }
    return out.sort((a, b) => b.lastAt - a.lastAt);
  }

  summary(id) {
    return this.summaries.get(id)?.value || null;
  }

  transcript(id, { after = 0, limit = 400 } = {}) {
    const s = this.sessions.get(id);
    if (!s) return null;
    return s.transcript.filter((e) => e.seq > after).slice(-limit);
  }

  setLimit(limit) {
    const prev = this.limits.get(limit.id);
    if (prev && prev.at > limit.at) return;
    if (prev && JSON.stringify(prev) === JSON.stringify(limit)) return;
    this.limits.set(limit.id, limit);
    if (this.ready) this.emit('limits', this.limitList(), limit, prev || null);
  }

  limitList() {
    return [...this.limits.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  setCredits({ id, provider, app, label, balance, unlimited = false, at }) {
    if (!Number.isFinite(balance) || !at) return;
    const all = this.datastore.data.credits;
    const rec = all[id] || (all[id] = { id, provider, app, label, history: [] });
    Object.assign(rec, { provider, app, label, unlimited });
    const h = rec.history;
    if (h.some((p) => p.at === at)) return;
    let i = h.length;
    while (i > 0 && h[i - 1].at > at) i--;
    h.splice(i, 0, { at, balance });
    // Zachovat jen body, kde se zůstatek mění (a vždy poslední bod).
    const compact = h.filter((p, idx) => idx === 0 || idx === h.length - 1 || p.balance !== h[idx - 1].balance);
    rec.history = compact.slice(-CREDIT_POINTS_MAX);
    const last = rec.history[rec.history.length - 1];
    rec.balance = last.balance;
    rec.at = last.at;
    this.datastore.save();
    if (this.ready) this.emit('credits', this.creditList());
  }

  creditList() {
    return Object.values(this.datastore.data.credits);
  }

  setRuntimes(list) {
    const json = JSON.stringify(list);
    if (json === this.runtimesJson) return;
    this.runtimesJson = json;
    this.runtimes = list;
    if (this.ready) this.emit('runtimes', list);
  }
}
