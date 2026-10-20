// Věty o stavu agentů na Přehledu. Každá vrstva říká něco jiného: pozdrav radí, co dělat dál
// (bez počtů), box Stav agentů dá jednu větu s výsledkem a dlaždice pod ní nesou čísla. Dřív
// všechny tři opakovaly totéž („Na tvé rozhodnutí čeká agentů: 1“) a pozdrav navíc vysvětloval,
// kde co je. Čisté funkce bez DOM, ať jde každou variantu stavu ověřit testem.
import { tr } from './i18n.js';
import { plural, rel } from './format.js';

/** Věta pod pozdravem „Co dnes posuneme dál?“. Počty nenese – ty patří dlaždicím. */
export function vetaPozdravu({ cekaji = 0, pracuji = 0 } = {}) {
  if (cekaji) return plural(cekaji, 'Nejdřív rozhodni, ať agent může pokračovat.', 'Nejdřív rozhodni, ať agenti můžou pokračovat.', 'Nejdřív rozhodni, ať agenti můžou pokračovat.');
  if (pracuji) return plural(pracuji, 'Další úkol můžeš zadat hned, nemusíš čekat, až agent doběhne.', 'Další úkol můžeš zadat hned, nemusíš čekat, až agenti doběhnou.', 'Další úkol můžeš zadat hned, nemusíš čekat, až agenti doběhnou.');
  return tr('Zadej agentovi úkol.');
}

/**
 * Výsledek boxu Stav agentů: `stav` (problem / pozor / nevim / ok) řídí barvu tečky, `veta` je
 * jedna věta se správným tvarem podle počtu. Když se nepodařilo zjistit, co na počítači běží,
 * a zároveň je co hlásit o agentech, nese to `poznamka` – selhání zjišťování nesmí zmizet jen
 * proto, že má přednost jiná zpráva.
 */
// Vzdálené relace Claude Code (v cloudu) Agenteeq zná jen z cache Claude Desktopu. „Pracuje“ z ní
// platí 2 minuty od uložení seznamu (src/connectors/claude-desktop-code.js); starší cache o běhu
// v cloudu nic neříká, takže „nikdo nepracuje“ by bylo tvrzení bez dat.
const VZDALENE_CERSTVE = 2 * 60e3;

// `nevidim`: jména otevřených AI aplikací, jejichž chaty Agenteeq nečte (ChatGPT, Claude…). Když
// nikdo nepracuje, řekne to poznámka – „nikdo nepracuje“ platí jen pro to, co Agenteeq vidí.
export function stavAgentu({ pracuje = 0, cekaji = 0, selhalo = 0, limit = 0, procesyNevim = false, vzdaleneAt = 0, nevidim = [], now = Date.now() } = {}) {
  const problemy = selhalo + limit;
  const stav = problemy ? 'problem' : cekaji ? 'pozor' : procesyNevim ? 'nevim' : 'ok';
  const vzdaleneStare = vzdaleneAt > 0 && now - vzdaleneAt > VZDALENE_CERSTVE;
  let veta;
  if (stav === 'problem') {
    veta = (!limit ? plural(selhalo, 'Selhal {0} agent', 'Selhali {0} agenti', 'Selhalo {0} agentů')
      : !selhalo ? plural(limit, 'Na limit narazil {0} agent', 'Na limit narazili {0} agenti', 'Na limit narazilo {0} agentů')
        : plural(problemy, 'Problém má {0} agent', 'Problém mají {0} agenti', 'Problém má {0} agentů')).replace('{0}', problemy);
  } else if (stav === 'pozor') {
    veta = plural(cekaji, 'Potřebuje tě {0} agent', 'Potřebují tě {0} agenti', 'Potřebuje tě {0} agentů').replace('{0}', cekaji);
  } else if (stav === 'nevim') {
    veta = tr('Nepodařilo se zjistit, co na počítači běží');
  } else {
    veta = pracuje ? tr('Vše běží v pořádku') : vzdaleneStare ? tr('Na tomto počítači nikdo nepracuje') : tr('V pořádku, nikdo nepracuje');
  }
  const poznamka = procesyNevim && stav !== 'nevim' ? tr('Nepodařilo se zjistit, co na počítači běží')
    : vzdaleneStare ? tr('Agenty v cloudu znám jen z Claude Desktopu, naposledy {0}.', rel(vzdaleneAt, now))
      : stav === 'ok' && !pracuje && nevidim.length ? tr('Otevřené: {0}. Chaty z těchto aplikací Agenteeq nevidí.', nevidim.join(', ')) : '';
  return { stav, veta, poznamka };
}

/**
 * Popisek pod číslem v dlaždici s počtem agentů (box Stav agentů, odznak v nabídce, přehled účtu).
 * Číslo je podmět a sloveso se s ním shoduje: „1 pracuje“, „3 pracují“, „5 pracuje“. Dřív byl
 * popisek pevný a vycházelo „3 potřebuje tebe“. „Na limitu“ se nečasuje, sedí ke každému počtu.
 */
export function popisPoctu(stav, n) {
  if (stav === 'working') return plural(n, 'pracuje', 'pracují', 'pracuje');
  if (stav === 'needs_input') return plural(n, 'potřebuje tebe', 'potřebují tebe', 'potřebuje tebe');
  if (stav === 'failed') return plural(n, 'selhal', 'selhali', 'selhalo');
  if (stav === 'waiting') return plural(n, 'čeká na zadání', 'čekají na zadání', 'čeká na zadání');
  if (stav === 'limited') return tr('na limitu');
  return '';
}
