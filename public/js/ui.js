import { esc, rel, fmtTok, fmtMoney, STATUS, DAY, resetsLabel } from './format.js';
import { ICON, glyph } from './icons.js';
import { gauge } from './charts.js';
import { sessionTotal } from './data.js';

export function fill(root, name, html) {
  const el = root.querySelector(`[data-region="${name}"]`);
  if (!el || el._html === html) return false;
  el.innerHTML = html;
  el._html = html;
  return true;
}

/* ---------- Animovaná čísla ---------- */

const tweenMemory = new Map();
const formatter = (fmt) => (fmt?.startsWith('money:') ? (v) => fmtMoney(v, fmt.slice(6)) : fmt === 'tok' ? fmtTok : (v) => String(Math.round(v)));

export const tween = (key, value, fmt = 'int') =>
  `<span data-tween="${esc(key)}" data-fmt="${esc(fmt)}" data-value="${Number(value) || 0}">${esc(formatter(fmt)(tweenMemory.get(key) ?? value))}</span>`;

export function tweenAll(root) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const el of root.querySelectorAll('[data-tween]')) {
    const to = Number(el.dataset.value) || 0;
    if (el._tweenTo === to) continue;
    el._tweenTo = to;
    const key = el.dataset.tween;
    const fmt = formatter(el.dataset.fmt);
    const from = tweenMemory.has(key) ? tweenMemory.get(key) : 0;
    tweenMemory.set(key, to);
    if (reduce || from === to) {
      el.textContent = fmt(to);
      continue;
    }
    const t0 = performance.now();
    const d = from === 0 ? 900 : 600;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / d);
      el.textContent = fmt(from + (to - from) * (1 - (1 - p) ** 3));
      if (p < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/* ---------- Toasty, schránka ---------- */

export function toast(message, { tone = 'ink', action, timeout = 4000 } = {}) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.innerHTML = `<span class="toast-text">${esc(message)}</span>${action ? `<a class="toast-action" href="${esc(action.href)}">${esc(action.label)}</a>` : ''}<button class="toast-close" type="button" aria-label="Zavřít">${ICON.close}</button>`;
  const remove = () => {
    if (!el.isConnected) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 240);
  };
  el.querySelector('.toast-close').addEventListener('click', remove);
  el.querySelector('.toast-action')?.addEventListener('click', remove);
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  if (timeout) setTimeout(remove, timeout);
}

export async function copy(text, message = 'Zkopírováno do schránky') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(message);
}

/* ---------- Sdílené kousky UI ---------- */

export const statusPill = (status) => `<span class="pill" data-status="${esc(status)}"><i></i>${esc(STATUS[status]?.label || status)}</span>`;

export function kindLabel(kind) {
  if (kind === 'permission') return 'Žádá o povolení';
  if (kind === 'question') return 'Ptá se tě';
  if (kind === 'plan') return 'Čeká na schválení plánu';
  return 'Potřebuje tvé rozhodnutí';
}

export function howToAnswer(s) {
  if (s.source === 'web') return 'Odpověz přímo v konverzaci v prohlížeči.';
  if (s.connector === 'claude-code') return 'Otevři Claude nebo Terminál tlačítkem výše a odpověz v okně, kde konverzace běží.';
  if (s.connector === 'codex') return 'Otevři vlákno v Codexu tlačítkem výše a odpověz tam.';
  if (s.connector === 'cursor') return 'Potvrď akci v Cursoru.';
  if (s.connector === 'vscode-copilot') return 'Potvrď akci v panelu Copilotu ve VS Code.';
  return 'Odpověz v aplikaci, kde agent běží.';
}

export const agentHref = (id) => `#/agent/${encodeURIComponent(id)}`;

export function activityItem(s) {
  const meta = s.status === 'working' && s.activity
    ? `<span class="live-dot" aria-hidden="true"></span>${esc(s.activity)}`
    : `<span data-ago="${s.lastAt}">${rel(s.lastAt)}</span> · ${esc(s.app)}`;
  return `<li><a class="act-item" href="${agentHref(s.id)}">
    <span class="icon-tile">${glyph(s)}<i class="status-dot status-${esc(s.status)}"></i></span>
    <span class="act-text"><span class="act-title">${esc(s.title)}</span><span class="act-meta"><span class="sr-only">${esc(STATUS[s.status]?.label || '')}, </span>${meta}</span></span>
    <span class="act-value">${sessionTotal(s) ? fmtTok(sessionTotal(s)) : ''}</span>${ICON.chev}
  </a></li>`;
}

