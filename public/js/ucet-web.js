// Přehled účtu na webu (/app?ucet): přihlášení přes Google v prohlížeči a souhrny, které do účtu
// poslal Mac (src/cloud-sync.js). Jen čtení a jen vlastní řádky – hlídá RLS v databázi. Konverzace,
// kód ani názvy složek v účtu nejsou, takže je tu ani nejde ukázat.
//
// Přihlášení je PKCE bez knihoven (docs/ACCOUNTS.md): ověřovač žije v sessionStorage tohoto
// prohlížeče, relace v localStorage. Odhlášení ji smaže a zneplatní i na serveru.
import { UCET_VYCHOZI as U } from './ucet-config.js';
import { esc, fmtTok, fmtMoney, rel, initials, plural, resetsLabel, MONTHS } from './format.js';
import { miniBars } from './charts.js';
import { applyAppearance } from './appearance.js';
import { tr } from './i18n.js';
import { adresaSouboru } from './verze.js';

const KLIC_RELACE = 'agenteeq-ucet-web';
const KLIC_OVEROVAC = 'agenteeq-ucet-pkce';
const OBNOVIT_PRED_KONCEM_MS = 5 * 60 * 1000;
const OBNOVOVAT_MS = 60 * 1000;
const DNI = 30;
// Stav agentů a limity jsou „teď“ jen tehdy, když je počítač nedávno poslal. Mac posílá každých
// 5 minut (a do minuty po změně); po 15 minutách bez zprávy už číslo neříká, co se děje teď.
export const CERSTVE_MS = 15 * 60 * 1000;
const PREPOCET_CASU_MS = 30 * 1000;

