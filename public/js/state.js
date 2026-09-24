// Klientský stav: plní se snapshotem z /api/state a udržuje živě přes SSE události.

// Přístup z telefonu má dvě nezávislé cesty (domácí síť a Tailscale). Starší server nebo odpověď
// bez tohoto bloku nesmí shodit Nastavení, takže výchozí tvar vzniká vždycky znovu a čerstvý.
const prazdnyLan = () => ({ enabled: false, addresses: [], devices: [], tailscale: { enabled: false, available: false, listening: false, addresses: [], name: '', url: '', error: '' } });

export const state = {
  loaded: false,
  ready: false,
  connection: 'connecting',
  version: '',
  host: null,
  windowDays: 30,
  sessions: new Map(),
  runtimes: [],
  customAgents: [],
  localAgents: [],
  lan: prazdnyLan(),
  tunnels: { at: 0, list: [], advice: null },
  limits: [],
  credits: [],
  connectors: [],
  spend: null,
  alerts: { unread: 0, items: [] },
  settings: null,
  integrations: null,
  projects: { items: [], assignments: {}, snapshots: {}, colors: [], limits: {} },
  launch: { targets: [], modes: {}, openMode: 'off' },
  runs: [],
  license: null,
  // Účet Agenteeq (src/ucet.js). Starší server ho neposílá – pak se karta účtu neukáže.
  ucet: { stav: 'nenastaveno' },
  usage: { launches: 0 },
  transcripts: new Map(),
};

const listeners = new Set();
let pending = null;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Změny se slévají do jednoho snímku (requestAnimationFrame) – plynulé i při stovkách událostí.
// Skryté nebo zakryté okno ale snímky nekreslí a requestAnimationFrame v něm nepřijde vůbec: načtený
// stav pak čekal, až se na okno někdo podívá, a aplikace mezitím ukazovala „Načítám agenty“.
// Časovač proto doručí změny nejpozději za 250 ms; při viditelném okně vyhraje snímek.
const EMIT_FALLBACK_MS = 250;
function flush() {
  if (!pending) return;
  const t = pending;
  pending = null;
  for (const fn of listeners) {
    try { fn(t); } catch (err) { console.error(err); }
  }
}
export function emit(...topics) {
  if (!pending) {
    pending = new Set();
    requestAnimationFrame(flush);
    setTimeout(flush, EMIT_FALLBACK_MS);
  }
  for (const x of topics) pending.add(x);
}

export function applySnapshot(s) {
  Object.assign(state, {
    ready: s.ready,
    version: s.version,
    host: s.host,
    windowDays: s.windowDays,
    sessions: new Map(s.sessions.map((x) => [x.id, x])),
    runtimes: s.runtimes,
    customAgents: s.customAgents || [],
    localAgents: s.localAgents || [],
    lan: s.lan ? { ...prazdnyLan(), ...s.lan, tailscale: { ...prazdnyLan().tailscale, ...(s.lan.tailscale || {}) } } : prazdnyLan(),
    tunnels: s.tunnels || { at: 0, list: [], advice: null },
    limits: s.limits,
    credits: s.credits,
    connectors: s.connectors,
    spend: s.spend,
    alerts: s.alerts,
    settings: s.settings,
    integrations: s.integrations,
    projects: s.projects,
    launch: s.launch,
    runs: s.runs,
    storage: s.storage || { ok: true, error: null, recovery: null },
    license: s.license,
    ucet: s.ucet || { stav: 'nenastaveno' },
    usage: s.usage,
  });
  state.loaded = true;
  emit('all');
}

