import { state, subscribe, applySnapshot, applyEvent, emit, sessionsList } from './state.js';
import { api, connectStream } from './api.js';
import { esc, rel, clock, norm, initials, startOfDay, STATUS } from './format.js';
import { glyph, ICON } from './icons.js';
import { toast, copy, tween, tweenAll, createPalette, alertIcon, agentHref } from './ui.js';
import { bindCharts, restoreHover } from './charts.js';
import { tokensSince } from './data.js';
import overview from './views/overview.js';
import agents from './views/agents.js';
import session from './views/session.js';
import stats from './views/stats.js';
import spend from './views/spend.js';
import alertsView, { markRead } from './views/alerts.js';
import settings from './views/settings.js';

const ROUTES = [
  [/^\/(?:prehled)?$/, overview],
  [/^\/agenti$/, agents],
  [/^\/agent\/(.+)$/, session],
  [/^\/statistiky$/, stats],
  [/^\/utrata$/, spend],
  [/^\/upozorneni$/, alertsView],
  [/^\/nastaveni$/, settings],
];
const NAV_OF = { prehled: 'prehled', agenti: 'agenti', agent: 'agenti', statistiky: 'statistiky', utrata: 'utrata', upozorneni: 'upozorneni', nastaveni: 'nastaveni' };

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const profileEl = document.getElementById('profile');
const footEl = document.getElementById('side-foot');
const connEl = document.getElementById('conn-pill');
const bell = document.getElementById('bell');
const bellBadge = document.getElementById('bell-badge');
const pop = document.getElementById('notif-pop');
const lights = [...document.querySelectorAll('.band .light')];
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

