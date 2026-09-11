import { esc, fmtTok, fmtAxis, timeHM, dateTime } from './format.js';

// Pravidla grafů Agentree: kreslí se jen naměřené hodnoty. Žádné vyhlazování mezi body (vymýšlelo by hodnoty),
// intervaly jako sloupce, stav v čase jako schodovitá čára na skutečné časové ose, popisky se nesmí překrývat.

export function niceMax(v) {
  if (!(v > 0)) return 4;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 8 ? 8 : 10) * exp;
}

const registry = new Map();
const hoverState = new Map();
const TICKS = [1, 0.75, 0.5, 0.25, 0];

const yAxis = (max, axisFormat) => `<div class="chart-y" aria-hidden="true">${TICKS.map((t, i) => `<span style="top:${i * 25}%">${esc(axisFormat(max * t))}</span>`).join('')}</div>`;
const grid = () => `<div class="chart-grid" aria-hidden="true">${TICKS.map((_, i) => `<i style="top:${i * 25}%"></i>`).join('')}</div>`;

// Které popisky osy x ukázat: pravidelně, poslední vždy, bez dvou popisků těsně u sebe.
// Každý druhý je „vedlejší“ a na úzkém displeji se skryje.
function pickLabels(n, maxLabels = 7) {
  const step = Math.max(1, Math.ceil(n / maxLabels));
  const shown = [];
  for (let i = 0; i < n; i += step) shown.push(i);
  if (shown.at(-1) !== n - 1) {
    if (n - 1 - shown.at(-1) < step * 0.6) shown.pop();
    shown.push(n - 1);
  }
  return shown.map((i, k) => ({ i, minor: shown.length > 4 && k % 2 === 1 && k !== shown.length - 1 }));
}

/* ---------- Sloupce po intervalech (tokeny za den / hodinu) ---------- */

