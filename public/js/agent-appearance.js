import { esc } from './format.js';
import { tr } from './i18n.js';
import { state } from './state.js';
import { ICON } from './icons.js';
import { robot } from './robot-svg.js';
import { WARDROBE, SLOTS, normalizeLook, pickLook, renderWardrobe } from './robot-wardrobe.js';

export const PERSONA_KEY = 'agenteeq:agent-personas:v1';
export const PERSONA_COLORS = ['#6260d8', '#367b68', '#a85c44', '#92609a'];
export const PERSONA_AVATARS = ['Scout', 'Orbit', 'Pixel', 'Nova'];

// Robot s oblečením. `look` je buď uložená volba ({hat, face, outfit, costume}), nebo starý
// text „accessory“ z dřívější verze. Robot samotný se nepřeškálovává ani nemění.
export function renderAgentRobot(type, look = 'none') {
  const kind = PERSONA_AVATARS.includes(type) ? type : PERSONA_AVATARS[0];
  return renderWardrobe(robot(kind), look);
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
  const index = [...String(id)].reduce((n, c) => n + c.charCodeAt(0), 0) % PERSONA_COLORS.length;
  return { avatar: PERSONA_AVATARS[index], color: PERSONA_COLORS[index] };
}

const TABS = [
  { slot: 'hat', label: () => tr('Hlava'), none: () => tr('Bez čepice') },
  { slot: 'face', label: () => tr('Obličej'), none: () => tr('Bez doplňku') },
  { slot: 'outfit', label: () => tr('Oblečení'), none: () => tr('Bez oblečení') },
  { slot: 'costume', label: () => tr('Převleky'), none: () => tr('Bez převleku') },
];
const COLOR_NAMES = () => [tr('Indigo'), tr('Šalvěj'), tr('Terakota'), tr('Orchidej')];
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
  let tab = SLOTS.find((slot) => choice.look[slot] !== 'none') || 'hat';

  const dialog = document.createElement('dialog');
  dialog.className = 'studio-dialog studio-dialog--single';
  dialog.setAttribute('aria-labelledby', 'look-title');
  const tile = (attrs, robotHtml, label, extra = '') =>
    '<button type="button" class="look-tile" ' + attrs + ' aria-pressed="false"' + extra + '>' + robotHtml + '<span>' + esc(label) + '</span></button>';
  dialog.innerHTML = '<form class="look-form">' +
    '<header class="look-head"><div><p class="look-eyebrow">' + tr('Vzhled agenta') + '</p><h2 id="look-title">' + esc(agent.title || agent.app || tr('Agent')) + '</h2></div>' +
    '<button type="button" class="icon-btn icon-btn--line" data-close aria-label="' + tr('Zavřít') + '">' + ICON.close + '</button></header>' +
    '<div class="look-body"><div class="look-left">' +
    '<div class="look-stage studio-preview" role="status" aria-live="polite"></div>' +
    '<label class="look-name">' + tr('Vlastní jméno') + '<input name="nickname" maxlength="32" autocomplete="off"></label>' +
    '<fieldset class="look-set"><legend>' + tr('Podoba') + '</legend><div class="look-row look-row--robots">' +
    PERSONA_AVATARS.map((a) => tile('data-pick="avatar" data-value="' + a + '"', '<span class="studio-avatar" data-robot="' + a + '"></span>', a)).join('') +
    '</div></fieldset>' +
    '<fieldset class="look-set"><legend>' + tr('Barva') + '</legend><div class="look-row look-row--colors">' +
    PERSONA_COLORS.map((c, i) => '<button type="button" class="look-swatch" data-pick="color" data-value="' + c + '" style="--swatch:' + c +
      '" aria-pressed="false" aria-label="' + esc(COLOR_NAMES()[i]) + '" title="' + esc(COLOR_NAMES()[i]) + '">' + ICON.check + '</button>').join('') +
    '</div></fieldset></div>' +
    '<div class="look-right"><div class="look-tabs" role="tablist" aria-label="' + tr('Doplňky a oblečení') + '">' +
    TABS.map((t) => '<button type="button" class="look-tab" role="tab" id="look-tab-' + t.slot + '" aria-controls="look-grid" data-tab="' + t.slot + '">' + esc(t.label()) + '</button>').join('') +
    '</div><div class="look-grid" id="look-grid" role="tabpanel"></div></div></div>' +
    '<footer><button type="button" class="btn btn--sm look-reset" data-reset>' + tr('Obnovit výchozí') + '</button>' +
    '<span class="muted small" data-error role="status"></span>' +
    '<button class="btn btn--primary" type="submit">' + tr('Uložit vzhled') + '</button></footer></form>';
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
    for (const control of dialog.querySelectorAll('[data-pick]')) {
      const slot = control.dataset.pick;
      const selected = slot === 'avatar' ? choice.avatar === control.dataset.value
        : slot === 'color' ? choice.color === control.dataset.value
          : choice.look[slot] === control.dataset.value;
      control.setAttribute('aria-pressed', String(selected));
    }
    for (const el of dialog.querySelectorAll('[data-robot]')) el.innerHTML = renderAgentRobot(el.dataset.robot, 'none');
    for (const control of dialog.querySelectorAll('[data-tab]')) {
      const on = control.dataset.tab === tab;
      control.setAttribute('aria-selected', String(on));
      control.tabIndex = on ? 0 : -1;
    }
    stage.innerHTML = '<span class="studio-avatar">' + worn(choice.look) + '</span><span class="look-stage-name">' +
      esc(nickname.value.trim() || agent.app || tr('Agent')) + '</span>';
    if (again) drawGrid();
    for (const control of grid.querySelectorAll('[data-pick]')) {
      const selected = choice.look[control.dataset.pick] === control.dataset.value;
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
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saved[id] = { name: nickname.value.trim(), avatar: choice.avatar, color: choice.color, ...choice.look };
    try { localStorage.setItem(PERSONA_KEY, JSON.stringify(saved)); }
    catch { dialog.querySelector('[data-error]').textContent = tr('Vzhled se nepodařilo uložit.'); return; }
    dialog.close();
    onSaved();
  });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  redraw();
  dialog.showModal();
  return true;
}
