// Účet Agenteeq: přihlášení přes Google (Supabase Auth) z aplikace na Macu.
//
// Průběh (docs/ACCOUNTS.md):
//   1. Klepnutí na „Přihlásit se přes Google“ → server vyrobí jednorázový klíč PKCE a náhodný
//      identifikátor pokusu a otevře v prohlížeči stránku Supabase → Google.
//   2. Google vrátí prohlížeč na http://127.0.0.1:<port>/ucet/navrat/<pokus>?code=… (tento Mac).
//   3. Server kód vymění za tokeny – jen on zná ověřovač PKCE, takže cizí kód ani cizí adresa nic
//      nezmůžou – a obnovovací token uloží do Klíčenky. Přístupový token drží jen v paměti.
//   4. Aplikace dostane událost „ucet“ a ukáže potvrzení.
//
// Z účtu se v paměti drží jen to, co rozhraní ukazuje: jméno a e-mail. Bez přihlášení Agenteeq
// funguje dál celý; účet nic nezamyká.
import crypto from 'node:crypto';

const PLATNOST_POKUSU_MS = 10 * 60 * 1000;
const MAX_POKUSU = 3;
const OBNOVIT_PRED_KONCEM_MS = 5 * 60 * 1000;
const ZKUSIT_ZNOVU_MS = 5 * 60 * 1000;
const CASOVY_LIMIT_MS = 15000;
const POKUS = /^[A-Za-z0-9_-]{43}$/;

