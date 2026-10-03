const KEY = 'agenteeq.appearance';
const VALID = new Set(['light', 'dark', 'system']);
const media = window.matchMedia('(prefers-color-scheme: dark)');
let preference = 'light';

export function normalizeAppearance(value) {
  return VALID.has(value) ? value : 'light';
}

export function resolvedAppearance(value = preference) {
  const mode = normalizeAppearance(value);
  return mode === 'dark' || (mode === 'system' && media.matches) ? 'dark' : 'light';
}

function notifyDesktop(theme) {
  try {
    window.webkit?.messageHandlers?.agenteeq?.postMessage({ type: 'appearance', theme });
  } catch { /* prohlížeč bez macOS bridge */ }
}

// Změna motivu je jeden okamžitý a soudržný krok. Dřív se část prvků (ty s transition) prolínala
// 180 ms a zbytek přeskočil hned: rozhraní se na okamžik rozpadlo na dvě barevnosti a WebKit
// v každém snímku přepočítával celou stránku (snímek až 86 ms). Po dobu změny jsou proto přechody
// prvků vypnuté (html.meni-motiv) a nové barvy naskočí naráz – stejně jako v macOS.
// Prolnutí přes View Transitions jsme zkusili a zavrhli: WebKit při odrolované stránce skládal
// snímky posunuté a zdvojené.
const POJISTKA_MS = 600;
function zmenMotiv(root, nastav) {
  root.classList.add('meni-motiv');
  nastav();
  const hotovo = () => root.classList.remove('meni-motiv');
  // Třída musí vydržet aspoň jeden výpočet stylu s novými barvami, jinak by se přechody spustily.
  // Skryté okno rAF nevolá – proto pojistka časovačem.
  requestAnimationFrame(() => requestAnimationFrame(hotovo));
  setTimeout(hotovo, POJISTKA_MS);
}

export function applyAppearance(value, { persist = false, forceNotify = false } = {}) {
  preference = normalizeAppearance(value);
  const theme = resolvedAppearance(preference);
  const root = document.documentElement;
  const changed = root.dataset.appearance !== preference || root.dataset.theme !== theme;
  const nastav = () => {
    root.dataset.appearance = preference;
    root.dataset.theme = theme;
  };
  if (root.dataset.theme !== theme) zmenMotiv(root, nastav);
  else nastav();
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme === 'dark' ? 'dark light' : 'light dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c0b10' : '#121019');
  if (persist) {
    try { localStorage.setItem(KEY, preference); } catch { /* preference se dál drží na serveru */ }
  }
  if (changed || forceNotify) notifyDesktop(theme);
  return { preference, theme };
}

export function initAppearance() {
  // Bootstrap mohl správný režim nastavit dřív než se načte modul; native chrome
  // ale musí dostat stejnou hodnotu i v tom případě.
  preference = normalizeAppearance(document.documentElement.dataset.appearance);
  applyAppearance(preference, { forceNotify: true });
  media.addEventListener('change', () => {
    if (preference === 'system') applyAppearance(preference);
  });
}
