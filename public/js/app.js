import { state, subscribe, applySnapshot, applyEvent, emit, sessionsList, agentsList, setProjects, launchIntent, projectById } from './state.js';
import { api, connectStream } from './api.js';
import { loaderHtml } from './loader.js';
import { esc, rel, clock, norm, initials, startOfDay, plural, STATUS } from './format.js';
import { glyph, ICON } from './icons.js';
import { toast, copy, tween, tweenAll, createPalette, alertIcon, agentHref, untilLabel } from './ui.js';
import { bindCharts, restoreHover } from './charts.js';
import { tokensSince, needsYou } from './data.js';
import { projectHref, projectForm, assignDialog, pdot } from './projects-ui.js';
import { avatarSvg, hasAvatar, cycleAvatar } from './avatars.js';
import overview from './views/overview.js';
import agents from './views/agents.js';
import session from './views/session.js';
import projectsView from './views/projects.js';
import projectView from './views/project.js';
import stats from './views/stats.js';
import spend from './views/spend.js';
import alertsView, { markRead } from './views/alerts.js';
import settings from './views/settings.js';
import skills from './views/skills.js';
import { initSelects } from './selects.js';
import { initWelcome } from './welcome.js';
import { initWhatsNew } from './whats-new.js';
import { applyAppearance, initAppearance } from './appearance.js';

initSelects();
initWelcome();
initWhatsNew();
initAppearance();

const ROUTES = [
  [/^\/(?:prehled)?$/, overview],
  [/^\/agenti$/, agents],
  [/^\/agent\/(.+)$/, session],
  [/^\/projekty$/, projectsView],
  [/^\/projekt\/([^/]+)$/, projectView],
  [/^\/statistiky$/, stats],
  [/^\/utrata$/, spend],
  [/^\/upozorneni$/, alertsView],
  [/^\/dovednosti$/, skills],
  [/^\/nastaveni$/, settings],
];
const NAV_OF = { prehled: 'prehled', agenti: 'agenti', agent: 'agenti', projekty: 'projekty', projekt: 'projekty', statistiky: 'statistiky', utrata: 'utrata', upozorneni: 'upozorneni', dovednosti: 'dovednosti', nastaveni: 'nastaveni' };

let viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const profileEl = document.getElementById('profile');
const footEl = document.getElementById('side-foot');
const connEl = document.getElementById('conn-pill');
const bell = document.getElementById('bell');
const bellBadge = document.getElementById('bell-badge');
const pop = document.getElementById('notif-pop');
const stageEl = document.querySelector('.stage');
const narrowMq = window.matchMedia('(max-width: 880px)');

// Scéna nahoře jen jemně ožije, když nějaký agent pracuje. Stav agentů ukazuje pruh v Přehledu, ne dekorace.
function renderStage(all) {
  stageEl.classList.toggle('is-live', all.some((s) => s.status === 'working'));
}
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let current = null;
let currentKey = '';
let firstNav = true;

const setHtml = (el, html) => {
  if (el._html !== html) {
    el.innerHTML = html;
    el._html = html;
  }
};

/* ---------- Směrování ---------- */

