// Synchronizace souhrnů do účtu Agenteeq (docs/ACCOUNTS.md, „Synchronizace souhrnů“).
//
// Jen když je člověk přihlášený a sám ji zapnul (profiles.sync_enabled). Posílají se čísla:
// tokeny po dnech, útrata po měsících, limity, počty agentů podle stavu a které služby jsou napojené.
// Nikdy text konverzací, jejich názvy, cesty ke složkám, poznámky k výdajům ani hlášky limitů.
// Každý řádek projde seznamem povolených polí (POVOLENA) – co v něm není, do cloudu neodejde,
// i kdyby to sem někdo omylem přidal. Tabulky v databázi textový sloupec pro obsah nemají.
import os from 'node:os';
import { SYSTEM_UCTU, POCITAC } from './platform.js';
import { ui } from './texty.js';
import { hourKeyTs, localDay } from './util.js';
import { uplnychDni } from './historie.js';

const INTERVAL_MS = 5 * 60 * 1000;
const CASOVY_LIMIT_MS = 20000;
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

// Tokeny po dnech a poskytovatelích z hodinových součtů konverzací (vstup + výstup).
// `day` je MÍSTNÍ kalendářní den tohoto počítače – stejný „dnes“, jaký ukazuje aplikace. Hodinové
// přihrádky jsou v UTC; každá hodina se přiřadí ke dni podle místního času svého začátku. Dřív se
// bral den UTC, takže v Praze práce mezi půlnocí a 1:00 (v létě 2:00) spadla do včerejška.
//
// Posílají se jen dny, za které má Mac úplná data (`dni` posledních dní včetně dneška, src/historie.js):
// konverzace starší než sledované okno už v paměti nejsou a den na hraně by se poslal menší, než byl.
// Upsert by jím v účtu přepsal pravdivé číslo poslané dřív.
export function tokenyPoDnech(sessions, now = Date.now(), dni = uplnychDni(30)) {
  const d = new Date(now);
  const od = localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (dni - 1)).getTime());
  const mapa = new Map();
  for (const s of sessions) {
    const provider = idCloudu(s.provider);
    if (!ID.test(provider)) continue;
    const dnyKonverzace = new Set();
    for (const [hodina, pocet] of Object.entries(s.hourly || {})) {
      const ts = hourKeyTs(hodina);
      if (!Number.isFinite(ts) || !(pocet > 0)) continue;
      const day = localDay(ts);
      if (day < od) continue;
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
  // Volba změněná na Macu, kterou se ještě nepodařilo zapsat do účtu (výpadek sítě při přihlášení,
  // nebo se tento počítač ještě nepodařilo v účtu založit). Dokud ji účet nemá, načtení z účtu ji
  // nepřepíše a zapíše se s příští synchronizací. Pamatuje se i přes restart (src/datastore.js).
  let volbaCeka = datastore.data.cloud?.volbaCeka === true;
  let posledni = datastore.data.cloud?.syncAt || 0;
  let chyba = '';
  let odeslano = null;
  let bezi = null;
  let casovac = null;

  // Je tento počítač v účtu přihlášeného uživatele založený? Bez zařízení se do účtu nic nezapíše
  // a web by ukázal „0 zařízení“ – rozhraní proto říká obojí zvlášť.
  const mojeZarizeni = () => {
    const u = ucet.uzivatelId?.();
    return u ? datastore.data.cloud?.devices?.[u] || null : null;
  };
  const status = () => ({ zapnuto, posledni, chyba, odeslano, zarizeni: Boolean(mojeZarizeni()), volbaCeka });
  const ohlas = () => emit(status());
  const ulozMistne = () => {
    datastore.data.cloud = { ...(datastore.data.cloud || {}), syncEnabled: zapnuto, syncAt: posledni, volbaCeka };
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
      throw Object.assign(new Error(ui('Server účtů neodpovídá. Souhrny se pošlou při dalším pokusu.')), { sit: true });
    }
    let json = null;
    try { json = await res.json(); } catch { /* prázdná odpověď */ }
    if (!res.ok) throw Object.assign(new Error(String(json?.message || ui('Chyba {0}', res.status))), { status: res.status });
    return json;
  }

  // Zařízení se v účtu založí jednou; jeho id patří k uživateli, ne k Macu obecně. Selhání se hlásí
  // vlastní větou – „synchronizace zapnutá, ale 0 zařízení“ je přesně stav, který nesmí zůstat
  // neviditelný. Výpadek sítě zůstává výpadkem sítě (zkusí se znovu), ne „nepodařilo se přidat“.
  async function zarizeni(token, uzivatel) {
    const ulozene = datastore.data.cloud?.devices?.[uzivatel];
    const popis = { name: (os.hostname().replace(/\.local$/, '') || 'Mac').slice(0, 80), platform: SYSTEM_UCTU, app_version: verze, last_seen_at: new Date(now()).toISOString() };
    try {
      if (ulozene) {
        const r = await volej(`/rest/v1/devices?id=eq.${encodeURIComponent(ulozene)}`, { method: 'PATCH', token, body: jenPovolena('devices', popis), prefer: 'return=representation' });
        if (Array.isArray(r) && r.length) return ulozene;
      }
      const odpoved = await volej('/rest/v1/devices', { method: 'POST', token, body: jenPovolena('devices', popis), prefer: 'return=representation' });
      const novy = Array.isArray(odpoved) ? odpoved[0] : null;
      if (!novy?.id) throw Object.assign(new Error(ui('Server účtů nevrátil id zařízení.')), { status: 502 });
      datastore.data.cloud = { ...(datastore.data.cloud || {}), devices: { ...(datastore.data.cloud?.devices || {}), [uzivatel]: novy.id } };
      datastore.save();
      return novy.id;
    } catch (err) {
      if (err.sit || err.status === 401) throw err;
      throw Object.assign(new Error(ui('{0} se nepodařilo přidat do účtu: {1}', POCITAC.Tento, err.message)), { status: err.status || 502, zarizeni: true });
    }
  }

  function data(deviceId) {
    const s = zdroje.sessions();
    const pridej = (tabulka, radky) => radky.map((r) => jenPovolena(tabulka, { ...r, device_id: deviceId }));
    return {
      usage_daily: pridej('usage_daily', tokenyPoDnech(s, now(), uplnychDni(config.windowDays || 30))),
      spend_monthly: pridej('spend_monthly', zdroje.utrata()),
      limits: pridej('limits', limityProCloud(zdroje.limity())),
      agent_status: pridej('agent_status', [agentiProCloud(s)]),
      connections: pridej('connections', napojeniProCloud(zdroje.konektory())),
    };
  }

  // Řádky, které tento počítač v účtu má, ale teď už by je neposlal: útrata ve staré měně (po změně
  // měny aplikace by web sečetl obě), služba s odebraným klíčem, limit, který zdroj přestal hlásit,
  // zdroj, který už není napojený. Upsert řádky jen přepisuje, nemaže – bez úklidu by na webu zůstala
  // stará čísla, jako by platila. Tokeny po dnech se neuklízejí: den, který Mac už nevidí, je pořád
  // pravdivá historie. Útrata se uklízí jen v měsících, které Mac počítá (zdroje.mesiceUtraty).
  async function uklid(token, deviceId, balik) {
    const mesice = (zdroje.mesiceUtraty?.() || []).map((m) => `${m}-01`).sort();
    const tabulky = {
      spend_monthly: { klice: ['month', 'service', 'kind', 'currency'], filtr: mesice.length ? `&month=gte.${mesice[0]}` : null },
      limits: { klice: ['provider', 'window_key'], filtr: '' },
      connections: { klice: ['provider'], filtr: '' },
    };
    for (const [tabulka, { klice, filtr }] of Object.entries(tabulky)) {
      if (filtr === null) continue;
      const klic = (r) => klice.map((k) => String(r[k])).join('|');
      const ted = new Set(balik[tabulka].map(klic));
      const vUctu = await volej(`/rest/v1/${tabulka}?device_id=eq.${encodeURIComponent(deviceId)}&select=${klice.join(',')}${filtr}`, { token });
      for (const r of Array.isArray(vUctu) ? vUctu : []) {
        if (ted.has(klic(r))) continue;
        const podminka = klice.map((k) => `&${k}=eq.${encodeURIComponent(String(r[k]))}`).join('');
        await volej(`/rest/v1/${tabulka}?device_id=eq.${encodeURIComponent(deviceId)}${podminka}`, { method: 'DELETE', token, prefer: 'return=minimal' });
      }
    }
  }

  // Výsledek nese `ok`: rozhraní ani tlačítko „Synchronizovat teď“ nesmí ohlásit úspěch, když se nic
  // neposlalo. `duvod` rozliší „vypnuto“ a „nepřihlášeno“ (nic se neposílá schválně) od chyby.
  function synchronizuj() {
    if (bezi) return bezi;
    bezi = (async () => {
      if (!cfg) return { ...status(), ok: false, duvod: 'nenastaveno' };
      if (!zapnuto) return { ...status(), ok: false, duvod: 'vypnuto' };
      const uzivatel = ucet.uzivatelId();
      if (!uzivatel) return { ...status(), ok: false, duvod: 'neprihlaseno' };
      let ok = false;
      // Server může token odmítnout dřív, než podle hodin Macu vyprší (401) – pak se jednou obnoví
      // a celé odeslání zopakuje. Upsert je idempotentní, opakování nic nezdvojí.
      for (let pokus = 0; pokus < 2; pokus += 1) {
        const token = await ucet.pristup({ vynutit: pokus > 0 });
        if (!token) {
          chyba = ui('Přihlášení k účtu se teď nepodařilo ověřit. Souhrny se pošlou, až bude spojení.');
          break;
        }
        try {
          // Pořadí je podstatné: nejdřív tento počítač v účtu, teprve potom volba „zapnuto“.
          // Obráceně zůstal účet při chybě zařízení zapnutý s nulou zařízení.
          const deviceId = await zarizeni(token, uzivatel);
          if (volbaCeka) await zapisVolbu(token, uzivatel);
          const balik = data(deviceId);
          for (const [tabulka, radky] of Object.entries(balik)) {
            if (!radky.length) continue;
            await volej(`/rest/v1/${tabulka}?on_conflict=${KONFLIKT[tabulka]}`, { method: 'POST', token, body: radky, prefer: 'resolution=merge-duplicates,return=minimal' });
          }
          await uklid(token, deviceId, balik);
          posledni = now();
          chyba = '';
          odeslano = Object.fromEntries(Object.entries(balik).map(([t, r]) => [t, r.length]));
          ulozMistne();
          ok = true;
          break;
        } catch (err) {
          chyba = err.message;
          if (err.status !== 401) break;
        }
      }
      ohlas();
      return { ...status(), ok };
    })().finally(() => { bezi = null; });
    return bezi;
  }

  async function zapisVolbu(token, uzivatel) {
    await volej(`/rest/v1/profiles?id=eq.${encodeURIComponent(uzivatel)}`, { method: 'PATCH', token, body: { sync_enabled: zapnuto }, prefer: 'return=minimal' });
    volbaCeka = false;
    ulozMistne();
  }

  // Přihlášení přes Google synchronizaci zapne (rozhodnutí vlastníka 4. 10. 2026; docs/ACCOUNTS.md).
  // Platí hned na tomto Macu, i když účet zrovna neodpovídá – volba se do účtu dopíše při příští
  // synchronizaci, ale až po založení tohoto počítače v účtu. Kdo ji pak vypne, má ji vypnutou až
  // do dalšího přihlášení.
  async function zapnoutPoPrihlaseni() {
    if (!cfg) return status();
    zapnuto = true;
    volbaCeka = true;
    chyba = '';
    ulozMistne();
    ohlas();
    return synchronizuj();
  }

  // Zapnutí a vypnutí je volba v účtu (profiles.sync_enabled), aby platila na všech zařízeních.
  async function nastav(hodnota) {
    const token = await ucet.pristup();
    const uzivatel = ucet.uzivatelId();
    if (!token || !uzivatel) throw Object.assign(new Error(ui('Pro synchronizaci se nejdřív přihlas.')), { status: 401 });
    if (hodnota) {
      // Nejdřív tento počítač v účtu. Když se ho založit nepodaří, volba se nezapne – chyba se vrátí
      // a přepínač zůstane vypnutý, místo aby web ukázal zapnutou synchronizaci s nulou zařízení.
      await zarizeni(token, uzivatel);
      await volej(`/rest/v1/profiles?id=eq.${encodeURIComponent(uzivatel)}`, { method: 'PATCH', token, body: { sync_enabled: true }, prefer: 'return=minimal' });
      zapnuto = true;
      volbaCeka = false;
      chyba = '';
      ulozMistne();
      ohlas();
      return synchronizuj();
    }
    await volej(`/rest/v1/profiles?id=eq.${encodeURIComponent(uzivatel)}`, { method: 'PATCH', token, body: { sync_enabled: false }, prefer: 'return=minimal' });
    // Vypnutí souhrny z účtu smaže (všech zařízení – volba platí pro celý účet). Zařízení zůstanou.
    for (const tabulka of Object.keys(KONFLIKT)) {
      await volej(`/rest/v1/${tabulka}?user_id=eq.${encodeURIComponent(uzivatel)}`, { method: 'DELETE', token, prefer: 'return=minimal' });
    }
    posledni = 0;
    odeslano = null;
    zapnuto = false;
    volbaCeka = false;
    chyba = '';
    ulozMistne();
    ohlas();
    return status();
  }

  // Po přihlášení se volba načte z účtu – na jiném Macu mohla být zapnutá.
  async function nactiVolbu() {
    const token = await ucet.pristup();
    const uzivatel = ucet.uzivatelId();
    if (!token || !uzivatel) return;
    if (volbaCeka) return;
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

  // Náhled přesně toho, co by odešlo – rozhraní ho ukazuje v „Co přesně se posílá“.
  function nahled() {
    return data(ui('(id {0} v účtu)', POCITAC.tohoto));
  }

  return { status, start, stop, synchronizuj, nastav, nactiVolbu, zapnoutPoPrihlaseni, nahled };
}