function navigate() {
  const r = parseRoute();
  closePopover();
  if (r.key !== currentKey) {
    current?.unmount?.();
    current = r.view;
    currentKey = r.key;
    viewEl.innerHTML = '';
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
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  refresh(new Set(['all']));
}

/* ---------- Vykreslení ---------- */

function refresh(topics) {
  updateChrome();
  if (!state.loaded) {
    if (!viewEl.querySelector(':scope > .loading')) viewEl.insertAdjacentHTML('afterbegin', '<div class="loading" role="status"><span class="loader"></span>Načítám agenty z tohoto Macu…</div>');
    return;
  }
  viewEl.querySelector(':scope > .loading')?.remove();
  try {
    current?.update(topics);
  } catch (err) {
    console.error('Dirigent: chyba vykreslení', err);
  }
  tweenAll(document);
  restoreHover(viewEl);
  tick();
}

function updateChrome() {
  const all = sessionsList();
  const working = all.filter((s) => s.status === 'working').length;
  const needs = all.filter((s) => s.status === 'needs_input' || s.status === 'limited').length;
  const name = state.host?.fullName || state.host?.user || '';

  setHtml(profileEl, state.loaded
    ? `<div class="avatar${working ? ' is-live' : ''}" aria-hidden="true">${esc(initials(name || 'Dirigent'))}</div>
       <p class="welcome">Vítej zpět,<b>${esc(name)}</b></p>
       <div class="budget"><div class="budget-num">${tween('side-today', tokensSince(all, startOfDay(Date.now())), 'tok')}</div><div class="budget-label">tokenů dnes</div></div>`
    : '<div class="avatar is-loading" aria-hidden="true"></div>');

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

  bellBadge.hidden = !state.alerts.unread;
  bellBadge.textContent = state.alerts.unread > 99 ? '99+' : String(state.alerts.unread);
  bell.setAttribute('aria-label', state.alerts.unread ? `Upozornění, ${state.alerts.unread} nepřečtených` : 'Upozornění');

  const alertLights = Math.min(4, needs);
  lights.forEach((l, i) => {
    l.classList.toggle('is-alert', i < alertLights);
    l.classList.toggle('is-on', i >= alertLights && i < Math.min(4, needs + working));
  });

  const conn = state.connection;
  setHtml(connEl, conn === 'live'
    ? '<i class="dot dot--live"></i><span>Živě</span>'
    : conn === 'connecting' ? '<i class="dot"></i><span>Připojuji…</span>' : '<i class="dot dot--down"></i><span>Obnovuji spojení…</span>');
  setHtml(footEl, `<span class="source-state"><i class="dot ${conn === 'live' ? 'dot--live' : 'dot--down'}"></i>${conn === 'live' ? 'Živá data' : 'Bez spojení se serverem'}</span>
    ${state.host ? `<span class="source-host">${esc(`${state.host.user}@${state.host.name}`)}</span>` : ''}
    ${state.version ? `<span class="source-host">Dirigent ${esc(state.version)}</span>` : ''}`);

  document.title = `${needs ? `(${needs}) ` : working ? '● ' : ''}${current?.title || 'Přehled'} · Dirigent`;
  if (!pop.hidden) renderPopover();
}

function tick() {
  const now = Date.now();
  for (const el of document.querySelectorAll('[data-ago]')) {
    const t = rel(Number(el.dataset.ago), now);
    if (el.textContent !== t) el.textContent = t;
  }
  for (const el of document.querySelectorAll('[data-clock-from]')) el.textContent = clock(now - Number(el.dataset.clockFrom));
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

/* ---------- Paleta ---------- */

const palette = createPalette(
  (q) => {
    const nq = norm(q.trim());
    const agentItems = sessionsList()
      .filter((s) => !nq || norm([s.title, s.project, s.app, s.model, s.cwd].join(' ')).includes(nq))
      .slice(0, 8)
      .map((s) => ({ group: 'Agenti', label: s.title, sub: `${STATUS[s.status]?.label} · ${s.app}${s.project ? ` · ${s.project}` : ''}`, href: agentHref(s.id), icon: glyph(s.provider) }));
    const sections = [['prehled', 'Přehled'], ['agenti', 'Agenti'], ['statistiky', 'Statistiky'], ['utrata', 'Útrata'], ['upozorneni', 'Upozornění'], ['nastaveni', 'Nastavení']]
      .filter(([, l]) => !nq || norm(l).includes(nq))
      .map(([k, l]) => ({ group: 'Sekce', label: l, href: `#/${k}`, icon: ICON.arrow }));
    const actions = [
      { group: 'Akce', label: 'Přidat výdaj', href: '#/utrata?pridat=1', icon: ICON.plus },
      { group: 'Akce', label: 'Označit upozornění jako přečtená', run: () => markRead('all'), icon: ICON.check },
      { group: 'Akce', label: 'Zapnout okamžité události Claude Code', href: '#/nastaveni', icon: ICON.bell },
    ].filter((a) => !nq || norm(a.label).includes(nq));
    return nq ? [...agentItems, ...sections, ...actions] : [...sections, ...agentItems, ...actions];
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
  if (e.target.closest('[data-action="palette"]')) { palette.open(); return; }
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

/* ---------- Start ---------- */

bindCharts(document);
subscribe((topics) => refresh(topics));
window.addEventListener('hashchange', navigate);

let loadingSnapshot = null;
const queued = [];

function handle(name, data) {
  const alert = applyEvent(name, data);
  if (alert) onAlert(alert);
}

connectStream({
  onStatus: (s) => {
    state.connection = s;
    updateChrome();
  },
  onHello: () => {
    loadingSnapshot = api
      .state()
      .then((snap) => {
        applySnapshot(snap);
        for (const [name, data] of queued.splice(0)) handle(name, data);
      })
      .catch((err) => toast(`Nepodařilo se načíst data: ${err.message}`, { tone: 'coral', timeout: 8000 }))
      .finally(() => { loadingSnapshot = null; });
  },
  onEvent: (name, data) => {
    if (!state.loaded || loadingSnapshot) queued.push([name, data]);
    else handle(name, data);
  },
});

navigate();
setInterval(tick, 1000);
setInterval(() => emit('tick'), 30000);
