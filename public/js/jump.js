// Skok na konkrétní kartu v Nastavení odkudkoli (průvodce, první kroky, „Co je nového“).
// Cíl se předá přes sessionStorage, protože Nastavení se vykreslí až po změně adresy.
const KEY = 'agenteeq.jump';

export function goToExtension() {
  try { sessionStorage.setItem(KEY, 'extension'); } catch { /* bez úložiště jen otevře Nastavení */ }
  if (location.hash.startsWith('#/nastaveni')) window.dispatchEvent(new Event('agenteeq-jump'));
  else location.hash = '#/nastaveni';
}

export function takeJump() {
  try {
    const target = sessionStorage.getItem(KEY);
    if (target) sessionStorage.removeItem(KEY);
    return target;
  } catch {
    return null;
  }
}
