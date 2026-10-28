// Skok na konkrétní místo odkudkoli: na kartu (a přepínač) v Nastavení, nebo na sekci jiné stránky
// (vyhledávání ⌘K, průvodce, první kroky, „Co je nového“). Cíl se předá přes sessionStorage,
// protože stránka se vykreslí až po změně adresy.
import { skocNa } from './plynule-posouvani.js';

const KEY = 'agenteeq.jump';
const KEY_SEKCE = 'agenteeq.jump.sekce';
let zrusDoskok = () => {};
const zvyrTimers = new WeakMap();

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
 * okna nebo omezeného pohybu se skočí okamžitě. Odsazení vychází ze skutečné výšky horní lišty,
 * aby nadpis sekce nebyl schovaný ani v úzkém okně. `fokus` dostane fokus
 * bez dalšího posunu, aby čtečka obrazovky i klávesnice pokračovaly odtud – ne však, když člověk
 * právě píše do pole mimo cíl.
 */
export function vyvolejMisto(misto, fokus = null) {
  if (!misto) return;
  zrusDoskok();
  zrusDoskok = () => {};
  const instant = document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const polohuj = () => {
    const lista = document.querySelector('.topbar');
    const odsazeni = Math.max(96, lista?.getBoundingClientRect().bottom + 12 || 0);
    return Math.max(0, window.scrollY + misto.getBoundingClientRect().top - odsazeni);
  };
  const top = polohuj();
  if (instant) skocNa(top);
  else {
    window.scrollTo({ top, behavior: 'smooth' });
    // Živá data mohou změnit výšku karet během plynulého posunu. Po dojezdu srovnat cíl
    // přesně pod lištu; jakýkoli vlastní pohyb uživatele tuto korekci okamžitě zruší.
    const stop = new AbortController();
    const timer = setTimeout(() => {
      stop.abort();
      if (misto.isConnected && Math.abs(polohuj() - window.scrollY) > 3) skocNa(polohuj());
    }, 850);
    zrusDoskok = () => { clearTimeout(timer); stop.abort(); };
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
      window.addEventListener(event, zrusDoskok, { passive: true, once: true, signal: stop.signal });
    }
  }
  misto.classList.remove('is-called-out');
  void misto.offsetWidth;
  misto.classList.add('is-called-out');
  clearTimeout(zvyrTimers.get(misto));
  zvyrTimers.set(misto, setTimeout(() => {
    misto.classList.remove('is-called-out');
    zvyrTimers.delete(misto);
  }, 1900));
  // Kdo mezitím píše jinde (třeba další dotaz pomocníkovi), tomu fokus neukrade: Enter by jinak
  // dopadl na zvýrazněný přepínač a přepnul ho.
  if (!pisePrave(misto)) fokus?.focus({ preventScroll: true });
}

/** Píše teď člověk do pole mimo `oblast`? Pak mu fokus nikdo nebere (přechod stránky, zvýraznění). */
export function pisePrave(oblast = null) {
  const a = document.activeElement;
  // WebKit may retain focus in a palette input after its root becomes hidden.
  // A hidden or inert input cannot represent ongoing typing and must not block the destination.
  if (!a || a.closest?.('[hidden], [inert]')) return false;
  const textovePole = a.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color|file|hidden)$/i.test(a.type || 'text');
  return Boolean(!oblast?.contains(a) && (a.isContentEditable || textovePole || /^(TEXTAREA|SELECT)$/.test(a.tagName)));
}
