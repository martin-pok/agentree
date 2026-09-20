// Rozdíl mezi „nástroj je nainstalovaný“ a „zůstala po něm složka“. Složka s daty přežije odinstalaci
// i jiný nástroj, který ji sdílí (~/.gemini drží i nastavení MCP), a aplikace z ní dřív usoudila
// „Gemini CLI je nainstalovaný“ — přitom příkaz `gemini` na Macu vůbec nebyl. Tvrzení, které nemá
// oporu, je horší než mlčení, proto se stav rozhoduje ze tří údajů:
//   installed: true = příkaz nebo aplikace nalezena · false = hledáno a nenalezeno · null = nevím
//   trace:     existuje složka nebo databáze, ze které se čtou konverzace
export function noDataState({ installed, trace, name, traceLabel, whatMissing }) {
  if (installed === true) return { state: 'idle', detail: `${name} je nainstalovaný, ale ${whatMissing}.` };
  if (installed === false) {
    return {
      state: 'missing',
      detail: trace ? `${name} na tomto Macu není – zůstala po něm jen ${traceLabel}.` : `${name} na tomto počítači není.`,
    };
  }
  // Instalaci se nepodařilo ověřit: nic o ní netvrdíme, jen popíšeme, co je vidět.
  return trace
    ? { state: 'idle', detail: `Nalezena ${traceLabel}, ${whatMissing}.` }
    : { state: 'missing', detail: `${name} na tomto počítači není.` };
}
