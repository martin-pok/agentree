import { state, emit } from './state.js';
import { api } from './api.js';
import { toast } from './ui.js';
import { tr } from './i18n.js';

// Uživatelské pořadí karet (tažením). Ukládá se na server do nastavení, takže přežije zavření
// aplikace i přeinstalování; pořadí se drží jen pro karty, které uživatel viděl.

export const GRIP = `<button class="widget-grip grip" type="button" data-grip aria-label="${tr('Přesunout kartu. Alt a šipky mění pořadí.')}" title="${tr('Přetáhni pro změnu pořadí')}"><i></i><i></i><i></i><i></i><i></i><i></i></button>`;

export const savedOrder = (name) => state.settings?.layout?.[name] || [];

// Přeuspořádá děti kontejneru podle uloženého pořadí; karty, které v uložení nejsou, zůstanou
// v původním pořadí za nimi. Nesahá na DOM, když je pořadí už správně.
export function applyOrder(box, itemSelector, name) {
  const ids = savedOrder(name);
  if (!box || !ids.length) return;
  const items = [...box.querySelectorAll(`:scope > ${itemSelector}`)];
  const rank = (el) => { const i = ids.indexOf(el.dataset.card); return i < 0 ? 1e6 : i; };
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || items.indexOf(a) - items.indexOf(b));
  if (sorted.some((el, i) => el !== items[i])) for (const el of sorted) box.append(el);
}

// Pořadí se ukáže hned (karta už leží, kam ji uživatel pustil). Když se uložení nepovede,
// vrátí se uložené pořadí i na obrazovce – jinak by okno ukazovalo něco, co po restartu zmizí.
export async function saveOrder(name, ids) {
  const predtim = state.settings?.layout;
  const layout = { ...(predtim || {}), [name]: ids };
  if (state.settings) state.settings = { ...state.settings, layout };
  try {
    await api.saveSettings({ layout: { [name]: ids } });
  } catch (err) {
    if (state.settings) state.settings = { ...state.settings, layout: predtim };
    emit('settings');
    toast(`${tr('Pořadí karet se neuložilo:')} ${err.message}`, { tone: 'err' });
  }
}

// Výchozí pořadí platí až po úspěšném uložení; chybu převezme volající (Nastavení ji ukáže).
export async function resetLayout() {
  const names = Object.keys(state.settings?.layout || {});
  if (!names.length) return;
  await api.saveSettings({ layout: Object.fromEntries(names.map((n) => [n, null])) });
  if (state.settings) state.settings = { ...state.settings, layout: {} };
  emit('settings');
}
