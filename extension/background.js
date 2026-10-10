// Service worker: spárování s Agenteeq a odeslání dat na 127.0.0.1 (nikam jinam).
// Port aplikace je výchozí 4620. Běží-li Agenteeq jinde (PORT), nastaví se v okně
// rozšíření; manifest se kvůli tomu nemění (volitelné oprávnění pro 127.0.0.1, popup.js).
const HOST = 'http://127.0.0.1';
const VYCHOZI_PORT = 4620;
const platnyPort = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535;
let port = null;
let pairingReset = Promise.resolve();
let pairingGeneration = 0;
async function zaklad() {
  if (port === null) {
    const ulozeny = await chrome.storage.local.get(['port']);
    port = platnyPort(ulozeny.port) ? ulozeny.port : VYCHOZI_PORT;
  }
  return `${HOST}:${port}`;
}
// Změna portu v okně rozšíření: jiná adresa může být jiná instalace Agenteeq, a tak se token
// zapomene a spárování proběhne znovu (bez kódu, když aplikace rozšíření pozná).
chrome.storage.onChanged?.addListener((zmeny, oblast) => {
  if (oblast !== 'local' || !('port' in zmeny)) return;
  port = null;
  token = null;
  pairingGeneration++;
  posledniPokus = 0;
  // A port change can target a different local app instance. Never reuse its persisted token.
  pairingReset = pairingReset.then(async () => {
    await chrome.storage.local.remove('token');
    await chrome.storage.local.set({ parovani: 'nedostupne' });
  });
});
let token = null;

