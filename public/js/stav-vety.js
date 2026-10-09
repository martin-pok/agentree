// Věty o stavu agentů na Přehledu. Každá vrstva říká něco jiného: pozdrav radí, co dělat dál
// (bez počtů), box Stav agentů dá jednu větu s výsledkem a dlaždice pod ní nesou čísla. Dřív
// všechny tři opakovaly totéž („Na tvé rozhodnutí čeká agentů: 1“) a pozdrav navíc vysvětloval,
// kde co je. Čisté funkce bez DOM, ať jde každou variantu stavu ověřit testem.
import { tr } from './i18n.js';
import { plural } from './format.js';

/** Věta pod pozdravem „Co dnes posuneme dál?“. Počty nenese – ty patří dlaždicím. */
export function vetaPozdravu({ cekaji = 0, pracuji = 0 } = {}) {
  if (cekaji) return plural(cekaji, 'Nejdřív rozhodni, co agent potřebuje – pak může pokračovat.', 'Nejdřív rozhodni, co agenti potřebují – pak můžou pokračovat.', 'Nejdřív rozhodni, co agenti potřebují – pak můžou pokračovat.');
  if (pracuji) return plural(pracuji, 'Další úkol můžeš zadat hned, nemusíš čekat, až agent doběhne.', 'Další úkol můžeš zadat hned, nemusíš čekat, až agenti doběhnou.', 'Další úkol můžeš zadat hned, nemusíš čekat, až agenti doběhnou.');
  return tr('Zadej práci. Agenti se pustí do díla, ty máš prostor na to podstatné.');
}

/**
 * Výsledek boxu Stav agentů: `stav` (problem / pozor / nevim / ok) řídí barvu tečky, `veta` je
 * jedna věta se správným tvarem podle počtu. Když se nepodařilo zjistit, co na počítači běží,
 * a zároveň je co hlásit o agentech, nese to `poznamka` – selhání zjišťování nesmí zmizet jen
 * proto, že má přednost jiná zpráva.
 */
export function stavAgentu({ pracuje = 0, cekaji = 0, selhalo = 0, limit = 0, procesyNevim = false } = {}) {
  const problemy = selhalo + limit;
  const stav = problemy ? 'problem' : cekaji ? 'pozor' : procesyNevim ? 'nevim' : 'ok';
  let veta;
  if (stav === 'problem') {
    veta = (!limit ? plural(selhalo, 'Selhal {0} agent', 'Selhali {0} agenti', 'Selhalo {0} agentů')
      : !selhalo ? plural(limit, 'Na limit narazil {0} agent', 'Na limit narazili {0} agenti', 'Na limit narazilo {0} agentů')
        : plural(problemy, 'Problém má {0} agent', 'Problém mají {0} agenti', 'Problém má {0} agentů')).replace('{0}', problemy);
  } else if (stav === 'pozor') {
    veta = plural(cekaji, 'Čeká na tebe {0} agent', 'Čekají na tebe {0} agenti', 'Čeká na tebe {0} agentů').replace('{0}', cekaji);
  } else if (stav === 'nevim') {
    veta = tr('Nepodařilo se zjistit, co na počítači běží');
  } else {
    veta = pracuje ? tr('Vše běží v pořádku') : tr('V pořádku, nikdo nepracuje');
  }
  const poznamka = procesyNevim && stav !== 'nevim' ? tr('Nepodařilo se zjistit, co na počítači běží') : '';
  return { stav, veta, poznamka };
}
