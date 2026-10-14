// Předložka „z/ze“ před číslem psaným číslicemi. Píše se tak, jak se čte: „ze“ před číslovkou,
// jejíž 2. pád začíná na s, z, š, ž nebo na skupinu souhlásek – ze 2 (dvou), ze 3 (tří), ze 4
// (čtyř), ze 6 (šesti), ze 7 (sedmi), ze 12, ze 20, ze 100 (sta), ze 2 000 –, jinak „z“: z 1,
// z 5, z 8, z 10, z 1 000 (tisíce). Rozhoduje první vyslovené slovo, u složených čísel tedy
// nejvyšší řád („ze 45“ = ze čtyřiceti pěti, „z 52“ = z padesáti dvou).
//
// Modul je bez DOM a bez jazyka: používá ho klient (public/js) i server (src/), vždy jen pro
// češtinu – anglický překlad věty má vlastní znění („of“).

const JEDNOTKY = new Set([2, 3, 4, 6, 7]); // dvou, tří, čtyř, šesti, sedmi
const NACTKY = new Set([12, 13, 14, 16, 17]); // dvanácti, třinácti, čtrnácti, šestnácti, sedmnácti
const DESITKY = new Set([2, 3, 4, 6, 7]); // dvaceti, třiceti, čtyřiceti, šedesáti, sedmdesáti

/** Čte se před číslem `n` „ze“? Desetinná místa nerozhodují (ze 2,5 = ze dvou celých pěti). */
export function ze(n) {
  const x = Math.floor(Math.abs(Number(n)));
  if (!Number.isFinite(x)) return false;
  // Miliarda, milion a tisíc samy začínají na m/t („z milionu“, „z tisíce“); dva a víc se čtou
  // od počtu („ze dvou tisíc“, „z pěti milionů“).
  for (const rad of [1e9, 1e6, 1e3]) {
    if (x >= rad) { const k = Math.floor(x / rad); return k === 1 ? false : ze(k); }
  }
  if (x >= 100) { const k = Math.floor(x / 100); return k === 1 ? true : ze(k); } // ze sta, ze dvou set, z pěti set
  if (x >= 20) return DESITKY.has(Math.floor(x / 10));
  if (x >= 10) return NACTKY.has(x);
  return JEDNOTKY.has(x);
}
