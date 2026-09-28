// Rozdíl mezi „nástroj je nainstalovaný“ a „zůstala po něm složka“. Složka s daty přežije odinstalaci
// i jiný nástroj, který ji sdílí (~/.gemini drží i nastavení MCP), a aplikace z ní dřív usoudila
// „Gemini CLI je nainstalovaný“ — přitom příkaz `gemini` na Macu vůbec nebyl. Tvrzení, které nemá
// oporu, je horší než mlčení, proto se stav rozhoduje ze tří údajů:
//   installed: true = příkaz nebo aplikace nalezena · false = hledáno a nenalezeno · null = nevím
//   trace:     existuje složka nebo databáze, ze které se čtou konverzace
import { ui } from '../texty.js';
import { POCITAC } from '../platform.js';

export function noDataState({ installed, trace, name, traceLabel, whatMissing }) {
  if (installed === true) return { state: 'idle', detail: ui('{0} je nainstalovaný, ale {1}.', name, whatMissing) };
  if (installed === false) {
    return {
      state: 'missing',
      detail: trace ? ui('{0} na {1} není – zůstala po něm jen {2}.', name, POCITAC.tomto, traceLabel) : ui('{0} na {1} není.', name, POCITAC.tomto),
    };
  }
  // Instalaci se nepodařilo ověřit: nic o ní netvrdíme, jen popíšeme, co je vidět.
  return trace
    ? { state: 'idle', detail: ui('Nalezena {0}, {1}.', traceLabel, whatMissing) }
    : { state: 'missing', detail: ui('{0} na {1} není.', name, POCITAC.tomto) };
}
