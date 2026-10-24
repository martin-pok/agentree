import { displayStatus, esc, modelPopis } from './format.js';
import { glyph } from './icons.js';
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
      // Vlastní jméno agenta, jinak logo služby a model (ne slovo „Codex“ – služba se pozná podle loga).
      const a = agentsList().find((x) => x.id === li.dataset.key);
      const obsah = p.name ? esc(p.name) : a ? `<span class="cell-logo">${glyph(a)}</span><span class="sr-only">${esc(a.app)}</span><span>${esc(modelPopis(a.model) || a.app)}</span>` : esc(tr('Agent'));
      if (nick.innerHTML !== obsah) nick.innerHTML = obsah;
      nick.classList.toggle('studio-nickname--sluzba', !p.name && Boolean(a));
    });
  };
  refresh();
  return { refresh, destroy() {} };
}

// Stabilní otisk id agenta: vlastní fáze pohybu a nástroj v dílně.
const otisk = (id) => [...String(id)].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
// Jak dlouho už úkol běží → jak dlouhý je obrobek v dílně (do 1, 3, 8, 20 min, déle). Podle
// skutečného začátku úkolu (turnStartedAt), nic se neodhaduje; bez něj zůstane výchozí kus.
export const postupPrace = (od, ted = Date.now()) => {
  if (!(od > 0)) return 0;
  const min = (ted - od) / 60000;
  return min < 1 ? 0 : min < 3 ? 1 : min < 8 ? 2 : min < 20 ? 3 : 4;
};
// Atributy dílny pro prvek, který nese stav agenta: nástroj (kladivo/pilka), začátek a fáze práce.
export function dilnaAtributy(s) {
  const od = s.status === 'working' && s.turnStartedAt > 0 ? s.turnStartedAt : 0;
  return ` data-nastroj="${otisk(s.id) % 2 ? 'pila' : 'kladivo'}" data-hra="${hraAgenta(s.id)}"${od ? ` data-od="${od}" data-postup="${postupPrace(od)}"` : ''}`;
}

// Jen to, co stav agenta opravdu ukáže (refinement.css): dílna při práci, hračky při čekání,
// signál, když tě potřebuje. Při změně stavu živé sloučení chybějící části doplní.
const HRY = ['micek', 'jojo', 'pisen'];
const hraAgenta = (id) => HRY[(otisk(id) >>> 3) % 3];
const kusyPodleStavu = (s) => ({ prace: s.status === 'working', hra: displayStatus(s) !== 'unknown' && (s.status === 'waiting' || s.status === 'idle') ? hraAgenta(s.id) : false, signal: s.status === 'needs_input' });

export function agentRobot(s) {
  let p = {};
  p = loadPersonas()[s.id] || {};
  const index = [...String(s.id)].reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
  const color = colors.includes(p.color) ? p.color : colors[index];
  const type = avatars.includes(p.avatar) ? p.avatar : avatars[index];
  // Vlastní fáze dechu a rozhlížení (refinement.css): roboti vedle sebe se nehýbou v zákrytu.
  const faze = -((otisk(s.id) % 997) / 100);
  return `<span class="agent-portrait" style="--persona:${color};--robot-delay:${faze}s" data-state="${esc(displayStatus(s))}"${s.status === 'waiting' && !s.done ? ' data-done="false"' : ''}${dilnaAtributy(s)}>${renderAgentRobot(type, p, kusyPodleStavu(s))}</span>`;
}
