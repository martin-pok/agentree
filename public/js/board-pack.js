// Skládání widgetů nástěnky do řádků mřížky o 12 sloupcích. Čistá funkce bez DOM, aby šla
// testovat a aby rozvržení vždy určoval kód, ne prohlížeč.
//
// Pravidlo: widgety jdou v pořadí, které zvolil uživatel. Když se další do řádku nevejde,
// poslední widget v řádku se roztáhne do konce – na nástěnce tak nikdy nezůstane díra.
// Uložená šířka je přání; skutečná šířka je to, co z ní po složení vyjde.

export const COLS = 12;
export const MIN_SPAN = 4;

export const clampSpan = (n) => Math.max(MIN_SPAN, Math.min(COLS, Math.round(Number(n) || COLS)));

/** @param {{ id: string, span: number }[]} items @returns {{ id: string, span: number, row: number }[]} */
export function pack(items) {
  const out = [];
  let row = 0;
  let used = 0;
  for (const it of items) {
    const span = clampSpan(it.span);
    if (used && used + span > COLS) {
      out[out.length - 1].span += COLS - used;
      row += 1;
      used = 0;
    }
    out.push({ id: it.id, span, row });
    used += span;
    if (used === COLS) { row += 1; used = 0; }
  }
  if (used && out.length) out[out.length - 1].span += COLS - used;
  return out;
}

// Uložené rozvržení: pole řetězců „id-šířka“ (server pouští jen [\w-]{1,40}).
export const encodeLayout = (items) => items.map((it) => `${it.id}-${clampSpan(it.span)}`);

export function decodeLayout(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const m = /^([a-z][a-z0-9]*)-(\d{1,2})$/.exec(String(raw));
    if (m) out.push({ id: m[1], span: clampSpan(m[2]) });
  }
  return out;
}

// Spojí uložené rozvržení s výchozím: neznámé widgety zahodí, nové (přibyly ve verzi) přidá
// na konec s výchozí šířkou. Pořadí a šířky známých widgetů zůstávají, jak je uživatel nechal.
export function mergeLayout(saved, defaults) {
  const known = new Map(defaults.map((d) => [d.id, d]));
  const seen = new Set();
  const out = [];
  for (const it of saved) {
    if (!known.has(it.id) || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push({ id: it.id, span: it.span });
  }
  for (const d of defaults) if (!seen.has(d.id)) out.push({ id: d.id, span: d.span });
  return out;
}

// Šířka, na kterou se při tažení za okraj přichytí: celé sloupce, mezi MIN_SPAN a 12.
export function spanFromWidth(px, colWidth, gap) {
  if (!(colWidth > 0)) return COLS;
  return clampSpan((px + gap) / (colWidth + gap));
}
