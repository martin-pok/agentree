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

const KLIC_RELACE = 'agenteeq-ucet-web';
const KLIC_OVEROVAC = 'agenteeq-ucet-pkce';
const OBNOVIT_PRED_KONCEM_MS = 5 * 60 * 1000;
const OBNOVOVAT_MS = 60 * 1000;
const DNI = 30;

export const SLUZBY = {
  chatgpt: 'ChatGPT', claude: 'Claude', copilot: 'GitHub Copilot', mscopilot: 'Microsoft Copilot', gemini: 'Gemini',
  perplexity: 'Perplexity', grok: 'Grok', qwen: 'Qwen', cursor: 'Cursor', 'openai-api': 'OpenAI API', 'anthropic-api': 'Anthropic API', other: 'Ostatní',
};
const POSKYTOVATELE = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', github: 'GitHub', microsoft: 'Microsoft', cursor: 'Cursor', perplexity: 'Perplexity', xai: 'xAI', alibaba: 'Alibaba', local: 'Lokální modely', other: 'Ostatní' };

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
    throw Object.assign(new Error('Server účtů teď neodpovídá. Zkontroluj připojení a zkus to znovu.'), { sit: true });
  }
  let json = null;
  try { json = await res.json(); } catch { /* prázdná odpověď */ }
  if (!res.ok) throw Object.assign(new Error(String(json?.error_description || json?.msg || json?.message || `Chyba ${res.status}`)), { status: res.status });
  return json;
}

function relaceZOdpovedi(o) {
  const meta = o.user?.user_metadata || {};
  return {
    access: o.access_token,
    refresh: o.refresh_token,
    expiresAt: o.expires_at ? o.expires_at * 1000 : Date.now() + (Number(o.expires_in) || 3600) * 1000,
    id: o.user?.id || '',
    email: o.user?.email || '',
    jmeno: String(meta.full_name || meta.name || '').slice(0, 120) || String(o.user?.email || '').split('@')[0],
  };
}

