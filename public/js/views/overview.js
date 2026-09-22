import { state, sessionsList, agentsList, emit } from '../state.js';
import { api } from '../api.js';
import { esc, fmtTok, fmtMoney, plural, startOfDay, DAY, H, MIN } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON } from '../icons.js';
import { stackedColumns, timeline, hbars, gauge } from '../charts.js';
import { tokensSince, providerSeries, STATUS_ORDER, needsYou, attentionRank } from '../data.js';
import { limitsAll } from '../limits-ui.js';
import { watchBalance } from '../balance.js';
import { fill, tween, activityItem, decisionCard, legendHtml, limitWindows, toast, agentHref, creditAge } from '../ui.js';
import { BEZ_PREPISU } from '../no-transcript.js';
import { createLauncher } from '../launcher-ui.js';
import { goToExtension } from '../jump.js';

const AKTIVIT_MIN = 6; // kolik řádků poslední aktivity je vidět, než se dopočítá podle volného místa
const AKTIVIT_MAX = 24;
const TIMELINE_MAX = 7; // víc řádků se do osy nevejde; zbytek se vypíše pod ní jako odkaz
const CHART_UPDATE_MS = 500;
const v = { period: 'week', aktivit: AKTIVIT_MIN, doplnRaf: 0, aktivnichCelkem: 0, hidden: new Set(), drawn: false, el: null, launcher: null, chartAt: 0, chartTimer: null, timelineNow: 0 };

// Aplikace, které server umí přepnout do popředí (pevný seznam v src/openers.js).
const PREPNUTELNE = new Set(['claude-desktop', 'chatgpt', 'cursor', 'vscode', 'ms-copilot', 'perplexity', 'grok', 'lmstudio', 'ollama']);

const changed = (topics, ...names) => topics.has('all') || names.some((name) => topics.has(name));

