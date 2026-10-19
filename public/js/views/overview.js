import { createHomeStudio } from '../home-studio.js';
import { state, sessionsList, agentsList, emit } from '../state.js';
import { api } from '../api.js';
import { esc, fmtTok, fmtMoney, plural, startOfDay, dayStart, rel, H, MIN } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON } from '../icons.js';
import { stackedColumns, timeline, hbars, gauge } from '../charts.js';
import { tokensSince, konverzaceOd, providerSeries, STATUS_ORDER, needsYou, attentionRank, chartColor } from '../data.js';
import { claudeLimitStatus, limitsAll } from '../limits-ui.js';
import { enableBoard, widgetChrome } from '../widget-board.js';
import { fill, tween, activityItem, decisionCard, openButtons, currentLimits, limitState, limitObnova, legendHtml, limitWindows, toast, agentHref, creditAge, statusPill, vetaStavu, emptyState } from '../ui.js';
import { BEZ_PREPISU, bezPrepisu } from '../no-transcript.js';
import { createLauncher } from '../launcher-ui.js';
import { goToExtension } from '../jump.js';
import { tr, LOCALE, tomtoPocitaci } from '../i18n.js';
import { pouzivaneNastroje } from '../nastroje.js';
import { noveNastrojeHtml } from '../detekce-ui.js';
import { stavAgentu, popisPoctu } from '../stav-vety.js';
import { ze } from '../predlozky.js';

const AKTIVIT_MIN = 6; // kolik řádků poslední aktivity je vidět, než se dopočítá podle volného místa
const AKTIVIT_MAX = 24;
// Výchozí rozvržení nástěnky (šířky ve sloupcích z 12). Uživatel ho mění tažením; nový widget
// v další verzi se přidá na konec s touto šířkou.
const BOARD_DEFAULT = [
  { id: 'smena', span: 7 }, { id: 'kam', span: 5 },
  { id: 'tokeny', span: 7 }, { id: 'aktivita', span: 5 },
  { id: 'naklady', span: 5 }, { id: 'bezi', span: 7 },
  { id: 'limity', span: 12 },
];
const TIMELINE_MAX = 7; // víc řádků se do osy nevejde; zbytek se vypíše pod ní jako odkaz
const CHART_UPDATE_MS = 500;
const v = { period: 'week', aktivit: AKTIVIT_MIN, doplnRaf: 0, aktivnichCelkem: 0, hidden: new Set(), drawn: false, el: null, launcher: null, chartAt: 0, chartTimer: null, timelineNow: 0 };

// Aplikace, které server umí přepnout do popředí (pevný seznam v src/openers.js).
const PREPNUTELNE = new Set(['claude-desktop', 'chatgpt', 'codex-app', 'cursor', 'vscode', 'ms-copilot', 'perplexity', 'grok', 'lmstudio', 'ollama']);

const changed = (topics, ...names) => topics.has('all') || names.some((name) => topics.has(name));

// Widgety mají přirozenou výšku. Poslední aktivita je jediný widget, který umí růst, tak dostane
// tolik řádků, kolik se vejde do výšky nejvyššího souseda ve stejném řádku nástěnky – místo
// prázdné plochy pod seznamem. Výšky se měří, ne odhadují.
function doplnAktivitu(el, celkem) {
  const board = el.querySelector('[data-board]');
  const w = board?.querySelector('.widget[data-card="aktivita"]');
  const seznam = el.querySelector('[data-region="activity"]');
  if (!w || w.hidden || !seznam || !celkem || !board.offsetParent) return;
  const radek = seznam.firstElementChild;
  const jedenSloupec = getComputedStyle(board).gridTemplateColumns.trim().split(/\s+/).length < 2;
  const sousede = [...board.children].filter((x) => x !== w && !x.hidden && x.dataset.row === w.dataset.row);
  if (!radek || jedenSloupec || !sousede.length) {
    if (v.aktivit !== AKTIVIT_MIN) { v.aktivit = AKTIVIT_MIN; update(new Set(['dopln'])); }
    return;
  }
  board.classList.add('is-measuring');
  const moje = w.getBoundingClientRect().height;
  const cil = Math.max(...sousede.map((x) => x.getBoundingClientRect().height));
  board.classList.remove('is-measuring');
  const vyskaRadku = radek.getBoundingClientRect().height + parseFloat(getComputedStyle(seznam).rowGap || 0);
  const mezera = cil - moje;
  if (!vyskaRadku) return;
  const zmena = mezera > vyskaRadku ? Math.floor(mezera / vyskaRadku) : mezera < -vyskaRadku ? -Math.floor(-mezera / vyskaRadku) : 0;
  if (!zmena) return;
  const chci = Math.max(AKTIVIT_MIN, Math.min(AKTIVIT_MAX, celkem, v.aktivit + zmena));
  if (chci === v.aktivit) return;
  v.aktivit = chci;
  update(new Set(['dopln']));
}

// Až po vykreslení a složení řádků: teprve tehdy je vidět, kolik místa zbylo.
function planDopln(el) {
  cancelAnimationFrame(v.doplnRaf);
  v.doplnRaf = requestAnimationFrame(() => requestAnimationFrame(() => doplnAktivitu(el, v.aktivnichCelkem)));
}

function queueChart(now) {
  if (v.chartTimer) return;
  v.chartTimer = setTimeout(() => {
    v.chartTimer = null;
    emit('overview:chart');
  }, Math.max(0, CHART_UPDATE_MS - (now - v.chartAt)));
}

