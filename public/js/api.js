import { tr, trServer, prelozData } from './i18n.js';
// Každá data ze serveru jdou do klientu tudy (request, stream, ukázka), takže texty, které server
// píše česky (src/texty.js), se tady jednou přeloží do jazyka rozhraní (public/js/texty-serveru.js).
// Ukázkový režim (public/js/ukazka.js): místo serveru odpovídá snímek smyšlených dat. Čte se jen
// to, co snímek obsahuje; cokoli, co by něco měnilo, se odmítne – v ukázce se nic neukládá.
let ukazka = null;
export function zapniUkazku(odpovedi) { ukazka = odpovedi; }

function ukazkaOdpoved(method, path) {
  if (method !== 'GET') throw Object.assign(new Error(tr('Tohle je ukázka – nic se v ní neukládá.')), { status: 403 });
  if (!Object.hasOwn(ukazka, path)) throw Object.assign(new Error(tr('V ukázce tahle data nejsou.')), { status: 404 });
  return prelozData(structuredClone(ukazka[path]));
}

// `keepalive`: požadavek doběhne, i když se stránka právě zavírá nebo obnovuje – jinak ho prohlížeč
// zruší (a WebKit to navíc zapíše do konzole jako chybu přístupu: „due to access control checks“).
export async function request(method, path, body, { keepalive = false } = {}) {
  if (ukazka) return ukazkaOdpoved(method, path);
  const init = { method, headers: {}, ...(method === 'GET' ? { cache: 'no-store' } : {}) };
  if (keepalive) init.keepalive = true;
  if (method !== 'GET') {
    init.headers['X-Agenteeq'] = '1';
    init.headers['Content-Type'] = 'application/json';
    if (body !== undefined) init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw Object.assign(new Error(tr('Agenteeq neodpovídá. Otevři aplikaci Agenteeq a zkus to znovu.')), { status: 0 });
  }
  let json = null;
  try { json = await res.json(); } catch { /* prázdná odpověď */ }
  if (!res.ok) throw Object.assign(new Error(trServer(json?.error) || `${tr('Chyba')} ${res.status}`), { status: res.status, errors: json?.errors ? prelozData(json.errors) : json?.errors });
  return prelozData(json);
}

