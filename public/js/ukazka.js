// Ukázkový režim: prohlídka na webu (site/lp.js vkládá /app?ukazka do rámu) ukazuje skutečné
// rozhraní nad smyšlenými daty. Zapíná se jen na statické kopii rozhraní na webu – u sebe na Macu
// ho nikdo nepotká. Data vznikají při sestavení webu (scripts/ukazka-data.mjs), takže vždy sedí na
// aktuální kód; časy se tu posunou na „teď“, aby „před 2 min“ neznamenalo před týdnem.
import { zapniUkazku } from './api.js';

export const UKAZKA_DATA = '/ukazka/data.json';
const ROK = 365 * 86400000;

// Posune každé časové razítko (ms od roku 1970) o `rozdil`. Za razítko se bere číslo v rozmezí
// roku kolem vzniku dat – počty tokenů, částky ani délky oken tak daleko nesahají.
export function posunCasy(hodnota, rozdil, vytvoreno) {
  if (typeof hodnota === 'number') return Math.abs(hodnota - vytvoreno) <= ROK ? hodnota + rozdil : hodnota;
  if (Array.isArray(hodnota)) return hodnota.map((x) => posunCasy(x, rozdil, vytvoreno));
  if (hodnota && typeof hodnota === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(hodnota)) out[k] = posunCasy(v, rozdil, vytvoreno);
    return out;
  }
  return hodnota;
}

// Rám kolem prohlídky potřebuje vědět, kdy je obrazovka vykreslená (s daty, s písmy), aby ji
// ukázal až hotovou a ne prázdnou kostru. Hlásí se jen vlastnímu původu.
function ohlasPripraveno() {
  if (window.parent === window) return;
  const hotovo = () => document.querySelector('#view > :not(.loader-wrap)') && !document.querySelector('#view .loader-wrap');
  const posli = () => document.fonts.ready.then(() => window.parent.postMessage({ typ: 'agenteeq:ukazka-pripravena' }, location.origin));
  if (hotovo()) return void posli();
  const mo = new MutationObserver(() => {
    if (!hotovo()) return;
    mo.disconnect();
    posli();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
}

export async function spustUkazku(fetchFn = fetch) {
  const res = await fetchFn(UKAZKA_DATA, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Ukázková data nejsou k dispozici (${res.status}).`);
  const { vytvoreno, odpovedi } = await res.json();
  zapniUkazku(posunCasy(odpovedi, Date.now() - vytvoreno, vytvoreno));
  document.documentElement.dataset.ukazka = '';
  // V rámu na webu čeká nástup obrazovky, až k ní návštěvník dojede (site/lp.js ho pak pustí).
  if (window.parent !== window) document.documentElement.setAttribute('data-nastup-stoji', '');
  ohlasPripraveno();
}
