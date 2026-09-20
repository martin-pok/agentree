export async function request(method, path, body) {
  const init = { method, headers: {} };
  if (method !== 'GET') {
    init.headers['X-Agenteeq'] = '1';
    init.headers['Content-Type'] = 'application/json';
    if (body !== undefined) init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw Object.assign(new Error('Server Agenteeq neodpovídá. Spusť ho v Terminálu příkazem agenteeq --open.'), { status: 0 });
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
  clearAlerts: () => request('POST', '/api/alerts/clear', {}),
  setLanAccess: (on) => request('POST', `/api/lan/${on ? 'enable' : 'disable'}`, {}),
  setTailscaleAccess: (on) => request('POST', `/api/tailscale/${on ? 'enable' : 'disable'}`, {}),
  lanPin: () => request('POST', '/api/lan/pin', {}),
  detectRemote: () => request('POST', '/api/remote/detect', {}),
  lanForget: (id) => request('DELETE', `/api/lan/devices/${encodeURIComponent(id)}`),
  pairDevice: (pin, label) => request('POST', '/api/lan/pair', { pin, label }),
  focusRuntime: (id) => request('POST', `/api/runtimes/${encodeURIComponent(id)}/focus`, {}),
  customAgents: () => request('GET', '/api/custom-agents'),
  addCustomAgent: (body) => request('POST', '/api/custom-agents', body),
  removeCustomAgent: (id) => request('DELETE', `/api/custom-agents/${encodeURIComponent(id)}`),
  planUsage: (days = 30) => request('GET', `/api/usage/claude?days=${days}`),
  skills: () => request('GET', '/api/skills'),
  // Obsah dovednosti je čistý markdown, ne JSON – proto mimo `request()`.
  async skillText(id) {
    const res = await fetch(`/api/skills/${encodeURIComponent(id)}/raw`);
    if (!res.ok) throw new Error(res.status === 404 ? 'Soubor dovednosti už na disku není.' : `Dovednost se nepodařilo načíst (chyba ${res.status}).`);
    return res.text();
  },
  extensionPairCode: () => request('POST', '/api/extension/pair-code', {}),
  createProject: (body) => request('POST', '/api/projects', body),
  updateProject: (id, body) => request('PATCH', `/api/projects/${encodeURIComponent(id)}`, body),
  deleteProject: (id) => request('DELETE', `/api/projects/${encodeURIComponent(id)}`),
  reorderProjects: (ids) => request('PUT', '/api/projects/order', { ids }),
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
  revealInstallPackage: () => request('POST', '/api/install/reveal', {}),
  folders: (path = '') => request('GET', `/api/fs/folders${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  // Obrázek jde jako surové bajty (ne JSON), server ho pozná podle obsahu a ne podle přípony.
  async setProjectMedia(id, kind, blob) {
    let res;
    try {
      res = await fetch(`/api/projects/${encodeURIComponent(id)}/media/${kind}`, { method: 'PUT', headers: { 'X-Agenteeq': '1', 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    } catch {
      throw new Error('Server Agenteeq neodpovídá. Obrázek se nenahrál.');
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || `Obrázek se nenahrál (chyba ${res.status}).`);
    return json;
  },
  removeProjectMedia: (id, kind) => request('DELETE', `/api/projects/${encodeURIComponent(id)}/media/${kind}`),
  projectGit: (id) => request('GET', `/api/projects/${encodeURIComponent(id)}/git`),
  team: (id, body) => request('POST', `/api/projects/${encodeURIComponent(id)}/team`, body),
  workAction: (id, workId, action) => request('POST', `/api/projects/${encodeURIComponent(id)}/work/${encodeURIComponent(workId)}/${action}`, {}),
};

const EVENTS = ['session', 'session:remove', 'transcript', 'runtimes', 'localAgents', 'customAgents', 'limits', 'credits', 'alert', 'alerts', 'spend', 'connectors', 'settings', 'integrations', 'projects', 'runs', 'launch', 'license', 'usage', 'storage'];

// EventSource se po výpadku připojí sám; každé nové "hello" znamená načíst čerstvý snapshot.
export function connectStream({ onHello, onEvent, onStatus }) {
  const es = new EventSource('/api/stream');
  es.addEventListener('hello', (e) => {
    onStatus('live');
    onHello(JSON.parse(e.data));
  });
  for (const name of EVENTS) {
    es.addEventListener(name, (e) => {
      try { onEvent(name, JSON.parse(e.data)); } catch (err) { console.error('Agenteeq: chybná událost', name, err); }
    });
  }
  es.onerror = () => onStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'reconnecting');
  return es;
}
