import { esc } from './format.js';
import { tr } from './i18n.js';
import { state } from './state.js';
import { robot } from './robot-svg.js';

export const PERSONA_KEY = 'agenteeq:agent-personas:v1';
export const PERSONA_COLORS = ['#6260d8', '#367b68', '#a85c44', '#92609a'];
export const PERSONA_AVATARS = ['Scout', 'Orbit', 'Pixel', 'Nova'];
export const PERSONA_ACCESSORIES = ['none', 'cap', 'glasses', 'shirt', 'spacesuit'];

// Vector accessories use exactly the same 108x112 viewBox as the robot; nothing rescales the
// canonical avatar. Shapes are decorative only, never an implied change to agent permissions.
const EXTRAS = {
  cap: '<g class="robot-accessory robot-accessory--cap"><path d="M32 26c2-11 13-17 22-17s20 6 22 17Z"/><path d="M28 27h52" fill="none" stroke-width="4" stroke-linecap="round"/></g>',
  glasses: '<g class="robot-accessory robot-accessory--glasses" fill="none" stroke-width="2.5"><rect x="32" y="38" width="21" height="20" rx="7"/><rect x="55" y="38" width="21" height="20" rx="7"/><path d="M53 46h2"/></g>',
  shirt: '<g class="robot-accessory robot-accessory--shirt"><path d="M33 70 25 77l8 9 5-4v7c0 3 3 5 6 5h20c3 0 6-2 6-5v-7l5 4 8-9-8-7H33Z"/><path d="M48 72q6 9 12 0" fill="none" stroke-width="2" stroke-linecap="round"/></g>',
  spacesuit: '<g class="robot-accessory robot-accessory--spacesuit"><path d="M28 68h52l5 22-8 8H31l-8-8Z"/><rect x="39" y="75" width="30" height="13" rx="6"/><rect x="17" y="20" width="74" height="57" rx="26" fill="none" stroke-width="5"/><circle cx="71" cy="81" r="2.5"/></g>',
};
export function renderAgentRobot(type, accessory = 'none') {
  const kind = PERSONA_AVATARS.includes(type) ? type : PERSONA_AVATARS[0];
  const extra = EXTRAS[accessory] || '';
  return robot(kind).replace('</svg>', extra + '</svg>');
}
export function loadPersonas() {
  try {
    const saved = JSON.parse(localStorage.getItem(PERSONA_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

export function editAgentAppearance(id, { onSaved = () => {} } = {}) {
  const agent = state.sessions.get(id);
  if (!agent) return false;
  const saved = loadPersonas();
  const p = saved[id] || {};
  const choice = {
    name: String(p.name || '').slice(0, 32),
    avatar: PERSONA_AVATARS.includes(p.avatar) ? p.avatar : 'Scout',
    color: PERSONA_COLORS.includes(p.color) ? p.color : PERSONA_COLORS[0],
    accessory: PERSONA_ACCESSORIES.includes(p.accessory) ? p.accessory : 'none',
  };
  const dialog = document.createElement('dialog');
  dialog.className = 'studio-dialog studio-dialog--single';
  const choices = (kind, values, labels) => values.map((value, i) =>
    '<button type="button" class="appearance-choice" data-pick="' + kind + '" data-value="' + esc(value) +
    '" aria-pressed="false" title="' + esc(labels[i]) + '">' +
    (kind === 'color' ? '<span class="appearance-swatch" style="--swatch:' + value + '"></span>' :
      kind === 'avatar' ? '<span class="appearance-choice__robot" style="--persona:' + choice.color + '">' + renderAgentRobot(value) + '</span>' :
      '<span class="appearance-choice__symbol" aria-hidden="true">' + ['—', '⌒', '◎', '▱', '◉'][i] + '</span>') +
    '<span>' + esc(labels[i]) + '</span></button>'
  ).join('');
  dialog.innerHTML = '<form class="appearance-form">' +
    '<header><div><p class="appearance-eyebrow">' + tr('Vzhled agenta') + '</p><h2>' + esc(agent.title || agent.app || tr('Agent')) + '</h2></div>' +
    '<button type="button" class="btn btn--sm" data-close aria-label="' + tr('Zavřít') + '">✕</button></header>' +
    '<label>' + tr('Vlastní jméno') + '<input name="nickname" maxlength="32" autocomplete="off"></label>' +
    '<fieldset class="appearance-options"><legend>' + tr('Podoba robota') + '</legend><div class="appearance-grid appearance-grid--robots">' +
    choices('avatar', PERSONA_AVATARS, PERSONA_AVATARS) + '</div></fieldset>' +
    '<fieldset class="appearance-options"><legend>' + tr('Barva') + '</legend><div class="appearance-grid appearance-grid--colors">' +
    choices('color', PERSONA_COLORS, [tr('Indigo'), tr('Šalvěj'), tr('Terakota'), tr('Orchidej')]) + '</div></fieldset>' +
    '<fieldset class="appearance-options"><legend>' + tr('Doplňky a oblečení') + '</legend><div class="appearance-grid appearance-grid--accessories">' +
    choices('accessory', PERSONA_ACCESSORIES, [tr('Bez doplňku'), tr('Čepice'), tr('Brýle'), tr('Tričko'), tr('Skafandr')]) +
    '</div></fieldset><div class="studio-preview" role="status" aria-live="polite"></div>' +
    '<footer><span class="muted small" data-error role="status"></span><button class="btn btn--primary" type="submit">' +
    tr('Uložit vzhled') + '</button></footer></form>';
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const nickname = form.elements.namedItem('nickname');
  nickname.value = choice.name;
  const preview = dialog.querySelector('.studio-preview');
  const redraw = () => {
    for (const control of dialog.querySelectorAll('[data-pick]')) {
      const selected = choice[control.dataset.pick] === control.dataset.value;
      control.setAttribute('aria-pressed', String(selected));
      control.classList.toggle('is-selected', selected);
    }
    for (const el of dialog.querySelectorAll('.appearance-choice__robot')) el.style.setProperty('--persona', choice.color);
    preview.innerHTML = '<span class="studio-avatar" style="--persona:' + choice.color + '">' +
      renderAgentRobot(choice.avatar, choice.accessory) + '</span><span>' +
      esc(nickname.value.trim() || agent.app || tr('Agent')) + '</span>';
  };
  form.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-pick]');
    if (!button) return;
    choice[button.dataset.pick] = button.dataset.value;
    redraw();
  });
  nickname.addEventListener('input', redraw);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saved[id] = { name: nickname.value.trim(), avatar: choice.avatar, color: choice.color, accessory: choice.accessory };
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
