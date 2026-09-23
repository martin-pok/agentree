import { state, setProjects, agentsList } from '../state.js';
import { api } from '../api.js';
import { esc, fmtTok, rel, norm, plural, shortPath, hourTs, startOfDay, DAY, jeAbsolutniCesta } from '../format.js';
import { ICON } from '../icons.js';
import { miniBars } from '../charts.js';
import { fill, toast, emptyState } from '../ui.js';
import { enableReorder } from '../reorder.js';
import { projectHref, projectStats, logoStack, projectForm, projectCover, projectMark } from '../projects-ui.js';

const v = { el: null, tab: 'active', q: '' };

const prettify = (seg) => seg.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());

// Aktivita po dnech za 14 dní – z hodinových součtů tokenů.
function dailyActivity(sessions, now = Date.now()) {
  const days = 14;
  const start = startOfDay(now) - (days - 1) * DAY;
  const out = new Array(days).fill(0);
  for (const s of sessions) {
    for (const [k, val] of Object.entries(s.hourly || {})) {
      const i = Math.floor((hourTs(k) - start) / DAY);
      if (i >= 0 && i < days) out[i] += val;
    }
  }
  return out;
}

// Návrhy projektů: složky, kde agenti opakovaně pracují a které zatím nejsou v žádném projektu.
function suggestions() {
  const home = state.host?.home || '';
  const covered = state.projects.items.flatMap((p) => p.folders);
  const byCwd = new Map();
  for (const s of agentsList()) {
    if (s.source === 'web' || s.projectId || s.projectSource === 'none' || typeof s.cwd !== 'string' || !jeAbsolutniCesta(s.cwd) || s.cwd === home) continue;
    // Pracovní složky, které si aplikace Codex zakládá sama pro každé vlákno, nejsou projekty.
    if (/\/Codex\/\d{4}-\d{2}-\d{2}(\/|$)/.test(s.cwd)) continue;
    if (covered.some((f) => s.cwd === f || s.cwd.startsWith(`${f}/`))) continue;
    const cur = byCwd.get(s.cwd) || { cwd: s.cwd, count: 0, lastAt: 0 };
    cur.count++;
    cur.lastAt = Math.max(cur.lastAt, s.lastAt);
    byCwd.set(s.cwd, cur);
  }
  const names = new Set(state.projects.items.map((p) => norm(p.name)));
  return [...byCwd.values()]
    .map((x) => ({ ...x, name: prettify(x.cwd.split('/').filter(Boolean).pop() || x.cwd) }))
    .filter((x) => !names.has(norm(x.name)))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, 4);
}

// Překreslení mřížky bez bliknutí obrázků. `fill()` nahradí celý obsah, takže i karta, která se
// nezměnila, dostane nový <img> – a ten prohlížeč vykresluje znovu, takže pod ním na okamžik
// prosvitne podkladový přechod. Nejvíc je to vidět po přetažení karty, kdy se přepisuje celá
// mřížka. Karty se proto porovnávají po jedné: shodná se ponechá, u změněné se převezme původní
// obrázek (stejná adresa = stejný soubor), takže se znovu nenačítá.
function sesadKarty(box, html) {
  if (box._html === html) return;
  const stare = new Map([...box.querySelectorAll('.pcard[data-pid]')].map((n) => [n.dataset.pid, n]));
  if (!stare.size) { box.innerHTML = html; box._html = html; return; }
  const nove = document.createElement('div');
  nove.innerHTML = html;
  for (const nova of [...nove.querySelectorAll('.pcard[data-pid]')]) {
    const stara = stare.get(nova.dataset.pid);
    if (!stara) continue;
    if (stara.outerHTML === nova.outerHTML) { nova.replaceWith(stara); continue; }
    const puvodni = stara.querySelector('.pcover img');
    const novy = nova.querySelector('.pcover img');
    if (puvodni && novy && puvodni.src === novy.src) novy.replaceWith(puvodni);
    const puvodniLogo = stara.querySelector('.plogo img');
    const noveLogo = nova.querySelector('.plogo img');
    if (puvodniLogo && noveLogo && puvodniLogo.src === noveLogo.src) noveLogo.replaceWith(puvodniLogo);
  }
  box.replaceChildren(...nove.childNodes);
  box._html = html;
}

