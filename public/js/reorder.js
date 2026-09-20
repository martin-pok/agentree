// Změna pořadí karet tažením a klávesnicí (Alt + šipky). Myší se táhne za celou kartu, prstem jen za
// úchyt [data-grip]: tažení za kartu by na dotykové obrazovce bránilo rolování stránky.
//
// Karta se zvedne, drží se pod ukazatelem a ostatní se plynule uhýbají (FLIP: nejdřív se změří
// staré místo, pak se prvek přesune v DOM a animuje z původní polohy). Po puštění karta doletí
// na své místo a nové pořadí se uloží. Klik, který tah ukončí, se zahodí, ať se karta neotevře.

const DIST = 6; // px pohybu myši, než se klik změní v tah

export function enableReorder(box, { itemSelector, idOf, onCommit, onMoveKey }) {
  let st = null;
  let dragging = false;
  const items = () => [...box.querySelectorAll(itemSelector)];
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const flip = (els, before) => {
    if (reduce()) return;
    for (const el of els) {
      const a = before.get(el);
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (!dx && !dy) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  };

  const follow = () => {
    const { el, gx, gy, px, py } = st;
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${Math.round(px - gx - r.left)}px, ${Math.round(py - gy - r.top)}px) scale(1.03)`;
  };

  // Poloha karty podle rozvržení, ne podle toho, kde je zrovna uprostřed animace. Kdyby se hledal
  // cíl podle getBoundingClientRect, karta, která se ještě uhýbá, by ukazatel „chytila“ a tah by
  // začal kmitat sem a tam.
  const layoutRect = (o) => {
    const op = o.offsetParent || document.body;
    const r = op.getBoundingClientRect();
    const left = r.left + op.clientLeft - op.scrollLeft + o.offsetLeft;
    const top = r.top + op.clientTop - op.scrollTop + o.offsetTop;
    return { left, top, right: left + o.offsetWidth, bottom: top + o.offsetHeight };
  };

  const overTarget = () => {
    const { el, px, py } = st;
    return items().find((o) => {
      if (o === el) return false;
      const r = layoutRect(o);
      return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
    });
  };

  const begin = () => {
    dragging = true;
    const { el } = st;
    const r = el.getBoundingClientRect();
    st.gx = st.px - r.left;
    st.gy = st.py - r.top;
    el.classList.add('is-lifted');
    box.classList.add('is-reordering');
    document.body.classList.add('is-dragging-card');
    follow();
  };

  const move = (target) => {
    const list = items();
    const others = list.filter((x) => x !== st.el);
    const before = new Map(others.map((o) => [o, o.getBoundingClientRect()]));
    if (list.indexOf(target) > list.indexOf(st.el)) target.after(st.el);
    else target.before(st.el);
    flip(others, before);
  };

  const scrollEdge = () => {
    if (!dragging) return;
    const edge = 70;
    const y = st.py;
    if (y < edge) window.scrollBy(0, -Math.round((edge - y) / 4));
    else if (y > window.innerHeight - edge) window.scrollBy(0, Math.round((y - (window.innerHeight - edge)) / 4));
    follow();
    st.raf = requestAnimationFrame(scrollEdge);
  };

  const finish = async (commit) => {
    if (!st) return;
    const s = st;
    st = null;
    cancelAnimationFrame(s.raf);
    if (!dragging) return;
    dragging = false;
    const { el } = s;
    // Karta doletí z aktuální polohy na své místo v mřížce.
    const from = el.getBoundingClientRect();
    el.style.transform = 'none';
    const to = el.getBoundingClientRect();
    el.classList.remove('is-lifted');
    box.classList.remove('is-reordering');
    document.body.classList.remove('is-dragging-card');
    if (!reduce()) el.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(1.03)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    // Klik po puštění tahu nesmí kartu otevřít.
    const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
    box.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => box.removeEventListener('click', swallow, true), 0);
    if (commit) onCommit(items().map(idOf).filter(Boolean));
  };

  box.addEventListener('dragstart', (e) => { if (e.target.closest?.(itemSelector)) e.preventDefault(); });
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || st) return;
    const el = e.target.closest(itemSelector);
    if (!el || !box.contains(el)) return;
    if (e.pointerType !== 'mouse' && !e.target.closest('[data-grip]')) return;
    st = { el, x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, id: e.pointerId };
  });
  box.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    st.px = e.clientX;
    st.py = e.clientY;
    if (!dragging) {
      const d = Math.hypot(st.px - st.x, st.py - st.y);
      if (d < DIST) return;
      try { st.el.setPointerCapture(st.id); } catch { /* prvek zmizel */ }
      begin();
      st.raf = requestAnimationFrame(scrollEdge);
    }
    e.preventDefault();
    follow();
    const t = overTarget();
    if (t) { move(t); follow(); }
  });
  box.addEventListener('pointerup', (e) => { if (st && e.pointerId === st.id) finish(true); });
  box.addEventListener('pointercancel', (e) => { if (st && e.pointerId === st.id) finish(true); });
  box.addEventListener('contextmenu', (e) => { if (dragging) e.preventDefault(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dragging) { finish(false); onCommit(null); } }, true);

  // Klávesnice: Alt + šipky posouvá zaostřenou kartu.
  box.addEventListener('keydown', (e) => {
    if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const el = e.target.closest(itemSelector);
    if (!el) return;
    e.preventDefault();
    const list = items();
    const i = list.indexOf(el);
    const j = i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= list.length) return;
    const others = list.filter((x) => x !== el);
    const before = new Map(others.map((o) => [o, o.getBoundingClientRect()]));
    if (j > i) list[j].after(el); else list[j].before(el);
    flip(others, before);
    el.focus();
    onMoveKey?.(j + 1, list.length);
    onCommit(items().map(idOf).filter(Boolean));
  });

  return { isDragging: () => dragging };
}
