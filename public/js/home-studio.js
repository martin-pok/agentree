import { esc } from './format.js';
export { robot } from './robot-svg.js';
import { robot } from './robot-svg.js';
import { loadPersonas, renderAgentRobot, PERSONA_COLORS, PERSONA_AVATARS } from './agent-appearance.js';
import { normalizeLook } from './robot-wardrobe.js';
import { tr } from './i18n.js';
import { agentsList } from './state.js';
import { vetaPozdravu } from './stav-vety.js';

const colors = PERSONA_COLORS;
const avatars = PERSONA_AVATARS;

export function createHomeStudio(el) {
  // The editor belongs to the selected agent detail, not to the global dashboard.
  // This surface displays each agent's saved look, but never asks which agent to edit.
  let saved = loadPersonas();
  // Robot u pozdravu ukazuje stav všech agentů najednou: kdo čeká na tebe, zamává; když někdo
  // pracuje, píše; jinak odpočívá. Věta pod nadpisem radí, co dělat dál (počty nese box Stav agentů).
  const hlavni = el.querySelector('.home-robot');
  if (hlavni) hlavni.innerHTML = robot('Scout');
  const pulz = el.querySelector('[data-home-pulse]');
  const stavPlochy = () => {
    if (!hlavni || !pulz) return;
    const vsichni = agentsList();
    const cekaji = vsichni.filter((a) => a.status === 'needs_input').length;
    const pracuji = vsichni.filter((a) => a.status === 'working').length;
    hlavni.dataset.state = cekaji ? 'needs_input' : pracuji ? 'working' : 'idle';
    pulz.textContent = vetaPozdravu({ cekaji, pracuji });
  };
  const refresh = () => {
    saved = loadPersonas();
    stavPlochy();
    el.querySelectorAll('.pb-agents li[data-key]').forEach((li, i) => {
      const p = saved[li.dataset.key] || {};
      const index = [...String(li.dataset.key)].reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
      const logo = li.querySelector('.pb-agent-logo');
      if (!logo) return;
      logo.classList.add('studio-avatar');
      logo.style.setProperty('--persona', colors.includes(p.color) ? p.color : colors[index]);
      const type = avatars.includes(p.avatar) ? p.avatar : avatars[index];
      const variant = type + ':' + JSON.stringify(normalizeLook(p));
      if (logo.dataset.robot !== variant || !logo.querySelector('.robot')) { logo.innerHTML = renderAgentRobot(type, p); logo.dataset.robot = variant; }
      logo.style.setProperty('--robot-delay', `${i * -1.3}s`);
      let nick = li.querySelector('.studio-nickname');
      if (!nick) { nick = document.createElement('span'); nick.className = 'studio-nickname'; }
      const title = li.querySelector('.pb-agent-text b');
      if (title?.nextElementSibling !== nick) title?.after(nick);
      nick.textContent = p.name || agentsList().find(a => a.id === li.dataset.key)?.app || tr('Agent');
    });
  };
  refresh();
  return { refresh, destroy() {} };
}

export function agentRobot(s) {
  let p = {};
  p = loadPersonas()[s.id] || {};
  const index = [...String(s.id)].reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
  const color = colors.includes(p.color) ? p.color : colors[index];
  const type = avatars.includes(p.avatar) ? p.avatar : avatars[index];
  // Vlastní fáze dechu a rozhlížení (refinement.css): roboti vedle sebe se nehýbou v zákrytu.
  const faze = -((([...String(s.id)].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0) % 997) / 100);
  return `<span class="agent-portrait" style="--persona:${color};--robot-delay:${faze}s" data-state="${esc(s.status)}"${s.status === 'waiting' && !s.done ? ' data-done="false"' : ''}>${renderAgentRobot(type, p)}</span>`;
}