// Sloupce Přehledu nejsou stejně vysoké – rozbalený seznam limitů nebo delší graf jeden z nich
// protáhne a pod tím druhým zůstane prázdno. Poslední aktivita je jediný blok, který umí růst,
// tak se jím díra zaplní. Počítá se z naměřené výšky, ne odhadem: při jiných datech nebo jiné
// velikosti okna vyjde jiné číslo.
function doplnAktivitu(el, celkem) {
  const sloupce = el.querySelectorAll('.ov > .bal-col');
  const seznam = el.querySelector('[data-region="activity"]');
  if (sloupce.length !== 2 || !seznam || !celkem) return;
  const radek = seznam.firstElementChild;
  if (!radek || getComputedStyle(el.querySelector('.ov')).gridTemplateColumns.trim().split(/\s+/).length < 2) {
    if (v.aktivit !== AKTIVIT_MIN) { v.aktivit = AKTIVIT_MIN; update(new Set(['dopln'])); }
    return;
  }
  const mujSloupec = seznam.closest('.bal-col');
  const druhy = [...sloupce].find((c) => c !== mujSloupec);
  const vyskaRadku = radek.getBoundingClientRect().height + parseFloat(getComputedStyle(seznam).rowGap || 0);
  const mezera = druhy.getBoundingClientRect().height - mujSloupec.getBoundingClientRect().height;
  if (!vyskaRadku) return;
  const zmena = mezera > vyskaRadku ? Math.floor(mezera / vyskaRadku) : mezera < -vyskaRadku ? -Math.floor(-mezera / vyskaRadku) : 0;
  if (!zmena) return;
  const chci = Math.max(AKTIVIT_MIN, Math.min(AKTIVIT_MAX, celkem, v.aktivit + zmena));
  if (chci === v.aktivit) return;
  v.aktivit = chci;
  update(new Set(['dopln']));
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
  const steps = [
    { done: state.sessions.size > 0, label: 'Agenti na tomto Macu nalezeni', sub: 'Claude Code, Codex, Cursor, Copilot a další se načítají samy.', cta: '<a class="btn btn--sm" href="#/nastaveni">Zdroje dat</a>' },
    ...(maClaudeCode ? [{ done: Boolean(hooks?.installed && hooks?.current), label: 'Propojení s Claude Code', sub: 'Žádost o povolení a přesné limity uvidíš hned.', cta: '<a class="btn btn--sm" href="#/nastaveni">Zapnout</a>' }] : []),
    { done: Boolean(ext && ext.state !== 'missing'), label: 'Rozšíření pro Chrome', sub: 'Agenti z ChatGPT, Gemini a Claude.ai v přehledu. Zadání se do nich vloží samo.', cta: '<button class="btn btn--sm" type="button" data-go-extension>Nainstalovat</button>' },
    { done: state.projects.items.length > 0, label: 'První projekt', sub: 'Konverzace ze všech služeb seřazené podle klientů.', cta: '<a class="btn btn--sm" href="#/projekty">Založit</a>' },
    { done: (state.usage?.launches || 0) > 0, label: 'Spusť agenta přímo z Agenteeq', sub: 'Zadání, složka a projekt na jednom místě.', cta: '<button class="btn btn--sm" type="button" data-onboard-launch>Zkusit</button>' },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return '';
  return `<section class="card onboard" aria-labelledby="ob-h">
    <div class="onboard-head"><div><h2 id="ob-h">Začni s Agenteeq</h2><p class="muted small">${done} z ${steps.length} hotovo</p></div>
      <div class="onboard-track" role="progressbar" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}" aria-label="Průvodce nastavením"><i style="width:${((done / steps.length) * 100).toFixed(0)}%"></i></div>
      <button class="link" type="button" data-onboard-dismiss>Skrýt průvodce</button></div>
    <ol class="onboard-steps">${steps.map((s) => `<li class="onboard-step${s.done ? ' is-done' : ''}"><span class="onboard-mark" aria-hidden="true">${s.done ? ICON.check : ''}</span>
      <span class="onboard-text"><span>${s.label}</span><small>${s.sub}</small></span>${s.done ? '<span class="sr-only">hotovo</span>' : s.cta}</li>`).join('')}</ol>
  </section>`;
}

function mount(el) {
  v.el = el;
  v.drawn = false;
  el.innerHTML = `
  <section class="pulse-bar" data-enter style="--i:0" aria-label="Stav agentů" data-region="hero"></section>
  <section class="card launch" data-enter style="--i:1" aria-labelledby="launch-h" data-launch></section>
  <div data-region="onboard"></div>
  <div class="ov">
    <div class="ov-col bal-col">
      <section data-enter style="--i:2" aria-labelledby="dec-h">
        <div class="sec-head"><h2 id="dec-h">Potřebuje tvé rozhodnutí</h2><a class="link" href="#/agenti?stav=needs_input">Všechny</a></div>
        <div data-region="decisions"></div>
      </section>
      <section data-enter style="--i:2" aria-labelledby="tl-h">
        <div class="sec-head"><h2 id="tl-h">Dnešní směna</h2><span class="muted small">posledních 12 hodin</span></div>
        <div class="card tl-card" data-region="timeline"></div>
      </section>
      <section data-enter style="--i:3" data-region="meter" aria-label="Tokeny dnes"></section>
      <section class="card token-card" data-enter style="--i:3" aria-labelledby="chart-h">
        <div class="sec-head"><h2 id="chart-h">Tokeny</h2>
          <label class="select"><span class="sr-only">Období</span><select data-action="period"><option value="today">Dnes</option><option value="day">24 hodin</option><option value="week">Týden</option><option value="fortnight">14 dní</option><option value="month">30 dní</option></select></label>
        </div>
        <div data-region="chart"></div>
        <div class="legend" data-region="legend"></div>
        <p class="note note--tight">Vstup + výstup z přepisů na tomto Macu. Není to cena ani kredity – ty najdeš v <a class="link-inline" href="#/utrata">Útratě</a>.</p>
      </section>
    </div>
    <div class="ov-col bal-col">
      <section data-enter style="--i:4" aria-labelledby="td-h">
        <div class="sec-head"><h2 id="td-h">Kam dnes šly tokeny</h2><a class="link" href="#/statistiky">Statistiky</a></div>
        <div class="card pad" data-region="today-apps"></div>
      </section>
      <section data-enter style="--i:4" data-region="limits" aria-label="Limity předplatných"></section>
      <section data-enter style="--i:4" aria-labelledby="sp-h" data-float>
        <div class="sec-head"><h2 id="sp-h">Útrata tento měsíc</h2><a class="link" href="#/utrata">Detail</a></div>
        <div class="card spend-mini" data-region="spend"></div>
      </section>
      <section data-enter style="--i:5" aria-labelledby="act-h" data-float>
        <div class="sec-head"><h2 id="act-h">Poslední aktivita</h2><a class="link" href="#/agenti">Zobrazit vše</a></div>
        <ul class="activity" data-region="activity"></ul>
      </section>
    </div>
  </div>
  <section class="ov-wide" data-enter style="--i:5" aria-labelledby="rt-h">
    <div class="sec-head"><h2 id="rt-h">Běží na tomto Macu</h2><a class="link" href="#/nastaveni">Zdroje dat</a></div>
    <div class="rt-grid" data-region="runtimes"></div>
  </section>
`;
  v.unwatch = watchBalance(el.querySelector('.ov'), () => doplnAktivitu(el, v.aktivnichCelkem));
  const sel = el.querySelector('[data-action="period"]');
  sel.value = v.period;
  sel.addEventListener('change', () => {
    v.period = sel.value;
    v.drawn = false;
    update(new Set(['period']));
  });
  v.launcher = createLauncher(el.querySelector('[data-launch]'));
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-go-extension]')) { goToExtension(); return; }
    const prepnout = e.target.closest('[data-focus-runtime]');
    if (prepnout) {
      prepnout.disabled = true;
      try {
        const r = await api.focusRuntime(prepnout.dataset.focusRuntime);
        if (r.dry) toast(`Zkušební režim: ${r.label} se nepřepnul`, { tone: 'info' });
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
        toast('Průvodce skrytý. Nastavení najdeš kdykoli v sekci Nastavení.', { tone: 'info' });
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

function update(topics = new Set(['all'])) {
  const el = v.el;
  if (!el) return;
  if (changed(topics, 'launch', 'projects', 'runs', 'usage')) v.launcher?.update();
  if (changed(topics, 'sessions', 'connectors', 'integrations', 'projects', 'settings', 'usage')) fill(el, 'onboard', onboardingHtml());
  const now = Date.now();
  const everything = sessionsList();
  const all = agentsList();
  const working = all.filter((s) => s.status === 'working');
  const needs = all
    .filter(needsYou)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.lastAt - a.lastAt);
  const today = startOfDay(now);
  const todayCount = all.filter((s) => s.lastAt >= today).length;
  const running = state.runtimes.filter((r) => r.running).length;

  // Počty v pruhu = přesně stejná pravidla jako filtry v sekci Agenti (needsYou, stav working/waiting).
  const failedCount = needs.filter((s) => s.status === 'failed').length;
  const decideCount = needs.length - failedCount;
  const waiting = all.filter((s) => s.status === 'waiting');
  const live = [...needs, ...working, ...waiting.sort((a, b) => b.lastAt - a.lastAt)];
  const STRIP_MAX = 12;
  if (changed(topics, 'sessions', 'runtimes')) {
    el.querySelector('[data-region="hero"]').classList.toggle('is-live', working.length > 0);
    fill(el, 'hero', `
    <div class="pb-main">
      <span class="pb-live" aria-hidden="true"></span>
      <span class="pb-num">${tween('ov-working', working.length)}</span>
      <span class="pb-label"><b>${plural(working.length, 'agent pracuje', 'agenti pracují', 'agentů pracuje')}</b>
        <small>${todayCount} ${plural(todayCount, 'aktivní konverzace', 'aktivní konverzace', 'aktivních konverzací')} dnes${state.runtimes.length ? ` · ${running} ${plural(running, 'aplikace běží', 'aplikace běží', 'aplikací běží')}` : ''}</small></span>
    </div>
    <div class="pb-stats">
      <a class="pb-stat${decideCount ? ' is-alert' : ''}" href="#/agenti?stav=needs_input"><b>${decideCount}</b><span>potřebuje tebe</span></a>
      <a class="pb-stat${failedCount ? ' is-alert' : ''}" href="#/agenti?stav=needs_input"><b>${failedCount}</b><span>selhalo</span></a>
      <a class="pb-stat${waiting.length ? ' is-wait' : ''}" href="#/agenti?stav=waiting"><b>${waiting.length}</b><span>čeká na zadání</span></a>
    </div>
    <a class="link pb-all" href="#/agenti">Všichni agenti ${ICON.arrow}</a>
    <div class="pb-strip">${live.length
      ? `<ul class="pb-agents" aria-label="Aktivní agenti">${live.slice(0, STRIP_MAX).map((s) => {
        const text = s.status === 'working' ? (s.activity || 'Pracuje') : needsYou(s) ? s.reason : 'Čeká na zadání';
        return `<li><a class="pb-agent" data-state="${needsYou(s) ? 'alert' : esc(s.status)}" href="${agentHref(s.id)}">
          <span class="pb-agent-logo">${glyph(s)}</span>
          <span class="pb-agent-text"><b>${esc(s.title)}</b><small><i aria-hidden="true"></i>${esc(text)}<span class="sr-only"> · ${esc(s.app)}</span></small></span>
        </a></li>`;
      }).join('')}${live.length > STRIP_MAX ? `<li><a class="pb-agent pb-agent--more" href="#/agenti">+${live.length - STRIP_MAX}</a></li>` : ''}</ul>`
      : '<p class="pb-empty">Žádný agent teď nepracuje ani nečeká na zadání.</p>'}</div>`);
  }

  const hooks = state.integrations?.claudeHooks;
  if (changed(topics, 'sessions', 'integrations')) fill(el, 'decisions', needs.length
    ? `<ul class="decisions">${needs.slice(0, 4).map(decisionCard).join('')}</ul>${needs.length > 4 ? `<a class="link more" href="#/agenti?stav=needs_input">A dalších ${needs.length - 4}</a>` : ''}`
    : `<div class="calm"><span class="calm-mark">${ICON.check}</span><div><strong>Všechno běží bez tebe</strong>
        <p>Jakmile agent bude chtít souhlas, odpověď nebo narazí na limit, objeví se tady a přijde ti upozornění.</p>
        ${hooks && !hooks.installed && (state.connectors || []).some((c) => c.id === 'claude-code' && c.state !== 'missing') ? `<a class="link-inline" href="#/nastaveni">Zapnout propojení s Claude Code ${ICON.arrow}</a>` : ''}</div></div>`);

  if (changed(topics, 'sessions', 'tick')) {
    const todayTok = tokensSince(everything, today);
    const avg = Math.max(0, tokensSince(everything,startOfDay(now - 7 * DAY)) - todayTok) / 7;
    const pct = avg > 0 ? Math.min(100, (todayTok / avg) * 100) : todayTok > 0 ? 100 : 0;
    fill(el, 'meter', `
    <div class="meter-row"><span>Tokeny dnes</span><span class="num">${tween('ov-today', todayTok, 'tok')}<span class="of"> / ⌀ ${fmtTok(avg)} za den <span title="Průměr z posledních 7 dokončených dní, bez dneška">(předchozích 7 dní)</span></span></span></div>
    <div class="meter-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="Dnešní zpracované tokeny vůči průměru za 7 dní"><i style="width:${pct.toFixed(1)}%"></i></div><p class="metric-note">Technická metrika z lokálních přepisů, ne cena ani limit předplatného. Skutečné náklady jsou v Útratě.</p>`);
  }

  // Souhrn „kolik dnes" je nahoře; tohle odpovídá na druhou půlku otázky – který nástroj to byl.
  // Počítá se ze stejných hodinových přihrádek jako měřák, takže se čísla nemůžou rozejít.
  if (changed(topics, 'sessions', 'tick')) {
    const odRana = startOfDay(now);
    const nastroje = new Map();
    for (const s of everything) {
      const n = tokensSince([s], odRana);
      if (!n) continue;
      const klic = s.app || 'Ostatní';
      const d = nastroje.get(klic) || { value: 0, provider: s.provider, runtime: s.runtime };
      d.value += n;
      nastroje.set(klic, d);
    }
    const polozky = [...nastroje.entries()]
      .map(([label, d]) => ({ label, value: d.value, icon: glyph({ app: label, provider: d.provider, runtime: d.runtime }) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    fill(el, 'today-apps', polozky.length
      ? hbars(polozky)
      : '<p class="empty-inline">Dnes zatím žádné tokeny. Jakmile agent začne pracovat, uvidíš tady, kam jdou.</p>');
  }

  if (changed(topics, 'sessions', 'limits', 'credits', 'integrations', 'tick')) {
    const windows = limitWindows(state.limits, now);
    const credits = state.credits.filter((c) => Number.isFinite(c.balance));
    const claudeExact = state.limits.some((l) => l.source === 'statusline');
    const usesClaude = all.some((s) => s.connector === 'claude-code');
    const limitHint = usesClaude && !claudeExact
      ? `<p class="lwin-hint">Přesné limity Claude (5 h a týden) uvidíš po zapnutí propojení s Claude Code v <a class="link-inline" href="#/nastaveni">Nastavení</a> – Claude Code je pak posílá sám.</p>`
      : '';
    fill(el, 'limits', `<div class="sec-head"><h2>Okna limitů</h2><a class="link" href="#/statistiky#limity">Detail</a></div>
       ${windows}${limitHint}
       ${credits.map((c) => `<a class="credit-chip" href="#/utrata">${glyph(c.id === 'codex' ? { connector: 'codex' } : c.provider)}<span>${esc(c.label)}</span><b>${c.balance.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</b>${creditAge(c)?.stary ? `<small class="je-stare">${esc(creditAge(c).kratce)}</small>` : ''}</a>`).join('')}
       ${limitsAll(state, now)}`);
  }

  if (changed(topics, 'sessions', 'dopln')) fill(el, 'activity', all.length ? all.slice(0, v.aktivit).map(activityItem).join('') : '<li class="empty-inline">Zatím žádná aktivita. Spusť agenta a objeví se tady.</li>');

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
      .map((s) => ({ id: s.id, title: s.title, app: s.app, status: s.status, lastAt: s.lastAt, spans: s.spans || [], color: PROVIDERS[pkey(s.provider)].color, glyph: glyph(s) }));
    const skryto = vybrane.length - rows.length;
    fill(el, 'timeline', rows.length
      ? `${timeline({ rows, from, to: timelineNow + 20 * MIN, now: timelineNow })}${skryto > 0
        ? `<a class="tl-more" href="#/agenti">Na ose je ${TIMELINE_MAX} nejdůležitějších agentů. ${skryto === 1 ? 'Další je' : `Dalších ${skryto} je`} v sekci Agenti${ICON.arrow}</a>` : ''}`
      : '<div class="empty-inline">Za posledních 12 hodin žádná aktivita agentů.</div>');
  }

  const chartTickDue = topics.has('tick') && Math.floor(now / H) !== Math.floor(v.chartAt / H);
  const chartImmediate = changed(topics, 'all', 'period', 'legend', 'overview:chart') || chartTickDue;
  if (chartImmediate || (topics.has('sessions') && now - v.chartAt >= CHART_UPDATE_MS)) {
    const ser = providerSeries(everything, v.period, now, v.hidden);
    const chartChanged = fill(el, 'chart', ser.series.length
      ? stackedColumns({ id: 'ov-tokens', labels: ser.labels, tips: ser.tips, series: ser.series, label: 'Tokeny', partialLast: true })
      : '<div class="empty-inline">V tomto období žádné tokeny.</div>');
    if (chartChanged && !v.drawn) el.querySelector('[data-region="chart"] .chart-plot')?.classList.add('is-drawing');
    v.drawn = true;
    v.chartAt = now;
    fill(el, 'legend', legendHtml(ser.series, { box: true }));
  } else if (topics.has('sessions')) {
    queueChart(now);
  }

  const sp = state.spend;
  if (sp && changed(topics, 'spend')) {
    const total = sp.budgetsConfig?.total || 0;
    const bp = total ? (sp.month.total / total) * 100 : 0;
    const top = Object.entries(sp.month.services).sort((a, b) => b[1] - a[1]).slice(0, 3);
    fill(el, 'spend', `
      <div class="spend-mini-top">
        ${total ? gauge({ pct: bp, color: bp >= 100 ? 'var(--velvet-ink)' : bp >= 80 ? 'var(--brass)' : 'var(--teal)', value: `${Math.round(bp)} %`, label: 'rozpočtu', size: 'sm', reached: bp >= 100 }) : ''}
        <div class="spend-mini-num">
          <span class="big">${tween('ov-spend', sp.month.total, `money:${sp.currency}`)}</span>
          <span class="muted small">${total ? `z ${fmtMoney(total, sp.currency)}` : 'Rozpočet zatím nemáš nastavený'}</span>
          <span class="muted small">Prognóza do konce měsíce ${fmtMoney(sp.forecast, sp.currency)}</span>
        </div>
      </div>
      ${top.length
        ? hbars(top.map(([k, val]) => ({ label: sp.services[k]?.label || k, value: val, color: PROVIDERS[pkey(sp.services[k]?.provider)].color })), { format: (x) => fmtMoney(x, sp.currency) })
        : `<p class="muted small">Zatím žádné výdaje. <a class="link-inline" href="#/utrata?pridat=1">Zapsat první</a></p>`}`);
  }

  if (changed(topics, 'runtimes')) {
    // Vlastní agenti patří mezi běžící aplikace – jinak by na Přehledu chyběli.
    const custom = (state.customAgents || []).map((a) => ({ id: `custom:${a.id}`, name: a.name, provider: 'local', running: a.running, processes: 0, cpu: 0, memMB: 0, detail: a.detail }));
    const rts = [...state.runtimes, ...custom].sort((a, b) => Number(b.running) - Number(a.running) || b.cpu - a.cpu).slice(0, 8);
    // Konverzace v prohlížeči vidí Agenteeq jen přes rozšíření. Dokud nikdy nic neposlalo, patří
    // sem dlaždice, která to řekne – jinak uživatel otevře Gemini na webu a aplikace mlčí.
    const webChybi = (state.connectors || []).find((c) => c.id === 'web')?.state === 'missing';
    fill(el, 'runtimes', rts.length
    ? rts.map((r) => {
      // U běžící aplikace, kterou umíme přepnout do popředí, je dlaždice tlačítko – hlavní
      // úspora času: uživatel nemusí mezi okny hledat, kde mu který agent běží.
      const prepnout = r.running && PREPNUTELNE.has(r.id);
      // Aplikace, která běží, ale své konverzace na tento Mac neukládá, musí to říct rovnou tady.
      // Jinak uživatel vidí, že aplikace běží, v seznamu agentů po ní není stopa – a vypadá to,
      // že ji Agenteeq nezaregistroval.
      const bez = r.running ? BEZ_PREPISU[r.id] : null;
      const vnitrek = `<span class="rt-disc">${glyph({ runtime: r.id, provider: r.provider })}${r.running ? '<i class="rt-status"></i>' : ''}</span>
        <span class="rt-name">${esc(r.name)}</span>
        <span class="rt-meta">${r.running ? (r.id.startsWith('custom:') ? esc(r.detail || 'odpovídá') : `CPU ${String(r.cpu).replace('.', ',')} %`) : 'neběží'}</span>
        ${bez ? '<span class="rt-flag">bez přepisu</span>' : ''}`;
      const popis = esc(r.running ? `${r.processes} procesů · ${r.memMB} MB${r.detail ? ` · ${r.detail}` : ''}` : 'Neběží');
      // Dlaždice bez přepisu vede na Agenty, kde je celé vysvětlení – ne do slepé uličky.
      if (bez) return `<a class="rt-item rt-item--note" href="#/agenti" title="${esc(bez.duvod)}">${vnitrek}</a>`;
      return prepnout
        ? `<button class="rt-item rt-item--go" type="button" data-focus-runtime="${esc(r.id)}" title="Přepnout do ${esc(r.name)} – ${popis}">${vnitrek}</button>`
        : `<div class="rt-item${r.running ? '' : ' is-off'}" title="${popis}">${vnitrek}</div>`;
    }).join('') + (webChybi
      ? `<a class="rt-item rt-item--note" href="#/nastaveni" title="Gemini, ChatGPT, Claude.ai, Perplexity, Grok, Microsoft Copilot a Qwen Chat na webu vidí Agenteeq jen přes rozšíření pro Chrome.">
          <span class="rt-disc">${ICON.cloud}</span>
          <span class="rt-name">Web</span>
          <span class="rt-meta">nesleduje se</span>
          <span class="rt-flag">bez rozšíření</span>
        </a>`
      : '')
      : '<div class="empty-inline">Sledování procesů je vypnuté.</div>');
  }
  v.aktivnichCelkem = all.length;
  // Až po vykreslení a vyvážení sloupců: teprve tehdy je vidět, kolik místa dole zbylo.
  if (!topics.has('dopln')) {
    cancelAnimationFrame(v.doplnRaf);
    v.doplnRaf = requestAnimationFrame(() => requestAnimationFrame(() => doplnAktivitu(el, all.length)));
  }
}

export default {
  id: 'prehled',
  title: 'Přehled',
  mount,
  update,
  unmount: () => {
    clearTimeout(v.chartTimer);
    cancelAnimationFrame(v.doplnRaf);
    v.unwatch?.();
    v.launcher?.destroy();
    Object.assign(v, { el: null, launcher: null, unwatch: null, chartTimer: null, chartAt: 0, timelineNow: 0 });
  },
};
