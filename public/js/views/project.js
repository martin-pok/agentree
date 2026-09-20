import { state, setProjects, agentsList, projectById, projectSessions, launchIntent } from '../state.js';
import { api } from '../api.js';
import { esc, fmtTok, rel, norm, plural, shortPath, dateLong } from '../format.js';
import { glyph, ICON } from '../icons.js';
import { hbars } from '../charts.js';
import { fill, toast, statusPill, emptyState, agentHref, confirmDialog, modal, copy } from '../ui.js';
import { sessionTotal, needsYou } from '../data.js';
import { GRIP, applyOrder, saveOrder } from '../layout-prefs.js';
import { enableReorder } from '../reorder.js';
import { projectMark, projectStats, logoStack, projectForm, projectTag } from '../projects-ui.js';

const v = { el: null, id: null, filter: 'all', saveTimer: null, saving: false, savedAt: 0 };

const SEGMENTS = [['all', 'Vše'], ['needs', 'Potřebuje tebe'], ['working', 'Pracuje'], ['older', 'Starší']];

function rowHtml(s, now) {
  const sub = s.snapshot
    ? `<span>${esc(s.app)}</span><span class="dot-sep"></span><span>starší než 30 dní</span>`
    : `<span>${esc(s.app)}</span><span class="dot-sep"></span><span data-ago="${s.lastAt}">${rel(s.lastAt, now)}</span>${s.projectSource === 'folder' ? '<span class="dot-sep"></span><span title="Zařazeno automaticky podle složky">podle složky</span>' : ''}`;
  const actions = `<button class="icon-btn" type="button" data-unassign="${esc(s.id)}" aria-label="Odebrat z projektu: ${esc(s.title)}" data-tip="Odebrat z projektu">${ICON.close}</button>`;
  if (s.snapshot) {
    return `<li class="prow is-snapshot">
      <span class="icon-tile">${glyph(s)}</span>
      <span class="cell-title"><b>${esc(s.title)}</b><span class="cell-sub">${sub}</span></span>
      <span class="prow-meta">${s.lastAt ? dateLong(s.lastAt) : ''}</span>
      <span class="prow-actions">${s.url ? `<a class="icon-btn" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="Otevřít konverzaci" data-tip="Otevřít konverzaci">${ICON.external}</a>` : ''}${s.resume ? `<button class="icon-btn" type="button" data-copy="${esc(s.resume)}" data-copy-message="Příkaz pro pokračování zkopírován" aria-label="Kopírovat příkaz pro pokračování" data-tip="Kopírovat příkaz">${ICON.copy}</button>` : ''}${actions}</span>
    </li>`;
  }
  return `<li class="prow">
    <a class="prow-link" href="${agentHref(s.id)}">
      <span class="icon-tile">${glyph(s)}<i class="status-dot status-${esc(s.status)}"></i></span>
      <span class="cell-title"><b>${esc(s.title)}</b><span class="cell-sub">${s.status === 'working' && s.activity ? `<span class="live-dot"></span>${esc(s.activity)}` : sub}</span></span>
    </a>
    <span class="prow-meta">${statusPill(s.status)}<span class="prow-tok">${sessionTotal(s) ? fmtTok(sessionTotal(s)) : '–'}</span></span>
    <span class="prow-actions">${actions}</span>
  </li>`;
}

