import { api } from '../api.js';
import { state, sessionsList, agentsList } from '../state.js';
import { esc, fmtNum, fmtTok, plural } from '../format.js';
import { glyph } from '../icons.js';
import { stackedColumns, heatmap, hbars, timeLine } from '../charts.js';
import { providerSeries, heatGrid, heatDetails, groupTotals, activeHours, isActiveSince, chartColor } from '../data.js';
import { limitsAll } from '../limits-ui.js';
import { watchBalance } from '../balance.js';
import { fill, tween, legendHtml, limitGauges, emptyState, creditAgeHtml } from '../ui.js';
import { tr, LOCALE } from '../i18n.js';

const v = { period: 'week', hidden: new Set(), drawn: false, el: null, usage: undefined };
const PERIODS = [['today', tr('Dnes')], ['day', tr('24 hodin')], ['week', tr('7 dní')], ['fortnight', tr('14 dní')], ['month', tr('30 dní')]];

function mount(el) {
  v.el = el;
  v.drawn = false;
  // Historie vytížení se čte ze souboru aplikace Claude Desktop, který se během dne mění.
  // Načítá se proto při každém otevření; dosavadní graf zůstane, dokud nedorazí nový.
  if (v.usage === undefined) v.usage = null;
  loadUsage();
  el.innerHTML = `
    <div class="toolbar" data-enter style="--i:1">
      <div class="seg" role="group" aria-label="${tr('Období')}" data-region="period"></div>
    </div>
    <div class="kpis" data-enter style="--i:2" data-region="kpis"></div>
    <section class="card pad" data-enter style="--i:3" aria-labelledby="st-chart-h">
      <div class="sec-head"><h2 id="st-chart-h">${tr('Tokeny podle poskytovatele')}</h2></div>
      <div data-region="chart"></div>
      <div class="legend" data-region="legend"></div>
      <div data-region="api-tokens"></div>
    </section>
    <div class="grid-2 st-cards" data-enter style="--i:4">
      <div class="bal-col">
        <section class="card pad" data-float aria-labelledby="heat-h"><div class="sec-head"><h2 id="heat-h">${tr('Kdy agenti pracují')}</h2><span class="muted small">${tr('30 dní')}</span></div><div data-region="heat"></div></section>
        <section class="card pad" data-float aria-labelledby="proj-h"><div class="sec-head"><h2 id="proj-h">${tr('Tokeny podle složky')}</h2></div><div data-region="projects"></div></section>
      </div>
      <div class="bal-col">
        <section class="card pad" data-float aria-labelledby="apps-h"><div class="sec-head"><h2 id="apps-h">${tr('Tokeny podle aplikace')}</h2></div><div data-region="apps"></div></section>
        <section class="card pad" data-float aria-labelledby="mod-h"><div class="sec-head"><h2 id="mod-h">${tr('Tokeny podle modelu')}</h2></div><div data-region="models"></div></section>
      </div>
    </div>
    <section class="card pad" id="limity" data-enter style="--i:6" aria-labelledby="lim-h">
      <div class="sec-head"><h2 id="lim-h">${tr('Limity a kredity')}</h2></div>
      <div data-region="limits"></div>
      <div data-region="usage-history"></div>
    </section>`;
  v.unwatch?.();
  v.unwatch = watchBalance(el.querySelector('.st-cards'));
  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-period]');
    if (p) { v.period = p.dataset.period; v.drawn = false; update(); return; }
    const b = e.target.closest('[data-legend]');
    if (b) {
      const k = b.dataset.legend;
      if (v.hidden.has(k)) v.hidden.delete(k);
      else v.hidden.add(k);
      update();
    }
  });
}

// Historie vytížení plánu Claude (30 dní) – čte se na vyžádání ze souboru aplikace Claude Desktop.
async function loadUsage() {
  try {
    const r = await api.planUsage(30);
    v.usage = r && r.available !== false ? r : null;
  } catch {
    v.usage = null; // historie na tomto Macu není; karta se prostě nevykreslí
  }
  update();
}

