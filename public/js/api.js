export async function request(method, path, body) {
  const init = { method, headers: {} };
  if (method !== 'GET') {
    init.headers['X-Dirigent'] = '1';
    init.headers['Content-Type'] = 'application/json';
    if (body !== undefined) init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw Object.assign(new Error('Dirigent server neodpovídá. Běží `npm start`?'), { status: 0 });
  }
  let json = null;
  try { json = await res.json(); } catch { /* prázdná odpověď */ }
  if (!res.ok) throw Object.assign(new Error(json?.error || `Chyba ${res.status}`), { status: res.status, errors: json?.errors });
  return json;
}

export const api = {
  state: () => request('GET', '/api/state'),
  session: (id) => request('GET', `/api/sessions/${encodeURIComponent(id)}`),
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
};

const EVENTS = ['session', 'session:remove', 'transcript', 'runtimes', 'limits', 'credits', 'alert', 'alerts', 'spend', 'connectors', 'settings', 'integrations'];

// EventSource se po výpadku připojí sám; každé nové "hello" znamená načíst čerstvý snapshot.
export function connectStream({ onHello, onEvent, onStatus }) {
  const es = new EventSource('/api/stream');
  es.addEventListener('hello', (e) => {
    onStatus('live');
    onHello(JSON.parse(e.data));
  });
  for (const name of EVENTS) {
    es.addEventListener(name, (e) => {
      try { onEvent(name, JSON.parse(e.data)); } catch (err) { console.error('Dirigent: chybná událost', name, err); }
    });
  }
  es.onerror = () => onStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'reconnecting');
  return es;
}
