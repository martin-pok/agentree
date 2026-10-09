import { esc } from './format.js';
import { tr } from './i18n.js';
import { agentsList } from './state.js';

const KEY = 'agenteeq:agent-personas:v1';
const colors = ['#6260d8', '#367b68', '#a85c44', '#92609a'];
const avatars = ['Scout', 'Orbit', 'Pixel', 'Nova'];
export function robot(type = 'Scout') {
  const round = type === 'Orbit' ? 25 : type === 'Pixel' ? 10 : 18;
  const antenna = type === 'Nova' ? '<path d="M47 22 40 12M61 22 68 12"/>' : '<path d="M54 23V13"/><circle cx="54" cy="10" r="4" fill="currentColor" stroke="none"/>';
  return `<svg class="robot" viewBox="0 0 108 112" aria-hidden="true"><ellipse class="robot-shadow" cx="54" cy="104" rx="24" ry="4"/><g class="robot-body"><path class="robot-limbs" d="M37 88v10m34-10v10"/><path class="robot-limbs robot-arm-left" d="M28 75l-7 9"/><path class="robot-limbs robot-arm-right" d="M80 75l7 9"/><rect class="robot-torso" x="33" y="69" width="42" height="24" rx="11"/><circle class="robot-core" cx="54" cy="80" r="3"/><g class="robot-head"><g class="robot-aerial">${antenna}</g><rect class="robot-ear" x="14" y="39" width="10" height="19" rx="5"/><rect class="robot-ear" x="84" y="39" width="10" height="19" rx="5"/><rect class="robot-shell" x="21" y="23" width="66" height="51" rx="${round}"/><rect class="robot-face" x="28" y="32" width="52" height="32" rx="${Math.min(round, 14)}"/><g class="robot-gaze"><g class="robot-eyes"><rect x="38" y="42" width="7" height="11" rx="3.5"/><rect x="63" y="42" width="7" height="11" rx="3.5"/></g></g></g></g></svg>`;
}
export function createHomeStudio(el) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* defaults */ }
  const button = document.createElement('button');
  button.className = 'btn btn--sm studio-customize';
  button.textContent = tr('Upravit vzhled agentů');
  el.querySelector('.home-live > h2').after(button);
  const dialog = document.createElement('dialog');
  dialog.className = 'studio-dialog';
  dialog.innerHTML = `<form><header><h2>${tr('Tvůj agent. Tvůj styl.')}</h2><button type="button" class="btn btn--sm" data-close aria-label="${tr('Zavřít')}">✕</button></header><p>${tr('Vlastní vzhled pro tento prohlížeč. Nástroj ani jeho oprávnění se nemění.')}</p><label>${tr('Agent')}<select data-native name="agent"></select></label><label>${tr('Vlastní jméno')}<input name="nickname" maxlength="32" placeholder="${tr('Například Atlas')}"></label><label>${tr('Podoba robota')}<select data-native name="avatar">${avatars.map((a) => `<option value="${a}">${a}</option>`).join('')}</select></label><label>${tr('Barva')}<select data-native name="color">${colors.map((c, i) => `<option value="${c}">${[tr('Indigo'), tr('Šalvěj'), tr('Terakota'), tr('Orchidej')][i]}</option>`).join('')}</select></label><div class="studio-preview" aria-live="polite"></div><footer><span role="status"></span><button class="btn btn--primary" type="submit">${tr('Uložit vzhled')}</button></footer></form>`;
  el.append(dialog);
  const form = dialog.querySelector('form');
  const field = name => form.elements.namedItem(name);
  const persona = () => ({ name: field('nickname').value.trim(), avatar: field('avatar').value, color: field('color').value });
  const preview = () => {
    const p = persona();
    dialog.querySelector('.studio-preview').innerHTML = `<span class="studio-avatar" style="--persona:${p.color}">${robot(p.avatar)}</span><span>${esc(p.name || tr('Tvůj agent'))}</span>`;
  };
  const load = () => {
    const p = saved[field('agent').value] || {};
    field('nickname').value = p.name || '';
    field('avatar').value = avatars.includes(p.avatar) ? p.avatar : avatars[0];
    field('color').value = colors.includes(p.color) ? p.color : colors[0];
    preview();
  };
  button.onclick = () => {
    field('agent').innerHTML = agentsList().map(a => `<option value="${esc(a.id)}">${esc(a.title)}</option>`).join('');
    load(); dialog.showModal();
  };
  field('agent').addEventListener('change', load);
  form.addEventListener('input', preview);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  // Robot u pozdravu ukazuje stav všech agentů najednou: kdo čeká na tebe, zamává; když někdo
  // pracuje, píše; jinak odpočívá. Věta pod nadpisem říká totéž slovy.
  const hlavni = el.querySelector('.home-robot');
  if (hlavni) hlavni.innerHTML = robot('Orbit');
  const pulz = el.querySelector('[data-home-pulse]');
  const stavPlochy = () => {
    if (!hlavni || !pulz) return;
    const vsichni = agentsList();
    const cekaji = vsichni.filter((a) => a.status === 'needs_input').length;
    const pracuji = vsichni.filter((a) => a.status === 'working').length;
    hlavni.dataset.state = cekaji ? 'needs_input' : pracuji ? 'working' : 'idle';
    pulz.textContent = cekaji ? tr('Na tvé rozhodnutí čeká agentů: {0}. Najdeš je hned pod polem pro zadání.', cekaji)
      : pracuji ? tr('Pracujících agentů: {0}. Mezitím můžeš zadat další úkol.', pracuji)
        : tr('Zadej práci. Agenti se pustí do díla, ty máš prostor na to podstatné.');
  };
  const refresh = () => {
    stavPlochy();
    el.querySelectorAll('.pb-agents li[data-key]').forEach((li, i) => {
      const p = saved[li.dataset.key] || {};
      const index = [...String(li.dataset.key)].reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length;
      const logo = li.querySelector('.pb-agent-logo');
      if (!logo) return;
      logo.classList.add('studio-avatar');
      logo.style.setProperty('--persona', colors.includes(p.color) ? p.color : colors[index]);
      const type = avatars.includes(p.avatar) ? p.avatar : avatars[index];
      if (logo.dataset.robot !== type || !logo.querySelector('.robot')) { logo.innerHTML = robot(type); logo.dataset.robot = type; }
      logo.style.setProperty('--robot-delay', `${i * -1.3}s`);
      let nick = li.querySelector('.studio-nickname');
      if (!nick) { nick = document.createElement('span'); nick.className = 'studio-nickname'; li.querySelector('.pb-agent-text').prepend(nick); }
      nick.textContent = p.name || agentsList().find(a => a.id === li.dataset.key)?.app || tr('Agent');
    });
  };
  form.onsubmit = e => {
    e.preventDefault();
    saved[field('agent').value] = persona();
    try { localStorage.setItem(KEY, JSON.stringify(saved)); }
    catch { dialog.querySelector('[role="status"]').textContent = tr('Vzhled se nepodařilo uložit.'); return; }
    refresh(); dialog.close();

  };
  refresh();
  return { refresh, destroy() { dialog.remove(); } };
}

export function agentRobot(s) {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY) || '{}')[s.id] || {}; } catch { /* default */ }
  const index = [...String(s.id)].reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length;
  const color = colors.includes(p.color) ? p.color : colors[index];
  const type = avatars.includes(p.avatar) ? p.avatar : avatars[index];
  return `<span class="agent-portrait" style="--persona:${color}" data-state="${esc(s.status)}"${s.status === 'waiting' && !s.done ? ' data-done="false"' : ''}>${robot(type)}</span>`;
}
