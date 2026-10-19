import { state } from './state.js';
import { enableReorder } from './reorder.js';
import { saveOrder } from './layout-prefs.js';
import { pack, decodeLayout, encodeLayout, mergeLayout, spanFromWidth, clampSpan, COLS, MIN_SPAN } from './board-pack.js';
import { tr } from './i18n.js';
import { ze } from './predlozky.js';

// Nástěnka widgetů (Přehled → Průběh dne a spotřeba). Widget se přesouvá za hlavičku nebo úchyt
// nahoře a mění šířku tažením za pravý okraj; šířka se přichytává k celým sloupcům mřížky 12.
// Řádky skládá pack(): nevejde-li se další widget, poslední v řádku se roztáhne, takže nikde
// nezůstane díra. Rozvržení se ukládá do nastavení (settings.layout[name]).
//
// Na úzké obrazovce je nástěnka jeden sloupec: šířka se nemění, přesouvá se jen za úchyt
// (tažení za plochu by na dotyku bránilo rolování).

const NAZEV_SIRKY = { 12: () => tr('celá šířka'), 6: () => tr('polovina'), 4: () => tr('třetina'), 8: () => tr('dvě třetiny'), 9: () => tr('tři čtvrtiny') };
export const popisSirky = (span) => (NAZEV_SIRKY[span] ? NAZEV_SIRKY[span]() : tr('{0} ze 12 sloupců', span));

