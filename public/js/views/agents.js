import { agentRobot } from '../home-studio.js';
import { state, agentsList, taskRunCount, projectById } from '../state.js';
import { api } from '../api.js';
import { esc, fmtTok, rel, norm, shortPath, plural, timeHM } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON, ENV, envOf } from '../icons.js';
import { sessionTotal, needsYou, attentionRank } from '../data.js';
import { fill, statusPill, emptyState, agentHref, toast } from '../ui.js';
import { pdot, projectTag, assignDialog } from '../projects-ui.js';
import { BEZ_PREPISU, bezPrepisu } from '../no-transcript.js';
import { tr, tomtoPocitaci } from '../i18n.js';

const f = { status: 'all', source: 'all', providers: new Set(), q: '', project: 'all', selecting: false, selected: new Set() };
const v = { el: null, visible: [], limit: Infinity, ceka: false, doplnuje: false };
// Po otevření obrazovky se vykreslí jen tolik řádků, kolik zaplní i vysoké okno (32 řádků je přes
// dvě okna); zbytek se doplní sloučením po dávkách, jedna dávka na snímek. Celý seznam naráz
// (140 řádků ≈ 3 500 uzlů) držel ve WebKitu první snímek po kliknutí přes 50 ms.
const PRVNI_DAVKA = 32;
const DAVKA = 36;
// Během nástupu má tabulka vlastní vrstvu. Doplnit do ní řádky uprostřed animace a po jejím konci
// celou přemalovat stálo ve WebKitu tři snímky přes 50 ms. První dávka proto přijde až po nástupu
// (styles.css: rise 480 ms se zpožděním 3 × 40 ms = 600 ms), nebo hned, jakmile se stránka pohne.
const DOPLNIT_PO_NASTUPU_MS = 700;

function naplanujDavku(el) {
  v.ceka = true;
  const konec = new AbortController();
  const krok = () => {
    konec.abort();
    if (v.el !== el || !v.ceka) return;
    v.ceka = false;
    v.limit += DAVKA;
    v.doplnuje = true;
    try { update(); } finally { v.doplnuje = false; }
  };
  if (v.limit === PRVNI_DAVKA && el.classList.contains('is-entering')) {
    setTimeout(krok, DOPLNIT_PO_NASTUPU_MS);
    addEventListener('scroll', krok, { once: true, passive: true, signal: konec.signal });
    return;
  }
  // Další dávka po vykresleném snímku (rAF + úkol). Skryté okno rAF nevolá – pojistka časovačem;
  // krok se provede jen jednou.
  requestAnimationFrame(() => setTimeout(krok, 0));
  setTimeout(krok, 150);
}

const SEGMENTS = [
  ['all', tr('Vše')],
  ['needs_input', tr('Potřebuje tebe')],
  ['failed', tr('Selhalo')],
  ['limited', tr('Na limitu')],
  ['working', tr('Pracuje')],
  ['observed', tr('Detekované procesy')],
  ['waiting', tr('Čeká na zadání')],
  ['idle', tr('Nečinné')],
  ['archived', tr('Archiv')],
];

const matchStatus = (s, st) => (st === 'all' ? true : st === 'needs_input' ? needsYou(s) : s.status === st);

// Aplikace, které Agenteeq umí přepnout do popředí (server má pevný seznam v src/openers.js).
const PREPNUTELNE = new Set(['claude-desktop', 'chatgpt', 'codex-app', 'cursor', 'vscode', 'ms-copilot', 'perplexity', 'grok', 'lmstudio', 'ollama']);

// Aplikace, které na tomto Macu běží, ale svoje konverzace nikam neukládají. Dřív se v seznamu
// vůbec neobjevily, takže to vypadalo, že Agenteeq agenta „nezaregistroval". Teď je vidět, že běží,
// i to, proč u nich nemůže být přepis – a co s tím jde udělat.

// Konverzace v prohlížeči (Gemini, ChatGPT, Claude.ai, Perplexity, Grok, Copilot, Qwen) vidí
// Agenteeq výhradně přes rozšíření – do stránky v prohlížeči se odjinud dostat nedá. Dokud
// rozšíření nikdy nic neposlalo, musí to aplikace říct: mlčet a tvářit se, že nic neběží, je
// k nerozeznání od chyby. Je to nápověda, ne běžící položka – proto vlastní karta mimo seznam
// „Běží na …, ale bez přepisu“ a mimo jeho počet.
function webBezRozsireniHtml() {
  const web = (state.connectors || []).find((c) => c.id === 'web');
  if (!web || web.state !== 'missing') return '';
  return `<aside class="card pad runtime-note runtime-web" aria-labelledby="rt-web-h">
    <span class="icon-tile">${ICON.cloud}</span>
    <div class="runtime-main">
      <b id="rt-web-h">${tr('Konverzace v prohlížeči se nesledují')}</b>
      <span class="muted small">${tr('rozšíření zatím neposlalo žádná data')}</span>
      <p class="small">${tr('Chaty v Gemini, ChatGPT, Claude.ai, Perplexity, Groku, Microsoft Copilotu a Qwen Chatu sleduje rozšíření pro Chrome.')}</p>
      <a class="link-inline" href="#/nastaveni" data-karta="extension">${tr('Nastavit rozšíření')} ${ICON.arrow}</a>
    </div>
  </aside>`;
}