export function applyEvent(name, data) {
  switch (name) {
    case 'session': {
      const prev = state.sessions.get(data.id);
      if (prev && prev.transcriptSeq > data.transcriptSeq) return null;
      state.sessions.set(data.id, data);
      emit('sessions', `session:${data.id}`);
      return null;
    }
    case 'session:remove':
      state.sessions.delete(data.id);
      emit('sessions', `session:${data.id}`);
      return null;
    case 'transcript': {
      const t = state.transcripts.get(data.id);
      if (t) {
        if (data.reset) {
          t.entries.clear();
          t.stale = true;
        }
        for (const e of data.entries) t.entries.set(e.seq, e);
      }
      emit(`transcript:${data.id}`);
      return null;
    }
    case 'storage':
      state.storage = data;
      emit('storage');
      return null;
    case 'runtimes':
      state.runtimes = data;
      emit('runtimes');
      break;
    case 'customAgents':
      state.customAgents = data;
      emit('runtimes');
      break;
    case 'localAgents':
      state.localAgents = data;
      emit('runtimes');
      return null;
    case 'limits':
      state.limits = data;
      emit('limits');
      return null;
    case 'credits':
      state.credits = data;
      emit('credits');
      return null;
    case 'alert': {
      state.alerts.unread = data.unread;
      if (state.alerts.items.some((a) => a.id === data.alert.id)) return null;
      state.alerts.items = [data.alert, ...state.alerts.items].slice(0, 300);
      emit('alerts');
      return data.alert;
    }
    case 'alerts':
      state.alerts.unread = data.unread;
      if (data.unread === 0) for (const a of state.alerts.items) a.read = true;
      emit('alerts');
      return null;
    case 'spend':
      state.spend = data;
      emit('spend');
      return null;
    case 'connectors':
      state.connectors = data;
      emit('connectors');
      return null;
    case 'settings':
      state.settings = data;
      emit('settings');
      return null;
    case 'integrations':
      state.integrations = data;
      emit('integrations');
      return null;
    case 'projects':
      state.projects = data;
      emit('projects');
      return null;
    case 'runs':
      state.runs = data;
      emit('runs');
      return null;
    case 'launch':
      state.launch = data;
      emit('launch');
      return null;
    case 'license':
      state.license = data;
      emit('license');
      return null;
    case 'ucet':
      state.ucet = data;
      emit('ucet');
      return data.udalost ? { ucet: data } : null;
    case 'usage':
      state.usage = data;
      emit('usage');
      return null;
    default:
      return null;
  }
}

export const sessionsList = () => [...state.sessions.values()].sort((a, b) => b.lastAt - a.lastAt);

const taskKey = (s) => (s.taskName ? `${s.connector}:${s.taskName}` : '');

export const taskRunCount = (s) => (taskKey(s) ? [...state.sessions.values()].filter((x) => taskKey(x) === taskKey(s)).length : 0);

// Seznamy a počty agentů: bez pomocných vláken s viditelným rodičem, z plánované úlohy jen poslední spuštění.
// Tokeny a statistiky čti ze sessionsList.
export const agentsList = () => {
  const latest = new Map();
  for (const s of state.sessions.values()) {
    const k = taskKey(s);
    if (k && (latest.get(k)?.lastAt ?? -1) < s.lastAt) latest.set(k, s);
  }
  return sessionsList().filter((s) => (!s.parentId || !state.sessions.has(s.parentId)) && (!taskKey(s) || latest.get(taskKey(s)) === s));
};

export const projectById = (id) => state.projects.items.find((p) => p.id === id) || null;

// Okamžitá aktualizace po vlastní akci (SSE událost `projects` dorazí vzápětí se stejnými daty).
export function setProjects(payload) {
  if (!payload) return;
  state.projects = payload;
  emit('projects');
}

// Konverzace projektu: živé sessions + snímky starších konverzací (mimo okno sledování).
export function projectSessions(id) {
  const live = sessionsList().filter((s) => s.projectId === id);
  const liveIds = new Set(live.map((s) => s.id));
  const older = Object.values(state.projects.snapshots || {})
    .filter((s) => s.projectId === id && !liveIds.has(s.id) && !state.sessions.has(s.id))
    .map((s) => ({ ...s, snapshot: true }))
    .sort((a, b) => b.lastAt - a.lastAt);
  return { live, older };
}

// Spouštěč z palety nebo projektu otevře složku/projekt v Přehledu.
export const launchIntent = { projectId: null, focus: false };
