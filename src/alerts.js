import { uid, DAY } from './util.js';
import { budgetAlertCandidates } from './spend.js';

const KEY_TTL = 60 * DAY;

// Pravidla upozornění: rozhodnutí, limity, rozpočty, dokončené dlouhé úlohy. Deduplikace podle klíče.
export class AlertEngine {
  constructor({ store, datastore, notifier, projectNotify = () => 'all' }) {
    this.store = store;
    this.datastore = datastore;
    this.notifier = notifier;
    this.projectNotify = projectNotify;
    this.prevStatus = new Map();
    this.turnStart = new Map();
  }

  get settings() {
    return this.datastore.data.settings.notifications;
  }

  // Po úvodním načtení si zapamatuje stav, aby staré události nevyvolaly notifikace.
  start() {
    for (const s of this.store.list()) {
      this.prevStatus.set(s.id, s.status);
      if (s.status === 'working') this.turnStart.set(s.id, s.turnStartedAt || s.lastAt);
    }
    this.store.on('session', (s) => this.onSession(s));
    this.store.on('session:remove', (id) => { this.prevStatus.delete(id); this.turnStart.delete(id); });
    this.store.on('limits', (_list, limit, prev) => this.onLimit(limit, prev));
  }

  onSession(s) {
    const before = this.prevStatus.get(s.id);
    this.prevStatus.set(s.id, s.status);
    if (before === s.status) return;
    // Pomocná vlákna (automatické kontroly Codexu) patří k rodičovské konverzaci a vlastní upozornění neposílají.
    if (s.parentId) return;
    // Upozornění projektu: all = vše, decisions = jen co potřebuje člověka (bez „dokončeno“), mute = nic.
    const mode = this.projectNotify(s);
    const n = mode === 'mute' ? {} : mode === 'decisions' ? { ...this.settings, done: false } : this.settings;

    if (s.status === 'working') this.turnStart.set(s.id, s.turnStartedAt || Date.now());

    if (s.status === 'failed' && n.needsInput) {
      this.raise({
        key: `failed:${s.id}:${s.failure?.at || s.lastAt}`,
        level: 'critical',
        kind: 'failed',
        title: `${s.app}: spuštění selhalo`,
        body: s.reason || s.title,
        sessionId: s.id,
      });
    } else if (s.status === 'needs_input' && n.needsInput) {
      this.raise({
        key: `needs_input:${s.id}:${s.pending?.at || s.lastAt}`,
        level: 'action',
        kind: 'needs_input',
        title: `${s.app} potřebuje tvé rozhodnutí`,
        body: s.reason || s.title,
        sessionId: s.id,
      });
    } else if (s.status === 'limited' && n.limits) {
      this.raise({
        key: `limit:${s.id}:${s.limit?.at || s.lastAt}`,
        level: 'critical',
        kind: 'limit',
        title: `${s.app}: vyčerpaný limit`,
        body: s.limit?.text || s.title,
        sessionId: s.id,
      });
    } else if (before === 'working' && (s.status === 'waiting' || s.status === 'idle') && !s.stale && n.done) {
      const started = this.turnStart.get(s.id) || s.lastAt;
      if (s.lastAt - started >= n.doneMinSeconds * 1000) {
        this.raise({
          key: `done:${s.id}:${s.lastAt}`,
          level: 'info',
          kind: 'done',
          title: `${s.app} dokončil úlohu`,
          body: s.title,
          sessionId: s.id,
        });
      }
    }
    if (s.status !== 'working') this.turnStart.delete(s.id);
  }

