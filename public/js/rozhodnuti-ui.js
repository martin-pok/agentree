// Žádosti agentů o povolení, o kterých jde rozhodnout přímo tady (src/rozhodnuti.js). Karta ukáže,
// co přesně agent chce udělat (celý příkaz nebo soubor), a tlačítka Povolit / Zamítnout. Když tu
// nikdo nerozhodne, karta po odpočtu zmizí a Claude Code se zeptá v terminálu – nic se samo
// nezamítne ani nepovolí. Fokus se nikam nepřesouvá: člověk může zrovna psát jinde.
import { api } from './api.js';
import { state, subscribe } from './state.js';
import { esc } from './format.js';
import { glyph, ICON } from './icons.js';
import { toast } from './ui.js';
import { tr } from './i18n.js';
import { naMacu, tlacitkaRozhodnuti, podrobnostiRozhodnuti, textOdpoctu } from './rozhodnuti-data.js';

let oblast = null;
let tik = 0;
const odeslane = new Set();

const zbyva = (r) => Math.max(0, Math.ceil((r.do - Date.now()) / 1000));

function nazevKonverzace(r) {
  const s = state.sessions?.get?.(`claude-code:${r.sessionId}`);
  return s?.title || s?.firstPrompt || '';
}

function karta(r) {
  const nazev = nazevKonverzace(r);
  const ceka = odeslane.has(r.id);
  return `<article class="rozh-karta" data-rozh="${esc(r.id)}" aria-labelledby="rozh-${esc(r.id)}">
    <header class="rozh-head"><span class="rozh-logo" aria-hidden="true">${glyph('claude')}</span>
      <div><h2 id="rozh-${esc(r.id)}">${esc(tr('Claude Code žádá o povolení'))}</h2>${nazev ? `<p class="rozh-nazev">${esc(nazev)}</p>` : ''}</div></header>
    <p class="rozh-popis">${esc(r.popis || r.nastroj)}</p>
    ${podrobnostiRozhodnuti(r, { ikonaSlozky: ICON.folder })}
    <footer class="rozh-akce">${tlacitkaRozhodnuti(r, { odeslano: ceka })}</footer>
  </article>`;
}

function vykresli() {
  const list = (state.rozhodnuti || []).filter((r) => zbyva(r) > 0);
  if (!list.length) {
    oblast.hidden = true;
    oblast.innerHTML = '';
    clearInterval(tik);
    tik = 0;
    return;
  }
  // Jen nové a zmizelé karty se mění; existující zůstanou (fokus na tlačítku se neztratí).
  const ids = new Set(list.map((r) => r.id));
  for (const el of oblast.querySelectorAll('[data-rozh]')) if (!ids.has(el.dataset.rozh)) el.remove();
  for (const r of list) {
    if (!oblast.querySelector(`[data-rozh="${CSS.escape(r.id)}"]`)) oblast.insertAdjacentHTML('beforeend', karta(r));
  }
  oblast.hidden = false;
  if (!tik) tik = setInterval(odpocet, 1000);
  requestAnimationFrame(schovejDvojniky);
}

// Když jsou tlačítka téže žádosti vidět přímo na stránce (Vyžaduje pozornost, detail agenta), karta
// v rohu by je jen zakrývala – schová se. Jinde (jiná stránka, odrolováno) zůstane.
function schovejDvojniky() {
  if (!oblast) return;
  let vidno = 0;
  for (const karta of oblast.querySelectorAll('[data-rozh]')) {
    const id = karta.dataset.rozh;
    const naStrance = [...document.querySelectorAll(`[data-rozh-id="${CSS.escape(id)}"]`)].some((b) => {
      if (oblast.contains(b)) return false;
      const rect = b.getBoundingClientRect();
      return rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
    });
    karta.hidden = naStrance;
    if (!naStrance) vidno++;
  }
  oblast.hidden = vidno === 0;
}

// Odpočet běží u každé kopie žádosti na stránce (roh, Přehled, detail agenta), ne jen v rohu.
function odpocet() {
  const ted = Date.now();
  for (const el of document.querySelectorAll('[data-rozh-cas][data-rozh-do]')) {
    const s = Math.max(0, Math.ceil((Number(el.dataset.rozhDo) - ted) / 1000));
    if (s > 0) el.textContent = textOdpoctu(s);
  }
  if ((state.rozhodnuti || []).some((r) => zbyva(r) <= 0 && oblast.querySelector(`[data-rozh="${CSS.escape(r.id)}"]`))) vykresli();
}

// Všechna tlačítka téže žádosti (roh, Přehled, detail agenta) se zamknou naráz.
const tlacitkaZadosti = (id) => document.querySelectorAll(`[data-rozh-id="${CSS.escape(id)}"]`);

async function rozhodni(tlacitko) {
  const id = tlacitko.dataset.rozhId;
  if (!id || odeslane.has(id)) return;
  odeslane.add(id);
  tlacitkaZadosti(id).forEach((b) => { b.disabled = true; });
  const akce = tlacitko.dataset.rozhAkce;
  try {
    await api.rozhodnout(id, akce);
    toast(akce === 'zamitnout' ? tr('Zamítnuto. Agent dostal zprávu, že akci nechceš.') : akce === 'povolit-vzdy' ? tr('Povoleno. Na stejnou akci se Claude Code příště nezeptá.') : tr('Povoleno. Agent pokračuje.'), { tone: 'ok' });
  } catch (err) {
    odeslane.delete(id);
    toast(err.message || tr('Rozhodnutí se nepodařilo odeslat. Agent se zeptá v terminálu.'), { tone: 'err', timeout: 8000 });
    tlacitkaZadosti(id).forEach((b) => { b.disabled = false; });
  }
}

export function initRozhodnuti() {
  if (oblast || !naMacu()) return;
  oblast = document.createElement('section');
  oblast.className = 'rozh-oblast';
  oblast.hidden = true;
  oblast.setAttribute('aria-label', tr('Žádosti agentů o povolení'));
  oblast.setAttribute('aria-live', 'polite');
  document.body.append(oblast);
  // Na dokumentu: tlačítka stojí i na Přehledu a v detailu agenta.
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-rozh-akce][data-rozh-id]');
    if (b && !b.disabled) rozhodni(b);
  });
  subscribe((topics) => {
    if (!topics || topics.has?.('rozhodnuti') || topics.has?.('all')) vykresli();
    else if (oblast.childElementCount) requestAnimationFrame(schovejDvojniky);
  });
  let posun = 0;
  const pozdeji = () => { if (!posun && oblast.childElementCount) posun = requestAnimationFrame(() => { posun = 0; schovejDvojniky(); }); };
  window.addEventListener('hashchange', () => setTimeout(pozdeji, 50));
  window.addEventListener('scroll', pozdeji, { passive: true });
  window.addEventListener('resize', pozdeji);
  vykresli();
}
