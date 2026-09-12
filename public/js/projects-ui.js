import { state, setProjects, agentsList, projectSessions, projectById } from './state.js';
import { api } from './api.js';
import { esc, shortPath, plural } from './format.js';
import { ICON, glyph, logoKey } from './icons.js';
import { modal, toast } from './ui.js';
import { sessionTotal, needsYou } from './data.js';

export const projectHref = (id) => `#/projekt/${encodeURIComponent(id)}`;

export const pdot = (p, cls = '') => `<i class="pdot${cls ? ` ${cls}` : ''}" style="--pc:${esc(p?.color || '#B3AEBA')}" aria-hidden="true"></i>`;

export function projectTag(s) {
  const p = s.projectId ? projectById(s.projectId) : null;
  if (!p) return '';
  return `<span class="ptag" title="${esc(s.projectSource === 'folder' ? `Projekt ${p.name} (podle složky)` : `Projekt ${p.name}`)}">${pdot(p)}${esc(p.name)}</span>`;
}

export function projectStats(p, now = Date.now()) {
  const { live: liveAll, older } = projectSessions(p.id);
  const live = liveAll.filter((s) => !s.parentId || !state.sessions.has(s.parentId));
  const all = [...live, ...older];
  const since = now - 30 * 864e5;
  const logos = [];
  for (const s of all) {
    const k = logoKey(s) || s.app;
    if (!logos.some((x) => x.k === k)) logos.push({ k, s });
  }
  return {
    live,
    liveAll,
    older,
    total: all.length,
    working: live.filter((s) => s.status === 'working').length,
    needs: live.filter(needsYou).length,
    tokens: liveAll.filter((s) => s.lastAt >= since).reduce((a, s) => a + sessionTotal(s), 0),
    lastAt: all.reduce((m, s) => Math.max(m, s.lastAt || 0), 0),
    services: logos.map((x) => x.s),
  };
}

export const logoStack = (sessions, max = 5) => `<span class="discs discs--sm">${sessions.slice(0, max).map((s) => `<span class="disc" title="${esc(s.app)}">${glyph(s)}</span>`).join('')}${sessions.length > max ? `<span class="disc disc--more">+${sessions.length - max}</span>` : ''}</span>`;

