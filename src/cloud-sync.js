// Synchronizace souhrnů do účtu Agenteeq (docs/ACCOUNTS.md, „Synchronizace souhrnů“).
//
// Jen když je člověk přihlášený a sám ji zapnul (profiles.sync_enabled). Posílají se čísla:
// tokeny po dnech, útrata po měsících, limity, počty agentů podle stavu a které služby jsou napojené.
// Nikdy text konverzací, jejich názvy, cesty ke složkám, poznámky k výdajům ani hlášky limitů.
// Každý řádek projde seznamem povolených polí (POVOLENA) – co v něm není, do cloudu neodejde,
// i kdyby to sem někdo omylem přidal. Tabulky v databázi textový sloupec pro obsah nemají.
import os from 'node:os';
import { SYSTEM_UCTU } from './platform.js';

const INTERVAL_MS = 5 * 60 * 1000;
const CASOVY_LIMIT_MS = 20000;
const DNI_ZPET = 35;
const ID = /^[a-z0-9-]{2,40}$/;

export const POVOLENA = {
  devices: ['name', 'platform', 'app_version', 'last_seen_at'],
  usage_daily: ['device_id', 'day', 'provider', 'tokens', 'sessions'],
  spend_monthly: ['device_id', 'month', 'service', 'kind', 'currency', 'amount'],
  limits: ['device_id', 'provider', 'window_key', 'used_pct', 'reached', 'resets_at', 'measured_at'],
  agent_status: ['device_id', 'working', 'needs_you', 'waiting', 'failed'],
  connections: ['device_id', 'provider', 'kind', 'plan', 'state', 'connected_at'],
};
const KONFLIKT = {
  usage_daily: 'device_id,day,provider',
  spend_monthly: 'device_id,month,service,kind,currency',
  limits: 'device_id,provider,window_key',
  agent_status: 'device_id',
  connections: 'device_id,provider',
};

export function jenPovolena(tabulka, radek) {
  const out = {};
  for (const k of POVOLENA[tabulka]) if (radek[k] !== undefined) out[k] = radek[k];
  return out;
}

const iso = (ts) => (Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString() : null);
const idCloudu = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// Tokeny po dnech (UTC) a poskytovatelích z hodinových součtů konverzací (vstup + výstup).
export function tokenyPoDnech(sessions, now = Date.now(), dni = DNI_ZPET) {
  const od = new Date(now - dni * 86400000).toISOString().slice(0, 10);
  const mapa = new Map();
  for (const s of sessions) {
    const provider = idCloudu(s.provider);
    if (!ID.test(provider)) continue;
    const dnyKonverzace = new Set();
    for (const [hodina, pocet] of Object.entries(s.hourly || {})) {
      const day = hodina.slice(0, 10);
      if (day < od || !(pocet > 0)) continue;
      const k = `${day}|${provider}`;
      const r = mapa.get(k) || mapa.set(k, { day, provider, tokens: 0, sessions: 0 }).get(k);
      r.tokens += Math.round(pocet);
      if (!dnyKonverzace.has(day)) {
        dnyKonverzace.add(day);
        r.sessions += 1;
      }
    }
  }
  return [...mapa.values()].sort((a, b) => a.day.localeCompare(b.day) || a.provider.localeCompare(b.provider));
}

// Útrata po měsících, službách a druzích v měně, kterou aplikace ukazuje. Poznámky se neberou.
export function utrataPoMesicich(zaznamy, { mesice, prevod, mena }) {
  const mapa = new Map();
  for (const e of zaznamy) {
    if (typeof e?.date !== 'string') continue;
    const service = idCloudu(e.service);
    const kind = ['subscription', 'extra', 'credits', 'api'].includes(e.kind) ? e.kind : 'other';
    if (!ID.test(service)) continue;
    const start = e.date.slice(0, 7);
    const konec = e.recurring === 'monthly' ? (e.endDate ? e.endDate.slice(0, 7) : '9999-12') : start;
    for (const m of mesice) {
      if (m < start || m > konec) continue;
      if (e.recurring !== 'monthly' && m !== start) continue;
      const k = `${m}|${service}|${kind}`;
      const r = mapa.get(k) || mapa.set(k, { month: `${m}-01`, service, kind, currency: mena, amount: 0 }).get(k);
      r.amount += prevod(e);
    }
  }
  return [...mapa.values()].map((r) => ({ ...r, amount: Math.round(r.amount * 100) / 100 })).filter((r) => r.amount > 0);
}

