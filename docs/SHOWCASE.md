# Prohlídka Agenteeq

Web: https://agentree-fawn.vercel.app/ (nový obsah se zveřejní po merge a dokončení Vercel deploye).

## Bezpečná ukázka aplikace

V checkoutu spusť `npm run showcase` a otevři vypsanou lokální adresu. Instance používá dočasné složky, smyšlená data a suchý režim akcí; nečte skutečné přepisy ani nespouští agenty. Ukončení Ctrl+C.

Prohlídka: Přehled → čekající rozhodnutí → Agenti → detail konverzace → Projekty → Limity/Útrata → Nastavení. Tokeny nejsou náklady; ukázkové hodnoty jsou označené.

Stejná scéna (tři projekty, zapsaná předplatná a kredity, rozpočet 6 000 Kč) je i v živé prohlídce
na webu: rozhraní na `/app?ukazka` nad snímkem dat sestaveným s webem, viz `docs/REMOTE.md`.
Statické snímky v `site/shots/` jsou záloha pro prohlížeče bez JavaScriptu a pro dobu načítání;
po změně scény nebo vzhledu je obnov `npm run shots:site`.

## Rozšíření pro Chrome

1. Spusť běžnou aplikaci Agenteeq na portu 4620.
2. Nastavení → Propojení → Rozšíření pro Chrome: zkopíruj cestu ke složce a vytvoř jednorázový kód.
3. V Chromu otevři `chrome://extensions`, zapni Režim pro vývojáře, zvol Načíst rozbalené a vyber zkopírovanou složku (na Macu lze vložit cestu přes ⇧⌘G).
4. Připni rozšíření, vlož 16znakový kód a otevři podporovaný webový chat. Jednotlivé služby lze vypnout.

Alternativně `npm run build:extension` vytvoří ZIP v `dist/`; před načtením ho rozbal. Rozšíření zatím není v Chrome Web Store a selektory služeb mají stav beta. Browserové QA s atrapou Chrome API nepotvrzuje funkčnost všech živých webů.

## Telefon

Zapnutý a bdělý Mac, běžící aplikace, povolená domácí síť/Tailscale a spárovaný telefon. Červené zavření okna nevadí, Cmd+Q nebo vypnutí Macu ano. Trvalý přístup bez Macu vyžaduje samostatný hostitel; viz REMOTE.md.
