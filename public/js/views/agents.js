import { state, sessionsList, projectById } from '../state.js';
import { esc, fmtTok, rel, norm, shortPath, plural } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON } from '../icons.js';
import { sessionTotal, STATUS_ORDER } from '../data.js';
import { fill, statusPill, emptyState, agentHref } from '../ui.js';
import { pdot, projectTag, assignDialog } from '../projects-ui.js';

const f = { status: 'all', source: 'all', providers: new Set(), q: '', project: 'all', selecting: false, selected: new Set() };
const v = { el: null, visible: [] };

const SEGMENTS = [
  ['all', 'Vše'],
  ['needs_input', 'Potřebuje tebe'],
  ['working', 'Pracuje'],
  ['waiting', 'Čeká na zadání'],
  ['idle', 'Nečinné'],
  ['archived', 'Archiv'],
];

const matchStatus = (s, st) => (st === 'all' ? true : st === 'needs_input' ? s.status === 'needs_input' || s.status === 'limited' : s.status === st);
const matchProject = (s) => (f.project === 'all' ? true : f.project === 'none' ? !s.projectId : s.projectId === f.project);
const rank = (s) => (STATUS_ORDER[s.status] <= 2 ? STATUS_ORDER[s.status] : 3);

function applyQuery(q) {
  if (!q) return;
  const st = q.get('stav');
  if (st && SEGMENTS.some(([k]) => k === st)) f.status = st;
  const p = q.get('poskytovatel');
  if (p && PROVIDERS[p]) f.providers = new Set([p]);
  const src = q.get('zdroj');
  if (src === 'web' || src === 'local') f.source = src;
  const proj = q.get('projekt');
  if (proj === 'bez') f.project = 'none';
  else if (proj) f.project = proj;
}

function rowHtml(s) {
  let sub;
  if (s.status === 'working') sub = `<span class="live-dot" aria-hidden="true"></span>${esc(s.activity || 'Pracuje')}`;
  else if (s.status === 'needs_input' || s.status === 'limited') sub = `<span class="sub-alert">${esc(s.reason)}</span>`;
  else sub = `<code>${esc(shortPath(s.cwd) || s.url || s.app)}</code>`;
  const progress = s.progress?.total ? `<span class="row-progress" aria-label="${s.progress.done} z ${s.progress.total} úkolů"><i style="width:${((s.progress.done / s.progress.total) * 100).toFixed(1)}%"></i></span>` : '';
  const total = sessionTotal(s);
  const tag = f.project === 'all' ? projectTag(s) : '';
  const cells = `
    <span class="cell-title"><b>${esc(s.title)}</b><span class="cell-sub">${tag}${sub}</span>${progress}</span>
    <span class="cell-app">${esc(s.app)}<small>${esc(s.model || (s.source === 'web' ? 'web' : '—'))}</small></span>
    <span class="cell-status">${statusPill(s.status)}</span>
    <span class="cell-num">${total ? fmtTok(total) : '—'}</span>
    <span class="cell-time" data-ago="${s.lastAt}">${rel(s.lastAt)}</span>`;
  if (f.selecting) {
    const checked = f.selected.has(s.id);
    return `<label class="row row--select${checked ? ' is-selected' : ''}" draggable="true" data-session-drag="${esc(s.id)}">
      <span class="icon-tile icon-tile--check"><input type="checkbox" data-select-session value="${esc(s.id)}"${checked ? ' checked' : ''} aria-label="Vybrat ${esc(s.title)}"></span>${cells}<span></span>
    </label>`;
  }
  return `<a class="row" href="${agentHref(s.id)}" data-session-drag="${esc(s.id)}">
    <span class="icon-tile">${glyph(s)}<i class="status-dot status-${esc(s.status)}"></i></span>${cells}${ICON.chev}
  </a>`;
}

