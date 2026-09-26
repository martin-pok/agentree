import { state, agentsList, taskRunCount, projectById } from '../state.js';
import { api } from '../api.js';
import { esc, fmtTok, rel, norm, shortPath, plural } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON, ENV, envOf } from '../icons.js';
import { sessionTotal, needsYou, attentionRank } from '../data.js';
import { fill, statusPill, emptyState, agentHref, toast } from '../ui.js';
import { pdot, projectTag, assignDialog } from '../projects-ui.js';
import { BEZ_PREPISU, bezPrepisu } from '../no-transcript.js';
import { tr } from '../i18n.js';

const f = { status: 'all', source: 'all', providers: new Set(), q: '', project: 'all', selecting: false, selected: new Set() };
const v = { el: null, visible: [] };

const SEGMENTS = [
  ['all', tr('Vše')],
  ['needs_input', tr('Potřebuje tebe')],
  ['working', tr('Pracuje')],
  ['waiting', tr('Čeká na zadání')],
  ['idle', tr('Nečinné')],
  ['archived', tr('Archiv')],
];

const matchStatus = (s, st) => (st === 'all' ? true : st === 'needs_input' ? needsYou(s) : s.status === st);

// Aplikace, které Agenteeq umí přepnout do popředí (server má pevný seznam v src/openers.js).
const PREPNUTELNE = new Set(['claude-desktop', 'chatgpt', 'cursor', 'vscode', 'ms-copilot', 'perplexity', 'grok', 'lmstudio', 'ollama']);

// Aplikace, které na tomto Macu běží, ale svoje konverzace nikam neukládají. Dřív se v seznamu
// vůbec neobjevily, takže to vypadalo, že Agenteeq agenta „nezaregistroval". Teď je vidět, že běží,
// i to, proč u nich nemůže být přepis – a co s tím jde udělat.

// Konverzace v prohlížeči (Gemini, ChatGPT, Claude.ai, Perplexity, Grok, Copilot, Qwen) vidí
// Agenteeq výhradně přes rozšíření – do stránky v prohlížeči se odjinud dostat nedá. Dokud
// rozšíření nikdy nic neposlalo, musí to aplikace říct: mlčet a tvářit se, že nic neběží, je
// k nerozeznání od chyby.
function webBezRozsireniHtml() {
  const web = (state.connectors || []).find((c) => c.id === 'web');
  if (!web || web.state !== 'missing') return '';
  return `<li class="runtime-web">
    <span class="icon-tile">${ICON.cloud}</span>
    <div class="runtime-main">
      <b>${tr('Konverzace v prohlížeči se nesledují')}</b>
      <span class="muted small">${tr('rozšíření zatím neposlalo žádná data')}</span>
      <p class="small">${tr('Gemini, ChatGPT, Claude.ai, Perplexity, Grok, Microsoft Copilot a Qwen Chat na webu vidí Agenteeq jen přes rozšíření pro Chrome. Bez něj o nich neví – stránku v prohlížeči odjinud přečíst nelze.')}</p>
      <a class="link-inline" href="#/nastaveni">${tr('Nastavit rozšíření')} ${ICON.arrow}</a>
    </div>
  </li>`;
}