export function decisionCard(s) {
  const limited = s.status === 'limited';
  const failed = s.status === 'failed';
  const since = s.failure?.at || s.pending?.at || s.limit?.at || s.lastAt;
  return `<li class="decision${limited ? ' is-limit' : ''}">
    <span class="icon-tile">${glyph(s)}</span>
    <div class="decision-body">
      <span class="decision-kicker">${failed ? 'Spuštění selhalo' : limited ? 'Vyčerpaný limit' : kindLabel(s.pending?.kind)} · ${esc(s.app)} · <span data-ago="${since}">${rel(since)}</span></span>
      <a class="decision-title" href="${agentHref(s.id)}">${esc(s.title)}</a>
      <p class="decision-reason">${esc(s.reason)}</p>
    </div>
    <div class="decision-actions">
      ${s.open?.length ? openButtons(s, { small: true, max: 2 }) : `<a class="btn btn--sm btn--primary" href="${agentHref(s.id)}">Detail</a>`}
    </div>
  </li>`;
}

// Tlačítka „Otevřít v aplikaci / Pokračovat v Terminálu / Otevřít složku“ — nabídku sestavuje server (session.open).
export function openButtons(s, { small = false, max = 3 } = {}) {
  const icons = { terminal: ICON.terminal, folder: ICON.folder };
  return (s.open || [])
    .slice(0, max)
    .map((t, i) => {
      const icon = t.id === 'app' ? glyph(s, { onDark: i === 0 }) : icons[t.id] || ICON.open;
      return `<button class="btn${small ? ' btn--sm' : ''}${i === 0 ? ' btn--primary' : ''}" type="button" data-open-target="${esc(t.id)}" data-session-id="${esc(s.id)}">${icon}${esc(t.label)}</button>`;
    })
    .join('');
}

export function legendHtml(series, { box = false } = {}) {
  return series
    .map((s) => `<button class="legend-item" type="button" data-legend="${esc(s.key)}" aria-pressed="${!s.hidden}"><i class="swatch${box ? ' swatch--box' : ''}" style="background:${s.stroke || s.color}"></i>${esc(s.label)}</button>`)
    .join('');
}