function bezPrepisuHtml(sessions) {
  const bezi = (state.runtimes || []).filter((r) => r.running && bezPrepisu(r.id, sessions));
  const lokalni = state.localAgents || [];
  const web = webBezRozsireniHtml();
  const pocet = bezi.length + lokalni.length;
  if (!pocet) return web;
  const doba = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min` : `${Math.max(1, Math.floor(sec / 60))} min`);
  return `<section class="card pad runtime-note" aria-labelledby="rt-h">
    <div class="sec-head"><h2 id="rt-h">${tr('Běží na {0}, ale bez přepisu', tomtoPocitaci())}</h2><span class="muted small">${pocet} ${plural(pocet, 'položka', 'položky', 'položek')}</span></div>
    <ul class="runtime-list">${bezi.map((r) => {
    const i = BEZ_PREPISU[r.id];
    const konverzaci = sessions.filter((s) => pkey(s.provider) === pkey(r.provider)).length;
    return `<li>
        <span class="icon-tile">${glyph({ runtime: r.id, provider: r.provider })}<i class="status-dot status-working"></i></span>
        <div class="runtime-main">
          <b>${esc(r.name)}</b>
          <span class="muted small">${tr('běží')} ${doba(r.od ? (Date.now() - r.od) / 1000 : 0)}${r.processes ? ` · ${r.processes} ${plural(r.processes, 'proces', 'procesy', 'procesů')}` : ''}${konverzaci ? ` ${tr('· {0} {1} od téhož poskytovatele', konverzaci, plural(konverzaci, 'sledovaná konverzace', 'sledované konverzace', 'sledovaných konverzací'))}` : ''}</span>
          <p class="small">${esc(i.duvod)}</p>
          <p class="small muted">${esc(i.rada)}</p>
        </div>
        <div class="runtime-actions">
          ${PREPNUTELNE.has(r.id) ? `<button class="btn btn--sm btn--primary" type="button" data-focus-runtime="${esc(r.id)}">${ICON.open}${tr('Přepnout do aplikace')}</button>` : ''}
          <a class="btn btn--sm" href="${esc(i.odkaz.href)}"${i.odkaz.karta ? ` data-karta="${esc(i.odkaz.karta)}"` : ''}>${esc(i.odkaz.text)}</a>
        </div>
      </li>`;
  }).join('')}${lokalni.map(lokalniHtml).join('')}</ul>
  </section>${web}`;
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
    ${a.port ? `<a class="btn btn--sm" href="#/nastaveni" data-karta="custom">${tr('Přidat jako agenta')}</a>` : '<span></span>'}
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
  // Tečka a text jsou jeden prvek: v kartě se podpis zalamuje a samostatná tečka by zůstala
  // viset za čipem projektu, zatímco text by odjel na další řádek.
  if (s.status === 'working') sub = `<span class="sub-live"><span class="live-dot" aria-hidden="true"></span><span>${esc(s.activity || tr('Pracuje'))}</span></span>`;
  else if (needsYou(s) || s.status === 'failed' || s.status === 'limited') sub = `<span class="sub-alert">${esc(s.reason)}</span>`;
  // Tento záznam není ověřená konverzace: z procesu samého nepoznáme, jestli jde o hlavního
  // nebo pomocného agenta. Složka proto zůstává jen kontextem, nikdy názvem konverzace.
  else if (s.proces) sub = `${esc(tr('PID {0} · od {1} · bez přepisu', s.proces.pid, timeHM(s.proces.od)))}${s.cwd ? ` · <code>${esc(shortPath(s.cwd))}</code>` : ''}`;
  // Čekání, které nedoběhlo (tah jen vypršel, agent zatím neodpověděl), se od hotového liší větou z modelu.
  else if (s.status === 'waiting' && !s.done && s.reason) sub = `${esc(s.reason)}${s.cwd || s.url ? ` · <code>${esc(shortPath(s.cwd) || s.url)}</code>` : ''}`;
  else if (s.cwd || s.url) sub = `<code>${esc(shortPath(s.cwd) || s.url)}</code>`;
  else sub = '';
  const progress = s.progress?.total ? `<span class="row-progress" aria-label="${s.progress.done} ${tr('z {0} úkolů', s.progress.total)}"><i style="width:${((s.progress.done / s.progress.total) * 100).toFixed(1)}%"></i></span>` : '';
  const total = sessionTotal(s);
  const tag = f.project === 'all' ? projectTag(s) : '';
  const runs = taskRunCount(s);
  const cells = `
    <span class="cell-title"><b>${esc(s.title)}</b><span class="cell-sub">${tag}${runs > 1 ? `<span class="badge">${runs} ${tr('spuštění')}</span>` : ''}${sub}</span>${progress}</span>
    <span class="cell-app">${esc(s.app)}<small>${esc(s.model || (s.proces ? tr('proces bez přepisu') : s.source === 'web' ? 'web' : '–'))}</small></span>
    <span class="cell-status">${statusPill(s.status)}</span>
    <span class="cell-num">${total ? `${fmtTok(total)} <span class="cell-unit">${tr('tokenů')}</span>` : '–'}</span>
    <span class="cell-time" data-ago="${s.lastAt}">${rel(s.lastAt)}</span>`;
  if (f.selecting && !s.proces) {
    const checked = f.selected.has(s.id);
    return `<label class="row row--select${checked ? ' is-selected' : ''}" draggable="true" data-session-drag="${esc(s.id)}" data-key="${esc(s.id)}">
      <span class="icon-tile icon-tile--check"><input type="checkbox" data-select-session value="${esc(s.id)}"${checked ? ' checked' : ''} aria-label="${tr('Vybrat')} ${esc(s.title)}"></span>${cells}<span></span>
    </label>`;
  }
  const env = envOf(s);
  return `<a class="row" href="${agentHref(s.id)}" data-session-drag="${esc(s.id)}" data-key="${esc(s.id)}">
    <span class="icon-tile agent-robot-tile">${agentRobot(s)}<i class="status-dot status-${esc(s.status)}"></i><span class="env-badge">${env.icon}<span class="sr-only">${env.label}</span></span></span>${cells}${ICON.chev}
  </a>`;
}

function mount(el, _params, query) {
  v.el = el;
  v.limit = PRVNI_DAVKA;
  v.ceka = false;
  applyQuery(query);
  el.innerHTML = `
    <div class="toolbar toolbar--filtry" data-enter style="--i:1">
      <div class="seg" role="group" aria-label="${tr('Filtrovat podle stavu')}" data-region="seg"></div>
    </div>
    <div class="filtry card" data-enter style="--i:2">
      <div class="filtry-rada">
        <span class="filtry-popis" id="ag-f-zdroj">${tr('Zdroj')}</span>
        <div class="chips chips--rada" role="group" aria-labelledby="ag-f-zdroj" data-region="source"></div>
        <label class="search-field">${ICON.search}<span class="sr-only">${tr('Hledat agenta')}</span><input type="search" data-q placeholder="${tr('Název, projekt, model, aplikace…')}" autocomplete="off"></label>
      </div>
      <div class="filtry-rada" data-region="sluzby-rada">
        <span class="filtry-popis" id="ag-f-sluzba">${tr('Služba')}</span>
        <div class="chips chips--rada" role="group" aria-labelledby="ag-f-sluzba" data-region="chips"></div>
      </div>
      <div class="filtry-rada">
        <span class="filtry-popis" id="ag-f-projekt">${tr('Projekt')}</span>
        <div class="chips chips--rada" role="group" aria-labelledby="ag-f-projekt" data-region="projects"></div>
        <button class="btn" type="button" data-select-toggle>${ICON.check}<span data-region="select-label">${tr('Vybrat')}</span></button>
      </div>
    </div>
    <div class="card table" data-enter style="--i:3" data-region="table"></div>
    <div data-enter style="--i:4" data-region="runtimes"></div>
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

// Seznam agentů se při živé události slučuje, nepřepisuje (ui.js#sloucit): řádky drží najetí,
// kotvu posouvání i obrázky a mění se jen to, co se opravdu změnilo.
// Dávka doplněných řádků pod oknem se neměří pro dojezd – nic z ní se v okně nepohnulo.
const zivy = (el, name, html) => fill(el, name, html, { sloucit: true, presun: name === 'table' && !v.doplnuje });

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

  zivy(el, 'seg', SEGMENTS.map(([k, label]) => {
    const count = base.filter((s) => matchStatus(s, k)).length;
    return `<button type="button" data-status-filter="${k}" aria-pressed="${f.status === k}"${k === 'needs_input' && count ? ' class="has-alert"' : ''}>${label}<span class="count">${count}</span></button>`;
  }).join(''));
  zivy(el, 'source', [['all', tr('Všechny zdroje'), ''], ['local', ENV.local.short, ENV.local.icon], ['web', ENV.cloud.short, ENV.cloud.icon]]
    .map(([k, label, icon]) => `<button class="chip" type="button" data-source-filter="${k}" aria-pressed="${f.source === k}">${icon}${label}</button>`).join(''));
  const present = Object.keys(PROVIDERS).filter((p) => all.some((s) => pkey(s.provider) === p));
  zivy(el, 'chips', present
    .map((p) => `<button class="chip" type="button" data-provider-filter="${p}" aria-pressed="${f.providers.has(p)}">${glyph(p)}${esc(PROVIDERS[p].label)}</button>`).join(''));

  const projects = state.projects.items.filter((p) => !p.archived || p.id === f.project);
  const countIn = (pid) => scoped.filter((s) => s.projectId === pid).length;
  const noneCount = scoped.filter((s) => !s.projectId).length;
  // Nápověda k přetažení je u čipů, na které se táhne (title), ne jako volný text na konci řádku:
  // ten se na užším okně zalamoval pod čipy a rozbíjel řádek filtrů na dvě výšky.
  const tahni = esc(tr('Konverzaci přetáhni na projekt'));
  zivy(el, 'projects', projects.length
    ? `<button class="chip" type="button" data-project-filter="all" aria-pressed="${f.project === 'all'}">${tr('Všechny')}</button>
      ${projects.map((p) => `<button class="chip" type="button" data-project-filter="${esc(p.id)}" data-project-drop="${esc(p.id)}" title="${tahni}" aria-pressed="${f.project === p.id}">${pdot(p)}${esc(p.name)}<span class="count">${countIn(p.id)}</span></button>`).join('')}
      <button class="chip" type="button" data-project-filter="none" data-project-drop="__none" title="${tahni}" aria-pressed="${f.project === 'none'}">${tr('Bez projektu')}<span class="count">${noneCount}</span></button>`
    : `<a class="chip" href="#/projekty">${ICON.plus}${tr('Založ první projekt a třiď konverzace podle klientů')}</a>`);
  zivy(el, 'select-label', f.selecting ? tr('Hotovo') : tr('Vybrat'));

  const list = base.filter((s) => matchStatus(s, f.status)).sort((a, b) => rank(a) - rank(b) || b.lastAt - a.lastAt);
  // A grid cannot preserve the card under the pointer by vertical scrolling alone.
  // Keep existing slots during live updates below the filters; explicit filter changes re-sort.
  const filterKey = JSON.stringify([f.status, f.source, [...f.providers], f.q, f.project]);
  const table = el.querySelector('[data-region="table"]');
  if (v.filterKey === filterKey && table?.getBoundingClientRect().top < 0) {
    const positions = new Map([...table.querySelectorAll('[data-key]')].map((node, i) => [node.dataset.key, i]));
    list.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
  }
  v.filterKey = filterKey;
  v.visible = list;
  for (const id of f.selected) if (!all.some((s) => s.id === id)) f.selected.delete(id);
  if (!all.length) {
    zivy(el, 'table', emptyState({
      title: tr('Zatím tu nejsou žádní agenti'),
      action: `<div class="empty-actions"><button class="btn btn--primary" type="button" data-nav-action="launch">${ICON.spark}${tr('Spustit agenta')}</button><a class="btn" href="#/nastaveni" data-karta="connectors">${tr('Zkontrolovat zdroje dat')}</a></div>`,
    }));
  } else if (!list.length) {
    zivy(el, 'table', emptyState({
      title: tr('Tomuto filtru neodpovídá žádný agent'),
      text: tr('Zkus jiný stav, zdroj, poskytovatele nebo projekt.'),
      action: `<button class="btn" type="button" data-clear>${tr('Zrušit filtry')}</button>`,
    }));
  } else {
    zivy(el, 'table', `<div class="row row-head" aria-hidden="true"><span></span><span>${tr('Agent')}</span><span>${tr('Aplikace a model')}</span><span>${tr('Stav')}</span><span class="cell-num">${tr('Tokeny')}</span><span class="cell-time">${tr('Aktivita')}</span><span></span></div>
      ${list.slice(0, v.limit).map(rowHtml).join('')}`);
    if (list.length > v.limit && !v.ceka) naplanujDavku(el);
    else if (list.length <= v.limit) v.limit = Infinity;
  }

  zivy(el, 'runtimes', bezPrepisuHtml(all));

  const n = f.selected.size;
  zivy(el, 'selbar', f.selecting
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
    v.limit = Infinity;
    v.ceka = false;
    f.selecting = false;
    f.selected.clear();
  },
};
