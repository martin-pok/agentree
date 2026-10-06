// Tlačítko ke stažení podle systému návštěvníka. Postupné vylepšení: stránka bez skriptu nabízí
// Mac (výchozí stav v HTML) a tenhle modul jen přepne, co je vidět. Nic se nestahuje samo.
//
// Prvky nesou `data-system` – kde mají být vidět:
//   mac          Mac a ostatní (tlačítko a údaje pro Mac, postup pro Mac); vidět i bez skriptu
//   jen-mac      jen Mac („Stáhnout pro Mac“ v liště)
//   windows      Windows a ostatní (tlačítko a údaje pro Windows); v HTML skryté
//   jen-windows  jen Windows (postup pro Windows na hlavní stránce)
//
// Mac s procesorem Intel z prohlížeče spolehlivě poznat nejde (Safari i Chrome hlásí „Intel“
// i na Apple Silicon), proto zůstává u tlačítka vidět poznámka „Apple Silicon (M1 a novější)“.

/** 'mac' | 'windows' | 'jiny' – co ví prohlížeč o systému. Bez jistoty vždy 'jiny'. */
export function systemNavstevnika(nav = globalThis.navigator) {
  if (!nav) return 'jiny';
  const ua = String(nav.userAgent || '');
  // Telefon nebo tablet nespustí ani jednu verzi. iPad se v Safari hlásí jako Mac,
  // prozradí ho až dotyková obrazovka.
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return 'jiny';
  const platforma = String(nav.userAgentData?.platform || nav.platform || '');
  if (/^mac/i.test(platforma) && Number(nav.maxTouchPoints) > 1) return 'jiny';
  if (/^win/i.test(platforma) || (!platforma && /Windows NT/.test(ua))) return 'windows';
  if (/^mac/i.test(platforma) || (!platforma && /Macintosh/.test(ua))) return 'mac';
  return 'jiny';
}

// Pro které systémy je prvek vidět. Linux, telefon a ostatní dostanou obě tlačítka; postup
// na hlavní stránce zůstane pro Mac a pro Windows vede odkaz na návod.
export const VIDITELNE = {
  mac: ['mac', 'jiny'],
  'jen-mac': ['mac'],
  windows: ['windows', 'jiny'],
  'jen-windows': ['windows'],
};

export function pripravStazeni(doc = globalThis.document, system = systemNavstevnika()) {
  if (!doc || system === 'mac') return system;
  for (const el of doc.querySelectorAll('[data-system]')) {
    const kde = VIDITELNE[el.getAttribute('data-system')];
    if (kde) el.hidden = !kde.includes(system);
  }
  // Postup pro Windows je v návodu o kus níž než ten pro Mac.
  if (system === 'windows') {
    for (const odkaz of doc.querySelectorAll('a[data-navod]')) {
      odkaz.setAttribute('href', `${odkaz.getAttribute('href').split('#')[0]}#windows`);
    }
  }
  return system;
}