function onboardingHtml() {
  if (!state.settings || state.settings.onboardingDismissed) return '';
  const hooks = state.integrations?.claudeHooks;
  const ext = state.integrations?.extension;
  // Propojení s Claude Code nabízet jen tomu, kdo Claude Code na Macu má.
  const maClaudeCode = (state.connectors || []).some((c) => c.id === 'claude-code' && c.state !== 'missing');
  const nalezeni = state.sessions.size > 0;
  const steps = [
    // Nesplněný krok je úkol, ne tvrzení: „nalezeni“ u nuly agentů by nebyla pravda.
    { done: nalezeni, label: nalezeni ? tr('Agenti na {0} nalezeni', tomtoPocitaci()) : tr('Najít agenty na {0}', tomtoPocitaci()), sub: tr('Claude Code, Codex, Cursor, Copilot a další se načítají samy.'), cta: `<a class="btn btn--sm" href="#/nastaveni" data-karta="connectors">${tr('Zdroje dat')}</a>` },
    ...(maClaudeCode ? [{ done: Boolean(hooks?.installed && (hooks?.current || hooks?.funguje)), label: tr('Propojení s Claude Code'), sub: tr('Žádost o povolení a přesné limity uvidíš hned.'), cta: `<a class="btn btn--sm" href="#/nastaveni" data-karta="claude">${tr('Zapnout')}</a>` }] : []),
    { done: Boolean(ext && ext.state !== 'missing'), label: tr('Rozšíření pro Chrome'), sub: tr('Agenti z ChatGPT, Gemini a Claude.ai v přehledu. Zadání se do nich vloží samo.'), cta: `<button class="btn btn--sm" type="button" data-go-extension>${ext?.repair ? tr('Spárovat znovu') : tr('Nainstalovat')}</button>` },
    { done: state.projects.items.length > 0, label: tr('První projekt'), sub: tr('Konverzace ze všech služeb seřazené podle klientů.'), cta: `<a class="btn btn--sm" href="#/projekty">${tr('Založit')}</a>` },
    { done: (state.usage?.launches || 0) > 0, label: tr('Spusť agenta přímo z Agenteeq'), sub: tr('Složku a projekt vybereš rovnou u zadání.'), cta: `<button class="btn btn--sm" type="button" data-onboard-launch>${tr('Zkusit')}</button>` },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return '';
  return `<section class="card onboard" aria-labelledby="ob-h">
    <div class="onboard-head"><div><h2 id="ob-h">${tr('Začni s Agenteeq')}</h2><p class="muted small">${ze(steps.length) ? tr('{0} ze {1} hotovo', done, steps.length) : tr('{0} z {1} hotovo', done, steps.length)}</p></div>
      <div class="onboard-track" role="progressbar" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}" aria-label="${tr('Průvodce nastavením')}"><i style="width:${((done / steps.length) * 100).toFixed(0)}%"></i></div>
      <button class="link" type="button" data-onboard-dismiss>${tr('Skrýt průvodce')}</button></div>
    <ol class="onboard-steps">${steps.map((s) => `<li class="onboard-step${s.done ? ' is-done' : ''}"><span class="onboard-mark" aria-hidden="true">${s.done ? ICON.check : ''}</span>
      <span class="onboard-text"><span>${s.label}</span><small>${s.sub}</small></span>${s.done ? `<span class="sr-only">${tr('hotovo')}</span>` : s.cta}</li>`).join('')}</ol>
  </section>`;
}

// Nic neblokuje: místo prázdné karty to, co se dá udělat hned – agenti, kteří dokončili práci
// a čekají na další zadání (posledních 12 h), a limity, kterým zbývá málo (od 80 %) nebo jsou
// vyčerpané. Vyčerpaný limit může platit, i když agent, který na něj narazil, mezitím odpověděl.
function klid(all, hooks, now) {
  const hotovo = all
    .filter((s) => s.status === 'waiting' && s.done && now - s.lastAt < 12 * H)
    .sort((a, b) => b.lastAt - a.lastAt);
  const dochazi = currentLimits(state.limits || [], now)
    .map((l) => ({ l, st: limitState(l, now) }))
    .filter(({ st }) => !st.renewed && (st.reached || st.pct >= 80))
    .sort((a, b) => b.st.pct - a.st.pct);
  const radky = [
    ...dochazi.slice(0, 2).map(({ l, st }) => `<li class="klid-row" data-ton="${st.tone}">
      <span class="klid-logo">${glyph(l.provider)}</span>
      <span class="klid-text"><b>${esc(`${l.app || PROVIDERS[pkey(l.provider)].label} · ${l.label}`)}</b><small>${esc(st.label)} · ${esc(limitObnova(l, now).text)}</small></span>
      <a class="btn btn--sm" href="#/statistiky">${tr('Limity')}</a>
    </li>`),
    ...hotovo.slice(0, 3).map((s) => `<li class="klid-row" data-key="${esc(s.id)}">
      <span class="klid-logo">${glyph(s)}</span>
      <span class="klid-text"><a href="${agentHref(s.id)}"><b>${esc(s.title)}</b></a><small>${tr('Hotovo')} <span data-ago="${s.lastAt}">${rel(s.lastAt, now)}</span> · ${esc(s.app)}</small></span>
      ${s.open?.length ? openButtons(s, { small: true, max: 1, primary: false }) : `<a class="btn btn--sm" href="${agentHref(s.id)}">${tr('Detail')}</a>`}
    </li>`),
  ];
  const claude = (state.connectors || []).some((c) => c.id === 'claude-code' && c.state !== 'missing');
  if (radky.length) {
    return `<div class="klid">
    <p class="klid-veta"><span class="calm-mark">${ICON.check}</span><span>${esc(dochazi.some(({ st }) => st.reached) ? tr('Agent nečeká na tebe, ale limit je vyčerpaný.') : hotovo.length && !dochazi.length ? tr('Nic neblokuje. Tihle agenti dokončili práci a čekají na další krok.') : tr('Nic neblokuje. Tohle můžeš vyřídit teď.'))}</span></p>
    <ul class="klid-list">${radky.join('')}</ul>
  </div>`;
  }
  // Nic k vyřízení: co Agenteeq hlídá a jak to teď vypadá. Bez měření limitu to říkáme – „v pořádku“
  // by bylo tvrzení o datech, která nemáme.
  const nejvic = currentLimits(state.limits || [], now)
    .map((l) => ({ l, st: limitState(l, now) }))
    .filter(({ st }) => !st.renewed)
    .sort((a, b) => b.st.pct - a.st.pct)[0];
  const hlidam = [
    [ICON.hand, tr('Žádosti o povolení'), claude && hooks && !hooks.installed
      ? `<a class="link-inline" href="#/nastaveni" data-karta="claude">${tr('Zapnout u Claude Code')} ${ICON.arrow}</a>`
      : esc(tr('Žádná nečeká'))],
    [ICON.alert, tr('Selhání'), esc(tr('Žádné'))],
    [ICON.clock, tr('Limity'), nejvic
      ? `${esc(`${nejvic.l.app || PROVIDERS[pkey(nejvic.l.provider)].label} · ${nejvic.l.label}`)} <b>${esc(nejvic.st.label)}</b>`
      : esc(tr('Žádný změřený limit'))],
  ];
  return `<div class="klid">
    <p class="klid-veta"><span class="calm-mark">${ICON.check}</span><span>${esc(tr('Nic neblokuje. Hlídám za tebe:'))}</span></p>
    <ul class="klid-hlidam">${hlidam.map(([ikona, co, stav]) => `<li><span class="klid-ikona">${ikona}</span><span>${esc(co)}</span><span class="klid-stav">${stav}</span></li>`).join('')}</ul>
  </div>`;
}

function mount(el) {
  v.el = el;
  v.drawn = false;
  el.innerHTML = `
  <section class="pulse-bar" data-enter style="--i:0" aria-label="${tr('Stav agentů')}" data-region="hero"></section>
  <section class="card launch" data-enter style="--i:1" aria-labelledby="launch-h" data-launch></section>
  <div data-region="onboard"></div>
  <div data-region="newtools"></div>
  <section data-enter style="--i:2" aria-labelledby="dec-h">
        <div class="sec-head"><h2 id="dec-h">${tr('Vyžaduje pozornost')}</h2><a class="link" href="#/agenti">${tr('Všechny')}</a></div>
        <div data-region="decisions"></div>
      </section>
  <div class="home-board" data-board>
    <div class="widget" data-card="smena">${widgetChrome(tr('Dnešní směna'))}
      <section data-enter style="--i:2" aria-labelledby="tl-h" data-jen-s-daty>
        <div class="sec-head"><h2 id="tl-h">${tr('Dnešní směna')}</h2><span class="muted small">${tr('posledních 12 hodin')}</span></div>
        <div class="card tl-card" data-region="timeline"></div>
      </section>
      <section data-enter style="--i:3" data-region="meter" data-jen-s-daty aria-label="${tr('Zaznamenané tokeny dnes')}"></section>
    </div>
    <div class="widget" data-card="kam">${widgetChrome(tr('Kam dnes šly tokeny'))}
      <section data-enter style="--i:4" aria-labelledby="td-h" data-jen-s-daty>
        <div class="sec-head"><h2 id="td-h">${tr('Kam dnes šly tokeny')}</h2><a class="link" href="#/statistiky">${tr('Statistiky')}</a></div>
        <div class="card pad" data-region="today-apps"></div>
      </section>
    </div>
    <div class="widget" data-card="tokeny">${widgetChrome(tr('Tokeny z přepisů'))}
      <section class="card token-card" data-enter style="--i:3" aria-labelledby="chart-h" data-jen-s-daty>
        <div class="sec-head"><h2 id="chart-h">${tr('Tokeny z přepisů')}</h2>
          <label class="select"><span class="sr-only">${tr('Období')}</span><select data-action="period"><option value="today">${tr('Dnes')}</option><option value="day">${tr('24 hodin')}</option><option value="week">${tr('Týden')}</option><option value="fortnight">${tr('14 dní')}</option><option value="month">${tr('30 dní')}</option></select></label>
        </div>
        <div data-region="chart"></div>
        <div class="legend" data-region="legend"></div>
      </section>
    </div>
    <div class="widget" data-card="aktivita">${widgetChrome(tr('Poslední aktivita'))}
      <section data-enter style="--i:5" aria-labelledby="act-h" data-jen-s-daty>
        <div class="sec-head"><h2 id="act-h">${tr('Poslední aktivita')}</h2><a class="link" href="#/agenti">${tr('Zobrazit vše')}</a></div>
        <ul class="activity" data-region="activity"></ul>
      </section>
    </div>
    <div class="widget" data-card="naklady">${widgetChrome(tr('Náklady z API'))}
      <section data-enter style="--i:4" aria-labelledby="sp-h">
        <div class="sec-head"><h2 id="sp-h">${tr('Náklady z API')}</h2><a class="link" href="#/utrata">${tr('Detail')}</a></div>
        <div class="card spend-mini" data-region="spend"></div>
      </section>
    </div>
    <div class="widget" data-card="bezi">${widgetChrome(tr('Běží na tomto počítači'))}
      <section data-enter style="--i:5" aria-labelledby="rt-h">
    <div class="sec-head"><h2 id="rt-h">${tr('Běží na {0}', tomtoPocitaci())}</h2><a class="link" href="#/nastaveni" data-karta="moje">${tr('Zdroje dat')}</a></div>
    <div class="rt-grid" data-region="runtimes"></div>
  </section>
    </div>
    <div class="widget" data-card="limity">${widgetChrome(tr('Okna limitů'))}
      <section data-enter style="--i:4" data-region="limits" aria-label="${tr('Limity předplatných')}"></section>
    </div>
  </div>
`;
  // A task-first workspace; existing regions retain their live data and actions.
  const workspace = document.createElement('div');
  workspace.className = 'home-workspace';
  workspace.innerHTML = `<div class="home-desk"><header class="home-intro"><span class="home-robot agent-portrait" data-state="idle" style="--persona:#6260d8" aria-hidden="true"></span><div class="home-intro-text"><h2>${tr('Co dnes posuneme dál?')}</h2><p data-home-pulse>${tr('Zadej agentovi úkol.')}</p></div><div class="home-dnes" data-region="pozdrav-dnes"></div></header></div><aside class="home-live" aria-label="${tr('Právě teď')}" data-jen-s-daty><h2>${tr('Právě teď')}</h2></aside>`;
  const desk = workspace.querySelector('.home-desk');
  const live = workspace.querySelector('.home-live');
  // Rozhodnutí a stav agentů stojí vedle sebe: vlevo co čeká na tebe, vpravo jestli všechno běží.
  const dvojice = document.createElement('div');
  dvojice.className = 'home-dvojice';
  dvojice.dataset.jenSDaty = '';
  dvojice.innerHTML = `<section class="home-zdravi" aria-labelledby="zdravi-h"><div class="sec-head"><h2 id="zdravi-h">${tr('Stav agentů')}</h2><a class="link" href="#/agenti">${tr('Agenti')}</a></div><div data-region="zdravi"></div></section>`;
  dvojice.prepend(el.querySelector('[aria-labelledby="dec-h"]'));
  // Bez jediného agenta stojí místo dvojice „pozornost + stav“ (a místo „Právě teď“) jeden prázdný
  // stav s cestou dál – nuly a „v pořádku“ by nad prázdným profilem vypadaly jako změřená data.
  const prazdno = document.createElement('div');
  prazdno.dataset.region = 'prazdno';
  prazdno.className = 'home-prazdno';
  desk.append(el.querySelector('[data-launch]'), dvojice, prazdno);
  live.append(el.querySelector('[data-region="hero"]'));
  const history = document.createElement('details');
  history.className = 'home-history';
  history.innerHTML = `<summary>${tr('Průběh dne a spotřeba')}<span>${tr('Aktivita, tokeny a náklady')}</span></summary>`;
  history.append(el.querySelector('[data-board]'));
  el.append(workspace, history);
  v.board = enableBoard(el.querySelector('[data-board]'), {
    name: 'home',
    defaults: BOARD_DEFAULT,
    onLayout: () => planDopln(el),
    announce: (text) => { const r = el.querySelector('[data-board-live]'); if (r) r.textContent = text; },
  });
  history.insertAdjacentHTML('beforeend', `<p class="sr-only" aria-live="polite" data-board-live></p>`);
  // Zavřená sekce nemá rozměry; po rozbalení se znovu dopočítá, kolik řádků aktivity se vejde.
  history.addEventListener('toggle', () => { if (history.open) v.board?.relayout(); });
  const sel = el.querySelector('[data-action="period"]');
  sel.value = v.period;
  sel.addEventListener('change', () => {
    v.period = sel.value;
    v.drawn = false;
    update(new Set(['period']));
  });
  v.launcher = createLauncher(el.querySelector('[data-launch]'));
  v.studio = createHomeStudio(el);
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-go-extension]')) { e.preventDefault(); goToExtension(); return; }
    const prepnout = e.target.closest('[data-focus-runtime]');
    if (prepnout) {
      prepnout.disabled = true;
      try {
        const r = await api.focusRuntime(prepnout.dataset.focusRuntime);
        if (r.dry) toast(tr('Zkušební režim: {0} se nepřepnul', r.label), { tone: 'info' });
      } catch (err) {
        toast(err.message, { tone: 'err' });
      } finally {
        prepnout.disabled = false;
      }
      return;
    }
    if (e.target.closest('[data-onboard-launch]')) {
      const prompt = el.querySelector('[data-l-prompt]');
      el.querySelector('[data-launch]').scrollIntoView({ block: 'start', behavior: 'smooth' });
      prompt?.focus({ preventScroll: true });
      return;
    }
    if (e.target.closest('[data-onboard-dismiss]')) {
      try {
        state.settings = (await api.saveSettings({ onboardingDismissed: true })).settings;
        emit('settings');
        toast(tr('Průvodce skrytý'), { tone: 'info' });
      } catch (err) {
        toast(err.message, { tone: 'err' });
      }
      return;
    }
    const b = e.target.closest('[data-legend]');
    if (!b) return;
    const k = b.dataset.legend;
    if (v.hidden.has(k)) v.hidden.delete(k);
    else v.hidden.add(k);
    update(new Set(['legend']));
  });
}

