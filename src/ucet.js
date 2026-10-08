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
// Z účtu se drží jen to, co rozhraní ukazuje: jméno, e-mail a profilová fotka. Fotku si Mac stáhne
// od Googlu sám a uloží do své složky dat; rozhraní ji čte jen z tohoto Macu (žádný obrázek
// z cizího serveru, funguje i bez sítě). Bez přihlášení Agenteeq funguje dál celý; účet nic nezamyká.
//
// Spolehlivost přihlášení (docs/ACCOUNTS.md → „Spolehlivost“): odhlásí jen skutečně odmítnutý
// token nebo člověk. Výpadek sítě, přetížený server (429, 5xx), zamčená Klíčenka ani ztracená
// odpověď při obnově jednorázového tokenu přihlášení nesmažou.
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ui } from './texty.js';

const PLATNOST_POKUSU_MS = 10 * 60 * 1000;
const MAX_POKUSU = 3;
const OBNOVIT_PRED_KONCEM_MS = 5 * 60 * 1000;
// Po neúspěšné obnově se zkouší znovu za 30 s, pak za 1, 2, 4 a nejvýš za 5 minut.
const PRVNI_PRODLEVA_MS = 30 * 1000;
const MAX_PRODLEVA_MS = 5 * 60 * 1000;
const TIK_MS = 30 * 1000;
const CASOVY_LIMIT_MS = 15000;
const FOTO_MAX = 300_000;
const FOTO_ZNOVU_MS = 10 * 60 * 1000;
const POKUS = /^[A-Za-z0-9_-]{43}$/;
// Odpovědi, po kterých má smysl to zkusit znovu. Ostatní 4xx u obnovy znamenají neplatný token.
const prechodna = (err) => err.sit || err.docasne || err.status >= 500 || err.status === 429 || err.status === 408;

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
  // Fotka bývá v user_metadata, ale u části účtů ji Supabase nese jen v datech identity Googlu.
  const identita = (Array.isArray(user.identities) ? user.identities : []).find((i) => i?.provider === 'google')?.identity_data;
  const fotoMeta = fotoZMetadat(meta) ? meta : (identita && typeof identita === 'object' ? identita : meta);
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const email = text(user.email, 254);
  // Kdy se člověk naposledy přihlásil a jestli Google e-mail ověřil – podle toho pozná, že je
  // v kartě opravdu on. Obojí posílá server účtů, nic se nedopočítává.
  const prihlasen = Date.parse(typeof user.last_sign_in_at === 'string' ? user.last_sign_in_at : '') || 0;
  const overeno = meta.email_verified === true || (typeof user.email_confirmed_at === 'string' && Boolean(Date.parse(user.email_confirmed_at)));
  return { id: text(user.id, 64), email, jmeno: text(meta.full_name || meta.name, 120) || email.split('@')[0] || '', fotoUrl: fotoZMetadat(fotoMeta), prihlasen, overeno };
}

// Adresa profilové fotky z Googlu. Metadata jsou nedůvěryhodná, proto projde jen https adresa
// na obrázkovém serveru Googlu – server na Macu nikdy nestáhne nic odjinud. Google dává 96 px;
// pro ostré zobrazení na Retině si řekneme o 192 px.
export function fotoZMetadat(meta) {
  const raw = meta?.avatar_url || meta?.picture;
  if (typeof raw !== 'string' || raw.length > 2048) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || !/(^|\.)googleusercontent\.com$/.test(u.hostname) || u.username || u.password || u.port) return '';
    u.pathname = u.pathname.replace(/=s\d+(-[a-z]+)*$/, '=s192-c');
    return u.href;
  } catch {
    return '';
  }
}