function bezPrepisuHtml(sessions) {
  const bezi = (state.runtimes || []).filter((r) => r.running && bezPrepisu(r.id, sessions));
  const lokalni = state.localAgents || [];
  const web = webBezRozsireniHtml();
  if (!bezi.length && !lokalni.length && !web) return '';
  const doba = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min` : `${Math.max(1, Math.floor(sec / 60))} min`);
  const pocet = bezi.length + lokalni.length + (web ? 1 : 0);
  return `<section class="card pad runtime-note" aria-labelledby="rt-h">
    <div class="sec-head"><h2 id="rt-h">${tr('Běží na Macu, ale bez přepisu')}</h2><span class="muted small">${pocet} ${plural(pocet, 'položka', 'položky', 'položek')}</span></div>
    <ul class="runtime-list">${web}${bezi.map((r) => {
    const i = BEZ_PREPISU[r.id];
    const konverzaci = sessions.filter((s) => pkey(s.provider) === pkey(r.provider)).length;
    return `<li>
        <span class="icon-tile">${glyph({ runtime: r.id, provider: r.provider })}<i class="status-dot status-working"></i></span>
        <div class="runtime-main">
          <b>${esc(r.name)}</b>
          <span class="muted small">${tr('běží')} ${doba(r.uptimeSec || 0)}${r.processes ? ` · ${r.processes} ${plural(r.processes, 'proces', 'procesy', 'procesů')}` : ''}${konverzaci ? ` ${tr('· {0} {1} od téhož poskytovatele', konverzaci, plural(konverzaci, 'sledovaná konverzace', 'sledované konverzace', 'sledovaných konverzací'))}` : ''}</span>
          <p class="small">${esc(i.duvod)}</p>
          <p class="small muted">${esc(i.rada)}</p>
        </div>
        <div class="runtime-actions">
          ${PREPNUTELNE.has(r.id) ? `<button class="btn btn--sm btn--primary" type="button" data-focus-runtime="${esc(r.id)}">${ICON.open}${tr('Přepnout do aplikace')}</button>` : ''}
          <a class="btn btn--sm" href="${esc(i.odkaz.href)}">${esc(i.odkaz.text)}</a>
        </div>
      </li>`;
  }).join('')}${lokalni.map(lokalniHtml).join('')}</ul>
  </section>`;
}

// Detekovaný lokální agent – od vlastního modelu z Hugging Face po ComfyUI. U rozpoznaných podle
// heuristiky říkáme narovinu, že je to odhad z běžícího procesu a že u nich Agenteeq neumí víc.
function lokalniHtml(a) {
  const jistota = a.confidence === 'vysoká';
  const detaily = [
    a.model ? `model ${a.model}` : '',
    a.port ? `port ${a.port}` : '',
    a.processes > 1 ? `${a.processes} ${plural(a.processes, 'proces', 'procesy', 'procesů')}` : '',
    typeof a.cpu === 'number' ? `CPU ${String(a.cpu).replace('.', ',')} %` : '',
  ].filter(Boolean).join(' · ');
  return `<li>
    <span class="icon-tile">${glyph({ provider: 'local' })}<i class="status-dot status-working"></i></span>
    <div class="runtime-main">
      <div class="custom-agent-head"><b>${esc(a.name)}</b><span class="badge${jistota ? '' : ' badge--beta'}">${jistota ? tr('Lokální model') : tr('Vlastní / neznámý')}</span></div>
      ${detaily ? `<span class="muted small">${esc(detaily)}</span>` : ''}
      ${a.note ? `<p class="small muted">${esc(a.note)}</p>` : ''}
    </div>
    ${a.port ? `<a class="btn btn--sm" href="#/nastaveni">${tr('Přidat jako agenta')}</a>` : '<span></span>'}
  </li>`;
}
const matchProject = (s) => (f.project === 'all' ? true : f.project === 'none' ? !s.projectId : s.projectId === f.project);
const rank = attentionRank;

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
  if (s.status === 'working') sub = `<span class="live-dot" aria-hidden="true"></span>${esc(s.activity || tr('Pracuje'))}`;
  else if (needsYou(s)) sub = `<span class="sub-alert">${esc(s.reason)}</span>`;
  else sub = `<code>${esc(shortPath(s.cwd) || s.url || s.app)}</code>`;
  const progress = s.progress?.total ? `<span class="row-progress" aria-label="${s.progress.done} ${tr('z {0} úkolů', s.progress.total)}"><i style="width:${((s.progress.done / s.progress.total) * 100).toFixed(1)}%"></i></span>` : '';
  const total = sessionTotal(s);
  const tag = f.project === 'all' ? projectTag(s) : '';
  const runs = taskRunCount(s);
  const cells = `
    <span class="cell-title"><b>${esc(s.title)}</b><span class="cell-sub">${tag}${runs > 1 ? `<span class="badge">${runs} ${tr('spuštění')}</span>` : ''}${sub}</span>${progress}</span>
    <span class="cell-app">${esc(s.app)}<small>${esc(s.model || (s.source === 'web' ? 'web' : '–'))}</small></span>
    <span class="cell-status">${statusPill(s.status)}</span>
    <span class="cell-num">${total ? fmtTok(total) : '–'}</span>
    <span class="cell-time" data-ago="${s.lastAt}">${rel(s.lastAt)}</span>`;
  if (f.selecting) {
    const checked = f.selected.has(s.id);
    return `<label class="row row--select${checked ? ' is-selected' : ''}" draggable="true" data-session-drag="${esc(s.id)}">
      <span class="icon-tile icon-tile--check"><input type="checkbox" data-select-session value="${esc(s.id)}"${checked ? ' checked' : ''} aria-label="${tr('Vybrat')} ${esc(s.title)}"></span>${cells}<span></span>
    </label>`;
  }
  const env = envOf(s);
  return `<a class="row" href="${agentHref(s.id)}" data-session-drag="${esc(s.id)}">
    <span class="icon-tile">${glyph(s)}<i class="status-dot status-${esc(s.status)}"></i><span class="env-badge">${env.icon}<span class="sr-only">${env.label}</span></span></span>${cells}${ICON.chev}
  </a>`;
}

function mount(el, _params, query) {
  v.el = el;
  applyQuery(query);
  el.innerHTML = `
    <div class="toolbar" data-enter style="--i:1">
      <div class="seg" role="group" aria-label="${tr('Filtrovat podle stavu')}" data-region="seg"></div>
      <label class="search-field">${ICON.search}<span class="sr-only">${tr('Hledat agenta')}</span><input type="search" data-q placeholder="${tr('Název, projekt, model, aplikace…')}" autocomplete="off"></label>
    </div>
    <div class="toolbar toolbar--sub" data-enter style="--i:2">
      <div class="seg seg--light" role="group" aria-label="${tr('Filtrovat podle zdroje')}" data-region="source"></div>
      <div class="chips" role="group" aria-label="${tr('Filtrovat podle poskytovatele')}" data-region="chips"></div>
    </div>
    <div class="toolbar toolbar--sub toolbar--projects" data-enter style="--i:3">
      <div class="chips chips--projects" role="group" aria-label="${tr('Filtrovat podle projektu')}" data-region="projects"></div>
      <button class="btn btn--sm" type="button" data-select-toggle>${ICON.check}<span data-region="select-label">${tr('Vybrat')}</span></button>
    </div>
    <div class="card table" data-enter style="--i:4" data-region="table"></div>
    <div data-enter style="--i:5" data-region="runtimes"></div>
    <div class="selbar" data-region="selbar" role="region" aria-label="${tr('Hromadné akce')}"></div>`;
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
    const focus = e.target.closest('[data-focus-runtime]');
    if (focus) {
      focus.disabled = true;
      try {
        const r = await api.focusRuntime(focus.dataset.focusRuntime);
        if (r.dry) toast(tr('Zkušební režim: {0} se nepřepnul', r.label), { tone: 'info' });
      } catch (err) {
        toast(err.message, { tone: 'err' });
      } finally {
        focus.disabled = false;
      }
      return;
    }
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
  const all = agentsList();
  if (f.project !== 'all' && f.project !== 'none' && !projectById(f.project)) f.project = 'all';
  const q = norm(f.q.trim());
  // Zdroj, poskytovatel a hledání platí i pro počty u projektů – jsou to nadřazené filtry.
  const matchFacets = (s) =>
    (f.source === 'all' || (f.source === 'web' ? s.source === 'web' : s.source !== 'web'))
    && (!f.providers.size || f.providers.has(pkey(s.provider)))
    && (!q || norm([s.title, s.project, s.cwd, s.app, s.model, s.branch, s.url, projectById(s.projectId)?.name].join(' ')).includes(q));
  const scoped = all.filter(matchFacets);
  const base = scoped.filter(matchProject);

  fill(el, 'seg', SEGMENTS.map(([k, label]) => {
    const count = base.filter((s) => matchStatus(s, k)).length;
    return `<button type="button" data-status-filter="${k}" aria-pressed="${f.status === k}"${k === 'needs_input' && count ? ' class="has-alert"' : ''}>${label}<span class="count">${count}</span></button>`;
  }).join(''));
  fill(el, 'source', [['all', tr('Všechny zdroje'), ''], ['local', ENV.local.short, ENV.local.icon], ['web', ENV.cloud.short, ENV.cloud.icon]]
    .map(([k, label, icon]) => `<button type="button" data-source-filter="${k}" aria-pressed="${f.source === k}">${icon}${label}</button>`).join(''));
  const present = Object.keys(PROVIDERS).filter((p) => all.some((s) => pkey(s.provider) === p));
  fill(el, 'chips', present
    .map((p) => `<button class="chip" type="button" data-provider-filter="${p}" aria-pressed="${f.providers.has(p)}">${glyph(p)}${esc(PROVIDERS[p].label)}</button>`).join(''));

  const projects = state.projects.items.filter((p) => !p.archived || p.id === f.project);
  const countIn = (pid) => scoped.filter((s) => s.projectId === pid).length;
  const noneCount = scoped.filter((s) => !s.projectId).length;
  fill(el, 'projects', projects.length
    ? `<span class="chips-label">${tr('Projekt')}</span>
      <button class="chip" type="button" data-project-filter="all" aria-pressed="${f.project === 'all'}">${tr('Všechny')}</button>
      ${projects.map((p) => `<button class="chip" type="button" data-project-filter="${esc(p.id)}" data-project-drop="${esc(p.id)}" aria-pressed="${f.project === p.id}">${pdot(p)}${esc(p.name)}<span class="count">${countIn(p.id)}</span></button>`).join('')}
      <button class="chip" type="button" data-project-filter="none" data-project-drop="__none" aria-pressed="${f.project === 'none'}">${tr('Bez projektu')}<span class="count">${noneCount}</span></button>
      <span class="chips-hint muted small">${tr('Konverzaci přetáhni na projekt')}</span>`
    : `<span class="chips-label">${tr('Projekt')}</span><a class="chip" href="#/projekty">${ICON.plus}${tr('Založ první projekt a třiď konverzace podle klientů')}</a>`);
  fill(el, 'select-label', f.selecting ? tr('Hotovo') : tr('Vybrat'));

  const list = base.filter((s) => matchStatus(s, f.status)).sort((a, b) => rank(a) - rank(b) || b.lastAt - a.lastAt);
  v.visible = list;
  for (const id of f.selected) if (!all.some((s) => s.id === id)) f.selected.delete(id);
  if (!all.length) {
    fill(el, 'table', emptyState({
      title: tr('Zatím tu nejsou žádní agenti'),
      text: tr('Spusť Claude Code, Codex, Cursor nebo otevři ChatGPT s rozšířením. Agent se tu objeví během vteřiny.'),
      action: `<a class="btn" href="#/nastaveni">${tr('Zkontrolovat zdroje dat')}</a>`,
    }));
  } else if (!list.length) {
    fill(el, 'table', emptyState({
      title: tr('Tomuto filtru neodpovídá žádný agent'),
      text: tr('Zkus jiný stav, zdroj, poskytovatele nebo projekt.'),
      action: `<button class="btn" type="button" data-clear>${tr('Zrušit filtry')}</button>`,
    }));
  } else {
    fill(el, 'table', `<div class="row row-head" aria-hidden="true"><span></span><span>${tr('Agent')}</span><span>${tr('Aplikace a model')}</span><span>${tr('Stav')}</span><span class="cell-num">${tr('Tokeny')}</span><span class="cell-time">${tr('Aktivita')}</span><span></span></div>
      ${list.map(rowHtml).join('')}`);
  }

  fill(el, 'runtimes', bezPrepisuHtml(all));

  const n = f.selected.size;
  fill(el, 'selbar', f.selecting
    ? `<div class="selbar-inner"><span><b>${n}</b> ${plural(n, 'vybraná', 'vybrané', 'vybraných')}</span>
        <button class="btn btn--sm btn--on-dark" type="button" data-bulk="all">${tr('Vybrat vše ({0})', list.length)}</button>
        ${n ? `<button class="btn btn--sm btn--on-dark" type="button" data-bulk="none">${tr('Zrušit výběr')}</button>` : ''}
        <button class="btn btn--sm btn--light" type="button" data-bulk="assign"${n ? '' : ' disabled'}>${ICON.folder}${tr('Zařadit do projektu')}</button></div>`
    : '');
}

export default {
  id: 'agenti',
  title: tr('Agenti'),
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