  onLimit(limit, prev) {
    if (!this.settings.limits || !limit) return;
    if (limit.reached && !prev?.reached) {
      this.raise({
        key: `limit:${limit.id}:${limit.resetsAt || limit.at}`,
        level: 'critical',
        kind: 'limit',
        title: `${limit.app}: ${limit.label} vyčerpán`,
        body: limit.resetsAt ? `Obnoví se ${new Date(limit.resetsAt).toLocaleString('cs-CZ')}.` : limit.text || 'Limit je vyčerpaný.',
      });
      return;
    }
    if (typeof limit.usedPercent !== 'number') return;
    const hit = [95, 80].find((t) => limit.usedPercent >= t && !(typeof prev?.usedPercent === 'number' && prev.usedPercent >= t));
    if (!hit) return;
    this.raise({
      key: `limit_near:${limit.id}:${limit.resetsAt || ''}:${hit}`,
      level: 'warning',
      kind: 'limit_near',
      title: `${limit.app}: ${limit.label} na ${Math.round(limit.usedPercent)} %`,
      body: limit.resetsAt ? `Obnoví se ${new Date(limit.resetsAt).toLocaleString('cs-CZ')}.` : 'Blížíš se k limitu.',
    });
  }

  // Obnovení okna limitu (5 h, týden): upozorní, jakmile čas obnovy uplyne — jen u okna, které se čerpalo.
  // Okno do 15 minut po obnově; klíč deduplikace přežije restart, takže upozornění přijde jednou.
  checkLimitResets(now = Date.now()) {
    if (!this.settings.limitReset) return [];
    const raised = [];
    for (const l of this.store.limitList()) {
      if (!l.resetsAt || l.resetsAt > now || now - l.resetsAt > 15 * 60e3) continue;
      if (!l.reached && !(typeof l.usedPercent === 'number' && l.usedPercent > 0)) continue;
      const name = l.windowMinutes === 300 ? '5hodinový limit' : l.windowMinutes === 10080 ? 'týdenní limit' : l.label.toLowerCase();
      const a = this.raise({
        key: `limit_reset:${l.id}:${l.resetsAt}`,
        level: 'info',
        kind: 'limit_reset',
        title: `${l.app}: ${name} je obnovený`,
        body: 'Můžeš zase naplno zadávat úkoly.',
      });
      if (a) raised.push(a);
    }
    return raised;
  }

  checkBudgets(summary) {
    if (!this.settings.budget) return;
    const keys = this.datastore.data.alertKeys;
    for (const c of budgetAlertCandidates(summary)) {
      const raised = this.raise(c);
      if (raised !== undefined) for (const k of c.alsoKeys) keys[k] = keys[k] || Date.now();
    }
  }

  raise({ alsoKeys, ...a }) {
    const keys = this.datastore.data.alertKeys;
    const now = Date.now();
    if (keys[a.key]) return undefined;
    keys[a.key] = now;
    for (const [k, at] of Object.entries(keys)) if (now - at > KEY_TTL) delete keys[k];
    const alert = { id: uid(), at: now, read: false, ...a };
    this.datastore.pushAlert(alert);
    this.store.emit('alert', alert);
    if (this.settings.native) {
      this.notifier
        .native({ title: alert.title, body: alert.body || '', subtitle: 'Agentree', sound: alert.level === 'action' || alert.level === 'critical' })
        .catch(() => {});
    }
    return alert;
  }

  list() {
    return [...this.datastore.data.alerts].reverse();
  }

  markRead(ids) {
    let changed = 0;
    for (const a of this.datastore.data.alerts) {
      if (!a.read && (ids === 'all' || ids.includes(a.id))) {
        a.read = true;
        changed++;
      }
    }
    if (changed) {
      this.datastore.save();
      this.store.emit('alerts:read', ids);
    }
    return changed;
  }

  unread() {
    return this.datastore.data.alerts.filter((a) => !a.read).length;
  }

  // Smaže uloženou historii upozornění včetně klíčů proti opakování. Texty upozornění jsou jediná
  // trvale ukládaná data odvozená z obsahu konverzací — uživatel se jich takhle zbaví jedním klikem.
  clear() {
    const count = this.datastore.data.alerts.length;
    this.datastore.data.alerts = [];
    this.datastore.data.alertKeys = {};
    this.datastore.save();
    this.store.emit('alerts:read', 'all');
    return count;
  }
}
