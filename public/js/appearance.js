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

export function applyAppearance(value, { persist = false, forceNotify = false } = {}) {
  preference = normalizeAppearance(value);
  const theme = resolvedAppearance(preference);
  const root = document.documentElement;
  const changed = root.dataset.appearance !== preference || root.dataset.theme !== theme;
  root.dataset.appearance = preference;
  root.dataset.theme = theme;
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