function mount(el, _params, query) {
  v.el = el;
  applyQuery(query);
  el.innerHTML = `
    <div class="toolbar" data-enter style="--i:1">
      <div class="seg" role="group" aria-label="Filtrovat podle stavu" data-region="seg"></div>
      <label class="search-field">${ICON.search}<span class="sr-only">Hledat agenta</span><input type="search" data-q placeholder="Název, projekt, model, aplikace…" autocomplete="off"></label>
    </div>
    <div class="toolbar toolbar--sub" data-enter style="--i:2">
      <div class="seg seg--light" role="group" aria-label="Filtrovat podle zdroje" data-region="source"></div>
      <div class="chips" role="group" aria-label="Filtrovat podle poskytovatele" data-region="chips"></div>
    </div>
    <div class="toolbar toolbar--sub toolbar--projects" data-enter style="--i:3">
      <div class="chips chips--projects" role="group" aria-label="Filtrovat podle projektu" data-region="projects"></div>
      <button class="btn btn--sm" type="button" data-select-toggle>${ICON.check}<span data-region="select-label">Vybrat</span></button>
    </div>
    <div class="card table" data-enter style="--i:4" data-region="table"></div>
    <div class="selbar" data-region="selbar" role="region" aria-label="Hromadné akce"></div>`;
  const input = el.querySelector('[data-q]');
  input.value = f.q;
  input.addEventListener('input', () => {
    f.q = input.value;
    update();
  });
  el.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-select-session]');
    if (!cb) return;
    if (cb.checked) f.selected.add(cb.value);
    else f.selected.delete(cb.value);
    update();
  });
  el.addEventListener('click', async (e) => {
    const st = e.target.closest('[data-status-filter]');
    if (st) { f.status = st.dataset.statusFilter; update(); return; }
    const src = e.target.closest('[data-source-filter]');
    if (src) { f.source = src.dataset.sourceFilter; update(); return; }
    const pf = e.target.closest('[data-project-filter]');
    if (pf) { f.project = pf.dataset.projectFilter; update(); return; }
    const p = e.target.closest('[data-provider-filter]');
    if (p) {
      const k = p.dataset.providerFilter;
      if (f.providers.has(k)) f.providers.delete(k);
      else f.providers.add(k);
      update();
      return;
    }
    if (e.target.closest('[data-select-toggle]')) {
      f.selecting = !f.selecting;
      f.selected.clear();
      update();
      return;
    }
    const bulk = e.target.closest('[data-bulk]');
    if (bulk) {
      if (bulk.dataset.bulk === 'all') v.visible.forEach((s) => f.selected.add(s.id));
      else if (bulk.dataset.bulk === 'none') f.selected.clear();
      else if (bulk.dataset.bulk === 'assign' && f.selected.size) {
        const r = await assignDialog([...f.selected]);
        if (r) { f.selected.clear(); f.selecting = false; }
      }
      update();
      return;
    }
    if (e.target.closest('[data-clear]')) {
      Object.assign(f, { status: 'all', source: 'all', providers: new Set(), q: '', project: 'all' });
      input.value = '';
      update();
    }
  });
}

