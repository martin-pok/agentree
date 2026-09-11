export async function request(method, path, body) {
  const init = { method, headers: {} };
  if (method !== 'GET') {
    init.headers['X-Agentree'] = '1';
    init.headers['Content-Type'] = 'application/json';
    if (body !== undefined) init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw Object.assign(new Error('Server Agentree neodpovídá. Spusť ho v Terminálu příkazem agentree --open.'), { status: 0 });
  }
  let json = null;
  try { json = await res.json(); } catch { /* prázdná odpověď */ }
  if (!res.ok) throw Object.assign(new Error(json?.error || `Chyba ${res.status}`), { status: res.status, errors: json?.errors });
  return json;
}

export const api = {
  state: () => request('GET', '/api/state'),
  session: (id) => request('GET', `/api/sessions/${encodeURIComponent(id)}`),
  openSession: (id, target) => request('POST', `/api/sessions/${encodeURIComponent(id)}/open`, { target }),
  addLedger: (entry) => request('POST', '/api/spend/ledger', entry),
  endLedger: (id, endDate) => request('PATCH', `/api/spend/ledger/${encodeURIComponent(id)}`, { endDate }),
  deleteLedger: (id) => request('DELETE', `/api/spend/ledger/${encodeURIComponent(id)}`),
  saveBudgets: (body) => request('PUT', '/api/spend/budgets', body),
  readAlerts: (ids) => request('POST', '/api/alerts/read', { ids }),
  testAlert: () => request('POST', '/api/alerts/test', {}),
  saveSettings: (body) => request('PUT', '/api/settings', body),
  hooks: (action) => request('POST', `/api/integrations/claude-hooks/${action}`, {}),
  setSecret: (id, value) => request('PUT', `/api/secrets/${encodeURIComponent(id)}`, { value }),
  removeSecret: (id) => request('DELETE', `/api/secrets/${encodeURIComponent(id)}`),
  rescan: () => request('POST', '/api/connectors/rescan', {}),
  extensionPairCode: () => request('POST', '/api/extension/pair-code', {}),
  createProject: (body) => request('POST', '/api/projects', body),
  updateProject: (id, body) => request('PATCH', `/api/projects/${encodeURIComponent(id)}`, body),
  deleteProject: (id) => request('DELETE', `/api/projects/${encodeURIComponent(id)}`),
  assign: (sessionIds, projectId) => request('POST', '/api/projects/assign', { sessionIds, projectId }),
  launch: (body) => request('POST', '/api/launch', body),
  refreshLaunch: () => request('POST', '/api/launch/refresh', {}),
  stopRun: (id) => request('POST', `/api/runs/${encodeURIComponent(id)}/stop`, {}),
  runLog: (id) => request('GET', `/api/runs/${encodeURIComponent(id)}/log`),
  clearRuns: () => request('POST', '/api/runs/clear', {}),
  reply: (id, text) => request('POST', `/api/sessions/${encodeURIComponent(id)}/reply`, { text }),
  stopChat: (id) => request('POST', `/api/sessions/${encodeURIComponent(id)}/stop`, {}),
  activateLicense: (key) => request('PUT', '/api/license', { key }),
  removeLicense: () => request('DELETE', '/api/license'),
  autostart: (action) => request('POST', `/api/integrations/autostart/${action}`, {}),
  folders: (path = '') => request('GET', `/api/fs/folders${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  projectGit: (id) => request('GET', `/api/projects/${encodeURIComponent(id)}/git`),
  team: (id, body) => request('POST', `/api/projects/${encodeURIComponent(id)}/team`, body),
  workAction: (id, workId, action) => request('POST', `/api/projects/${encodeURIComponent(id)}/work/${encodeURIComponent(workId)}/${action}`, {}),
  removeMedia: (id, kind) => request('DELETE', `/api/projects/${encodeURIComponent(id)}/media/${kind}`),
  async uploadMedia(id, kind, blob) {
    let res;
    try {
      res = await fetch(`/api/projects/${encodeURIComponent(id)}/media/${kind}`, { method: 'PUT', headers: { 'X-Agentree': '1', 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    } catch {
      throw Object.assign(new Error('Agentree server neodpovídá.'), { status: 0 });
    }
    let json = null;
    try { json = await res.json(); } catch { /* prázdná odpověď */ }
    if (!res.ok) throw Object.assign(new Error(json?.error || `Chyba ${res.status}`), { status: res.status });
    return json;
  },
};

const EVENTS = ['session', 'session:remove', 'transcript', 'runtimes', 'limits', 'credits', 'alert', 'alerts', 'spend', 'connectors', 'settings', 'integrations', 'projects', 'runs', 'launch', 'license', 'usage'];

// EventSource se po výpadku připojí sám; každé nové "hello" znamená načíst čerstvý snapshot.
export function connectStream({ onHello, onEvent, onStatus }) {
  const es = new EventSource('/api/stream');
  es.addEventListener('hello', (e) => {
    onStatus('live');
    onHello(JSON.parse(e.data));
  });
  for (const name of EVENTS) {
    es.addEventListener(name, (e) => {
      try { onEvent(name, JSON.parse(e.data)); } catch (err) { console.error('Agentree: chybná událost', name, err); }
    });
  }
  es.onerror = () => onStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'reconnecting');
  return es;
}
