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

// Rozhodovat smí jen okno na počítači s Agenteeq – telefon je jen ke čtení (src/remote-scope.js).
const naMacu = () => Boolean(window.agenteeqDesktop) || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

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
    ${r.podrobnost ? `<pre class="rozh-prikaz">${esc(r.podrobnost)}</pre>` : ''}
    ${r.cwd ? `<p class="rozh-slozka">${ICON.folder}<span>${esc(r.cwd)}</span></p>` : ''}
    <p class="rozh-cas" data-rozh-cas>${esc(tr('Bez rozhodnutí se za {0} s zeptá v terminálu.', zbyva(r)))}</p>
    <footer class="rozh-akce">
      <button type="button" class="btn" data-rozh-akce="zamitnout"${ceka ? ' disabled' : ''}>${tr('Zamítnout')}</button>
      <button type="button" class="btn btn--primary" data-rozh-akce="povolit"${ceka ? ' disabled' : ''}>${tr('Povolit')}</button>
    </footer>
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
}

function odpocet() {
  let konec = false;
  for (const r of state.rozhodnuti || []) {
    const el = oblast.querySelector(`[data-rozh="${CSS.escape(r.id)}"] [data-rozh-cas]`);
    if (!el) continue;
    const s = zbyva(r);
    if (s <= 0) konec = true;
    else el.textContent = tr('Bez rozhodnutí se za {0} s zeptá v terminálu.', s);
  }
  if (konec) vykresli();
}

async function rozhodni(tlacitko) {
  const el = tlacitko.closest('[data-rozh]');
  const id = el?.dataset.rozh;
  if (!id || odeslane.has(id)) return;
  odeslane.add(id);
  el.querySelectorAll('[data-rozh-akce]').forEach((b) => { b.disabled = true; });
  const akce = tlacitko.dataset.rozhAkce;
  try {
    await api.rozhodnout(id, akce);
    toast(akce === 'povolit' ? tr('Povoleno. Agent pokračuje.') : tr('Zamítnuto. Agent dostal zprávu, že akci nechceš.'), { tone: 'ok' });
  } catch (err) {
    odeslane.delete(id);
    toast(err.message || tr('Rozhodnutí se nepodařilo odeslat. Agent se zeptá v terminálu.'), { tone: 'err', timeout: 8000 });
    el.querySelectorAll('[data-rozh-akce]').forEach((b) => { b.disabled = false; });
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
  oblast.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rozh-akce]');
    if (b && !b.disabled) rozhodni(b);
  });
  subscribe((topics) => {
    if (!topics || topics.has?.('rozhodnuti') || topics.has?.('all')) vykresli();
  });
  vykresli();
}
