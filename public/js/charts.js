import { esc, fmtTok, fmtAxis, timeHM } from './format.js';

export function niceMax(v) {
  if (!(v > 0)) return 4;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 8 ? 8 : 10) * exp;
}

// Monotónní kubická křivka (Fritsch–Carlson): hladká, bez překmitů pod nulu.
export function smoothPath(pts) {
  const n = pts.length;
  if (!n) return '';
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx = [];
  const m = [];
  const t = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6;
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  const f = (v) => v.toFixed(2);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return d;
}

/* ---------- Plošný graf s interaktivním crosshairem ---------- */

const registry = new Map();
const hoverState = new Map();

export function areaChart({ id, labels, tips, series, height = 208, stacked = true, format = fmtTok, axisFormat = fmtAxis, label = 'Graf', markers = [] }) {
  const n = labels.length;
  const visible = series.filter((s) => !s.hidden);
  const W = 1000;
  const HH = 100;
  const acc = new Array(n).fill(0);
  const layers = visible.map((s) => {
    const lower = acc.slice();
    const upper = s.values.map((v, i) => (stacked ? (acc[i] += v || 0) : v || 0));
    return { s, lower, upper };
  });
  const max = niceMax(Math.max(0, ...layers.flatMap((l) => l.upper)));
  const x = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v) => HH - (v / max) * HH;
  let svg = '';
  for (const { s, lower, upper } of layers) {
    const top = smoothPath(upper.map((v, i) => [x(i), y(v)]));
    const base = stacked ? smoothPath(lower.map((v, i) => [x(i), y(v)]).reverse()).replace(/^M/, 'L') : `L${W},${HH} L0,${HH}`;
    svg += `<path class="area" d="${top} ${base} Z" fill="${s.color}"/>`;
  }
  for (const { s, upper } of layers) svg += `<path class="line" d="${smoothPath(upper.map((v, i) => [x(i), y(v)]))}" stroke="${s.stroke || s.color}"/>`;
  registry.set(id, { tips: tips || labels, layers, max, format, n, stacked });

  const step = n > 8 ? Math.ceil(n / 6) : 1;
  const pos = (i) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const xLabels = labels
    .map((l, i) => ((i % step === 0 && n - 1 - i >= step / 2) || i === n - 1 ? `<span style="left:${pos(i)}%">${esc(l)}</span>` : ''))
    .join('');
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const summary = visible.map((s) => `${s.label} ${format(s.values.reduce((a, b) => a + (b || 0), 0))}`).join(', ');
  const markerHtml = markers
    .map((mk) => `<i class="chart-marker" style="left:${pos(mk.index)}%;bottom:${(mk.value / max) * 100}%" title="${esc(mk.label)}"></i>`)
    .join('');

  return `<div class="chart" style="--chart-h:${height}px">
    <div class="chart-y" aria-hidden="true">${ticks.map((t, i) => `<span style="top:${i * 25}%">${axisFormat(max * t)}</span>`).join('')}</div>
    <div class="chart-plot" data-chart="${esc(id)}" tabindex="0" role="img" aria-label="${esc(`${label}: ${summary || 'bez dat'}. Šipkami vlevo a vpravo procházej hodnoty.`)}">
      <div class="chart-grid" aria-hidden="true">${ticks.map((_, i) => `<i style="top:${i * 25}%"></i>`).join('')}</div>
      <svg viewBox="0 0 ${W} ${HH}" preserveAspectRatio="none" aria-hidden="true">${svg}</svg>
      ${markerHtml}
      <div class="vline" aria-hidden="true"></div>
      ${layers.map((l, i) => `<i class="hover-dot" data-layer="${i}" style="background:${l.s.stroke || l.s.color}" aria-hidden="true"></i>`).join('')}
      <div class="tip" aria-hidden="true"></div>
    </div>
    <div class="chart-x" aria-hidden="true">${xLabels}</div>
  </div>`;
}