// Typ obrázku podle prvních bajtů – hlavičce Content-Type ze sítě se nevěří.
export function typObrazku(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

class UcetChyba extends Error {
  constructor(message, { sit = false, status = 0, kod = '', docasne = false } = {}) {
    super(message);
    this.sit = sit;
    this.docasne = docasne;
    this.status = status;
    this.kod = kod;
  }
}

export function createUcet({ config, secrets, emit = () => {}, open = async () => ({ ok: false }), fetchImpl = (...a) => fetch(...a), now = Date.now }) {
  const cfg = config.ucet;
  // Jméno, e-mail a fotka se pamatují i na disku (bez tokenů), aby karta účtu po startu bez sítě
  // neukazovala prázdné místo. V testech bez složky dat se nic neukládá.
  const soubor = (jmeno) => (config.dataDir ? path.join(config.dataDir, jmeno) : null);
  const PROFIL = soubor('ucet-profil.json');
  const FOTO = soubor('ucet-foto');
  const pokusy = new Map();
  let relace = null; // { access, expiresAt, refresh }
  let uzivatel = null;
  let foto = null; // { uzivatel, url, typ, body, hash }
  let stav = cfg ? 'odhlaseno' : 'nenastaveno';
  let chyba = '';
  let trvale = false;
  let obnova = null;
  let stahovaniFota = null;
  let fotoChyba = '';
  let posledniPokusFota = 0;
  let casovac = null;
  let dalsiPokus = 0;
  let prodleva = PRVNI_PRODLEVA_MS;

  const mojeFoto = () => (foto && uzivatel && foto.uzivatel === uzivatel.id ? foto : null);
  const status = () => ({
    stav,
    ceka: [...pokusy.values()].some((p) => now() - p.at < PLATNOST_POKUSU_MS),
    jmeno: uzivatel?.jmeno || '',
    email: uzivatel?.email || '',
    overeno: Boolean(uzivatel?.overeno),
    prihlasen: uzivatel?.prihlasen || 0,
    // Jen otisk fotky: rozhraní si ji podle něj načte z /api/ucet/foto a pozná, kdy se změnila.
    foto: mojeFoto()?.hash || '',
    // Proč fotka chybí: Google žádnou nemá („bez“), nebo se ji nepodařilo stáhnout („chyba“, zkusí se znovu).
    fotoStav: mojeFoto() ? 'ok' : !uzivatel ? '' : !uzivatel.fotoUrl ? 'bez' : fotoChyba ? 'chyba' : 'stahuji',
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
      throw new UcetChyba(ui('Server účtů Agenteeq neodpovídá. Zkontroluj připojení k internetu.'), { sit: true });
    }
    let json = null;
    try { json = await res.json(); } catch { /* prázdná odpověď */ }
    if (!res.ok) {
      const kod = String(json?.error_code || json?.error || json?.code || '');
      const zprava = res.status === 429 ? ui('Server účtů je teď přetížený. Další pokus proběhne za chvíli.')
        : res.status >= 500 ? ui('Server účtů Agenteeq má potíže. Další pokus proběhne za chvíli.')
        : String(json?.error_description || json?.msg || json?.message || ui('Chyba {0}', res.status));
      throw new UcetChyba(zprava, { status: res.status, kod });
    }
    return json;
  }

  /* ---------- Profil a fotka na disku ---------- */

  async function nactiProfil() {
    if (!PROFIL) return;
    try {
      const p = JSON.parse(await fsp.readFile(PROFIL, 'utf8'));
      if (p && typeof p.id === 'string') uzivatel = { id: p.id.slice(0, 64), email: String(p.email || '').slice(0, 254), jmeno: String(p.jmeno || '').slice(0, 120), fotoUrl: fotoZMetadat({ avatar_url: p.fotoUrl }), prihlasen: Number.isFinite(p.prihlasen) && p.prihlasen > 0 ? p.prihlasen : 0, overeno: p.overeno === true };
      if (p?.foto && p.foto.uzivatel === uzivatel?.id) {
        const body = await fsp.readFile(FOTO);
        const typ = typObrazku(body);
        if (typ && body.length <= FOTO_MAX) foto = { uzivatel: p.foto.uzivatel, url: String(p.foto.url || ''), typ, body, hash: otisk(body) };
      }
    } catch { /* první spuštění nebo poškozený soubor – profil se doplní z účtu */ }
  }

  async function ulozProfil(f = foto) {
    if (!PROFIL || !uzivatel) return;
    const data = { id: uzivatel.id, email: uzivatel.email, jmeno: uzivatel.jmeno, fotoUrl: uzivatel.fotoUrl, prihlasen: uzivatel.prihlasen || 0, overeno: Boolean(uzivatel.overeno), foto: f ? { uzivatel: f.uzivatel, url: f.url } : null };
    try {
      await fsp.mkdir(path.dirname(PROFIL), { recursive: true, mode: 0o700 });
      const tmp = `${PROFIL}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
      await fsp.rename(tmp, PROFIL);
    } catch { /* bez zápisu se profil jen nepamatuje přes restart */ }
  }

  async function smazProfil() {
    if (!PROFIL) return;
    await Promise.all([fsp.rm(PROFIL, { force: true }), fsp.rm(FOTO, { force: true })]).catch(() => {});
  }

  const otisk = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

  // Stáhne fotku, když ji Google má a ještě ji nemáme (nebo se změnila). Selhání nic nerozbije –
  // karta ukáže iniciály a příště se to zkusí znovu.
  function obnovFoto() {
    if (stahovaniFota) return stahovaniFota;
    const u = uzivatel;
    if (!u) return Promise.resolve();
    if (!u.fotoUrl) {
      if (!foto) return Promise.resolve();
      foto = null;
      return Promise.all([ulozProfil(), FOTO ? fsp.rm(FOTO, { force: true }).catch(() => {}) : null]).then(() => ohlas());
    }
    if (foto && foto.uzivatel === u.id && foto.url === u.fotoUrl) return Promise.resolve();
    posledniPokusFota = now();
    // Selhání se pamatuje (rozhraní pak ví, že fotka teprve přijde) a do záznamu aplikace jde jen
    // důvod – adresa fotky identifikuje účet, tak se nevypisuje.
    const nepovedlo = (duvod) => {
      if (fotoChyba !== duvod) console.error(`Agenteeq: profilovou fotku z Googlu se nepodařilo stáhnout (${duvod}), zkusím to znovu.`);
      fotoChyba = duvod;
      ohlas();
    };
    stahovaniFota = (async () => {
      try {
        // Přesměrování v rámci CDN Googlu je běžné; konečná adresa ale musí zůstat u Googlu.
        // Accept: formáty, které umíme rozpoznat – Google by jinak mohl poslat jiný.
        const res = await fetchImpl(u.fotoUrl, { signal: AbortSignal.timeout(CASOVY_LIMIT_MS), redirect: 'follow', headers: { Accept: 'image/png,image/jpeg,image/webp;q=0.9' } });
        if (!res.ok) return nepovedlo(`HTTP ${res.status}`);
        if (res.url && !fotoZMetadat({ avatar_url: res.url })) return nepovedlo('redirect');
        const body = Buffer.from(await res.arrayBuffer());
        const typ = typObrazku(body);
        if (uzivatel?.id !== u.id) return;
        if (!typ) return nepovedlo('format');
        if (body.length > FOTO_MAX) return nepovedlo('size');
        // Nejdřív na disk, pak do paměti: rozhraní ji uvidí, až přežije i restart.
        const nova = { uzivatel: u.id, url: u.fotoUrl, typ, body, hash: otisk(body) };
        if (FOTO) {
          await fsp.mkdir(path.dirname(FOTO), { recursive: true, mode: 0o700 });
          await fsp.writeFile(FOTO, body, { mode: 0o600 });
        }
        await ulozProfil(nova);
        if (uzivatel?.id !== u.id) return;
        foto = nova;
        fotoChyba = '';
        ohlas();
      } catch (err) {
        // Bez sítě nebo blokované – zůstanou iniciály a za chvíli se to zkusí znovu.
        nepovedlo(err?.name === 'TimeoutError' ? 'timeout' : 'network');
      }
    })().finally(() => { stahovaniFota = null; });
    return stahovaniFota;
  }

  /* ---------- Relace ---------- */

  async function ulozRelaci(odpoved) {
    // Neúplná odpověď je chyba serveru, ne odmítnutý token – přihlášení kvůli ní nezmizí.
    if (!odpoved?.access_token || !odpoved?.refresh_token) throw new UcetChyba(ui('Server účtů vrátil neúplné přihlášení.'), { docasne: true });
    // Platnost se počítá od místních hodin Macu (expires_in), ne z absolutního času serveru –
    // posunuté hodiny by jinak obnovu plánovaly špatně (příliš brzy nebo až po vypršení).
    const zaSekund = Number(odpoved.expires_in);
    relace = {
      access: odpoved.access_token,
      refresh: odpoved.refresh_token,
      expiresAt: zaSekund > 0 ? now() + zaSekund * 1000 : odpoved.expires_at ? odpoved.expires_at * 1000 : now() + 3600 * 1000,
    };
    const u = uzivatelZOdpovedi(odpoved.user);
    if (u?.id) uzivatel = u;
    stav = 'prihlaseno';
    chyba = '';
    dalsiPokus = 0;
    prodleva = PRVNI_PRODLEVA_MS;
    // Obnovovací token se při každé obnově mění, takže se ukládá pokaždé znovu. Bez Klíčenky
    // (Linux, Windows, spuštění z Terminálu) zůstane přihlášení jen do konce běhu aplikace.
    try {
      await secrets.set('ucet', relace.refresh);
      trvale = true;
    } catch {
      trvale = false;
    }
    await ulozProfil();
    obnovFoto();
  }

  async function zapomen() {
    relace = null;
    uzivatel = null;
    foto = null;
    fotoChyba = '';
    trvale = false;
    await secrets.remove('ucet').catch(() => {});
    await smazProfil();
  }

  // Uložený obnovovací token. Chybějící token je null; nedostupná Klíčenka (zamčená po startu,
  // dotaz systému na heslo) je chyba – přihlášení kvůli ní nezmizí, jen se zkusí znovu.
  async function ulozenyToken() {
    try {
      return await secrets.get('ucet', { prisne: true });
    } catch {
      throw new UcetChyba(ui('Klíčenka je teď nedostupná. Přihlášení se ověří znovu za chvíli.'), { docasne: true });
    }
  }

  function odlozit(err) {
    stav = 'nedostupne';
    chyba = err.message;
    dalsiPokus = now() + prodleva;
    prodleva = Math.min(prodleva * 2, MAX_PRODLEVA_MS);
  }

  // Obnova přihlášení. Výpadek sítě, přetížení ani zamčená Klíčenka nejsou odhlášení: token
  // zůstává a zkusí se to znovu. Odmítnutý token (odhlášeno jinde, smazaný účet) odhlásí.
  function obnov() {
    if (obnova) return obnova;
    obnova = (async () => {
      let refresh = relace?.refresh;
      try {
        if (!refresh) refresh = await ulozenyToken();
      } catch (err) {
        odlozit(err);
        return false;
      }
      if (!refresh) {
        stav = 'odhlaseno';
        return false;
      }
      // Nejvýš dva pokusy: uložený token, a když ho server odmítne, novější z Klíčenky. Token je
      // jednorázový – když se obnova povedla, ale odpověď se cestou ztratila (nebo token mezitím
      // obnovila jiná instance Agenteeq), v Klíčence už může ležet novější.
      for (let pokus = 0; pokus < 2; pokus += 1) {
        try {
          await ulozRelaci(await volej('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refresh } }));
          return true;
        } catch (err) {
          if (prechodna(err)) {
            if (!relace) relace = { access: '', refresh, expiresAt: 0 };
            odlozit(err);
            return false;
          }
          const ulozeny = await secrets.get('ucet', { prisne: true }).catch(() => null);
          if (!ulozeny || ulozeny === refresh) break;
          refresh = ulozeny;
          relace = { access: '', refresh, expiresAt: 0 };
        }
      }
      await zapomen();
      stav = 'odhlaseno';
      chyba = ui('Přihlášení vypršelo. Přihlas se znovu.');
      return false;
    })().finally(() => { obnova = null; });
    return obnova;
  }

  async function start() {
    if (!cfg) return;
    await nactiProfil();
    let meli = false;
    try {
      meli = Boolean(await ulozenyToken());
    } catch (err) {
      // Klíčenka se po přihlášení do macOS odemyká až chvíli po spuštění Agenteeq. Nepodařilo se
      // zjistit ≠ nepřihlášeno: karta řekne „nedostupné“ a ověření se zopakuje.
      meli = true;
      odlozit(err);
    }
    if (!meli) {
      uzivatel = null;
      foto = null;
      await smazProfil();
    } else if (stav !== 'nedostupne') {
      stav = 'overuji';
      ohlas();
      await obnov();
    }
    ohlas();
    casovac = setInterval(() => {
      // Fotka, která se nestáhla, se zkusí znovu nejvýš jednou za 10 minut – bez čekání na obnovu tokenu.
      if (stav === 'prihlaseno' && uzivatel?.fotoUrl && !mojeFoto() && now() - posledniPokusFota >= FOTO_ZNOVU_MS) obnovFoto();
      if (now() < dalsiPokus) return;
      const zmena = stav === 'nedostupne' || (relace?.access && relace.expiresAt - now() < OBNOVIT_PRED_KONCEM_MS);
      if (!zmena) return;
      const pred = JSON.stringify(status());
      obnov().then(() => { if (JSON.stringify(status()) !== pred) ohlas(); }).catch(() => {});
    }, TIK_MS);
    casovac.unref?.();
  }

  function stop() {
    clearInterval(casovac);
  }

  // Platný přístupový token pro další volání (synchronizace). Bez přihlášení null.
  // `vynutit`: server token odmítl dřív, než měl vypršet (401) – obnovit hned.
  async function pristup({ vynutit = false } = {}) {
    // Bez relace v paměti jde ověřovat jen tehdy, když ji zablokovala nedostupná Klíčenka.
    if (!relace && stav !== 'nedostupne') return null;
    if (vynutit || !relace?.access || relace.expiresAt - now() < OBNOVIT_PRED_KONCEM_MS) {
      if (!vynutit && stav === 'nedostupne' && now() < dalsiPokus) return null;
      await obnov();
    }
    return stav === 'prihlaseno' ? relace?.access || null : null;
  }

  async function zacniPrihlaseni({ port }) {
    if (!cfg) throw new UcetChyba(ui('Účty v téhle instalaci nejsou zapnuté.'), { status: 404 });
    // Nejdřív se zeptat, jestli přihlášení přes Google na serveru účtů vůbec běží. Poslat člověka
    // na chybovou stránku Supabase by vypadalo jako rozbitá aplikace.
    const nastaveni = await volej('/auth/v1/settings');
    if (!nastaveni?.external?.google) throw new UcetChyba(ui('Přihlášení přes Google se na serveru Agenteeq ještě nastavuje. Zkus to prosím později.'), { status: 503 });
    for (const [id, p] of pokusy) if (now() - p.at >= PLATNOST_POKUSU_MS) pokusy.delete(id);
    while (pokusy.size >= MAX_POKUSU) pokusy.delete(pokusy.keys().next().value);
    const pokus = b64url(crypto.randomBytes(32));
    const { verifier, challenge } = pkcePar();
    pokusy.set(pokus, { verifier, at: now() });
    const navrat = `http://127.0.0.1:${port}/ucet/navrat/${pokus}`;
    // prompt=select_account: na Macu s více účty Google si člověk vybere, nepřihlásí se omylem
    // tím, který je v prohlížeči zrovna aktivní.
    const url = `${cfg.url}/auth/v1/authorize?${new URLSearchParams({ provider: 'google', redirect_to: navrat, code_challenge: challenge, code_challenge_method: 's256', prompt: 'select_account' })}`;
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
      return { ok: false, zprava: ui('Tohle přihlášení už neplatí. Začni znovu v Agenteeq.') };
    }
    if (chybaZProhlizece || !code) {
      chyba = chybaZProhlizece ? ui('Přihlášení se nepovedlo: {0}', String(chybaZProhlizece).slice(0, 200)) : ui('Přihlášení se nepovedlo. Zkus to znovu.');
      ohlas('chyba');
      return { ok: false, zprava: chyba };
    }
    try {
      const odpoved = await volej('/auth/v1/token?grant_type=pkce', { method: 'POST', body: { auth_code: code, code_verifier: p.verifier } });
      // Jiný účet než dosud přihlášený: jeho jméno ani fotka se nesmí ukázat u nového.
      const novy = uzivatelZOdpovedi(odpoved?.user);
      if (uzivatel && novy?.id && novy.id !== uzivatel.id) { uzivatel = null; foto = null; }
      await ulozRelaci(odpoved);
    } catch (err) {
      chyba = err.sit ? err.message : ui('Přihlášení se nepovedlo ověřit. Zkus to znovu.');
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
    if (!token) throw new UcetChyba(ui('Pro smazání účtu se nejdřív přihlas.'), { status: 401 });
    await volej('/rest/v1/rpc/smazat_muj_ucet', { method: 'POST', token, body: {} });
    await zapomen();
    stav = 'odhlaseno';
    chyba = '';
    ohlas('smazano');
    return status();
  }

  // Fotka pro rozhraní (GET /api/ucet/foto). Jen přihlášeného, jen z paměti tohoto Macu.
  const fotka = () => {
    const f = mojeFoto();
    return f ? { typ: f.typ, body: f.body, hash: f.hash } : null;
  };

  return { status, start, stop, pristup, uzivatelId: () => (stav === 'prihlaseno' ? uzivatel?.id || null : null), zacniPrihlaseni, navrat, zrusit, odhlasit, smazat, fotka, UcetChyba };
}

export { UcetChyba };