export function limityProCloud(limity) {
  return limity
    .map((l) => ({
      provider: idCloudu(l.provider),
      window_key: idCloudu(String(l.id || '').split(':').slice(-2).join('-')).slice(0, 24) || 'okno',
      used_pct: Number.isFinite(l.usedPercent) ? Math.max(0, Math.min(100, Math.round(l.usedPercent * 100) / 100)) : null,
      reached: Boolean(l.reached),
      resets_at: iso(l.resetsAt),
      measured_at: iso(l.at),
    }))
    .filter((l) => ID.test(l.provider) && l.measured_at);
}

export function agentiProCloud(sessions) {
  const n = { working: 0, needs_you: 0, waiting: 0, failed: 0 };
  for (const s of sessions) {
    if (s.status === 'working') n.working += 1;
    else if (s.status === 'needs_input') n.needs_you += 1;
    else if (s.status === 'waiting') n.waiting += 1;
    else if (s.status === 'failed') n.failed += 1;
  }
  return n;
}

export function napojeniProCloud(konektory) {
  return konektory
    .filter((c) => c.state && c.state !== 'missing' && c.state !== 'unavailable' && ID.test(c.id))
    .map((c) => ({
      provider: c.id,
      kind: c.id === 'web' ? 'web' : c.id === 'cloud-billing' ? 'api' : 'agent',
      plan: null,
      state: c.state === 'error' ? 'error' : 'connected',
      connected_at: iso(c.lastEventAt),
    }));
}

