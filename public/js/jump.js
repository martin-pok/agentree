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
 * Přivede místo na obrazovku a krátce ho zvýrazní (styles.css `.is-called-out`). Stránka má v CSS
 * `scroll-behavior: smooth`, takže `scrollIntoView` s 'auto' posouvá plynule – a v okně, které
 * zrovna nekreslí, se plynulý posun vůbec nerozběhne. Cíl se proto počítá přesně a u skrytého
 * okna nebo omezeného pohybu se skočí okamžitě. 96 px = místo pod lištou. `fokus` dostane fokus
 * bez dalšího posunu, aby čtečka obrazovky i klávesnice pokračovaly odtud – ne však, když člověk
 * právě píše do pole mimo cíl.
 */
export function vyvolejMisto(misto, fokus = null) {
  if (!misto) return;
  const instant = document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const top = Math.max(0, window.scrollY + misto.getBoundingClientRect().top - 96);
  if (instant) skocNa(top);
  else window.scrollTo({ top, behavior: 'smooth' });
  misto.classList.remove('is-called-out');
  void misto.offsetWidth;
  misto.classList.add('is-called-out');
  // Kdo mezitím píše jinde (třeba další dotaz pomocníkovi), tomu fokus neukrade: Enter by jinak
  // dopadl na zvýrazněný přepínač a přepnul ho.
  const aktivni = document.activeElement;
  const pise = aktivni && !misto.contains(aktivni) && (aktivni.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(aktivni.tagName));
  if (!pise) fokus?.focus({ preventScroll: true });
}
