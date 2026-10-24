import { esc } from './format.js';
import { tr } from './i18n.js';
import { state } from './state.js';
import { ICON } from './icons.js';
import { robot, ROBOT_TYPES } from './robot-svg.js';
import { WARDROBE, SLOTS, normalizeLook, pickLook, renderWardrobe } from './robot-wardrobe.js';

export const PERSONA_KEY = 'agenteeq:agent-personas:v1';
// Paleta postav. První čtyři barvy a první čtyři postavy jsou výchozí výběr pro agenty bez vlastní volby: jejich
// pořadí se nemění, aby agent bez uložené volby nezměnil vzhled po aktualizaci.
const BARVY = [
  ['#6260d8', () => tr('Indigo')], ['#367b68', () => tr('Šalvěj')], ['#a85c44', () => tr('Terakota')], ['#92609a', () => tr('Orchidej')],
  ['#2f7fd6', () => tr('Azurová')], ['#1f9aa0', () => tr('Tyrkysová')], ['#4fbf9f', () => tr('Mátová')], ['#7a9a2e', () => tr('Olivová')],
  ['#d9a53a', () => tr('Medová')], ['#e07a2e', () => tr('Mandarinková')], ['#c23a5a', () => tr('Malinová')], ['#e06aa0', () => tr('Růžová')],
  ['#6b3f8c', () => tr('Švestková')], ['#2b3a8c', () => tr('Půlnoční')], ['#4a4f63', () => tr('Grafitová')], ['#b59a78', () => tr('Písková')],
];
export const PERSONA_COLORS = BARVY.map(([c]) => c);
export const PERSONA_AVATARS = ROBOT_TYPES;
const DEFAULT_COUNT = 4;

