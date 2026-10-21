import { state, setProjects, agentsList, projectSessions, projectById } from './state.js';
import { api } from './api.js';
import { esc, shortPath, plural, jeAbsolutniCesta, castiCesty } from './format.js';
import { ICON, glyph, logoKey } from './icons.js';
import { modal, toast, infoTip, sTipem } from './ui.js';
import { openCropper, TARGETS } from './cropper.js';
import { tokensSince, needsYou } from './data.js';
import { tr } from './i18n.js';
import { SABLONY_PROJEKTU, stitkyZTextu } from './sablony.js';

/** Všechny štítky aktivních projektů, seřazené – pro našeptávání a filtr. */
export function vsechnyStitky() {
  const m = new Map();
  for (const p of state.projects.items) if (!p.archived) for (const t of p.tags || []) if (!m.has(t.toLowerCase())) m.set(t.toLowerCase(), t);
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}

// Rada u ručně zadané cesty musí ukazovat tvar, který na daném systému opravdu platí.
// Server posílá domovskou složku, takže se pozná z ní – ne z prohlížeče, ten běží
// klidně na telefonu s Androidem, zatímco Agenteeq je na Macu.
const jeWindowsHost = () => String(state.host?.home || '').includes('\\');
const CESTA_RADA = () => (jeWindowsHost()
  ? tr('Zadej celou cestu, např. C:\\Users\\jana\\klient.')
  : tr('Zadej celou cestu, např. /Users/jana/klient.'));

export const projectHref = (id) => `#/projekt/${encodeURIComponent(id)}`;

// Barva projektu, jak se kreslí na kartě. Nejtmavší vzorek palety (#16141D) by v tmavém režimu
// splynul s kartou (kontrast ~1 : 1) – kreslí se proto barvou textu, která se s režimem obrací.
// Uložená hodnota projektu zůstává beze změny.
export const INKOUST_PROJEKTU = '#16141D';
export const barvaProjektu = (c) => (c === INKOUST_PROJEKTU ? 'var(--ink)' : c || '#B3AEBA');

export const pdot = (p, cls = '') => `<i class="pdot${cls ? ` ${cls}` : ''}" style="--pc:${esc(barvaProjektu(p?.color))}" aria-hidden="true"></i>`;

export function projectTag(s) {
  const p = s.projectId ? projectById(s.projectId) : null;
  if (!p) return '';
  return `<span class="ptag" title="${esc(s.projectSource === 'folder' ? tr('Projekt {0} (podle složky)', p.name) : `${tr('Projekt')} ${p.name}`)}">${pdot(p)}${esc(p.name)}</span>`;
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
    // Jen tokeny spotřebované za 30 dní – ne celá historie konverzací, které v nich jen něco dělaly.
    tokens: tokensSince(liveAll, since),
    lastAt: all.reduce((m, s) => Math.max(m, s.lastAt || 0), 0),
    services: logos.map((x) => x.s),
  };
}

export const logoStack = (sessions, max = 5) => `<span class="discs discs--sm">${sessions.slice(0, max).map((s) => `<span class="disc" title="${esc(s.app)}">${glyph(s)}</span>`).join('')}${sessions.length > max ? `<span class="disc disc--more">+${sessions.length - max}</span>` : ''}</span>`;

