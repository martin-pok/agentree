import { hodinaVObdobi } from './format.js';

// Odhad ceny tokenů přes API (projekty: „kolik by to stálo přes API“). Je to ODHAD: Claude Code
// s předplatným Pro/Max se platí paušálem, ne po tokenech. Rozhraní ho proto vždy označuje
// slovem „odhad“ a nikdy ho nesčítá s ověřenou útratou (AGENTS.md: metriky se nemíchají).
// Počítá se z hodinových přihrádek `hourlyUsage` (src/model.js#addTokens): jen tokeny uvnitř
// období, každý model svou cenou a zápis do cache na hodinu zvlášť. Novější přepisy Claude Code
// délku cache uvádějí (`usage.cache_creation`); starší jen součet, který se bere jako 5minutový.
//
// Zdroj: oficiální ceník Anthropicu https://platform.claude.com/docs/en/about-claude/pricing,
// ověřeno 7. 10. 2026. USD za milion tokenů: vstup, výstup, čtení z cache, zápis do cache (5 min).
// Stránka si u Claude Sonnet 5.5 odporuje (tabulka 0,20 $, text o násobcích 0,10 $ za čtení
// z cache); bere se hodnota z tabulky. Claude Haiku 5.5 má cenu podle délky promptu (nad 100 000
// tokenů pětkrát vyšší), kterou z přepisu nepoznáme – do odhadu proto nejde a hlásí se jako bez ceníku.
// Ostatní poskytovatelé (OpenAI, Google…) zatím ověřený ceník nemají a nedohadují se.
//
// Zápis do cache na hodinu stojí podle téže stránky (oddíl o násobcích ceny za cache) dvojnásobek
// základní ceny vstupu u všech modelů – 5minutový 1,25násobek, jak ukazuje i tabulka níže.
//
// Při změně ceníku uprav čísla, CENIK_API_OVERENO a záznam v docs/CONNECTORS.md.

export const CENIK_API_OVERENO = '2026-10-07';
export const CENIK_API_ZDROJ = 'https://platform.claude.com/docs/en/about-claude/pricing';

// [vstup, výstup, čtení z cache, zápis do cache 5 min] v USD za MTok.
const CLAUDE = {
  'fable-5.1': [10, 50, 0.25, 12.5],
  'mythos-5.1': [10, 50, 0.25, 12.5],
  'fable-5': [10, 50, 1, 12.5],
  'mythos-5': [10, 50, 1, 12.5],
  'opus-5.5': [4, 20, 0.2, 5],
  'opus-5': [5, 25, 0.5, 6.25],
  'opus-4.8': [5, 25, 0.5, 6.25],
  'opus-4.7': [5, 25, 0.5, 6.25],
  'opus-4.6': [5, 25, 0.5, 6.25],
  'opus-4.5': [5, 25, 0.5, 6.25],
  'opus-4.1': [15, 75, 1.5, 18.75],
  'opus-4': [15, 75, 1.5, 18.75],
  'sonnet-5.5': [2, 10, 0.2, 2.5],
  'sonnet-5': [2, 10, 0.2, 2.5],
  'sonnet-4.6': [3, 15, 0.3, 3.75],
  'sonnet-4.5': [3, 15, 0.3, 3.75],
  'sonnet-4': [3, 15, 0.3, 3.75],
  'haiku-4.5': [1, 5, 0.1, 1.25],
};

/** Klíč ceníku pro ID modelu („claude-opus-4-7[1m]“ → „opus-4.7“), nebo null. */
export function klicModelu(model) {
  const m = /claude-(fable|mythos|opus|sonnet|haiku)-(\d+)(?:[-.](\d)(?!\d))?/i.exec(String(model || ''));
  if (!m) return null;
  return `${m[1].toLowerCase()}-${m[2]}${m[3] ? `.${m[3]}` : ''}`;
}

/** Cena modelu [vstup, výstup, čtení cache, zápis cache] v USD/MTok, nebo null bez ověřeného ceníku. */
export const cenaModelu = (model) => CLAUDE[klicModelu(model)] || null;

export const ZAPIS_1H_NASOBEK = 2;

/**
 * Odhad ceny konverzací přes API v USD za tokeny od `since` (ms). Vrací { usd, sCenou, bezCeny,
 * modelyBezCeny } – tokeny (všech pět druhů) s ověřenou cenou a bez ní, aby rozhraní řeklo, jak
 * velká část odhad kryje. Hodiny bez rozpadu podle modelu (zdroje, které ho nevedou) jdou do
 * „bez ceny“ – jejich cena se nedohaduje.
 */
export function odhadCenyApi(sessions, since = -Infinity) {
  let usd = 0;
  let sCenou = 0;
  let bezCeny = 0;
  const modelyBezCeny = new Set();
  for (const s of sessions) {
    const hodiny = s.hourlyUsage || {};
    for (const k in hodiny) {
      if (!hodinaVObdobi(k, since)) continue;
      for (const [model, [vstup, vystup, cteni, zapis5m, zapis1h]] of Object.entries(hodiny[k])) {
        const vsech = vstup + vystup + cteni + zapis5m + zapis1h;
        if (!vsech) continue;
        const cena = cenaModelu(model);
        if (!cena) {
          bezCeny += vsech;
          if (model) modelyBezCeny.add(model);
          continue;
        }
        const [cVstup, cVystup, cCteni, cZapis] = cena;
        usd += (vstup * cVstup + vystup * cVystup + cteni * cCteni + zapis5m * cZapis + zapis1h * cVstup * ZAPIS_1H_NASOBEK) / 1e6;
        sCenou += vsech;
      }
    }
    for (const k in s.hourly || {}) {
      if (hodiny[k] || !(s.hourly[k] > 0) || !hodinaVObdobi(k, since)) continue;
      bezCeny += s.hourly[k];
      if (s.model) modelyBezCeny.add(s.model);
    }
  }
  return { usd, sCenou, bezCeny, modelyBezCeny: [...modelyBezCeny] };
}
