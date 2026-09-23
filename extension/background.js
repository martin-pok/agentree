// Service worker: spárování s Agenteeq a odeslání dat na 127.0.0.1 (nikam jinam).
const BASE = 'http://127.0.0.1:4620';
let token = null;

async function getToken() {
  if (token) return token;
  const stored = await chrome.storage.local.get(['token']);
  if (stored.token) return (token = stored.token);
  throw new Error('Rozšíření není spárované. Klikni na jeho ikonu a vlož jednorázový kód z Agenteeq.');
}

// Trvalé ID této instalace. Díky němu nové spárování zneplatní starý token jen tohoto prohlížeče
// a jiné profily Chromu se stejným rozšířením zůstanou připojené.
async function installationId() {
  const stored = await chrome.storage.local.get(['installationId']);
  if (typeof stored.installationId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(stored.installationId)) return stored.installationId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ installationId: id });
  return id;
}

async function pair(code) {
  const res = await fetch(`${BASE}/api/extension/pair`, {
    method: 'POST',
    headers: { 'X-Agenteeq-Pair-Code': code, 'X-Agenteeq-Installation-Id': await installationId() },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.token !== 'string') throw new Error(body.error || 'Spárování selhalo.');
  token = body.token;
  await chrome.storage.local.set({ token, lastStatus: { ok: true, site: 'párování', at: Date.now() } });
}

const post = (t, payload) =>
  fetch(`${BASE}/api/ingest/web`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agenteeq-Token': t },
    body: JSON.stringify(payload),
  });

// Server token odmítl: rozšíření se odpárovalo nebo spárovalo jinde. Zapomenout ho, ať popup
// hned nabídne nové spárování.
async function forgetToken() {
  token = null;
  await chrome.storage.local.remove('token');
}

async function send(payload) {
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  if (disabledSites.includes(payload.site)) return;
  const res = await post(await getToken(), payload);
  if (res.status === 401) await forgetToken();
  await chrome.storage.local.set({ lastStatus: { ok: res.ok, code: res.status, site: payload.site, at: Date.now() } });
}

async function takeHandoff(site) {
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  if (disabledSites.includes(site)) return { prompt: null };
  const res = await fetch(`${BASE}/api/extension/handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agenteeq-Token': await getToken() },
    body: JSON.stringify({ site }),
  });
  if (res.status === 401) await forgetToken();
  if (!res.ok) return { prompt: null };
  const body = await res.json().catch(() => ({}));
  return { prompt: typeof body.prompt === 'string' ? body.prompt.slice(0, 20000) : null, prefilled: Boolean(body.prefilled) };
}

// Ohlášení aplikaci: díky němu Agenteeq ví, že je rozšíření nainstalované a v jaké verzi, i když
// zrovna není otevřená žádná konverzace. Neplatný token (401) znamená, že je třeba spárovat znovu.
async function hello() {
  let t;
  try {
    t = await getToken();
  } catch {
    return { paired: false };
  }
  try {
    const res = await fetch(`${BASE}/api/extension/hello`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agenteeq-Token': t },
      body: JSON.stringify({ version: chrome.runtime.getManifest().version }),
    });
    if (res.status === 401) {
      await forgetToken();
      return { paired: false, revoked: true };
    }
    const body = await res.json().catch(() => ({}));
    return { paired: true, online: res.ok, status: body };
  } catch {
    return { paired: true, online: false };
  }
}

const HELLO_ALARM = 'agenteeq-hello';
const armHello = () => chrome.alarms.create(HELLO_ALARM, { periodInMinutes: 30 });
chrome.runtime.onInstalled.addListener(() => { armHello(); hello(); });
chrome.runtime.onStartup.addListener(() => { armHello(); hello(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === HELLO_ALARM) hello(); });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'agenteeq:update') {
    send(msg.payload).catch((err) =>
      chrome.storage.local.set({ lastStatus: { ok: false, error: String(err.message || err), site: msg.payload?.site, at: Date.now() } }));
  } else if (msg?.type === 'agenteeq:handoff' && typeof msg.site === 'string') {
    takeHandoff(msg.site).then(sendResponse, () => sendResponse({ prompt: null }));
    return true;
  } else if (msg?.type === 'agenteeq:pair' && typeof msg.code === 'string') {
    pair(msg.code.trim()).then(() => hello()).then(() => sendResponse({ ok: true }), (err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  } else if (msg?.type === 'agenteeq:hello') {
    hello().then(sendResponse, () => sendResponse({ paired: false }));
    return true;
  }
});