export function prazdnyProfil() {
  return emptyState({
    title: tr('Zatím tu není žádný agent'),
    text: esc(tr('Agenteeq ho najde sám, jakmile na {0} poběží Claude Code, Codex nebo Cursor.', tomtoPocitaci())),
    action: `<a class="btn btn--primary" href="#/nastaveni" data-karta="connectors">${tr('Zkontrolovat zdroje dat')}</a>`,
  });
}

// Agenti nad dvanáct se do „Právě teď“ nevejdou. Dřív za ně stála prázdná karta s „+5“ v rohu,
// bez popisu, kam vede; teď je to kapsle, která to řekne slovy.
const pbDalsi = (n) => `<li class="pb-dalsi"><a class="link" href="#/agenti">${esc(plural(n, 'Další agent v sekci Agenti', 'Další {0} agenti v sekci Agenti', 'Dalších {0} agentů v sekci Agenti').replace('{0}', n))}</a></li>`;

// Živé oblasti Přehledu se slučují (ui.js#sloucit): karty, které se nezměnily, zůstanou stejnými
// uzly – nepřehrají znovu nástup, nepřijdou o najetí a logo se znovu nedekóduje.
const zivy = (el, name, html) => fill(el, name, html, { sloucit: true, presun: name === 'activity' || name === 'hero' || name === 'decisions' });