export const api = {
  napojeni: () => request('GET', '/api/napojeni'),
  napojit: (id) => request('POST', `/api/napojeni/${encodeURIComponent(id)}`),
  napojeniZrusit: (id) => request('POST', `/api/napojeni/${encodeURIComponent(id)}/zrusit`),
  napojeniOdkaz: (id) => request('POST', `/api/napojeni/${encodeURIComponent(id)}/odkaz`),
  napojeniKod: (id, kod) => request('POST', `/api/napojeni/${encodeURIComponent(id)}/kod`, { kod }),
  ucetPrihlasit: () => request('POST', '/api/ucet/prihlaseni'),
  ucetZrusit: () => request('POST', '/api/ucet/zruseni'),
  ucetOdhlasit: () => request('POST', '/api/ucet/odhlaseni'),
  ucetSmazat: () => request('POST', '/api/ucet/smazani'),
  ucetSynchronizace: (zapnuto) => request('POST', '/api/ucet/synchronizace', { zapnuto }),
  ucetSynchronizovat: () => request('POST', '/api/ucet/synchronizovat'),
  ucetNahled: () => request('GET', '/api/ucet/nahled'),
  state: () => request('GET', '/api/state'),
  session: (id) => request('GET', `/api/sessions/${encodeURIComponent(id)}`),
  openSession: (id, target) => request('POST', `/api/sessions/${encodeURIComponent(id)}/open`, { target }),
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
  browserLink: async () => new URL((await request('POST', '/api/local/browser-link', {})).path, location.origin).href,
  lanPin: () => request('POST', '/api/lan/pin', {}),
  detectRemote: () => request('POST', '/api/remote/detect', {}),
  lanForget: (id) => request('DELETE', `/api/lan/devices/${encodeURIComponent(id)}`),
  pairDevice: (pin, label) => request('POST', '/api/lan/pair', { pin, label }),
  nastroj: (id, akce) => request('POST', `/api/nastroje/${encodeURIComponent(id)}/${akce}`, {}),
  pritomnost: (videt) => request('POST', '/api/ui/pritomnost', { videt }, { keepalive: true }),
  focusRuntime: (id) => request('POST', `/api/runtimes/${encodeURIComponent(id)}/focus`, {}),
  customAgents: () => request('GET', '/api/custom-agents'),
  addCustomAgent: (body) => request('POST', '/api/custom-agents', body),
  removeCustomAgent: (id) => request('DELETE', `/api/custom-agents/${encodeURIComponent(id)}`),
  planUsage: (days = 30) => request('GET', `/api/usage/claude?days=${days}`),
  historie: () => request('GET', '/api/historie'),
  skills: () => request('GET', '/api/skills'),
  // Obsah dovednosti je čistý markdown, ne JSON – proto mimo `request()`.
  async skillText(id) {
    const res = await fetch(`/api/skills/${encodeURIComponent(id)}/raw`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 404 ? tr('Soubor dovednosti už na disku není.') : tr('Dovednost se nepodařilo načíst (chyba {0}).', res.status));
    return res.text();
  },
  extensionPairCode: () => request('POST', '/api/extension/pair-code', {}),
  extensionObchod: () => request('POST', '/api/extension/obchod', {}),
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
  checkUpdates: () => request('POST', '/api/updates/check', {}),
  downloadUpdate: () => request('POST', '/api/updates/download', {}),
  revealUpdate: () => request('POST', '/api/updates/reveal', {}),
  installUpdate: () => request('POST', '/api/updates/install', {}),
  folders: (path = '') => request('GET', `/api/fs/folders${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  // Obrázek jde jako surové bajty (ne JSON), server ho pozná podle obsahu a ne podle přípony.
  async setProjectMedia(id, kind, blob) {
    let res;
    try {
      res = await fetch(`/api/projects/${encodeURIComponent(id)}/media/${kind}`, { method: 'PUT', headers: { 'X-Agenteeq': '1', 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    } catch {
      throw new Error(tr('Agenteeq neodpovídá, obrázek se proto nenahrál.'));
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(trServer(json?.error) || tr('Obrázek se nenahrál (chyba {0}).', res.status));
    return prelozData(json);
  },
  removeProjectMedia: (id, kind) => request('DELETE', `/api/projects/${encodeURIComponent(id)}/media/${kind}`),
  projectGit: (id) => request('GET', `/api/projects/${encodeURIComponent(id)}/git`),
  team: (id, body) => request('POST', `/api/projects/${encodeURIComponent(id)}/team`, body),
  workAction: (id, workId, action) => request('POST', `/api/projects/${encodeURIComponent(id)}/work/${encodeURIComponent(workId)}/${action}`, {}),
};

const EVENTS = ['session', 'session:remove', 'transcript', 'runtimes', 'localAgents', 'detekce', 'customAgents', 'limits', 'credits', 'alert', 'alerts', 'spend', 'connectors', 'settings', 'updates', 'integrations', 'projects', 'runs', 'launch', 'license', 'usage', 'storage', 'ucet', 'napojeni'];

// Prodlevy před novým spojením po chybové odpovědi serveru; poslední se opakuje.
const PRODLEVY_PROUDU = [2000, 5000, 10000, 30000];

// Po síťovém výpadku se EventSource připojí sám; každé nové "hello" znamená načíst čerstvý snapshot.
// Chybovou odpověď (503 při přetížení, restart serveru, výpadek proxy) ale prohlížeč bere jako konec
// a proud zavře natrvalo. Pak se znovu připojuje tahle funkce, s rostoucí prodlevou, aby přetížený
// server nezahltila. `obnov()` připojí zavřený proud hned (návrat do okna, obnovená síť).
export function connectStream({ onHello, onEvent, onStatus }) {
  // Ukázka nemá server ani živé změny: jednou „připojeno“ a hotovo.
  if (ukazka) {
    queueMicrotask(() => { onStatus('live'); onHello({}); });
    return { close() {}, obnov() {} };
  }
  let es = null;
  let pokus = 0;
  let casovac = null;
  let ukonceno = false;

  function pripoj() {
    casovac = null;
    const proud = new EventSource('/api/stream');
    es = proud;
    proud.addEventListener('hello', (e) => {
      pokus = 0;
      onStatus('live');
      onHello(JSON.parse(e.data));
    });
    for (const name of EVENTS) {
      proud.addEventListener(name, (e) => {
        try { onEvent(name, prelozData(JSON.parse(e.data))); } catch (err) { console.error('Agenteeq: chybná událost', name, err); }
      });
    }
    proud.onerror = () => {
      if (proud !== es) return;
      if (proud.readyState !== EventSource.CLOSED) return onStatus('reconnecting');
      onStatus('offline');
      naplanuj();
    };
  }

  function naplanuj() {
    if (ukonceno || casovac) return;
    const ms = PRODLEVY_PROUDU[Math.min(pokus++, PRODLEVY_PROUDU.length - 1)];
    casovac = setTimeout(pripoj, ms);
  }

  pripoj();
  return {
    close() {
      ukonceno = true;
      clearTimeout(casovac);
      casovac = null;
      es?.close();
    },
    obnov() {
      if (ukonceno || es?.readyState !== EventSource.CLOSED) return;
      clearTimeout(casovac);
      pripoj();
    },
  };
}