async function addSessionsDialog(p) {
  const candidates = agentsList().filter((s) => s.projectId !== p.id);
  if (!candidates.length) {
    toast('Všechny sledované konverzace už v projektu jsou.', { tone: 'info' });
    return;
  }
  const id = `add${Math.random().toString(36).slice(2, 8)}`;
  const done = modal({
    title: `Přidat konverzace do projektu ${p.name}`,
    submitLabel: 'Přidat vybrané',
    wide: true,
    body: `<label class="search-field search-field--block">${ICON.search}<span class="sr-only">Hledat konverzaci</span><input type="search" id="${id}-q" placeholder="Název, aplikace, složka…" autocomplete="off"></label>
      <p class="small muted" id="${id}-count" aria-live="polite">Vybráno 0</p>
      <ul class="pick-list" id="${id}-list">${candidates.map((s) => `<li data-hay="${esc(norm([s.title, s.app, s.cwd, s.url].join(' ')))}"><label class="pick">
        <input type="checkbox" name="sid" value="${esc(s.id)}">
        <span class="icon-tile">${glyph(s)}</span>
        <span class="cell-title"><b>${esc(s.title)}</b><span class="cell-sub">${esc(s.app)} · <span data-ago="${s.lastAt}">${rel(s.lastAt)}</span>${s.cwd ? ` · ${esc(shortPath(s.cwd))}` : ''}</span></span>
        ${projectTag(s)}
      </label></li>`).join('')}</ul>`,
    onSubmit: async (form) => {
      const ids = [...form.querySelectorAll('input[name="sid"]:checked')].map((x) => x.value);
      if (!ids.length) throw new Error('Vyber aspoň jednu konverzaci.');
      const r = await api.assign(ids, p.id);
      setProjects(r.projects);
      return ids.length;
    },
  });
  const q = document.getElementById(`${id}-q`);
  const list = document.getElementById(`${id}-list`);
  const count = document.getElementById(`${id}-count`);
  q.addEventListener('input', () => {
    const nq = norm(q.value.trim());
    for (const li of list.children) li.hidden = Boolean(nq) && !li.dataset.hay.includes(nq);
  });
  list.addEventListener('change', () => { count.textContent = `Vybráno ${list.querySelectorAll('input:checked').length}`; });
  const n = await done;
  if (n) toast(`${n} ${plural(n, 'konverzace přidána', 'konverzace přidány', 'konverzací přidáno')} do projektu`);
}

function saveNotes(textarea, statusEl) {
  clearTimeout(v.saveTimer);
  statusEl.textContent = 'Neuloženo…';
  v.saveTimer = setTimeout(async () => {
    const id = v.id;
    v.saving = true;
    statusEl.textContent = 'Ukládám…';
    try {
      const r = await api.updateProject(id, { notes: textarea.value });
      setProjects(r.projects);
      if (v.id === id) statusEl.textContent = 'Uloženo';
    } catch (err) {
      if (v.id === id) statusEl.textContent = 'Neuloženo';
      toast(err.message, { tone: 'velvet' });
    } finally {
      v.saving = false;
      v.saveTimer = null;
    }
  }, 700);
}

