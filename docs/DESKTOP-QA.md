# Desktop 0.6.0 — ověření 2026-09-11

## ROOT CAUSE

Na portu 4620 byl při diagnostice samostatný Node proces spuštěný přes
`/Users/martinpokorny/agenteeq/bin/agenteeq.mjs` (verze 0.5.0), nikoli server
vlastněný nativním oknem. CLI má SIGINT/SIGTERM shutdown, ale nemá smlouvu
o životnosti s GUI, kontrolu rodiče ani desktopový single-instance lock.
Samotné zavření okna tak ukončení tohoto procesu nezaručuje. Historický
konkrétní crash nelze zpětně dokázat; přítomnost nezávislého serveru byla
ověřena z procesů, portu a kódu.

Při nativním QA nového buildu se navíc reprodukovalo čekání GUI při ⌘Q:
default-mode Timer během AppKit terminateLater přestal obsluhovat dokončení.
Port už byl volný, GUI a jeho zámek však žily dál. Finální verze místo tohoto
časovače čeká na dítě mimo UI thread a potvrdí dokončení přes hlavní frontu.

## FIX

- Atomický kernelový flock pro jedinou nativní instanci, automaticky uvolněný při pádu.
- Server je dítě GUI; sleduje EOF i existenci rodiče nezávisle.
- Řádné ukončení zavře spojení, uloží data a zastaví vlastní běhy.
- Port se rezervuje před načtením/zápisem sdílených dat.
- Převzetí starého CLI pouze po ověření PID, UID, příkazu, kontrolního součtu
  známého entrypointu, identity API, stejné datové složky a absence aktivních běhů.
- Neznámý proces se neukončuje. Živá desktopová instance se nepřebírá.
- SIGKILL není startovací mechanismus; je pouze poslední pojistka po timeoutu
  při ukončování vlastního dítěte. V QA se použil také k simulaci pádu GUI.
- Zavření okna ponechává monitoring běžet záměrně; ⌘Q ukončuje celou aplikaci.

## FILES CHANGED — lifecycle

`desktop/Agenteeq.swift`, `desktop/server.mjs`, `desktop/lifecycle.mjs`,
`src/http.js`, `test/desktop.test.mjs`, `test/lifecycle.test.mjs`.
Ostatní změny na větvi `feat/macos-desktop` souvisejí s původním zadáním
nativního balíčku, ikonou, lokálními fonty, průvodcem a vlastními selecty.

## VERIFICATION

- `npm test`: 93/93 úspěšných testů, žádné přeskočené.
- `npm run check`: 85 JS/MJS souborů bez syntaktických chyb.
- `npm run smoke`: instalace npm balíčku a skutečná HTTP odpověď verze 0.6.0.
- Cílený lifecycle: šest okamžitých restartů, souběžný server, pád rodiče,
  cizí server s podvrženou identitou, převzetí ověřeného CLI se zachováním projektu.
- Playwright Chromium i WebKit: čtyřkrokový průvodce, chyba uložení a opakování,
  persistence, klávesnice selectů, všechny hlavní stránky, šířky 375/900/1180/1440,
  lokální fonty, žádné viditelné nativní selecty ani JS chyby.
- Finální Swift build úspěšně zkompilován; `codesign --verify --deep --strict` prošel
  i po instalaci do `/Users/martinpokorny/Applications/Agenteeq.app`.
- Nativní UI: skutečná data na přehledu; ⌘Q odstranilo GUI PID 69365 i server
  PID 69374 a uvolnilo port 4620 (ověřeno ps/lsof).
- Finální nativní executable na izolovaných datech: tři cykly start/ukončení,
  včetně SIGKILL GUI a souběžné druhé instance; po každém port znovu volný.

## Hranice ověření

Lokální arm64 build pro macOS 14+ je ad-hoc podepsaný, není notarizovaný.
Veřejná distribuce vyžaduje Developer ID a notarizaci. QA není tvrzení, že
každý externí poskytovatel byl ověřen živým placeným spuštěním; zkušební
konektory zůstávají v UI výslovně označené. Supabase nebyl přidán — lokální
backend požadované funkce již obsluhuje a data neopouštějí Mac kvůli této úpravě.