function usageHistoryHtml() {
  const u = v.usage;
  if (!u) return '';
  const charts = [
    ['fiveHour', tr('Limit 5 h'), '%'],
    ['sevenDay', tr('Týdenní limit'), '%'],
  ].filter(([key]) => (u[key] || []).length >= 2)
    .map(([key, label, unit]) => `<div class="usage-chart"><div class="sec-head"><h3>${esc(label)}</h3><span class="muted small">${esc(unit === '%' ? tr('vytížení okna v %') : tr('hodnota bez jednotky'))}</span></div>
      ${timeLine({ id: `usage-${key}`, points: u[key], height: 160, color: chartColor('anthropic'), format: (x) => (unit === '%' ? `${Math.round(x)} %` : x.toLocaleString(LOCALE, { maximumFractionDigits: 2 })), axisFormat: (x) => (unit === '%' ? `${Math.round(x)}` : fmtNum(x)), label })}</div>`);
  if (!charts.length) return '';
  return `<div class="usage-history"><div class="sec-head"><h3>${tr('Vytížení plánu Claude v čase')}</h3><span class="muted small">${fmtNum(u.samples)} ${plural(u.samples, 'vzorek', 'vzorky', 'vzorků')} ${tr('za 30 dní ze souboru aplikace Claude Desktop')}</span></div>
    ${charts.join('')}</div>`;
}

// Čísla a pruhy se při živé události slučují (ui.js#sloucit), nepřepisují.
const zivy = (el, name, html) => fill(el, name, html, { sloucit: true });

// Tokeny organizace z Admin API (Anthropic, OpenAI) jsou jiná metrika než tokeny z přepisů v grafu:
// celá organizace, po dnech v UTC. Proto stojí pod grafem zvlášť, s vlastním popiskem, a nikdy se
// nepřičítají do grafu ani do KPI. Admin API počítá po dnech – pro „Dnes“ a „24 hodin“ by součet
// nesouhlasil s obdobím, a tak se tam neukazují.
const API_DNY = { week: 7, fortnight: 14, month: 30 };
const API_ZDROJE = [['anthropic-admin', 'anthropic', 'Anthropic'], ['openai-admin', 'openai', 'OpenAI']];
export function apiTokensHtml(period, now = Date.now(), cloud = state.integrations?.cloud) {
  const dny = API_DNY[period];
  if (!dny || !cloud) return '';
  const od = new Date(now - (dny - 1) * 86400e3).toISOString().slice(0, 10);
  const radky = API_ZDROJE.filter(([id]) => cloud[id]?.state === 'connected').map(([id, provider, label]) => {
    const daily = cloud[id].tokens;
    let hodnota;
    if (!daily) hodnota = `<span class="muted">${tr('nezjištěno')}</span>`;
    else {
      let input = 0;
      let output = 0;
      for (const [den, t] of Object.entries(daily)) if (den >= od) { input += Number(t?.input) || 0; output += Number(t?.output) || 0; }
      hodnota = `<span class="api-tok-val">${esc(fmtTok(input))} ${tr('vstup')} · ${esc(fmtTok(output))} ${tr('výstup')}</span>`;
    }
    return `<li><span class="svc">${glyph(provider)}${esc(label)}</span>${hodnota}</li>`;
  });
  if (!radky.length) return '';
  return `<div class="api-tok"><p class="api-tok-head"><span class="api-tok-title">${tr('Organizace přes API')}</span> <span class="muted">${tr('Tokeny z Admin API za posledních {0} dní (dny UTC). Celá organizace, nejsou v grafu ani v součtu výše.', dny)}</span></p><ul class="api-tok-list">${radky.join('')}</ul></div>`;
}