function mount(el, [id]) {
  Object.assign(v, { el, id, filter: 'all' });
  el.innerHTML = `<div class="project">
    <a class="back" href="#/projekty">${ICON.back}Všechny projekty</a>
    <header class="project-head" data-region="head"></header>
    <div class="kpis kpis--project" data-region="kpis"></div>
    <div class="project-grid">
      <section class="card project-list" aria-labelledby="pl-h">
        <div class="project-list-bar"><h2 id="pl-h">Konverzace</h2><div class="seg seg--light" role="group" aria-label="Filtrovat konverzace" data-region="seg"></div>
          <button class="btn btn--sm" type="button" data-action="add">${ICON.plus}Přidat konverzace</button></div>
        <ul class="prows" data-region="rows"></ul>
      </section>
      <aside class="session-side" data-region="pside">
        <section class="card side-card" data-card="brief" aria-labelledby="brief-h">${GRIP}
          <div class="side-head"><h3 id="brief-h">Podklady a poznámky</h3><span class="small muted" data-notes-status aria-live="polite"></span></div>
          <label class="sr-only" for="brief-${esc(id)}">Podklady projektu</label>
          <textarea class="brief" id="brief-${esc(id)}" data-notes maxlength="20000" placeholder="Cíl, tón, značka, kontakty, rozhodnutí… Při spuštění agenta z projektu je můžeš připojit k zadání."></textarea>
          <div class="side-actions"><button class="btn btn--sm" type="button" data-action="copy-brief">${ICON.copy}Kopírovat podklady</button></div>
        </section>
        <section class="card side-card" data-card="folders" aria-label="Složky projektu">${GRIP}<div data-region="folders"></div></section>
        <section class="card side-card" data-card="services" aria-label="Služby v projektu">${GRIP}<div data-region="services"></div></section>
      </aside>
    </div>
  </div>`;
  const pside = el.querySelector('[data-region="pside"]');
  applyOrder(pside, '.side-card[data-card]', 'projectSide');
  pside.dataset.liftScale = '1.02';
  enableReorder(pside, {
    itemSelector: '.side-card[data-card]',
    idOf: (n) => n.dataset.card,
    handle: '[data-grip]',
    onCommit: (ids) => { if (ids) saveOrder('projectSide', ids); else applyOrder(pside, '.side-card[data-card]', 'projectSide'); },
  });
  const textarea = el.querySelector('[data-notes]');
  const status = el.querySelector('[data-notes-status]');
  textarea.value = projectById(id)?.notes || '';
  textarea.addEventListener('input', () => saveNotes(textarea, status));

  el.addEventListener('click', async (e) => {
    const p = projectById(v.id);
    if (!p) return;
    const seg = e.target.closest('[data-filter]');
    if (seg) { v.filter = seg.dataset.filter; update(); return; }
    const un = e.target.closest('[data-unassign]');
    if (un) {
      un.disabled = true;
      try {
        const r = await api.assign([un.dataset.unassign], '');
        setProjects(r.projects);
        toast('Konverzace odebrána z projektu', { action: { label: 'Vrátit', href: `#/projekt/${encodeURIComponent(p.id)}?vratit=${encodeURIComponent(un.dataset.unassign)}` } });
      } catch (err) {
        un.disabled = false;
        toast(err.message, { tone: 'velvet' });
      }
      return;
    }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    try {
      switch (a.dataset.action) {
        case 'add': await addSessionsDialog(p); break;
        case 'edit': { const r = await projectForm(p); if (r) toast('Projekt uložen'); break; }
        case 'launch':
          Object.assign(launchIntent, { projectId: p.id, focus: true });
          location.hash = '#/prehled';
          break;
        case 'copy-brief':
          if (!textarea.value.trim()) { toast('Podklady jsou zatím prázdné.', { tone: 'info' }); textarea.focus(); break; }
          await copy(`Podklady projektu ${p.name}:\n${textarea.value.trim()}`, 'Podklady zkopírovány – vlož je do zadání agenta');
          break;
        case 'archive': {
          const r = await api.updateProject(p.id, { archived: !p.archived });
          setProjects(r.projects);
          toast(p.archived ? 'Projekt obnoven z archivu' : 'Projekt archivován');
          break;
        }
        case 'delete':
          if (await confirmDialog({ title: `Smazat projekt ${p.name}?`, message: 'Konverzace zůstanou v Agenteeq, jen přestanou být zařazené v tomto projektu. Podklady a poznámky projektu se smažou.', confirmLabel: 'Smazat projekt', danger: true })) {
            await api.deleteProject(p.id);
            location.hash = '#/projekty';
            toast(`Projekt ${p.name} smazán`);
          }
          break;
        default:
      }
    } catch (err) {
      toast(err.message, { tone: 'velvet', timeout: 8000 });
    }
  });
}

async function query(q) {
  const back = q?.get('vratit');
  if (!back || !v.id) return;
  history.replaceState(null, '', `#/projekt/${encodeURIComponent(v.id)}`);
  try {
    const r = await api.assign([back], v.id);
    setProjects(r.projects);
    toast('Konverzace vrácena do projektu');
  } catch (err) {
    toast(err.message, { tone: 'velvet' });
  }
}