export const SLUZBY = {
  chatgpt: 'ChatGPT', claude: 'Claude', copilot: 'GitHub Copilot', mscopilot: 'Microsoft Copilot', gemini: 'Gemini',
  perplexity: 'Perplexity', grok: 'Grok', qwen: 'Qwen', cursor: 'Cursor', 'openai-api': 'OpenAI API', 'anthropic-api': 'Anthropic API', other: tr('Ostatní'),
};
const POSKYTOVATELE = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', github: 'GitHub', microsoft: 'Microsoft', cursor: 'Cursor', perplexity: 'Perplexity', xai: 'xAI', alibaba: 'Alibaba', local: tr('Lokální modely'), other: tr('Ostatní') };

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function pkcePar(c = globalThis.crypto) {
  const verifier = b64url(c.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await c.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

const uloziste = (druh) => { try { return globalThis[druh]; } catch { return null; } };
function nactiRelaci() {
  try { return JSON.parse(uloziste('localStorage')?.getItem(KLIC_RELACE) || 'null'); } catch { return null; }
}
function ulozRelaci(r) {
  try {
    if (r) uloziste('localStorage')?.setItem(KLIC_RELACE, JSON.stringify(r));
    else uloziste('localStorage')?.removeItem(KLIC_RELACE);
  } catch { /* soukromé okno: relace vydrží jen do obnovení stránky */ }
}

async function volej(cesta, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${U.url}${cesta}`, {
      method,
      headers: { apikey: U.klic, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error(tr('Server účtů teď neodpovídá. Zkontroluj připojení a zkus to znovu.')), { sit: true });
  }
  let json = null;
  try { json = await res.json(); } catch { /* prázdná odpověď */ }
  if (!res.ok) throw Object.assign(new Error(String(json?.error_description || json?.msg || json?.message || `${tr('Chyba')} ${res.status}`)), { status: res.status });
  return json;
}

// Po těchhle chybách má smysl to zkusit znovu – přihlášení se kvůli nim nemaže (docs/ACCOUNTS.md).
const prechodna = (err) => err.sit || err.status >= 500 || err.status === 429 || err.status === 408;

// Profilová fotka z Googlu – jen https z obrázkového serveru Googlu (stejné pravidlo jako
// src/ucet.js#fotoZMetadat); metadata jsou nedůvěryhodná.
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

function relaceZOdpovedi(o) {
  const meta = o.user?.user_metadata || {};
  return {
    access: o.access_token,
    refresh: o.refresh_token,
    // Od hodin prohlížeče (expires_in), ne z času serveru – posunuté hodiny by obnovu rozbily.
    expiresAt: Number(o.expires_in) > 0 ? Date.now() + Number(o.expires_in) * 1000 : o.expires_at ? o.expires_at * 1000 : Date.now() + 3600 * 1000,
    id: o.user?.id || '',
    email: o.user?.email || '',
    jmeno: String(meta.full_name || meta.name || '').slice(0, 120) || String(o.user?.email || '').split('@')[0],
    foto: fotoZMetadat(meta),
  };
}

// Platná relace, v případě potřeby obnovená. `vynutit`: server token odmítl (401) dřív, než měl
// vypršet. Obnovovací token je jednorázový a relaci sdílí všechny záložky, proto obnova běží pod
// zámkem prohlížeče (Web Locks) a po jeho získání se relace přečte znovu – jiná záložka ji mohla
// mezitím obnovit. Odhlásí jen skutečně odmítnutý token; síť, přetížení ani výpadek serveru ne.
export async function platnaRelace({ vynutit = false } = {}) {
  const r = nactiRelaci();
  if (!r?.refresh) return null;
  if (!vynutit && r.expiresAt - Date.now() > OBNOVIT_PRED_KONCEM_MS) return r;
  const obnov = async () => {
    const aktualni = nactiRelaci();
    if (!aktualni?.refresh) return null;
    if (aktualni.refresh !== r.refresh && aktualni.expiresAt - Date.now() > OBNOVIT_PRED_KONCEM_MS) return aktualni;
    try {
      const nova = relaceZOdpovedi(await volej('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: aktualni.refresh } }));
      ulozRelaci(nova);
      return nova;
    } catch (err) {
      if (prechodna(err)) return aktualni;
      const ted = nactiRelaci();
      if (ted?.refresh && ted.refresh !== aktualni.refresh) return ted;
      ulozRelaci(null);
      return null;
    }
  };
  const zamky = globalThis.navigator?.locks;
  return zamky?.request ? zamky.request('agenteeq-ucet-obnova', obnov) : obnov();
}

export function navratovaAdresa(loc = location) {
  return `${loc.origin}/app?ucet`;
}

async function zacniPrihlaseni() {
  const nastaveni = await volej('/auth/v1/settings');
  if (!nastaveni?.external?.google) throw new Error(tr('Přihlášení přes Google se ještě nastavuje. Zkus to prosím později.'));
  const { verifier, challenge } = await pkcePar();
  try { uloziste('sessionStorage')?.setItem(KLIC_OVEROVAC, verifier); } catch { /* bez úložiště přihlášení nedokončíme */ }
  const q = new URLSearchParams({ provider: 'google', redirect_to: navratovaAdresa(), code_challenge: challenge, code_challenge_method: 's256', prompt: 'select_account' });
  location.assign(`${U.url}/auth/v1/authorize?${q}`);
}

async function dokonciPrihlaseni(code) {
  const verifier = uloziste('sessionStorage')?.getItem(KLIC_OVEROVAC);
  uloziste('sessionStorage')?.removeItem(KLIC_OVEROVAC);
  if (!verifier) throw new Error(tr('Přihlášení začalo v jiném okně nebo vypršelo. Zkus to prosím znovu.'));
  const r = relaceZOdpovedi(await volej('/auth/v1/token?grant_type=pkce', { method: 'POST', body: { auth_code: code, code_verifier: verifier } }));
  ulozRelaci(r);
  return r;
}

async function odhlasit() {
  const r = nactiRelaci();
  ulozRelaci(null);
  if (r?.access) await volej('/auth/v1/logout?scope=local', { method: 'POST', token: r.access }).catch(() => {});
  location.replace('/app?ucet');
}

/* ---------- Souhrny ---------- */

// Klíč okna limitu přichází z Macu ve tvaru „<zdroj>-<okno>“ (src/cloud-sync.js). Známá okna se
// pojmenují, neznámá zůstanou čitelně, jak přišla – nic se nedomýšlí.
export function popisOkna(provider, klic) {
  const k = String(klic || '');
  const produkt = k.startsWith('claude-code') ? 'Claude Code' : k.startsWith('claude-desktop') ? 'Claude' : k.startsWith('codex') ? 'Codex' : (POSKYTOVATELE[provider] || provider);
  const zbytek = k.replace(/^(claude-code|claude-desktop|codex)-?/, '');
  const okno = /five-hour/.test(zbytek) ? '5 h' : /seven-day-opus/.test(zbytek) ? tr('týden · Opus') : /seven-day-sonnet/.test(zbytek) ? tr('týden · Sonnet') : /seven-day/.test(zbytek) ? tr('týden') : zbytek.replace(/-/g, ' ');
  return okno ? `${produkt} · ${okno}` : produkt;
}

// Den v řádcích `usage_daily` je místní kalendářní den Macu, který je poslal (src/cloud-sync.js).
// Web proto staví osu z místních dnů prohlížeče, ne z UTC – jinak by po půlnoci (do 1:00, v létě
// do 2:00) dnešní řádek na ose chyběl a poslední sloupec ukazoval včerejšek.
const denMistni = (ts, posun = 0) => {
  const d = new Date(ts);
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + posun);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const cerstve = (ts, now = Date.now()) => ts > 0 && now - ts <= CERSTVE_MS;

// Agenti teď: součet jen z počítačů, které se ozvaly za posledních 15 minut. Starší řádek by
// ukazoval „pracuje“ i u Macu, který je dávno vypnutý – ten se jen spočítá do `starych`.
export function souhrnAgentu(radky, now = Date.now()) {
  const n = { working: 0, needs_you: 0, waiting: 0, failed: 0, aktualizovano: 0, cerstvych: 0, starych: 0 };
  for (const r of radky) {
    const ts = Date.parse(r.updated_at) || 0;
    n.aktualizovano = Math.max(n.aktualizovano, ts);
    if (!cerstve(ts, now)) {
      n.starych += 1;
      continue;
    }
    n.cerstvych += 1;
    for (const k of ['working', 'needs_you', 'waiting', 'failed']) n[k] += Number(r[k]) || 0;
  }
  return n;
}

export function tokenyZaDny(radky, now = Date.now(), dni = DNI) {
  const dny = Array.from({ length: dni }, (_, i) => denMistni(now, i - (dni - 1)));
  const index = new Map(dny.map((d, i) => [d, i]));
  const hodnoty = new Array(dni).fill(0);
  const podle = {};
  for (const r of radky) {
    const i = index.get(r.day);
    if (i === undefined) continue;
    const t = Number(r.tokens) || 0;
    hodnoty[i] += t;
    podle[r.provider] = (podle[r.provider] || 0) + t;
  }
  return { hodnoty, celkem: hodnoty.reduce((a, b) => a + b, 0), podle };
}

// Útrata v účtu jsou náklady z Admin API (src/cloud-sync.js, zdroje.utrata) – a ty patří celé
// organizaci u dodavatele, ne jednomu počítači. Dva Macy se stejným klíčem pošlou totéž číslo;
// sečíst je by útratu zdvojilo. Proto za službu a druh platí jen nejnověji poslaný řádek (při shodě
// času vyšší částka). Řádky v jiné měně než ten nejnovější se do součtu nepřičítají – `jinaMena`.
export function utrataMesice(radky) {
  const nejnovejsi = new Map();
  for (const r of radky) {
    const k = `${r.service}|${r.kind || ''}`;
    const ts = Date.parse(r.updated_at) || 0;
    const byl = nejnovejsi.get(k);
    if (!byl || ts > byl.ts || (ts === byl.ts && (Number(r.amount) || 0) > (Number(byl.r.amount) || 0))) nejnovejsi.set(k, { r, ts });
  }
  const vybrane = [...nejnovejsi.values()].sort((a, b) => b.ts - a.ts);
  const mena = vybrane[0]?.r.currency || 'CZK';
  const podle = {};
  let celkem = 0;
  let jinaMena = 0;
  for (const { r } of vybrane) {
    if ((r.currency || mena) !== mena) {
      jinaMena += 1;
      continue;
    }
    const a = Number(r.amount) || 0;
    podle[r.service] = (podle[r.service] || 0) + a;
    celkem += a;
  }
  return { celkem: Math.round(celkem * 100) / 100, mena, jinaMena, podle: Object.entries(podle).map(([k, v]) => [k, Math.round(v * 100) / 100]).sort((x, y) => y[1] - x[1]) };
}

/* ---------- Vykreslení ---------- */

function hlavicka(r) {
  return `<header class="cloud-top">
    <a class="cloud-brand" href="/"><img src="${adresaSouboru('/brand/agenteeq-mark-dark.svg')}" alt="" width="28" height="28">Agenteeq</a>
    ${r ? `<div class="cloud-who"><span class="account-avatar" aria-hidden="true">${r.foto ? `<img src="${esc(r.foto)}" alt="" width="32" height="32" referrerpolicy="no-referrer" decoding="async">` : esc(initials(r.jmeno || r.email))}</span><span>${esc(r.jmeno || r.email)}</span>
      <button class="btn btn--sm" type="button" data-odhlasit>${tr('Odhlásit se')}</button></div>` : ''}
  </header>`;
}

function prihlasovaciObrazovka(zprava = '') {
  document.body.innerHTML = `${hlavicka(null)}<main class="pair">
    <div class="pair-box">
      <img src="${adresaSouboru('/icons/icon-192.png')}" alt="" width="64" height="64">
      <h1>${tr('Tvůj Agenteeq odkudkoli')}</h1>
      <p>${tr('Přihlas se stejným účtem jako v Agenteeq na Macu. Uvidíš, jestli agenti pracují, kolik spotřebovali a kolik stojí – i když jsi zrovna mimo domov.')}</p>
      ${zprava ? `<p class="pair-error" role="alert">${esc(zprava)}</p>` : ''}
      <button class="btn btn--primary" type="button" data-prihlasit>${tr('Přihlásit se přes Google')}</button>
      <small>${tr('V účtu jsou jen čísla, která tam poslal tvůj Mac. Konverzace, kód ani názvy složek ne.')}</small>
      <small class="pair-jinak">${tr('Chceš se připojit rovnou k Macu?')} <a href="/app">${tr('Zadej jeho adresu.')}</a></small>
    </div>
  </main>`;
  const tl = document.querySelector('[data-prihlasit]');
  tl.addEventListener('click', async () => {
    tl.disabled = true;
    try { await zacniPrihlaseni(); } catch (err) { prihlasovaciObrazovka(err.message); }
  });
  tl.focus();
}

// Relativní čas, který se sám přepisuje (prepocitejCasy) – i když se data zrovna nedaří obnovit.
const pred = (ts, now) => `<span data-ago="${Number(ts) || 0}">${esc(rel(ts, now))}</span>`;

function kartaAgentu(a, now) {
  const pole = [['working', tr('pracuje'), 'is-work'], ['needs_you', tr('potřebuje tebe'), 'is-alert'], ['waiting', tr('čeká na zadání'), 'is-wait'], ['failed', tr('selhalo'), 'is-alert']];
  // Bez čerstvých dat počty neznáme: pomlčka, ne nula, a žádná svítící tečka.
  const zname = a.cerstvych > 0;
  const poznamka = !a.starych ? ''
    : zname ? tr('Nezapočteno: {0} {1} bez zprávy přes 15 minut.', a.starych, plural(a.starych, 'počítač', 'počítače', 'počítačů'))
    : tr('Žádný počítač se přes 15 minut neozval, takže teď nevíme, co agenti dělají.');
  return `<section class="cloud-stage" data-enter style="--i:0" aria-label="${tr('Agenti teď')}">
    <div class="cloud-stage-head"><span class="cloud-dot${zname && a.working ? ' is-live' : ''}" aria-hidden="true"></span><h2>${tr('Agenti teď')}</h2>
      <span class="cloud-age">${a.aktualizovano ? `${tr('aktualizováno')} ${pred(a.aktualizovano, now)}` : tr('zatím bez dat')}</span></div>
    <div class="cloud-stage-stats">${pole.map(([k, label, cls]) => `<div class="cloud-stat${zname && a[k] ? ` ${cls}` : ''}"><b>${zname ? a[k] : '–'}</b><span>${label}</span></div>`).join('')}</div>
    ${poznamka ? `<p class="cloud-stage-note">${esc(poznamka)}</p>` : ''}
  </section>`;
}

function kartaTokenu(t) {
  const hlavni = Object.entries(t.podle).sort((x, y) => y[1] - x[1]).slice(0, 4);
  return `<section class="card cloud-card" data-enter style="--i:1">
    <h2 class="eyebrow">${tr('Tokeny za {0} dní', DNI)}</h2>
    <p class="cloud-big">${esc(fmtTok(t.celkem))}</p>
    <div class="cloud-bars" aria-hidden="true">${miniBars(t.hodnoty, 'var(--teal)', { height: 48 })}</div>
    ${hlavni.length ? `<ul class="cloud-list">${hlavni.map(([p, v]) => `<li><span>${esc(POSKYTOVATELE[p] || p)}</span><b>${esc(fmtTok(v))}</b></li>`).join('')}</ul>` : `<p class="set-desc">${tr('Zatím žádné tokeny.')}</p>`}
  </section>`;
}

function kartaUtraty(u, now) {
  const mesic = MONTHS[new Date(now).getMonth()];
  return `<section class="card cloud-card" data-enter style="--i:2">
    <h2 class="eyebrow">${tr('Útrata ·')} ${esc(mesic)}</h2>
    <p class="cloud-big">${esc(fmtMoney(u.celkem, u.mena))}</p>
    ${u.podle.length ? `<ul class="cloud-list">${u.podle.map(([s, v]) => `<li><span>${esc(SLUZBY[s] || s)}</span><b>${esc(fmtMoney(v, u.mena))}</b></li>`).join('')}</ul>` : `<p class="set-desc">${tr('Tento měsíc zatím bez výdajů.')}</p>`}
    ${u.jinaMena ? `<small class="cloud-note">${tr('Část útraty je v jiné měně a do součtu se nepřičetla.')}</small>` : ''}
  </section>`;
}

// Limit je „teď“, jen když ho počítač poslal za posledních 15 minut (updated_at). Starší jde až za
// čerstvé, ztlumený a se stářím měření místo času obnovy – obnova už mohla dávno proběhnout.
export function serazeneLimity(limity, now = Date.now()) {
  return limity
    .map((l) => ({ ...l, stary: !cerstve(Date.parse(l.updated_at || l.measured_at) || 0, now) }))
    .sort((a, b) => (a.stary - b.stary) || ((Number(b.used_pct) || 0) - (Number(a.used_pct) || 0)));
}

function kartaLimitu(limity, now) {
  const serazene = serazeneLimity(limity, now).slice(0, 6);
  return `<section class="card cloud-card" data-enter style="--i:3">
    <h2 class="eyebrow">${tr('Limity')}</h2>
    ${serazene.length ? `<ul class="cloud-limits">${serazene.map((l) => {
      const pct = Number.isFinite(Number(l.used_pct)) && l.used_pct !== null ? Math.round(Number(l.used_pct)) : null;
      const obnova = l.resets_at ? Date.parse(l.resets_at) : 0;
      const zmereno = `${tr('změřeno')} ${pred(Date.parse(l.measured_at), now)}`;
      return `<li${l.stary ? ' class="is-stale"' : ''}><div><span>${esc(popisOkna(l.provider, l.window_key))}</span><b>${pct === null ? (l.reached ? tr('vyčerpáno') : '–') : `${pct} %`}</b></div>
        <span class="meter-track"><i style="width:${Math.min(100, pct ?? (l.reached ? 100 : 0))}%"></i></span>
        <small>${l.stary ? `${tr('starý údaj')} · ${zmereno}` : obnova && obnova > now ? tr('obnova {0}', esc(resetsLabel(obnova, now))) : zmereno}</small></li>`;
    }).join('')}</ul>` : `<p class="set-desc">${tr('Žádné limity zatím nepřišly.')}</p>`}
  </section>`;
}

function kartaZarizeni(zarizeni, now) {
  return `<section class="card cloud-card" data-enter style="--i:4">
    <h2 class="eyebrow">${tr('Zařízení')}</h2>
    ${zarizeni.length ? `<ul class="cloud-list">${zarizeni.map((d) => `<li><span>${esc(d.name)}</span><b>${pred(Date.parse(d.last_seen_at), now)}</b></li>`).join('')}</ul>` : `<p class="set-desc">${tr('Zatím žádné.')}</p>`}
  </section>`;
}

async function nactiData(r) {
  const od = denMistni(Date.now(), -(DNI - 1));
  const d = new Date();
  const mesic = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const q = (cesta) => volej(`/rest/v1/${cesta}`, { token: r.access });
  const [profil, zarizeni, agenti, tokeny, utrata, limity] = await Promise.all([
    q(`profiles?select=display_name,sync_enabled&id=eq.${encodeURIComponent(r.id)}`),
    q('devices?select=id,name,platform,last_seen_at&order=last_seen_at.desc'),
    q('agent_status?select=device_id,working,needs_you,waiting,failed,updated_at'),
    q(`usage_daily?select=day,provider,tokens&day=gte.${od}`),
    q(`spend_monthly?select=service,kind,currency,amount,updated_at&month=eq.${mesic}`),
    q('limits?select=device_id,provider,window_key,used_pct,reached,resets_at,measured_at,updated_at'),
  ]);
  return { profil: profil?.[0] || null, zarizeni: zarizeni || [], agenti: agenti || [], tokeny: tokeny || [], utrata: utrata || [], limity: limity || [] };
}

// Poslední úspěšně načtená data: když se obnovení nepovede, zůstanou vidět s poznámkou o stáří.
let posledniData = null;
let posledniUspech = 0;

function vykresliPrehled(r, data, { neobnoveno = false } = {}) {
  const now = Date.now();
  const jmeno = data.profil?.display_name || r.jmeno || '';
  const zapnuto = data.profil?.sync_enabled === true;
  // Volba je zapnutá, ale žádný počítač se ještě nezaložil – prázdné karty by vypadaly jako „nic
  // se neděje“. Řekneme, co se stalo a kde to zkontrolovat.
  const bezPocitace = zapnuto && !data.zarizeni.length;
  document.body.innerHTML = `${hlavicka(r)}<main class="cloud">
    <div class="cloud-head" data-enter style="--i:0"><h1>${jmeno ? tr('Ahoj, {0}', esc(jmeno.split(' ')[0])) : tr('Tvůj Agenteeq')}</h1>
      <button class="btn btn--sm" type="button" data-obnovit>${tr('Obnovit')}</button></div>
    ${neobnoveno ? `<p class="cloud-stale" role="status">${tr('Nepodařilo se obnovit. Údaje jsou načtené {0}, zkusím to znovu samo.', pred(posledniUspech, now))}</p>` : ''}
    ${bezPocitace ? `<section class="card cloud-card cloud-empty" data-enter style="--i:1"><h2>${tr('Žádný počítač zatím nic neposlal')}</h2>
        <p>${tr('Otevři Agenteeq → Nastavení → Účet a vzhled. U synchronizace souhrnů uvidíš, jestli odesílání hlásí chybu.')}</p></section>`
    : zapnuto ? `<div class="cloud-grid">
        ${kartaAgentu(souhrnAgentu(data.agenti, now), now)}
        ${kartaTokenu(tokenyZaDny(data.tokeny, now))}
        ${kartaUtraty(utrataMesice(data.utrata), now)}
        ${kartaLimitu(data.limity, now)}
        ${kartaZarizeni(data.zarizeni, now)}
      </div>`
      : `<section class="card cloud-card cloud-empty" data-enter style="--i:1"><h2>${tr('Synchronizace je vypnutá')}</h2>
        <p>${tr('Souhrny sem posílá Agenteeq na Macu, až mu to dovolíš:')} <b>${tr('Nastavení → Účet a vzhled → Synchronizovat souhrny do účtu')}</b>${tr('. Dokud je vypnutá, v účtu nic není.')}</p></section>`}
    <p class="account-privacy cloud-foot"><span>${tr('V účtu jsou jen čísla, která poslal tvůj Mac{0}. Konverzace, kód ani názvy složek ne.', zapnuto ? ` – ${data.zarizeni.length} ${plural(data.zarizeni.length, 'zařízení', 'zařízení', 'zařízení')}` : '')}</span></p>
  </main>`;
  document.querySelector('[data-odhlasit]').addEventListener('click', odhlasit);
  document.querySelector('[data-obnovit]').addEventListener('click', () => nacti(r, { tichy: false }));
  document.documentElement.classList.add('cloud-loaded');
}

function zobraz(r, data) {
  posledniData = { r, data };
  posledniUspech = Date.now();
  vykresliPrehled(r, data);
}

// Přepíše relativní časy na místě (bez překreslení, fokus zůstane) – i když obnovení nejde.
function prepocitejCasy() {
  const now = Date.now();
  for (const el of document.querySelectorAll('.cloud [data-ago]')) {
    const t = rel(Number(el.dataset.ago), now);
    if (el.textContent !== t) el.textContent = t;
  }
}

let nacitani = null;
function nacti(r, volby) {
  // Návrat do záložky, obnovení sítě a tik časovače se můžou sejít – stačí jedno načtení.
  nacitani ??= nactiTed(r, volby).finally(() => { nacitani = null; });
  return nacitani;
}

async function nactiTed(r, { tichy = true } = {}) {
  try {
    const platna = await platnaRelace();
    if (!platna) return prihlasovaciObrazovka(tr('Přihlášení vypršelo. Přihlas se prosím znovu.'));
    zobraz(platna, await nactiData(platna));
  } catch (err) {
    // Server token odmítl dřív, než měl vypršet: jednou ho obnovit a načíst znovu. Odhlásit až
    // tehdy, když neprojde ani obnova.
    if (err.status === 401) {
      const znovu = await platnaRelace({ vynutit: true }).catch(() => null);
      if (znovu) {
        try {
          zobraz(znovu, await nactiData(znovu));
          return undefined;
        } catch (err2) {
          if (err2.status !== 401) err = err2;
        }
      }
      if (err.status === 401) {
        ulozRelaci(null);
        return prihlasovaciObrazovka(tr('Přihlášení vypršelo. Přihlas se prosím znovu.'));
      }
    }
    // Tiché obnovení se nepovedlo: poslední data zůstanou, s poznámkou, jak jsou stará. Čerstvost
    // stavu agentů a limitů se přitom přepočítá – po 15 minutách už nesvítí jako „teď“.
    if (tichy && posledniData && document.querySelector('.cloud')) {
      vykresliPrehled(posledniData.r, posledniData.data, { neobnoveno: true });
    } else if (!tichy || !document.querySelector('.cloud')) {
      document.body.innerHTML = `${hlavicka(r)}<main class="pair"><div class="pair-box"><h1>${tr('Souhrny se nenačetly')}</h1><p class="pair-error" role="alert">${esc(err.message)}</p><button class="btn btn--primary" type="button" data-znovu>${tr('Zkusit znovu')}</button></div></main>`;
      document.querySelector('[data-znovu]').addEventListener('click', () => nacti(r, { tichy: false }));
      document.querySelector('[data-odhlasit]')?.addEventListener('click', odhlasit);
    }
  }
  return undefined;
}

// Vstup z boot.js. Vrací false, když na webu o účet nejde (žádné ?ucet ani uložená relace).
export async function spustUcetWeb() {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.slice(1));
  if (!q.has('ucet') && !nactiRelaci()) return false;
  document.documentElement.classList.add('is-cloud');
  // Vzhled podle systému – na webu žádné nastavení aplikace není.
  applyAppearance('system');
  const chyba = h.get('error_description') || q.get('error_description');
  if (chyba) {
    history.replaceState(null, '', '/app?ucet');
    prihlasovaciObrazovka(`${tr('Přihlášení se nepovedlo:')} ${chyba.slice(0, 200)}`);
    return true;
  }
  if (q.get('code')) {
    try {
      await dokonciPrihlaseni(q.get('code'));
    } catch (err) {
      history.replaceState(null, '', '/app?ucet');
      prihlasovaciObrazovka(err.message);
      return true;
    }
    history.replaceState(null, '', '/app?ucet');
  }
  const r = await platnaRelace();
  if (!r) {
    prihlasovaciObrazovka();
    return true;
  }
  await nacti(r, { tichy: false });
  const tichaObnova = () => { if (!document.hidden && document.querySelector('.cloud')) nacti(r); };
  const tik = setInterval(tichaObnova, OBNOVOVAT_MS);
  const casy = setInterval(prepocitejCasy, PREPOCET_CASU_MS);
  // Po návratu do záložky nebo obnovení sítě hned, ne až s dalším tikem.
  document.addEventListener('visibilitychange', tichaObnova);
  addEventListener('online', tichaObnova);
  addEventListener('pagehide', () => {
    clearInterval(tik);
    clearInterval(casy);
    document.removeEventListener('visibilitychange', tichaObnova);
    removeEventListener('online', tichaObnova);
  }, { once: true });
  return true;
}