function cardHtml(p, now) {
  const st = projectStats(p, now);
  const spark = dailyActivity(st.live, now);
  const hasSpark = spark.some((x) => x > 0);
  return `<a class="card pcard${p.archived ? ' is-archived' : ''}" href="${projectHref(p.id)}" style="--pc:${esc(p.color)}" data-project-drop="${esc(p.id)}" data-pid="${esc(p.id)}">
    <span class="pcard-grip" data-grip aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
    ${projectCover(p)}
    <span class="pcard-top${p.logo?.file ? ' has-logo' : ''}">${projectMark(p, 'pdot--lg')}<span class="pcard-name">${esc(p.name)}</span>
      ${st.needs ? `<span class="pcount pcount--alert" title="Potřebuje tvé rozhodnutí">${ICON.hand}${st.needs}</span>` : st.working ? `<span class="pcount pcount--live" title="Právě pracuje"><i class="live-dot"></i>${st.working}</span>` : ''}</span>
    <span class="pcard-desc">${esc(p.description || (p.folders.length ? shortPath(p.folders[0]) : 'Ručně zařazené konverzace'))}</span>
    <span class="pcard-spark" aria-hidden="true">${hasSpark ? miniBars(spark, p.color, { height: 40 }) : '<i class="pcard-flat"></i>'}</span>
    <span class="pcard-foot">
      <span class="pcard-stat"><b data-odo>${st.total}</b> ${plural(st.total, 'konverzace', 'konverzace', 'konverzací')}</span>
      <span class="pcard-stat"><b data-odo>${st.tokens ? fmtTok(st.tokens) : '–'}</b> tokenů / 30 dní</span>
      ${st.services.length ? logoStack(st.services, 4) : ''}
    </span>
    <span class="pcard-time">${st.lastAt ? `Aktivita <span data-ago="${st.lastAt}">${rel(st.lastAt, now)}</span>` : 'Zatím bez aktivity'}</span>
  </a>`;
}

function mount(el) {
  v.el = el;
  el.innerHTML = `
    <div class="toolbar" data-enter style="--i:1">
      <div class="seg" role="group" aria-label="Zobrazit projekty" data-region="tabs"></div>
      <label class="search-field">${ICON.search}<span class="sr-only">Hledat projekt</span><input type="search" data-q placeholder="Hledat projekt nebo složku…" autocomplete="off"></label>
      <button class="btn btn--primary" type="button" data-action="new">${ICON.plus}Nový projekt</button>
    </div>
    <div data-region="grid"></div>
    <section class="psuggest" data-enter style="--i:3" data-region="suggest" aria-label="Návrhy projektů"></section>`;
  const input = el.querySelector('[data-q]');
  input.value = v.q;
  input.addEventListener('input', () => { v.q = input.value; update(); });
  const gridBox = el.querySelector('[data-region="grid"]');
  v.reorder = enableReorder(gridBox, {
    itemSelector: '.pcard[data-pid]',
    idOf: (n) => n.dataset.pid,
    onMoveKey: (pos, total) => toast(`Pozice ${pos} z ${total}`, { tone: 'info', timeout: 1600 }),
    onCommit: async (ids) => {
      if (!ids) { gridBox._html = null; update(); return; } // Esc: vrátit původní pořadí
      try {
        const r = await api.reorderProjects(ids);
        setProjects(r.projects);
      } catch (err) {
        toast(err.message, { tone: 'err' });
      }
      gridBox._html = null;
      update();
    },
  });
  el.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { v.tab = tab.dataset.tab; update(); return; }
    if (e.target.closest('[data-action="new"]')) {
      const p = await projectForm();
      if (p) { toast(`Projekt ${p.name} vytvořen`); location.hash = projectHref(p.id); }
      return;
    }
    const sug = e.target.closest('[data-suggest]');
    if (sug) {
      sug.disabled = true;
      try {
        const r = await api.createProject({ name: sug.dataset.name, folders: [sug.dataset.suggest] });
        setProjects(r.projects);
        toast(`Projekt ${r.project.name} vytvořen – konverzace ze složky se zařadily samy`, { action: { label: 'Otevřít', href: projectHref(r.project.id) } });
        update();
      } catch (err) {
        sug.disabled = false;
        toast(err.message, { tone: 'err', timeout: 8000 });
      }
    }
  });
}