// Robot s oblečením. `look` je buď uložená volba ({hat, face, outfit, costume}), nebo starý
// text „accessory“ z dřívější verze. Robot samotný se nepřeškálovává ani nemění.
export function renderAgentRobot(type, look = 'none', kusy) {
  const kind = PERSONA_AVATARS.includes(type) ? type : PERSONA_AVATARS[0];
  return renderWardrobe(robot(kind, kusy), look);
}
export function loadPersonas() {
  try {
    const saved = JSON.parse(localStorage.getItem(PERSONA_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

// Agent bez vlastní volby má robota i barvu odvozené z id. Dialog z nich vychází, aby po otevření
// ukazoval to, co agent právě má, a ne vždycky první možnost.
export function defaultPersona(id) {
  const index = [...String(id)].reduce((n, c) => n + c.charCodeAt(0), 0) % DEFAULT_COUNT;
  return { avatar: PERSONA_AVATARS[index], color: PERSONA_COLORS[index] };
}

// Postava a barva jsou záložky jako šatník: dlaždice ukazují robota přesně tak, jak bude vypadat –
// každá postava v tom, co má agent na sobě, každá barva na zvolené postavě.
const TABS = [
  { slot: 'avatar', label: () => tr('Postava') },
  { slot: 'color', label: () => tr('Barva') },
  { slot: 'hat', label: () => tr('Hlava'), none: () => tr('Bez čepice') },
  { slot: 'face', label: () => tr('Obličej'), none: () => tr('Bez doplňku') },
  { slot: 'outfit', label: () => tr('Oblečení'), none: () => tr('Bez oblečení') },
  { slot: 'costume', label: () => tr('Převleky'), none: () => tr('Bez převleku') },
];
const COLOR_NAMES = () => BARVY.map(([, name]) => name());
const NONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M6.3 17.7 17.7 6.3"/></svg>';

export function editAgentAppearance(id, { onSaved = () => {} } = {}) {
  const agent = state.sessions.get(id);
  if (!agent) return false;
  const saved = loadPersonas();
  const p = saved[id] || {};
  const fallback = defaultPersona(id);
  const choice = {
    name: String(p.name || '').slice(0, 32),
    avatar: PERSONA_AVATARS.includes(p.avatar) ? p.avatar : fallback.avatar,
    color: PERSONA_COLORS.includes(p.color) ? p.color : fallback.color,
    look: normalizeLook(p),
  };
  let tab = 'avatar';

  const dialog = document.createElement('dialog');
  dialog.className = 'studio-dialog studio-dialog--single';
  dialog.setAttribute('aria-labelledby', 'look-title');
  const tile = (attrs, robotHtml, label, extra = '') =>
    '<button type="button" class="look-tile" ' + attrs + ' aria-pressed="false"' + extra + '>' + robotHtml + '<span>' + esc(label) + '</span></button>';
  dialog.innerHTML = '<form class="look-form"><div class="look-grip" aria-hidden="true"></div><div class="look-scroll">' +
    '<header class="look-head"><div><p class="look-eyebrow">' + tr('Vzhled agenta') + '</p><h2 id="look-title">' + esc(agent.title || agent.app || tr('Agent')) + '</h2></div>' +
    '<button type="button" class="icon-btn icon-btn--line" data-close aria-label="' + tr('Zavřít') + '">' + ICON.close + '</button></header>' +
    '<div class="look-body"><div class="look-left">' +
    '<div class="look-stage studio-preview" role="status" aria-live="polite"></div>' +
    '<label class="look-name">' + tr('Vlastní jméno') + '<input name="nickname" maxlength="32" autocomplete="off"></label>' +
    '</div>' +
    '<div class="look-right"><div class="look-tabs" role="tablist" aria-label="' + tr('Vzhled robota') + '">' +
    TABS.map((t) => '<button type="button" class="look-tab" role="tab" id="look-tab-' + t.slot + '" aria-controls="look-grid" data-tab="' + t.slot + '">' + esc(t.label()) + '</button>').join('') +
    '</div><div class="look-grid" id="look-grid" role="tabpanel"></div></div></div></div>' +
    '<footer><button type="button" class="btn btn--sm look-reset" data-reset>' + tr('Obnovit výchozí') + '</button>' +
    '<span class="muted small" data-error role="status"></span>' +
    '<button class="btn btn--primary btn--ack" type="submit">' + tr('Uložit vzhled') + '</button></footer></form>';
  document.body.append(dialog);

  const form = dialog.querySelector('form');
  const nickname = form.elements.namedItem('nickname');
  nickname.value = choice.name;
  nickname.placeholder = agent.app || tr('Agent');
  const stage = dialog.querySelector('.look-stage');
  const grid = dialog.querySelector('.look-grid');
  const worn = (look) => renderAgentRobot(choice.avatar, look);

  const drawGrid = () => {
    const t = TABS.find((x) => x.slot === tab);
    grid.setAttribute('aria-labelledby', 'look-tab-' + tab);
    grid.dataset.slot = tab;
    if (tab === 'avatar') {
      grid.innerHTML = PERSONA_AVATARS.map((a) => tile('data-pick="avatar" data-value="' + a + '"', '<span class="studio-avatar">' + renderAgentRobot(a, choice.look) + '</span>', a)).join('');
      return;
    }
    if (tab === 'color') {
      grid.innerHTML = PERSONA_COLORS.map((c, i) => tile('data-pick="color" data-value="' + c + '" style="--persona:' + c + '"',
        '<span class="studio-avatar">' + worn(choice.look) + '</span>', COLOR_NAMES()[i])).join('');
      return;
    }
    const items = [['none', t.none()], ...Object.entries(WARDROBE[tab]).map(([key, def]) => [key, def.label()])];
    grid.setAttribute('aria-labelledby', 'look-tab-' + tab);
    grid.innerHTML = items.map(([key, label]) => {
      // Dlaždice ukazuje robota přesně v tom, co by po kliknutí měl na sobě.
      const robotHtml = key === 'none' && tab !== 'costume' && choice.look[tab] === 'none'
        ? '<span class="look-tile-none">' + NONE_ICON + '</span>'
        : '<span class="studio-avatar">' + worn(pickLook(choice.look, tab, key)) + '</span>';
      return tile('data-pick="' + tab + '" data-value="' + esc(key) + '"', robotHtml, label);
    }).join('');
  };
  const redraw = ({ grid: again = true } = {}) => {
    dialog.style.setProperty('--persona', choice.color);
    for (const control of dialog.querySelectorAll('[data-tab]')) {
      const on = control.dataset.tab === tab;
      control.setAttribute('aria-selected', String(on));
      control.tabIndex = on ? 0 : -1;
      if (on) control.scrollIntoView?.({ inline: 'center', block: 'nearest' });
    }
    stage.innerHTML = '<span class="studio-avatar">' + worn(choice.look) + '</span><span class="look-stage-name">' +
      esc(nickname.value.trim() || agent.app || tr('Agent')) + '</span>';
    if (again) drawGrid();
    for (const control of dialog.querySelectorAll('[data-pick]')) {
      const slot = control.dataset.pick;
      const selected = slot === 'avatar' ? choice.avatar === control.dataset.value
        : slot === 'color' ? choice.color === control.dataset.value
          : choice.look[slot] === control.dataset.value;
      control.setAttribute('aria-pressed', String(selected));
    }
  };

  form.addEventListener('click', (e) => {
    const tabButton = e.target.closest('[data-tab]');
    if (tabButton) { tab = tabButton.dataset.tab; redraw(); return; }
    if (e.target.closest('[data-reset]')) {
      Object.assign(choice, { name: '', ...fallback, look: normalizeLook(null) });
      nickname.value = '';
      redraw();
      return;
    }
    const button = e.target.closest('button[data-pick]');
    if (!button) return;
    const slot = button.dataset.pick;
    if (slot === 'avatar' || slot === 'color') choice[slot] = button.dataset.value;
    else choice.look = pickLook(choice.look, slot, button.dataset.value);
    redraw();
  });
  // Šipky přepínají záložky (WAI-ARIA tabs); Tab pak skočí rovnou do mřížky.
  dialog.querySelector('.look-tabs').addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const at = TABS.findIndex((t) => t.slot === tab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (at + step + TABS.length) % TABS.length;
    tab = TABS[next].slot;
    redraw();
    dialog.querySelector('#look-tab-' + tab).focus();
  });
  nickname.addEventListener('input', () => redraw({ grid: false }));
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  // Kliknutí mimo okno ho zavře. Počítá se jen, když stisk i uvolnění myši proběhly venku: výběr textu
  // v poli jména, který skončí za okrajem, ho zavřít nesmí.
  const uvnitr = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  let stiskVenku = false;
  dialog.addEventListener('pointerdown', (e) => { stiskVenku = !uvnitr(e); });
  dialog.addEventListener('click', (e) => { if (stiskVenku && !uvnitr(e)) dialog.close(); stiskVenku = false; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saved[id] = { name: nickname.value.trim(), avatar: choice.avatar, color: choice.color, ...choice.look };
    try { localStorage.setItem(PERSONA_KEY, JSON.stringify(saved)); }
    catch { dialog.querySelector('[data-error]').textContent = tr('Vzhled se nepodařilo uložit.'); return; }
    dialog.close();
    onSaved();
  });
  // Telefon: tah za úchyt dolů zavře spodní list. Myš ho netahá (má tlačítko ✕, Esc a klik mimo).
  const grip = dialog.querySelector('.look-grip');
  let tahY = null;
  const pust = () => { tahY = null; dialog.style.transition = ''; dialog.style.transform = ''; };
  grip.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    tahY = e.clientY;
    dialog.style.transition = 'none';
    try { grip.setPointerCapture(e.pointerId); } catch { /* syntetická událost nebo už uvolněný ukazatel */ }
  });
  grip.addEventListener('pointermove', (e) => {
    if (tahY == null) return;
    dialog.style.transform = 'translateY(' + Math.max(0, e.clientY - tahY) + 'px)';
  });
  grip.addEventListener('pointerup', (e) => {
    if (tahY == null) return;
    const dy = e.clientY - tahY;
    pust();
    if (dy > 90) dialog.close();
  });
  grip.addEventListener('pointercancel', pust);
  // Stránka pod oknem se nesmí hýbat (iOS ji jinak roluje i za modálním oknem).
  document.documentElement.classList.add('look-open');
  dialog.addEventListener('close', () => { document.documentElement.classList.remove('look-open'); dialog.remove(); }, { once: true });
  redraw();
  dialog.showModal();
  return true;
}
