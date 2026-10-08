// Odhad ceny tokenů přes API (projekty: „kolik by to stálo přes API“). Je to ODHAD: Claude Code
// s předplatným Pro/Max se platí paušálem, ne po tokenech, a přepisy neříkají, jestli šel zápis
// do cache na 5 minut, nebo na hodinu (počítá se 5minutový). Rozhraní ho proto vždy označuje
// slovem „odhad“ a nikdy ho nesčítá s ověřenou útratou (AGENTS.md: metriky se nemíchají).
//
// Zdroj: oficiální ceník Anthropicu https://platform.claude.com/docs/en/about-claude/pricing,
// ověřeno 7. 10. 2026. USD za milion tokenů: vstup, výstup, čtení z cache, zápis do cache (5 min).
// Stránka si u Claude Sonnet 5.5 odporuje (tabulka 0,20 $, text o násobcích 0,10 $ za čtení
// z cache); bere se hodnota z tabulky. Claude Haiku 5.5 má cenu podle délky promptu (nad 100 000
// tokenů pětkrát vyšší), kterou z přepisu nepoznáme – do odhadu proto nejde a hlásí se jako bez ceníku.
// Ostatní poskytovatelé (OpenAI, Google…) zatím ověřený ceník nemají a nedohadují se.
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

const tokenu = (t) => (t?.input || 0) + (t?.output || 0) + (t?.cacheRead || 0) + (t?.cacheWrite || 0);

/**
 * Odhad ceny konverzací přes API v USD. Vrací { usd, sCenou, bezCeny, modelyBezCeny } – tokeny
 * (všechny čtyři druhy) s ověřenou cenou a bez ní, aby rozhraní řeklo, jak velká část odhad kryje.
 */
export function odhadCenyApi(sessions) {
  let usd = 0;
  let sCenou = 0;
  let bezCeny = 0;
  const modelyBezCeny = new Set();
  for (const s of sessions) {
    const t = s.tokens;
    const vsech = tokenu(t);
    if (!vsech) continue;
    const cena = cenaModelu(s.model);
    if (!cena) {
      bezCeny += vsech;
      if (s.model) modelyBezCeny.add(s.model);
      continue;
    }
    const [vstup, vystup, cteni, zapis] = cena;
    usd += ((t.input || 0) * vstup + (t.output || 0) * vystup + (t.cacheRead || 0) * cteni + (t.cacheWrite || 0) * zapis) / 1e6;
    sCenou += vsech;
  }
  return { usd, sCenou, bezCeny, modelyBezCeny: [...modelyBezCeny] };
}