export const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Ověřovač a výzva PKCE (RFC 7636, metoda S256).
export function pkcePar(randomBytes = crypto.randomBytes) {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// Z odpovědi Supabase si bereme jen to, co ukazujeme. Metadata z Googlu jsou nedůvěryhodný vstup.
export function uzivatelZOdpovedi(user) {
  if (!user || typeof user !== 'object') return null;
  const meta = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const email = text(user.email, 254);
  return { id: text(user.id, 64), email, jmeno: text(meta.full_name || meta.name, 120) || email.split('@')[0] || '' };
}

class UcetChyba extends Error {
  constructor(message, { sit = false, status = 0, kod = '' } = {}) {
    super(message);
    this.sit = sit;
    this.status = status;
    this.kod = kod;
  }
}

export function createUcet({ config, secrets, emit = () => {}, open = async () => ({ ok: false }), fetchImpl = (...a) => fetch(...a), now = Date.now }) {
  const cfg = config.ucet;
  const pokusy = new Map();
  let relace = null; // { access, expiresAt, refresh }
  let uzivatel = null;
  let stav = cfg ? 'odhlaseno' : 'nenastaveno';
  let chyba = '';
  let trvale = false;
  let obnova = null;
  let casovac = null;

  const status = () => ({
    stav,
    ceka: [...pokusy.values()].some((p) => now() - p.at < PLATNOST_POKUSU_MS),
    jmeno: uzivatel?.jmeno || '',
    email: uzivatel?.email || '',
    chyba,
    trvale,
  });
  const ohlas = (udalost = null) => emit({ ...status(), ...(udalost ? { udalost } : {}) });

  async function volej(cesta, { method = 'GET', body, token } = {}) {
    let res;
    try {
      res = await fetchImpl(`${cfg.url}${cesta}`, {
        method,
        headers: {
          apikey: cfg.klic,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(CASOVY_LIMIT_MS),
      });
    } catch {
      throw new UcetChyba('Server účtů Agenteeq neodpovídá. Zkontroluj připojení k internetu.', { sit: true });
    }
    let json = null;
    try { json = await res.json(); } catch { /* prázdná odpověď */ }
    if (!res.ok) {
      const kod = String(json?.error_code || json?.error || json?.code || '');
      throw new UcetChyba(String(json?.error_description || json?.msg || json?.message || `Chyba ${res.status}`), { status: res.status, kod });
    }
    return json;
  }

  async function ulozRelaci(odpoved) {
    if (!odpoved?.access_token || !odpoved?.refresh_token) throw new UcetChyba('Server účtů vrátil neúplné přihlášení.');
    relace = {
      access: odpoved.access_token,
      refresh: odpoved.refresh_token,
      expiresAt: odpoved.expires_at ? odpoved.expires_at * 1000 : now() + (Number(odpoved.expires_in) || 3600) * 1000,
    };
    const u = uzivatelZOdpovedi(odpoved.user);
    if (u) uzivatel = u;
    stav = 'prihlaseno';
    chyba = '';
    // Obnovovací token se při každé obnově mění, takže se ukládá pokaždé znovu. Bez Klíčenky
    // (Linux, Windows, spuštění z Terminálu) zůstane přihlášení jen do konce běhu aplikace.
    try {
      await secrets.set('ucet', relace.refresh);
      trvale = true;
    } catch {
      trvale = false;
    }
  }

  async function zapomen() {
    relace = null;
    uzivatel = null;
    trvale = false;
    await secrets.remove('ucet').catch(() => {});
  }

  // Obnova přihlášení. Výpadek sítě není odhlášení: token zůstává a zkusí se to znovu.
  // Odmítnutý token (odhlášeno jinde, smazaný účet) znamená skutečné odhlášení.
  function obnov() {
    if (obnova) return obnova;
    obnova = (async () => {
      const refresh = relace?.refresh || await secrets.get('ucet').catch(() => null);
      if (!refresh) {
        stav = 'odhlaseno';
        return false;
      }
      try {
        await ulozRelaci(await volej('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refresh } }));
        return true;
      } catch (err) {
        if (err.sit || err.status >= 500) {
          if (!relace) relace = { access: '', refresh, expiresAt: 0 };
          stav = 'nedostupne';
          chyba = err.message;
        } else {
          await zapomen();
          stav = 'odhlaseno';
          chyba = 'Přihlášení vypršelo. Přihlas se znovu.';
        }
        return false;
      }
    })().finally(() => { obnova = null; });
    return obnova;
  }

  async function start() {
    if (!cfg) return;
    const meli = Boolean(await secrets.get('ucet').catch(() => null));
    if (meli) {
      stav = 'overuji';
      await obnov();
      ohlas();
    }
    casovac = setInterval(() => {
      const zmena = stav === 'nedostupne' || (relace && relace.expiresAt - now() < OBNOVIT_PRED_KONCEM_MS);
      if (!zmena) return;
      const pred = JSON.stringify(status());
      obnov().then(() => { if (JSON.stringify(status()) !== pred) ohlas(); }).catch(() => {});
    }, ZKUSIT_ZNOVU_MS);
    casovac.unref?.();
  }

  function stop() {
    clearInterval(casovac);
  }

  // Platný přístupový token pro další volání (synchronizace). Bez přihlášení null.
  async function pristup() {
    if (!relace) return null;
    if (relace.expiresAt - now() < OBNOVIT_PRED_KONCEM_MS) await obnov();
    return stav === 'prihlaseno' ? relace.access : null;
  }

  async function zacniPrihlaseni({ port }) {
    if (!cfg) throw new UcetChyba('Účty v téhle instalaci nejsou zapnuté.', { status: 404 });
    // Nejdřív se zeptat, jestli přihlášení přes Google na serveru účtů vůbec běží. Poslat člověka
    // na chybovou stránku Supabase by vypadalo jako rozbitá aplikace.
    const nastaveni = await volej('/auth/v1/settings');
    if (!nastaveni?.external?.google) throw new UcetChyba('Přihlášení přes Google se na serveru Agenteeq ještě nastavuje. Zkus to prosím později.', { status: 503 });
    for (const [id, p] of pokusy) if (now() - p.at >= PLATNOST_POKUSU_MS) pokusy.delete(id);
    while (pokusy.size >= MAX_POKUSU) pokusy.delete(pokusy.keys().next().value);
    const pokus = b64url(crypto.randomBytes(32));
    const { verifier, challenge } = pkcePar();
    pokusy.set(pokus, { verifier, at: now() });
    const navrat = `http://127.0.0.1:${port}/ucet/navrat/${pokus}`;
    const url = `${cfg.url}/auth/v1/authorize?${new URLSearchParams({ provider: 'google', redirect_to: navrat, code_challenge: challenge, code_challenge_method: 's256' })}`;
    chyba = '';
    const otevreno = await open(url).catch(() => ({ ok: false }));
    ohlas();
    return { url, otevreno: Boolean(otevreno?.ok) };
  }

  // Návrat z prohlížeče. Pokus platí jednou; bez něj (nebo po vypršení) se nic nevyměňuje.
  async function navrat(pokus, { code = '', chyba: chybaZProhlizece = '' } = {}) {
    const p = POKUS.test(pokus) ? pokusy.get(pokus) : null;
    if (p) pokusy.delete(pokus);
    if (!p || now() - p.at >= PLATNOST_POKUSU_MS) {
      return { ok: false, zprava: 'Tohle přihlášení už neplatí. Začni znovu v Agenteeq.' };
    }
    if (chybaZProhlizece || !code) {
      chyba = chybaZProhlizece ? `Přihlášení se nepovedlo: ${String(chybaZProhlizece).slice(0, 200)}` : 'Přihlášení se nepovedlo. Zkus to znovu.';
      ohlas('chyba');
      return { ok: false, zprava: chyba };
    }
    try {
      await ulozRelaci(await volej('/auth/v1/token?grant_type=pkce', { method: 'POST', body: { auth_code: code, code_verifier: p.verifier } }));
    } catch (err) {
      chyba = err.sit ? err.message : 'Přihlášení se nepovedlo ověřit. Zkus to znovu.';
      ohlas('chyba');
      return { ok: false, zprava: chyba };
    }
    ohlas('prihlaseno');
    return { ok: true, jmeno: uzivatel?.jmeno || '' };
  }

  // Zavření čekajícího přihlášení (člověk si to rozmyslel). Už vydaný odkaz pak nic nepřihlásí.
  function zrusit() {
    pokusy.clear();
    ohlas();
    return status();
  }

  async function odhlasit() {
    const token = relace?.access;
    if (token) await volej('/auth/v1/logout?scope=local', { method: 'POST', token }).catch(() => {});
    await zapomen();
    stav = cfg ? 'odhlaseno' : 'nenastaveno';
    chyba = '';
    pokusy.clear();
    ohlas('odhlaseno');
    return status();
  }

  // Smazání účtu i všech dat v cloudu (databáze je smaže kaskádou). Na Macu se nic nemaže.
  async function smazat() {
    const token = await pristup();
    if (!token) throw new UcetChyba('Pro smazání účtu se nejdřív přihlas.', { status: 401 });
    await volej('/rest/v1/rpc/smazat_muj_ucet', { method: 'POST', token, body: {} });
    await zapomen();
    stav = 'odhlaseno';
    chyba = '';
    ohlas('smazano');
    return status();
  }

  return { status, start, stop, pristup, uzivatelId: () => (stav === 'prihlaseno' ? uzivatel?.id || null : null), zacniPrihlaseni, navrat, zrusit, odhlasit, smazat, UcetChyba };
}

export { UcetChyba };