function parseRoute() {
  const raw = location.hash.replace(/^#/, '').split('#')[0] || '/prehled';
  const [path, query = ''] = raw.split('?');
  for (const [re, view] of ROUTES) {
    const m = path.match(re);
    if (m) {
      const params = m.slice(1).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
      return { view, params, query: new URLSearchParams(query), key: path };
    }
  }
  return { view: overview, params: [], query: new URLSearchParams(), key: '/prehled' };
}

/* ---------- Mobilní panel „Více“ ---------- */

const moreBtn = document.querySelector('[data-nav-action="more"]');
const SECONDARY = new Set([...document.querySelectorAll('.nav .nav-secondary')].map((a) => a.dataset.nav));
const sheet = document.createElement('div');
sheet.className = 'sheet-scrim';
sheet.id = 'more-sheet';
sheet.hidden = true;
sheet.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
  <div class="sheet-grip" aria-hidden="true"></div>
  <h2 class="sheet-title" id="sheet-h">Další sekce</h2>
  <nav class="sheet-nav" aria-label="Další sekce">${[...document.querySelectorAll('.nav .nav-secondary')].map((a) => `<a href="${a.getAttribute('href')}" data-sheet-nav="${a.dataset.nav}">${a.querySelector('svg').outerHTML}<span>${esc(a.querySelector('span').textContent)}</span><b class="nav-badge" data-sheet-badge="${a.dataset.nav}" hidden></b>${ICON.chev}</a>`).join('')}</nav>
  <div class="sheet-foot" data-sheet-foot></div>
</div>`;
document.body.appendChild(sheet);

function openSheet() {
  sheet.querySelector('[data-sheet-foot]').innerHTML = footEl.innerHTML;
  sheet.hidden = false;
  moreBtn.setAttribute('aria-expanded', 'true');
  document.body.classList.add('has-modal');
  sheet.querySelector('.sheet-nav a')?.focus();
}
function closeSheet({ restoreFocus = false } = {}) {
  if (sheet.hidden) return;
  sheet.hidden = true;
  moreBtn.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('has-modal');
  if (restoreFocus) moreBtn.focus();
}
sheet.addEventListener('mousedown', (e) => { if (e.target === sheet) closeSheet({ restoreFocus: true }); });
sheet.addEventListener('click', (e) => { if (e.target.closest('.sheet-nav a')) closeSheet(); });
sheet.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeSheet({ restoreFocus: true }); return; }
  if (e.key !== 'Tab') return;
  const f = [...sheet.querySelectorAll('a[href]')];
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
});
narrowMq.addEventListener('change', () => { if (!narrowMq.matches) closeSheet(); });

function navigate() {
  const r = parseRoute();
  closePopover();
  closeSheet();
  if (r.key !== currentKey) {
    current?.unmount?.();
    current = r.view;
    currentKey = r.key;
    // #view byl trvalý uzel a každý pohled si na něj při vstupu přidával posluchače, které nikdo
    // neodebíral — po N návštěvách se jedna akce provedla N× (dvojí hláška, dvojí dialog).
    // Výměna za čistou kopii je zahodí všechny naráz; grafy i průvodce se váží na document, ne sem.
    const nextEl = viewEl.cloneNode(false);
    viewEl.replaceWith(nextEl);
    viewEl = nextEl;
    viewEl.classList.remove('is-entering');
    void viewEl.offsetWidth;
    if (!reduceMotion.matches) viewEl.classList.add('is-entering');
    current.mount(viewEl, r.params, r.query);
    if (!firstNav) {
      window.scrollTo({ top: 0 });
      titleEl.focus({ preventScroll: true });
    }
  } else {
    current.query?.(r.query);
  }
  firstNav = false;
  titleEl.textContent = current.title;
  const nav = NAV_OF[current.id];
  for (const a of document.querySelectorAll('[data-nav], [data-sheet-nav]')) {
    if ((a.dataset.nav || a.dataset.sheetNav) === nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (SECONDARY.has(nav)) moreBtn.setAttribute('aria-current', 'page');
  else moreBtn.removeAttribute('aria-current');
  refresh(new Set(['all']));
}

/* ---------- Vykreslení ---------- */

function refresh(topics) {
  if (state.settings && (topics.has('all') || topics.has('settings'))) applyAppearance(state.settings.appearance);
  updateChrome();
  if (!state.loaded) {
    if (!viewEl.querySelector(':scope > .loader-wrap')) viewEl.insertAdjacentHTML('afterbegin', loaderHtml('Načítám agenty z tohoto Macu…'));
    return;
  }
  viewEl.querySelector(':scope > .loader-wrap')?.remove();
  try {
    current?.update(topics);
  } catch (err) {
    console.error('Agenteeq: chyba vykreslení', err);
  }
  tweenAll(document);
  restoreHover(viewEl);
  tick();
}

function updateChrome() {
  const all = sessionsList();
  const agents = agentsList();
  const working = agents.filter((s) => s.status === 'working').length;
  const needs = agents.filter(needsYou).length;
  const name = state.host?.fullName || state.host?.user || '';

  renderProfile(name, working, all);

  const setBadge = (key, count, tone, label) => {
    const b = document.querySelector(`[data-badge="${key}"]`);
    if (!b) return;
    b.hidden = !count;
    b.textContent = count > 99 ? '99+' : String(count);
    b.dataset.tone = tone;
    b.setAttribute('aria-label', label);
  };
  setBadge('agenti', needs || working, needs ? 'coral' : 'lagoon', needs ? `${needs} potřebuje tebe` : `${working} pracuje`);
  setBadge('upozorneni', state.alerts.unread, 'coral', `${state.alerts.unread} nepřečtených`);
  setBadge('more', state.alerts.unread, 'coral', `${state.alerts.unread} nepřečtených upozornění`);
  const sheetBadge = sheet.querySelector('[data-sheet-badge="upozorneni"]');
  if (sheetBadge) {
    sheetBadge.hidden = !state.alerts.unread;
    sheetBadge.textContent = state.alerts.unread > 99 ? '99+' : String(state.alerts.unread);
    sheetBadge.dataset.tone = 'coral';
  }

  bellBadge.hidden = !state.alerts.unread;
  bellBadge.textContent = state.alerts.unread > 99 ? '99+' : String(state.alerts.unread);
  bell.setAttribute('aria-label', state.alerts.unread ? `Upozornění, ${state.alerts.unread} nepřečtených` : 'Upozornění');

  renderStage(all);

  const conn = state.connection;
  // Na úzké obrazovce se vedle dlouhého názvu stránky nevejde celý popisek, ale samotná tečka
  // nic neříká. Každý stav má proto i krátkou variantu; přepíná se v CSS, ne v JavaScriptu.
  const STAVY = {
    live: ['dot--live', 'Živě', 'Živě'],
    connecting: ['dot', 'Připojuji…', 'Připojuji…'],
    down: ['dot--down', 'Obnovuji spojení…', 'Bez spojení'],
  };
  const [tecka, dlouhy, kratky] = STAVY[conn === 'live' || conn === 'connecting' ? conn : 'down'];
  setHtml(connEl, `<i class="dot ${tecka}"></i><span class="conn-long">${dlouhy}</span><span class="conn-short">${kratky}</span>`);
  setHtml(footEl, `<span class="source-state"><i class="dot ${conn === 'live' ? 'dot--live' : 'dot--down'}"></i>${conn === 'live' ? 'Živá data' : 'Bez spojení se serverem'}</span>
    ${state.host ? `<span class="source-host">${esc(`Mac: ${state.host.name.replace(/-+/g, ' ')}`)}</span>` : ''}
    ${state.version ? `<button type="button" class="source-version" data-whats-new>Agenteeq ${esc(state.version)}<span>Co je nového</span></button>` : ''}`);

  document.title = `${needs ? `(${needs}) ` : working ? '● ' : ''}${current?.title || 'Přehled'} · Agenteeq`;
  if (!pop.hidden) renderPopover();
}

// Profil: avatar má vlastní oblast, aby se při každé změně čísel nepřekresloval (a neblikal pod kurzorem).
function renderProfile(name, working, all) {
  if (!state.loaded) {
    setHtml(profileEl, '<div class="avatar is-loading" aria-hidden="true"></div>');
    return;
  }
  if (!profileEl.querySelector('[data-p-avatar]')) {
    profileEl.innerHTML = '<div data-p-avatar></div><div data-p-text></div>';
    profileEl._html = null;
  }
  const slot = profileEl.querySelector('[data-p-avatar]');
  const art = hasAvatar(state.settings?.avatar);
  const hadFocus = Boolean(document.activeElement?.closest?.('[data-avatar-cycle]'));
  setHtml(slot, `<button class="avatar-btn" type="button" data-avatar-cycle aria-label="Změnit profilový obrázek" title="Změnit profilový obrázek">
    <span class="avatar${art ? ' avatar--art' : ''}"><span class="avatar-face" data-face="${art ? state.settings.avatar : 'i'}">${art ? avatarSvg(state.settings.avatar) : esc(initials(name || 'Agenteeq'))}</span></span>
    <span class="avatar-change" aria-hidden="true">${ICON.refresh}</span>
  </button>`);
  slot.querySelector('.avatar')?.classList.toggle('is-live', working > 0);
  if (hadFocus && !document.activeElement?.closest?.('[data-avatar-cycle]')) slot.querySelector('button')?.focus({ preventScroll: true });
  setHtml(profileEl.querySelector('[data-p-text]'), `<p class="welcome">Vítej zpět,<b>${esc(name)}</b></p>
    <div class="budget"><div class="budget-num">${tween('side-today', tokensSince(all, startOfDay(Date.now())), 'tok')}</div><div class="budget-label">tokenů dnes</div></div>`);
}

// Přepisování časových údajů je jediná práce, kterou aplikace dělá sama od sebe pořád dokola.
// Musí proto být co nejlevnější a hlavně nesmí padnout doprostřed rolování: zápis do textu
// zneplatní layout a jeho přepočet stál na Přehledu až 22 ms — při 120 Hz je rozpočet 8,3 ms,
// takže z toho byl každou vteřinu viditelný záškub.
//
//   1. Na skrytou kartu se nesahá vůbec.
//   2. Během rolování se tiknutí odloží; dožene se, jakmile se prst zastaví.
//   3. Zapisuje se jen tam, kde se text opravdu změnil — jinak se layout vůbec nezneplatní.
//
// Zápisy schválně nejdou přes requestAnimationFrame: ten se v nezobrazeném okně nevolá a údaje
// by pak zamrzly. Proti škubání stačí odklad během rolování.
let roluje = 0;
window.addEventListener('scroll', () => { roluje = Date.now(); }, { passive: true });
const behemRolovani = () => Date.now() - roluje < 180;

function prepis(uzly, text) {
  for (const el of uzly) {
    const t = text(el);
    if (el.textContent !== t) el.textContent = t;
  }
}

// Relativní časy se mění nejdřív po minutě (`rel()` pod 45 s hlásí „právě teď"), takže je nemá
// smysl počítat každou vteřinu.
// `hned` obchází ochranu proti rolování: `scrollend` přichází ještě uvnitř jejího okna, takže
// bez toho by se údaje doháněly až dalším intervalem — u štítků klidně za deset vteřin.
function tickLabels(hned = false) {
  if (document.hidden || (!hned && behemRolovani())) return;
  const now = Date.now();
  prepis(document.querySelectorAll('[data-ago]'), (el) => rel(Number(el.dataset.ago), now));
  prepis(document.querySelectorAll('[data-until]'), (el) => untilLabel(Number(el.dataset.until), now));
}

// Běžící stopky jsou jediné, co skutečně potřebuje vteřinový krok — a jen když nějaké existují.
function tickClock(hned = false) {
  if (document.hidden || (!hned && behemRolovani())) return;
  const uzly = document.querySelectorAll('[data-clock-from]');
  if (!uzly.length) return;
  const now = Date.now();
  prepis(uzly, (el) => clock(now - Number(el.dataset.clockFrom)));
}

function tick(hned = false) {
  tickLabels(hned);
  tickClock(hned);
}

/* ---------- Upozornění ---------- */

function renderPopover() {
  const items = state.alerts.items.slice(0, 8);
  pop.innerHTML = `<div class="pop-head"><strong>Upozornění</strong>${state.alerts.unread ? '<button class="link" type="button" data-read-all>Označit vše jako přečtené</button>' : ''}</div>
    <ul class="pop-list">${items.length
      ? items.map((a) => `<li><a class="pop-item level-${esc(a.level)}${a.read ? '' : ' is-unread'}" href="${a.sessionId ? agentHref(a.sessionId) : '#/upozorneni'}" data-alert-id="${esc(a.id)}">
          <span class="pop-icon">${alertIcon(a)}</span>
          <span class="pop-text"><span class="pop-title">${esc(a.title)}</span>${a.body ? `<span class="pop-body">${esc(a.body)}</span>` : ''}<span class="pop-time" data-ago="${a.at}">${rel(a.at)}</span></span>
        </a></li>`).join('')
      : '<li class="pop-empty">Zatím žádná upozornění.</li>'}</ul>
    <a class="pop-foot" href="#/upozorneni">Zobrazit všechna upozornění</a>`;
}

function openPopover() {
  renderPopover();
  pop.hidden = false;
  bell.setAttribute('aria-expanded', 'true');
}

function closePopover() {
  if (pop.hidden) return;
  pop.hidden = true;
  bell.setAttribute('aria-expanded', 'false');
}

function onAlert(a) {
  const href = a.sessionId ? agentHref(a.sessionId) : '#/upozorneni';
  const urgent = a.level === 'action' || a.level === 'critical';
  toast(`${a.title}${a.body ? ` — ${a.body}` : ''}`, { tone: a.level === 'critical' ? 'coral' : urgent ? 'action' : 'ink', action: { label: 'Otevřít', href }, timeout: urgent ? 12000 : 5000 });
  const n = state.settings?.notifications;
  if (n?.browser && 'Notification' in window && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
    try {
      const note = new Notification(a.title, { body: a.body || '', tag: a.id });
      note.onclick = () => {
        window.focus();
        location.hash = href;
        note.close();
      };
    } catch { /* notifikace nejsou dostupné */ }
  }
}

async function openSession(btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('is-busy');
  try {
    const r = await api.openSession(btn.dataset.sessionId, btn.dataset.openTarget);
    toast(`Otevírám ${r.label}`);
  } catch (err) {
    toast(err.message, { tone: 'coral', timeout: 9000 });
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-busy');
  }
}

/* ---------- Paleta ---------- */

const palette = createPalette(
  (q) => {
    const nq = norm(q.trim());
    const agentItems = agentsList()
      .filter((s) => !nq || norm([s.title, s.project, s.app, s.model, s.cwd].join(' ')).includes(nq))
      .slice(0, 8)
      .map((s) => ({ group: 'Agenti', label: s.title, sub: `${STATUS[s.status]?.label} · ${s.app}${s.project ? ` · ${s.project}` : ''}`, href: agentHref(s.id), icon: glyph(s) }));
    const sections = [['prehled', 'Přehled'], ['upozorneni', 'Upozornění'], ['agenti', 'Agenti'], ['projekty', 'Projekty'], ['statistiky', 'Statistiky'], ['utrata', 'Útrata'], ['dovednosti', 'Dovednosti'], ['nastaveni', 'Nastavení']]
      .filter(([, l]) => !nq || norm(l).includes(nq))
      .map(([k, l]) => ({ group: 'Sekce', label: l, href: `#/${k}`, icon: ICON.arrow }));
    const projectItems = state.projects.items
      .filter((p) => !p.archived && (!nq || norm([p.name, p.description, ...p.folders].join(' ')).includes(nq)))
      .slice(0, 6)
      .map((p) => ({ group: 'Projekty', label: p.name, sub: p.description || `${p.folders.length} ${plural(p.folders.length, 'složka', 'složky', 'složek')}`, href: projectHref(p.id), icon: pdot(p) }));
    const actions = [
      { group: 'Akce', label: 'Spustit agenta', run: () => { launchIntent.focus = true; if (location.hash === '#/prehled') navigate(); else location.hash = '#/prehled'; }, icon: ICON.spark },
      { group: 'Akce', label: 'Nový projekt', run: async () => { const p = await projectForm(); if (p) location.hash = projectHref(p.id); }, icon: ICON.folder },
      { group: 'Akce', label: 'Přidat výdaj', href: '#/utrata?pridat=1', icon: ICON.plus },
      { group: 'Akce', label: 'Označit upozornění jako přečtená', run: () => markRead('all'), icon: ICON.check },
      { group: 'Akce', label: 'Zapnout propojení s Claude Code', href: '#/nastaveni', icon: ICON.bell },
    ].filter((a) => !nq || norm(a.label).includes(nq));
    return nq ? [...agentItems, ...projectItems, ...sections, ...actions] : [...actions.slice(0, 2), ...sections, ...projectItems, ...agentItems, ...actions.slice(2)];
  },
  (it) => {
    if (it.href) {
      if (location.hash === it.href) navigate();
      else location.hash = it.href;
    } else it.run?.();
  },
);

