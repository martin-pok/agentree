import { esc, rel, fmtTok, startOfDay } from './format.js';
import { ICON, glyph } from './icons.js';
import { currentLimits, limitState } from './ui.js';
import { tokensSince } from './data.js';

// Rozbalovací přehled „Všechny nástroje“. Nahoře zůstávají jen změřená okna limitů; tady je
// každý sledovaný nástroj včetně těch, jejichž limit se z místních dat zjistit nedá. U takového
// nástroje to říkáme přímo, místo aby chyběl a vypadalo to, že je všechno v pořádku.

const TOOLS = [
  { id: 'claude', name: 'Claude', logo: 'anthropic', connectors: ['claude-code'], provider: 'anthropic' },
  { id: 'codex', name: 'Codex · ChatGPT', logo: { connector: 'codex' }, connectors: ['codex'], provider: 'openai' },
  { id: 'cursor', name: 'Cursor', logo: 'cursor', connectors: ['cursor'] },
  { id: 'copilot', name: 'GitHub Copilot', logo: 'github', connectors: ['copilot-cli', 'vscode-copilot'] },
  { id: 'gemini', name: 'Gemini CLI', logo: 'google', connectors: ['gemini-cli'] },
  { id: 'qwen', name: 'Qwen Code', logo: 'alibaba', connectors: ['qwen-code'] },
  { id: 'web', name: 'Chaty na webu', logo: 'other', connectors: ['web'], web: true },
];

// Otevřený stav přežije každé překreslení Přehledu i Statistik (obnovují se po minutě).
let otevreno = false;
if (typeof document !== 'undefined') {
  document.addEventListener('toggle', (e) => {
    if (e.target?.matches?.('details[data-lim-all]')) otevreno = e.target.open;
  }, true);
}

function chips(rows, now) {
  return rows
    .sort((a, b) => (a.windowMinutes || 1e9) - (b.windowMinutes || 1e9))
    .map((l) => {
      const s = limitState(l, now);
      return `<span class="lim-chip" data-tone="${s.tone}"><span>${esc(l.label)}</span><b>${esc(s.label)}</b></span>`;
    })
    .join('');
}

function poznamka(t, spojene) {
  const stav = spojene.find((c) => c.state === 'connected' || c.state === 'idle') || spojene[0];
  if (!stav) return 'Tenhle zdroj Agenteeq na tomto Macu nesleduje.';
  if (t.web) return `Webové chaty limity ani tokeny nesdílejí.${stav.state === 'missing' ? ' Rozšíření pro Chrome zatím nic neposlalo.' : ''}`;
  if (stav.state === 'missing') return stav.detail || `${t.name} na tomto Macu není.`;
  if (t.id === 'claude') return 'Přesná okna (5 h a týden) přijdou po zapnutí propojení s Claude Code v Nastavení.';
  if (t.id === 'codex') return 'Codex limity zapisuje po první odpovědi. Žádné zatím nemám.';
  return 'Limit se z místních dat zjistit nedá, Agenteeq měří jen tokeny.';
}

export function allToolLimits(state, now = Date.now()) {
  const dnes = startOfDay(now);
  const limits = currentLimits(state.limits || [], now).filter((l) => typeof l.usedPercent === 'number' || l.reached);
  const rows = TOOLS.map((t) => {
    const spojene = (state.connectors || []).filter((c) => t.connectors.includes(c.id));
    const okna = t.provider ? limits.filter((l) => l.provider === t.provider) : [];
    const tok = tokensSince([...(state.sessions?.values?.() || [])].filter((s) => t.connectors.includes(s.connector)), dnes);
    return { t, spojene, okna, tok };
  });
  return rows;
}

export function limitsAll(state, now = Date.now()) {
  const rows = allToolLimits(state, now);
  const items = rows.map(({ t, spojene, okna, tok }) => {
    const stari = okna.length ? Math.max(...okna.map((l) => l.at || 0)) : 0;
    const nota = poznamka(t, spojene);
    const chybi = !okna.length && spojene.every((c) => c.state === 'missing');
    return `<li class="ltool${chybi ? ' is-off' : ''}">
      <span class="lwin-logo">${glyph(t.logo)}</span>
      <span class="ltool-main">
        <span class="ltool-top"><b>${esc(t.name)}</b>${tok > 0 ? `<span class="ltool-tok" title="Vstup + výstup z přepisů na tomto Macu, bez cache">${fmtTok(tok)} tokenů dnes</span>` : ''}</span>
        ${okna.length ? `<span class="ltool-chips">${chips([...okna], now)}</span><span class="ltool-note">Změřeno ${esc(rel(stari, now))}</span>` : `<span class="ltool-note">${esc(nota)}</span>`}
      </span>
    </li>`;
  });
  const merene = rows.filter((r) => r.okna.length).length;
  return `<details class="lim-all" data-lim-all${otevreno ? ' open' : ''}>
    <summary><span>Všechny nástroje a služby</span><span class="lim-all-count">${merene} z ${rows.length} s měřeným limitem</span>${ICON.chev}</summary>
    <ul class="ltool-list">${items.join('')}</ul>
    <p class="ltool-foot">Čísla jsou z toho, co nástroje samy zapisují na tomhle Macu. Nic se neodhaduje a nikam se neposílá.</p>
  </details>`;
}
