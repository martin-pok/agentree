// Service worker: spárování s Agenteeq a odeslání dat na 127.0.0.1 (nikam jinam).
const BASE = 'http://127.0.0.1:4620';
let token = null;

async function getToken() {
  if (token) return token;
  const stored = await chrome.storage.local.get(['token']);
  if (stored.token) return (token = stored.token);
  throw new Error('Rozšíření není spárované. Klikni na jeho ikonu a vlož jednorázový kód z Agenteeq.');
}

async function pair(code) {
  const res = await fetch(`${BASE}/api/extension/pair`, { method: 'POST', headers: { 'X-Agenteeq-Pair-Code': code } });
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

async function send(payload) {
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  if (disabledSites.includes(payload.site)) return;
  const res = await post(await getToken(), payload);
  await chrome.storage.local.set({ lastStatus: { ok: res.ok, code: res.status, site: payload.site, at: Date.now() } });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'agenteeq:update') {
    send(msg.payload).catch((err) =>
      chrome.storage.local.set({ lastStatus: { ok: false, error: String(err.message || err), site: msg.payload?.site, at: Date.now() } }));
  } else if (msg?.type === 'agenteeq:pair' && typeof msg.code === 'string') {
    pair(msg.code.trim()).then(() => sendResponse({ ok: true }), (err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
});
