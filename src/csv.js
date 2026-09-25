// CSV pro Excel a Numbers v češtině: středník, UTF-8 BOM, desetinná čárka u čísel a ochrana
// proti vzorcům – text začínající =, +, -, @ by tabulka spustila jako vzorec, dostane proto
// apostrof. Čísla se píšou jako čísla (bez apostrofu), aby s nimi šlo počítat.
export function bunka(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(radky) {
  return `﻿${radky.map((r) => r.map(bunka).join(';')).join('\r\n')}\r\n`;
}
