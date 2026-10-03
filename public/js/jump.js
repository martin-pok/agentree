// Skok na konkrétní kartu v Nastavení odkudkoli (průvodce, první kroky, „Co je nového“).
// Cíl se předá přes sessionStorage, protože Nastavení se vykreslí až po změně adresy.
const KEY = 'agenteeq.jump';

// `karta` je data-region karty v Nastavení (extension, moje…).
export function goToSettings(karta) {
  try { sessionStorage.setItem(KEY, karta); } catch { /* bez úložiště jen otevře Nastavení */ }
  if (location.hash.startsWith('#/nastaveni')) window.dispatchEvent(new Event('agenteeq-jump'));
  else location.hash = '#/nastaveni';
}

export const goToExtension = () => goToSettings('extension');

export function takeJump() {
  try {
    const target = sessionStorage.getItem(KEY);
    if (target) sessionStorage.removeItem(KEY);
    return target;
  } catch {
    return null;
  }
}