function showHover(plot, idx) {
  const c = registry.get(plot.dataset.chart);
  if (!c || !c.n) return;
  idx = Math.max(0, Math.min(c.n - 1, idx));
  hoverState.set(plot.dataset.chart, { idx, pointer: hoverState.get(plot.dataset.chart)?.pointer || false });
  const x = c.n <= 1 ? 50 : (idx / (c.n - 1)) * 100;
  plot.classList.add('is-hover');
  plot.querySelector('.vline').style.left = `${x}%`;
  let minTop = 100;
  for (const dot of plot.querySelectorAll('.hover-dot')) {
    const layer = c.layers[Number(dot.dataset.layer)];
    const top = 100 - (layer.upper[idx] / c.max) * 100;
    minTop = Math.min(minTop, top);
    dot.style.left = `${x}%`;
    dot.style.top = `${top}%`;
  }
  const rows = c.layers
    .slice()
    .reverse()
    .map((l) => `<span class="tip-row"><i class="sw" style="background:${l.s.color === '#16141D' ? '#fff' : l.s.color}"></i>${esc(l.s.label)}<b>${c.format(l.s.values[idx] || 0)}</b></span>`)
    .join('');
  const total = c.stacked && c.layers.length > 1 ? `<span class="tip-row tip-total">Celkem<b>${c.format(c.layers.reduce((a, l) => a + (l.s.values[idx] || 0), 0))}</b></span>` : '';
  const tip = plot.querySelector('.tip');
  tip.innerHTML = `<span class="tip-label">${esc(c.tips[idx])}</span>${rows}${total}`;
  tip.style.left = `clamp(88px, ${x}%, calc(100% - 88px))`;
  tip.style.top = `${Math.max(0, minTop)}%`;
}

function hideHover(plot) {
  plot.classList.remove('is-hover');
  hoverState.delete(plot.dataset.chart);
}

export function restoreHover(root) {
  for (const plot of root.querySelectorAll('.chart-plot')) {
    const h = hoverState.get(plot.dataset.chart);
    if (h && (h.pointer || document.activeElement === plot)) showHover(plot, h.idx);
  }
}

export function bindCharts(root = document) {
  root.addEventListener('pointermove', (e) => {
    const plot = e.target.closest?.('.chart-plot');
    if (!plot) return;
    const c = registry.get(plot.dataset.chart);
    if (!c) return;
    const r = plot.getBoundingClientRect();
    hoverState.set(plot.dataset.chart, { idx: 0, pointer: true });
    showHover(plot, Math.round(((e.clientX - r.left) / r.width) * (c.n - 1)));
  });
  root.addEventListener('pointerout', (e) => {
    const plot = e.target.closest?.('.chart-plot');
    if (!plot || plot.contains(e.relatedTarget)) return;
    if (document.activeElement !== plot) hideHover(plot);
    else hoverState.set(plot.dataset.chart, { ...(hoverState.get(plot.dataset.chart) || { idx: 0 }), pointer: false });
  });
  root.addEventListener('focusout', (e) => {
    if (e.target.classList?.contains('chart-plot') && !hoverState.get(e.target.dataset.chart)?.pointer) hideHover(e.target);
  });
  root.addEventListener('keydown', (e) => {
    const plot = e.target.classList?.contains('chart-plot') ? e.target : null;
    if (!plot || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const cur = hoverState.get(plot.dataset.chart)?.idx ?? (e.key === 'ArrowLeft' ? 1 : -1);
    showHover(plot, cur + (e.key === 'ArrowRight' ? 1 : -1));
  });
}

/* ---------- Další grafy ---------- */

export function sparkline(values, color, { height = 32, fill = false } = {}) {
  const W = 100;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * W, height - 3 - (v / max) * (height - 6)]);
  const line = smoothPath(pts);
  return `<svg class="spark" viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" aria-hidden="true">
    ${fill ? `<path d="${line} L${W},${height} L0,${height} Z" fill="${color}" opacity=".12"/>` : ''}
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

export function donut({ segments, center = '', sub = '', format = String, label = 'Podíl' }) {
  const size = 176;
  const thick = 20;
  const r = (size - thick) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const len = (s.value / total) * c;
      const dash = Math.max(0.5, len - gap);
      const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thick}" stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(s.label)}: ${esc(format(s.value))}</title></circle>`;
      offset += len;
      return el;
    })
    .join('');
  const legend = segments
    .filter((s) => s.value > 0)
    .map((s) => `<li><i class="sw" style="background:${s.color}"></i><span class="dl-label">${esc(s.label)}</span><span class="dl-pct">${total ? Math.round((s.value / total) * 100) : 0} %</span><b>${esc(format(s.value))}</b></li>`)
    .join('');
  return `<div class="donut-wrap">
    <div class="donut" role="img" aria-label="${esc(`${label}: ${segments.map((s) => `${s.label} ${format(s.value)}`).join(', ')}`)}">
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="${thick}"/>${arcs}</svg>
      <div class="donut-center"><span class="donut-value">${center}</span><span class="donut-sub">${esc(sub)}</span></div>
    </div>
    <ul class="donut-legend">${legend || '<li class="muted">Bez dat</li>'}</ul>
  </div>`;
}