/* ---------- Události ---------- */

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]');
  if (c) {
    e.preventDefault();
    copy(c.dataset.copy, c.dataset.copyMessage);
    return;
  }
  const opener = e.target.closest('[data-open-target]');
  if (opener) {
    e.preventDefault();
    openSession(opener);
    return;
  }
  if (e.target.closest('[data-action="palette"]')) { palette.open(); return; }
  if (e.target.closest('[data-avatar-cycle]')) { cycleAvatar(); return; }
  if (e.target.closest('[data-nav-action="more"]')) { if (sheet.hidden) openSheet(); else closeSheet({ restoreFocus: true }); return; }
  if (e.target.closest('[data-nav-action="launch"]')) {
    launchIntent.focus = true;
    if (location.hash === '#/prehled' || location.hash === '' || location.hash === '#/') navigate();
    else location.hash = '#/prehled';
    return;
  }
  if (e.target.closest('#bell')) { if (pop.hidden) openPopover(); else closePopover(); return; }
  const item = e.target.closest('[data-alert-id]');
  if (item) markRead([item.dataset.alertId]);
  if (e.target.closest('[data-read-all]')) markRead('all');
  if (!pop.hidden && !e.target.closest('.bell-wrap')) closePopover();
});

document.addEventListener('keydown', (e) => {
  if (document.body.classList.contains('has-modal')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (palette.isOpen) palette.close();
    else palette.open();
    return;
  }
  if (e.key === 'Escape' && !pop.hidden) { closePopover(); bell.focus(); return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === '/' && !typing && !palette.isOpen) {
    e.preventDefault();
    palette.open();
  }
});

