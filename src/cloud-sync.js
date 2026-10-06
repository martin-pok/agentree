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

const INTERVAL_MS = 5 * 60 * 1000;
// Po neúspěšné synchronizaci se nečeká celý interval: 30 s → 1 → 2 → 5 min, úspěch řadu vynuluje.
export const OPAKOVANI_MS = [30e3, 60e3, 120e3, 300e3];
// Změna dat (stav agenta, limit) se pošle nejdřív za minutu – víc změn jde jedním odesláním.
export const PO_ZMENE_MS = 60e3;
const CASOVY_LIMIT_MS = 20000;
const DNI_ZPET = 35;
const ID = /^[a-z0-9-]{2,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Verze aplikace v účtu (devices.app_version). Databáze do migrace 20261005100000 bere jen
// „1.2.3“ – předběžné verze („0.37.0-beta.1“) by založení zařízení odmítla celé. Jiný tvar proto
// odchází jako null („neznámá“), nikdy jako vymyšlené číslo.
const VERZE_UCTU = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
export const verzeProUcet = (v) => (typeof v === 'string' && VERZE_UCTU.test(v) ? v : null);

const POZASTAVENO = () => ui('Synchronizace stojí: {0} není přihlášený k účtu. Přihlas se znovu v Nastavení → Účet a vzhled.', POCITAC.tento);
const PROFIL_CHYBI = () => ui('V účtu chybí profil, takže volbu synchronizace nejde uložit a souhrny se neposílají. Odhlas se a přihlas znovu; když to nepomůže, dej nám vědět.');

// Řádky tohoto zařízení, které Mac přestal hlásit, se z účtu mažou (src/cloud-sync.js#procisti).
// Filtr říká, co ZŮSTANE; prázdný seznam = smazat všechny řádky zařízení v tabulce. Hodnoty jsou
// jen [a-z0-9-] (ID, window_key), do syntaxe PostgREST tedy nic cizího nevnesou.
const PROCISTIT = {
  limits: (radky) => (radky.length ? `not.or=(${radky.map((r) => `and(provider.eq.${r.provider},window_key.eq.${r.window_key})`).join(',')})` : ''),
  connections: (radky) => (radky.length ? `provider=not.in.(${radky.map((r) => r.provider).join(',')})` : ''),
};

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
export function tokenyPoDnech(sessions, now = Date.now(), dni = DNI_ZPET) {
  const d = new Date(now);
  const od = localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dni).getTime());
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

