# Prohlídka Agenteeq

Web: https://agentree-fawn.vercel.app/ (nový obsah se zveřejní po merge a dokončení Vercel deploye).

## Bezpečná ukázka aplikace

V checkoutu spusť `npm run showcase` a otevři vypsanou lokální adresu. Instance používá dočasné složky, smyšlená data a suchý režim akcí; nečte skutečné přepisy ani nespouští agenty. Ukončení Ctrl+C.

Prohlídka: Přehled → čekající rozhodnutí → Agenti → detail konverzace → Projekty → Limity/Útrata → Nastavení. Tokeny nejsou náklady; ukázkové hodnoty jsou označené.

Stejná scéna (tři projekty, zapsaná předplatná a kredity, rozpočet 6 000 Kč) je i na `/app?ukazka`
(rozhraní nad snímkem dat sestaveným s webem, viz `docs/REMOTE.md`) a ve výřezech na webu.

## Výřezy na webu

Landing page neukazuje celé obrazovky ani vložené rozhraní, ale **výřezy jednotlivých částí**
skutečné aplikace: pruh stavu, karta rozhodnutí, okno limitu, seznam agentů, oznámení, karty
projektů a Útrata. Leží v `site/detail/` jako WebP s průhlednými rohy, zvlášť z rozvržení pro Mac
(1280 px) a pro telefon (390 px), obojí v trojnásobné hustotě a v tmavém vzhledu – kompozice na
webu stojí na tmavé scéně v obou režimech stránky. Rozměry v CSS pixelech jsou
v `site/detail/rozmery.json` a stejné musí být ve `width`/`height` v `site/index.html`
(hlídá `test/site.test.mjs`).

- **Obnova:** `npm run shots:site` (Playwright s Chromiem). Scéna se pro výřezy staví bez předpony
  „UKÁZKA ·“ a s věrohodným popisem činnosti (`pripravUkazku({}, { oznacit: false })`), protože
  každý výřez má přímo pod sebou popisek „skutečné rozhraní, smyšlená data“. Živá ukázka
  i `npm run showcase` označení mají dál.
- **Bez obalu aplikace:** postranní panel a spodní lišta telefonu jsou při focení neviditelné
  (drží ale místo, rozvržení je stejné jako v aplikaci), pozadí okna je průhledné.
- **Nic ve stránce nepřebírá dotyk ani kolečko:** žádný iframe; nástup výřezů řídí CSS podle
  posouvání (`animation-timeline: view()`), kde to prohlížeč neumí, jsou výřezy prostě vidět.
  `npm run qa:site` měří, že tah prstem i kolečko přes každý výřez posune stránku.

Staré celé snímky obrazovek v `site/shots/` web už nepoužívá.

## Rozšíření pro Chrome

1. Spusť běžnou aplikaci Agenteeq na portu 4620.
2. Nastavení → Propojení → Rozšíření pro Chrome: zkopíruj cestu ke složce a vytvoř jednorázový kód.
3. V Chromu otevři `chrome://extensions`, zapni Režim pro vývojáře, zvol Načíst rozbalené a vyber zkopírovanou složku (na Macu lze vložit cestu přes ⇧⌘G).
4. Připni rozšíření, vlož 16znakový kód a otevři podporovaný webový chat. Jednotlivé služby lze vypnout.

Alternativně `npm run build:extension` vytvoří ZIP v `dist/`; před načtením ho rozbal. Rozšíření zatím není v Chrome Web Store a selektory služeb mají stav beta. Browserové QA s atrapou Chrome API nepotvrzuje funkčnost všech živých webů.

## Telefon

Zapnutý a bdělý Mac, běžící aplikace, povolená domácí síť/Tailscale a spárovaný telefon. Červené zavření okna nevadí, Cmd+Q nebo vypnutí Macu ano. Trvalý přístup bez Macu vyžaduje samostatný hostitel; viz REMOTE.md.
