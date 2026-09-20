import { state, emit } from './state.js';
import { api } from './api.js';
import { toast } from './ui.js';

// Uživatelské pořadí karet (tažením). Ukládá se na server do nastavení, takže přežije zavření
// aplikace i přeinstalování; pořadí se drží jen pro karty, které uživatel viděl.

export const GRIP = '<span class="grip" data-grip aria-hidden="true" title="Přetáhni pro změnu pořadí"><i></i><i></i><i></i><i></i><i></i><i></i></span>';

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

export async function saveOrder(name, ids) {
  const layout = { ...(state.settings?.layout || {}), [name]: ids };
  if (state.settings) state.settings = { ...state.settings, layout };
  try {
    await api.saveSettings({ layout: { [name]: ids } });
  } catch (err) {
    toast(`Pořadí karet se neuložilo: ${err.message}`, { tone: 'err' });
  }
}

export async function resetLayout() {
  const names = Object.keys(state.settings?.layout || {});
  if (!names.length) return;
  if (state.settings) state.settings = { ...state.settings, layout: {} };
  emit('settings');
  await api.saveSettings({ layout: Object.fromEntries(names.map((n) => [n, null])) });
}
