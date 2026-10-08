import { robot } from './home-studio.js';
const tips = {
 prehled: ['Začni jedním zadáním.', 'Vyber agenta a napiš, co má udělat. Složku, projekt a režim najdeš v Možnostech zadání.'],
 agenti: ['Kdo potřebuje tvoji pozornost?', 'Filtr „Potřebuje tebe“ ukáže agenty čekající na rozhodnutí. Otevři agenta a pokračuj v jeho nástroji.'],
 agent: ['Rozhodnutí patří tobě.', 'Přepis ukazuje kontext. Tlačítko „Pokračovat“ tě přenese do nástroje, kde agent čeká na odpověď.'],
 projekty: ['Dej související práci k sobě.', 'Projekt propojí konverzace z různých nástrojů. V Nezařazených najdeš práci, která zatím projekt nemá.'],
 projekt: ['Jeden projekt, více agentů.', 'V detailu projektu najdeš jeho konverzace a aktivitu napříč nástroji.'],
 statistiky: ['Tokeny nejsou účet.', 'Tokeny z přepisů popisují zaznamenanou aktivitu. Skutečné účtované náklady hledej v Útratě po propojení API.'],
 utrata: ['Chybějící cena není nula.', 'Bez propojeného API nejsou skutečné náklady dostupné. Ruční záznamy a předplatné uvidíš odděleně.'],
 upozorneni: ['Nejdřív to, co tě blokuje.', 'Otevři souvisejícího agenta a zjisti, co potřebuje. Přečtení upozornění samo požadavek agenta nevyřeší.'],
 dovednosti: ['Dovednosti dávají agentům postup.', 'Tady můžeš procházet nalezené dovednosti. Jejich dostupnost závisí na připojených nástrojích a zdrojích.'],
 nastaveni: ['Udělej si tu pohodlí.', 'V části Účet a vzhled změníš téma aplikace. Vlastního robota a jméno agenta upravíš na Přehledu.'],
};
export function robotGuide(root) {
 const route = location.hash.replace(/^#\//, '').split(/[/?]/)[0] || 'prehled';
 if (root.querySelector('.robot-guide')) return;
 const tip = tips[route]; if (!tip) return;
 let dismissed = false;
 try { dismissed = sessionStorage.getItem(`robot-tip:${route}`) === 'closed'; } catch { /* optional */ }
 const guide = document.createElement('aside');
 guide.className = 'robot-guide'; guide.setAttribute('aria-label', 'Tip k této stránce');
 guide.innerHTML = `<span class="guide-robot" style="--persona:#6260d8">${robot('Orbit')}</span><div class="guide-copy"><span class="guide-label">MALÝ TIP</span><strong>${tip[0]}</strong><p>${tip[1]}</p></div><div class="guide-controls"><button class="mascot-motion-toggle" data-mascot-motion type="button" aria-pressed="true">Ztišit pohyb</button><button class="guide-toggle" type="button" aria-expanded="${!dismissed}" aria-label="${dismissed ? 'Zobrazit radu' : 'Skrýt radu'}">${dismissed ? 'Tip' : '×'}</button></div>`;
 guide.classList.toggle('is-quiet', dismissed);
 guide.querySelector('.guide-toggle').onclick = () => {
  dismissed = !dismissed;
  guide.classList.toggle('is-quiet', dismissed);
  const button = guide.querySelector('.guide-toggle');
  button.textContent = dismissed ? 'Tip' : '×';
  button.setAttribute('aria-expanded', String(!dismissed));
  button.setAttribute('aria-label', dismissed ? 'Zobrazit radu' : 'Skrýt radu');
  try { sessionStorage.setItem(`robot-tip:${route}`, dismissed ? 'closed' : 'open'); } catch { /* optional */ }
 };
 root.prepend(guide);
 document.dispatchEvent(new CustomEvent('robot:guide-ready'));
}
