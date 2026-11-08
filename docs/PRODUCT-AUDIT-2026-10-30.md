# Audit appky, rozšíření a webu — 30. 10. 2026

## Rozsah a skutečný stav distribuce

Základ auditu: aktuální GitHub `main` **95093a1dfa7617b8feab2752f4750380b5c5a32a**. V repozitáři bylo 11 otevřených issues a jediný PR #386 (evidence publikace Chrome Store). Starší komentáře v #255 zmiňují verze 0.46.12–17; nejsou aktuálním seznamem neopravených chyb.

| Produkt | Ověřený stav |
|---|---|
| Mac/Windows aplikace | **0.46.86 Preview**, zveřejněno 30. 10.; osm příloh. Publikace [41084284085](https://github.com/martin-pok/agentree/actions/runs/41084284085), build/audit [40672551542](https://github.com/martin-pok/agentree/actions/runs/40672551542). |
| Stabilní distribuce | GitHub Latest **0.46.58**. Opravy z Preview nelze vydávat za součást stabilního stažení. Přepnutí Stable vyžaduje samostatné rozhodnutí a odpovídající ověření. |
| Rozšíření na GitHubu | ZIP **0.46.86** je součástí Preview. Není to publikace do Chrome Store. |
| Veřejný Chrome Store | **0.46.55**, potvrzeno z veřejného HTML. Upload 0.46.86 [41084349483](https://github.com/martin-pok/agentree/actions/runs/41084349483) selhal. Publikace a výměna listingových podkladů zůstává P0 #172. |
| Produkční web | `agentree-fawn.vercel.app`, Vercel deployment **dpl_EQVFeBzhsUoX5xUVsij9tx9BVv4L**, READY, stejný main **95093a1**. Robotí materiály i geometrie sdílené s appkou; samostatný starý robot byl odstraněn. |
| Nové opravy | Kandidát **0.46.87**, větev `audit/products-2026-10-30`. Před dokončením CI/vydání nejsou v instalované 0.46.86. |

## Dvě potvrzené chyby detekce a opravy

### P0: Codex index končil na první stovce

`readCodexAppThreads()` v `src/connectors/codex-app-threads.js` ignoroval `nextCursor`. Metadata skutečného app vlákna na další stránce se nikdy nedostala do storu.

- Nový test se 100 jinými záznamy a požadovaným app vláknem na druhé stránce selhal před změnou: **100 místo 101**.
- Oprava pokračuje přes další stránky; zachovává kompatibilní parametry starších SDK. Chyba další stránky, opakovaný kurzor a překročení bezpečnostního limitu znamenají neúplný odečet, nikoli falešný úspěch s oříznutým seznamem.
- Testy: `test/codex-app-threads.test.mjs`, včetně opakovaného kurzoru, chyby další stránky a staršího SDK.
- Skutečný **Codex CLI 0.163.0** odpověděl na stejný app-server protokol proti prázdnému izolovanému profilu za **246 ms**. To ověřuje transport/protokol; nepotvrzuje živý stav cizího procesu Codex.app na konkrétním Macu.

### P0: Moderní Codex SDK ukládá i chybu jako `task_complete`

Skutečný kontrolovaný CLI pokus skončil odmítnutou obnovou přihlášení. Jeho vlastní JSONL obsahoval `task_complete` s polem `error`. Parser toto pole ignoroval a ukázal `waiting`, přestože CLI hlásilo `turn.failed` a žádná odpověď nevznikla.

- Před opravou: **working → waiting**.
- Po opravě nad stejným skutečným SDK a stejnou příčinou: **working → failed**, s konkrétní chybou přihlášení. Nalezení pracující relace **809 ms**, chybový stav **1586 ms** od spuštění.
- `task_started` ruší předchozí chybu. Explicitní SDK `UsageLimitExceeded` zůstává `limited`, nikoli obecné selhání.
- Testy: `test/codex-terminal-error.test.mjs`; reprodukce před změnou i následný nový úspěšný tah.
- Přihlášení CLI se tvářilo dostupně, ale skutečný požadavek prokázal neobnovitelný token. **Úspěšná živá AI odpověď nebyla ověřena.** Pro opakované canary používat vyhrazený QA profil, nikoli kopii/symlink osobních přihlašovacích souborů.

## Co bylo ověřeno samostatně

- Výchozí kód: **1560 testů, 1547 úspěšných, 13 přeskočených, 0 selhání**; syntax, balíčková instalace/start, sestavení webu i rozšíření.
- Po opravách: **1566 testů, 1553 úspěšných, 13 přeskočených, 0 selhání** i na finálním kandidátovi .87; cílené regrese stránkování, SDK chyby, limitů a CI kontraktů prošly. Balíček .87 se samostatně nainstaloval a spustil.
- Čerstvý GitHub [41092831090](https://github.com/martin-pok/agentree/actions/runs/41092831090): **8/8 úloh úspěšných** po opakování nativní Mac úlohy. První pokus neměl dostupný hosted arm64 runner; nešlo o chybu aplikace. Mac/Windows nativní spuštění a Chromium/WebKit ověřil runner, nikoli osobní prostředí vlastníka.
- Lokální Chromium: desktopový QA průchod, **40 webových variant** a **35 scénářů popupu**. Popupový test používá atrapu Chrome API; tento rozsah se nesmí zaměňovat s následujícím testem.
- Nový `npm run qa:detectors`: **skutečně načtené MV3 rozšíření**, jeho service worker, content scripts, skutečné Chrome API a párovaný HTTP server aplikace. Jeden prompt a jedna odpověď dojdou až do přepisového API. **11 služeb × 3 stavy** (pracuje → dokončeno → limit), žádné chyby. Ve finálním měření nalezení **446–581 ms**; hlídá se 2s limit. Ověřena i obnova po restartu aplikace bez nového párování.
- Služby: ChatGPT, Codex web, Claude.ai, Claude Code web, Gemini, Google AI Studio, Microsoft Copilot, Perplexity, Grok, Qwen a GitHub Copilot.
- **Poskytovatelské DOM v tomto testu je syntetické.** Test neprokazuje shodu s dnešní přihlášenou stránkou každé služby. Aktuální adresáře `test/fixtures/web` stále neobsahují sadu potvrzených živých DOM vzorků; automatické sledování změn poskytovatelů vyžaduje testovací účty.

## Report #255: dnešní mapování všech 16 bodů

Původní report a screenshots se nepřepisují. „Pokryto“ v tabulce znamená dohledatelný kód a automatickou kontrolu, nikoli osobní potvrzení majitelem nebo formální asistivní audit.

| Požadavek | Dnešní evidence | Co zůstává |
|---|---|---|
| 5/8 černá obrazovka, Quit, rollback | `test/updates.test.mjs`, `test/lifecycle.test.mjs`, `scripts/qa-native.mjs`, `scripts/qa-update.mjs`; nativní CI | Udržovat samostatný upgrade/rollback test v CI, ne každou novou verzi přehazovat na majitele. |
| 8.5 rychlost/průběh aktualizace | `test/updates-streaming.test.mjs`, nativní aktualizační scénáře, skutečný průběh stahování | Měřit dobu download/extraction/relaunch; neodvozovat rychlost z existence progress baru. |
| Codex limit místo waiting | `test/pravda-limitu.test.mjs`, `test/limits-failure.test.mjs`, nová terminální SDK regrese | Nově nalezené chyby stránkování a SDK chyby jsou v kandidátovi .87. |
| Logout/delete potvrzení | `test/notion-scroll-account.test.mjs`, `qa:desktop` bezpečný výchozí fokus | Živé OAuth/deletion se samostatným testovacím účtem; neničit osobní účet uživatele. |
| Scroll upozornění | `test/assistant-scroll.test.mjs`, `test/notion-scroll-account.test.mjs`, Chromium/WebKit QA | Průběžně hlídat různé vnořené scroll kontejnery a živé překreslování. |
| První spuštění/prázdné stavy | `scripts/qa-prazdny-profil.mjs`, `qa:tvary`, `qa:contrast` | Pravidelná galerie skutečných čistých profilů; původní Notion screenshoty nebyly v tomto auditu dostupné jako pixely. |
| Lokální pomocník | `test/assistant-guide.test.mjs`, `qa:assistant`, CZ/EN, unknown a skutečný snapshot | Uživatelskou studii neoznačovat za provedenou; automatické dotazy a pravdivost odpovědí průběžně hlídat. |
| QR párování telefonu | `test/qr.test.mjs`, `test/phone-pair-ui.test.mjs`, testy LAN oprávnění/tokenů | Skutečný Safari/iPhone a tailnet nejsou připojené. Jde o rozšíření automatického device labu, ne požadavek na majitele pouštět příkazy. |
| Skills search | `test/notion-skills-project-dialog.test.mjs`, `qa:desktop` | Pokrytí 375px a klávesnice zachovat; formální VoiceOver zvlášť. |
| Avatar konkrétního agenta | `test/agent-appearance-detail.test.mjs`, `qa:desktop` | Zachovat persistenci pro konkrétní ID, ne seznamový globální přepis. |
| 10.5 selecty/oblečení | Stejný detailový test, robotí/šatníkové testy a skutečné browser screenshoty | Původní vizuální signoff není doložen pouze testy struktury. |
| Projektový dialog | `test/notion-skills-project-dialog.test.mjs`, projektové UI/HTTP testy, `qa:desktop` | Chyby médií pokrývá také `test/project-media-retry.test.mjs`. |
| Optika cloud glyph | `test/account-sync-icon.test.mjs`, brandové testy | Samotný test geometrie není původní vizuální porovnání Notion. |
| Poměr hlavy/wordmark | `test/brand-robot.test.mjs`, `test/brand-inventory.test.mjs`, kontrola zabalených ikon | Nevracet starou geometrii. Vercel projektový avatar a původní vizuální baseline stále samostatné #213. |
| Minimalistická obnova | `qa:refresh`, `qa:desktop`, reduced-motion | Nevracet falešné dokončení ani rušivý druhý banner. |
| CZ/EN microcopy | `test/i18n.test.mjs`, `qa:site`, `qa:contrast`, browser sazba | Editorial a plný asistivní audit nejsou automaticky hotové průchodem axe. |

#255 tedy není šestnáct dosud neimplementovaných chyb. Je to zastaralý smíšený tracker oprav, automatických důkazů a samostatných vizuálních/device požadavků. Nezavírat ho hromadně bez aktualizace rozsahu.

## Skutečná fronta po auditu

1. **P0 — dokončit a vydat .87 s oběma potvrzenými chybami Codexu.** Nové regrese a skutečné MV3 QA musí projít na přesném vydávaném commitu.
2. **P0 — #172, Chrome Store.** Nový ověřený ZIP a CZ/EN podklady existují, ale veřejnost dostává .55. Nahrání ZIPu neaktualizuje listingové obrázky a texty. Nutný přístup vydavatele / OAuth a Developer Dashboard; to není práce testera.
3. **P0 — testovací účty a canary pro poskytovatele.** Trvalé vyhrazené profily Codex/Claude a webových služeb v chráněném QA prostředí. `qa:detectors` běží bez účtů; `qa:live-codex` vyžaduje explicitní QA profil a hlásí blokované přihlášení jako blokaci, nikoli pass. Tento workspace nemá připojenou osobní Mac relaci, VPN ani testovací přístupy pro všechny poskytovatele.
4. **P1 — #174/#208, device lab.** Doplnit skutečný Chrome action-popup → již běžící Mac okno, upgrade/rollback na čistém podepsaném balíčku a iOS/Safari. Nový MV3 test pokrývá background párování, nikoli tento nativní fokus.
5. **P1 — sjednotit release evidence.** Preview .86 je vydané, roadmapa a #255 používají starší „kandidát“ / .17 tvrzení. PR #386 je zahrnutý v auditní větvi a jeho statusové údaje se aktualizují.
6. **P1 — #217/#218.** Průběžná automatická přístupnost, skutečné Safari/iPhone, Retina a provozní výkon. Axe + CI Chromium/WebKit není úplný formální WCAG audit ani skutečná provozní CWV data.
7. **P1 — #213/#225.** Dokončit schválenou brandovou galerii a pouze skutečné trust reporty. Nevydávat interní testy za externí certifikaci.
8. **Před placeným launchem — #232/#229.** Skutečná identita provozovatele, neveřejný GDPR kontakt, odsouhlasené právní texty a známková rešerše. Údaje nelze vymyslet; právní drafty nejsou schválené podmínky.
9. **P2 — #219.** Rozvoj command centra, triage, git review a zátěž 20–50 agentů navazuje po detekci a distribuci; není náhradou za ně.

## Opakovatelná kontrola bez uživatelského testování

Běžné CI: syntax, jednotkové/integrační testy, balíčkový smoke, nativní Mac/Windows, Chromium/WebKit, axe, web/extension/kontrast a nyní skutečné MV3 `qa:detectors` včetně restartu. Diagnostické výstupy jsou v `dist/qa*` a CI cache; vydávané přílohy má nezávislý byte audit.

Volitelný skutečný provider canary: `AGENTEEQ_LIVE_CODEX=1 AGENTEEQ_LIVE_CODEX_HOME=/absolute/dedicated-qa-profile npm run qa:live-codex`. Profil zajišťuje provoz QA jednorázově; vlastník aplikace nemá při každé verzi sloužit jako manuální tester. Skript nečte ani nekopíruje přihlašovací soubory, nepoužívá osobní browser profil, pracuje se syntetickým promptem a nepublikuje přepisy ani auth debug výstup.

Úplnou bezchybnost všech budoucích verzí cizích služeb tento audit neslibuje. Konkrétní nové chyby jsou doložené, opravy mají reprodukce a zbývající přístupové/device mezery jsou pojmenované.
