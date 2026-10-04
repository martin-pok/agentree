// Ceník předplatných AI k plánům, které Agenteeq zjistil z připojených nástrojů (src/subscriptions.js).
//
// Je to veřejný ceník poskytovatele, ne skutečná platba: ta může mít jinou měnu, DPH, roční
// fakturaci nebo jít přes App Store. Rozhraní ho proto ukazuje jako „ceník“ s datem ověření
// a odkazem na zdroj a nikdy ho nesčítá s ověřenou útratou z Admin API (AGENTS.md: metriky
// se nemíchají). Kde plán nemá veřejnou cenu (Enterprise, Edu), cena chybí – nedohaduje se.
//
// Ověřeno 4. 10. 2026:
// - Anthropic: https://claude.com/pricing (Free 0, Pro 20 USD měsíčně / 17 USD při roční platbě,
//   Team Standard 25 / 20 za místo, Premium 125 / 100, Enterprise od 20 za místo ročně + využití;
//   „Prices shown don't include applicable tax“) a support.claude.com „What is the Max plan“
//   (Max 5× 100 USD, Max 20× 200 USD měsíčně).
// - OpenAI: chatgpt.com/pricing a help.openai.com (Go 8 USD v USA, Plus 20, Pro 100 / 200 / 500
//   jen měsíčně, Business 25 za uživatele měsíčně / 20 ročně, Business Premium 125 / 100).
//   Kódy plánů a jejich názvy podle zdrojového kódu Codexu (codex-rs/tui/src/subscription.rs,
//   commit afb436d z 4. 10. 2026): prolite = Pro 100, pro = Pro 200, promax = Pro 500,
//   team = Business, self_serve_business_prolite = Business Premium, business = Enterprise.
//
// Při změně ceníku uprav čísla, CENIK_OVERENO a záznam v docs/CONNECTORS.md.

export const CENIK_OVERENO = '2026-10-04';

export const ZDROJE_CENIKU = {
  claude: { nazev: 'Anthropic', url: 'https://claude.com/pricing' },
  chatgpt: { nazev: 'OpenAI', url: 'https://chatgpt.com/pricing' },
};

// mesicne = cena v USD při měsíční platbě, rocne = cena za měsíc při roční platbě (null = nenabízí),
// zaMisto = cena za uživatele, od = dolní mez (konkrétní úroveň z dat nepoznáme).
const CENY = {
  claude: {
    free: { mesicne: 0 },
    pro: { mesicne: 20, rocne: 17 },
    max5x: { mesicne: 100 },
    max20x: { mesicne: 200 },
    max: { mesicne: 100, od: true },
    team: { mesicne: 20, od: true, zaMisto: true },
    enterprise: { mesicne: 20, od: true, zaMisto: true, sVyuzitim: true },
  },
  chatgpt: {
    free: { mesicne: 0 },
    go: { mesicne: 8, jenUsa: true },
    plus: { mesicne: 20 },
    prolite: { mesicne: 100 },
    pro: { mesicne: 200 },
    promax: { mesicne: 500 },
    team: { mesicne: 25, rocne: 20, zaMisto: true },
    self_serve_business_usage_based: { mesicne: 25, rocne: 20, zaMisto: true },
    self_serve_business_prolite: { mesicne: 125, rocne: 100, zaMisto: true },
  },
};

// Cena plánu podle ceníku, nebo null, když plán veřejnou cenu nemá (Enterprise, Edu, neznámý kód).
export function cenaPlanu(service, plan) {
  const c = CENY[service]?.[plan];
  if (!c) return null;
  return {
    mena: 'USD',
    mesicne: c.mesicne,
    rocne: c.rocne ?? null,
    zaMisto: Boolean(c.zaMisto),
    od: Boolean(c.od),
    sVyuzitim: Boolean(c.sVyuzitim),
    jenUsa: Boolean(c.jenUsa),
    zdroj: ZDROJE_CENIKU[service]?.nazev || '',
    url: ZDROJE_CENIKU[service]?.url || '',
    overeno: CENIK_OVERENO,
  };
}
