# Agenteeq: navazující audit a prioritizace — 20. 10. 2026

## Výchozí stav a důkazy

Audit navazuje na **main `4870de9` / 0.46.48**, načtený z GitHubu 20. 10. 2026. Nepoužívá výsledky ani screenshoty 0.46.13 jako důkaz aktuálního UI. Claudova ručně spouštěná příprava release kandidáta byla během auditu sloučena jako #327 (`4870de9`) a pracovní větev ji převzala. Funkční ověření aplikace proběhlo nad `b751601` plus zdejšími opravami; #327 mění pouze release workflow, jeho testy a dokumentaci.

Git čtení funguje, GitHub GraphQL vrací `Forbidden`. **Číslo zdroje není potvrzení veřejného releasu, CI ani nainstalované aplikace.** Stav publikace ověřit samostatně. Starší dokumenty obsahují historické stavy a nesmějí převážit nad aktuálním kódem.

## Co už Claude dokončil v kódu

Není novým backlogem: nástěnka widgetů (#315), kompaktní editor projektu (#323), vysvětlení pod „i“ a stručnější texty (#320–323), konzistentní volby a klidové barvy (#323), úchyty jen v režimu úprav na telefonu (#324), barevné postavy a šatník (#294), místní pomocník bez AI ve výchozím nastavení (#309), Chrome Store upload workflow (#293), axe a klávesnice/reflow v CI (#284, #287–289), opravy Quit a updateru (#262, #266, #271, #282). Tyto implementace potřebují příslušné ověření, nikoli nové paralelní přepsání.

## Prioritizovaný checklist

P0 = prokázaná kritická závada nebo nepřekročitelná brána konkrétního vydání. P1 = spolehlivost základního toku. P2 = kvalita a měřené produktové rozšíření. Riziko a hypotéza nejsou potvrzený bug.

| ID / priorita | Nález a důkaz | Další krok / akceptace | Stav |
|---|---|---|---|
| A01 / P1 | Opakované SSE chyby obnovovaly 4s časovač offline hlášky; server doporučuje retry po 2s (`public/js/app.js`, `src/http.js`). | Hláška nejpozději po 4s souvislého výpadku i při 2s retry; po návratu spojení zmizí; krátký výpadek bez záblesku. | Opraveno v této větvi; `test/offline-banner.test.mjs`. |
| A02 / P1 | Přečtení upozornění měnilo UI před potvrzením zápisu; při selhání se položka nevrátila. Opožděná odpověď mohla přepsat novější SSE počet (`views/alerts.js`, `state.js`). | Selhání zachová položky i počet; úspěch potvrdí vybrané; novější SSE/snapshot má přednost před starým počtem. | Opraveno v této větvi; `test/alerts-read-ui.test.mjs`. |
| A03 / P1, brána distribuce | Nativní upgrade/Quit má rozsáhlé nové opravy, ale aktuální fyzické UAT zde neproběhlo. | Na Macu přesný balíček: upgrade, zachování dat, Quit, restart, přerušené stažení, rollback, spuštění z Downloads/DMG. Zaznamenat SHA, verzi a výsledek. | Otevřené ověření; navazuje #208. |
| A04 / P1, riziko | Updater po návratovém kódu 0 z `open` pokládá start za úspěch a přesouvá zálohu do Koše (`desktop/Agenteeq.swift`, pomocný shell). To není potvrzení zdravého serveru/UI. | Ověřit scénář „open uspěje, nová app hned spadne“; navrhnout potvrzení správné verze a zdravého startu před dokončením aktualizace. | Zdrojově doložené omezení; Mac reprodukce schází. Nezaměňovat s již opraveným selháním `open`. |
| A05 / P1 pro veřejný launch | Developer ID/notarizace a čistý Gatekeeper onboarding nejsou tímto auditem doloženy. | Ověřený podpis, notarizace, stažení přes prohlížeč a otevření ve Finderu na čistém účtu. | Známá release brána, nikoli nová regrese. |
| A06 / P1 | Automatický axe, reflow a fokus již existují. Z toho nelze odvodit úplnou WCAG 2.2 AA shodu. | VoiceOver/NVDA: onboarding, paleta, dialog, chybný formulář, přečtení upozornění, aktualizace; 400% zoom, text spacing override, live announcements. | Navazuje #217; ruční AT ověření otevřené. |
| A07 / P1 | Reálné Google OAuth/avatar, Chrome pairing/focus a telefon jsou mimo zdejší izolované testy. | Login/logout/expirace/offline; pairing/revoke/restart; skutečný návrat do správné session; iOS Safari QR a notifikace. | Navazuje #174/#208. Nepovažovat mock za živou integraci. |
| A08 / P1 | Chrome Store má novou automatickou upload pipeline; staré tvrzení „stále 0.31.4“ nebylo dnes ověřeno. | Ověřit veřejný listing, nainstalovanou verzi, ikonu a párování proti aktuálnímu releasu; upload ≠ schválení obchodem. | Otevřená distribuce, #172. |
| A09 / P2 | Roadmapa a release dokumentace kombinují aktuální odstavec s historickými „posledními“ verzemi. | Jediná aktuální matice source SHA → tag → testy → artefakt → publikace → Store → UAT; historické řádky datovat. | Částečně řeší tento aktuální rozcestník; živé API blokované. |
| A10 / P2 | Typografie a assety mají současný Satoshi/robot systém; audit staré větve není důkazem jejich dnešní chyby. | Ověřit skutečný font v balíčku, 12–16px logo/ikony, Dock/Explorer/Store, CS/EN dlouhé texty, 320–1920px a čtyři vzhledy; zkontrolovat proti schváleným zdrojům. | Pokračující vizuální/asset QA, #213/#218. |
| A11 / P2 | Výkon na velkém počtu agentů má existující testy a opravy #249. Starý lokální slow-task výsledek 0.46.13 není nález pro 0.46.48. | Aktuální SHA, 20/50/140 sessions; p95 interakce, scroll, SSE, CPU/baterie na Macu; benchmark bez souběžné zátěže. | Měření, #209/#218. |
| A12 / P2 | Aktuálnost a jistota stavu jsou pro dohled zásadní; zdroje mohou být heuristické a některé konektory Beta. | U kritických stavů rozpoznat původ/stáří; test start/stop/limit/reset/offline se skutečným Claude/Codex zdrojem; nikdy neodvozovat cenu jen z tokenů. | Navazuje #180 a existující modelové testy. |

## Produktové příležitosti a konkurence

Dnešní živé srovnání nebylo dostupné: oficiální stránky Conductor, Superset a Raycast vracely při předchozím pokusu proxy 403. Historické srovnání z 13. 10. není nový benchmark. **Nelze poctivě tvrdit, v čem dnes konkrétní konkurent vede, bez aktuálního ověření.** Agenteeq již má paletu, worktrees/diff, pozornost, projekty a personalizaci — jejich absenci nenavrhovat jako feature.

Diferenciaci testovat jako hypotézy, ne plošným rozšiřováním ovládacích prvků:

1. **Pozornost → obnovená práce:** navázat na existující „Vyžaduje pozornost“ a Upozornění; prioritizace, odložení a jeden spolehlivý návrat do session. Akceptace: 5–10 uživatelů řeší čekajícího agenta bez hledání v jiné aplikaci; měřit čas a chyby.
2. **Uložené pracovní pohledy:** pojmenované filtry projekt/nástroj/stav pro 20+ sessions. Akceptace: obnoví filtr po restartu, fungují z palety a na telefonu; žádná duplicitní navigace.
3. **Přezkum výsledku:** rozšířit existující session/worktree/diff o ověřený CI/PR stav a další krok. Akceptace: jasný původ a čas dat, žádné implicitní spuštění nebo schválení akcí.
4. **První užitečný signál:** krátký úvodní brief podle skutečně nalezených nástrojů; pomocník vysvětluje konkrétní problém. Akceptace: čistá instalace bez účtu, první ověřený agent do 2 minut v uživatelském testu; chybějící nástroj má použitelnou cestu dál.

## Roadmapa podle výstupů

- **Nyní:** dokončit A01/A02, aktuální testy, review a PR. Nezvyšovat verzi jen kvůli číslu.
- **Před dalším distribuovaným kandidátem:** A03–A08; oddělit soukromou Preview zkoušku od veřejného produkčního launch gate. Respektovat Claudovu sloučenou změnu ručního sestavování (#327).
- **Další kvalitativní iterace:** A09–A12, pouze reprodukovatelné nedostatky; zachovat schválený layout a styl.
- **Poté pilot:** ověřit první dvě produktové hypotézy a vybrat podle pozorovaného přínosu. Měřit čas od upozornění k akci, úspěšnost prvního spuštění a spolehlivost návratu do session; bez skryté telemetrie.

Cíl „10/10“ znamená prokazatelnou kvalitu a nulové známé kritické závady, nikoli slib absolutní bezchybnosti. Stav hotovo rozlišuje implementaci, testy, review, publikaci a skutečnou instalaci.

## Ověření této iterace

- `npm run check`: 399 souborů, bez syntaktické chyby.
- Kompletní `npm test` na Node 22.22.0: **1411 testů, 1401 prošlo, 10 přeskočeno, 0 selhalo**. Použit stávající pomocník `/workspace/shared/agenteeq-test-http-agent.cjs` pro nové klientské spojení v LAN teardown testu; aplikace se tím nemění.
- `qa:desktop`, Chromium, `QA_SKIP_PREFLIGHT=1`: funkční část prošla, včetně route, 375/900/1180/1440px, témat, offline fontů a nulových JS chyb. **Přeskočený výkonnostní preflight není potvrzené měření výkonu.** WebKit a fyzická zařízení se touto kontrolou neověřily.
- Aktuální snímky z testu, uložené a prohlédnuté 20. 10.: `dist/audit-2026-10-20/welcome.png` a `overview.png` (izolovaná QA data). Nejsou to snímky nainstalované aplikace uživatele.

| Krok | Kontrolovaný tok | Stav |
|---|---|---|
| 1 | Úvodní průvodce | Aktuální screenshot prohlédnut, navigaci kontroluje browser QA; míru dokončení skutečnými uživateli nelze z obrázku vyvodit. |
| 2 | Přehled, pozornost a agenti | Aktuální widgetové rozložení a značka prohlédnuty; jde o QA fixture, nikoli naměřené uživatelské limity. |
| 3 | Navigace, formuláře, témata a menší okna | Funkční Chromium sada prošla; nepředstavuje úplný ruční audit každého stavu ani nativní Mac test. |

- `qa:axe`: 8 obrazovek × light/dark × 1440/375/320px, bez automaticky zjištěných porušení; reflow bez horizontálního přetékání, průchod Tabem s viditelným fokusem. Ruční čtečka obrazovky zůstává otevřená.
- `qa:contrast`: aktuální app (čtyři vzhledy, 1440/375px včetně prázdného profilu), web a popup rozšíření prošly kontrolou textového kontrastu. Nejde o úplný certifikát WCAG.
- Po převzetí #327 prošly i aktualizované `prepare-preview-draft.test.mjs` a `workflow-opravneni.test.mjs`.