/* ---------- Odolnost: loga, výpadek serveru, offline ---------- */

// Když se logo nenačte (výpadek serveru, blokace), nahradí ho monogram — nikdy rozbitý obrázek.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('logo')) return;
  const span = document.createElement('span');
  span.className = 'logo logo-fallback';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = (img.dataset.label || '•').charAt(0);
  img.replaceWith(span);
}, true);

const offlineEl = document.getElementById('offline');
let offlineTimer = null;

function renderOffline(show) {
  if (!show) {
    offlineEl.hidden = true;
    return;
  }
  // Adresu bereme z okna, ne natvrdo: na telefonu je 127.0.0.1 sám telefon, ne Mac.
  const naMacu = window.agenteeqDesktop || location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  const rada = window.agenteeqDesktop
    ? 'Aplikace automaticky obnovuje místní službu. Tvé uložené projekty a nastavení zůstávají zachované.'
    : naMacu
      ? 'Agenteeq se připojí samo, jakmile server znovu poběží. Spusť ho v Terminálu příkazem <code>agenteeq --open</code> (ve složce projektu <code>npm start</code>).'
      : 'Agenteeq se připojí samo, jakmile bude Mac zase dostupný. Zkontroluj, že je zapnutý, nespí a že na něm Agenteeq běží.';
  setHtml(offlineEl, `<span class="offline-mark" aria-hidden="true">${ICON.alert}</span>
    <div class="offline-text"><strong>Agenteeq server neběží</strong>
      <p>${rada}</p>
      <p class="small">${naMacu ? 'Aby server běžel vždy, zapni v Nastavení <b>Spouštět po přihlášení</b>. ' : ''}Adresa: ${esc(location.host)}</p></div>
    <button class="btn btn--sm" type="button" data-offline-retry>Zkusit znovu</button>`);
  offlineEl.hidden = false;
}

