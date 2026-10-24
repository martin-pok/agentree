import { tr } from './i18n.js';
import { esc } from './format.js';

// Řada čipů, která se nikdy nevodorovně neposouvá a nezvyšuje (řádek Projekt na Agentech).
// Co se do šířky nevejde, schová se do čipu „+N“ na konci; ten otevře nabídku se schovanými čipy
// (stejná nabídka jako u výběrů, .picker-menu). První čip („Všechny“) a právě vybraný zůstávají
// vidět vždy – uživatel tak pořád vidí, co má zvolené. Položka nabídky jen klepne na skutečný
// (schovaný) čip, takže filtr, počty i přetažení konverzace na projekt fungují jako dřív.
//
// Šablona řady musí obsahovat na konci `<button class="chip" data-dalsi hidden>`. Volá se po každém
// vykreslení řady (živé sloučení schovávání smaže) a sama se přepočítá při změně šířky.

const MEZERA = 8;
const sledovane = new WeakMap();
let otevrena = null;

function zavri(vratitFokus = false) {
  if (!otevrena) return;
  const { menu, tlacitko, konec } = otevrena;
  otevrena = null;
  konec.abort();
  menu.remove();
  tlacitko.setAttribute('aria-expanded', 'false');
  if (vratitFokus && tlacitko.isConnected) tlacitko.focus();
}

function otevri(rada, tlacitko) {
  if (otevrena?.tlacitko === tlacitko) { zavri(); return; }
  zavri();
  const schovane = [...rada.querySelectorAll('.chip[data-skryto]')];
  const menu = document.createElement('div');
  menu.className = 'picker-menu chips-dalsi-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', tlacitko.getAttribute('aria-label') || '');
  menu.setAttribute('popover', 'manual');
  menu.innerHTML = schovane.map((c, i) => {
    const pretazeni = c.dataset.projectDrop ? ` data-project-drop="${esc(c.dataset.projectDrop)}"` : '';
    return `<button type="button" class="picker-option chips-dalsi-polozka" role="menuitem" data-i="${i}"${pretazeni}>${c.innerHTML}</button>`;
  }).join('');
  document.body.append(menu);
  menu.showPopover?.();
  const r = tlacitko.getBoundingClientRect();
  const sirka = Math.min(Math.max(220, r.width), innerWidth - 24);
  menu.style.width = `${sirka}px`;
  menu.style.left = `${Math.max(12, Math.min(r.right - sirka, innerWidth - sirka - 12))}px`;
  const dole = innerHeight - r.bottom - 16;
  menu.style.maxHeight = `${Math.max(120, Math.min(360, Math.max(dole, r.top - 16)))}px`;
  menu.style.top = `${dole >= Math.min(menu.scrollHeight, 240) || dole >= r.top ? r.bottom + 6 : Math.max(8, r.top - menu.offsetHeight - 6)}px`;
  tlacitko.setAttribute('aria-expanded', 'true');
  const konec = new AbortController();
  otevrena = { menu, tlacitko, konec };
  const polozky = () => [...menu.querySelectorAll('.chips-dalsi-polozka')];
  menu.addEventListener('click', (e) => {
    const p = e.target.closest('.chips-dalsi-polozka');
    if (!p) return;
    const cil = schovane[Number(p.dataset.i)];
    zavri();
    cil?.click();
    tlacitko.focus();
  }, { signal: konec.signal });
  menu.addEventListener('keydown', (e) => {
    const vse = polozky();
    const i = vse.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); zavri(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); vse[(i + 1) % vse.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); vse[(i - 1 + vse.length) % vse.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); vse[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); vse.at(-1)?.focus(); }
    else if (e.key === 'Tab') zavri();
  }, { signal: konec.signal });
  document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && !tlacitko.contains(e.target)) zavri(); }, { signal: konec.signal, capture: true });
  addEventListener('resize', () => zavri(), { signal: konec.signal });
  addEventListener('scroll', (e) => { if (!menu.contains(e.target)) zavri(); }, { signal: konec.signal, capture: true, passive: true });
  polozky()[0]?.focus({ preventScroll: true });
}

export function skladejCipy(rada) {
  if (!rada) return;
  const dalsi = rada.querySelector('[data-dalsi]');
  if (!dalsi) return;
  const cipy = [...rada.querySelectorAll('.chip:not([data-dalsi])')];
  for (const c of cipy) { c.hidden = false; delete c.dataset.skryto; }
  dalsi.hidden = true;
  if (!sledovane.has(rada)) {
    let snimek = 0;
    // Řada, kterou mezitím vyměnila živá aktualizace, odpojí pozorovatele sama (zastavSkladani
    // vidí jen řady, které na stránce zrovna jsou).
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(snimek);
      if (!rada.isConnected) { sledovane.get(rada)?.(); sledovane.delete(rada); return; }
      snimek = requestAnimationFrame(() => { if (rada.isConnected) skladejCipy(rada); });
    });
    observer.observe(rada);
    const klik = () => otevri(rada, dalsi);
    dalsi.addEventListener('click', klik);
    sledovane.set(rada, () => { observer.disconnect(); cancelAnimationFrame(snimek); dalsi.removeEventListener('click', klik); });
  }
  const k = getComputedStyle(rada);
  const misto = rada.clientWidth - parseFloat(k.paddingLeft) - parseFloat(k.paddingRight);
  const sirky = cipy.map((c) => c.getBoundingClientRect().width);
  const celkem = sirky.reduce((a, w) => a + w, 0) + MEZERA * Math.max(0, cipy.length - 1);
  if (!misto || celkem <= misto) return;
  // Napřed odhad čipu „+N“ (dvě číslice), pak plnění zleva: první a vybraný čip mají přednost.
  dalsi.hidden = false;
  dalsi.textContent = '+00';
  const sirkaDalsi = dalsi.getBoundingClientRect().width;
  const pevne = new Set(cipy.filter((c, i) => i === 0 || c.getAttribute('aria-pressed') === 'true'));
  let zbyva = misto - sirkaDalsi - MEZERA;
  for (const c of pevne) zbyva -= sirky[cipy.indexOf(c)] + MEZERA;
  const vidim = new Set(pevne);
  cipy.forEach((c, i) => {
    if (vidim.has(c)) return;
    if (sirky[i] + MEZERA <= zbyva) { vidim.add(c); zbyva -= sirky[i] + MEZERA; }
    else zbyva = -Infinity; // pořadí se nepřeskakuje: po prvním, který se nevejde, už žádný další
  });
  const schovane = cipy.filter((c) => !vidim.has(c));
  for (const c of schovane) { c.hidden = true; c.dataset.skryto = ''; }
  dalsi.textContent = `+${schovane.length}`;
  dalsi.setAttribute('aria-label', tr('Další ({0})', schovane.length));
  dalsi.setAttribute('aria-haspopup', 'menu');
  dalsi.setAttribute('aria-expanded', otevrena?.tlacitko === dalsi ? 'true' : 'false');
}

// Při opuštění Agentů nesmí ResizeObserver držet staré řádky a jejich podstromy.
export function zastavSkladani(root) {
  zavri();
  for (const rada of root?.querySelectorAll('.chips--sklada') || []) {
    sledovane.get(rada)?.();
    sledovane.delete(rada);
  }
}
