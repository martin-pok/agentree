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

// Jak stará smějí být čísla, aby se dala ukázat jako „teď“. Mac posílá souhrny každých 5 minut
// (src/cloud-sync.js); po třech zmeškaných kolech (Mac spí, je vypnutý, nemá síť nebo Agenteeq
// neběží) už web neříká, že agenti „teď“ pracují – ukáže, z kdy data jsou, a označí je jako stará.
export const CERSTVE_MS = 15 * 60 * 1000;
const cas = (iso) => Date.parse(iso) || 0;

// Agenti teď: jen z počítačů, které se ozvaly v posledních 15 minutách. Řádek staršího počítače
// popisuje stav z doby, kdy Mac naposledy synchronizoval – sečíst ho s živými by lhalo.
export function souhrnAgentu(radky, now = Date.now()) {
  const n = { working: 0, needs_you: 0, waiting: 0, failed: 0, aktualizovano: 0, zastarale: 0 };
  for (const r of radky) {
    const kdy = cas(r.updated_at);
    n.aktualizovano = Math.max(n.aktualizovano, kdy);
    if (now - kdy > CERSTVE_MS) {
      n.zastarale += 1;
      continue;
    }
    for (const k of ['working', 'needs_you', 'waiting', 'failed']) n[k] += Number(r[k]) || 0;
  }
  return n;
}