export function createCloudSync({ config, ucet, datastore, zdroje, verze, fetchImpl = (...a) => fetch(...a), now = Date.now, emit = () => {} }) {
  const cfg = config.ucet;
  let zapnuto = datastore.data.cloud?.syncEnabled === true;
  let posledni = datastore.data.cloud?.syncAt || 0;
  let chyba = '';
  let odeslano = null;
  let bezi = null;
  let casovac = null;

  const status = () => ({ zapnuto, posledni, chyba, odeslano });
  const ohlas = () => emit(status());
  const ulozMistne = () => {
    datastore.data.cloud = { ...(datastore.data.cloud || {}), syncEnabled: zapnuto, syncAt: posledni };
    datastore.save();
  };

  async function volej(cesta, { method = 'GET', body, token, prefer } = {}) {
    let res;
    try {
      res = await fetchImpl(`${cfg.url}${cesta}`, {
        method,
        headers: {
          apikey: cfg.klic,
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(prefer ? { Prefer: prefer } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(CASOVY_LIMIT_MS),
      });
    } catch {
      throw Object.assign(new Error('Server účtů neodpovídá. Souhrny se pošlou při dalším pokusu.'), { sit: true });
    }
    let json = null;
    try { json = await res.json(); } catch { /* prázdná odpověď */ }
    if (!res.ok) throw Object.assign(new Error(String(json?.message || `Chyba ${res.status}`)), { status: res.status });
    return json;
  }

  // Zařízení se v účtu založí jednou; jeho id patří k uživateli, ne k Macu obecně.
  async function zarizeni(token, uzivatel) {
    const ulozene = datastore.data.cloud?.devices?.[uzivatel];
    const popis = { name: (os.hostname().replace(/\.local$/, '') || 'Mac').slice(0, 80), platform: SYSTEM_UCTU, app_version: verze, last_seen_at: new Date(now()).toISOString() };
    if (ulozene) {
      const r = await volej(`/rest/v1/devices?id=eq.${encodeURIComponent(ulozene)}`, { method: 'PATCH', token, body: jenPovolena('devices', popis), prefer: 'return=representation' });
      if (Array.isArray(r) && r.length) return ulozene;
    }
    const [novy] = await volej('/rest/v1/devices', { method: 'POST', token, body: jenPovolena('devices', popis), prefer: 'return=representation' });
    datastore.data.cloud = { ...(datastore.data.cloud || {}), devices: { ...(datastore.data.cloud?.devices || {}), [uzivatel]: novy.id } };
    datastore.save();
    return novy.id;
  }

  function data(deviceId) {
    const s = zdroje.sessions();
    const pridej = (tabulka, radky) => radky.map((r) => jenPovolena(tabulka, { ...r, device_id: deviceId }));
    return {
      usage_daily: pridej('usage_daily', tokenyPoDnech(s, now())),
      spend_monthly: pridej('spend_monthly', zdroje.utrata()),
      limits: pridej('limits', limityProCloud(zdroje.limity())),
      agent_status: pridej('agent_status', [agentiProCloud(s)]),
      connections: pridej('connections', napojeniProCloud(zdroje.konektory())),
    };
  }

  function synchronizuj() {
    if (bezi) return bezi;
    bezi = (async () => {
      if (!cfg || !zapnuto) return status();
      const token = await ucet.pristup();
      const uzivatel = ucet.uzivatelId();
      if (!token || !uzivatel) return status();
      try {
        const deviceId = await zarizeni(token, uzivatel);
        const balik = data(deviceId);
        for (const [tabulka, radky] of Object.entries(balik)) {
          if (!radky.length) continue;
          await volej(`/rest/v1/${tabulka}?on_conflict=${KONFLIKT[tabulka]}`, { method: 'POST', token, body: radky, prefer: 'resolution=merge-duplicates,return=minimal' });
        }
        posledni = now();
        chyba = '';
        odeslano = Object.fromEntries(Object.entries(balik).map(([t, r]) => [t, r.length]));
        ulozMistne();
      } catch (err) {
        chyba = err.message;
      }
      ohlas();
      return status();
    })().finally(() => { bezi = null; });
    return bezi;
  }

  // Zapnutí a vypnutí je volba v účtu (profiles.sync_enabled), aby platila na všech zařízeních.
  async function nastav(hodnota) {
    const token = await ucet.pristup();
    const uzivatel = ucet.uzivatelId();
    if (!token || !uzivatel) throw Object.assign(new Error('Pro synchronizaci se nejdřív přihlas.'), { status: 401 });
    await volej(`/rest/v1/profiles?id=eq.${encodeURIComponent(uzivatel)}`, { method: 'PATCH', token, body: { sync_enabled: Boolean(hodnota) }, prefer: 'return=minimal' });
    // Vypnutí souhrny z účtu smaže (všech zařízení – volba platí pro celý účet). Zařízení zůstanou.
    if (!hodnota) {
      for (const tabulka of Object.keys(KONFLIKT)) {
        await volej(`/rest/v1/${tabulka}?user_id=eq.${encodeURIComponent(uzivatel)}`, { method: 'DELETE', token, prefer: 'return=minimal' });
      }
      posledni = 0;
      odeslano = null;
    }
    zapnuto = Boolean(hodnota);
    chyba = '';
    ulozMistne();
    ohlas();
    if (zapnuto) await synchronizuj();
    return status();
  }

  // Po přihlášení se volba načte z účtu – na jiném Macu mohla být zapnutá.
  async function nactiVolbu() {
    const token = await ucet.pristup();
    const uzivatel = ucet.uzivatelId();
    if (!token || !uzivatel) return;
    try {
      const [p] = await volej(`/rest/v1/profiles?id=eq.${encodeURIComponent(uzivatel)}&select=sync_enabled`, { token });
      if (p && typeof p.sync_enabled === 'boolean' && p.sync_enabled !== zapnuto) {
        zapnuto = p.sync_enabled;
        ulozMistne();
        ohlas();
      }
    } catch { /* bez spojení zůstává poslední známá volba */ }
  }

  function start() {
    if (!cfg) return;
    casovac = setInterval(() => { synchronizuj().catch(() => {}); }, INTERVAL_MS);
    casovac.unref?.();
  }

  function stop() {
    clearInterval(casovac);
  }

  // Náhled přesně toho, co by odešlo – rozhraní ho ukazuje v „Co přesně posíláme“.
  function nahled() {
    return data('(id tohoto Macu v účtu)');
  }

  return { status, start, stop, synchronizuj, nastav, nactiVolbu, nahled };
}