// `casovace`: setTimeout/setInterval a jejich zrušení – testy podstrčí vlastní, aby nečekaly.
export function createCloudSync({ config, ucet, datastore, zdroje, verze, fetchImpl = (...a) => fetch(...a), now = Date.now, emit = () => {}, casovace = globalThis }) {
  const cfg = config.ucet;
  let zapnuto = datastore.data.cloud?.syncEnabled === true;
  // Volba změněná na Macu, kterou se ještě nepodařilo zapsat do účtu (výpadek sítě při přihlášení,
  // nezaložené zařízení). Dokud ji účet nemá, načtení z účtu ji nepřepíše a zapíše se s příští
  // synchronizací – i po restartu aplikace (src/datastore.js#normalizeCloud ji ukládá).
  let volbaCeka = datastore.data.cloud?.volbaCeka === true;
  let posledni = datastore.data.cloud?.syncAt || 0;
  let chyba = '';
  let odeslano = null;
  let bezi = null;
  let casovac = null;
  let spusteno = false;
  let opakovani = null;
  let pokusPoChybe = 0;
  let poZmene = null;

  const status = () => ({ zapnuto, posledni, chyba, odeslano });
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

  // Zařízení se v účtu založí jednou; jeho id patří k uživateli, ne k Macu obecně.
  async function zarizeni(token, uzivatel) {
    const ulozene = datastore.data.cloud?.devices?.[uzivatel];
    const popis = { name: (os.hostname().replace(/\.local$/, '') || 'Mac').slice(0, 80), platform: SYSTEM_UCTU, app_version: verzeProUcet(verze), last_seen_at: new Date(now()).toISOString() };
    if (ulozene) {
      const r = await volej(`/rest/v1/devices?id=eq.${encodeURIComponent(ulozene)}`, { method: 'PATCH', token, body: jenPovolena('devices', popis), prefer: 'return=representation' });
      if (Array.isArray(r) && r.length) return ulozene;
    }
    const r = await volej('/rest/v1/devices', { method: 'POST', token, body: jenPovolena('devices', popis), prefer: 'return=representation' });
    const novy = Array.isArray(r) ? r[0] : null;
    if (!novy || !UUID.test(String(novy.id))) throw new Error(ui('server zařízení nepotvrdil'));
    datastore.data.cloud = { ...(datastore.data.cloud || {}), devices: { ...(datastore.data.cloud?.devices || {}), [uzivatel]: novy.id } };
    datastore.save();
    return novy.id;
  }

  // Zařízení se zakládá dřív než zápis volby i souhrnů: bez řádku v `devices` web ukazuje
  // „0 zařízení“, i když je volba v účtu zapnutá. Selhání má proto vlastní větu.
  async function zarizeniNeboChyba(token, uzivatel) {
    try {
      return await zarizeni(token, uzivatel);
    } catch (err) {
      if (err.status === 401) throw err;
      throw Object.assign(new Error(ui('Do účtu se nepodařilo přidat {0} ({1}), souhrny se proto neposílají. Zkusím to znovu samo; když to nepomůže, odhlas se a přihlas znovu.', POCITAC.tento, err.message)), { status: err.status, sit: err.sit });
    }
  }

  // Volba v účtu (profiles.sync_enabled): true/false, nebo null, když ji odpověď neobsahuje.
  async function volbaVUctu(token, uzivatel) {
    const r = await volej(`/rest/v1/profiles?id=eq.${encodeURIComponent(uzivatel)}&select=sync_enabled`, { token });
    if (Array.isArray(r) && r.length === 0) throw new Error(PROFIL_CHYBI());
    const p = Array.isArray(r) ? r[0] : null;
    return typeof p?.sync_enabled === 'boolean' ? p.sync_enabled : null;
  }

  // return=representation: PATCH bez odpovídajícího řádku projde se 0 řádky – bez kontroly by
  // chybějící profil vypadal jako uložená volba.
  async function zapisVolbuDoProfilu(token, uzivatel, hodnota) {
    const r = await volej(`/rest/v1/profiles?id=eq.${encodeURIComponent(uzivatel)}`, { method: 'PATCH', token, body: { sync_enabled: Boolean(hodnota) }, prefer: 'return=representation' });
    if (!Array.isArray(r) || !r.length) throw new Error(PROFIL_CHYBI());
  }

  async function zapisVolbu(token, uzivatel) {
    await zapisVolbuDoProfilu(token, uzivatel, zapnuto);
    volbaCeka = false;
    ulozMistne();
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

  // Řádky tohoto zařízení, které Mac už nehlásí (zmizelé okno limitu, zrušené napojení), se z účtu
  // smažou – jinak by na webu visely navždy. Jen vlastní device_id a user_id; RLS pustí jen vlastní.
  async function procisti(token, uzivatel, deviceId, balik) {
    for (const [tabulka, filtr] of Object.entries(PROCISTIT)) {
      const zustava = filtr(balik[tabulka]);
      const q = `device_id=eq.${encodeURIComponent(deviceId)}&user_id=eq.${encodeURIComponent(uzivatel)}${zustava ? `&${zustava}` : ''}`;
      await volej(`/rest/v1/${tabulka}?${q}`, { method: 'DELETE', token, prefer: 'return=minimal' });
    }
  }

  function synchronizuj() {
    if (bezi) return bezi;
    bezi = (async () => {
      if (!cfg || !zapnuto) return status();
      const uzivatel = ucet.uzivatelId();
      if (!uzivatel) {
        // Zapnutá synchronizace bez přihlášení nesmí vypadat jako „všechno odesláno“.
        chyba = POZASTAVENO();
        naplanujOpakovani();
        ohlas();
        return status();
      }
      // Server může token odmítnout dřív, než podle hodin Macu vyprší (401) – pak se jednou obnoví
      // a celé odeslání zopakuje. Upsert je idempotentní, opakování nic nezdvojí.
      for (let pokus = 0; pokus < 2; pokus += 1) {
        const token = await ucet.pristup({ vynutit: pokus > 0 });
        if (!token) {
          chyba = POZASTAVENO();
          break;
        }
        try {
          // Volba z účtu při každé synchronizaci: vypnutí na jiném počítači zastaví i tento.
          // Čekající volbu tohoto Macu účet ještě nemá – ta se zapíše níž, až když zařízení existuje.
          if (!volbaCeka && (await volbaVUctu(token, uzivatel)) === false) {
            zapnuto = false;
            chyba = '';
            odeslano = null;
            ulozMistne();
            break;
          }
          const deviceId = await zarizeniNeboChyba(token, uzivatel);
          if (volbaCeka) await zapisVolbu(token, uzivatel);
          const balik = data(deviceId);
          for (const [tabulka, radky] of Object.entries(balik)) {
            if (!radky.length) continue;
            await volej(`/rest/v1/${tabulka}?on_conflict=${KONFLIKT[tabulka]}`, { method: 'POST', token, body: radky, prefer: 'resolution=merge-duplicates,return=minimal' });
          }
          await procisti(token, uzivatel, deviceId, balik);
          posledni = now();
          chyba = '';
          odeslano = Object.fromEntries(Object.entries(balik).map(([t, r]) => [t, r.length]));
          ulozMistne();
          break;
        } catch (err) {
          chyba = err.message || ui('Souhrny se nepodařilo odeslat. Zkusím to znovu samo.');
          if (err.status !== 401) break;
        }
      }
      if (chyba && zapnuto) naplanujOpakovani();
      else zrusOpakovani();
      ohlas();
      return status();
    })().finally(() => { bezi = null; });
    return bezi;
  }

  // Po neúspěchu se to zkusí dřív než za celý interval (OPAKOVANI_MS). Jen v běžící aplikaci.
  function naplanujOpakovani() {
    if (!spusteno || opakovani) return;
    const za = OPAKOVANI_MS[Math.min(pokusPoChybe, OPAKOVANI_MS.length - 1)];
    pokusPoChybe += 1;
    opakovani = casovace.setTimeout(() => { opakovani = null; synchronizuj().catch(() => {}); }, za);
    opakovani?.unref?.();
  }
  function zrusOpakovani() {
    pokusPoChybe = 0;
    if (opakovani) casovace.clearTimeout(opakovani);
    opakovani = null;
  }

  // Změna dat (stav agenta, limit): odeslání nejdřív za PO_ZMENE_MS. Další změny v té době na
  // čas nic nemění, takže ani nepřetržitá práce odeslání neodsune a server účtů se nezahltí.
  function zmena() {
    if (!spusteno || !zapnuto || poZmene || opakovani) return;
    poZmene = casovace.setTimeout(() => { poZmene = null; synchronizuj().catch(() => {}); }, PO_ZMENE_MS);
    poZmene?.unref?.();
  }

  // Přihlášení přes Google synchronizaci zapne (rozhodnutí vlastníka 4. 10. 2026; docs/ACCOUNTS.md).
  // Platí hned na tomto Macu, i když účet zrovna neodpovídá – volba se do účtu dopíše při příští
  // synchronizaci (až po založení zařízení). Kdo ji pak vypne, má ji vypnutou do dalšího přihlášení.
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
    // Zapnutí: nejdřív zařízení, pak volba – jinak by web ukázal zapnutou synchronizaci bez počítače.
    if (hodnota) await zarizeniNeboChyba(token, uzivatel);
    await zapisVolbuDoProfilu(token, uzivatel, hodnota);
    // Vypnutí souhrny z účtu smaže (všech zařízení – volba platí pro celý účet). Zařízení zůstanou.
    if (!hodnota) {
      for (const tabulka of Object.keys(KONFLIKT)) {
        await volej(`/rest/v1/${tabulka}?user_id=eq.${encodeURIComponent(uzivatel)}`, { method: 'DELETE', token, prefer: 'return=minimal' });
      }
      posledni = 0;
      odeslano = null;
      zrusOpakovani();
    }
    zapnuto = Boolean(hodnota);
    volbaCeka = false;
    chyba = '';
    ulozMistne();
    ohlas();
    if (zapnuto) await synchronizuj();
    return status();
  }

  // Po přihlášení se volba načte z účtu – na jiném Macu mohla být zapnutá. Čekající volbu tohoto
  // Macu (i z doby před restartem) nepřepíše: účet ji ještě nemá.
  async function nactiVolbu() {
    const token = await ucet.pristup();
    const uzivatel = ucet.uzivatelId();
    if (!token || !uzivatel) return;
    if (volbaCeka) return;
    try {
      const vUctu = await volbaVUctu(token, uzivatel);
      if (typeof vUctu === 'boolean' && vUctu !== zapnuto) {
        zapnuto = vUctu;
        ulozMistne();
        ohlas();
      }
    } catch { /* bez spojení nebo bez profilu zůstává poslední známá volba; chybu ukáže synchronizace */ }
  }

  function start() {
    if (!cfg) return;
    spusteno = true;
    casovac = casovace.setInterval(() => { synchronizuj().catch(() => {}); }, INTERVAL_MS);
    casovac?.unref?.();
  }

  function stop() {
    spusteno = false;
    casovace.clearInterval(casovac);
    zrusOpakovani();
    if (poZmene) casovace.clearTimeout(poZmene);
    poZmene = null;
  }

  // Náhled přesně toho, co by odešlo – rozhraní ho ukazuje v „Co přesně posíláme“.
  function nahled() {
    return data(ui('(id {0} v účtu)', POCITAC.tohoto));
  }

  return { status, start, stop, synchronizuj, nastav, nactiVolbu, zapnoutPoPrihlaseni, nahled, zmena };
}
