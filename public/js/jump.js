// Skok na konkrétní místo odkudkoli: na kartu (a přepínač) v Nastavení, nebo na sekci jiné stránky
// (vyhledávání ⌘K, průvodce, první kroky, „Co je nového“). Cíl se předá přes sessionStorage,
// protože stránka se vykreslí až po změně adresy.
import { skocNa } from './plynule-posouvani.js';

const KEY = 'agenteeq.jump';
const KEY_SEKCE = 'agenteeq.jump.sekce';

const uloz = (klic, hodnota) => {
  try { sessionStorage.setItem(klic, hodnota); return true; } catch { return false; }
};
const vezmi = (klic) => {
  try {
    const hodnota = sessionStorage.getItem(klic);
    if (hodnota) sessionStorage.removeItem(klic);
    return hodnota;
  } catch {
    return null;
  }
};

// `karta` je data-region karty v Nastavení (extension, moje…), `prepinac` volitelně data-setting
// přepínače v ní (quietHours…), na který se přesune fokus.
export function goToSettings(karta, prepinac = '') {
  uloz(KEY, prepinac ? `${karta}#${prepinac}` : karta);
  if (location.hash.startsWith('#/nastaveni')) window.dispatchEvent(new Event('agenteeq-jump'));
  else location.hash = '#/nastaveni';
}

export const goToExtension = () => goToSettings('extension');

/** Cíl skoku v Nastavení: { karta, prepinac }, nebo null. */
export function takeJump() {
  const cil = vezmi(KEY);
  if (!cil) return null;
  const [karta, prepinac = ''] = cil.split('#');
  return { karta, prepinac };
}

/**
 * Skok na sekci stránky mimo Nastavení: `route` je adresa stránky (#/statistiky), `region`
 * hodnota data-region sekce, `klik` volitelně tlačítko, které se po příchodu stiskne (dialog).
 * Když už stránka je otevřená, skočí se hned; jinak až po vykreslení (app.js volá provedSkok).
 */
export function goToSection(route, region, klik = '') {
  uloz(KEY_SEKCE, JSON.stringify({ route, region, klik }));
  if (location.hash === route) window.dispatchEvent(new Event('agenteeq-jump-sekce'));
  else location.hash = route;
}

/** Nevyřízený skok na sekci pro právě otevřenou stránku (jinak se zahodí). */
export function takeSectionJump(route) {
  const raw = vezmi(KEY_SEKCE);
  if (!raw) return null;
  try {
    const cil = JSON.parse(raw);
    return cil?.route === route ? cil : null;
  } catch {
    return null;
  }
}

/**
 * Přivede místo na začátek viditelné plochy a krátce ho zvýrazní (styles.css `.is-called-out`).
 * Odstup se neodhaduje: vychází ze skutečné spodní hrany lepivé horní lišty. Díky tomu sekce po
 * přechodu z hledání nezačne pod ní ani zbytečně nízko. Pulz začne až po dojetí posunu; při delší
 * cestě tedy nikdy neproběhne mimo zorné pole. `fokus` dostane fokus bez dalšího posunu, aby
 * čtečka obrazovky i klávesnice pokračovaly odtud – ne však, když člověk právě píše do pole mimo
 * cíl.
 */
export function vyvolejMisto(misto, fokus = null) {
  if (!misto) return;
  const instant = document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lista = document.querySelector('.topbar');
  const rect = lista?.getBoundingClientRect();
  // Lišta může být při pohybu schovaná transformací. Jen opravdu viditelná část smí zabrat místo.
  const podListou = rect && rect.bottom > 0 && rect.top < innerHeight ? Math.max(24, Math.ceil(rect.bottom + 24)) : 24;
  const top = Math.max(0, window.scrollY + misto.getBoundingClientRect().top - podListou);
  const zvyrazni = () => {
    misto.classList.remove('is-called-out');
    void misto.offsetWidth;
    misto.classList.add('is-called-out');
    if (!pisePrave(misto)) fokus?.focus({ preventScroll: true });
  };
  if (instant) skocNa(top);
  else window.scrollTo({ top, behavior: 'smooth' });
  if (instant) { zvyrazni(); return; }

  const maximum = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const deadline = performance.now() + 1400;
  const poDojedu = () => {
    // Při spodním kraji stránky nemůže cíl ležet přesně na vypočtené souřadnici; maximum je tam
    // správný a jediný možný konec. Jinak čekáme, až se horní hrana cíle skutečně usadí.
    const poloha = misto.getBoundingClientRect().top;
    const usazeno = Math.abs(poloha - podListou) <= 3 || window.scrollY >= maximum() - 1;
    if (usazeno || performance.now() >= deadline) { zvyrazni(); return; }
    requestAnimationFrame(poDojedu);
  };
  requestAnimationFrame(poDojedu);
}

/** Píše teď člověk do pole mimo `oblast`? Pak mu fokus nikdo nebere (přechod stránky, zvýraznění). */
export function pisePrave(oblast = null) {
  const a = document.activeElement;
  return Boolean(a && !oblast?.contains(a) && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
}
