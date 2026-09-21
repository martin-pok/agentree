// Co smí spárovaný telefon (nebo jiné zařízení mimo tento Mac). Zásada: telefon je okno pro
// čtení. Cokoli, co na Macu něco spustí, nainstaluje, uloží nebo smaže, smí jen sám Mac.
// Dřív měl spárovaný telefon stejná práva jako okno aplikace: uměl spouštět agenty s libovolnou
// složkou, instalovat hooky, měnit klíče a číst disk. Ukradený telefon nebo token z cizí Wi‑Fi
// by tak byl vzdálené spouštění příkazů. Teď je nejhorší dopad přečtení stavu.

// Jediné změny, které telefon smí: spárovat se a označit upozornění jako přečtená.
const POVOLENE_ZMENY = [
  ['POST', /^\/api\/lan\/pair$/],
  ['POST', /^\/api\/alerts\/read$/],
];

// Čtení, které telefonu nepatří ani tak: procházení složek disku.
const ZAKAZANE_CTENI = [/^\/api\/fs\//];

export function remoteScope(method, pathname) {
  if (!pathname.startsWith('/api/')) return { ok: true };
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') {
    return ZAKAZANE_CTENI.some((re) => re.test(pathname))
      ? { ok: false, error: 'Procházet disk lze jen na Macu.' }
      : { ok: true };
  }
  if (POVOLENE_ZMENY.some(([mm, re]) => mm === m && re.test(pathname))) return { ok: true };
  return { ok: false, error: 'Tuhle akci lze provést jen na Macu. Telefon slouží ke čtení stavu.' };
}
