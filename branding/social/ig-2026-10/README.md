# Noční směna – 6 postů pro Instagram a LinkedIn

**Myšlenka:** tvůj tým AI agentů jako obsazení robotů na tmavé scéně. Každý post je portrét jedné
postavy v kuželu světla barvy jejího stavu (šalvěj = pracuje, růže = potřebuje tebe, mosaz = limity,
ocelová modrá = rozhodnutí) a jedna věc, kterou Agenteeq v tu chvíli řekne.

| | |
|---|---|
| Formát | 1080 × 1350 px (4 : 5, Instagram i LinkedIn), ke každému i `@2x` 2160 × 2700 px |
| Písmo | Satoshi 500 (titulky 148 px, prostrkání −4,8 %), Geist Mono jen pro příkaz |
| Barvy | tmavý vzhled aplikace: pozadí `#0B0E15`, inkoust `#EEF1F7`, jeden stavový pigment na post |
| Roboti | kreslí je přímo `public/js/robot-svg.js` z aplikace, pózy jako v aplikaci (zvednutá ruka = potřebuje tě) |
| Data | výřezy rozhraní ukazují smyšlená data a jsou tak na postu označené („Ukázková data“) |

## Soubory

- `posty.html`, `posty.css` – editovatelný zdroj (texty, barvy, rozmístění).
- `render.mjs` – export do `export/`.
- `export/post-01.png` … `post-06.png` a jejich `@2x`.

Úprava a nový export:

```bash
node scripts/satoshi.mjs                        # písmo Satoshi (do repozitáře nepatří – licence)
node branding/social/ig-2026-10/render.mjs      # Playwright z PLAYWRIGHT_PATH nebo node_modules
```

## Popisky k postům

**01 · Celý tvůj tým. Jeden pohled.**
Claude Code v Terminálu, Codex v ChatGPT, Cursor a k tomu pár webových chatů. Agenteeq je ukáže na jednom místě: kdo pracuje, kdo čeká na zadání a kdo potřebuje tebe. V reálném čase, na tvém Macu.

**02 · Agent čeká na tvé ano.**
Agent se zastaví a čeká na povolení. Agenteeq ti dá vědět hned – oznámením na Macu i v prohlížeči. Žádné dvacetiminutové prostoje, protože jsi zrovna byl v jiném okně.

**03 · Nikdy naslepo.**
Žádost Claude Code schválíš nebo zamítneš přímo v Agenteeq. Vidíš celý příkaz, složku, projekt i čas, který zbývá. Rozhoduješ podle toho, co agent opravdu udělá.

**04 · Vidíš, co dělá právě teď.**
Živý přepis, aktuální krok a jak dlouho tah běží. Změna se v Agenteeq ukáže do dvou sekund – nemusíš přepínat mezi okny, abys věděl, jak to jde.

**05 · Limit tě nepřekvapí.**
Okna limitů Claude a Codexu s časem obnovy, útrata z Admin API a rozpočty, které se ozvou včas. Čísla jen z ověřených zdrojů, žádné odhady.

**06 · Zůstávají na tvém Macu.**
Agenteeq běží lokálně. Přepisy tvých konverzací nikam neposílá. Zdarma pro Mac s Apple Silicon: agentree-fawn.vercel.app

Návrh hashtagů: `#AIagenti #ClaudeCode #Codex #Cursor #vývoj #productivity #macOS`

## Alternativní texty

1. Čtyři roboti Agenteeq stojí vedle sebe, každý ve světle svého stavu: pracuje, potřebuje tebe, pracuje, čeká na zadání. Nadpis: Celý tvůj tým. Jeden pohled.
2. Robot se zvednutou rukou vedle oznámení „Codex potřebuje tvé rozhodnutí“. Nadpis: Agent čeká na tvé ano.
3. Karta žádosti o povolení s příkazem npm run build && npm test, složkou, tlačítky Povolit a Zamítnout a odpočtem 0:42. Nadpis: Nikdy naslepo.
4. Zelený robot vedle živého přepisu Codexu: čte soubor, upravuje 3 soubory, spouští testy. Nadpis: Vidíš, co dělá právě teď.
5. Fialový robot vedle oken limitů: Claude 5 h na 72 %, Codex týdenní na 57 %. Nadpis: Limit tě nepřekvapí.
6. Modrý robot a odkaz ke stažení. Nadpis: Zůstávají na tvém Macu.