export function gauge({ pct, color, value, label, sub = '', size = 'md', reached = false }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const cx = 60;
  const cy = 60;
  const r = 48;
  const pt = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (a, b) => {
    const [x1, y1] = pt(a);
    const [x2, y2] = pt(b);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const end = 135 + (270 * p) / 100;
  return `<div class="gauge gauge--${size}${reached ? ' is-reached' : ''}" role="img" aria-label="${esc(`${label}: ${value}${sub ? `, ${sub}` : ''}`)}">
    <svg viewBox="0 0 120 120" aria-hidden="true"><path d="${arc(135, 405)}" class="gauge-track"/>${p > 0 ? `<path d="${arc(135, Math.max(135.5, end))}" class="gauge-fill" style="stroke:${color}"/>` : ''}</svg>
    <div class="gauge-center"><span class="gauge-value${/\d/.test(value) ? '' : ' gauge-value--text'}">${esc(value)}</span><span class="gauge-label">${esc(label)}</span></div>
    ${sub ? `<div class="gauge-sub">${esc(sub)}</div>` : ''}
  </div>`;
}

export function heatmap(grid, { format = fmtTok } = {}) {
  const max = Math.max(1, ...grid.flat());
  const days = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
  const rows = grid
    .map((row, d) => `<div class="heat-row"><span class="heat-day">${days[d]}</span>${row.map((v, h) => `<i class="heat-cell" style="--v:${(v / max).toFixed(3)}" title="${days[d]} ${h}:00 · ${esc(format(v))}"></i>`).join('')}</div>`)
    .join('');
  const hours = Array.from({ length: 24 }, (_, h) => `<span>${h % 6 === 0 ? h : ''}</span>`).join('');
  return `<div class="heat" role="img" aria-label="Aktivita agentů podle dne v týdnu a hodiny">${rows}<div class="heat-row heat-hours"><span class="heat-day"></span>${hours}</div></div>`;
}

export function hbars(items, { format = fmtTok, max } = {}) {
  const m = max || Math.max(1, ...items.map((i) => i.value));
  return `<ul class="hbars">${items
    .map((i) => `<li>
      <span class="hb-label">${i.icon || ''}<span class="hb-name">${esc(i.label)}</span>${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</span>
      <span class="hb-value">${esc(format(i.value))}</span>
      <span class="hb-track"><i style="width:${Math.max(1, (i.value / m) * 100).toFixed(1)}%;background:${i.color}"></i></span>
    </li>`)
    .join('')}</ul>`;
}

export function columnChart({ columns, budget = 0, format, axisFormat = format, height = 220, label = 'Sloupcový graf' }) {
  const totals = columns.map((c) => c.segments.reduce((a, s) => a + s.value, 0));
  const max = niceMax(Math.max(budget, ...totals, 0));
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  return `<div class="cols" style="--chart-h:${height}px" role="img" aria-label="${esc(label)}">
    <div class="chart-y" aria-hidden="true">${ticks.map((t, i) => `<span style="top:${i * 25}%">${esc(axisFormat(max * t))}</span>`).join('')}</div>
    <div class="cols-plot">
      <div class="chart-grid" aria-hidden="true">${ticks.map((_, i) => `<i style="top:${i * 25}%"></i>`).join('')}</div>
      ${budget > 0 ? `<div class="cols-budget" style="bottom:${(budget / max) * 100}%"><span>Rozpočet</span></div>` : ''}
      <div class="cols-bars">${columns
        .map((c, i) => `<div class="col${c.current ? ' is-current' : ''}" tabindex="0" data-tip="${esc(c.tip)}">
          <div class="col-stack" style="height:${((totals[i] / max) * 100).toFixed(2)}%">${c.segments.filter((s) => s.value > 0).map((s) => `<i style="flex-grow:${s.value};background:${s.color}"></i>`).join('')}</div>
        </div>`)
        .join('')}</div>
    </div>
    <div class="cols-x" aria-hidden="true">${columns.map((c) => `<span>${esc(c.label)}</span>`).join('')}</div>
  </div>`;
}

export function stackBar(parts) {
  const sum = parts.reduce((a, p) => a + p.value, 0) || 1;
  return `<div class="stack" role="img" aria-label="${esc(parts.map((p) => `${p.label} ${fmtTok(p.value)}`).join(', '))}">${parts
    .map((p) => `<i style="width:${((p.value / sum) * 100).toFixed(2)}%;background:${p.color}"></i>`)
    .join('')}</div>
    <div class="stack-legend">${parts.map((p) => `<span><i class="sw" style="background:${p.color}"></i>${esc(p.label)}<b>${fmtTok(p.value)}</b></span>`).join('')}</div>`;
}

// "Dnešní směna": úseky aktivity každého agenta na časové ose.
export function timeline({ rows, from, to, now }) {
  const pct = (t) => Math.max(0, Math.min(100, ((t - from) / (to - from)) * 100));
  const ticks = [];
  for (let t = Math.ceil(from / 3600e3) * 3600e3; t <= to; t += 3600e3) if (new Date(t).getHours() % 2 === 0) ticks.push(t);
  return `<div class="tl" style="--now:${(pct(now) / 100).toFixed(4)}">
    <div class="tl-axis" aria-hidden="true"><span></span><span class="tl-ticks">${ticks.map((t) => `<span style="left:${pct(t)}%">${timeHM(t)}</span>`).join('')}</span></div>
    ${rows
      .map((r) => `<a class="tl-row" href="#/agent/${encodeURIComponent(r.id)}" data-status="${r.status}">
        <span class="tl-label">${r.glyph}<span class="tl-text"><span class="tl-title">${esc(r.title)}</span><small>${esc(r.app)}</small></span></span>
        <span class="tl-track">${r.spans
          .filter(([, b]) => b >= from)
          .map(([a, b]) => {
            const l = pct(a);
            return `<i class="tl-seg" style="left:${l}%;width:${Math.max(0.8, pct(b) - l)}%;background:${r.color}"></i>`;
          })
          .join('')}${r.status === 'working' ? `<i class="tl-live" style="left:${pct(now)}%;background:${r.color}"></i>` : ''}${r.status === 'needs_input' || r.status === 'limited' ? `<i class="tl-flag" style="left:${pct(r.lastAt)}%"></i>` : ''}</span>
      </a>`)
      .join('')}
    <div class="tl-now" aria-hidden="true"><span>teď</span></div>
  </div>`;
}
