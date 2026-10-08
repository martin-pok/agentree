// Kontextová rada robota nad obsahem stránky. Dá se skrýt (pamatuje si to jen tahle relace)
// a nikdy nepřekrývá práci. Texty jdou přes tr(), aby fungovala i angličtina.
import { robot } from './home-studio.js';
import { tr } from './i18n.js';

const TIPY = () => ({
  prehled: [tr('Začni jedním zadáním.'), tr('Vyber agenta a napiš, co má udělat. Složku, projekt a režim najdeš v Možnostech zadání.')],
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

export function robotGuide(root) {
  const route = location.hash.replace(/^#\//, '').split(/[/?]/)[0] || 'prehled';
  if (root.querySelector('.robot-guide')) return;
  const tip = TIPY()[route];
  if (!tip) return;
  let skryto = false;
  try { skryto = sessionStorage.getItem(`robot-tip:${route}`) === 'closed'; } catch { /* bez úložiště */ }
  const guide = document.createElement('aside');
  guide.className = 'robot-guide';
  guide.setAttribute('aria-label', tr('Tip k této stránce'));
  guide.innerHTML = `<span class="guide-robot" style="--persona:#6260d8">${robot('Orbit')}</span><div class="guide-copy"><span class="guide-label">${tr('Malý tip')}</span><strong>${tip[0]}</strong><p>${tip[1]}</p></div><div class="guide-controls"><button class="mascot-motion-toggle" data-mascot-motion type="button" aria-pressed="true">${tr('Ztišit pohyb')}</button><button class="guide-toggle" type="button"></button></div>`;
  const prepni = guide.querySelector('.guide-toggle');
  const nastav = () => {
    guide.classList.toggle('is-quiet', skryto);
    prepni.textContent = skryto ? tr('Tip') : '×';
    prepni.setAttribute('aria-expanded', String(!skryto));
    prepni.setAttribute('aria-label', skryto ? tr('Zobrazit radu') : tr('Skrýt radu'));
  };
  prepni.onclick = () => {
    skryto = !skryto;
    nastav();
    try { sessionStorage.setItem(`robot-tip:${route}`, skryto ? 'closed' : 'open'); } catch { /* bez úložiště */ }
  };
  nastav();
  root.prepend(guide);
  document.dispatchEvent(new CustomEvent('robot:guide-ready'));
}