function update() {
  const el = v.el;
  if (!el) return;
  const p = projectById(v.id);
  if (!p) {
    fill(el, 'head', emptyState({ title: 'Projekt nenalezen', text: 'Mohl být smazán v jiném okně.', action: '<a class="btn" href="#/projekty">Zpět na projekty</a>' }));
    for (const r of ['kpis', 'seg', 'rows', 'folders', 'services']) fill(el, r, '');
    el.querySelector('.project-grid').hidden = true;
    return;
  }
  el.querySelector('.project-grid').hidden = false;
  const now = Date.now();
  const st = projectStats(p, now);

  fill(el, 'head', `
    <div class="project-kicker">${projectMark(p, 'pdot--lg')}<span>Projekt</span>${p.archived ? '<span class="badge">Archiv</span>' : ''}<span class="dot-sep"></span><span>založen ${dateLong(p.createdAt)}</span></div>
    <h2 class="session-title">${esc(p.name)}</h2>
    ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
    <div class="session-actions">
      <button class="btn btn--primary" type="button" data-action="launch">${ICON.spark}Spustit agenta v projektu</button>
      <button class="btn" type="button" data-action="edit">${ICON.sliders}Upravit</button>
      <a class="btn" href="/api/projects/${encodeURIComponent(p.id)}/export" download>${ICON.down}Export CSV</a>
      <button class="btn" type="button" data-action="archive">${p.archived ? 'Obnovit z archivu' : 'Archivovat'}</button>
      <button class="icon-btn icon-btn--line" type="button" data-action="delete" aria-label="Smazat projekt" data-tip="Smazat projekt">${ICON.trash}</button>
    </div>`);

  fill(el, 'kpis', `
    <div class="card kpi"><span class="eyebrow">Konverzace</span><span class="val">${st.total}</span><small>${st.older.length ? `z toho ${st.older.length} starších` : 'žádná starší než 30 dní'}</small></div>
    <div class="card kpi"><span class="eyebrow">Právě pracuje</span><span class="val">${st.working}</span><small>${st.needs ? `<span class="sub-alert">${st.needs} ${plural(st.needs, 'čeká', 'čekají', 'čeká')} na tebe</span>` : 'nikdo nečeká'}</small></div>
    <div class="card kpi"><span class="eyebrow">Tokeny · 30 dní</span><span class="val">${st.tokens ? fmtTok(st.tokens) : '0'}</span><small>vstup a výstup</small></div>
    <div class="card kpi"><span class="eyebrow">Služby</span><span class="kpi-logos">${st.services.length ? logoStack(st.services, 6) : '<span class="muted">–</span>'}</span><small>${st.lastAt ? `aktivita <span data-ago="${st.lastAt}">${rel(st.lastAt, now)}</span>` : 'zatím bez aktivity'}</small></div>`);

  const counts = {
    all: st.total,
    needs: st.needs,
    working: st.working,
    older: st.older.length,
  };
  fill(el, 'seg', SEGMENTS.filter(([k]) => k === 'all' || counts[k]).map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="${v.filter === k}">${label}<span class="count">${counts[k]}</span></button>`).join(''));
  if (v.filter !== 'all' && !counts[v.filter]) v.filter = 'all';

  const rows = v.filter === 'older' ? st.older
    : v.filter === 'needs' ? st.live.filter(needsYou)
      : v.filter === 'working' ? st.live.filter((s) => s.status === 'working')
        : [...st.live, ...st.older];
  fill(el, 'rows', rows.length
    ? rows.map((s) => rowHtml(s, now)).join('')
    : `<li>${emptyState({ title: 'Projekt je zatím prázdný', text: p.folders.length ? 'Jakmile agent začne pracovat ve složce projektu, objeví se tady. Nebo přidej existující konverzace.' : 'Přidej konverzace z libovolné služby, nebo projektu nastav složku pro automatické zařazení.', action: '<button class="btn btn--primary" type="button" data-action="add">Přidat konverzace</button>' })}</li>`);

  fill(el, 'folders', `<div class="side-head"><h3>Složky projektu</h3><button class="link" type="button" data-action="edit">Upravit</button></div>
    ${p.folders.length
      ? `<ul class="folder-list folder-list--plain">${p.folders.map((f) => `<li>${ICON.folder}<code title="${esc(f)}">${esc(shortPath(f))}</code><button class="icon-btn" type="button" data-copy="${esc(f)}" data-copy-message="Cesta zkopírována" aria-label="Kopírovat cestu">${ICON.copy}</button></li>`).join('')}</ul>
         <p class="small muted">Agenti spuštění v těchto složkách se zařadí automaticky.</p>`
      : '<p class="small muted">Bez složky – do projektu patří jen ručně zařazené konverzace.</p>'}`);

  const byApp = new Map();
  for (const s of st.liveAll) byApp.set(s.app, (byApp.get(s.app) || 0) + sessionTotal(s));
  const bars = [...byApp.entries()].filter(([, val]) => val > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  fill(el, 'services', `<div class="side-head"><h3>Tokeny podle služby</h3></div>
    ${bars.length ? hbars(bars.map(([label, value]) => ({ label, value, color: p.color }))) : '<p class="small muted">Za posledních 30 dní zatím žádné tokeny.</p>'}`);

  const textarea = el.querySelector('[data-notes]');
  if (document.activeElement !== textarea && !v.saveTimer && !v.saving && textarea.value !== p.notes) textarea.value = p.notes;
}

export default {
  id: 'projekt',
  title: 'Projekt',
  mount,
  update,
  query,
  unmount() {
    if (v.saveTimer) {
      clearTimeout(v.saveTimer);
      const textarea = v.el?.querySelector('[data-notes]');
      if (textarea) api.updateProject(v.id, { notes: textarea.value }).then((r) => { setProjects(r.projects); }).catch(() => {});
    }
    Object.assign(v, { el: null, id: null, saveTimer: null });
  },
};