function onConnection(s) {
  state.connection = s;
  clearTimeout(offlineTimer);
  if (s === 'live') renderOffline(false);
  // Krátké výpadky (restart serveru) nezobrazujeme; po 4 s už je to skutečný výpadek.
  else offlineTimer = setTimeout(() => { if (state.connection !== 'live') renderOffline(true); }, 4000);
  updateChrome();
}

offlineEl.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-offline-retry]');
  if (!b) return;
  b.disabled = true;
  const ok = await fetch('/api/health', { cache: 'no-store' }).then((r) => r.ok).catch(() => false);
  if (ok) location.reload();
  else {
    b.disabled = false;
    toast('Server Agenteeq pořád neodpovídá. Spusť ho v Terminálu příkazem agenteeq --open.', { tone: 'velvet' });
  }
});

if (!window.agenteeqDesktop && 'serviceWorker' in navigator && (location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* bez offline mezipaměti */ });
}

/* ---------- Přetažení konverzací do projektu ---------- */

let dragIds = null;
const clearDrop = () => { for (const x of document.querySelectorAll('.is-drop')) x.classList.remove('is-drop'); };

document.addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('[data-session-drag]');
  if (!row) return;
  const selected = [...document.querySelectorAll('[data-select-session]:checked')].map((x) => x.value);
  dragIds = selected.includes(row.dataset.sessionDrag) ? selected : [row.dataset.sessionDrag];
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragIds.join('\n'));
  document.body.classList.add('is-dragging');
});
document.addEventListener('dragend', () => {
  dragIds = null;
  document.body.classList.remove('is-dragging');
  clearDrop();
});
document.addEventListener('dragover', (e) => {
  const t = dragIds && e.target.closest?.('[data-project-drop]');
  if (!t) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (!t.classList.contains('is-drop')) { clearDrop(); t.classList.add('is-drop'); }
});
document.addEventListener('dragleave', (e) => {
  const t = e.target.closest?.('[data-project-drop]');
  if (t && !t.contains(e.relatedTarget)) t.classList.remove('is-drop');
});
document.addEventListener('drop', async (e) => {
  const t = dragIds && e.target.closest?.('[data-project-drop]');
  if (!t) return;
  e.preventDefault();
  const ids = dragIds;
  const pid = t.dataset.projectDrop;
  clearDrop();
  if (pid === '__dialog') { assignDialog(ids); return; }
  try {
    const r = await api.assign(ids, pid === '__none' ? '' : pid);
    setProjects(r.projects);
    const p = projectById(pid);
    const what = `${ids.length} ${plural(ids.length, 'konverzace', 'konverzace', 'konverzací')}`;
    toast(p ? `${what} v projektu ${p.name}` : `${what} mimo projekty`, p ? { action: { label: 'Otevřít projekt', href: projectHref(p.id) } } : {});
  } catch (err) {
    toast(err.message, { tone: 'velvet' });
  }
});