async function platnaRelace() {
  const r = nactiRelaci();
  if (!r?.refresh) return null;
  if (r.expiresAt - Date.now() > OBNOVIT_PRED_KONCEM_MS) return r;
  try {
    const nova = relaceZOdpovedi(await volej('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: r.refresh } }));
    ulozRelaci(nova);
    return nova;
  } catch (err) {
    if (err.sit) return r; // bez sítě se nic nemaže – zkusí se to znovu
    ulozRelaci(null);
    return null;
  }
}

export function navratovaAdresa(loc = location) {
  return `${loc.origin}/app?ucet`;
}

async function zacniPrihlaseni() {
  const nastaveni = await volej('/auth/v1/settings');
  if (!nastaveni?.external?.google) throw new Error('Přihlášení přes Google se ještě nastavuje. Zkus to prosím později.');
  const { verifier, challenge } = await pkcePar();
  try { uloziste('sessionStorage')?.setItem(KLIC_OVEROVAC, verifier); } catch { /* bez úložiště přihlášení nedokončíme */ }
  const q = new URLSearchParams({ provider: 'google', redirect_to: navratovaAdresa(), code_challenge: challenge, code_challenge_method: 's256' });
  location.assign(`${U.url}/auth/v1/authorize?${q}`);
}

async function dokonciPrihlaseni(code) {
  const verifier = uloziste('sessionStorage')?.getItem(KLIC_OVEROVAC);
  uloziste('sessionStorage')?.removeItem(KLIC_OVEROVAC);
  if (!verifier) throw new Error('Přihlášení začalo v jiném okně nebo vypršelo. Zkus to prosím znovu.');
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
  const okno = /five-hour/.test(zbytek) ? '5 h' : /seven-day-opus/.test(zbytek) ? 'týden · Opus' : /seven-day-sonnet/.test(zbytek) ? 'týden · Sonnet' : /seven-day/.test(zbytek) ? 'týden' : zbytek.replace(/-/g, ' ');
  return okno ? `${produkt} · ${okno}` : produkt;
}

const denUTC = (ts) => new Date(ts).toISOString().slice(0, 10);

export function souhrnAgentu(radky) {
  const n = { working: 0, needs_you: 0, waiting: 0, failed: 0, aktualizovano: 0 };
  for (const r of radky) {
    for (const k of ['working', 'needs_you', 'waiting', 'failed']) n[k] += Number(r[k]) || 0;
    n.aktualizovano = Math.max(n.aktualizovano, Date.parse(r.updated_at) || 0);
  }
  return n;
}

export function tokenyZaDny(radky, now = Date.now(), dni = DNI) {
  const dny = Array.from({ length: dni }, (_, i) => denUTC(now - (dni - 1 - i) * 86400000));
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

export function utrataMesice(radky) {
  const podle = {};
  let celkem = 0;
  let mena = 'CZK';
  for (const r of radky) {
    const a = Number(r.amount) || 0;
    podle[r.service] = (podle[r.service] || 0) + a;
    celkem += a;
    mena = r.currency || mena;
  }
  return { celkem: Math.round(celkem * 100) / 100, mena, podle: Object.entries(podle).sort((x, y) => y[1] - x[1]) };
}

/* ---------- Vykreslení ---------- */

function hlavicka(r) {
  return `<header class="cloud-top">
    <a class="cloud-brand" href="/"><img src="/brand/agenteeq-mark-dark.svg" alt="" width="28" height="28">Agenteeq</a>
    ${r ? `<div class="cloud-who"><span class="account-avatar" aria-hidden="true">${esc(initials(r.jmeno || r.email))}</span><span>${esc(r.jmeno || r.email)}</span>
      <button class="btn btn--sm" type="button" data-odhlasit>Odhlásit se</button></div>` : ''}
  </header>`;
}

function prihlasovaciObrazovka(zprava = '') {
  document.body.innerHTML = `${hlavicka(null)}<main class="pair">
    <div class="pair-box">
      <img src="/icons/icon-192.png" alt="" width="64" height="64">
      <h1>Tvoje Agenteeq odkudkoli</h1>
      <p>Přihlas se stejným účtem jako v Agenteeq na Macu. Uvidíš, jestli agenti pracují, kolik spotřebovali a kolik stojí – i když jsi zrovna mimo domov.</p>
      ${zprava ? `<p class="pair-error" role="alert">${esc(zprava)}</p>` : ''}
      <button class="btn btn--primary" type="button" data-prihlasit>Přihlásit se přes Google</button>
      <small>V účtu jsou jen čísla, která tam poslal tvůj Mac. Konverzace, kód ani názvy složek ne.</small>
      <small class="pair-jinak">Chceš se připojit rovnou k Macu? <a href="/app">Zadej jeho adresu.</a></small>
    </div>
  </main>`;
  const tl = document.querySelector('[data-prihlasit]');
  tl.addEventListener('click', async () => {
    tl.disabled = true;
    try { await zacniPrihlaseni(); } catch (err) { prihlasovaciObrazovka(err.message); }
  });
  tl.focus();
}

function kartaAgentu(a) {
  const pole = [['working', 'pracuje', 'is-work'], ['needs_you', 'potřebuje tebe', 'is-alert'], ['waiting', 'čeká na zadání', 'is-wait'], ['failed', 'selhalo', 'is-alert']];
  return `<section class="cloud-stage" data-enter style="--i:0" aria-label="Agenti teď">
    <div class="cloud-stage-head"><span class="cloud-dot${a.working ? ' is-live' : ''}" aria-hidden="true"></span><h2>Agenti teď</h2>
      <span class="cloud-age">${a.aktualizovano ? `aktualizováno ${esc(rel(a.aktualizovano))}` : 'zatím bez dat'}</span></div>
    <div class="cloud-stage-stats">${pole.map(([k, label, cls]) => `<div class="cloud-stat${a[k] ? ` ${cls}` : ''}"><b>${a[k]}</b><span>${label}</span></div>`).join('')}</div>
  </section>`;
}

function kartaTokenu(t) {
  const hlavni = Object.entries(t.podle).sort((x, y) => y[1] - x[1]).slice(0, 4);
  return `<section class="card cloud-card" data-enter style="--i:1">
    <h2 class="eyebrow">Tokeny za ${DNI} dní</h2>
    <p class="cloud-big">${esc(fmtTok(t.celkem))}</p>
    <div class="cloud-bars" aria-hidden="true">${miniBars(t.hodnoty, 'var(--teal)', { height: 48 })}</div>
    ${hlavni.length ? `<ul class="cloud-list">${hlavni.map(([p, v]) => `<li><span>${esc(POSKYTOVATELE[p] || p)}</span><b>${esc(fmtTok(v))}</b></li>`).join('')}</ul>` : '<p class="set-desc">Zatím žádné tokeny.</p>'}
  </section>`;
}

function kartaUtraty(u, now) {
  const mesic = MONTHS[new Date(now).getMonth()];
  return `<section class="card cloud-card" data-enter style="--i:2">
    <h2 class="eyebrow">Útrata · ${esc(mesic)}</h2>
    <p class="cloud-big">${esc(fmtMoney(u.celkem, u.mena))}</p>
    ${u.podle.length ? `<ul class="cloud-list">${u.podle.map(([s, v]) => `<li><span>${esc(SLUZBY[s] || s)}</span><b>${esc(fmtMoney(v, u.mena))}</b></li>`).join('')}</ul>` : '<p class="set-desc">Tento měsíc zatím bez výdajů.</p>'}
  </section>`;
}

function kartaLimitu(limity, now) {
  const serazene = [...limity].sort((a, b) => (Number(b.used_pct) || 0) - (Number(a.used_pct) || 0)).slice(0, 6);
  return `<section class="card cloud-card" data-enter style="--i:3">
    <h2 class="eyebrow">Limity</h2>
    ${serazene.length ? `<ul class="cloud-limits">${serazene.map((l) => {
      const pct = Number.isFinite(Number(l.used_pct)) && l.used_pct !== null ? Math.round(Number(l.used_pct)) : null;
      const obnova = l.resets_at ? Date.parse(l.resets_at) : 0;
      return `<li><div><span>${esc(popisOkna(l.provider, l.window_key))}</span><b>${pct === null ? (l.reached ? 'vyčerpáno' : '–') : `${pct} %`}</b></div>
        <span class="meter-track"><i style="width:${Math.min(100, pct ?? (l.reached ? 100 : 0))}%"></i></span>
        <small>${obnova && obnova > now ? `obnova ${esc(resetsLabel(obnova, now))}` : `změřeno ${esc(rel(Date.parse(l.measured_at), now))}`}</small></li>`;
    }).join('')}</ul>` : '<p class="set-desc">Žádné limity zatím nepřišly.</p>'}
  </section>`;
}

function kartaZarizeni(zarizeni, now) {
  return `<section class="card cloud-card" data-enter style="--i:4">
    <h2 class="eyebrow">Zařízení</h2>
    ${zarizeni.length ? `<ul class="cloud-list">${zarizeni.map((d) => `<li><span>${esc(d.name)}</span><b>${esc(rel(Date.parse(d.last_seen_at), now))}</b></li>`).join('')}</ul>` : '<p class="set-desc">Zatím žádné.</p>'}
  </section>`;
}

async function nactiData(r) {
  const od = denUTC(Date.now() - (DNI - 1) * 86400000);
  const d = new Date();
  const mesic = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const q = (cesta) => volej(`/rest/v1/${cesta}`, { token: r.access });
  const [profil, zarizeni, agenti, tokeny, utrata, limity] = await Promise.all([
    q(`profiles?select=display_name,sync_enabled&id=eq.${encodeURIComponent(r.id)}`),
    q('devices?select=id,name,platform,last_seen_at&order=last_seen_at.desc'),
    q('agent_status?select=working,needs_you,waiting,failed,updated_at'),
    q(`usage_daily?select=day,provider,tokens&day=gte.${od}`),
    q(`spend_monthly?select=service,currency,amount&month=eq.${mesic}`),
    q('limits?select=provider,window_key,used_pct,reached,resets_at,measured_at'),
  ]);
  return { profil: profil?.[0] || null, zarizeni: zarizeni || [], agenti: agenti || [], tokeny: tokeny || [], utrata: utrata || [], limity: limity || [] };
}

function vykresliPrehled(r, data) {
  const now = Date.now();
  const jmeno = data.profil?.display_name || r.jmeno || '';
  const zapnuto = data.profil?.sync_enabled === true;
  document.body.innerHTML = `${hlavicka(r)}<main class="cloud">
    <div class="cloud-head" data-enter style="--i:0"><h1>${jmeno ? `Ahoj, ${esc(jmeno.split(' ')[0])}` : 'Tvoje Agenteeq'}</h1>
      <button class="btn btn--sm" type="button" data-obnovit>Obnovit</button></div>
    ${zapnuto ? `<div class="cloud-grid">
        ${kartaAgentu(souhrnAgentu(data.agenti))}
        ${kartaTokenu(tokenyZaDny(data.tokeny, now))}
        ${kartaUtraty(utrataMesice(data.utrata), now)}
        ${kartaLimitu(data.limity, now)}
        ${kartaZarizeni(data.zarizeni, now)}
      </div>`
      : `<section class="card cloud-card cloud-empty" data-enter style="--i:1"><h2>Synchronizace je vypnutá</h2>
        <p>Souhrny sem posílá Agenteeq na Macu, až mu to dovolíš: <b>Nastavení → Účet a vzhled → Synchronizovat souhrny do účtu</b>. Dokud je vypnutá, v účtu nic není.</p></section>`}
    <p class="account-privacy cloud-foot"><span>V účtu jsou jen čísla, která poslal tvůj Mac${zapnuto ? ` – ${data.zarizeni.length} ${plural(data.zarizeni.length, 'zařízení', 'zařízení', 'zařízení')}` : ''}. Konverzace, kód ani názvy složek ne.</span></p>
  </main>`;
  document.querySelector('[data-odhlasit]').addEventListener('click', odhlasit);
  document.querySelector('[data-obnovit]').addEventListener('click', () => nacti(r, { tichy: false }));
  document.documentElement.classList.add('cloud-loaded');
}

async function nacti(r, { tichy = true } = {}) {
  try {
    const platna = await platnaRelace();
    if (!platna) return prihlasovaciObrazovka('Přihlášení vypršelo. Přihlas se prosím znovu.');
    vykresliPrehled(platna, await nactiData(platna));
  } catch (err) {
    if (err.status === 401) {
      ulozRelaci(null);
      return prihlasovaciObrazovka('Přihlášení vypršelo. Přihlas se prosím znovu.');
    }
    if (!tichy || !document.querySelector('.cloud')) {
      document.body.innerHTML = `${hlavicka(r)}<main class="pair"><div class="pair-box"><h1>Souhrny se nenačetly</h1><p class="pair-error" role="alert">${esc(err.message)}</p><button class="btn btn--primary" type="button" data-znovu>Zkusit znovu</button></div></main>`;
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
    prihlasovaciObrazovka(`Přihlášení se nepovedlo: ${chyba.slice(0, 200)}`);
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
  const tik = setInterval(() => { if (!document.hidden && document.querySelector('.cloud')) nacti(r); }, OBNOVOVAT_MS);
  addEventListener('pagehide', () => clearInterval(tik), { once: true });
  return true;
}
