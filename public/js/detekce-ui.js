// Oznámení o nově zachyceném agentovi a Moje nástroje. Data drží server (src/detekce.js),
// tady se jen zobrazují a posílají rozhodnutí. Karta zůstane, dokud uživatel nerozhodne –
// „Později“ ji schová jen do dalšího spuštění aplikace.
import { api } from './api.js';
import { state, subscribe, emit } from './state.js';
import { esc } from './format.js';
import { tr, tomtoPocitaci } from './i18n.js';
import { druhNazev, predplatneHref, zivy as zivyZ, kdeKdy, coVidim } from './nastroje.js';
import { ICON, glyph } from './icons.js';
import { toast } from './ui.js';
import { goToExtension } from './jump.js';

// Webové služby, u kterých rozšíření Agenteeq v běžné záložce Chromu hlásí stav (pracuje, čeká, limit).
// Text zpráv rozšíření neposílá (0.25.0), takže se tu nic takového neslibuje.
const UMI_ROZSIRENI = new Set(['pwa-chatgpt', 'pwa-claude', 'pwa-gemini', 'pwa-perplexity', 'pwa-grok', 'pwa-copilot', 'ms-copilot', 'perplexity', 'grok']);

// Stejné logo jako v přehledu (overview.js) – nástroj má všude jednu tvář.
const logo = (n) => glyph({ runtime: n.id, provider: n.provider });

// Rozhodovat smí jen okno na počítači s Agenteeq – telefon je podle src/remote-scope.js jen ke čtení.
const naMacu = () => Boolean(window.agenteeqDesktop) || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

const zivy = (n) => zivyZ(n, state.runtimes);
const zavrene = new Set();
const viditelneNove = () => (state.detekce?.nove || []).filter((n) => !zavrene.has(n.id));

// Webová služba, jejíž stav rozšíření hlásí z běžné záložky Chromu: poradit, nebo říct, že už ho vidíme.
function radaRozsireni(n) {
  if (n.sledovano || !UMI_ROZSIRENI.has(n.id)) return '';
  const web = (state.connectors || []).find((c) => c.id === 'web');
  return web?.state === 'connected'
    ? `<p class="det-rada">${tr('V běžné záložce Chromu přes rozšíření vidím, kdy pracuje a kdy čeká.')}</p>`
    : `<p class="det-rada">${tr('V běžné záložce Chromu uvidím přes rozšíření, kdy pracuje a kdy čeká.')} <button class="link-inline" type="button" data-jit-rozsireni>${tr('Nastavit rozšíření')}</button></p>`;
}

function polozka(n) {
  const akce = !naMacu() ? ''
    : n.sledovano
      ? `<button class="btn btn--sm btn--primary" type="button" data-nastroj-akce="rozumim" data-id="${esc(n.id)}">${tr('Rozumím')}</button>`
      : `<button class="btn btn--sm btn--primary" type="button" data-nastroj-akce="pridat" data-id="${esc(n.id)}" aria-label="${esc(tr('Přidat {0} do Mých nástrojů', n.name))}">${ICON.plus}${tr('Přidat')}</button>
         <button class="btn btn--sm" type="button" data-nastroj-akce="ignorovat" data-id="${esc(n.id)}" aria-label="${esc(tr('Nesledovat {0}', n.name))}">${tr('Nesledovat')}</button>`;
  const ton = n.sledovano ? 'ok' : n.umiCist ? 'info' : 'mute';
  return `<li class="det-item">
    <span class="det-logo">${logo(n)}</span>
    <div class="det-main">
      <b class="det-name">${esc(n.name)}</b>
      <span class="det-kde">${esc(kdeKdy(n))}</span>
      ${n.popis ? `<p class="det-popis">${esc(n.popis)}</p>` : ''}
      <p class="det-vidim" data-tone="${ton}">${esc(coVidim(n))}</p>
      ${radaRozsireni(n)}
      ${akce ? `<div class="det-akce">${akce}</div>` : ''}
    </div>
  </li>`;
}

export function detekceHtml() {
  const nove = viditelneNove();
  if (!nove.length || state.settings?.notifications?.detekce === false) return '';
  const nadpis = nove.length === 1 ? tr('Zachytil jsem agenta v činnosti')
    : nove.length <= 4 ? tr('Zachytil jsem {0} agenty v činnosti', nove.length) : tr('Zachytil jsem {0} agentů v činnosti', nove.length);
  const uvod = !naMacu() ? tr('Do Mých nástrojů je přidáš v Agenteeq na {0}.', tomtoPocitaci())
    : nove.every((n) => n.sledovano) ? '' : tr('Přidané uvidíš v Mých nástrojích a předplatné zapíšeš jedním klikem.');
  return `<div class="det-panel" role="region" aria-labelledby="det-h">
    <div class="det-head">
      <span class="det-pulse" aria-hidden="true"></span>
      <h2 id="det-h">${esc(nadpis)}</h2>
      <button class="icon-btn det-later" type="button" data-nastroj-pozdeji aria-label="${tr('Připomenout později')}">${ICON.close}</button>
    </div>
    ${uvod ? `<p class="det-uvod">${esc(uvod)}</p>` : ''}
    <ul class="det-list">${nove.map((n) => polozka(zivy(n))).join('')}</ul>
  </div>`;
}