/* ---------- Start ---------- */

bindCharts(document);

// Překreslení pohledu je nejdražší práce v aplikaci a při běžícím agentovi chodí pořád. Kdyby
// padlo doprostřed rolování, je z toho škubnutí přesně ve chvíli, kdy je nejvíc vidět. Během
// gesta se proto témata jen posbírají a vykreslí se, jakmile se rolování zastaví — data tím
// zestárnou nanejvýš o zlomek vteřiny, ale pohyb zůstane plynulý.
let odlozenaTemata = null;
let odlozenyCasovac = 0;

function vykresliOdlozene() {
  clearTimeout(odlozenyCasovac);
  odlozenyCasovac = 0;
  if (!odlozenaTemata) return;
  const t = odlozenaTemata;
  odlozenaTemata = null;
  refresh(t);
}

subscribe((topics) => {
  if (!behemRolovani()) { refresh(topics); return; }
  if (!odlozenaTemata) odlozenaTemata = new Set();
  for (const t of topics) odlozenaTemata.add(t);
  // `scrollend` umí i Safari, ale spoléhat se jen na něj by znamenalo riskovat zaseknutou frontu.
  if (!odlozenyCasovac) odlozenyCasovac = setTimeout(vykresliOdlozene, 220);
});
window.addEventListener('scrollend', vykresliOdlozene);
window.addEventListener('hashchange', navigate);

