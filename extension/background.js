// Service worker: spárování s Dirigentem a odeslání dat na 127.0.0.1 (nikam jinam).
const BASE = 'http://127.0.0.1:4620';
let token = null;

async function getToken(force = false) {
  if (token && !force) return token;
  const stored = await chrome.storage.local.get(['token']);
  if (stored.token && !force) return (token = stored.token);
  const res = await fetch(`${BASE}/api/extension/pair`);
  if (!res.ok) throw new Error(`Spárování selhalo (${res.status})`);
  token = (await res.json()).token;
  await chrome.storage.local.set({ token });
  return token;
}

const post = (t, payload) =>
  fetch(`${BASE}/api/ingest/web`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dirigent-Token': t },
    body: JSON.stringify(payload),
  });

async function send(payload) {
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  if (disabledSites.includes(payload.site)) return;
  let res = await post(await getToken(), payload);
  if (res.status === 401) res = await post(await getToken(true), payload);
  await chrome.storage.local.set({ lastStatus: { ok: res.ok, code: res.status, site: payload.site, at: Date.now() } });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'dirigent:update') {
    send(msg.payload).catch((err) =>
      chrome.storage.local.set({ lastStatus: { ok: false, error: String(err.message || err), site: msg.payload?.site, at: Date.now() } }));
  } else if (msg?.type === 'dirigent:set-token' && typeof msg.token === 'string') {
    token = msg.token.trim();
    chrome.storage.local.set({ token });
  }
});
