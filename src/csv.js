// CSV pro Excel a Numbers v jazyce aplikace. Soubor otevřený dvojklikem tabulka rozdělí podle
// oddělovače seznamu z nastavení systému a čísla čte s jeho desetinným znaménkem: česká
// tabulka čeká středník a desetinnou čárku, britská (i americká) čárku a desetinnou tečku.
// Zápis se proto řídí jazykem aplikace. Data se píšou jako RRRR-MM-DD: ten tvar Excel i Numbers
// načtou jako datum v obou jazycích, kdežto „28. 9.“ nebo „28/09“ záleží na nastavení systému.
//
// Vždy platí: UTF-8 BOM (bez něj Excel čte soubor v kódování systému) a ochrana proti vzorcům –
// text začínající =, +, -, @ by tabulka spustila jako vzorec, dostane proto apostrof. Čísla se
// píšou jako čísla (bez apostrofu), aby s nimi šlo počítat.
const ZAPIS = {
  cs: { oddelovac: ';', desetinna: ',' },
  en: { oddelovac: ',', desetinna: '.' },
};

export const zapisCsv = (jazyk) => ZAPIS[jazyk] || ZAPIS.cs;

export function bunka(v, jazyk = 'cs') {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', zapisCsv(jazyk).desetinna) : '';
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  // Do uvozovek jde text s oddělovačem kteréhokoli z obou zápisů, ať se sloupce nerozjedou ani
  // v tabulce, která oddělovač hádá.
  return /[";,\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(radky, jazyk = 'cs') {
  const { oddelovac } = zapisCsv(jazyk);
  return `﻿${radky.map((r) => r.map((v) => bunka(v, jazyk)).join(oddelovac)).join('\r\n')}\r\n`;
}