let loadingSnapshot = null;
const queued = [];

function handle(name, data) {
  const alert = applyEvent(name, data);
  if (alert) onAlert(alert);
}

// Nespárovaný telefon nedostane ani stav, ani realtime stream — obsluha 401 uvnitř streamu by se
// tedy nikdy nespustila. Autorizaci proto zkontrolujeme hned na začátku, ještě před připojením.
const autorizace = api.state().then((snap) => {
  // Stav z prvního dotazu se rovnou použije. Dřív se zahodil a aplikace čekala na pozdrav živého
  // proudu — když nedorazil (zaseknuté spojení), zůstala na „Načítám agenty“ navždy.
  if (!state.loaded && !loadingSnapshot) prijmiSnimek(snap);
  return true;
}).catch((err) => {
  if (err.status === 401) {
    parovaciObrazovka();
    return false;
  }
  return true;
});

function prijmiSnimek(snap) {
  applySnapshot(snap);
  window.webkit?.messageHandlers?.agenteeq?.postMessage({ type: 'ready' });
  for (const [name, data] of queued.splice(0)) handle(name, data);
}

// Pojistka pro první načtení: dokud stav není načtený, zkouší se ho stáhnout znovu (4 s, 6 s, 8 s…
// nejvýš po 15 s). Běží jen do prvního úspěchu; živé změny pak dál nese proud.
let pokusyNacteni = 0;
function hlidejNacteni() {
  if (state.loaded) return;
  setTimeout(async () => {
    if (state.loaded) return;
    if (!loadingSnapshot) {
      try {
        prijmiSnimek(await api.state());
        return;
      } catch (err) {
        if (err.status === 401) return;
      }
    }
    pokusyNacteni++;
    hlidejNacteni();
  }, Math.min(15000, 4000 + pokusyNacteni * 2000));
}
hlidejNacteni();

