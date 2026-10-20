# Roadmapa Agenteeq

**Stav 20. 10. 2026:** veřejné Preview je [`v0.46.43`](https://github.com/martin-pok/agentree/releases/tag/v0.46.43); připravuje se `v0.46.44`. Stable Latest zůstává `v0.46.0`.

**Aktuální prioritní plán: [Komplexní produkční audit a checklist 10/10](QUALITY-AUDIT-2026-10-13.md).** Stav ověřen 13. 10. 2026 proti GitHub a Vercelu. Nezastupitelné rozlišení: *hotovo v kódu* / *prošlo CI* / *otestováno na reálném zařízení* / *zveřejněno*. Nesmí se vypisovat staré Drafty jako aktuální P0 práce.

**Historický zablokovaný Draft v0.46.11 (nikoli nejnovější kandidát).** Anotovaný tag `v0.46.11` na `1e72a0057637ad249e70388444346a80526e7083`; přesné [CI 8/8](https://github.com/martin-pok/agentree/actions/runs/38430918556); úspěšný [release build + nezávislý byte audit](https://github.com/martin-pok/agentree/actions/runs/38432569881): soukromý Draft ID `411899483` s 8 přílohami, SHA-256 skutečně stažených bajtů **8/8 vůči GitHub API a 7/7 vůči manifestu** (report ID `11831787377`). [PR #216](https://github.com/martin-pok/agentree/pull/216) opravila ruční publishing REST workflow a byla sloučena v `af3c1fa`, [8/8 main CI](https://github.com/martin-pok/agentree/actions/runs/38440054592). **Dílčí fyzické Mac UAT 13. 10. proběhlo:** instalace z ověřeného DMG, start/restart, stávající účet, upozornění a projekty obstály; přesný rozsah a Gatekeeper `rejected` jsou v [RELEASE-READINESS.md](RELEASE-READINESS.md). Čistý Finder/Gatekeeper onboarding, nové Google OAuth, Chrome/Windows a úplné UAT jsou stále otevřené. PWA/Apple PNG v tomto neměnném Draftu mají staré proporce a fialovou anténu; [oprava #231](https://github.com/martin-pok/agentree/pull/231) vyžaduje nový binární kandidát. `v0.46.11` nezveřejňovat. Veřejné Preview je od 14. 10. `v0.46.12` (viz níže; předtím `v0.46.6`), Stable Latest `v0.46.0`, veřejný Chrome Store `0.31.4`.

## Právě teď — oprava release blockerů a fyzické UAT

**Aktuální release vlak 20. 10. 2026:** **0.46.44 Preview** (`v0.46.44`) nese vysvětlení pod „i“ místo odstavců a béžových pruhů a Měsíční rozpočty bez rolování. Zveřejněné **0.46.43 Preview** (`v0.46.43`) nese kompaktní nahrávání obrázku a loga, „i“ ovladatelné klepnutím, viditelné pruhy „Kam dnes šly tokeny“ a Detekované procesy bez zavádějící nuly. Zveřejněné **0.46.42 Preview** (`v0.46.42`) nese cloudové relace Claude Code jako Cloud, „Dnes: N konverzace“, hledání podle projektu, větve i zadání a klidnou obnovu; z `v0.46.41` logo projektu bez rámečku v rozích, spouštění bez matoucího „Na webu“, srozumitelné bubliny robotů, fialový výběr řádků a úchyt widgetu se vzduchem; z `v0.46.40` výraznější rozbalení Průběhu dne, opravená a propracovaná gesta robota, jméno v profilu jako odkaz do účtu a vysvětlení u rozpočtů za „i“. Zveřejněné **0.46.39 Preview** (`v0.46.39`) nese přesouvatelné a zvětšitelné widgety na Přehledu, z `v0.46.38` jemnější dlaždice stavu agentů a poznámky bez hnědé, z `v0.46.37` projekty a grafy čitelné v tmavém režimu, z `v0.46.35` čistší karty agentů a hlavičku přepisu na telefonu a z `v0.46.34` Pomocníka, který bez výslovného zapnutí neposílá dotazy žádné AI. Předchozí zveřejněné bylo `v0.46.33` (Pomocník se živým stavem nástroje, z `v0.46.32` fokus na „Zrušit“ u mazání).

**Web již na produkci:** Windows/Mac adaptivní CZ/EN úvodní i instalační cesta z PR #263 je sloučená. Vercel projekt `agentree` potvrdil READY pro `c344211` na produkční větvi; reálné Windows UAT a produkční dostupnost jednotlivých downloadů se ověřují samostatně. Zelený deployment není důkazem publikace desktopových binárek.

**Stav vydávání 20. 10. 2026:** Preview vychází průběžně přes automatický Draft s auditem příloh a ruční zveřejnění (`publish.yml`); poslední veřejné je [`v0.46.43`](https://github.com/martin-pok/agentree/releases/tag/v0.46.43) (20. 10., osm příloh včetně `SHA256SUMS.txt`, otisky ověřené při zveřejnění). Starší kandidáti 0.46.11–0.46.14 jsou historie (podrobnosti v [RELEASE-READINESS.md](RELEASE-READINESS.md)). **Zdokumentované fyzické UAT na Macu, v Chromu ani na Windows zatím neproběhlo** – to zůstává první P0.

| Priorita | Výsledek | Důkaz a stav | Dokončení |
|---|---|---|---|
| **P0** | **UAT zveřejněného Preview** | Poslední veřejné [v0.46.43](https://github.com/martin-pok/agentree/releases/tag/v0.46.43) (prerelease, otisky příloh ověřené při zveřejnění); Stable Latest `v0.46.0`. **Zdokumentované fyzické UAT na zařízení neproběhlo.** [#208](https://github.com/martin-pok/agentree/issues/208) | Mac z veřejného DMG/ZIP: instalace, aktualizace v aplikaci, Finder/Gatekeeper, Google SSO/avatar, rollback, živý stav vzdálených agentů Claude Code; Chrome a Windows UAT; nalezená závada = nová verze |
| **P0** | **Aktualizovat skutečný Chrome Web Store** | Veřejný Store **0.31.4** (rozbité úzké okno) vs. rozšíření v každém Preview (`agenteeq-extension-<verze>.zip`). Nahrání se od 0.46.27 spouští samo po zveřejnění vydání (`chrome-web-store.yml`), ale končí varováním: v repozitáři chybí `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` (účet vydavatele, jen vlastník). [#172](https://github.com/martin-pok/agentree/issues/172) | Vlastník doplní tři secrets nebo jednou nahraje ZIP v Developer Console; pak obchod zveřejní aktuální verzi a ověří se live instalace a párování v Chromu |
| **P0** | **Bezpečný nativní focus agenta a autentizace** | Zdrojový 403 bug již opraven. `POST /api/extension/focus-agent` validuje token, origin, viditelné ID a existující okno; testy prochází. [#174](https://github.com/martin-pok/agentree/issues/174) | Reálný párovaný Mac+Chrome, čekající/běžící agent kliknutím otevře původní session bez duplikace, offline/unpair/focus je přístupný |
| **P0** | **Brand na každé platformě, bez trojzubce** | Staré tracked PNG/ICO/ICNS odstraněny, web/404 favicon a Windows ZIP QA hotovy; Mac Dock z 0.46.11 vizuálně ověřen; PWA/Apple PNG v Draftu **prokazatelně staré**, zdroj opravuje PR #231; Explorer a dashboard Vercel avatar neověřeny. [#213](https://github.com/martin-pok/agentree/issues/213) | Pixelová shoda zdrojů, malých ikon, promo i skutečně nainstalovaných UI a avataru |
| **P0** | **Pravdivé live stavy a první Claude event** | V CI historický timing fail 2s, teď 8/8 na vydávaném SHA; falešně potvrzenou práci nelze tolerovat. [#180](https://github.com/martin-pok/agentree/issues/180) | Reálné Claude/Codex/Chrome statusy, restart/offline, provenance a nejistoty doložené live UAT |
| **P1** | **WCAG 2.2 AA pro web, app a Chrome rozšíření** | Kontrast/ovládací prvky, axe WCAG 2.2 A/AA na 8 obrazovkách (světlý/tmavý, 1440/375 px) přeskládání na 320 × 256 CSS px (400 %) a průchod Tabem s viditelným fokusem bez pasti v CI; **čtečky (VoiceOver/NVDA) na zařízení nedoložené**. [#217](https://github.com/martin-pok/agentree/issues/217) | Keyboard, VoiceOver/NVDA, reflow 320 CSS px/400% zoom, fokus, cíle 24×24, live announcements, CZ/EN chyby; 0 kritických/serious nálezů |
| **P1** | **Responzivita, typografie a produkční PSI** | V CI Chromium/WebKit viewporty a design tokeny; iPhone Safari, p75 CWV, 400% zoom, skutečný PSI nejsou doloženy. [#218](https://github.com/martin-pok/agentree/issues/218) | Real-device 320–1920px CZ/EN světlý/tmavý/reduced-motion; LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,1 (p75) s doloženým měřením |
| **P1** | **Agents UI bez >50ms dlouhých renderů a s 20+ agenty** | **Opraveno v kódu ([PR #249](https://github.com/martin-pok/agentree/pull/249)), v `v0.46.13`.** Příčiny změřené v trase Chromia: `:has()` přepočítával styly všech karet, dávka znovu slučovala celou tabulku, pohyb robotů měřil i roboty mimo okno. Se 140 agenty 0 dlouhých úloh v `qa:desktop` na všech 8 obrazovkách, regresní test `test/plynulost.test.mjs`. WebKit ověřilo jen CI. [#209](https://github.com/martin-pok/agentree/issues/209) | Reprodukovat profil na shodném SHA, optimalizovat skutečný bottleneck, doložit p50/p95/p99 i 20–50 session + Chromium/WebKit |
| **P1** | **Native/signing, cloud/account a bezpečnost pro světový trh** | DMG funguje na CI, Developer ID/notarizace není hotová; DPA/privacy review a reálné OAuth/live konektory nedokončeny. | Developer ID, notarizace, real-device Gatekeeper/UAT, právní review, origin/permission threat model |
| **P2** | **Power-user value — attention inbox, saved views, source confidence, Git review** | Existují Upozornění, command palette, projekty a worktree helpers; další návrhy jsou **hypotézy, nikoli hotové funkce**. [#219](https://github.com/martin-pok/agentree/issues/219) | 5–10 rozhovorů, měřený time-to-unblock/time-to-first-value, UX prototyp, bezpečnost, CZ/EN, pilotní UAT a jen ověřená feature do releasu |

## Backlog — podle dopadu na uživatele

**P0 release a aktivace:** [#208](https://github.com/martin-pok/agentree/issues/208), [#172](https://github.com/martin-pok/agentree/issues/172), [#174](https://github.com/martin-pok/agentree/issues/174), [#213](https://github.com/martin-pok/agentree/issues/213). Nespouštět další bump release čísla jen proto, že aktuální Draft není zveřejněný. Neměnit neměnné binárky.

**P1 měřitelná kvalita:** [#217](https://github.com/martin-pok/agentree/issues/217) (WCAG 2.2), [#218](https://github.com/martin-pok/agentree/issues/218) (iOS Safari/responsive/typografie/PSI), [#209](https://github.com/martin-pok/agentree/issues/209) (desktop long-task), [#180](https://github.com/martin-pok/agentree/issues/180) (2s první Claude event), regresní testy spuštění, práce při více sessions, spotřeba baterie a neznámé/offline stavy.

**P2 diferenciace a výzkum:** [#219](https://github.com/martin-pok/agentree/issues/219). Orientace na napříč poskytovateli sjednocenou pozornost, původ dat, kontrolu nákladů a návrat do konkrétní session. Nezasahovat bez produktových důkazů do již existující palety příkazů, worktree/diff ani Alert rozhraní.

**Archiv původních Draftů:** `v0.46.7`, `v0.46.8`, `v0.46.9`, `v0.46.10` jsou historicky sestavené, nepřepisovat/nepropagovat. Nynější stav a podpis publikace vždy doložit přes GitHub API a reálný účet, ne odhad z kódu.

**Úplný zdrojový checklist, kritéria a známé hranice důkazů:** [QUALITY-AUDIT-2026-10-13.md](QUALITY-AUDIT-2026-10-13.md).

## Rozhodnutí schválená vlastníkem — sledování implementace

| Požadavek | Stav v kódu | Co chybí do reálného dokončení |
|---|---|---|
| Obsah pod macOS titlebarem a bez kolizí s průvodcem | Oprava na PR #130 | Vizuální QA skutečné nainstalované aplikace |
| Živý počet pracujících agentů v macOS menu baru | Implementováno v pracovní větvi | Ověřit reálné běhy, restart serveru a výpadky na Macu |
| Dovednosti: ikona blesku; „Omezit pohyb“ | Implementováno | Finální vizuální kontrola |
| Jediný oficiální širší filled logomark s kapslovými očima a jednou anténou | Geometrie Dock generátoru aktualizovaná; **není pixelově schválená proti originálu** | Exportovat schválené SVG/PNG/transparent varianty; sjednotit aktivní brand assety a binárky, bez Scouta jako Dock ikony, trojzubce a fialové antény |
| České a anglické aktuální skutečné screenshoty Chrome Store | Exporty v `branding/chrome-web-store/export/` | Zkontrolovat proti finálnímu UI a zveřejnit přes účet vydavatele |
| Google OAuth a profilová fotografie | Stav skutečného přihlášení neověřen | UAT přes Google účet, logout/login a offline |
| SEO prodejní landing page | Metadata a strukturovaná data v kódu | Produkční crawl, canonical/hreflang, indexace, CWV, reálné nasazení |
| Automaticky aktuální GitHub / lokální aplikace / Store | Commity v GitHubu jsou oddělené od distribuce | Release build, QA upgrade nainstalované aplikace, publikace obchodu; neslibovat vzdálenou úpravu Macu bez přístupu |

Tato tabulka zachovává rozhodnutí i při změně agenta. Po každém schváleném požadavku aktualizovat odpovídající řádek, changelog a testy. Uzavřít položku až s odkazem na ověřitelné artefakty.

## Zátěžové a mezizařízení scénáře — akceptační kritéria

**20 současně běžících agentů na jednom Macu (P0):** každá session má vlastní ID, neztrácí se SSE změny, počítadlo v menu baru odpovídá skutečným pracujícím session (nikoliv počtu procesů nebo všech historických chatů). Ověřit start/stop 20 běhů, jejich různá pořadí, rychlé přechody, reconnect SSE, vypršení čerstvosti a výpadek lokálního serveru. Automatická syntetická simulace: `test/twenty-agents-stress.test.mjs`; skutečných 20 externích procesů na Macu **neověřeno**. Cíl od zdroje do UI dle `AGENTS.md` je do 2 sekund pro souborové události, okamžitě pro hooky.

**Mac mini s lokálním modelem (P0/P1):** katalog procesů už zahrnuje Ollamu a LM Studio. Zjištění, že běží hostitel/model, **nedokazuje**, že model vyřizuje konkrétní požadavek. Přidat explicitní read-only status konkrétních generování na základě ověřitelného zdroje (např. vlastní instrumentace běhů či podporované API), pravdivě rozlišit načtený model, běžící proces a aktivní inferenci. Ověřit model unload, několik lokálních běhů současně, chybějící Ollama endpoint a restart serveru. U vzdáleného Mac mini je zapotřebí spárovaný zdroj na tom zařízení; lokální process scan jiného Macu vzdálené procesy **neuvidí**.

**Claude Code spuštěný na telefonu (P0/product decision):** pokud telefon vzdáleně ovládá **stejný Mac**, kde běží Claude Code a Agenteeq, jeho nový proces/hooky se mohou zobrazit v macOS aplikaci ze stávajícího lokálního zdroje. Je-li to Claude Code běžící **na jiném hostiteli/cloud VM**, Agenteeq to bez konektoru k tomuto hostiteli neuvidí. Současná spárovaná mobilní aplikace je z bezpečnostních důvodů read-only: endpointy pro vzdálené spuštění blokuje `src/remote-scope.js`. Neobcházet ochrany. Pro požadované spuštění přímo z telefonu navrhnout výslovně autorizovanou frontu akcí se schválením na hostiteli, omezením dostupných nástrojů a audit trail; až po security review + UAT. Testované blokování zápisu: `test/twenty-agents-stress.test.mjs`.

**Kvalita dat (P0):** při 20 souběžných session testovat duplicitní ID, opožděné timestampy, chybějící proces, přerušení zdroje a hodnoty „neznámé“; žádný odhad se nemá vydávat za naměřený údaj. Reálné UI testy a skutečný mobilní přístup zůstávají otevřené.

## Multi-account Claude / Codex — produktové rozhodnutí

Implementovaná částečná detekce identit účtů a kvót zatím nezajišťuje spolehlivé přiřazení každé session ani oddělená Claude okna pro více licencí. UX a datové/bezpečnostní požadavky v [MULTI-ACCOUNT.md](MULTI-ACCOUNT.md). **P1 návrh, nehotová funkce**, navržené zařazení správy více licencí stejného nástroje do Pro vyžaduje samostatné produktové schválení. Free musí zachovat sledování všech rozpoznaných agentů. Nezapínat paywall před hotovou a otestovanou správou identit, přiřazení a limitů.

## Integrita časových řad, cache a čerstvost dat

- **Kalendářní den ≠ posledních 24 hodin.** „Dnes“, „včera“, posledních N **kalendářních** dní a měsíční statistiky se řídí místní časovou zónou zařízení; 24 h znamená klouzavých 86 400 sekund. Při změně DST je kalendářní den dlouhý 23 nebo 25 hodin. Testy: `test/kalendarni-den.test.mjs`. V UI nesmí být tyto metriky zaměňovány ani při překladu CZ/EN.
- **Cloudový souhrn:** `src/cloud-sync.js#tokenyPoDnech` nyní odmítá neplatné a budoucí hodinové buckety a nečíselné součty. Regresní scénář: `test/cloud-sync.test.mjs`. Pro synchronizaci zachovat pouze kompletní místní dny; zabránit přepsání pravdivé minulosti neúplnou historií.
- **Verzování cache:** `src/verze-souboru.js` používá obsahové značky/Etag a service worker `public/sw.js` je network-first, API odpovědi se neukládají. Před releasem ověřit skutečný upgrade staré→nové instalace, offline fallback, návrat serveru a vzhled všech assetů v Mac WKWebView/Chrome; implementační princip sám o sobě nedokazuje absenci starého UI.
- **Duplicitní agenty a historická data:** závazně testovat vícenásobné kořeny stejného přepisu, symlinky, stejný session UUID z různých nezávislých profilů, obnovu SSE po restartu a konflikt více instancí. Jeden logický běh musí mít jednu identitu a nesmí se započítat dvakrát; při konfliktu identit nevymýšlet sloučené statistiky.
- **Otevřené P1:** pokrytí dynamických cache/session verzí, stale renderů a souběžných migrací, měření p95 latence a vizuální kontrola na reálných zařízeních.

## Web performance / responsive / SEO — release gate

Průběžný [audit optimalizace 0.46.1](WEB-PERFORMANCE-AUDIT-0461.md): opravené přednačítání primárního písma, neblokující cache revalidace, lehčí hero parallax, nativní webový trackpad, safe-area / ultrawide gutters, minimální dotykové cíle a `/app` noindex. Nová QA kontroluje **šest veřejných stránek** v Chromiu/WebKitu na 22 šířkách od **320 do 3840 px**, plus laboratorní LCP/CLS a SEO regresní pravidla.

**Otevřeno P0 před tvrzením „PageSpeed 100“ nebo nasazením:** zelený CI run pro přesný PR HEAD; produkční/preview build; skutečné PSI Lighthouse mobile+desktop pro každou URL; reálné Safari+iPhone QA (včetně landscape safe areas), low-end CPU/network a kontrola barevných i funkčních stavů. Laboratorní localhost report z QA není PageSpeed skóre ani důkaz p75 field metrik. Nepoužívat neověřená procenta v marketingu.

## Aktuální release gate

Jediný aktivní kandidát a jeho zbývající UAT jsou v prioritní tabulce nahoře a v [RELEASE-READINESS.md](RELEASE-READINESS.md). Starší Drafty jsou archivní důkaz, nikoli samostatné P0 úkoly ke zveřejnění.

**Doplňující ochrana nativních ikon (po 0.46.10):** již nejsou verzované generované `desktop/Agenteeq.icns` ani `desktop/windows/Agenteeq.ico`; Mac při buildu používá `desktop/Icon.swift` a Windows `extension/icons/icon-128.png`. Jejich výstupy jsou gitignored a nesmí být opětovně nahrány jako historické master soubory. Ověření skutečného Dock/Explorer vzhledu při zařízení UAT zůstává P0 v [#213](https://github.com/martin-pok/agentree/issues/213).

## Backlog — další vývoj po stabilizaci

**Reliability:** automaticky měřit čerstvost každého zdroje, opakované načtení, bezpečné offline stavy a rychlost klíčových akcí. U každé nové integrace zaznamenat původ dat, datum posledního potvrzení a test selhání.

**AI pomocník:** přesně vymezit důvěryhodný kontext a akce, přidat strukturované read-only diagnostické nástroje; na schvalované zásahy vyžadovat potvrzení uživatele. Lokální model je volitelná vrstva pro formulaci, nikoli náhrada pravdivých dat.

**Extension:** modulární popup, diagnostika podporovaných adaptérů, CI i reálné scénáře Chromu, odstranění zastaralých screenshotů před uploadem nového balíčku.

**UX a značka:** sjednotit desktop/web/extension v jediné systémové sadě log, tokenů, textů a stavů; zdrojové i generované soubory kontrolovat při buildu.

**SaaS:** fakturace, právní dokumentace, přístupy a týmové role až po bezpečném dokončení základního local-first produktu.

## Historické plány a dosavadní rozhodnutí

Následující záznamy pocházejí z etap v0.3–v1.0. Jsou ponechány jako historie rozhodnutí, **ne jako aktuální sprint**.

---
<details>
<summary>Archiv priorit po 0.38.1 (zachováno pro kontext)</summary>

## Teď – po 0.38.1

Pořadí podle toho, co brzdí ostrý provoz. U položek „vlastník“ je potřeba účet nebo rozhodnutí,
které kód za nikoho neudělá.

Od 0.25.0 vyšlo mimo plán: ověření stránky v okně rozšíření (0.26.0), angličtina aplikace a webu
(0.28.0) a vzdálený Claude Code z Claude Desktopu (0.28.1). Verze 0.29.0 přidává párování
rozšíření bez kódu, nové okno rozšíření se seznamem otevřených konverzací a přepnutím do karty,
rozšíření v angličtině, napojení Claude Code a Codexu bez Terminálu a jednotný systém tvarů
a tlačítek ([DESIGN.md](DESIGN.md), kontrola `npm run qa:tvary`). Verze 0.31.0 přidala více licencí
jedné služby a 0.31.1 dokončila anglické exporty, kalendář a návrat z Google přihlášení. Verze 0.32.0
sama zachytí AI nástroje v činnosti (karta „Zachytil jsem agenta“, Moje nástroje) a čte moderní
Gemini CLI a Qwen Code. Rozpoznání 🧪 nástrojů z katalogu čeká na potvrzení na skutečném stroji
([CONNECTORS.md](CONNECTORS.md)). Verze 0.34.0 rozkládá útratu z Admin API po modelech (náklady
i tokeny organizace) a aplikace pro Mac vychází jen pro Apple Silicon (M1 a novější) – build pro
Mac s Intelem skončil na rozhodnutí vlastníka. Verze 0.35–0.36 čtou limity Claude i z aplikace Claude,
ukazují útratu v eurech a hned zachytí nově spuštěné agenty. Verze 0.37.0 přinesla nový vzhled
Den a Noc a instalátor DMG, 0.38.0 čtyři vzhledy (Úsvit, Půlnoc, Slonovina, Eben), důvěryhodnou kartu
Google účtu a revizi Nastavení, 0.38.1 aktualizaci jedním klepnutím (stažení, ověření, výměna
balíčku a restart). Podrobnosti jsou v `CHANGELOG.md`.

| # | Úkol | Kdo | Akceptační kritéria |
|---|---|---|---|
| 1 | Přihlášení přes Google naostro — **konfigurace hotová 1. 10. 2026** | vývoj + vlastník | Google OAuth aplikace je externí a zveřejněná, provider v Supabase aktivní a návraty jsou omezené na produkční web a jednorázový localhost callback. Automatická regrese prošla; poslední uživatelské ověření je přihlášení konkrétním Google účtem na Macu i na webu. Viz [ACCOUNTS.md](ACCOUNTS.md) a protokol v [TESTING.md](TESTING.md). |
| 2 | Zásady ochrany údajů a DPA se Supabase | vlastník | Právně zkontrolované zásady (co odchází: jen souhrny, viz [ACCOUNTS.md](ACCOUNTS.md) a [DATA-CONTRACT.md](DATA-CONTRACT.md)) a DPA podepsané před prvním cizím uživatelem. **Zčásti hotovo:** zásady ochrany soukromí včetně účtu jsou na webu (`/soukromi`, `/en/privacy`, zdroj `site/soukromi/index.html`) a od 0.31.1 na ně vede jazykově správný odkaz i z Nastavení → Účet. Zbývá právní kontrola a DPA |
| 3 | Podpis a notarizace aplikace pro Mac | vlastník | Developer ID a notarizační profil v tajemstvích GitHubu (`AGENTEEQ_SIGN_IDENTITY`, `AGENTEEQ_NOTARY_PROFILE`); popis vydání pak sám vynechá návod na povolení v Nastavení systému. **Odloženo na pokyn vlastníka** (Developer ID zatím není). **Do té doby hotovo (5. 10. 2026):** jeden postup instalace bez Terminálu na webu (stránka `/instalace`, `/en/install`, sekce Stažení), v popisu vydání, v [INSTALL.md](INSTALL.md), README i v Nastavení aplikace – otevřít → macOS zablokuje → Nastavení systému → Soukromí a zabezpečení → Přesto otevřít (podle nápovědy Applu pro macOS 15 a 26); popis vydání už neradí `xattr`. Terminál (`/install.sh`) zůstává jako alternativa pro pokročilé. Workflow Vydání nově sestaví i instalátor DMG s přetažením do Aplikací (`npm run build:dmg`, stálá příloha `Agenteeq-macOS-arm64.dmg`) – od 0.37.0 se sestavuje a prochází `hdiutil verify` na runneru s macOS a od 0.37.1 na něj vede tlačítko ke stažení na webu (`V_POSLEDNIM_VYDANI` v `scripts/build-site.mjs`). Od 0.38.1 se další verze instalují v aplikaci jedním klepnutím; `/install.sh` od 6. 10. 2026 před otevřením ukončí starou běžící kopii a vypíše další kopie na disku. Zbývá: Developer ID a notarizace; CI zatím neumí importovat certifikát (nálezy 10–11 v [SECURITY.md](SECURITY.md)) |
| 4 | Ověřit webové konektory na živých stránkách | vlastník + vývoj | Pro každý z 8 webů: ověření stránky v okně rozšíření (řádek *tato karta* → *Počty nesedí? Ověřit stránku*) projde a vzorek stránky je v `test/fixtures/web/` s testem adaptéru; teprve pak ✅ v [CONNECTORS.md](CONNECTORS.md). Zatím tam žádný vzorek není |
| 5 | Ruční QA účtu a napojení modelů na Macu | vlastník | Od 0.29.0 spustí „Napojit“ přihlášení na pozadí bez Terminálu (`claude auth login --claudeai`, `codex login`) a prohlížeč dodavatele se otevře rovnou. Ověřit na Macu přihlášení, návrat do aplikace, potvrzení s plánem a záložní cestu „Prohlížeč se neotevřel?“ s vložením kódu; zápis do protokolu v `docs/TESTING.md` |
| 6 | Rozšíření v Chrome Web Store | vlastník | ~~Veřejná instalace jedním klikem~~ **hotovo 6. 10. 2026:** položka je zveřejněná (potvrdil vlastník), od 0.37.1 web i aplikace vedou rovnou do obchodu tlačítkem **Přidat do Chromu**. Zbývá: nahrát do obchodu balíček aktuální verze (`agenteeq-extension-<verze>.zip` z přílohy vydání), aby uživatelé z obchodu nedostali starší rozšíření. Viz [CHROME-WEB-STORE.md](CHROME-WEB-STORE.md). |


</details>

## v0.6 – z bety k prvnímu prodeji (navazuje na 0.5.0)

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | Živé ověření spuštění agentů | Claude Code a Codex v Terminálu i na pozadí spuštěny z UI na reálném projektu; session se zařadí do projektu; zápis do protokolu v `docs/TESTING.md` |
| 2 | Rozhodnout placené funkce | `PAID_FEATURES` nastavené podle rozhovorů s 10 uživateli; texty v Nastavení a na webu odpovídají |
| 3 | Platby a vydání klíče | Stripe Checkout → webhook → `scripts/license.mjs issue` → e-mail zákazníkovi do 1 min |
| 4 | EULA a zásady ochrany údajů | Právně zkontrolováno, odkaz v Nastavení → Licence (zásady viz „Teď“ #2) |
| 5 | ~~Projekty: štítky a šablony briefu~~ **hotovo v 0.39.0** | Filtrování podle štítku; nový projekt ze šablony (agentura, vývoj, marketing) |
| 6 | ~~Projekty: náklady v Kč~~ **hotovo v 0.39.0** (odhad v měně aplikace jen pro modely s ověřeným ceníkem, `public/js/cenik-api.js`) | Tokeny projektu přepočtené odhadem ceny API s viditelným označením „odhad“ |

## v0.3 – spolehlivá beta pro každodenní používání

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | **Ověřit rozšíření na všech 8 webech** | Viz „Teď“ #4. Od 0.25.0 rozšíření posílá jen stav a počty zpráv, takže se ověřuje: rozpoznání služby, ID konverzace z adresy, počty zpráv, přechod pracuje → hotovo a pole pro vložení zadání |
| 2 | Ověřit Cursor, Copilot CLI, VS Code, Gemini CLI na reálných datech | Každý konektor `verified: true` + fixtury z reálných souborů (anonymizované) |
| 4 | Hooky do skutečného `~/.claude/settings.json` | Ruční QA: žádost o povolení → upozornění < 1 s; odinstalace vrátí soubor do původního stavu (zatím ověřeno jen v dočasném HOME) |
| 5 | ~~Upozornění s akcí~~ **hotovo** | Klik na upozornění otevře aplikaci na správné obrazovce (`desktop/Agenteeq.swift`, `userNotificationCenter(_:didReceive:)`) |
| 6 | ~~Ukládání klíčů bez argv~~ **hotovo** | Hodnoty do Klíčenky jdou jen přes stdin (`test/security-hardening.test.mjs`) |
| 7 | ~~Konfigurovatelný port i v rozšíření~~ **hotovo v 0.39.0** | Port se nastaví v okně rozšíření („Agenteeq běží na jiném portu?“); jiný než 4620 si vyžádá volitelné oprávnění `http://127.0.0.1/*`, manifest se nemění. Nastavení aplikace na jiném portu radí, co zadat |
| 8 | ~~Linux a Windows cesty~~ **hotovo v 0.12.0** | Cesty řeší `appSupportDir()` v `src/platform.js`, testy s fixturami běží. Zbývá **ověřit je na skutečném Windows** a označit v `docs/CONNECTORS.md` ✅ místo 🧪 – viz [WINDOWS.md](WINDOWS.md) |
| 9 | ~~Plášť aplikace pro Windows~~ **postavený, neověřený** | Vlastní okno nad WebView2, odznak v hlavním panelu, systémová oznámení – hotovo, CI ho překládá a přikládá k vydání. Zbývá **spustit na skutečném Windows a podívat se na to**, pak podepsat build. Viz [WINDOWS.md](WINDOWS.md) |

## v0.4 – nativní aplikace a historie

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | Nativní aplikace s ikonou stavu | **Zčásti hotovo:** aplikace pro Mac (Swift, `desktop/`) spouští server a počet agentů, kteří čekají na tebe (rozhodnutí, limit, selhání), ukazuje v Docku i u ikony v řádku nabídek (`desktop/Agenteeq.swift#handleDesktopEvent`). Zbývá podpis s notarizací („Teď“ #3, odložené) |
| 2 | ~~Historie > 30 dní~~ **hotovo v 0.39.0** (Statistiky za 90 dní a 12 měsíců z denních souhrnů `src/historie.js`; přepnutí období v rozhraní do 0,2 s; starší dny než začátek ukládání se nedopočítávají) | Statistiky za 12 měsíců do 1 s; migrace bez ztráty dat; bez runtime závislostí |
| 3 | ~~Export útraty (CSV)~~ **hotovo v 0.27.0** | Útrata → Výdaje → *Export CSV*: řádek za platbu v každém měsíci včetně automatických záznamů, kurz a částka v měně aplikace; součty po měsících sedí s obrazovkou (`test/spend-export.test.mjs`) |
| 4 | ~~Pravidla upozornění~~ **hotovo v 0.29.1** | Ztlumení projektu a „jen rozhodnutí“ podle projektu; noční ticho (místní čas počítače, přes půlnoc, výchozí vypnuto) bez oznámení a zvuku, ale se stavem, zvonečkem a odznakem; na konci ticha jeden souhrn jen za to, co pořád platí; víc než 3 upozornění za minutu → zbytek v jednom souhrnu (`src/alerts.js`, testy s pevnými hodinami v `test/nocni-ticho.test.mjs`). Skutečná oznámení v aplikaci pro Mac a ve Windows čekají na ruční ověření |

## v1.0 – SaaS (Pro a Team)

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | ~~Účty a přihlášení~~ **hotovo** | Přihlášení přes Google (PKCE) místo magic linku, Supabase v EU; lokální verze funguje bez účtu. Produkční provider a návraty jsou aktivní od 1. 10. 2026. Viz [ACCOUNTS.md](ACCOUNTS.md). |
| 2 | ~~E2E šifrovaná synchronizace přepisů~~ **nahrazeno v 0.25.0** | Rozhodnutí vlastníka: přepisy počítač neopouštějí vůbec. Synchronizují se jen souhrnná čísla (tokeny po dnech, útrata, limity, počty agentů), dobrovolně a s RLS; přehled na webu je jen čte |
| 3 | ~~Push upozornění na mobil~~ **hotovo v 0.40.0 (Beta)** | Web Push přímo z Macu přes push službu telefonu, šifrovaně (RFC 8291/8292), bez účtu a bez serveru Agenteeq; odběr patří spárovanému telefonu ([REMOTE.md](REMOTE.md), [SECURITY.md](SECURITY.md#upozornění-na-telefon-od-0400)). Zbývá: ověřit doručení < 3 s na skutečném iPhonu (iOS 16.4+, z plochy) a Androidu |
| 4 | Platby (Stripe) | Předplatné Pro/Team, faktury s DPH (CZ/EU), zkušební období |
| 5 | Týmový workspace | Sdílený přehled a rozpočty, role vlastník/člen, bez sdílení obsahu přepisů bez souhlasu |
| 6 | Právní a compliance | Zásady ochrany údajů, DPA, podmínky, kontrola podmínek služeb pro rozšíření. Zásady ochrany soukromí jsou od 0.29.0 na webu, zatím bez právní kontroly („Teď“ #2) |

## Historický seznam známých problémů (nutno znovu ověřit)

Seznam se udržuje proti kódu: co je hotové, odsud mizí (naposledy prověřeno 7. 10. 2026).

- Bez hooků se žádost o povolení pozná jen odhadem (od 0.39.0 podle druhu nástroje a režimu oprávnění, `src/model.js#deriveStatus`): úprava souboru po 20 s „nejspíš čeká na tvé povolení“, Bash a MCP dál jen „možná“ po 90 s. Pole `permissionMode` v přepisu Claude Code zatím není ověřené na skutečných datech (Beta, `docs/CONNECTORS.md`); bez něj platí výchozí režim s ptaním.
- Webové služby vykreslují dlouhé konverzace jen zčásti (virtualizované seznamy), takže počet zpráv z rozšíření může být u dlouhé konverzace nižší než skutečný.
- Codex nezapisuje žádosti o schválení – nelze detekovat „potřebuje rozhodnutí“.
- Fotka Google účtu se u vlastníka nenačetla; příčina zatím nepotvrzená. Od 0.38.0 se stahuje znovu
  po 10 minutách a do záznamu aplikace jde jen kód důvodu (`HTTP n`, `redirect`, `format`, `size`,
  `timeout`, `network`) – podle něj opravit (`src/ucet.js`).
- Výměna balíčku při aktualizaci jedním klepnutím (0.38.1) je ověřená jen testy a stejným postupem
  jako `/install.sh`; první skutečná aktualizace na Macu je zároveň její ruční QA.
- Časová osa ukazuje max. 7 agentů; od 0.18.2 pod ní stojí, kolik jich zbývá, s odkazem na Agenty.
- GitHub Actions: od 0.29.0 běží `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v6`
  a `actions/download-artifact@v7` na Node 24. Varování na zastaralý Node 20 zůstává jen u jobů pro Windows:
  `ilammy/msvc-dev-cmd@v1` verzi pro Node 24 nemá a od dubna 2024 se nevyvíjí. Náhrada od třetí strany
  (např. `step-security/msvc-dev-cmd`) čeká na rozhodnutí vlastníka.
- Párování rozšíření bez kódu na Windows: ID rozbaleného rozšíření se tam počítá z cesty v UTF-16
  podle zdrojů Chromia, na skutečném Windows neověřeně (`src/platform.js#idRozbalenehoRozsireni`).
  Když nesedí, zbývá jednorázový kód z Nastavení.
