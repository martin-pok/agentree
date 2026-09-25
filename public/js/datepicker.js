import { esc, MONTHS } from './format.js';
import { tr, podleJazyka, LOCALE } from './i18n.js';

// Vlastní kalendář. Nativní <input type="date"> otevírá okno operačního systému, které nejde
// ostylovat, takže by v aplikaci vždycky vypadalo jako cizí prvek. Původní prvek zůstává v DOM
// (skrytý, ale s hodnotou), takže formuláře, FormData i posluchače `change` v ostatním kódu
// fungují beze změny. Výběr z nabídky (<select>) řeší selects.js; tady je jen kalendář se
// stejným vzhledem spouštěče a nabídky (třídy .picker-trigger a .picker-menu).

const CAL = '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" focusable="false"><rect x="4" y="5.5" width="16" height="14.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const PREV = '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NEXT = '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let current = null; // právě otevřený popover: { pop, trigger, close }

export function closePicker() {
  current?.close();
}

// Popover se kreslí do <body>, aby ho neořízl žádný rolovací rodič ani dialog.
function place(pop, trigger, { width } = {}) {
  const r = trigger.getBoundingClientRect();
  pop.style.minWidth = `${Math.round(width || r.width)}px`;
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  let left = Math.min(Math.max(8, r.left), Math.max(8, vw - pw - 8));
  let top = r.bottom + 6;
  if (top + ph > vh - 8 && r.top - 6 - ph >= 8) top = r.top - 6 - ph; // dole není místo → nad prvek
  else if (top + ph > vh - 8) { pop.style.maxHeight = `${Math.max(140, vh - top - 8)}px`; }
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function openPopover(trigger, pop, { onKey, width }) {
  closePicker();
  // Stejně jako nabídky v selects.js: v modálním okně uvnitř něj, jinak by kalendář čtečka
  // obrazovky nepřečetla, a ve vrchní vrstvě (popover), aby ho okno neořízlo ani neposunulo.
  (trigger.closest('[aria-modal="true"]') || document.body).appendChild(pop);
  pop.setAttribute('popover', 'manual');
  pop.showPopover?.();
  place(pop, trigger, { width });
  trigger.setAttribute('aria-expanded', 'true');
  const onDown = (e) => { if (!pop.contains(e.target) && !trigger.contains(e.target)) close(); };
  // Okno je v zachytávací fázi před dialogem, takže Esc zavře jen nabídku, ne celý dialog pod ní.
  const onWinKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
    if (e.key === 'Tab') { close(); return; }
    if (e.target === trigger || pop.contains(e.target)) onKey(e, close);
  };
  const onScroll = (e) => { if (!pop.contains(e.target)) close(); };
  const onResize = () => close();
  // Překreslení stránky pod nabídkou (živá data) může spouštěč odstranit – nabídka nesmí osiřet.
  const watch = setInterval(() => { if (!trigger.isConnected) close(); }, 400);
  function close(refocus = false) {
    if (current?.pop !== pop) return;
    current = null;
    clearInterval(watch);
    document.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('keydown', onWinKey, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    trigger.setAttribute('aria-expanded', 'false');
    pop.remove();
    if (refocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  }
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onWinKey, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  current = { pop, trigger, close };
  return close;
}

const labelText = (el) => {
  const label = el.closest('label');
  if (!label) return el.getAttribute('aria-label') || '';
  const c = label.cloneNode(true);
  c.querySelectorAll('select, input, .picker-trigger, .picker-menu').forEach((n) => n.remove());
  return c.textContent.replace(/\s+/g, ' ').trim();
};

/* ---------- Kalendář ---------- */

const DAYS = podleJazyka(['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'], ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
};
const show = (d) => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d, n) => {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
};

function enhanceDate(inp) {
  inp._dd = true;
  const name = labelText(inp);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'picker-trigger dd-date';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `<span class="picker-label dd-value"></span>${CAL}`;
  inp.after(btn);
  // Hodnota zůstává ve formátu RRRR-MM-DD, jen se přestane kreslit systémový kalendář.
  inp.type = 'text';
  inp.classList.add('dd-native');
  inp.tabIndex = -1;
  inp.setAttribute('aria-hidden', 'true');
  const sync = () => {
    const d = parse(inp.value);
    btn.querySelector('.dd-value').textContent = d ? show(d) : tr('Vyber datum');
    btn.classList.toggle('is-placeholder', !d);
    btn.setAttribute('aria-label', `${name ? `${name}: ` : ''}${d ? show(d) : tr('nevybráno')}`);
    btn.disabled = inp.disabled;
  };
  inp.addEventListener('change', sync);
  sync();

  const openCal = () => {
    if (btn.disabled) return;
    const selected = parse(inp.value);
    const today = new Date();
    let cursor = selected || new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const pop = document.createElement('div');
    pop.className = 'picker-menu dd-cal';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', tr('Kalendář'));
    const draw = () => {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const offset = (first.getDay() + 6) % 7;
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = addDays(first, i - offset);
        const cls = ['cal-day', d.getMonth() !== cursor.getMonth() ? 'is-out' : '', iso(d) === iso(today) ? 'is-today' : '', selected && iso(d) === iso(selected) ? 'is-sel' : '', iso(d) === iso(cursor) ? 'is-cursor' : ''].filter(Boolean).join(' ');
        cells.push(`<button type="button" tabindex="-1" class="${cls}" data-d="${iso(d)}" aria-label="${d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })}"${selected && iso(d) === iso(selected) ? ' aria-pressed="true"' : ''}>${d.getDate()}</button>`);
      }
      pop.innerHTML = `<div class="cal-head"><button type="button" tabindex="-1" class="cal-nav" data-nav="-1" aria-label="${tr('Předchozí měsíc')}">${PREV}</button><span class="cal-title" aria-live="polite">${esc(MONTHS[cursor.getMonth()])} ${cursor.getFullYear()}</span><button type="button" tabindex="-1" class="cal-nav" data-nav="1" aria-label="${tr('Další měsíc')}">${NEXT}</button></div>
        <div class="cal-grid cal-dow" aria-hidden="true">${DAYS.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="cal-grid">${cells.join('')}</div>
        <div class="cal-foot"><button type="button" tabindex="-1" class="link" data-today>${tr('Dnes')}</button></div>`;
    };
    draw();
    const commit = (d, close) => {
      inp.value = iso(d);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      close(true);
    };
    const close = openPopover(btn, pop, {
      width: 296,
      onKey(e, closeFn) {
        const move = (n) => { e.preventDefault(); cursor = addDays(cursor, n); draw(); };
        if (e.key === 'ArrowLeft') move(-1);
        else if (e.key === 'ArrowRight') move(1);
        else if (e.key === 'ArrowUp') move(-7);
        else if (e.key === 'ArrowDown') move(7);
        else if (e.key === 'PageUp') { e.preventDefault(); cursor = addMonths(cursor, e.shiftKey ? -12 : -1); draw(); }
        else if (e.key === 'PageDown') { e.preventDefault(); cursor = addMonths(cursor, e.shiftKey ? 12 : 1); draw(); }
        else if (e.key === 'Home') { e.preventDefault(); cursor = addDays(cursor, -((cursor.getDay() + 6) % 7)); draw(); }
        else if (e.key === 'End') { e.preventDefault(); cursor = addDays(cursor, 6 - ((cursor.getDay() + 6) % 7)); draw(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(cursor, closeFn); }
      },
    });
    pop.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) { cursor = addMonths(cursor, Number(nav.dataset.nav)); draw(); return; }
      if (e.target.closest('[data-today]')) { commit(new Date(today.getFullYear(), today.getMonth(), today.getDate()), close); return; }
      const day = e.target.closest('[data-d]');
      if (day) commit(parse(day.dataset.d), close);
    });
  };
  btn.addEventListener('click', () => { if (current?.trigger === btn) closePicker(); else openCal(); });
  btn.addEventListener('keydown', (e) => {
    if (current?.trigger === btn) return;
    if (['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openCal(); }
  });
  btn.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });
}

/* ---------- Zapnutí ---------- */

export function enhanceDates(root = document) {
  for (const inp of root.querySelectorAll('input[type="date"]')) if (!inp._dd) enhanceDate(inp);
}

export function startDatePickers() {
  if (typeof document === 'undefined') return;
  let planned = false;
  const run = () => { planned = false; enhanceDates(); };
  new MutationObserver(() => { if (!planned) { planned = true; requestAnimationFrame(run); } }).observe(document.body, { childList: true, subtree: true });
  enhanceDates();
}
