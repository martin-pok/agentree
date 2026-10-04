// Nově zachycené AI nástroje (karta v Přehledu) a Moje nástroje. Data drží server
// (src/detekce.js), tady se jen zobrazují a posílají rozhodnutí. Karta zůstane, dokud uživatel
// nerozhodne – křížek ji schová jen do dalšího spuštění aplikace.
import { api } from './api.js';
import { state, emit } from './state.js';
import { esc } from './format.js';
import { tr, tomtoPocitaci } from './i18n.js';
import { druhNazev, zivy as zivyZ, kdeKdy } from './nastroje.js';
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

// Co z nástroje Agenteeq uvidí – jeden krátký štítek místo vět. Webová služba, kterou zná
// rozšíření prohlížeče, a rozšíření ještě není spárované: štítek je rovnou odkaz na nastavení.
function stitek(n) {
  if (!n.sledovano && UMI_ROZSIRENI.has(n.id) && (state.connectors || []).find((c) => c.id === 'web')?.state !== 'connected') {
    return `<button class="pill pill--link" type="button" data-jit-rozsireni>${tr('Nastavit rozšíření')}</button>`;
  }
  if (n.sledovano || n.umiCist || UMI_ROZSIRENI.has(n.id)) return `<span class="pill" data-tone="ok">${n.sledovano || n.umiCist ? tr('Konverzace i tokeny') : tr('Stav přes rozšíření')}</span>`;
  return `<span class="pill">${tr('Jen stav běhu')}</span>`;
}

function radek(n) {
  const akce = !naMacu() ? ''
    : n.sledovano
      ? `<button class="btn btn--sm" type="button" data-nastroj-akce="rozumim" data-id="${esc(n.id)}" aria-label="${esc(tr('Potvrdit {0}', n.name))}">${tr('Rozumím')}</button>`
      : `<button class="btn btn--sm" type="button" data-nastroj-akce="ignorovat" data-id="${esc(n.id)}" aria-label="${esc(tr('Nesledovat {0}', n.name))}">${tr('Nesledovat')}</button>
         <button class="btn btn--sm btn--primary" type="button" data-nastroj-akce="pridat" data-id="${esc(n.id)}" aria-label="${esc(tr('Přidat {0} do Mých nástrojů', n.name))}">${tr('Sledovat')}</button>`;
  return `<li class="nt-row">
    <span class="lwin-logo">${logo(n)}</span>
    <span class="nt-main"><b>${esc(n.name)}</b><span class="nt-meta">${esc(kdeKdy(n))}</span></span>
    ${stitek(n)}
    ${akce ? `<span class="nt-akce">${akce}</span>` : ''}
  </li>`;
}

// Nově zachycené nástroje jako karta v Přehledu (views/overview.js) – žádné plovoucí okno.
// Vykresluje se přes fill(), který mění DOM jen při změně textu: řádek „běží od 11:20“ je
// stálý, takže živé události karta nepřekreslí a nic nebliká.
// Víc nových nástrojů naráz (první spuštění) by kartou odsunulo celý Přehled: vidět jsou čtyři,
// zbytek po rozbalení. Rozbalení přežije živé překreslení.
const NAHLED = 4;
let rozbaleno = false;

export function noveNastrojeHtml() {
  const nove = viditelneNove();
  if (!nove.length || state.settings?.notifications?.detekce === false) return '';
  return `<section class="card new-tools" aria-labelledby="nt-h">
    <div class="nt-head">
      <h2 id="nt-h">${nove.length === 1 ? tr('Nový AI nástroj na {0}', tomtoPocitaci()) : tr('Nové AI nástroje na {0}', tomtoPocitaci())}</h2>
      <button class="icon-btn" type="button" data-nastroj-pozdeji aria-label="${tr('Skrýt do příštího spuštění')}" title="${tr('Skrýt do příštího spuštění')}">${ICON.close}</button>
    </div>
    ${naMacu() ? '' : `<p class="nt-uvod">${esc(tr('Do Mých nástrojů je přidáš v Agenteeq na {0}.', tomtoPocitaci()))}</p>`}
    <ul class="nt-list">${nove.slice(0, rozbaleno ? nove.length : NAHLED).map((n) => radek(zivy(n))).join('')}</ul>
    ${nove.length > NAHLED ? `<button class="link nt-dalsi" type="button" data-nastroje-rozbalit aria-expanded="${rozbaleno}">${rozbaleno ? tr('Zobrazit méně') : tr('Zobrazit další ({0})', nove.length - NAHLED)}</button>` : ''}
  </section>`;
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

// Rozhraní, které je vidět, se hlásí serveru – oznámení macOS pak chodí jen se zavřeným oknem.
function hlasPritomnost() {
  if (!naMacu()) return;
  const videt = document.visibilityState === 'visible';
  api.pritomnost(videt).catch(() => { /* telefon smí jen číst; na tom nic nezávisí */ });
}

let pripojeno = false;
export function mountDetekce() {
  if (pripojeno) return;
  pripojeno = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-nastroj-akce]');
    if (btn) { e.preventDefault(); rozhodni(btn); return; }
    if (e.target.closest?.('[data-jit-rozsireni]')) { goToExtension(); return; }
    if (e.target.closest?.('[data-nastroje-rozbalit]')) { rozbaleno = !rozbaleno; emit('detekce'); return; }
    if (e.target.closest?.('[data-nastroj-pozdeji]')) {
      for (const n of state.detekce?.nove || []) zavrene.add(n.id);
      emit('detekce');
    }
  });
  hlasPritomnost();
  document.addEventListener('visibilitychange', hlasPritomnost);
  setInterval(() => { if (document.visibilityState === 'visible') hlasPritomnost(); }, 30_000);
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