export function enableBoard(box, { name, defaults, onLayout, announce }) {
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = () => getComputedStyle(box).gridTemplateColumns.trim().split(/\s+/).length < COLS;
  const widgets = () => [...box.querySelectorAll(':scope > .widget')];
  const byId = (id) => box.querySelector(`:scope > .widget[data-card="${id}"]`);
  let layout = mergeLayout(decodeLayout(state.settings?.layout?.[name]), defaults);
  const spanOf = (id) => layout.find((x) => x.id === id)?.span ?? COLS;
  let rows = [];
  // Naposledy uložené rozvržení: Esc během přetahování se vrací k němu.
  let committed = layout.map((x) => ({ ...x }));
  const rowOf = (id) => rows.find((r) => r.some((x) => x.id === id)) || [];

  // Prázdný widget (žádná okna limitů, prázdný profil) zmizí i se svým místem v řádku.
  const visible = (w) => {
    const parts = [...w.children].filter((c) => !c.matches('.widget-grip, .widget-resize, .widget-size'));
    if (!parts.length) return false;
    // Bez getComputedStyle: při vkládání celé obrazovky by vynutil přepočet stylů a přepnutí na
    // Přehled by se protáhlo přes 50 ms. Sekce se skrývají jen atributem hidden.
    return parts.some((c) => !c.hidden && (c.childElementCount > 0 || c.textContent.trim() !== ''));
  };

  function relayout() {
    // DOM drží pořadí podle rozvržení (přesun tažením mění DOM, rozvržení se z něj čte zpět).
    const order = widgets();
    for (const w of order) w.hidden = !visible(w);
    const shown = order.filter((w) => !w.hidden);
    const packed = pack(shown.map((w) => ({ id: w.dataset.card, span: spanOf(w.dataset.card) })));
    rows = [];
    packed.forEach((p, i) => {
      const w = shown[i];
      w.style.setProperty('--span', p.span);
      w.dataset.row = p.row;
      (rows[p.row] ||= []).push({ id: p.id, span: p.span });
    });
    // Okraj pro změnu šířky je hranice se sousedem vpravo. Poslední widget v řádku ho nemá –
    // vždycky vyplní řádek do konce –, ledaže je v řádku sám (pak zúžením uvolní místo dalšímu).
    for (const r of rows) r.forEach((it, i) => byId(it.id)?.toggleAttribute('data-bez-okraje', i === r.length - 1 && r.length > 1));
    onLayout?.();
  }

  function applySaved() {
    const els = widgets();
    const rank = (w) => { const i = layout.findIndex((x) => x.id === w.dataset.card); return i < 0 ? 1e6 : i; };
    const sorted = [...els].sort((a, b) => rank(a) - rank(b));
    if (sorted.some((w, i) => w !== els[i])) for (const w of sorted) box.append(w);
    relayout();
  }

  const fromDom = () => widgets().map((w) => ({ id: w.dataset.card, span: spanOf(w.dataset.card) }));
  const save = () => { committed = layout.map((x) => ({ ...x })); return saveOrder(name, encodeLayout(layout)); };

  // FLIP: změří staré polohy, změní rozvržení a ostatní widgety plynule dojedou na nová místa.
  function animateFrom(before, skip) {
    if (reduce()) return;
    for (const w of widgets()) {
      if (w === skip || w.hidden) continue;
      const a = before.get(w);
      if (!a) continue;
      const b = w.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      // Jen posun: změna měřítka by na chvíli roztáhla text a grafy.
      w.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  const rects = () => new Map(widgets().map((w) => [w, w.getBoundingClientRect()]));

  const setLocal = (id, span) => { const it = layout.find((x) => x.id === id); if (it) it.span = clampSpan(span); };
  // Přesun: hlavička widgetu nebo úchyt nahoře. Odkazy a výběr období v hlavičce dál fungují –
  // tah začne až po pohybu o 6 px, klik bez pohybu je obyčejný klik.
  box.dataset.liftScale = '1.01';
  const reorder = enableReorder(box, {
    itemSelector: '.widget',
    handle: '.widget-grip, .widget .sec-head',
    idOf: (w) => w.dataset.card,
    afterMove: () => { layout = fromDom(); relayout(); },
    onMoveKey: (pos, total) => announce?.(ze(total) ? tr('Widget je na pozici {0} ze {1}.', pos, total) : tr('Widget je na pozici {0} z {1}.', pos, total)),
    onCommit: (ids) => {
      if (!ids) { layout = committed.map((x) => ({ ...x })); applySaved(); return; } // Esc: vrátit, jak to bylo
      layout = fromDom();
      relayout();
      save();
    },
  });

  // Změna šířky. Se sousedem vpravo v řádku se táhne hranice mezi nimi: součet šířek zůstává
  // a řádek se nerozpadne. Hranice dotažená skoro na konec pošle souseda na další řádek. Widget
  // sám v řádku mění jen svou šířku; uvolněné místo zaplní další widget, pokud se vejde.
  // Vždy se počítá od rozvržení před začátkem změny, takže návrat ukazatele vrátí i souseda.
  function pairOf(id) {
    const row = rowOf(id);
    const i = row.findIndex((x) => x.id === id);
    const next = row[i + 1];
    const before = row.slice(0, Math.max(0, i)).reduce((n, x) => n + x.span, 0);
    return { before, self: row[i]?.span ?? spanOf(id), next: next ? { id: next.id, span: next.span } : null };
  }
  function resizeTo(id, span, p, start) {
    layout = start.map((x) => ({ ...x }));
    if (p.next) {
      const total = p.self + p.next.span;
      if (span >= total - MIN_SPAN + 2) setLocal(id, COLS - p.before); // soused si nechá šířku a přejde níž
      else {
        const a = Math.max(MIN_SPAN, Math.min(total - MIN_SPAN, span));
        setLocal(id, a);
        setLocal(p.next.id, total - a);
      }
    } else {
      setLocal(id, span);
      // Sám v řádku a užší než řádek: první widget dalšího řádku se přisune a dorovná ho.
      const viditelne = widgets().filter((w) => !w.hidden).map((w) => w.dataset.card);
      const dalsi = p.before === 0 ? viditelne[viditelne.indexOf(id) + 1] : null;
      const zbyva = COLS - clampSpan(span);
      if (dalsi && zbyva >= MIN_SPAN) setLocal(dalsi, zbyva);
    }
  }
  const shownSpan = (w) => Number(w.style.getPropertyValue('--span')) || COLS;

  let rs = null;
  box.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.widget-resize');
    if (!h || e.button !== 0 || narrow()) return;
    const w = h.closest('.widget');
    e.preventDefault();
    e.stopPropagation();
    const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
    const id = w.dataset.card;
    rs = { w, id, left: w.getBoundingClientRect().left, gap, colWidth: (box.clientWidth - gap * (COLS - 1)) / COLS, pointer: e.pointerId, start: layout.map((x) => ({ ...x })), pair: pairOf(id), last: shownSpan(w) };
    try { h.setPointerCapture(e.pointerId); } catch { /* prvek zmizel */ }
    w.classList.add('is-resizing');
    box.classList.add('is-resizing');
    document.body.classList.add('is-resizing-widget');
    showSize(w, rs.last);
  }, true);
  box.addEventListener('pointermove', (e) => {
    if (!rs || e.pointerId !== rs.pointer) return;
    e.preventDefault();
    const span = spanFromWidth(e.clientX - rs.left, rs.colWidth, rs.gap);
    const before = rects();
    resizeTo(rs.id, span, rs.pair, rs.start);
    relayout();
    if (shownSpan(rs.w) === rs.last) return;
    rs.last = shownSpan(rs.w);
    animateFrom(before, rs.w);
    showSize(rs.w, rs.last);
  });
  const endResize = (commit) => {
    if (!rs) return;
    const { w, start } = rs;
    rs = null;
    w.classList.remove('is-resizing');
    box.classList.remove('is-resizing');
    document.body.classList.remove('is-resizing-widget');
    hideSize(w);
    const zmeneno = JSON.stringify(start) !== JSON.stringify(layout);
    if (!zmeneno) return;
    if (!commit) { const before = rects(); layout = start; relayout(); animateFrom(before); return; }
    save();
    announce?.(tr('Šířka widgetu: {0}.', popisSirky(shownSpan(w))));
  };
  box.addEventListener('pointerup', (e) => { if (rs && e.pointerId === rs.pointer) endResize(true); });
  box.addEventListener('pointercancel', (e) => { if (rs && e.pointerId === rs.pointer) endResize(false); });
  // Dvojklik na okraj vrátí výchozí šířky obou widgetů u hranice.
  box.addEventListener('dblclick', (e) => {
    const h = e.target.closest('.widget-resize');
    if (!h) return;
    const w = h.closest('.widget');
    const ids = [w.dataset.card, pairOf(w.dataset.card).next?.id].filter(Boolean);
    const before = rects();
    const start = JSON.stringify(layout);
    for (const id of ids) { const d = defaults.find((x) => x.id === id); if (d) setLocal(id, d.span); }
    if (JSON.stringify(layout) === start) return;
    relayout();
    animateFrom(before);
    save();
    announce?.(tr('Šířka widgetu: {0}.', popisSirky(shownSpan(w))));
  });
  // Klávesnice: na úchytu Alt + šipky přesouvají (enableReorder), Alt + Shift + ←/→ posouvá hranici.
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && rs) { e.stopPropagation(); endResize(false); return; }
    if (!e.altKey || !e.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const w = e.target.closest('.widget');
    if (!w || narrow()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const id = w.dataset.card;
    const smer = e.key === 'ArrowRight' ? 1 : -1;
    const start = layout.map((x) => ({ ...x }));
    const before = rects();
    const p = pairOf(id);
    const row = rowOf(id);
    const prev = row[row.findIndex((x) => x.id === id) - 1];
    // Poslední v řádku nemá hranici vpravo: šipka posune hranici se sousedem vlevo.
    if (!p.next && prev) resizeTo(prev.id, prev.span - smer, pairOf(prev.id), start);
    else resizeTo(id, p.self + smer, p, start);
    if (JSON.stringify(start) === JSON.stringify(layout)) return;
    relayout();
    animateFrom(before);
    save();
    announce?.(tr('Šířka widgetu: {0}.', popisSirky(shownSpan(w))));
    w.querySelector('.widget-grip')?.focus();
  }, true);

  function showSize(w, span) {
    let b = w.querySelector(':scope > .widget-size');
    if (!b) { b = document.createElement('span'); b.className = 'widget-size'; b.setAttribute('aria-hidden', 'true'); w.append(b); }
    b.textContent = popisSirky(span);
    b.classList.add('is-on');
  }
  function hideSize(w) { w.querySelector(':scope > .widget-size')?.classList.remove('is-on'); }

  applySaved();
  return {
    relayout,
    reset: () => { layout = defaults.map((d) => ({ ...d })); applySaved(); save(); },
    // Nastavení dorazí ze serveru až po prvním vykreslení (a mění se i z jiného okna): rozvržení
    // se z něj načte znovu, pokud se zrovna netáhne.
    reload: () => {
      if (rs || reorder.isDragging()) return;
      const next = mergeLayout(decodeLayout(state.settings?.layout?.[name]), defaults);
      if (JSON.stringify(next) === JSON.stringify(layout)) return;
      layout = next;
      committed = next.map((x) => ({ ...x }));
      applySaved();
    },
    isBusy: () => Boolean(rs) || reorder.isDragging(),
    destroy: () => reorder.zrus(),
  };
}

// Úchyt a okraj pro změnu šířky – stejné pro každý widget. Úchyt je tlačítko, aby se na widget
// dalo dostat klávesnicí (Alt + šipky, Alt + Shift + ←/→).
export const widgetChrome = (label) => `<button class="widget-grip" type="button" data-grip aria-label="${tr('Přesunout widget {0}. Alt a šipky mění pořadí, Alt, Shift a šipky vlevo a vpravo šířku.', label)}"><i></i><i></i><i></i><i></i><i></i><i></i></button><span class="widget-resize" aria-hidden="true" title="${tr('Táhni pro změnu šířky, dvojklikem výchozí')}"></span>`;