export function recentFolders(limit = 6) {
  const seen = new Set();
  const out = [];
  for (const s of agentsList()) {
    if (s.source === 'web' || typeof s.cwd !== 'string' || !jeAbsolutniCesta(s.cwd) || seen.has(s.cwd)) continue;
    seen.add(s.cwd);
    out.push(s.cwd);
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------- Procházení složek ---------- */

// Načítání seznamu složek: malá hlava robota a stav i pro čtečku obrazovky.
const NACITANI_SLOZEK = () => `<li class="fb-empty" role="status"><span class="loader" aria-hidden="true"></span><span class="sr-only">${tr('Načítám…')}</span></li>`;

// Vloží prohlížeč složek do `root`. onPick(path) se zavolá po výběru.
export function folderBrowser(root, { onPick, start = '' }) {
  root.innerHTML = `<div class="fb">
    <div class="fb-crumbs" data-fb-crumbs></div>
    <ul class="fb-list" data-fb-list>${NACITANI_SLOZEK()}</ul>
    <div class="fb-foot">
      <button class="btn btn--sm btn--primary" type="button" data-fb-pick disabled>${ICON.check}${tr('Vybrat tuto složku')}</button>
      <div class="fb-manual"><label class="sr-only" for="fb-in-${root.id}">${tr('Vlastní cesta')}</label>
        <input id="fb-in-${root.id}" type="text" data-fb-input placeholder="${tr('Nebo vlož cestu, např. /Volumes/Práce/klient')}" spellcheck="false" autocomplete="off">
        <button class="btn btn--sm" type="button" data-fb-manual>${tr('Použít')}</button></div>
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
    list.innerHTML = NACITANI_SLOZEK();
    try {
      const r = await api.folders(p);
      if (my !== seq) return;
      current = r.path;
      pickBtn.disabled = false;
      const rel = r.path === r.home ? [] : castiCesty(r.path.slice(r.home.length + 1));
      // Cesta se skládá tím oddělovačem, kterým ji poslal server. Natvrdo lomítko by
      // na Windows vyrobilo „C:\\Users\\jana/web“ – kříženec, kterým se nikam nedostaneme.
      const sep = r.home.includes('\\') ? '\\' : '/';
      let acc = r.home;
      crumbs.innerHTML = `<button type="button" class="fb-crumb" data-fb-go="${esc(r.home)}">${ICON.folder}${tr('Domů')}</button>${rel.map((seg) => {
        acc = `${acc}${sep}${seg}`;
        return `<span class="fb-sep" aria-hidden="true">/</span><button type="button" class="fb-crumb" data-fb-go="${esc(acc)}">${esc(seg)}</button>`;
      }).join('')}`;
      list.innerHTML = r.dirs.length
        ? r.dirs.map((d) => `<li><button type="button" class="fb-item" data-fb-go="${esc(d.path)}">${ICON.folder}<span>${esc(d.name)}</span>${d.git ? '<span class="badge">Git</span>' : ''}${ICON.chev}</button></li>`).join('')
        : `<li class="fb-empty">${tr('Žádné podsložky. Můžeš vybrat tuto složku.')}</li>`;
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
      if (!jeAbsolutniCesta(v)) { toast(CESTA_RADA(), { tone: 'err' }); input.focus(); return; }
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

export function pickFolder({ title = tr('Vybrat složku') } = {}) {
  let picked = null;
  const id = `fb${Math.random().toString(36).slice(2, 8)}`;
  const recents = recentFolders();
  const done = modal({
    title,
    wide: true,
    submitLabel: tr('Zavřít'),
    body: `${recents.length ? `<p class="form-sub">${tr('Nedávné složky agentů')}</p><div class="chips chips--wrap">${recents.map((f) => `<button type="button" class="chip" data-fb-recent="${esc(f)}">${ICON.folder}${esc(shortPath(f))}</button>`).join('')}</div><p class="form-sub">${tr('Procházet')}</p>` : ''}<div id="${id}"></div>`,
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

/* ---------- Obrázky projektu (náhled karty a logo) ---------- */

export const mediaUrl = (p, kind) => (p?.[kind]?.file ? `/api/projects/${encodeURIComponent(p.id)}/media/${kind}?f=${encodeURIComponent(p[kind].file)}` : '');

// Náhled karty: nahraný obrázek, jinak přechod podle vybraného pozadí. Barva projektu zůstává
// jen jako jemný pruh při spodní hraně, aby se karty dál rozlišily i bez obrázku.
export const projectCover = (p, cls = '') => {
  const url = mediaUrl(p, 'cover');
  return `<span class="pcover cover--${esc(p?.cover?.preset || 'aurora')}${cls ? ` ${cls}` : ''}" style="--pc:${esc(barvaProjektu(p?.color))}" aria-hidden="true">${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" draggable="false">` : ''}</span>`;
};

// Logo klienta nahrazuje barevnou tečku. Logo s vlastním tvarem (neprůhledná ikona se zaoblenými
// rohy) se ukáže samo, bez dlaždice: dřív pod jeho kulatějšími rohy prosvítala bílá dlaždice
// a dvojitý prstenec v jiném poloměru („rámování v rozích“). Průhledný znak dostane bílou dlaždici,
// aby byl čitelný i v tmavém režimu. Druh loga se pozná z obrázku po načtení a pamatuje se.
const druhLoga = new Map();
export const projectMark = (p, cls = '') => {
  const url = mediaUrl(p, 'logo');
  const druh = druhLoga.get(url);
  return url
    ? `<span class="plogo${druh ? ` plogo--${druh}` : ''}${cls ? ` ${cls}` : ''}" style="--pc:${esc(barvaProjektu(p.color))}" aria-hidden="true"><img src="${esc(url)}" alt="" loading="lazy" decoding="async" draggable="false" data-plogo></span>`
    : pdot(p, cls);
};

/** Druh loga z pixelů: „tvar“ = rohy průhledné, střed plný (ikona s vlastním obrysem); „znak“ = převážně
 *  průhledný glyf; „plne“ = vyplňuje celý čtverec. Čisté kvůli testům. */
export function druhZPixelu(alfa, n) {
  const a = (x, y) => alfa[y * n + x];
  const rohy = [a(0, 0), a(n - 1, 0), a(0, n - 1), a(n - 1, n - 1)];
  if (rohy.every((v) => v > 240)) return 'plne';
  let plnych = 0;
  for (let y = 1; y < n - 1; y += 1) for (let x = 1; x < n - 1; x += 1) if (a(x, y) > 240) plnych += 1;
  return plnych / ((n - 2) * (n - 2)) > 0.85 ? 'tvar' : 'znak';
}

function zaradLogo(img) {
  const url = img.getAttribute('src');
  let druh = druhLoga.get(url);
  if (!druh) {
    try {
      const n = 12;
      const c = document.createElement('canvas');
      c.width = n; c.height = n;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, n, n);
      const d = ctx.getImageData(0, 0, n, n).data;
      druh = druhZPixelu(Array.from({ length: n * n }, (_, i) => d[i * 4 + 3]), n);
    } catch { druh = 'znak'; }
    druhLoga.set(url, druh);
  }
  const tile = img.closest('.plogo');
  tile?.classList.remove('plogo--plne', 'plogo--tvar', 'plogo--znak');
  tile?.classList.add(`plogo--${druh}`);
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('load', (e) => { if (e.target?.matches?.('img[data-plogo]')) zaradLogo(e.target); }, true);
}

/* ---------- Formulář projektu ---------- */

export function projectForm(existing = null) {
  const colors = state.projects.colors?.length ? state.projects.colors : ['#C2335A'];
  const used = new Set(state.projects.items.filter((p) => !p.archived).map((p) => p.color));
  const color = existing?.color || colors.find((c) => !used.has(c)) || colors[0];
  let folders = [...(existing?.folders || [])];
  const pending = { cover: null, logo: null }; // {blob, url} | 'remove' | null
  const id = `pf${Math.random().toString(36).slice(2, 8)}`;
  const done = modal({
    title: existing ? tr('Upravit projekt') : tr('Nový projekt'),
    submitLabel: existing ? tr('Uložit změny') : tr('Vytvořit projekt'),
    wide: true,
    size: 'project',
    body: `<div class="pf-hlavni"><div class="form-grid">
        <label class="field field--wide"><span>${tr('Název')}</span><input name="name" type="text" maxlength="60" required value="${esc(existing?.name || '')}" placeholder="${tr('Např. Kavárna U Mostu – web')}"></label>
        <label class="field"><span>${tr('Popis')} <small class="muted">${tr('nepovinné')}</small></span><input name="description" type="text" maxlength="280" value="${esc(existing?.description || '')}" placeholder="${tr('Pro koho a co v projektu děláš')}"></label>
        <label class="field"><span>${tr('Štítky')} <small class="muted">${tr('odděl čárkou')}</small></span><input name="tags" type="text" maxlength="220" value="${esc((existing?.tags || []).join(', '))}" placeholder="${tr('Např. klient, web, Q4')}" list="${id}-tags" autocomplete="off"><datalist id="${id}-tags">${vsechnyStitky().map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist></label>
      </div>
      ${existing ? '' : `<p class="form-sub" id="${id}-tpl">${tr('Šablona')} <small class="muted">${tr('předvyplní podklady a štítek')}</small></p>
      <div class="tpl-picks" role="radiogroup" aria-labelledby="${id}-tpl">${SABLONY_PROJEKTU().map((t, i) => `<label class="tpl-pick"><input type="radio" name="template" value="${t.id}"${i ? '' : ' checked'}><span>${esc(t.label)}</span></label>`).join('')}</div>`}
      <p class="form-sub" id="${id}-color">${tr('Barva')}</p>
      <div class="swatches" role="radiogroup" aria-labelledby="${id}-color">${colors.map((c) => `<label class="swatch-opt" style="--pc:${esc(barvaProjektu(c))}"><input type="radio" name="color" value="${esc(c)}"${c === color ? ' checked' : ''}><span class="sr-only">${esc(c)}</span></label>`).join('')}</div>
      <details class="src-fold pf-vzhled"${existing?.cover?.file || existing?.logo?.file ? ' open' : ''}><summary>${tr('Obrázek karty a logo klienta')}</summary>
      <div class="media-picks">
        ${['cover', 'logo'].map((kind) => `<div class="media-pick" data-media="${kind}">
          <span class="media-thumb media-thumb--${kind}" data-media-thumb></span>
          <span class="media-text"><b>${kind === 'cover' ? tr('Obrázek karty') : tr('Logo klienta')}${infoTip(TARGETS[kind].hint)}</b><small>${esc(TARGETS[kind].kratce)}</small></span>
          <span class="media-actions"><button class="btn btn--sm" type="button" data-media-pick>${tr('Nahrát')}</button><button class="btn btn--sm" type="button" data-media-remove hidden>${tr('Odebrat')}</button></span>
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden data-media-file>
          <div class="media-crop" data-media-crop hidden></div>
        </div>`).join('')}
      </div></details></div>
      <div class="pf-slozky-head"><p class="form-sub">${sTipem(tr('Složky projektu'), tr('Konverzace ze složek projektu (i podsložek) se zařadí samy, ostatní přidáš ručně.'))}</p>
        <button class="btn btn--sm" type="button" id="${id}-add" aria-expanded="false">${ICON.plus}${tr('Přidat složku')}</button></div>
      <ul class="folder-list" id="${id}-list"></ul>
      <input type="hidden" name="folders">
      <div class="folder-browser" id="${id}-fb" hidden></div>`,
    onSubmit: async (form) => {
      if ([...document.querySelectorAll('[data-media-crop]')].some((h) => !h.hidden)) throw new Error(tr('Dokonči výřez obrázku: Použít výřez, nebo Zrušit.'));
      const body = {
        name: form.elements.name.value,
        description: form.elements.description.value,
        color: form.elements.color.value,
        folders,
        tags: stitkyZTextu(form.elements.tags.value),
      };
      // Šablona nového projektu: kostra podkladů a výchozí štítek (když žádný nezadal).
      const sablona = !existing && SABLONY_PROJEKTU().find((t) => t.id === form.elements.template?.value);
      if (sablona?.brief) body.notes = sablona.brief;
      if (sablona && !body.tags.length) body.tags = sablona.tags;
      const r = existing ? await api.updateProject(existing.id, body) : await api.createProject(body);
      setProjects(r.projects);
      // Projekt už je uložený. Obrázek, který selže, proto neshodí celý formulář – opakované
      // odeslání by založilo druhý projekt. Uživatel se o chybě dozví a obrázek může nahrát znovu.
      for (const kind of ['cover', 'logo']) {
        const want = pending[kind];
        if (!want) continue;
        try {
          const out = want === 'remove' ? await api.removeProjectMedia(r.project.id, kind) : await api.setProjectMedia(r.project.id, kind, want.blob);
          setProjects(out.projects);
        } catch (err) {
          toast(`${tr('Projekt je uložený, ale {0} se nenahrálo:', kind === 'cover' ? tr('obrázek karty') : 'logo')} ${err.message}`, { tone: 'err', timeout: 9000 });
        }
      }
      return projectById(r.project.id) || r.project;
    },
  });
  const paintMedia = (kind) => {
    const row = document.querySelector(`.media-pick[data-media="${kind}"]`);
    if (!row) return;
    const want = pending[kind];
    const stored = existing?.[kind]?.file && want !== 'remove';
    const thumb = row.querySelector('[data-media-thumb]');
    if (want && want !== 'remove') thumb.innerHTML = `<img src="${esc(want.url)}" alt="">`;
    else if (stored) thumb.innerHTML = `<img src="${esc(mediaUrl(existing, kind))}" alt="">`;
    else thumb.innerHTML = kind === 'cover' ? projectCover({ color: existing?.color, cover: existing?.cover || { preset: 'aurora' } }) : `<span class="media-empty">${ICON.plus}</span>`;
    row.querySelector('[data-media-remove]').hidden = !(stored || (want && want !== 'remove'));
    row.querySelector('[data-media-pick]').textContent = stored || (want && want !== 'remove') ? tr('Změnit') : tr('Nahrát');
  };
  for (const row of document.querySelectorAll('.media-pick')) {
    const kind = row.dataset.media;
    const input = row.querySelector('[data-media-file]');
    row.querySelector('[data-media-pick]').addEventListener('click', () => input.click());
    row.querySelector('[data-media-remove]').addEventListener('click', () => {
      pending[kind] = existing?.[kind]?.file ? 'remove' : null;
      paintMedia(kind);
    });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        const result = await openCropper(row.querySelector('[data-media-crop]'), kind, file);
        if (result) {
          pending[kind] = result;
          paintMedia(kind);
        }
      } catch (err) {
        toast(err.message, { tone: 'err' });
      }
    });
    paintMedia(kind);
  }
  const listEl = document.getElementById(`${id}-list`);
  const fb = document.getElementById(`${id}-fb`);
  const add = document.getElementById(`${id}-add`);
  const render = () => {
    listEl.innerHTML = folders.length
      ? folders.map((f, i) => `<li>${ICON.folder}<code title="${esc(f)}">${esc(shortPath(f))}</code><button type="button" class="icon-btn" data-remove="${i}" aria-label="${tr('Odebrat složku')} ${esc(shortPath(f))}">${ICON.close}</button></li>`).join('')
      : '';
  };
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    folders.splice(Number(b.dataset.remove), 1);
    render();
  });
  // Výběr složky je samostatný krok: zbytek formuláře se na tu chvíli schová, aby se prohlížeč
  // vešel do okna bez rolování celého dialogu. Stejné tlačítko vede zpátky.
  const hlavni = add.closest('.modal')?.querySelector('.pf-hlavni');
  const vyber = (otevrit) => {
    fb.hidden = !otevrit;
    if (hlavni) hlavni.hidden = otevrit;
    add.setAttribute('aria-expanded', String(otevrit));
    add.innerHTML = otevrit ? `${ICON.back}${tr('Zpět k projektu')}` : `${ICON.plus}${tr('Přidat složku')}`;
  };
  add.addEventListener('click', () => {
    if (!fb.hidden) { vyber(false); return; }
    vyber(true);
    folderBrowser(fb, {
      onPick: (p) => {
        if (!folders.includes(p)) folders.push(p);
        vyber(false);
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
    title: tr('Zařadit {0} do projektu', name),
    submitLabel: sessionIds.length > 1 ? tr('Zařadit vybrané ({0})', sessionIds.length) : tr('Zařadit'),
    body: `<div class="choices">
        ${items.map((p) => opt(p.id, p.name, p.description, current === p.id, pdot(p))).join('')}
        ${opt('__new', tr('Nový projekt…'), '', !items.length, `<span class="choice-plus">${ICON.plus}</span>`)}
        <label class="field choice-new"><span class="sr-only">${tr('Název nového projektu')}</span><input name="newName" type="text" maxlength="60" placeholder="${tr('Název nového projektu')}"></label>
        <div class="choices-sep"></div>
        ${opt('__auto', tr('Automaticky podle složky'), tr('Zruší ruční zařazení'), false)}
        ${opt('__none', tr('Mimo projekty'), tr('Nezařadí se ani podle složky'), false)}
      </div>`,
    onSubmit: async (form) => {
      const target = form.elements.target.value;
      if (!target) throw Object.assign(new Error(tr('Vyber projekt.')), {});
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
  const msg = result.projectId === null ? tr('Zařazení podle složky obnoveno') : result.projectId === '' ? tr('Konverzace je mimo projekty') : `${tr('Zařazeno do projektu')} ${result.name}`;
  toast(msg, result.projectId ? { action: { label: tr('Otevřít projekt'), href: projectHref(result.projectId) } } : {});
  return result;
}

// Po zvolení „Nový projekt…“ se zaměří pole pro název.
document.addEventListener('change', (e) => {
  if (e.target.name !== 'target') return;
  const box = e.target.closest('.choices');
  const input = box?.querySelector('[name="newName"]');
  if (input && e.target.value === '__new') input.focus();
});
