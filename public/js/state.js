// Klientský stav: plní se snapshotem z /api/state a udržuje živě přes SSE události.
export const state = {
  loaded: false,
  ready: false,
  connection: 'connecting',
  version: '',
  host: null,
  windowDays: 30,
  sessions: new Map(),
  runtimes: [],
  limits: [],
  credits: [],
  connectors: [],
  spend: null,
  alerts: { unread: 0, items: [] },
  settings: null,
  integrations: null,
  transcripts: new Map(),
};

const listeners = new Set();
let pending = null;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Změny se slévají do jednoho snímku (requestAnimationFrame) — plynulé i při stovkách událostí.
export function emit(...topics) {
  if (!pending) {
    pending = new Set();
    requestAnimationFrame(() => {
      const t = pending;
      pending = null;
      for (const fn of listeners) {
        try { fn(t); } catch (err) { console.error(err); }
      }
    });
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
    limits: s.limits,
    credits: s.credits,
    connectors: s.connectors,
    spend: s.spend,
    alerts: s.alerts,
    settings: s.settings,
    integrations: s.integrations,
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
    case 'runtimes':
      state.runtimes = data;
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
    default:
      return null;
  }
}

export const sessionsList = () => [...state.sessions.values()].sort((a, b) => b.lastAt - a.lastAt);
