import { sessionsList } from '../state.js';
import { esc, fmtTok, rel, norm, shortPath } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON } from '../icons.js';
import { sessionTotal, STATUS_ORDER } from '../data.js';
import { fill, statusPill, emptyState, agentHref } from '../ui.js';

const f = { status: 'all', source: 'all', providers: new Set(), q: '' };
const v = { el: null };

const SEGMENTS = [
  ['all', 'Vše'],
  ['needs_input', 'Potřebuje tebe'],
  ['working', 'Pracuje'],
  ['waiting', 'Čeká na zadání'],
  ['idle', 'Nečinné'],
  ['archived', 'Archiv'],
];

const matchStatus = (s, st) => (st === 'all' ? true : st === 'needs_input' ? s.status === 'needs_input' || s.status === 'limited' : s.status === st);
const rank = (s) => (STATUS_ORDER[s.status] <= 2 ? STATUS_ORDER[s.status] : 3);

function applyQuery(q) {
  if (!q) return;
  const st = q.get('stav');
  if (st && SEGMENTS.some(([k]) => k === st)) f.status = st;
  const p = q.get('poskytovatel');
  if (p && PROVIDERS[p]) f.providers = new Set([p]);
  const src = q.get('zdroj');
  if (src === 'web' || src === 'local') f.source = src;
}

function rowHtml(s) {
  let sub;
  if (s.status === 'working') sub = `<span class="live-dot" aria-hidden="true"></span>${esc(s.activity || 'Pracuje')}`;
  else if (s.status === 'needs_input' || s.status === 'limited') sub = `<span class="sub-alert">${esc(s.reason)}</span>`;
  else sub = `<code>${esc(shortPath(s.cwd) || s.url || s.app)}</code>`;
  const progress = s.progress?.total ? `<span class="row-progress" aria-label="${s.progress.done} z ${s.progress.total} úkolů"><i style="width:${((s.progress.done / s.progress.total) * 100).toFixed(1)}%"></i></span>` : '';
  const total = sessionTotal(s);
  return `<a class="row" href="${agentHref(s.id)}">
    <span class="icon-tile">${glyph(s.provider)}<i class="status-dot status-${esc(s.status)}"></i></span>
    <span class="cell-title"><b>${esc(s.title)}</b><span class="cell-sub">${sub}</span>${progress}</span>
    <span class="cell-app">${esc(s.app)}<small>${esc(s.model || (s.source === 'web' ? 'web' : '—'))}</small></span>
    <span class="cell-status">${statusPill(s.status)}</span>
    <span class="cell-num">${total ? fmtTok(total) : '—'}</span>
    <span class="cell-time" data-ago="${s.lastAt}">${rel(s.lastAt)}</span>
    ${ICON.chev}
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
    <div class="card table" data-enter style="--i:3" data-region="table"></div>`;
  const input = el.querySelector('[data-q]');
  input.value = f.q;
  input.addEventListener('input', () => {
    f.q = input.value;
    update();
  });
  el.addEventListener('click', (e) => {
    const st = e.target.closest('[data-status-filter]');
    if (st) { f.status = st.dataset.statusFilter; update(); return; }
    const src = e.target.closest('[data-source-filter]');
    if (src) { f.source = src.dataset.sourceFilter; update(); return; }
    const p = e.target.closest('[data-provider-filter]');
    if (p) {
      const k = p.dataset.providerFilter;
      if (f.providers.has(k)) f.providers.delete(k);
      else f.providers.add(k);
      update();
      return;
    }
    if (e.target.closest('[data-clear]')) {
      Object.assign(f, { status: 'all', source: 'all', providers: new Set(), q: '' });
      input.value = '';
      update();
    }
  });
}

function update() {
  const el = v.el;
  if (!el) return;
  const all = sessionsList();
  const q = norm(f.q.trim());
  const base = all.filter((s) =>
    (f.source === 'all' || (f.source === 'web' ? s.source === 'web' : s.source !== 'web'))
    && (!f.providers.size || f.providers.has(pkey(s.provider)))
    && (!q || norm([s.title, s.project, s.cwd, s.app, s.model, s.branch, s.url].join(' ')).includes(q)));

  fill(el, 'seg', SEGMENTS.map(([k, label]) => {
    const count = base.filter((s) => matchStatus(s, k)).length;
    return `<button type="button" data-status-filter="${k}" aria-pressed="${f.status === k}"${k === 'needs_input' && count ? ' class="has-alert"' : ''}>${label}<span class="count">${count}</span></button>`;
  }).join(''));
  fill(el, 'source', [['all', 'Všechny zdroje'], ['local', 'Na tomto Macu'], ['web', 'Web']]
    .map(([k, label]) => `<button type="button" data-source-filter="${k}" aria-pressed="${f.source === k}">${label}</button>`).join(''));
  const present = Object.keys(PROVIDERS).filter((p) => all.some((s) => pkey(s.provider) === p));
  fill(el, 'chips', present
    .map((p) => `<button class="chip" type="button" data-provider-filter="${p}" aria-pressed="${f.providers.has(p)}">${glyph(p)}${esc(PROVIDERS[p].label)}</button>`).join(''));

  const list = base.filter((s) => matchStatus(s, f.status)).sort((a, b) => rank(a) - rank(b) || b.lastAt - a.lastAt);
  if (!all.length) {
    fill(el, 'table', emptyState({
      title: 'Zatím tu nejsou žádní agenti',
      text: 'Spusť Claude Code, Codex, Cursor nebo otevři ChatGPT s rozšířením. Agent se tu objeví během vteřiny.',
      action: '<a class="btn" href="#/nastaveni">Zkontrolovat konektory</a>',
    }));
  } else if (!list.length) {
    fill(el, 'table', emptyState({
      title: 'Tomuto filtru neodpovídá žádný agent',
      text: 'Zkus jiný stav, zdroj nebo poskytovatele.',
      action: '<button class="btn" type="button" data-clear>Zrušit filtry</button>',
    }));
  } else {
    fill(el, 'table', `<div class="row row-head" aria-hidden="true"><span></span><span>Agent</span><span>Aplikace a model</span><span>Stav</span><span class="cell-num">Tokeny</span><span class="cell-time">Aktivita</span><span></span></div>
      ${list.map(rowHtml).join('')}`);
  }
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
  unmount: () => { v.el = null; },
};