async function getToken() {
  await pairingReset;
  if (token) return token;
  const stored = await chrome.storage.local.get(['token']);
  if (stored.token) return (token = stored.token);
  if (await pripojit()) return token;
  throw new Error('Rozšíření není spárované s Agenteeq.');
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

// Spárování bez kódu: aplikace pozná naše rozšíření podle původu, který nastavuje prohlížeč.
// Zkouší se po instalaci, po startu Chromu, při otevření okna a před odesláním – nejvýš jednou
// za 20 s, ať se neptá pořád dokola, když aplikace neběží. Vrací, jestli je spárováno.
let posledniPokus = 0;
let probihajiciParovani = null;

// A response is valid only for the port generation that initiated the request.
// This also prevents an old request from overwriting a newer pairing after a port switch.
async function provedAutomatickeParovani(generation) {
  try {
    const res = await fetch(`${await zaklad()}/api/extension/pripojit`, {
      method: 'POST',
      headers: { 'X-Agenteeq-Installation-Id': await installationId() },
    });
    const body = await res.json().catch(() => ({}));
    if (generation !== pairingGeneration) return false;

    if (!res.ok || typeof body.token !== 'string') {
      await chrome.storage.local.set({ parovani: res.status === 409 ? 'kod' : 'nedostupne' });
      return false;
    }

    token = body.token;
    await chrome.storage.local.set({ token, parovani: 'hotovo' });
    return true;
  } catch {
    if (generation === pairingGeneration) {
      await chrome.storage.local.set({ parovani: 'nedostupne' });
    }
    return false;
  }
}

async function pripojit({ hned = false } = {}) {
  await pairingReset;
  const generation = pairingGeneration;
  if (probihajiciParovani?.generation === generation) return probihajiciParovani.promise;
  if (!hned && Date.now() - posledniPokus < 20000) return false;

  posledniPokus = Date.now();
  const promise = provedAutomatickeParovani(generation);
  probihajiciParovani = { promise, generation };
  try {
    return await promise;
  } finally {
    if (probihajiciParovani?.promise === promise) probihajiciParovani = null;
  }
}

async function pair(code) {
  const res = await fetch(`${await zaklad()}/api/extension/pair`, {
    method: 'POST',
    headers: { 'X-Agenteeq-Pair-Code': code, 'X-Agenteeq-Installation-Id': await installationId() },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.token !== 'string') throw new Error(body.error || 'Spárování selhalo.');
  token = body.token;
  await chrome.storage.local.set({ token, parovani: 'hotovo' });
}

const post = async (t, payload) =>
  fetch(`${await zaklad()}/api/ingest/web`, {
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

// Otevřené konverzace pro okno rozšíření: služba, karta (aby se do ní dalo přepnout), jestli agent
// odpovídá nebo narazil na limit a kdy odpověď začala a skončila. Jen čísla a stav, nic ze stránky.
// Drží se v paměti prohlížeče (storage.session) a mizí se zavřením Chromu. Karta se hlásí
// nejpozději po minutě, takže co mlčí přes 150 s, už zavřená je.
const OTEVRENA_MS = 150e3;
async function zapamatujKonverzaci(payload, karta) {
  if (!chrome.storage.session) return;
  const { otevrene = {} } = await chrome.storage.session.get(['otevrene']);
  const ted = Date.now();
  const klic = `${payload.site}:${payload.conversationId}`;
  const tab = typeof karta?.id === 'number' ? karta.id : null;
  for (const [k, x] of Object.entries(otevrene)) {
    // V jedné kartě je vždy jen jedna konverzace: přejde-li karta na jinou, stará zmizí hned.
    if (ted - x.at > OTEVRENA_MS || (tab !== null && x.tab === tab && k !== klic)) delete otevrene[k];
  }
  const pred = otevrene[klic];
  const generating = Boolean(payload.generating);
  otevrene[klic] = {
    site: payload.site,
    generating,
    limit: Boolean(payload.limit),
    at: ted,
    tab: tab ?? pred?.tab ?? null,
    okno: typeof karta?.windowId === 'number' ? karta.windowId : pred?.okno ?? null,
    od: generating ? (pred?.generating && pred.od ? pred.od : ted) : null,
    konec: !generating && pred?.generating ? ted : pred?.konec ?? null,
  };
  await chrome.storage.session.set({ otevrene });
}

// Zavřená karta z okna zmizí hned, ne až po 150 s ticha.
async function zapomenKartu(tabId) {
  if (!chrome.storage.session) return;
  const { otevrene = {} } = await chrome.storage.session.get(['otevrene']);
  let zmena = false;
  for (const [k, x] of Object.entries(otevrene)) if (x.tab === tabId) { delete otevrene[k]; zmena = true; }
  if (zmena) await chrome.storage.session.set({ otevrene });
}

// Vrací, jestli aplikace hlášení přijala. Vypnutá služba se počítá jako vyřízená – opakovat nemá smysl.
async function send(payload, karta) {
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  if (disabledSites.includes(payload.site)) return true;
  await zapamatujKonverzaci(payload, karta).catch(() => {});
  const res = await post(await getToken(), payload);
  if (res.status === 401) await forgetToken();
  await chrome.storage.local.set({ lastStatus: { ok: res.ok, code: res.status, site: payload.site, at: Date.now() } });
  return res.ok;
}

async function takeHandoff(site) {
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  if (disabledSites.includes(site)) return { prompt: null };
  const res = await fetch(`${await zaklad()}/api/extension/handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agenteeq-Token': await getToken() },
    body: JSON.stringify({ site }),
  });
  if (res.status === 401) await forgetToken();
  if (!res.ok) return { prompt: null };
  const body = await res.json().catch(() => ({}));
  return { prompt: typeof body.prompt === 'string' ? body.prompt.slice(0, 20000) : null, prefilled: Boolean(body.prefilled) };
}

// Souhrn agentů pro okno rozšíření. Bez tokenu nebo při chybě vrátí null – okno pak sekci skryje.
async function prehled() {
  await pairingReset;
  const t = token || (await chrome.storage.local.get(['token'])).token;
  if (!t) return null;
  try {
    const res = await fetch(`${await zaklad()}/api/extension/prehled`, { method: 'POST', headers: { 'X-Agenteeq-Token': t }, signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Ohlášení aplikaci: díky němu Agenteeq ví, že je rozšíření nainstalované a v jaké verzi, i když
// zrovna není otevřená žádná konverzace. Neplatný token (401) znamená, že je třeba spárovat znovu.
async function hello({ hned = false, znovu = false } = {}) {
  await pairingReset;
  let t = token || (await chrome.storage.local.get(['token'])).token;
  if (!t && (await pripojit({ hned }))) t = token;
  if (!t) return { paired: false, parovani: (await chrome.storage.local.get(['parovani'])).parovani || 'nedostupne' };
  try {
    const res = await fetch(`${await zaklad()}/api/extension/hello`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agenteeq-Token': t },
      body: JSON.stringify({ version: chrome.runtime.getManifest().version }),
    });
    if (res.status === 401) {
      await forgetToken();
      // Odpárováno v aplikaci: naše rozšíření se hned spáruje znovu, jiné potřebuje nový kód.
      if (!znovu && (await pripojit({ hned: true }))) return hello({ znovu: true });
      return { paired: false, revoked: true, parovani: (await chrome.storage.local.get(['parovani'])).parovani };
    }
    const body = await res.json().catch(() => ({}));
    return { paired: true, online: res.ok, status: body };
  } catch {
    return { paired: true, online: false };
  }
}

// Po instalaci a po každé aktualizaci (z obchodu přichází sama) by karty, které už jsou otevřené,
// do obnovení stránky nic nehlásily: nové do nich Chrome skript nevloží a starý po aktualizaci ztratí
// spojení. Agent rozepsaný v takové kartě by v Agenteeq chyběl – proto se skript vloží hned.
async function vlozDoOtevrenychKaret() {
  const [skript] = chrome.runtime.getManifest().content_scripts || [];
  if (!skript || !chrome.scripting) return;
  for (const karta of await chrome.tabs.query({ url: skript.matches })) {
    chrome.scripting.executeScript({ target: { tabId: karta.id }, files: skript.js }).catch(() => {});
  }
}

const HELLO_ALARM = 'agenteeq-hello';
const armHello = () => chrome.alarms.create(HELLO_ALARM, { periodInMinutes: 30 });
chrome.runtime.onInstalled.addListener(({ reason }) => {
  armHello();
  hello({ hned: true });
  if (reason === 'install' || reason === 'update') vlozDoOtevrenychKaret().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => { armHello(); hello(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === HELLO_ALARM) hello(); });
chrome.tabs?.onRemoved?.addListener((tabId) => { zapomenKartu(tabId).catch(() => {}); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'agenteeq:update') {
    send(msg.payload, sender?.tab).then((ok) => sendResponse({ ok }), (err) => {
      chrome.storage.local.set({ lastStatus: { ok: false, error: String(err.message || err), site: msg.payload?.site, at: Date.now() } });
      sendResponse({ ok: false });
    });
    return true;
  } else if (msg?.type === 'agenteeq:handoff' && typeof msg.site === 'string') {
    takeHandoff(msg.site).then(sendResponse, () => sendResponse({ prompt: null }));
    return true;
  } else if (msg?.type === 'agenteeq:pair' && typeof msg.code === 'string') {
    pair(msg.code.trim()).then(() => hello()).then(() => sendResponse({ ok: true }), (err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  } else if (msg?.type === 'agenteeq:prehled') {
    prehled().then(sendResponse, () => sendResponse(null));
    return true;
  } else if (msg?.type === 'agenteeq:hello') {
    hello({ hned: true }).then(sendResponse, () => sendResponse({ paired: false }));
    return true;
  }
});
