import { uid, DAY, HOUR } from './util.js';
import { budgetAlertCandidates } from './spend.js';
import { jeNocniTicho } from './nocni-ticho.js';
import { prekladac } from './texty.js';

const KEY_TTL = 60 * DAY;

// Náraz: v klouzavé minutě přijdou nejvýš tři oznámení (souhrn se počítá taky). Co se nevejde,
// počká a spojí se do jednoho souhrnu, který odejde, jakmile je v minutě zase místo – nejpozději
// minutu po prvním odloženém upozornění.
export const NARAZ = { max: 3, oknoMs: 60e3 };
// Souhrn bere jen upozornění z posledních 24 hodin. Starší (aplikace byla dny vypnutá) do
// ranního přehledu nepatří – zůstávají v seznamu upozornění.
const SOUHRN_STARI = 24 * HOUR;
// Probuzení: průchody jdou po 5 s, takže mezera přes minutu znamená uspaný Mac. Zdroje pak dostanou
// 15 s (víc než plný průchod po 10 s), aby dohnaly, co se mezitím stalo – jinak by souhrn mohl
// hlásit rozhodnutí, které už padlo.
export const PROBUZENI = { mezeraMs: 60e3, cekaniMs: 15e3 };

// Skupiny v souhrnu, seřazené od nejnaléhavější. Tvar „2× …“ se neskloňuje, takže věta sedí
// pro jakýkoli počet.
const SKUPINY = [
  { druhy: ['needs_input'], cs: 'čeká na rozhodnutí', en: 'waiting for your decision' },
  { druhy: ['failed'], cs: 'selhalo spuštění', en: 'failed to start' },
  { druhy: ['limit', 'limit_near'], cs: 'limit', en: 'limit' },
  { druhy: ['budget'], cs: 'rozpočet', en: 'budget' },
  { druhy: ['done'], cs: 'dokončeno', en: 'finished' },
  { druhy: ['limit_reset'], cs: 'obnovený limit', en: 'limit reset' },
];

// Text souhrnu. Upozornění vznikají na serveru a nativní oznámení je nese beze změny, proto se
// jazyk vybírá už tady – podle volby v Nastavení. Názvy v těle (limit, rozpočet, konverzace) přišly
// česky, v angličtině je přeloží stejný slovník jako rozhraní; u limitu jen jeho název, aplikace ne.
export function textSouhrnu(duvod, polozky, jazyk = 'cs') {
  const en = jazyk === 'en';
  const t = prekladac(jazyk);
  const nazev = (p) => (p.limit ? `${p.limit.app}: ${t(p.limit.label)}` : t(p.nazev));
  const skupina = (p) => SKUPINY.findIndex((g) => g.druhy.includes(p.kind));
  const casti = SKUPINY
    .map((g) => [g, polozky.filter((p) => g.druhy.includes(p.kind)).length])
    .filter(([, n]) => n)
    .map(([g, n]) => `${n}× ${en ? g.en : g.cs}`);
  const uvod = duvod === 'quiet' ? (en ? 'During quiet hours' : 'Během nočního ticha') : (en ? 'More alerts' : 'Další upozornění');
  // Výčet jmen ve stejném pořadí jako titulek: nejdřív to, co čeká na rozhodnutí.
  const jmena = [...new Set([...polozky].sort((a, b) => skupina(a) - skupina(b)).map(nazev).filter(Boolean))];
  const zbyva = jmena.length - 3;
  const dalsi = zbyva > 0 ? (en ? ` and ${zbyva} more` : ` a ${zbyva} ${zbyva >= 5 ? 'dalších' : 'další'}`) : '';
  return { title: `${uvod}: ${casti.join(', ')}`, body: jmena.slice(0, 3).join(', ') + dalsi };
}

const mesic = (ts) => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); };