function update() {
  const el = v.el;
  if (!el) return;
  const now = Date.now();
  const items = state.projects.items;
  const active = items.filter((p) => !p.archived);
  const archived = items.filter((p) => p.archived);
  if (v.tab === 'archived' && !archived.length) v.tab = 'active';
  fill(el, 'tabs', [['active', 'Aktivní', active.length], ['archived', 'Archiv', archived.length]]
    .map(([k, label, n]) => `<button type="button" data-tab="${k}" aria-pressed="${v.tab === k}"${k === 'archived' && !n ? ' disabled' : ''}>${label}<span class="count">${n}</span></button>`).join(''));

  const q = norm(v.q.trim());
  // Pořadí karet určuje uživatel (tažením); pořadí v seznamu projektů je jeho pořadí.
  const list = (v.tab === 'active' ? active : archived)
    .filter((p) => !q || norm([p.name, p.description, ...p.folders].join(' ')).includes(q));


  const unassigned = agentsList().filter((s) => !s.projectId).length;
  const sugg = suggestions();

  if (!items.length) {
    fill(el, 'grid', `<div class="card pintro">
      <div class="pintro-text">
        <span class="eyebrow">Projekty</span>
        <h2>Práce agentů seřazená podle klientů a zakázek</h2>
        <p>Založ projekt a Agenteeq do něj samo zařadí konverzace Claude Code, Codexu nebo Cursoru ze složky projektu. Chaty z ChatGPT, Claude.ai nebo Perplexity přidáš jedním kliknutím.</p>
        <ul class="checklist"><li>Na jednom místě stav, tokeny a přepisy všech služeb pro daný projekt</li><li>Podklady projektu po ruce, když spouštíš dalšího agenta</li><li>Export do CSV jako podklad k vyúčtování klientovi</li></ul>
        <button class="btn btn--primary" type="button" data-action="new">${ICON.plus}Vytvořit první projekt</button>
      </div>
      <div class="pintro-art" aria-hidden="true"><span style="--pc:#C2335A"></span><span style="--pc:#22A38C"></span><span style="--pc:#F2B824"></span></div>
    </div>`);
  } else if (!list.length) {
    fill(el, 'grid', `<div class="card">${emptyState({ title: q ? 'Žádný projekt neodpovídá hledání' : 'V archivu nic není', text: q ? 'Zkus jiný název nebo složku.' : '' })}</div>`);
  } else if (!v.reorder?.isDragging()) {
    sesadKarty(el.querySelector('[data-region="grid"]'), `<div class="pgrid">${list.map((p) => cardHtml(p, now)).join('')}
      ${v.tab === 'active' && unassigned ? `<a class="pcard pcard--ghost" href="#/agenti?projekt=bez"><span class="pcard-top"><span class="pghost-mark">${ICON.folder}</span><span class="pcard-name">Nezařazené</span></span>
        <span class="pcard-desc">${unassigned} ${plural(unassigned, 'konverzace čeká', 'konverzace čekají', 'konverzací čeká')} na zařazení do projektu.</span><span class="link-inline">Roztřídit ${ICON.arrow}</span></a>` : ''}
    </div>`);
  }

  fill(el, 'suggest', sugg.length && v.tab === 'active'
    ? `<div class="sec-head"><h2>Návrhy ze složek, kde pracují agenti</h2><span class="muted small">Jedním kliknutím vznikne projekt se zařazenými konverzacemi</span></div>
       <div class="psuggest-grid">${sugg.map((x) => `<button class="psuggest-item" type="button" data-suggest="${esc(x.cwd)}" data-name="${esc(x.name)}">
         <span class="icon-tile">${ICON.folder}</span><span class="psuggest-text"><b>${esc(x.name)}</b><small>${esc(shortPath(x.cwd))} · ${x.count} ${plural(x.count, 'konverzace', 'konverzace', 'konverzací')}</small></span>${ICON.plus}</button>`).join('')}</div>`
    : '');
}

export default { id: 'projekty', title: 'Projekty', mount, update, unmount: () => { v.el = null; v.reorder = null; } };
