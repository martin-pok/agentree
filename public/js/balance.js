// Vyvažování dvou sloupců karet. Sloupce mají různou výšku podle dat (rozbalený seznam, dlouhý
// žebříček, prázdný blok…), takže s pevným pořadím zůstává pod kratším sloupcem prázdná plocha.
// Sekce označené `data-float` proto sedí v tom sloupci, kde je právě míň místa; ostatní sekce
// zůstávají, kde jsou. Přesun se provede jen při znatelném zlepšení (práh 40 px), aby karty
// neskákaly sem a tam při každé změně dat. Na jednom sloupci se nic nevyvažuje a pohyblivé
// sekce jdou pod sebe v původním pořadí.

export function balanceColumns(box, { threshold = 40 } = {}) {
  const cols = box?.querySelectorAll(':scope > .bal-col');
  if (!cols || cols.length !== 2) return false;
  const [a, b] = cols;
  const floats = box._floats || (box._floats = [...box.querySelectorAll('[data-float]')]);
  if (!floats.length) return false;
  const gap = parseFloat(getComputedStyle(a).rowGap) || 0;
  const place = (side) => {
    const moved = floats.some((f, i) => f.parentElement !== (side[i] ? a : b));
    if (moved) floats.forEach((f, i) => (side[i] ? a : b).append(f));
    return moved;
  };
  const single = getComputedStyle(box).gridTemplateColumns.trim().split(/\s+/).length < 2;
  if (single) return place(floats.map(() => false));
  const H = floats.map((f) => (f.offsetHeight > 0 ? f.offsetHeight + gap : 0));
  const base = (col) => [...col.children].filter((c) => !floats.includes(c) && c.offsetHeight > 0).reduce((s, c) => s + c.offsetHeight + gap, 0);
  const ba = base(a);
  const bb = base(b);
  const cost = (side) => Math.abs(ba + floats.reduce((s, _f, i) => s + (side[i] ? H[i] : 0), 0) - (bb + floats.reduce((s, _f, i) => s + (side[i] ? 0 : H[i]), 0)));
  const current = floats.map((f) => f.parentElement === a);
  let best = current;
  let bestCost = cost(current);
  // Sekcí je málo, takže se dají projít všechna rozdělení.
  for (let m = 0; m < 1 << floats.length; m++) {
    const side = floats.map((_f, i) => Boolean(m & (1 << i)));
    const c = cost(side);
    if (c + threshold < bestCost) { best = side; bestCost = c; }
  }
  return best === current ? false : place(best);
}

// Přepočítá při změně velikosti sloupců, nejvýš jednou za snímek. `onZmena` se zavolá i tehdy,
// když se nic nepřesouvalo: výška se mohla změnit z jiného důvodu (rozbalený seznam), a volající
// podle ní dopočítává, kolik obsahu se ještě vejde.
export function watchBalance(box, onZmena) {
  let frame = 0;
  const run = () => { frame = 0; balanceColumns(box); onZmena?.(); };
  const ro = new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(run); });
  for (const col of box.querySelectorAll(':scope > .bal-col')) ro.observe(col);
  return () => { ro.disconnect(); cancelAnimationFrame(frame); };
}