async function rozhodni(btn) {
  const { id } = btn.dataset;
  const akce = btn.dataset.nastrojAkce;
  const nazev = [...(state.detekce?.nove || []), ...(state.detekce?.moje || []), ...(state.detekce?.ignorovane || [])].find((n) => n.id === id)?.name || tr('Nástroj');
  btn.disabled = true;
  try {
    state.detekce = await api.nastroj(id, akce);
    // Přehled, Nastavení i karta se překreslí přes stejné téma jako při změně ze serveru.
    emit('detekce');
    if (akce === 'pridat') toast(tr('{0} je v Mých nástrojích', nazev), { tone: 'ok' });
    if (akce === 'ignorovat') toast(tr('{0} už hlásit nebudu', nazev), { tone: 'info' });
    if (akce === 'odebrat') toast(tr('{0} je odebraný z Mých nástrojů', nazev), { tone: 'info' });
  } catch (err) {
    btn.disabled = false;
    toast(err.message, { tone: 'err', timeout: 9000 });
  }
}

let box = null;
function vykresli() {
  if (!box) return;
  const html = detekceHtml();
  if (box.innerHTML !== html) box.innerHTML = html;
}

// Rozhraní, které je vidět, se hlásí serveru – oznámení macOS pak chodí jen se zavřeným oknem.
function hlasPritomnost() {
  if (!naMacu()) return;
  const videt = document.visibilityState === 'visible';
  api.pritomnost(videt).catch(() => { /* telefon smí jen číst; na tom nic nezávisí */ });
}

export function mountDetekce() {
  if (box) return;
  box = document.createElement('section');
  box.className = 'detekce';
  box.setAttribute('aria-live', 'polite');
  document.body.append(box);
  subscribe((t) => { if (t.has('all') || t.has('detekce') || t.has('settings') || t.has('runtimes')) vykresli(); });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-nastroj-akce]');
    if (btn) { e.preventDefault(); rozhodni(btn); return; }
    if (e.target.closest?.('[data-jit-rozsireni]')) { goToExtension(); return; }
    if (e.target.closest?.('[data-nastroj-pozdeji]')) {
      for (const n of state.detekce?.nove || []) zavrene.add(n.id);
      vykresli();
    }
  });
  hlasPritomnost();
  document.addEventListener('visibilitychange', hlasPritomnost);
  setInterval(() => { if (document.visibilityState === 'visible') hlasPritomnost(); }, 30_000);
  vykresli();
}

/* ---------- Moje nástroje (Nastavení → Propojení) ---------- */

export function mujRadek(n) {
  return `<li class="moje-item">
    <span class="lwin-logo">${logo(n)}</span>
    <div class="moje-main">
      <b>${esc(n.name)}</b>
      <span class="moje-stav${n.bezi ? ' is-running' : ''}">${n.bezi ? '<i class="moje-dot" aria-hidden="true"></i>' : ''}${esc(kdeKdy(n))}</span>
    </div>
    ${naMacu() ? `<div class="moje-akce">
      <a class="btn btn--sm" href="${esc(predplatneHref(n))}">${tr('Zapsat předplatné')}</a>
      <button class="btn btn--sm" type="button" data-nastroj-akce="odebrat" data-id="${esc(n.id)}" aria-label="${esc(tr('Odebrat {0} z Mých nástrojů', n.name))}">${tr('Odebrat')}</button>
    </div>` : ''}
  </li>`;
}

export function ignorovanyRadek(n) {
  return `<li class="moje-item">
    <span class="lwin-logo">${logo(n)}</span>
    <div class="moje-main"><b>${esc(n.name)}</b><span class="moje-stav">${esc(druhNazev(n))}</span></div>
    ${naMacu() ? `<div class="moje-akce"><button class="btn btn--sm" type="button" data-nastroj-akce="pridat" data-id="${esc(n.id)}" aria-label="${esc(tr('Přidat {0} do Mých nástrojů', n.name))}">${ICON.plus}${tr('Přidat')}</button></div>` : ''}
  </li>`;
}

export const mojeZive = () => (state.detekce?.moje || []).map((n) => zivy(n));

