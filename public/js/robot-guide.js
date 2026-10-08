// Robot průvodce. Na Přehledu má vlastní panel u pozdravu (public/js/home-studio.js); jinde
// nezabírá místo v obsahu – je to malý plovoucí robot vpravo dole, který po klepnutí (nebo
// najetí myší) ukáže krátkou radu k právě otevřené stránce. Poprvé na každé stránce radu
// nabídne sám a po chvíli ji zase schová; potom už jen na požádání. Co už člověk viděl,
// si pamatuje jen tento prohlížeč. Nikdy nepřekrývá dialogy a na telefonu sedí nad lištou.
import { robot } from './home-studio.js';
import { tr } from './i18n.js';

const TIPY = () => ({
  agenti: [tr('Kdo potřebuje tvoji pozornost?'), tr('Filtr „Potřebuje tebe“ ukáže agenty čekající na rozhodnutí. Otevři agenta a pokračuj v jeho nástroji.')],
  agent: [tr('Rozhodnutí patří tobě.'), tr('Přepis ukazuje kontext. Tlačítko „Pokračovat“ tě přenese do nástroje, kde agent čeká na odpověď.')],
  projekty: [tr('Dej související práci k sobě.'), tr('Projekt propojí konverzace z různých nástrojů. V Nezařazených najdeš práci, která zatím projekt nemá.')],
  projekt: [tr('Jeden projekt, více agentů.'), tr('V detailu projektu najdeš jeho konverzace a aktivitu napříč nástroji.')],
  statistiky: [tr('Tokeny nejsou účet.'), tr('Tokeny z přepisů popisují zaznamenanou aktivitu. Skutečné účtované náklady hledej v Útratě po propojení API.')],
  utrata: [tr('Chybějící cena není nula.'), tr('Bez propojeného API nejsou skutečné náklady dostupné. Ruční záznamy a předplatné uvidíš odděleně.')],
  upozorneni: [tr('Nejdřív to, co tě blokuje.'), tr('Otevři souvisejícího agenta a zjisti, co potřebuje. Přečtení upozornění samo požadavek agenta nevyřeší.')],
  dovednosti: [tr('Dovednosti dávají agentům postup.'), tr('Tady můžeš procházet nalezené dovednosti. Jejich dostupnost závisí na připojených nástrojích a zdrojích.')],
  nastaveni: [tr('Udělej si tu pohodlí.'), tr('V části Účet a vzhled změníš téma aplikace. Vlastního robota a jméno agenta upravíš na Přehledu.')],
});

const VIDENO = 'agenteeq:robot-tip:';
const SAM_SCHOVAT_MS = 9000;
const trasa = () => location.hash.replace(/^#\//, '').split(/[/?]/)[0] || 'prehled';
const videl = (r) => { try { return localStorage.getItem(VIDENO + r) === '1'; } catch { return true; } };
const oznac = (r) => { try { localStorage.setItem(VIDENO + r, '1'); } catch { /* bez úložiště */ } };

let el = null;
let casovac = 0;
let posledni = '';

function sestav() {
  el = document.createElement('div');
  el.className = 'robot-float';
  el.innerHTML = `<div class="robot-bubble" id="robot-bubble" role="dialog" aria-labelledby="robot-bubble-h" hidden>
      <span class="guide-label">${tr('Malý tip')}</span>
      <strong id="robot-bubble-h"></strong>
      <p></p>
      <div class="robot-bubble-foot">
        <button class="mascot-motion-toggle" data-mascot-motion type="button" aria-pressed="true">${tr('Ztišit pohyb')}</button>
        <button class="robot-bubble-close" type="button" aria-label="${tr('Skrýt radu')}">×</button>
      </div>
    </div>
    <button class="robot-fab" type="button" aria-expanded="false" aria-controls="robot-bubble" aria-label="${tr('Tip k této stránce')}">
      <span class="guide-robot" style="--persona:#6260d8">${robot('Orbit')}</span>
    </button>`;
  const fab = el.querySelector('.robot-fab');
  // Klepnutí radu připíchne – i když ji právě ukázalo najetí myší; teprve klepnutí na připíchnutou ji schová.
  fab.addEventListener('click', () => (el.querySelector('.robot-bubble').hidden || el.dataset.sama === '1' ? ukaz() : schovej()));
  el.querySelector('.robot-bubble-close').addEventListener('click', () => { schovej(); fab.focus({ preventScroll: true }); });
  // Najetí myší jen nabídne radu; klepnutím zůstane otevřená. Dotyk hover nemá.
  fab.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && el.querySelector('.robot-bubble').hidden) ukaz({ sama: true }); });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && el.dataset.sama === '1') schovej(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.querySelector('.robot-bubble').hidden) { e.stopPropagation(); schovej(); fab.focus({ preventScroll: true }); } });
  document.body.append(el);
  document.dispatchEvent(new CustomEvent('robot:guide-ready'));
}

function ukaz({ sama = false } = {}) {
  const tip = TIPY()[trasa()];
  if (!tip || !el) return;
  clearTimeout(casovac);
  const bublina = el.querySelector('.robot-bubble');
  bublina.querySelector('strong').textContent = tip[0];
  bublina.querySelector('p').textContent = tip[1];
  bublina.hidden = false;
  el.dataset.sama = sama ? '1' : '';
  el.querySelector('.robot-fab').setAttribute('aria-expanded', 'true');
  oznac(trasa());
  if (sama) casovac = setTimeout(schovej, SAM_SCHOVAT_MS);
}

function schovej() {
  clearTimeout(casovac);
  if (!el) return;
  el.querySelector('.robot-bubble').hidden = true;
  el.dataset.sama = '';
  el.querySelector('.robot-fab').setAttribute('aria-expanded', 'false');
}

/** Volá se po každém vykreslení stránky (public/js/app.js). */
export function robotGuide() {
  const r = trasa();
  const tip = TIPY()[r];
  if (!el) sestav();
  // Přehled má robota v panelu u pozdravu; stránka bez rady plovoucího robota nepotřebuje.
  el.hidden = !tip;
  if (r === posledni) return;
  posledni = r;
  schovej();
  // Poprvé na stránce se rada nabídne sama – až po vykreslení, ať nebliká přes načítání.
  if (tip && !videl(r)) casovac = setTimeout(() => ukaz({ sama: true }), 1200);
}
