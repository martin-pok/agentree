import { esc, rel, fmtTok, startOfDay } from './format.js';
import { ICON, glyph } from './icons.js';
import { currentLimits, limitState, limitObnova } from './ui.js';
import { tokensSince } from './data.js';
import { tr, tomtoPocitaci } from './i18n.js';
import { nastrojeBezDat, kdeKdy } from './nastroje.js';

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
  { id: 'web', name: tr('Chaty na webu'), logo: 'other', connectors: ['web'], web: true },
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
      return `<span class="lim-chip" data-tone="${s.tone}"><span>${esc(l.label)}</span><b>${esc(s.label)}</b><small>${esc(limitObnova(l, now).text)}</small></span>`;
    })
    .join('');
}

// Claude bez čerstvého měření: říct proč a kde se měření vezme. Claude Code v aplikaci Claude
// stavový řádek nespouští a historie Claude Desktopu přibývá jen tehdy, když si Desktop vytížení načte.
// Cestu přes Desktop nabízíme jen tam, kde Desktop je; stavový řádek jen s propojenými hooky.
function claudeOdhlaseny(state, now) {
  const auth = state.integrations?.claudeAuth;
  return auth?.loggedIn === false && Number.isFinite(auth.checkedAt) && auth.checkedAt > 0 && now - auth.checkedAt >= 0 && now - auth.checkedAt <= 5 * 60e3;
}

export function claudeLimitStatus(state, now = Date.now()) {
  const dostupny = (state.connectors || []).some((c) => ['claude-code', 'claude-desktop-usage'].includes(c.id) && c.state !== 'missing');
  const zmereny = currentLimits(state.limits || [], now).some((l) => l.provider === 'anthropic' && (typeof l.usedPercent === 'number' || l.reached));
  if (!dostupny || zmereny) return '';
  const odhlaseny = claudeOdhlaseny(state, now);
  const stav = odhlaseny ? tr('Claude Code je odhlášený') : tr('Čeká na čerstvá data');
  return `<a class="lwin-missing" href="#/nastaveni" aria-label="${esc(tr('Claude: {0}. Otevřít Nastavení', stav))}">
    <span class="lwin-logo">${glyph('anthropic')}</span>
    <span class="lwin-missing-main"><b>Claude</b><span>${esc(stav)}</span></span>
    <span class="lwin-missing-action">${odhlaseny ? tr('Přihlásit') : tr('Zkontrolovat')}${ICON.arrow}</span>
  </a>`;
}

function poznamkaClaude(state, now) {
  if (claudeOdhlaseny(state, now)) return tr('Claude Code je odhlášený. Napoj ho v Nastavení.');
  return tr('Bez čerstvého měření');
}

function poznamka(t, spojene, state, now) {
  const stav = spojene.find((c) => c.state === 'connected' || c.state === 'idle') || spojene[0];
  if (!stav) return tr('Bez údajů o limitu');
  if (t.web) return tr('Limity nejsou dostupné');
  if (stav.state === 'missing') return stav.detail || `${t.name} ${tr('na {0} není.', tomtoPocitaci())}`;
  if (t.id === 'claude') return poznamkaClaude(state, now);
  return tr('Bez údajů o limitu');
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

// Zachycené nástroje, o jejichž limitech ani tokenech Agenteeq nic neví: řádek říká, že běží
// a jak dlouho, a narovinu, že víc zatím nevidíme.
function radekBezDat(n, now) {
  return `<li class="ltool">
      <span class="lwin-logo">${glyph({ runtime: n.id, provider: n.provider })}</span>
      <span class="ltool-main">
        <span class="ltool-top"><b>${esc(n.name)}</b></span>
        <span class="ltool-note">${esc(kdeKdy(n, now))} · ${tr('Bez údajů o limitu')}</span>
      </span>
    </li>`;
}

export function limitsAll(state, now = Date.now()) {
  const rows = allToolLimits(state, now);
  const bezDat = nastrojeBezDat(state, new Set(TOOLS.flatMap((t) => t.connectors)), now);
  const items = rows.map(({ t, spojene, okna, tok }) => {
    const stari = okna.length ? Math.max(...okna.map((l) => l.at || 0)) : 0;
    const nota = poznamka(t, spojene, state, now);
    const chybi = !okna.length && spojene.every((c) => c.state === 'missing');
    return `<li class="ltool${chybi ? ' is-off' : ''}">
      <span class="lwin-logo">${glyph(t.logo)}</span>
      <span class="ltool-main">
        <span class="ltool-top"><b>${esc(t.name)}</b>${tok > 0 ? `<span class="ltool-tok" title="${tr('Vstup + výstup z přepisů na {0}, bez cache', tomtoPocitaci())}">${fmtTok(tok)} ${tr('tokenů dnes')}</span>` : ''}</span>
        ${okna.length ? `<span class="ltool-chips">${chips([...okna], now)}</span><span class="ltool-note">${tr('Změřeno')} ${esc(rel(stari, now))}</span>` : `<span class="ltool-note">${esc(nota)}</span>`}
      </span>
    </li>`;
  });
  items.push(...bezDat.map((n) => radekBezDat(n, now)));
  const merene = rows.filter((r) => r.okna.length).length;
  return `<details class="lim-all" data-lim-all${otevreno ? ' open' : ''}>
    <summary><span>${tr('Všechny nástroje a služby')}</span><span class="lim-all-count">${merene} ${tr('z {0} s měřeným limitem', rows.length + bezDat.length)}</span>${ICON.chev}</summary>
    <ul class="ltool-list">${items.join('')}</ul>
  </details>`;
}