function update() {
  const el = v.el;
  if (!el) return;
  const all = sessionsList();
  if (f.project !== 'all' && f.project !== 'none' && !projectById(f.project)) f.project = 'all';
  const q = norm(f.q.trim());
  const base = all.filter((s) =>
    (f.source === 'all' || (f.source === 'web' ? s.source === 'web' : s.source !== 'web'))
    && (!f.providers.size || f.providers.has(pkey(s.provider)))
    && matchProject(s)
    && (!q || norm([s.title, s.project, s.cwd, s.app, s.model, s.branch, s.url, projectById(s.projectId)?.name].join(' ')).includes(q)));

  fill(el, 'seg', SEGMENTS.map(([k, label]) => {
    const count = base.filter((s) => matchStatus(s, k)).length;
    return `<button type="button" data-status-filter="${k}" aria-pressed="${f.status === k}"${k === 'needs_input' && count ? ' class="has-alert"' : ''}>${label}<span class="count">${count}</span></button>`;
  }).join(''));
  fill(el, 'source', [['all', 'Všechny zdroje'], ['local', 'Na tomto Macu'], ['web', 'Web']]
    .map(([k, label]) => `<button type="button" data-source-filter="${k}" aria-pressed="${f.source === k}">${label}</button>`).join(''));
  const present = Object.keys(PROVIDERS).filter((p) => all.some((s) => pkey(s.provider) === p));
  fill(el, 'chips', present
    .map((p) => `<button class="chip" type="button" data-provider-filter="${p}" aria-pressed="${f.providers.has(p)}">${glyph(p)}${esc(PROVIDERS[p].label)}</button>`).join(''));

  const projects = state.projects.items.filter((p) => !p.archived || p.id === f.project);
  const countIn = (pid) => all.filter((s) => s.projectId === pid).length;
  const noneCount = all.filter((s) => !s.projectId).length;
  fill(el, 'projects', projects.length
    ? `<span class="chips-label">Projekt</span>
      <button class="chip" type="button" data-project-filter="all" aria-pressed="${f.project === 'all'}">Všechny</button>
      ${projects.map((p) => `<button class="chip" type="button" data-project-filter="${esc(p.id)}" data-project-drop="${esc(p.id)}" aria-pressed="${f.project === p.id}">${pdot(p)}${esc(p.name)}<span class="count">${countIn(p.id)}</span></button>`).join('')}
      <button class="chip" type="button" data-project-filter="none" data-project-drop="__none" aria-pressed="${f.project === 'none'}">Bez projektu<span class="count">${noneCount}</span></button>
      <span class="chips-hint muted small">Konverzaci přetáhni na projekt</span>`
    : `<span class="chips-label">Projekt</span><a class="chip" href="#/projekty">${ICON.plus}Založ první projekt a třiď konverzace podle klientů</a>`);
  fill(el, 'select-label', f.selecting ? 'Hotovo' : 'Vybrat');

  const list = base.filter((s) => matchStatus(s, f.status)).sort((a, b) => rank(a) - rank(b) || b.lastAt - a.lastAt);
  v.visible = list;
  for (const id of f.selected) if (!all.some((s) => s.id === id)) f.selected.delete(id);
  if (!all.length) {
    fill(el, 'table', emptyState({
      title: 'Zatím tu nejsou žádní agenti',
      text: 'Spusť Claude Code, Codex, Cursor nebo otevři ChatGPT s rozšířením. Agent se tu objeví během vteřiny.',
      action: '<a class="btn" href="#/nastaveni">Zkontrolovat konektory</a>',
    }));
  } else if (!list.length) {
    fill(el, 'table', emptyState({
      title: 'Tomuto filtru neodpovídá žádný agent',
      text: 'Zkus jiný stav, zdroj, poskytovatele nebo projekt.',
      action: '<button class="btn" type="button" data-clear>Zrušit filtry</button>',
    }));
  } else {
    fill(el, 'table', `<div class="row row-head" aria-hidden="true"><span></span><span>Agent</span><span>Aplikace a model</span><span>Stav</span><span class="cell-num">Tokeny</span><span class="cell-time">Aktivita</span><span></span></div>
      ${list.map(rowHtml).join('')}`);
  }

  const n = f.selected.size;
  fill(el, 'selbar', f.selecting
    ? `<div class="selbar-inner"><span><b>${n}</b> ${plural(n, 'vybraná', 'vybrané', 'vybraných')}</span>
        <button class="btn btn--sm btn--on-dark" type="button" data-bulk="all">Vybrat vše (${list.length})</button>
        ${n ? '<button class="btn btn--sm btn--on-dark" type="button" data-bulk="none">Zrušit výběr</button>' : ''}
        <button class="btn btn--sm btn--light" type="button" data-bulk="assign"${n ? '' : ' disabled'}>${ICON.folder}Zařadit do projektu</button></div>`
    : '');
}

export default {
  id: 'agenti',
  title: 'Agenti',
  mount,
  update,
  query(q) {
    applyQuery(q);
    update();
  },
  unmount: () => {
    v.el = null;
    f.selecting = false;
    f.selected.clear();
  },
};
