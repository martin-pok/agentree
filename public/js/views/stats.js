import { state, sessionsList } from '../state.js';
import { esc, fmtNum, plural } from '../format.js';
import { glyph } from '../icons.js';
import { stackedColumns, heatmap, hbars, timeLine } from '../charts.js';
import { providerSeries, heatGrid, groupTotals, activeHours, isActiveSince, chartColor } from '../data.js';
import { fill, tween, legendHtml, limitGauges, emptyState } from '../ui.js';

const v = { period: 'week', hidden: new Set(), drawn: false, el: null };
const PERIODS = [['day', '24 hodin'], ['week', '7 dní'], ['month', '30 dní']];

function mount(el) {
  v.el = el;
  v.drawn = false;
  el.innerHTML = `
    <div class="toolbar" data-enter style="--i:1">
      <div class="seg" role="group" aria-label="Období" data-region="period"></div>
    </div>
    <div class="kpis" data-enter style="--i:2" data-region="kpis"></div>
    <section class="card pad" data-enter style="--i:3" aria-labelledby="st-chart-h">
      <div class="sec-head"><h2 id="st-chart-h">Tokeny podle poskytovatele</h2></div>
      <div data-region="chart"></div>
      <div class="legend" data-region="legend"></div>
    </section>
    <div class="grid-2" data-enter style="--i:4">
      <section class="card pad" aria-labelledby="heat-h"><div class="sec-head"><h2 id="heat-h">Kdy agenti pracují</h2><span class="muted small">30 dní</span></div><div data-region="heat"></div></section>
      <section class="card pad" aria-labelledby="apps-h"><div class="sec-head"><h2 id="apps-h">Tokeny podle aplikace</h2></div><div data-region="apps"></div></section>
    </div>
    <div class="grid-2" data-enter style="--i:5">
      <section class="card pad" aria-labelledby="proj-h"><div class="sec-head"><h2 id="proj-h">Tokeny podle složky</h2></div><div data-region="projects"></div></section>
      <section class="card pad" aria-labelledby="mod-h"><div class="sec-head"><h2 id="mod-h">Tokeny podle modelu</h2></div><div data-region="models"></div></section>
    </div>
    <section class="card pad" id="limity" data-enter style="--i:6" aria-labelledby="lim-h">
      <div class="sec-head"><h2 id="lim-h">Limity a kredity</h2></div>
      <div data-region="limits"></div>
    </section>
    <p class="note">Tokeny = vstup + výstup + zápis do cache. Levné čtení z cache se do grafů nezapočítává. Webové aplikace počty tokenů nesdílejí.</p>`;
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

function update() {
  const el = v.el;
  if (!el) return;
  const now = Date.now();
  const all = sessionsList();
  const ser = providerSeries(all, v.period, now, v.hidden);
  const since = ser.since;

  fill(el, 'period', PERIODS.map(([k, l]) => `<button type="button" data-period="${k}" aria-pressed="${v.period === k}">${l}</button>`).join(''));

  const active = all.filter((s) => isActiveSince(s, since));
  const tokens = ser.series.reduce((a, s) => a + s.values.reduce((x, y) => x + y, 0), 0);
  const hours = activeHours(all, since);
  const prompts = active.reduce((a, s) => a + (s.turns || 0), 0);
  fill(el, 'kpis', [
    ['Tokeny', tween(`st-tok-${v.period}`, tokens, 'tok'), 'vstup, výstup a zápis do cache'],
    ['Aktivní konverzace', tween(`st-ses-${v.period}`, active.length), `${new Set(active.map((s) => s.app)).size} aplikací`],
    ['Hodiny s aktivitou', tween(`st-h-${v.period}`, hours), 'hodiny, kdy aspoň jeden agent pracoval'],
    ['Zadání', tween(`st-p-${v.period}`, prompts), `v ${plural(active.length, 'aktivní konverzaci', 'aktivních konverzacích', 'aktivních konverzacích')}`],
  ].map(([l, val, sub]) => `<div class="card kpi"><span class="eyebrow">${l}</span><span class="val">${val}</span><small>${esc(sub)}</small></div>`).join(''));

  const changed = fill(el, 'chart', ser.series.length
    ? stackedColumns({ id: 'st-tokens', labels: ser.labels, tips: ser.tips, series: ser.series, height: 280, label: 'Tokeny podle poskytovatele', partialLast: true })
    : emptyState({ title: 'V tomto období žádné tokeny' }));
  if (changed && !v.drawn) el.querySelector('[data-region="chart"] .chart-plot')?.classList.add('is-drawing');
  v.drawn = true;
  fill(el, 'legend', legendHtml(ser.series, { box: true }));

  fill(el, 'heat', heatmap(heatGrid(all, now, 30)));

  const apps = groupTotals(all, since, (s) => s.app).slice(0, 8);
  fill(el, 'apps', apps.length
    ? hbars(apps.map((a) => ({ label: a.key, sub: `${tokens ? Math.round((a.value / tokens) * 100) : 0} %`, value: a.value, color: chartColor(a.provider), icon: glyph(a.provider) })))
    : '<p class="muted">Bez dat.</p>');

  const projects = groupTotals(all, since, (s) => s.project).slice(0, 8);
  fill(el, 'projects', projects.length
    ? hbars(projects.map((p) => ({ label: p.key, sub: `${p.count} ${plural(p.count, 'konverzace', 'konverzace', 'konverzací')}`, value: p.value, color: chartColor(p.provider), icon: glyph(p.provider) })))
    : '<p class="muted">Bez dat.</p>');

  const models = groupTotals(all, since, (s) => s.model).slice(0, 8);
  fill(el, 'models', models.length
    ? hbars(models.map((m) => ({ label: m.key, value: m.value, color: chartColor(m.provider), icon: glyph(m.provider) })))
    : '<p class="muted">Bez dat.</p>');

  const gauges = limitGauges(state.limits, now);
  const creditCharts = state.credits
    .filter((c) => c.history?.length >= 2)
    .map((c) => {
      const h = c.history.slice(-60);
      const markers = h.filter((p, i) => i && p.balance > h[i - 1].balance);
      return `<div class="credit-chart"><div class="sec-head"><h3>${esc(c.label)}</h3><span class="muted small">zůstatek ${c.balance.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}${markers.length ? ` · ${markers.length}× dokoupeno` : ''}</span></div>
        ${timeLine({ id: `credits-${c.id}`, points: h.map((p) => ({ at: p.at, value: p.balance })), height: 160, color: chartColor(c.provider), format: (x) => x.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }), axisFormat: (x) => fmtNum(x), label: c.label, riseLabel: 'Dokoupeno' })}</div>`;
    });
  fill(el, 'limits', gauges.length || creditCharts.length
    ? `${gauges.length ? `<div class="gauges">${gauges.join('')}</div>` : ''}${creditCharts.join('')}`
    : `<p class="muted">Zatím žádné údaje o limitech. Codex je hlásí sám; Claude Code je zapíše při dosažení limitu. Údaje starší než 7 dní se skryjí.</p>`);
}

export default { id: 'statistiky', title: 'Statistiky', mount, update, unmount: () => { v.el = null; } };