export function emptyState({ title, text = '', action = '' }) {
  return `<div class="empty"><span class="empty-mark" aria-hidden="true"><i></i><i></i><i></i></span><strong>${esc(title)}</strong>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}

export function stateBadge(stateName, label) {
  return `<span class="state" data-state="${esc(stateName)}"><i></i>${esc(label)}</span>`;
}

export function alertIcon(a) {
  if (a.kind === 'needs_input' || a.kind === 'test') return ICON.hand;
  if (a.kind === 'limit' || a.kind === 'limit_near' || a.kind === 'failed') return ICON.alert;
  if (a.kind === 'limit_reset') return ICON.refresh;
  if (a.kind === 'budget') return ICON.wallet;
  if (a.kind === 'done') return ICON.check;
  return ICON.bell;
}

export function untilLabel(ts, now = Date.now()) {
  const ms = ts - now;
  if (ms <= 0) return 'obnoveno';
  const m = Math.ceil(ms / 60e3);
  if (m < 60) return `za ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `za ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `za ${Math.round(h / 24)} dní`;
}

// Údaje o limitech ze stavového řádku Claude Code jsou přesné; odhady z textu hlášek pak nezobrazujeme.
export function currentLimits(limits, now = Date.now()) {
  const fresh = limits.filter((l) => now - l.at < 7 * DAY);
  const claudeStatus = fresh.some((l) => l.source === 'statusline');
  return fresh.filter((l) => !(claudeStatus && l.provider === 'anthropic' && l.source !== 'statusline'));
}

// Okna limitů: kolik je vyčerpáno, kdy se obnoví a co z toho plyne pro práci.
export function limitWindows(limits, now = Date.now()) {
  const rows = currentLimits(limits, now)
    .filter((l) => typeof l.usedPercent === 'number' || l.reached)
    .sort((a, b) => (a.windowMinutes || 1e9) - (b.windowMinutes || 1e9) || a.app.localeCompare(b.app));
  if (!rows.length) return '';
  return `<ul class="lwin">${rows.map((l) => {
    const renewed = Boolean(l.resetsAt && l.resetsAt <= now);
    const pct = renewed ? 0 : l.reached ? 100 : Math.round(l.usedPercent);
    const tone = renewed ? 'free' : pct >= 95 ? 'out' : pct >= 80 ? 'low' : 'free';
    const advice = renewed ? 'Obnoveno — plná kapacita' : pct >= 100 ? 'Vyčerpáno, počkej na obnovu' : pct >= 80 ? 'Šetři na důležité úlohy' : pct >= 50 ? 'V pohodě pro běžnou práci' : 'Dobrý čas na velké úlohy';
    return `<li class="lwin-row" data-tone="${tone}">
      <span class="lwin-logo">${glyph(l.id.startsWith('codex') ? { connector: 'codex' } : l.provider)}</span>
      <span class="lwin-main">
        <span class="lwin-top"><b>${esc(l.app)} · ${esc(l.label)}</b><span class="lwin-pct">${renewed ? '0' : pct} %</span></span>
        <span class="lwin-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(`${l.app} ${l.label}`)}"><i style="width:${pct}%"></i></span>
        <span class="lwin-sub"><span>${esc(advice)}</span>${l.resetsAt && !renewed ? `<span>obnova <span data-until="${l.resetsAt}">${untilLabel(l.resetsAt, now)}</span> · ${new Date(l.resetsAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}</span>
      </span>
    </li>`;
  }).join('')}</ul>`;
}

export function limitGauges(limits, now, { size = 'md', provider } = {}) {
  return limits
    .filter((l) => !provider || l.provider === provider)
    .map((l) => {
      const active = l.reached && (!l.resetsAt || l.resetsAt > now) && now - l.at < 7 * DAY;
      const expired = Boolean(l.resetsAt && l.resetsAt < now);
      if (!active && (now - l.at > 7 * DAY || typeof l.usedPercent !== 'number')) return null;
      const pct = active ? 100 : expired ? 0 : l.usedPercent;
      const color = active || pct >= 95 ? 'var(--velvet-ink)' : pct >= 80 ? 'var(--brass)' : 'var(--teal)';
      const value = active ? 'Vyčerpán' : expired ? 'Obnoven' : `${Math.round(pct)} %`;
      const sub = l.resetsAt && !expired ? `obnova ${resetsLabel(l.resetsAt, now)}` : l.plan ? `plán ${l.plan}` : '';
      return { at: l.at, html: gauge({ pct, color, value, label: `${l.app} · ${l.label}`, sub, size, reached: active }) };
    })
    .filter(Boolean)
    .sort((a, b) => b.at - a.at)
    .map((x) => x.html);
}

/* ---------- Modální dialog ---------- */

function clearErrors(form) {
  for (const el of form.querySelectorAll('.field-error')) el.remove();
  for (const el of form.querySelectorAll('[aria-invalid]')) {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  }
  const fe = form.querySelector('.form-error');
  if (fe) fe.hidden = true;
}

function markErrors(form, errors) {
  let first = null;
  for (const [name, msg] of Object.entries(errors || {})) {
    const key = name.replace(/^services\./, 'svc_').replace(/^rates\./, 'rate_');
    const field = form.elements.namedItem(key);
    if (!field || !field.insertAdjacentHTML) continue;
    const id = `err-${key}`;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', id);
    field.insertAdjacentHTML('afterend', `<span class="field-error" id="${id}">${esc(msg)}</span>`);
    first = first || field;
  }
  (first?.classList.contains('picker-source') ? first.nextElementSibling : first)?.focus();
}

export function modal({ title, body, submitLabel = 'Uložit', cancelLabel = 'Zrušit', danger = false, onSubmit, wide = false }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const id = `m-${Math.random().toString(36).slice(2, 8)}`;
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.innerHTML = `<div class="modal${wide ? ' modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <form novalidate>
        <header class="modal-head"><h2 id="${id}">${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Zavřít">${ICON.close}</button></header>
        <div class="modal-body">${body}</div>
        <p class="form-error" role="alert" hidden></p>
        <footer class="modal-foot"><button type="button" class="btn" data-close>${esc(cancelLabel)}</button><button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${esc(submitLabel)}</button></footer>
      </form>
    </div>`;
    document.body.appendChild(scrim);
    document.body.classList.add('has-modal');
    const form = scrim.querySelector('form');
    const submit = form.querySelector('[type="submit"]');
    let closed = false;

    const close = (result) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      scrim.classList.add('is-closing');
      setTimeout(() => scrim.remove(), 180);
      document.body.classList.remove('has-modal');
      if (opener?.isConnected) opener.focus();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Tab') {
        const f = [...scrim.querySelectorAll('button, input, select, textarea, a[href]')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(false); });
    for (const b of scrim.querySelectorAll('[data-close]')) b.addEventListener('click', () => close(false));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(form);
      if (!onSubmit) { close(true); return; }
      submit.disabled = true;
      submit.classList.add('is-busy');
      try {
        const r = await onSubmit(form);
        if (r !== false) close(r ?? true);
      } catch (err) {
        if (err.errors) markErrors(form, err.errors);
        const fe = form.querySelector('.form-error');
        fe.textContent = err.message;
        fe.hidden = false;
      } finally {
        submit.disabled = false;
        submit.classList.remove('is-busy');
      }
    });
    requestAnimationFrame(() => (form.querySelector('.modal-body input, .modal-body .picker-trigger, .modal-body textarea') || submit).focus());
  });
}