export function stackedColumns({ id, labels, tips, series, height = 208, format = fmtTok, axisFormat = fmtAxis, label = 'Graf', partialLast = false }) {
  const n = labels.length;
  const visible = series.filter((s) => !s.hidden);
  const totals = Array.from({ length: n }, (_, i) => visible.reduce((a, s) => a + (s.values[i] || 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  registry.set(id, { kind: 'cols', n, tips: tips || labels, series: visible, totals, max, format, partialLast });
  const bars = totals.map((tot, i) => {
    const segs = visible.map((s) => ({ v: s.values[i] || 0, color: s.color })).filter((x) => x.v > 0).reverse();
    const h = tot > 0 ? Math.max(0.8, (tot / max) * 100) : 0;
    return `<div class="bar-slot" data-i="${i}"><div class="bar-stack" style="height:${h.toFixed(2)}%">${segs.map((x) => `<i style="flex-grow:${x.v};background:${x.color}"></i>`).join('')}</div></div>`;
  }).join('');
  const xLabels = pickLabels(n).map(({ i, minor }) => `<span class="${minor ? 'is-minor' : ''}" style="left:${(((i + 0.5) / n) * 100).toFixed(3)}%">${esc(labels[i])}</span>`).join('');
  const summary = visible.map((s) => `${s.label} ${format(s.values.reduce((a, b) => a + (b || 0), 0))}`).join(', ');
  return `<div class="chart" style="--chart-h:${height}px">
    ${yAxis(max, axisFormat)}
    <div class="chart-plot chart-plot--cols" data-chart="${esc(id)}" tabindex="0" role="img" aria-label="${esc(`${label}: ${summary || 'bez dat'}. Šipkami vlevo a vpravo procházej jednotlivé sloupce.`)}">
      ${grid()}
      <div class="bars" style="--n:${n}" aria-hidden="true">${bars}</div>
      <div class="tip" aria-hidden="true"></div>
    </div>
    <div class="chart-x chart-x--center" aria-hidden="true">${xLabels}</div>
  </div>`;
}

/* ---------- Stav v čase (zůstatek kreditů): schodovitá čára na skutečné časové ose ---------- */

function timeLabel(t, span, prev) {
  const d = new Date(t);
  const day = `${d.getDate()}. ${d.getMonth() + 1}.`;
  if (span > 3 * 86400e3) return day;
  const p = prev ? new Date(prev) : null;
  const sameDay = p && p.getDate() === d.getDate() && p.getMonth() === d.getMonth();
  return sameDay ? timeHM(t) : `${day} ${timeHM(t)}`;
}

export function timeLine({ id, points, height = 160, format = String, axisFormat = format, label = 'Graf', color = '#2a78d6', riseLabel = 'Nárůst' }) {
  const pts = points.filter((p) => Number.isFinite(p.at) && Number.isFinite(p.value)).sort((a, b) => a.at - b.at);
  if (!pts.length) return '';
  let t0 = pts[0].at;
  let t1 = pts.at(-1).at;
  if (t1 - t0 < 3600e3) {
    t0 -= 1800e3;
    t1 += 1800e3;
  }
  const max = niceMax(Math.max(...pts.map((p) => p.value)));
  const W = 1000;
  const HH = 100;
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (v) => HH - (v / max) * HH;
  const f = (v) => v.toFixed(2);
  let line = `M${f(x(pts[0].at))},${f(y(pts[0].value))}`;
  for (let i = 1; i < pts.length; i++) line += ` H${f(x(pts[i].at))} V${f(y(pts[i].value))}`;
  const area = `${line} V${HH} H${f(x(pts[0].at))} Z`;
  registry.set(id, { kind: 'time', pts, t0, t1, max, format, riseLabel });
  const rises = pts.map((p, i) => (i && p.value > pts[i - 1].value ? i : -1)).filter((i) => i > 0);
  const markers = rises.map((i) => `<i class="chart-marker" style="left:${((x(pts[i].at) / W) * 100).toFixed(3)}%;bottom:${((pts[i].value / max) * 100).toFixed(3)}%;border-color:${color}" aria-hidden="true"></i>`).join('');
  let prev = null;
  const seen = new Set();
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => {
    const t = t0 + (t1 - t0) * k;
    const text = timeLabel(t, t1 - t0, prev);
    prev = t;
    if (seen.has(text)) return '';
    seen.add(text);
    const cls = k === 0 ? 'tick-start' : k === 1 ? 'tick-end' : k === 0.5 ? '' : 'is-minor';
    return `<span class="${cls}" style="left:${k * 100}%">${esc(text)}</span>`;
  }).join('');
  return `<div class="chart" style="--chart-h:${height}px">
    ${yAxis(max, axisFormat)}
    <div class="chart-plot" data-chart="${esc(id)}" tabindex="0" role="img" aria-label="${esc(`${label}: ${pts.length} záznamů, poslední hodnota ${format(pts.at(-1).value)}. Šipkami procházej záznamy.`)}">
      ${grid()}
      <svg viewBox="0 0 ${W} ${HH}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${area}" fill="${color}"/><path class="line" d="${line}" stroke="${color}"/></svg>
      ${markers}
      <div class="vline" aria-hidden="true"></div>
      <i class="hover-dot" style="background:${color}" aria-hidden="true"></i>
      <div class="tip" aria-hidden="true"></div>
    </div>
    <div class="chart-x" aria-hidden="true">${ticks}</div>
  </div>`;
}

/* ---------- Hover a klávesnice ---------- */

function placeTip(plot, xPct, topPct) {
  const tip = plot.querySelector('.tip');
  tip.style.left = `clamp(88px, ${xPct}%, calc(100% - 88px))`;
  tip.style.top = `${Math.max(0, Math.min(100, topPct))}%`;
  return tip;
}

function showHover(plot, idx) {
  const c = registry.get(plot.dataset.chart);
  if (!c) return;
  const n = c.kind === 'time' ? c.pts.length : c.n;
  if (!n) return;
  idx = Math.max(0, Math.min(n - 1, idx));
  hoverState.set(plot.dataset.chart, { idx, pointer: hoverState.get(plot.dataset.chart)?.pointer || false });
  plot.classList.add('is-hover');

  if (c.kind === 'cols') {
    for (const slot of plot.querySelectorAll('.bar-slot')) slot.classList.toggle('is-active', Number(slot.dataset.i) === idx);
    const rows = c.series.slice().reverse()
      .map((s) => `<span class="tip-row"><i class="sw" style="background:${s.color}"></i>${esc(s.label)}<b>${esc(c.format(s.values[idx] || 0))}</b></span>`).join('');
    const total = c.series.length > 1 ? `<span class="tip-row tip-total">Celkem<b>${esc(c.format(c.totals[idx]))}</b></span>` : '';
    const partial = c.partialLast && idx === c.n - 1 ? ' · zatím' : '';
    placeTip(plot, ((idx + 0.5) / c.n) * 100, 100 - (c.totals[idx] / c.max) * 100).innerHTML = `<span class="tip-label">${esc(c.tips[idx])}${partial}</span>${rows || '<span class="tip-row">Bez dat</span>'}${total}`;
    return;
  }

  const p = c.pts[idx];
  const xPct = ((p.at - c.t0) / (c.t1 - c.t0)) * 100;
  const yPct = 100 - (p.value / c.max) * 100;
  plot.querySelector('.vline').style.left = `${xPct}%`;
  const dot = plot.querySelector('.hover-dot');
  dot.style.left = `${xPct}%`;
  dot.style.top = `${yPct}%`;
  const prev = c.pts[idx - 1];
  const rise = prev && p.value > prev.value ? `<span class="tip-row">${esc(c.riseLabel)}<b>+${esc(c.format(p.value - prev.value))}</b></span>` : '';
  placeTip(plot, xPct, yPct).innerHTML = `<span class="tip-label">${esc(dateTime(p.at))}</span><span class="tip-row">Hodnota<b>${esc(c.format(p.value))}</b></span>${rise}`;
}

function pointerIndex(plot, c, clientX) {
  const r = plot.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  if (c.kind === 'cols') return Math.min(c.n - 1, Math.floor(ratio * c.n));
  const t = c.t0 + ratio * (c.t1 - c.t0);
  let best = 0;
  for (let i = 1; i < c.pts.length; i++) if (Math.abs(c.pts[i].at - t) < Math.abs(c.pts[best].at - t)) best = i;
  return best;
}

function hideHover(plot) {
  plot.classList.remove('is-hover');
  for (const slot of plot.querySelectorAll('.bar-slot.is-active')) slot.classList.remove('is-active');
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
    hoverState.set(plot.dataset.chart, { idx: 0, pointer: true });
    showHover(plot, pointerIndex(plot, c, e.clientX));
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

/* ---------- Malé grafy ---------- */

// Miniaturní sloupce (aktivita po dnech/hodinách): každý sloupec = skutečný součet intervalu.
export function miniBars(values, color, { height = 40 } = {}) {
  const n = values.length;
  if (!n) return '';
  const max = Math.max(0, ...values);
  const W = n * 10;
  const bars = values.map((v, i) => {
    if (!(v > 0) || !max) return '';
    const h = Math.max(2, (v / max) * (height - 2));
    return `<rect x="${i * 10 + 1.5}" y="${(height - h).toFixed(2)}" width="7" height="${h.toFixed(2)}" rx="1.5" fill="${color}"/>`;
  }).join('');
  return `<svg class="minibars" viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="${height - 1}" width="${W}" height="1" style="fill:var(--line)"/>${bars}</svg>`;
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

export function heatmap(grid2, { format = fmtTok } = {}) {
  const max = Math.max(1, ...grid2.flat());
  const days = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
  const rows = grid2
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
  return `<div class="cols" style="--chart-h:${height}px" role="img" aria-label="${esc(label)}">
    ${yAxis(max, axisFormat)}
    <div class="cols-plot">
      ${grid()}
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
    <div class="tl-axis" aria-hidden="true"><span></span><span class="tl-ticks">${ticks.map((t, k) => `<span class="${k % 2 ? 'is-minor' : ''}" style="left:${pct(t)}%">${timeHM(t)}</span>`).join('')}</span></div>
    ${rows
      .map((r) => `<a class="tl-row" href="#/agent/${encodeURIComponent(r.id)}" data-status="${r.status}">
        <span class="tl-label">${r.glyph}<span class="tl-text"><span class="tl-title">${esc(r.title)}</span><small>${esc(r.app)}</small></span></span>
        <span class="tl-track">${r.spans
          .filter(([, b]) => b >= from)
          .map(([a, b]) => {
            const l = pct(a);
            return `<i class="tl-seg" style="left:${l}%;width:${Math.max(0.8, pct(b) - l)}%;background:${r.color}"></i>`;
          })
          .join('')}${r.status === 'working' ? `<i class="tl-live" style="left:${pct(now)}%;background:${r.color}"></i>` : ''}${r.status === 'needs_input' || r.status === 'limited' || r.status === 'failed' ? `<i class="tl-flag" style="left:${pct(r.lastAt)}%"></i>` : ''}</span>
      </a>`)
      .join('')}
    <div class="tl-now" aria-hidden="true"><span>teď</span></div>
  </div>`;
}
