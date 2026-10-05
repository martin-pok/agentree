// Co smí spárovaný telefon (nebo jiné zařízení mimo tento Mac). Zásada: telefon je okno pro
// čtení. Cokoli, co na Macu něco spustí, nainstaluje, uloží nebo smaže, smí jen sám Mac.
// Dřív měl spárovaný telefon stejná práva jako okno aplikace: uměl spouštět agenty s libovolnou
// složkou, instalovat hooky, měnit klíče a číst disk. Ukradený telefon nebo token z cizí Wi‑Fi
// by tak byl vzdálené spouštění příkazů. Teď je nejhorší dopad přečtení stavu.

import { POCITAC } from './platform.js';
import { ui } from './texty.js';

// Jediné změny, které telefon smí: spárovat se a označit upozornění jako přečtená.
const POVOLENE_ZMENY = [
  ['POST', /^\/api\/lan\/pair$/],
  ['POST', /^\/api\/alerts\/read$/],
];

// Čtení, které telefonu nepatří ani tak: procházení složek disku a celé přepisy konverzací i výstup
// agentů spuštěných na pozadí. Přepis je nejcitlivější obsah (kód, klientská data, prompty) a zůstává
// jen na hostiteli; telefon vidí souhrn konverzace (stav, název, poslední zadání, aktivitu, tokeny).
// Detail konverzace /api/sessions/:id telefonu vrátí souhrn bez přepisu (src/http.js).
const ZAKAZANE_CTENI = [
  [/^\/api\/fs\//, () => ui('Procházet disk lze jen {0}.', POCITAC.naHostiteli)],
  [/^\/api\/sessions\/[^/]+\/transcript$/, () => ui('Celý přepis konverzace je vidět jen {0}. Telefon ukazuje souhrn.', POCITAC.naHostiteli)],
  [/^\/api\/runs\/[\w-]+\/log$/, () => ui('Výstup agenta je vidět jen {0}. Telefon ukazuje souhrn.', POCITAC.naHostiteli)],
];

// Událost SSE, která nese text přepisu – telefonu se neposílá.
export const JEN_NA_HOSTITELI_UDALOSTI = new Set(['transcript']);

export function remoteScope(method, pathname) {
  if (!pathname.startsWith('/api/')) return { ok: true };
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') {
    const zakaz = ZAKAZANE_CTENI.find(([re]) => re.test(pathname));
    return zakaz ? { ok: false, error: zakaz[1]() } : { ok: true };
  }
  if (POVOLENE_ZMENY.some(([mm, re]) => mm === m && re.test(pathname))) return { ok: true };
  return { ok: false, error: ui('Tuhle akci lze provést jen {0}. Telefon slouží ke čtení stavu.', POCITAC.naHostiteli) };
}