function update(topics = new Set(['all'])) {
  const el = v.el;
  if (!el) return;
  if (changed(topics, 'launch', 'projects', 'runs', 'usage')) v.launcher?.update();
  if (changed(topics, 'sessions', 'connectors', 'integrations', 'projects', 'settings', 'usage')) fill(el, 'onboard', onboardingHtml());
  // Nově zachycené AI nástroje (detekce-ui.js). fill() mění DOM jen při změně textu – nebliká.
  if (changed(topics, 'detekce', 'runtimes', 'settings', 'connectors')) fill(el, 'newtools', noveNastrojeHtml());
  const now = Date.now();
  const everything = sessionsList();
  const all = agentsList();
  const working = all.filter((s) => s.status === 'working');
  const needs = all
    .filter(needsYou)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.lastAt - a.lastAt);
  const today = startOfDay(now);
  const todayCount = konverzaceOd(all, today);
  const running = state.runtimes.filter((r) => r.running).length;
  // Výpis procesů selhal: o běžících aplikacích víme jen to, co platilo naposledy. „0 aplikací
  // běží“ by tu byla nepravda – uživatel musí poznat, že se to nepodařilo zjistit.
  const procesyNevim = (state.connectors || []).find((c) => c.id === 'processes')?.state === 'error';
  // Prázdný profil: Agenteeq zatím nevidí žádnou konverzaci ani proces. Selhání výpisu procesů
  // mezi „prázdno“ nepatří – tam se ukáže stav agentů s větou „nepodařilo se zjistit“.
  const prazdno = !everything.length && !all.length && !procesyNevim;
  for (const n of el.querySelectorAll('[data-jen-s-daty]')) n.hidden = prazdno;
  fill(el, 'prazdno', prazdno ? `<div class="card">${prazdnyProfil()}</div>` : '');

  // Počty v pruhu = přesně stejná pravidla jako filtry v sekci Agenti. Proces bez přepisu není
  // „čekání na zadání“, proto se drží mimo tento součet a má vlastní jasný popisek v pruhu.
  const failed = all.filter((s) => s.status === 'failed');
  const limited = all.filter((s) => s.status === 'limited');
  // A blocking limit/failure is actionable information too, not "waiting".
  // Surface it in the main attention area, without hiding real approval requests.
  const attention = [...failed, ...limited, ...needs]
    .sort((a, b) => (a.status === 'failed' ? 0 : a.status === 'limited' ? 1 : 2)
      - (b.status === 'failed' ? 0 : b.status === 'limited' ? 1 : 2)
      || b.lastAt - a.lastAt);
  const failedCount = failed.length;
  const decideCount = needs.length;
  const waiting = all.filter((s) => s.status === 'waiting');
  const observed = all.filter((s) => s.status === 'observed');
  const live = [...needs, ...failed, ...limited, ...working, ...observed, ...waiting.sort((a, b) => b.lastAt - a.lastAt)];
  const STRIP_MAX = 12;
  if (changed(topics, 'sessions', 'runtimes', 'connectors')) {
    el.querySelector('[data-region="hero"]').classList.toggle('is-live', working.length > 0);
    zivy(el, 'hero', `
    <div class="pb-main">
      <span class="pb-live" aria-hidden="true"></span>
      <span class="pb-num">${tween('ov-working', working.length)}</span>
      <span class="pb-label"><b>${plural(working.length, 'agent pracuje', 'agenti pracují', 'agentů pracuje')}</b>
        <small>${todayCount} ${plural(todayCount, 'aktivní konverzace', 'aktivní konverzace', 'aktivních konverzací')} ${tr('dnes')}${procesyNevim ? ` · ${tr('nepodařilo se zjistit, co běží')}` : state.runtimes.length ? ` · ${running} ${plural(running, 'aplikace běží', 'aplikace běží', 'aplikací běží')}` : ''}</small></span>
    </div>
    <div class="pb-stats">
      <a class="pb-stat${decideCount ? ' is-alert' : ''}" href="#/agenti?stav=needs_input"><b data-odo>${decideCount}</b><span>${popisPoctu('needs_input', decideCount)}</span></a>
      <a class="pb-stat${failedCount ? ' is-alert' : ''}" href="#/agenti?stav=failed"><b data-odo>${failedCount}</b><span>${popisPoctu('failed', failedCount)}</span></a>
      <a class="pb-stat${waiting.length ? ' is-wait' : ''}" href="#/agenti?stav=waiting"><b data-odo>${waiting.length}</b><span>${popisPoctu('waiting', waiting.length)}</span></a>
    </div>
    <a class="link pb-all" href="#/agenti">${tr('Všichni agenti')} ${ICON.arrow}</a>
    <div class="pb-strip">${live.length
      ? `<ul class="pb-agents" aria-label="${tr('Aktivní agenti')}">${live.slice(0, STRIP_MAX).map((s) => {
        // Štítek i barva jako na Agentech a v detailu (statusPill). `data-done="false"` u čekání,
        // které nedoběhlo, říká robotovi, ať netvrdí „hotovo“ (robot-bubliny.js).
        return `<li data-key="${esc(s.id)}"><a class="pb-agent" data-state="${needsYou(s) || s.status === 'failed' || s.status === 'limited' ? 'alert' : esc(s.status)}" data-status="${esc(s.status)}"${s.status === 'waiting' && !s.done ? ' data-done="false"' : ''} href="${agentHref(s.id)}">
          ${statusPill(s.status, 'pb-stav')}
          <span class="pb-agent-logo">${glyph(s)}</span>
          <span class="pb-agent-text"><b${s.fullTitle ? ` title="${esc(s.fullTitle)}"` : ''}>${esc(s.title)}</b><small><i aria-hidden="true"></i>${esc(vetaStavu(s))}<span class="sr-only"> · ${esc(s.app)}</span></small></span>
        </a></li>`;
      }).join('')}${live.length > STRIP_MAX ? pbDalsi(live.length - STRIP_MAX) : ''}</ul>`
      : `<p class="pb-empty">${tr('Žádný agent teď nepracuje ani nečeká na zadání.')}</p>`}</div>`);
  }

  // Pravá strana pozdravu: dnešní den jako kalendářní značka a pod ním, co se dnes dělo
  // (aktivní konverzace a tokeny z přepisů). Počty agentů podle stavu nese box Stav agentů –
  // tady by se jen opakovaly. Den platí vždy; aktivita se ukáže, jen když dnes nějaká byla.
  if (changed(topics, 'sessions', 'tick')) {
    const den = Object.fromEntries(new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }).formatToParts(now).map((p) => [p.type, p.value]));
    const dnesTok = tokensSince(everything, today);
    const aktivita = [
      todayCount ? `${todayCount} ${plural(todayCount, 'aktivní konverzace', 'aktivní konverzace', 'aktivních konverzací')}` : '',
      dnesTok ? `${fmtTok(dnesTok)} ${tr('tokenů')}` : '',
    ].filter(Boolean).join(' · ');
    zivy(el, 'pozdrav-dnes', `<p class="home-den"><b>${esc(den.day)}</b><span><span>${esc(den.month)}</span><span>${esc(den.weekday)}</span></span></p>${aktivita ? `<p class="home-aktivita"><span class="sr-only">${esc(tr('dnes'))}: </span>${esc(aktivita)}</p>` : ''}`);
  }

  // Stav agentů: jedna věta (v pořádku / pozor / problém / nepodařilo se zjistit), počty a problémy.
  // Selhání zjišťování procesů se nikdy nehlásí jako „nic neběží“.
  if (changed(topics, 'sessions', 'runtimes', 'connectors')) {
    const problemy = [...failed, ...limited];
    const { stav, veta, poznamka } = stavAgentu({ pracuje: working.length, cekaji: needs.length, selhalo: failed.length, limit: limited.length, procesyNevim, vzdaleneAt: (state.connectors || []).find((c) => c.id === 'claude-desktop-code' && c.state === 'connected')?.seznamAt || 0, now });
    // Barvu stavu dostane jen dlaždice, ve které něco je (refinement.css).
    const pocty = [
      [working.length, popisPoctu('working', working.length), working.length ? 'pracuje' : '', '#/agenti?stav=working'],
      [needs.length, popisPoctu('needs_input', needs.length), needs.length ? 'pozor' : '', '#/agenti?stav=needs_input'],
      [failed.length, popisPoctu('failed', failed.length), failed.length ? 'problem' : '', '#/agenti?stav=failed'],
      [limited.length, popisPoctu('limited', limited.length), limited.length ? 'limit' : '', '#/agenti?stav=limited'],
    ];
    zivy(el, 'zdravi', `<div class="zdravi" data-stav="${stav}">
      <p class="zdravi-veta"><span class="zdravi-tecka" aria-hidden="true"></span>${esc(veta)}</p>${poznamka ? `<p class="zdravi-pozn">${esc(poznamka)}</p>` : ''}
      <ul class="zdravi-pocty">${pocty.map(([n, popis, ton, href]) => `<li><a href="${href}" data-ton="${ton}"><b>${n}</b><span>${esc(popis)}</span></a></li>`).join('')}</ul>
      ${problemy.length ? `<ul class="zdravi-problemy">${problemy.slice(0, 3).map((s) => `<li data-key="${esc(s.id)}"><a href="${agentHref(s.id)}"><b>${esc(s.title)}</b><small>${esc(s.status === 'limited' ? tr('Vyčerpaný limit') : s.reason || tr('Selhalo'))}</small></a></li>`).join('')}</ul>` : ''}
    </div>`);
  }

  const hooks = state.integrations?.claudeHooks;
  if (changed(topics, 'settings')) v.board?.reload();
  if (changed(topics, 'sessions', 'integrations', 'limits', 'tick')) zivy(el, 'decisions', attention.length
    ? `<ul class="decisions">${attention.slice(0, 4).map(decisionCard).join('')}</ul>${attention.length > 4 ? `<a class="link more" href="#/agenti">${plural(attention.length - 4, 'A další {0}', 'A další {0}', 'A dalších {0}').replace('{0}', attention.length - 4)}</a>` : ''}`
    : klid(all, hooks, now));
  if (changed(topics, 'sessions', 'tick')) {
    const todayTok = tokensSince(everything, today);
    const avg = Math.max(0, tokensSince(everything, dayStart(now, -7)) - todayTok) / 7;
    const pct = avg > 0 ? Math.min(100, (todayTok / avg) * 100) : todayTok > 0 ? 100 : 0;
    zivy(el, 'meter', `
    <div class="meter-row"><span>${tr('Zaznamenané tokeny dnes')}</span><span class="num">${tween('ov-today', todayTok, 'tok')}<span class="of"> / ⌀ ${fmtTok(avg)} ${tr('za den')} <span title="${tr('Průměr z posledních 7 dokončených dní, bez dneška')}">${tr('(předchozích 7 dní)')}</span></span></span></div>
    <div class="meter-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${tr('Dnešní zpracované tokeny vůči průměru za 7 dní')}"><i style="width:${pct.toFixed(1)}%"></i></div>`);
  }

  // Souhrn „kolik dnes" je nahoře; tohle odpovídá na druhou půlku otázky – který nástroj to byl.
  // Počítá se ze stejných hodinových přihrádek jako měřák, takže se čísla nemůžou rozejít.
  if (changed(topics, 'sessions', 'tick')) {
    const odRana = startOfDay(now);
    const nastroje = new Map();
    for (const s of everything) {
      const n = tokensSince([s], odRana);
      if (!n) continue;
      const klic = s.app || tr('Ostatní');
      const d = nastroje.get(klic) || { value: 0, provider: s.provider, runtime: s.runtime };
      d.value += n;
      nastroje.set(klic, d);
    }
    const polozky = [...nastroje.entries()]
      .map(([label, d]) => ({ label, value: d.value, icon: glyph({ app: label, provider: d.provider, runtime: d.runtime }) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    zivy(el, 'today-apps', polozky.length
      ? hbars(polozky)
      : `<p class="empty-inline">${tr('Dnes zatím žádné tokeny.')}</p>`);
  }

  if (changed(topics, 'sessions', 'limits', 'credits', 'integrations', 'tick', 'detekce')) {
    const windows = limitWindows(state.limits, now);
    const credits = state.credits.filter((c) => Number.isFinite(c.balance));
    zivy(el, 'limits', `<div class="sec-head"><h2>${tr('Okna limitů')}</h2><a class="link" href="#/statistiky#limity">${tr('Detail')}</a></div>
       ${windows}
       ${claudeLimitStatus(state, now)}
       ${credits.map((c) => `<a class="credit-chip" href="#/utrata">${glyph(c.id === 'codex' ? { connector: 'codex' } : c.provider)}<span>${esc(c.label)}</span><b>${c.balance.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}</b>${creditAge(c)?.stary ? `<small class="je-stare">${esc(creditAge(c).kratce)}</small>` : ''}</a>`).join('')}
       ${limitsAll(state, now)}`);
  }

  if (changed(topics, 'sessions', 'dopln')) zivy(el, 'activity', all.length ? all.slice(0, v.aktivit).map(activityItem).join('') : `<li class="empty-inline">${tr('Zatím žádná aktivita.')}</li>`);

  if (changed(topics, 'sessions', 'tick')) {
    const timelineNow = changed(topics, 'all', 'tick') ? now : v.timelineNow || now;
    v.timelineNow = timelineNow;
    const from = timelineNow - 12 * H;
    const rank = attentionRank;
    const lastSpan = (s) => (s.spans?.length ? s.spans[s.spans.length - 1][1] : s.lastAt);
    // Do osy se vejde sedm řádků. Zbytek se nesmí jen zahodit – uživatel by nevěděl, že něco nevidí,
    // a u nástroje, který má hlídat všechny agenty, je tiché zamlčení to nejhorší možné chování.
    const vybrane = all
      .filter((s) => s.spans?.some(([, b]) => b >= from) || rank(s) < 3)
      .sort((a, b) => rank(a) - rank(b) || lastSpan(b) - lastSpan(a));
    const rows = vybrane
      .slice(0, TIMELINE_MAX)
      .map((s) => ({ id: s.id, title: s.title, fullTitle: s.fullTitle, app: s.app, status: s.status, lastAt: s.lastAt, spans: s.spans || [], color: chartColor(pkey(s.provider)), glyph: glyph(s) }));
    const skryto = vybrane.length - rows.length;
    zivy(el, 'timeline', rows.length
      ? `${timeline({ rows, from, to: timelineNow + 20 * MIN, now: timelineNow })}${skryto > 0
        ? `<p class="tl-more"><span>${esc(tr('Na ose je {0} nejdůležitějších agentů.', TIMELINE_MAX))} ${esc(plural(skryto, 'Další je v sekci Agenti.', 'Další {0} jsou v sekci Agenti.', 'Dalších {0} je v sekci Agenti.').replace('{0}', skryto))}</span><a class="link" href="#/agenti">${tr('Všichni agenti')}</a></p>` : ''}`
      : `<div class="empty-inline">${tr('Za posledních 12 hodin žádná aktivita agentů.')}</div>`);
  }

  const chartTickDue = topics.has('tick') && Math.floor(now / H) !== Math.floor(v.chartAt / H);
  const chartImmediate = changed(topics, 'all', 'period', 'legend', 'overview:chart') || chartTickDue;
  if (chartImmediate || (topics.has('sessions') && now - v.chartAt >= CHART_UPDATE_MS)) {
    const ser = providerSeries(everything, v.period, now, v.hidden);
    const chartChanged = fill(el, 'chart', ser.series.length
      ? stackedColumns({ id: 'ov-tokens', labels: ser.labels, tips: ser.tips, series: ser.series, label: tr('Tokeny'), partialLast: true })
      : `<div class="empty-inline">${tr('V tomto období žádné tokeny.')}</div>`);
    if (chartChanged && !v.drawn) el.querySelector('[data-region="chart"] .chart-plot')?.classList.add('is-drawing');
    v.drawn = true;
    v.chartAt = now;
    fill(el, 'legend', legendHtml(ser.series, { box: true }));
  } else if (topics.has('sessions')) {
    queueChart(now);
  }

  const sp = state.spend;
  if (sp && changed(topics, 'spend')) {
    if (sp.billing?.connected === false) {
      zivy(el, 'spend', `<div class="spend-mini-num"><strong>${tr('Náklady za API nejsou připojené')}</strong><a class="link-inline" href="#/nastaveni" data-karta="cloud">${tr('Propojit API')}</a></div>`);
    } else {
    const total = sp.budgetsConfig?.total || 0;
    const bp = total ? (sp.month.total / total) * 100 : 0;
    const top = Object.entries(sp.month.services).sort((a, b) => b[1] - a[1]).slice(0, 3);
    zivy(el, 'spend', `
      <div class="spend-mini-top">
        ${total ? gauge({ pct: bp, color: bp >= 100 ? 'var(--velvet-ink)' : bp >= 80 ? 'var(--brass)' : 'var(--teal)', value: `${Math.round(bp)} %`, label: tr('rozpočtu'), size: 'sm', reached: bp >= 100 }) : ''}
        <div class="spend-mini-num">
          <span class="big">${tween('ov-spend', sp.month.total, `money:${sp.currency}`)}</span>
          <span class="muted small">${total ? (ze(total) ? tr('ze {0}', fmtMoney(total, sp.currency)) : tr('z {0}', fmtMoney(total, sp.currency))) : `<a class="link-inline" href="#/utrata?rozpocty=1">${tr('Nastavit rozpočet')}</a>`}</span>
          <span class="muted small">${tr('Prognóza do konce měsíce')} ${fmtMoney(sp.forecast, sp.currency)}</span>
        </div>
      </div>
      ${top.length
        ? hbars(top.map(([k, val]) => ({ label: sp.services[k]?.label || k, value: val, color: chartColor(pkey(sp.services[k]?.provider)) })), { format: (x) => fmtMoney(x, sp.currency) })
        : `<p class="muted small">${tr('Zatím žádné API náklady.')}</p>`}`);
    }
  }

  if (changed(topics, 'runtimes', 'detekce', 'connectors')) {
    // Vlastní agenti patří mezi běžící aplikace – jinak by na Přehledu chyběli.
    const custom = (state.customAgents || []).map((a) => ({ id: `custom:${a.id}`, name: a.name, provider: 'local', running: a.running, processes: 0, cpu: 0, memMB: 0, detail: a.detail }));
    // Běžící nástroje jsou vidět vždy všechny – limit osmi platí jen pro ty, které teď neběží.
    const serazene = [...pouzivaneNastroje(state), ...custom].sort((a, b) => Number(b.running) - Number(a.running) || b.cpu - a.cpu || a.name.localeCompare(b.name, LOCALE));
    const rts = serazene.filter((r, i) => r.running || i < 8);
    // Konverzace v prohlížeči vidí Agenteeq jen přes rozšíření. Dokud nikdy nic neposlalo, patří
    // sem dlaždice, která to řekne – jinak uživatel otevře Gemini na webu a aplikace mlčí.
    const webChybi = (state.connectors || []).find((c) => c.id === 'web')?.state === 'missing';
    zivy(el, 'runtimes', rts.length
    ? (procesyNevim ? `<p class="rt-warn" role="status">${tr('Nepodařilo se zjistit, co na {0} teď běží. Vidíš poslední známý stav.', tomtoPocitaci())}</p>` : '') + rts.map((r) => {
      // U běžící aplikace, kterou umíme přepnout do popředí, je dlaždice tlačítko – hlavní
      // úspora času: uživatel nemusí mezi okny hledat, kde mu který agent běží.
      const prepnout = r.running && PREPNUTELNE.has(r.id);
      // Aplikace, která běží, ale své konverzace na tento Mac neukládá, musí to říct rovnou tady.
      // Jinak uživatel vidí, že aplikace běží, v seznamu agentů po ní není stopa – a vypadá to,
      // že ji Agenteeq nezaregistroval.
      const bez = r.running && bezPrepisu(r.id, all) ? BEZ_PREPISU[r.id] : null;
      const vnitrek = `<span class="rt-disc">${glyph({ runtime: r.id, provider: r.provider })}${r.running ? '<i class="rt-status"></i>' : ''}</span>
        <span class="rt-name">${esc(r.name)}</span>
        <span class="rt-meta">${r.running ? (r.id.startsWith('custom:') ? esc(r.detail || tr('odpovídá')) : `CPU ${String(r.cpu).replace('.', ',')} %`) : tr('neběží')}</span>
        ${bez ? `<span class="rt-flag">${tr('bez přepisu')}</span>` : ''}`;
      const popis = esc(r.running ? `${r.processes} ${plural(r.processes, 'proces', 'procesy', 'procesů')} · ${r.memMB} MB${r.detail ? ` · ${r.detail}` : ''}` : tr('Neběží'));
      // Dlaždice bez přepisu vede na Agenty, kde je celé vysvětlení – ne do slepé uličky.
      if (bez) return `<a class="rt-item rt-item--note" href="#/agenti" title="${esc(bez.duvod)}">${vnitrek}</a>`;
      return prepnout
        ? `<button class="rt-item rt-item--go" type="button" data-focus-runtime="${esc(r.id)}" title="${tr('Přepnout do {0} –', esc(r.name))} ${popis}">${vnitrek}</button>`
        : `<div class="rt-item${r.running ? '' : ' is-off'}" title="${popis}">${vnitrek}</div>`;
    }).join('') + (webChybi
      ? `<a class="rt-item rt-item--note" href="#/nastaveni" data-go-extension title="${tr('Chaty z ChatGPT, Claude.ai, Gemini a dalších webových služeb sleduje rozšíření pro Chrome.')}">
          <span class="rt-disc">${ICON.cloud}</span>
          <span class="rt-name">${tr('Web')}</span>
          <span class="rt-meta">${tr('nesleduje se')}</span>
          <span class="rt-flag">${tr('bez rozšíření')}</span>
        </a>`
      : '')
      // Selhání zjišťování má přednost: prázdný seznam po chybě není „vypnuto“ ani „nic neběží“.
      : `<div class="empty-inline">${procesyNevim ? tr('Nepodařilo se zjistit, co na {0} běží.', tomtoPocitaci())
        : !state.runtimes.length ? tr('Sledování procesů je vypnuté.')
          : tr('Teď na {0} neběží žádný AI nástroj.', tomtoPocitaci())}</div>`);
  }
  v.studio?.refresh();
  v.aktivnichCelkem = all.length;
  // Obsah widgetů se mohl vyprázdnit nebo naplnit: řádky nástěnky se složí znovu (bez animace,
  // jen šířky). Doplnění aktivity běží až po složení; vlastní překreslení ('dopln') ho nespouští.
  if (!v.board?.isBusy()) v.board?.relayout();
  if (topics.has('dopln')) cancelAnimationFrame(v.doplnRaf);
}

export default {
  id: 'prehled',
  title: tr('Přehled'),
  mount,
  update,
  unmount: () => {
    clearTimeout(v.chartTimer);
    cancelAnimationFrame(v.doplnRaf);
    v.board?.destroy();
    v.studio?.destroy();
    v.launcher?.destroy();
    Object.assign(v, { el: null, launcher: null, board: null, chartTimer: null, chartAt: 0, timelineNow: 0 });
  },
};
