// Tlačítka rozhodnutí (src/rozhodnuti.js) pro všechna místa, kde agent čeká: karta v rohu,
// „Vyžaduje pozornost“ na Přehledu a detail agenta. Jedno id = jedna žádost; klik kdekoli vyřídí
// všechna tlačítka téže žádosti (public/js/rozhodnuti-ui.js). Bez DOM a bez závislosti na ui.js.
import { state } from './state.js';
import { esc } from './format.js';
import { tr } from './i18n.js';

// Rozhodovat smí jen okno na počítači s Agenteeq – telefon je jen ke čtení (src/remote-scope.js).
export const naMacu = () => typeof window !== 'undefined' && (Boolean(window.agenteeqDesktop) || ['127.0.0.1', 'localhost', '[::1]'].includes(window.location?.hostname));

// Platná žádost konkrétního agenta (Claude Code), nebo null.
export function rozhodnutiPro(s, now = Date.now()) {
  if (!s || s.connector !== 'claude-code' || !naMacu()) return null;
  return (state.rozhodnuti || []).find((r) => `claude-code:${r.sessionId}` === s.id && r.do > now) || null;
}

// Kam Claude Code trvalé pravidlo uloží (permission_suggestions.destination).
const KDE = {
  session: () => tr('jen v této konverzaci'),
  localSettings: () => tr('v tomto projektu, jen u tebe'),
  projectSettings: () => tr('v tomto projektu pro všechny'),
  userSettings: () => tr('ve všech projektech'),
};
export const kdePravidlo = (r) => (KDE[r?.pravidlo?.kde] || (() => ''))();

const zbyva = (r, now = Date.now()) => Math.max(0, Math.ceil((r.do - now) / 1000));
export const textOdpoctu = (s) => tr('Bez rozhodnutí se za {0} s zeptá v terminálu.', s);

// Co přesně se schvaluje – stejně všude, kde jde rozhodnout: celý příkaz (nebo soubor, adresa),
// složka, přesné trvalé pravidlo a odpočet do návratu do terminálu. Bez toho by se schvalovalo
// naslepo podle popisu, který si agent napsal sám.
export function podrobnostiRozhodnuti(r, { slozka = true, ikonaSlozky = '' } = {}) {
  return `${r.podrobnost ? `<pre class="rozh-prikaz">${esc(r.podrobnost)}</pre>` : ''}`
    + `${slozka && r.cwd ? `<p class="rozh-slozka">${ikonaSlozky}<span>${esc(r.cwd)}</span></p>` : ''}`
    + `${r.pravidlo ? `<p class="rozh-pravidlo">${esc(tr('Příště se neptat na: {0} ({1})', r.pravidlo.text, kdePravidlo(r)))}</p>` : ''}`
    + `<p class="rozh-cas" data-rozh-cas data-rozh-do="${Number(r.do) || 0}">${esc(textOdpoctu(zbyva(r)))}</p>`;
}

export function tlacitkaRozhodnuti(r, { small = false, odeslano = false } = {}) {
  const sm = small ? ' btn--sm' : '';
  const dis = odeslano ? ' disabled' : '';
  const id = esc(r.id);
  const vzdy = r.pravidlo
    ? `<button type="button" class="btn${sm}" data-rozh-id="${id}" data-rozh-akce="povolit-vzdy" title="${esc(`${r.pravidlo.text} · ${kdePravidlo(r)}`)}"${dis}>${tr('Povolit a příště se neptat')}</button>`
    : '';
  return `<button type="button" class="btn${sm}" data-rozh-id="${id}" data-rozh-akce="zamitnout"${dis}>${tr('Zamítnout')}</button>${vzdy}<button type="button" class="btn btn--primary${sm}" data-rozh-id="${id}" data-rozh-akce="povolit"${dis}>${tr('Povolit')}</button>`;
}