// Kdy naposledy poslal souhrny kterýkoli počítač (čas posledního spojení v `devices`).
export function posledniSynchronizace(zarizeni) {
  return zarizeni.reduce((max, d) => Math.max(max, cas(d.last_seen_at)), 0);
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

// Útrata tohoto měsíce. Mac posílá náklady z Admin API – ty patří organizaci, ne počítači. Dva Macy
// se stejným klíčem (nebo nově založené zařízení po přeinstalaci vedle starého) tak pošlou
// tentýž náklad dvakrát. Pro každou službu, druh a měnu se proto bere jediný řádek: ten
// s nejčerstvější synchronizací. Měny se nikdy nesčítají dohromady – každá má vlastní součet.
export function utrataMesice(radky) {
  const nejnovejsi = new Map();
  for (const r of radky) {
    const k = `${r.service}|${r.kind || ''}|${r.currency || ''}`;
    const dosud = nejnovejsi.get(k);
    if (!dosud || cas(r.updated_at) > cas(dosud.updated_at) || (cas(r.updated_at) === cas(dosud.updated_at) && Number(r.amount) > Number(dosud.amount))) nejnovejsi.set(k, r);
  }
  const meny = new Map();
  for (const r of nejnovejsi.values()) {
    const mena = r.currency || 'CZK';
    const m = meny.get(mena) || meny.set(mena, { mena, celkem: 0, podle: {} }).get(mena);
    const a = Number(r.amount) || 0;
    m.podle[r.service] = (m.podle[r.service] || 0) + a;
    m.celkem += a;
  }
  const seznam = [...meny.values()]
    .map((m) => ({ mena: m.mena, celkem: Math.round(m.celkem * 100) / 100, podle: Object.entries(m.podle).map(([s, v]) => [s, Math.round(v * 100) / 100]).sort((x, y) => y[1] - x[1]) }))
    .sort((a, b) => b.celkem - a.celkem);
  const hlavni = seznam[0] || { mena: 'CZK', celkem: 0, podle: [] };
  return { ...hlavni, meny: seznam };
}

// Limity: stejné okno (např. Claude Code · 5 h) hlásí každý Mac přihlášený ke stejnému předplatnému.
// Ukáže se jednou – nejčerstvější měření.
export function limityBezDuplicit(radky) {
  const mapa = new Map();
  for (const l of radky) {
    const k = `${l.provider}|${l.window_key}`;
    const dosud = mapa.get(k);
    if (!dosud || cas(l.measured_at) > cas(dosud.measured_at)) mapa.set(k, l);
  }
  return [...mapa.values()];
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

function kartaAgentu(a, now) {
  const pole = [['working', 'pracuje', 'is-work'], ['needs_you', tr('potřebuje tebe'), 'is-alert'], ['waiting', tr('čeká na zadání'), 'is-wait'], ['failed', 'selhalo', 'is-alert']];
  const cerstve = a.aktualizovano && now - a.aktualizovano <= CERSTVE_MS;
  // Stáří je vidět vždy. Když žádný počítač není čerstvý, čísla „teď“ nejsou: místo nul se řekne proč.
  const vek = !a.aktualizovano ? tr('zatím bez dat')
    : cerstve ? `${tr('aktualizováno')} ${esc(rel(a.aktualizovano, now))}`
    : `${tr('naposledy')} ${esc(rel(a.aktualizovano, now))}`;
  return `<section class="cloud-stage" data-enter style="--i:0" aria-label="${tr('Agenti teď')}">
    <div class="cloud-stage-head"><span class="cloud-dot${cerstve && a.working ? ' is-live' : ''}" aria-hidden="true"></span><h2>${tr('Agenti teď')}</h2>
      <span class="cloud-age">${vek}</span></div>
    ${a.aktualizovano && !cerstve
      ? `<p class="cloud-stage-stale">${tr('Žádný počítač se neozval přes 15 minut, takže nevíme, co agenti dělají teď. Otevři Agenteeq na Macu a čísla se obnoví sama.')}</p>`
      : `<div class="cloud-stage-stats">${pole.map(([k, label, cls]) => `<div class="cloud-stat${a[k] ? ` ${cls}` : ''}"><b>${a[k]}</b><span>${label}</span></div>`).join('')}</div>
    ${a.zastarale ? `<p class="cloud-stage-stale">${tr('Počítače, které se neozvaly přes 15 minut, se nepočítají ({0}).', a.zastarale)}</p>` : ''}`}
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
  // Víc měn (Macy s různou měnou aplikace) se nesčítá: hlavní číslo je největší z nich, ostatní pod ním.
  const dalsi = u.meny.slice(1);
  return `<section class="card cloud-card" data-enter style="--i:2">
    <h2 class="eyebrow">${tr('Útrata ·')} ${esc(mesic)}</h2>
    <p class="cloud-big">${esc(fmtMoney(u.celkem, u.mena))}</p>
    ${dalsi.length ? `<p class="set-desc">${tr('a k tomu')} ${dalsi.map((m) => esc(fmtMoney(m.celkem, m.mena))).join(' + ')}</p>` : ''}
    ${u.podle.length ? `<ul class="cloud-list">${u.podle.map(([s, v]) => `<li><span>${esc(SLUZBY[s] || s)}</span><b>${esc(fmtMoney(v, u.mena))}</b></li>`).join('')}</ul>` : `<p class="set-desc">${tr('Tento měsíc zatím bez výdajů.')}</p>`}
  </section>`;
}

function kartaLimitu(limity, now) {
  const serazene = [...limity].sort((a, b) => (Number(b.used_pct) || 0) - (Number(a.used_pct) || 0)).slice(0, 6);
  return `<section class="card cloud-card" data-enter style="--i:3">
    <h2 class="eyebrow">${tr('Limity')}</h2>
    ${serazene.length ? `<ul class="cloud-limits">${serazene.map((l) => {
      const pct = Number.isFinite(Number(l.used_pct)) && l.used_pct !== null ? Math.round(Number(l.used_pct)) : null;
      const obnova = l.resets_at ? Date.parse(l.resets_at) : 0;
      return `<li><div><span>${esc(popisOkna(l.provider, l.window_key))}</span><b>${pct === null ? (l.reached ? tr('vyčerpáno') : '–') : `${pct} %`}</b></div>
        <span class="meter-track"><i style="width:${Math.min(100, pct ?? (l.reached ? 100 : 0))}%"></i></span>
        <small>${obnova && obnova > now ? `${tr('obnova {0}', esc(resetsLabel(obnova, now)))} · ` : ''}${tr('změřeno')} ${esc(rel(Date.parse(l.measured_at), now))}</small></li>`;
    }).join('')}</ul>` : `<p class="set-desc">${tr('Žádné limity zatím nepřišly.')}</p>`}
  </section>`;
}

function kartaZarizeni(zarizeni, now) {
  return `<section class="card cloud-card" data-enter style="--i:4">
    <h2 class="eyebrow">${tr('Zařízení')}</h2>
    ${zarizeni.length ? `<ul class="cloud-list">${zarizeni.map((d) => {
      const kdy = Date.parse(d.last_seen_at) || 0;
      return `<li><span>${esc(d.name)}</span><b${now - kdy > CERSTVE_MS ? ' class="is-stale"' : ''}>${esc(rel(kdy, now))}</b></li>`;
    }).join('')}</ul>` : `<p class="set-desc">${tr('Zatím žádné.')}</p>`}
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
    q(`spend_monthly?select=device_id,service,kind,currency,amount,updated_at&month=eq.${mesic}`),
    q('limits?select=device_id,provider,window_key,used_pct,reached,resets_at,measured_at'),
  ]);
  return { profil: profil?.[0] || null, zarizeni: zarizeni || [], agenti: agenti || [], tokeny: tokeny || [], utrata: utrata || [], limity: limity || [], nacteno: Date.now() };
}