connectStream({
  onStatus: (stav) => { autorizace.then((ok) => { if (ok) onConnection(stav); }); },
  onHello: () => {
    loadingSnapshot = api
      .state()
      .then(prijmiSnimek)
      .catch((err) => {
        if (err.status === 401) return parovaciObrazovka();
        return toast(`Nepodařilo se načíst data: ${err.message}`, { tone: 'coral', timeout: 8000 });
      })
      .finally(() => { loadingSnapshot = null; });
  },
  onEvent: (name, data) => {
    if (!state.loaded || loadingSnapshot) queued.push([name, data]);
    else handle(name, data);
  },
});

// Telefon, který ještě není spárovaný, dostane od serveru 401. Místo prázdné aplikace se zeptáme
// na jednorázový kód z Agenteeq na Macu; po spárování se stránka načte znovu už s daty.
function parovaciObrazovka(zprava = '') {
  document.body.innerHTML = `<main class="pair">
    <form class="pair-box" novalidate>
      <img src="/icons/icon-192.png" alt="" width="64" height="64">
      <h1>Připojit telefon</h1>
      <p>V Agenteeq na Macu otevři <b>Nastavení → Otevřít na telefonu</b> a vytvoř kód. Platí pět minut a jen na jedno spárování.</p>
      <label class="sr-only" for="pin">Kód z Macu</label>
      <input id="pin" name="pin" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="7" placeholder="000 000" required>
      ${zprava ? `<p class="pair-error" role="alert">${esc(zprava)}</p>` : ''}
      <button class="btn btn--primary" type="submit">Spárovat</button>
      <small>Data zůstávají na tvém Macu. Telefon se k nim dostane jen v tvé domácí síti.</small>
    </form>
  </main>`;
  const form = document.querySelector('.pair-box');
  const input = form.elements.pin;
  input.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api.pairDevice(input.value.replace(/\D/g, ''), `${navigator.platform || 'Telefon'}`);
      location.reload();
    } catch (err) {
      parovaciObrazovka(err.message);
    }
  });
}

// Na telefonu systém uspí kartu a spojení se streamem zahodí. Po návratu do aplikace (a po
// obnovení sítě) proto vždy natáhneme čerstvý stav — jinak by uživatel chvíli koukal na stará čísla.
let posledniObnova = Date.now();
async function obnovStav(duvod) {
  if (document.visibilityState !== 'visible' || loadingSnapshot) return;
  if (Date.now() - posledniObnova < 3000) return;
  posledniObnova = Date.now();
  try {
    applySnapshot(await api.state());
  } catch {
    onConnection('offline');
    void duvod;
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') obnovStav('návrat do aplikace'); });
window.addEventListener('online', () => obnovStav('obnovená síť'));
window.addEventListener('pageshow', (e) => { if (e.persisted) obnovStav('stránka z paměti'); });

navigate();
setInterval(tickClock, 1000);
setInterval(tickLabels, 10000);
setInterval(() => emit('tick'), 30000);
// Po návratu k aplikaci nebo po dorolování dožene údaje hned, ať nikde nesvítí starý čas.
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(true); });
window.addEventListener('scrollend', () => tick(true));