export const confirmDialog = ({ title, message, confirmLabel = 'Potvrdit', danger = false }) =>
  modal({ title, body: `<p class="modal-text">${esc(message)}</p>`, submitLabel: confirmLabel, danger });

/* ---------- Paleta příkazů ---------- */

export function createPalette(getItems, onPick) {
  const root = document.createElement('div');
  root.className = 'palette';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Rychlé hledání');
  root.innerHTML = `<div class="palette-box">
    <div class="palette-input">${ICON.search}<input type="text" placeholder="Hledat agenta, projekt nebo sekci…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list"><kbd>Esc</kbd></div>
    <ul class="palette-list" id="palette-list" role="listbox"></ul>
  </div>`;
  document.body.appendChild(root);
  const input = root.querySelector('input');
  const list = root.querySelector('ul');
  let items = [];
  let index = 0;
  let opener = null;

  const render = () => {
    items = getItems(input.value);
    index = Math.min(index, Math.max(0, items.length - 1));
    let group = '';
    list.innerHTML = items.length
      ? items.map((it, i) => {
        const head = it.group !== group ? `<li class="pl-group" role="presentation">${esc((group = it.group))}</li>` : '';
        return `${head}<li role="option" id="pl-${i}" data-i="${i}" aria-selected="${i === index}">${it.icon || ''}<span class="pl-text"><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></li>`;
      }).join('')
      : '<li class="pl-group" role="presentation">Nic nenalezeno</li>';
    input.setAttribute('aria-activedescendant', items.length ? `pl-${index}` : '');
    list.querySelector(`#pl-${index}`)?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => {
    if (root.hidden) return;
    root.hidden = true;
    if (opener?.isConnected) opener.focus();
  };
  const pick = (i) => {
    const it = items[i];
    if (!it) return;
    root.hidden = true;
    onPick(it);
  };

  input.addEventListener('input', () => { index = 0; render(); });
  root.addEventListener('keydown', (e) => {
    const n = Math.max(1, items.length);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % n; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + n) % n; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(index); }
    else if (e.key === 'Tab') { e.preventDefault(); input.focus(); }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) pick(Number(li.dataset.i));
  });
  list.addEventListener('pointerover', (e) => {
    const li = e.target.closest('[data-i]');
    if (!li || !list.contains(li)) return;
    const next = Number(li.dataset.i);
    if (next !== index) { index = next; render(); }
  });
  root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });

  return {
    open() {
      opener = document.activeElement;
      root.hidden = false;
      input.value = '';
      index = 0;
      render();
      input.focus();
    },
    close,
    get isOpen() { return !root.hidden; },
  };
}

export function switchRow({ key, label, desc = '', checked, disabled = false }) {
  return `<div class="set-row">
    <div class="set-row-text"><span class="set-label" id="lbl-${esc(key)}">${esc(label)}</span>${desc ? `<p class="set-desc">${desc}</p>` : ''}</div>
    <button class="switch" type="button" role="switch" aria-checked="${Boolean(checked)}" aria-labelledby="lbl-${esc(key)}" data-setting="${esc(key)}"${disabled ? ' disabled' : ''}></button>
  </div>`;
}