function update() {
  const el = v.el;
  if (!el) return;
  const now = Date.now();
  const all = sessionsList();
  const ser = providerSeries(all, v.period, now, v.hidden);
  const since = ser.since;

  fill(el, 'period', PERIODS.map(([k, l]) => `<button type="button" data-period="${k}" aria-pressed="${v.period === k}">${l}</button>`).join(''), { sloucit: true });

  const active = agentsList().filter((s) => isActiveSince(s, since));
  const tokens = ser.series.reduce((a, s) => a + s.values.reduce((x, y) => x + y, 0), 0);
  const hours = activeHours(all, since);
  const prompts = active.reduce((a, s) => a + (s.turns || 0), 0);
  zivy(el, 'kpis', [
    [tr('Zaznamenané tokeny'), tween(`st-tok-${v.period}`, tokens, 'tok'), tr('vstup + výstup')],
    [tr('Aktivní konverzace'), tween(`st-ses-${v.period}`, active.length), `${new Set(active.map((s) => s.app)).size} ${plural(new Set(active.map((s) => s.app)).size, 'aplikace', 'aplikace', 'aplikací')}`],
    [tr('Hodiny s aktivitou'), tween(`st-h-${v.period}`, hours), tr('hodiny, kdy aspoň jeden agent pracoval')],
    [tr('Zadání'), tween(`st-p-${v.period}`, prompts), `v ${plural(active.length, 'aktivní konverzaci', 'aktivních konverzacích', 'aktivních konverzacích')}`],
  ].map(([l, val, sub]) => `<div class="card kpi"><span class="eyebrow">${l}</span><span class="val">${val}</span><small>${esc(sub)}</small></div>`).join(''));

  const changed = fill(el, 'chart', ser.series.length
    ? stackedColumns({ id: 'st-tokens', labels: ser.labels, tips: ser.tips, series: ser.series, height: 280, label: tr('Tokeny podle poskytovatele'), partialLast: true })
    : emptyState({ title: tr('V tomto období žádné tokeny') }));
  if (changed && !v.drawn) el.querySelector('[data-region="chart"] .chart-plot')?.classList.add('is-drawing');
  v.drawn = true;
  fill(el, 'legend', legendHtml(ser.series, { box: true }));
  fill(el, 'api-tokens', apiTokensHtml(v.period, now));

  fill(el, 'heat', heatmap(heatGrid(all, now, 30), { details: heatDetails(all, now, 30) }));

  const apps = groupTotals(all, since, (s) => s.app).slice(0, 8);
  zivy(el, 'apps', apps.length
    ? hbars(apps.map((a) => ({ label: a.key, sub: `${tokens ? Math.round((a.value / tokens) * 100) : 0} %`, value: a.value, color: chartColor(a.provider), icon: glyph(a.provider) })))
    : `<p class="muted">${tr('Bez dat.')}</p>`);

  const projects = groupTotals(all, since, (s) => s.project).slice(0, 8);
  zivy(el, 'projects', projects.length
    ? hbars(projects.map((p) => ({ label: p.key, sub: `${p.count} ${plural(p.count, 'konverzace', 'konverzace', 'konverzací')}`, value: p.value, color: chartColor(p.provider), icon: glyph(p.provider) })))
    : `<p class="muted">${tr('Bez dat.')}</p>`);

  const models = groupTotals(all, since, (s) => s.model).slice(0, 8);
  zivy(el, 'models', models.length
    ? hbars(models.map((m) => ({ label: m.key, value: m.value, color: chartColor(m.provider), icon: glyph(m.provider) })))
    : `<p class="muted">${tr('Bez dat.')}</p>`);

  const gauges = limitGauges(state.limits, now);
  const creditCharts = state.credits
    .filter((c) => c.history?.length >= 2)
    .map((c) => {
      const h = c.history.slice(-60);
      const markers = c.topUps || []; // rozpoznává server, viz src/credits.js
      // Zůstatek bez data je nepravda: ukazuje poslední odečet, ne stav teď. U Codexu může být
      // i měsíc starý, protože novější se nikde nevzal. Proto se vedle čísla píše, kdy vzniklo.
      const zjisteno = creditAgeHtml(c, now) ? ` · ${creditAgeHtml(c, now)}` : '';
      return `<div class="credit-chart"><div class="sec-head"><h3>${esc(c.label)}</h3><span class="muted small">${tr('zůstatek')} ${c.balance.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}${zjisteno}${markers.length ? ` ${tr('· {0}× doplněno', markers.length)}` : ''}</span></div>
        ${timeLine({ id: `credits-${c.id}`, points: h.map((p) => ({ at: p.at, value: p.balance })), height: 160, color: chartColor(c.provider), format: (x) => x.toLocaleString(LOCALE, { maximumFractionDigits: 1 }), axisFormat: (x) => fmtNum(x), label: c.label, riseLabel: tr('Doplněno') })}</div>`;
    });
  fill(el, 'usage-history', usageHistoryHtml());
  zivy(el, 'limits', `${gauges.length ? `<div class="gauges">${gauges.join('')}</div>` : ''}${creditCharts.join('')}${limitsAll(state, now)}`);
}

export default { id: 'statistiky', title: tr('Statistiky'), mount, update, unmount: () => { v.unwatch?.(); v.unwatch = null; v.el = null; } };