export function recentFolders(limit = 6) {
  const seen = new Set();
  const out = [];
  for (const s of agentsList()) {
    if (s.source === 'web' || typeof s.cwd !== 'string' || !s.cwd.startsWith('/') || seen.has(s.cwd)) continue;
    seen.add(s.cwd);
    out.push(s.cwd);
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------- Procházení složek ---------- */

// Vloží prohlížeč složek do `root`. onPick(path) se zavolá po výběru.
export function folderBrowser(root, { onPick, start = '' }) {
  root.innerHTML = `<div class="fb">
    <div class="fb-crumbs" data-fb-crumbs></div>
    <ul class="fb-list" data-fb-list><li class="fb-empty"><span class="loader"></span></li></ul>
    <div class="fb-foot">
      <button class="btn btn--sm btn--primary" type="button" data-fb-pick disabled>${ICON.check}Vybrat tuto složku</button>
      <div class="fb-manual"><label class="sr-only" for="fb-in-${root.id}">Vlastní cesta</label>
        <input id="fb-in-${root.id}" type="text" data-fb-input placeholder="Nebo vlož cestu, např. /Volumes/Práce/klient" spellcheck="false" autocomplete="off">
        <button class="btn btn--sm" type="button" data-fb-manual>Použít</button></div>
    </div>
  </div>`;
  const list = root.querySelector('[data-fb-list]');
  const crumbs = root.querySelector('[data-fb-crumbs]');
  const pickBtn = root.querySelector('[data-fb-pick]');
  const input = root.querySelector('[data-fb-input]');
  let current = null;
  let seq = 0;

  async function go(p) {
    const my = ++seq;
    list.innerHTML = '<li class="fb-empty"><span class="loader"></span></li>';
    try {
      const r = await api.folders(p);
      if (my !== seq) return;
      current = r.path;
      pickBtn.disabled = false;
      const rel = r.path === r.home ? [] : r.path.slice(r.home.length + 1).split('/');
      let acc = r.home;
      crumbs.innerHTML = `<button type="button" class="fb-crumb" data-fb-go="${esc(r.home)}">${ICON.folder}Domů</button>${rel.map((seg) => {
        acc = `${acc}/${seg}`;
        return `<span class="fb-sep" aria-hidden="true">/</span><button type="button" class="fb-crumb" data-fb-go="${esc(acc)}">${esc(seg)}</button>`;
      }).join('')}`;
      list.innerHTML = r.dirs.length
        ? r.dirs.map((d) => `<li><button type="button" class="fb-item" data-fb-go="${esc(d.path)}">${ICON.folder}<span>${esc(d.name)}</span>${d.git ? '<span class="badge">Git</span>' : ''}${ICON.chev}</button></li>`).join('')
        : '<li class="fb-empty">Žádné podsložky. Můžeš vybrat tuto složku.</li>';
    } catch (err) {
      if (my !== seq) return;
      list.innerHTML = `<li class="fb-empty">${esc(err.message)}</li>`;
    }
  }

  root.addEventListener('click', (e) => {
    const g = e.target.closest('[data-fb-go]');
    if (g) { go(g.dataset.fbGo); return; }
    if (e.target.closest('[data-fb-pick]') && current) { onPick(current); return; }
    const recent = e.target.closest('[data-fb-recent]');
    if (recent) { onPick(recent.dataset.fbRecent); return; }
    if (e.target.closest('[data-fb-manual]')) {
      const v = input.value.trim();
      if (!v.startsWith('/')) { toast('Cesta musí začínat lomítkem, např. /Users/jana/klient.', { tone: 'velvet' }); input.focus(); return; }
      onPick(v);
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    root.querySelector('[data-fb-manual]').click();
  });
  go(start);
}

export function pickFolder({ title = 'Vybrat složku' } = {}) {
  let picked = null;
  const id = `fb${Math.random().toString(36).slice(2, 8)}`;
  const recents = recentFolders();
  const done = modal({
    title,
    wide: true,
    submitLabel: 'Zavřít',
    body: `${recents.length ? `<p class="form-sub">Nedávné složky agentů</p><div class="chips chips--wrap">${recents.map((f) => `<button type="button" class="chip" data-fb-recent="${esc(f)}">${ICON.folder}${esc(shortPath(f))}</button>`).join('')}</div><p class="form-sub">Procházet</p>` : ''}<div id="${id}"></div>`,
  });
  const root = document.getElementById(id);
  const scrim = root.closest('.modal-scrim');
  const pick = (p) => {
    picked = p;
    scrim.querySelector('[data-close]').click();
  };
  scrim.querySelector('.modal-body').addEventListener('click', (e) => {
    const r = e.target.closest('[data-fb-recent]');
    if (r && !root.contains(r)) pick(r.dataset.fbRecent);
  });
  folderBrowser(root, { onPick: pick });
  return done.then(() => picked);
}

/* ---------- Formulář projektu ---------- */

export function projectForm(existing = null) {
  const colors = state.projects.colors?.length ? state.projects.colors : ['#C2335A'];
  const used = new Set(state.projects.items.filter((p) => !p.archived).map((p) => p.color));
  const color = existing?.color || colors.find((c) => !used.has(c)) || colors[0];
  let folders = [...(existing?.folders || [])];
  const id = `pf${Math.random().toString(36).slice(2, 8)}`;
  const done = modal({
    title: existing ? 'Upravit projekt' : 'Nový projekt',
    submitLabel: existing ? 'Uložit změny' : 'Vytvořit projekt',
    wide: true,
    body: `<div class="form-grid">
        <label class="field field--wide"><span>Název</span><input name="name" type="text" maxlength="60" required value="${esc(existing?.name || '')}" placeholder="Např. Kavárna U Mostu — web"></label>
        <label class="field field--wide"><span>Popis <small class="muted">nepovinné</small></span><input name="description" type="text" maxlength="280" value="${esc(existing?.description || '')}" placeholder="Pro koho a co v projektu děláš"></label>
      </div>
      <p class="form-sub" id="${id}-color">Barva</p>
      <div class="swatches" role="radiogroup" aria-labelledby="${id}-color">${colors.map((c) => `<label class="swatch-opt" style="--pc:${esc(c)}"><input type="radio" name="color" value="${esc(c)}"${c === color ? ' checked' : ''}><span class="sr-only">${esc(c)}</span></label>`).join('')}</div>
      <p class="form-sub">Složky projektu</p>
      <p class="modal-text">Konverzace agentů spuštěných v těchto složkách (i podsložkách) se do projektu zařadí samy. Chaty z webu a ostatní přidáš ručně.</p>
      <ul class="folder-list" id="${id}-list"></ul>
      <input type="hidden" name="folders">
      <button class="btn btn--sm" type="button" id="${id}-add">${ICON.plus}Přidat složku</button>
      <div class="folder-browser" id="${id}-fb" hidden></div>`,
    onSubmit: async (form) => {
      const body = {
        name: form.elements.name.value,
        description: form.elements.description.value,
        color: form.elements.color.value,
        folders,
      };
      const r = existing ? await api.updateProject(existing.id, body) : await api.createProject(body);
      setProjects(r.projects);
      return r.project;
    },
  });
  const listEl = document.getElementById(`${id}-list`);
  const fb = document.getElementById(`${id}-fb`);
  const add = document.getElementById(`${id}-add`);
  const render = () => {
    listEl.innerHTML = folders.length
      ? folders.map((f, i) => `<li>${ICON.folder}<code title="${esc(f)}">${esc(shortPath(f))}</code><button type="button" class="icon-btn" data-remove="${i}" aria-label="Odebrat složku ${esc(shortPath(f))}">${ICON.close}</button></li>`).join('')
      : '<li class="folder-empty">Zatím žádná složka — projekt bude jen pro ručně zařazené konverzace.</li>';
  };
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    folders.splice(Number(b.dataset.remove), 1);
    render();
  });
  add.addEventListener('click', () => {
    if (!fb.hidden) { fb.hidden = true; return; }
    fb.hidden = false;
    folderBrowser(fb, {
      onPick: (p) => {
        if (!folders.includes(p)) folders.push(p);
        fb.hidden = true;
        render();
        add.focus();
      },
    });
  });
  render();
  return done;
}

/* ---------- Zařazení konverzací ---------- */

export async function assignDialog(sessionIds, { current = undefined } = {}) {
  const items = state.projects.items.filter((p) => !p.archived);
  const name = sessionIds.length === 1 ? 'konverzaci' : `${sessionIds.length} ${plural(sessionIds.length, 'konverzaci', 'konverzace', 'konverzací')}`;
  const opt = (value, label, sub, checked, dot = '') => `<label class="choice"><input type="radio" name="target" value="${esc(value)}"${checked ? ' checked' : ''}>${dot}<span class="choice-text"><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>`;
  const result = await modal({
    title: `Zařadit ${name} do projektu`,
    submitLabel: 'Zařadit',
    body: `<div class="choices">
        ${items.map((p) => opt(p.id, p.name, p.description, current === p.id, pdot(p))).join('')}
        ${opt('__new', 'Nový projekt…', '', !items.length, `<span class="choice-plus">${ICON.plus}</span>`)}
        <label class="field choice-new"><span class="sr-only">Název nového projektu</span><input name="newName" type="text" maxlength="60" placeholder="Název nového projektu"></label>
        <div class="choices-sep"></div>
        ${opt('__auto', 'Automaticky podle složky', 'Zruší ruční zařazení', false)}
        ${opt('__none', 'Mimo projekty', 'Nezařadí se ani podle složky', false)}
      </div>`,
    onSubmit: async (form) => {
      const target = form.elements.target.value;
      if (!target) throw Object.assign(new Error('Vyber projekt.'), {});
      let pid = target === '__auto' ? null : target === '__none' ? '' : target;
      let createdName = '';
      if (target === '__new') {
        const r = await api.createProject({ name: form.elements.newName.value }).catch((err) => {
          if (err.errors?.name) err.errors = { newName: err.errors.name };
          throw err;
        });
        pid = r.project.id;
        createdName = r.project.name;
        setProjects(r.projects);
      }
      const r = await api.assign(sessionIds, pid);
      setProjects(r.projects);
      return { projectId: pid, name: createdName || projectById(pid)?.name || '' };
    },
  });
  if (!result) return null;
  const msg = result.projectId === null ? 'Zařazení podle složky obnoveno' : result.projectId === '' ? 'Konverzace je mimo projekty' : `Zařazeno do projektu ${result.name}`;
  toast(msg, result.projectId ? { action: { label: 'Otevřít projekt', href: projectHref(result.projectId) } } : {});
  return result;
}

// Po zvolení „Nový projekt…“ se zaměří pole pro název.
document.addEventListener('change', (e) => {
  if (e.target.name !== 'target') return;
  const box = e.target.closest('.choices');
  const input = box?.querySelector('[name="newName"]');
  if (input && e.target.value === '__new') input.focus();
});