// Pravidla upozornění: rozhodnutí, limity, rozpočty, dokončené dlouhé úlohy. Deduplikace podle klíče.
// Každé upozornění se uloží do seznamu a zvedne počet u zvonečku. Oznámení v systému (a bublina
// v aplikaci) ale nepřijde, když je noční ticho (`muted: 'quiet'`) nebo když jich v minutě přišlo
// moc (`muted: 'burst'`). Ztlumená pak shrne jedno souhrnné upozornění (`kind: 'digest'`).
export class AlertEngine {
  constructor({ store, datastore, notifier, projectNotify = () => 'all', now = Date.now }) {
    this.store = store;
    this.datastore = datastore;
    this.notifier = notifier;
    this.projectNotify = projectNotify;
    this.now = now;
    // Odeslání na telefon (src/push.js); app.js ho dosadí, až existuje přístup z telefonu.
    this.doTelefonu = null;
    this.prevStatus = new Map();
    this.turnStart = new Map();
    // Kdy odešla oznámení v poslední minutě. Jen v paměti – po restartu se počítá od nuly.
    this.ukazane = [];
    // Poslední průchod tick() a do kdy po probuzení Macu se souhrn odkládá.
    this.posledniTick = 0;
    this.cekatDo = 0;
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
        limitId: limit.id,
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
      limitId: limit.id,
      body: limit.resetsAt ? `Obnoví se ${new Date(limit.resetsAt).toLocaleString('cs-CZ')}.` : 'Blížíš se k limitu.',
    });
  }

  // Obnovení okna limitu (5 h, týden): upozorní, jakmile čas obnovy uplyne – jen u okna, které se čerpalo.
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
        limitId: l.id,
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
      if (raised !== undefined) for (const k of c.alsoKeys) keys[k] = keys[k] || this.now();
    }
  }

  // `bezNativniho`: upozornění jde do aplikace, systémové oznámení si volající pošle sám
  // (detekce agentů posílá jedno souhrnné za celou dávku, ne jedno za každý nástroj).
  raise({ alsoKeys, bezNativniho, ...a }, now = this.now()) {
    const keys = this.datastore.data.alertKeys;
    if (keys[a.key]) return undefined;
    keys[a.key] = now;
    for (const [k, at] of Object.entries(keys)) if (now - at > KEY_TTL) delete keys[k];
    const alert = { id: uid(), at: now, read: false, ...a };
    const muted = this.ztlumit(alert, now, bezNativniho);
    if (muted) alert.muted = muted;
    this.datastore.pushAlert(alert);
    this.store.emit('alert', alert);
    if (!muted && this.settings.native && !bezNativniho) {
      // Uložené upozornění zůstává česky (rozhraní si ho přeloží samo); do systému jde v jazyce
      // z Nastavení. Souhrn už v něm je a slovník ho nezná, takže projde beze změny.
      const t = prekladac(this.datastore.data.settings.language);
      this.notifier
        .native({ title: t(alert.title), body: t(alert.body || ''), subtitle: 'Agenteeq', sound: alert.level === 'action' || alert.level === 'critical' })
        .catch(() => {});
    }
    // Spárované telefony s odběrem (src/push.js) dostanou totéž, co jde do systému. Vlastní
    // přepínač nemají: odběr si zapnul telefon sám, a vypne ho tam nebo v Nastavení na Macu.
    if (!muted && !bezNativniho && this.doTelefonu) {
      const t = prekladac(this.datastore.data.settings.language);
      const route = alert.route || (alert.sessionId ? `#/agent/${encodeURIComponent(alert.sessionId)}` : '#/upozorneni');
      Promise.resolve(this.doTelefonu({ title: t(alert.title), body: t(alert.body || ''), route, tag: alert.kind || 'alert', id: alert.id })).catch(() => {});
    }
    return alert;
  }

  // Smí upozornění vyrušit? Zkušební upozornění se nepočítá do nárazu (člověk ho vyvolal sám),
  // ticho ale dodrží – jinak by se nedalo ověřit, že ticho funguje. Upozornění bez vlastního
  // oznámení (`bezNativniho`, detekce agentů) místo v minutě nezabírá: oznámení za něj posílá
  // volající jedno souhrnné.
  ztlumit(alert, now, bezNativniho = false) {
    this.ukazane = this.ukazane.filter((t) => now - t < NARAZ.oknoMs);
    if (alert.kind === 'digest') { this.ukazane.push(now); return null; }
    if (jeNocniTicho(this.settings, now)) return 'quiet';
    if (alert.kind === 'test' || bezNativniho) return null;
    if (this.odlozene('burst').length || this.ukazane.length >= NARAZ.max) return 'burst';
    this.ukazane.push(now);
    return null;
  }

  // Ztlumená upozornění, která ještě nešla do souhrnu. Leží v uloženém seznamu, takže ranní
  // souhrn přežije restart aplikace i uspaný Mac.
  odlozene(duvod) {
    return this.datastore.data.alerts.filter((a) => a.muted === duvod && !a.digested);
  }

  // Volá se po 5 s (src/app.js). Po skončení ticha pošle ranní souhrn, u nárazu souhrn, jakmile je
  // v minutě místo. Vrací odeslané souhrny.
  tick(now = this.now()) {
    if (this.posledniTick && now - this.posledniTick > PROBUZENI.mezeraMs) this.cekatDo = now + PROBUZENI.cekaniMs;
    this.posledniTick = now;
    const naraz = this.odlozene('burst');
    if (jeNocniTicho(this.settings, now)) {
      // Nával, který nestihl odejít před začátkem ticha, počká na ranní souhrn.
      for (const a of naraz) a.muted = 'quiet';
      if (naraz.length) this.datastore.save();
      return [];
    }
    if (now < (this.cekatDo || 0)) return [];
    const odeslane = [this.souhrn('quiet', this.odlozene('quiet'), now)];
    this.ukazane = this.ukazane.filter((t) => now - t < NARAZ.oknoMs);
    if (naraz.length && this.ukazane.length < NARAZ.max) odeslane.push(this.souhrn('burst', naraz, now));
    return odeslane.filter(Boolean);
  }

  // Jedno souhrnné upozornění za ztlumená. Počítá se jen to, co pořád platí: rozhodnutí, které
  // mezitím padlo, obnovený limit ani přečtené upozornění do souhrnu nepatří. Každá věc
  // (konverzace, limit, rozpočet) se počítá jednou, podle svého posledního platného upozornění.
  souhrn(duvod, cekajici, now) {
    if (!cekajici.length) return null;
    for (const a of cekajici) a.digested = true;
    this.datastore.save();
    const veci = new Map();
    for (const a of cekajici) {
      if (a.read || now - a.at > SOUHRN_STARI) continue;
      const vec = this.plati(a, now);
      if (vec) veci.set(vec.klic, { ...vec, kind: a.kind, level: a.level, sessionId: a.sessionId || null });
    }
    const polozky = [...veci.values()];
    if (!polozky.length) return null;
    const { title, body } = textSouhrnu(duvod, polozky, this.datastore.data.settings.language);
    const jedna = polozky.length === 1 && polozky[0].sessionId ? polozky[0].sessionId : null;
    // Kam vede klik: jedna konverzace → rovnou do ní; víc konverzací, které tě potřebují → Agenti
    // s filtrem „Potřebuje tebe“; jen rozpočty → Útrata; jen limity → Přehled s limity.
    const route = jedna ? `#/agent/${encodeURIComponent(jedna)}`
      : polozky.some((p) => p.sessionId && ['needs_input', 'failed', 'limit'].includes(p.kind)) ? '#/agenti?stav=needs_input'
        : polozky.every((p) => p.kind === 'budget') ? '#/utrata'
          : polozky.every((p) => p.klic.startsWith('l:')) ? '#/prehled'
            : '#/upozorneni';
    const level = ['action', 'critical', 'warning', 'info'].find((l) => polozky.some((p) => p.level === l)) || 'info';
    return this.raise({
      key: `digest:${duvod}:${now}`,
      level,
      kind: 'digest',
      digest: duvod,
      title,
      body,
      route,
      count: polozky.length,
      ...(jedna ? { sessionId: jedna } : {}),
    }, now);
  }

  // Platí upozornění i teď? Vrací klíč věci, které se týká, a její název do textu souhrnu.
  plati(a, now) {
    if (a.sessionId) {
      const s = this.store.summary(a.sessionId);
      const stav = { needs_input: 'needs_input', failed: 'failed', limit: 'limited' }[a.kind];
      const ok = stav ? s?.status === stav : a.kind === 'done' && (s?.status === 'waiting' || s?.status === 'idle');
      return ok ? { klic: `s:${a.sessionId}`, nazev: s.title || s.app } : null;
    }
    if (a.limitId) {
      const l = this.store.limits.get(a.limitId);
      if (!l) return null;
      const obnoveno = Boolean(l.resetsAt && l.resetsAt <= now);
      const ok = a.kind === 'limit' ? l.reached && !obnoveno
        : a.kind === 'limit_near' ? !obnoveno && (l.reached || (typeof l.usedPercent === 'number' && l.usedPercent >= 80))
          // Obnova platí, dokud se okno znovu nevyčerpalo. Bez nových dat zůstane v paměti starý
          // odečet (reached) s časem obnovy v minulosti – i to znamená obnovený limit.
          : a.kind === 'limit_reset' && (obnoveno || !l.reached);
      return ok ? { klic: `l:${a.limitId}`, nazev: `${l.app}: ${l.label}`, limit: { app: l.app, label: l.label } } : null;
    }
    // Útrata v měsíci zpátky neklesne; 80 % a 100 % téhož rozpočtu jsou jedna věc.
    if (a.kind === 'budget' && mesic(a.at) === mesic(now)) return { klic: `k:${a.key.replace(/:\d+$/, '')}`, nazev: a.title };
    return null;
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
  // trvale ukládaná data odvozená z obsahu konverzací – uživatel se jich takhle zbaví jedním klikem.
  clear() {
    const count = this.datastore.data.alerts.length;
    this.datastore.data.alerts = [];
    this.datastore.data.alertKeys = {};
    this.datastore.save();
    this.store.emit('alerts:read', 'all');
    return count;
  }
}