// Pruh nad kartami: z kdy čísla jsou. Stará data (Mac se přes 15 minut neozval) nebo nepovedená
// obnova se řeknou nahlas – stará čísla se nikdy nevydávají za živá.
function pruhStari(data, now, chybaObnovy) {
  const posledni = posledniSynchronizace(data.zarizeni);
  const zprava = chybaObnovy
    ? `<strong>${tr('Obnova se nepovedla.')}</strong> ${esc(chybaObnovy)} ${tr('Ukazuji data načtená {0}.', esc(rel(data.nacteno, now)))}`
    : !posledni ? ''
      : now - posledni > CERSTVE_MS
        ? `<strong>${tr('Data jsou stará.')}</strong> ${tr('Počítače poslaly souhrny naposledy {0}. Čísla níž nejsou živá – obnoví se, až Agenteeq na Macu poběží a bude mít síť.', esc(rel(posledni, now)))}`
        : '';
  const radek = posledni ? `${tr('Poslední synchronizace')} ${esc(rel(posledni, now))}` : '';
  return `<p class="cloud-sync-age" data-enter style="--i:0">${radek}</p>
    ${zprava ? `<div class="cloud-stale" role="status">${zprava}</div>` : ''}`;
}

function vykresliPrehled(r, data, { chybaObnovy = '' } = {}) {
  const now = Date.now();
  const jmeno = data.profil?.display_name || r.jmeno || '';
  const zapnuto = data.profil?.sync_enabled === true;
  // Synchronizace je v účtu zapnutá, ale žádný počítač se v něm zatím nezaložil. Tohle dřív vypadalo
  // jako prázdný přehled s „0 zařízení“ – teď se řekne, co to znamená a kde hledat příčinu.
  const bezZarizeni = zapnuto && !data.zarizeni.length;
  document.body.innerHTML = `${hlavicka(r)}<main class="cloud">
    <div class="cloud-head" data-enter style="--i:0"><h1>${jmeno ? `Ahoj, ${esc(jmeno.split(' ')[0])}` : tr('Tvůj Agenteeq')}</h1>
      <button class="btn btn--sm" type="button" data-obnovit>${tr('Obnovit')}</button></div>
    ${zapnuto && !bezZarizeni ? pruhStari(data, now, chybaObnovy) : chybaObnovy ? `<div class="cloud-stale" role="status"><strong>${tr('Obnova se nepovedla.')}</strong> ${esc(chybaObnovy)}</div>` : ''}
    ${bezZarizeni ? `<section class="card cloud-card cloud-empty" data-enter style="--i:1"><h2>${tr('Zatím sem žádný počítač nic neposlal')}</h2>
        <p>${tr('Synchronizace je v účtu zapnutá, ale žádný počítač se v něm zatím nezaložil. Otevři Agenteeq na Macu a podívej se do Nastavení → Účet a vzhled: když se odeslání nepovedlo, stojí tam proč. Agenteeq to sám zkouší znovu každých 5 minut.')}</p></section>`
    : zapnuto ? `<div class="cloud-grid">
        ${kartaAgentu(souhrnAgentu(data.agenti, now), now)}
        ${kartaTokenu(tokenyZaDny(data.tokeny, now))}
        ${kartaUtraty(utrataMesice(data.utrata), now)}
        ${kartaLimitu(limityBezDuplicit(data.limity), now)}
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

// Poslední úspěšně načtená data – při nepovedené tiché obnově zůstanou vidět, ale s upozorněním,
// z kdy jsou (nikdy se nevydávají za čerstvá).
let posledniData = null;
let nacitani = null;

async function nacti(r, { tichy = true } = {}) {
  if (nacitani) return nacitani;
  nacitani = nactiTed(r, { tichy }).finally(() => { nacitani = null; });
  return nacitani;
}

async function nactiTed(r, { tichy }) {
  let platna = null;
  try {
    platna = await platnaRelace();
    if (!platna) return prihlasovaciObrazovka(tr('Přihlášení vypršelo. Přihlas se prosím znovu.'));
    posledniData = await nactiData(platna);
    vykresliPrehled(platna, posledniData);
  } catch (err) {
    // Server token odmítl dřív, než měl vypršet: jednou ho obnovit a načíst znovu. Odhlásit až
    // tehdy, když neprojde ani obnova.
    if (err.status === 401) {
      const znovu = await platnaRelace({ vynutit: true }).catch(() => null);
      if (znovu) {
        try {
          posledniData = await nactiData(znovu);
          vykresliPrehled(znovu, posledniData);
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
    if (posledniData && document.querySelector('.cloud')) {
      vykresliPrehled(platna || r, posledniData, { chybaObnovy: err.message });
      return undefined;
    }
    if (!tichy || !document.querySelector('.cloud')) {
      document.body.innerHTML = `${hlavicka(r)}<main class="pair"><div class="pair-box"><h1>${tr('Souhrny se nenačetly')}</h1><p class="pair-error" role="alert">${esc(err.message)}</p><button class="btn btn--primary" type="button" data-znovu>${tr('Zkusit znovu')}</button></div></main>`;
      document.querySelector('[data-znovu]').addEventListener('click', () => nacti(r, { tichy: false }));
      document.querySelector('[data-odhlasit]')?.addEventListener('click', odhlasit);
    }
  }
  return undefined;
}

// Obnova na pozadí: každou minutu, dokud je stránka vidět, a hned po návratu do karty nebo po
// obnovení sítě – člověk nemusí nic obnovovat ručně. Skrytá karta server účtů nezatěžuje.
export function hlidejObnovu(obnov, { okno = globalThis, dokument = globalThis.document, interval = OBNOVOVAT_MS } = {}) {
  const viditelna = () => !dokument?.hidden;
  const tik = setInterval(() => { if (viditelna()) obnov(); }, interval);
  const priNavratu = () => { if (viditelna()) obnov(); };
  dokument?.addEventListener?.('visibilitychange', priNavratu);
  okno?.addEventListener?.('online', priNavratu);
  okno?.addEventListener?.('pagehide', () => {
    clearInterval(tik);
    dokument?.removeEventListener?.('visibilitychange', priNavratu);
    okno?.removeEventListener?.('online', priNavratu);
  }, { once: true });
  return () => clearInterval(tik);
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
  // Obnovuje se přehled i obrazovka „nenačetlo se“; přihlašovací obrazovku nechá být.
  hlidejObnovu(() => { if (!document.querySelector('[data-prihlasit]')) nacti(r); });
  return true;
}
