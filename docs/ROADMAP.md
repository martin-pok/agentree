# Roadmapa Agenteeq

**Aktuální priorita (13. 10. 2026): vydat pouze jeden nejnovější smysluplný Preview kandidát `v0.46.11`, nikoliv publikovat staré Drafty 0.46.7–0.46.10.** Po [PR #212](https://github.com/martin-pok/agentree/pull/212) (čištění Mac/Windows/web assetů + kontrola reálného ZIPu) a [PR #214](https://github.com/martin-pok/agentree/pull/214) (odstranění verzovaných generovaných ICO/ICNS) jsou opravy v `main`; obě PR prošly 8/8. Nový kandidát `0.46.11` musí projít svým přesným 8/8 PR + `main` CI, automaticky vytvořeným neměnným tagem a novým Draftem, **nezávislým znovustažením + SHA-256 auditem všech 8 příloh** a reálnou instalací/upgrade UAT. Teprve poté ruční publikace jako `Preview` a kontrola viditelnosti na webu, v nativním updateru a v CZ/EN changelogu; Stable Latest `v0.46.0` se nesmí změnit. Chrome Web Store je samostatný vydavatelský proces: [#172](https://github.com/martin-pok/agentree/issues/172). P0 audit PWA/OG rasterů, natívních ikon a Vercel avataru: [#213](https://github.com/martin-pok/agentree/issues/213). **0.46.11 není automaticky zveřejněná ani nainstalovaná verze jen proto, že má číslo v kódu.**

**Aktuální release v0.46.10 (13. 10. 2026):** PR [#206](https://github.com/martin-pok/agentree/pull/206) (bezpečný updater) a [#207](https://github.com/martin-pok/agentree/pull/207) (verze + CZ/EN changelog) byly sloučeny. Přesný zdrojový commit `10cefd1bc09256dc307996a0f08380b5533b22e2` prošel [CI 8/8](https://github.com/martin-pok/agentree/actions/runs/38405805432); anotovaný tag `v0.46.10` na tento commit ukazuje. [Release build](https://github.com/martin-pok/agentree/actions/runs/38406755030) vytvořil **neveřejný Draft ID `411720718` s osmi přílohami**, nikoliv veřejnou aktualizaci. [Nezávislý SHA-256 audit skutečných stažených bajtů](https://github.com/martin-pok/agentree/actions/runs/38422293844) prošel: **8/8 GitHub assetů**, **7/7 souborů proti SHA256SUMS.txt**, report `release-draft-audit` artifact ID `11826814020`; spouštění auditu opraveno v [PR #211](https://github.com/martin-pok/agentree/pull/211). Fyzická instalace/upgrade, Google OAuth, Mac/Windows/Chrome UAT, podpis a schválená Preview publikace zůstávají otevřené v [#208](https://github.com/martin-pok/agentree/issues/208). Nejnovější **veřejný** Preview je stále `v0.46.6` a Stable Latest `v0.46.0`. Web včetně faviconu a odkazu na skutečně publikované Preview je v `main` po [PR #210](https://github.com/martin-pok/agentree/pull/210); ikonka projektu nastavená samostatně v dashboardu Vercelu není tímto nasazením ověřena.

**Aktuální release kandidát v0.46.9 (13. 10. 2026) je sestavený jako neveřejný Draft, ale není publikovaný ani nainstalovaný.** Tag na `d6e16eb5946da1cfb33d28b7358a5b5ddee03983`, úspěšné [CI 8/8](https://github.com/martin-pok/agentree/actions/runs/38370312412) a [release build](https://github.com/martin-pok/agentree/actions/runs/38371118618); release ID `411468280`, 8 příloh. Automatický [audit stažených bajtů](https://github.com/martin-pok/agentree/actions/runs/38390677679) prošel 8/8 proti GitHub SHA-256 a 7/7 proti `SHA256SUMS.txt`, artefakt `release-draft-audit` ID `11808737176`. Nejde o reálnou instalaci ani UAT, publikace je blokovaná. Sledování: [issue #194](https://github.com/martin-pok/agentree/issues/194). **Starší stav distribuce:** Kandidát **v0.46.8** je sestavený ze schváleného commitu `dd32fa98879a8c34137c6bde49b50dc205202e93`, jeho CI prošlo **8/8 kontrol** a GitHub vytvořil **neveřejný draft release ID `410973749` s osmi přílohami** (Mac DMG/ZIP, Windows, Chrome a checksumy). Všech osm skutečných příloh draftu bylo nezávisle staženo a ověřeno; izolovaný Mac ZIP na Apple Silicon Macu prošel 11/11 nativních smoke kontrol. **Vydání není veřejné, běžná instalace/upgrade ani Google OAuth nejsou odzkoušené**; rozsah testu je v [RELEASE-READINESS.md](RELEASE-READINESS.md) a zbývající UAT v [issue #187](https://github.com/martin-pok/agentree/issues/187). Poslední potvrzené veřejné Preview je [v0.46.6](https://github.com/martin-pok/agentree/releases/tag/v0.46.6), stabilní `Latest` je `v0.46.0`. Starší draft `v0.46.7` zůstává neveřejný a oddělený. Důležitý distribuční problém mezi ikonami původního Chrome Store kitu a GitHub release ZIPu byl opraven v [PR #190](https://github.com/martin-pok/agentree/pull/190) a oba nové buildy byly bajtově porovnány; **tato oprava nezměnila existující release tag ani skutečný veřejný Chrome Store**.

**Aktuální realizační sprint:** [směr 0.46.8 — spolehlivost, kvalita tří produktů, distribuce a marketing](SPRINT-0468.md). Obsahuje P0/P1 podle rizika, konkrétní akceptační kritéria, souběžnou marketingovou přípravu a jasně odděluje úkoly bez placených služeb od podpisu/notarizace nebo placené infrastruktury. Po vytvoření draftu 0.46.7 nepřepisovat starý tag novými opravami: následné změny patří do dalšího kandidáta.

Roadmapa rozlišuje čtyři stavy: **hotovo v kódu**, **ověřeno v CI**, **ověřeno na skutečném zařízení** a **zveřejněno**. Splnění jedné podmínky neznamená splnění ostatních. Závazný postup pro novou verzi je v [RELEASE-READINESS.md](RELEASE-READINESS.md).

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

## Právě teď — 0.46.11 Preview, jediný aktuální release kandidát a UAT

| Priorita | Výsledek | Aktuální stav (13. 10. 2026) | Hotovo, až když… |
|---|---|---|---|
| P0 | **0.46.11 Preview — doručit nové ikony i klientům** | Zdrojové úpravy macOS/Windows/Chrome/web a odebrání historických ikon jsou sloučené (PR #212, #214, obě 8/8). Aktuální verze se připravuje s CZ/EN changelogem. **Dosud bez vlastního ověřeného tagu, nových binárek a zařízení UAT.** | Nové PR/main 8/8 CI, automaticky sestavený nový tag+Draft, audit 8/8 SHA-256, reálná macOS/Windows/Chrome kontrola ikon a instalace, schválená veřejná Preview publikace + zkouška skutečných download odkazů. |
| P0 | 0.46.10 Preview — bezpečnější updater a audit | PR #206 a #207 sloučena; přesné `main` CI 8/8; tag `v0.46.10` na `10cefd1b`, Draft `411720718` s 8 přílohami. **Nezávislý SHA-256 re-download audit 8/8 a 7/7 hotový** v runu 38422293844; **reálné UAT nezjištěné**; audit spouští PR #211, [#208](https://github.com/martin-pok/agentree/issues/208). | Audit z GitHubu 8/8 a 7/7 doložen; zbývá skutečné Mac/Chrome/Windows UAT a schválení publikace pouze Preview. |
| P0 | 0.46.9 Preview — dokončit release UAT | Tag a 8/8 CI, sestavený Draft s 8 přílohami i nezávislý SHA-256 audit hotové; **skutečná instalace na Macu, OAuth, aktualizace, Chrome/Windows a publikace stále otevřené**; [issue #194](https://github.com/martin-pok/agentree/issues/194). | Doložené reálné zařízení UAT, rozhodnutí vlastníka a teprve potom schválená ruční publikace v Preview. |
| P0 | Bezpečný release 0.46.8 Preview | Tag `dd32fa98`; 8/8 CI; neveřejný draft `410973749`; skutečné přílohy 8/8 ověřené; izolovaný Mac start 11/11. Instalace/upgrade a Chrome UAT otevřené. | Skutečné Mac/Chrome UAT a výslovně schválená publikace pouze jako Preview; [issue #187](https://github.com/martin-pok/agentree/issues/187) |
| P0 | Oddělené kanály Stable / Preview | Stable Latest je `v0.46.0`, veřejný Preview je `v0.46.6`; bezpečnost publikování sloučena v PR #156 | Preview ponechá `Latest` beze změny, Stable vyžaduje samostatnou volbu i potvrzení a je pokryto testy |
| P0 | Google OAuth a profilová fotka | Zabezpečení stahování fotky sloučeno v PR #155, nativní Google přihlášení a avatar na Macu **neověřeny** | Úspěšné i odmítnuté přihlášení, logout, offline návrat, foto, přesměrování a upgrade doložené na reálném Macu |
| P0 | Vizuální identita v distribuované aplikaci | PR #212 a #214 odstranily historické PNG/ICO/ICNS ze zdrojového Gitu, zavedly ochranu Windows ZIPu a sjednotily 404 favicon; každá PR prošla 8/8. Zbývá vizuální pixelová shoda PWA/OG/Store náhledů, reálný Dock/Windows Explorer a Vercel project avatar [#213](https://github.com/martin-pok/agentree/issues/213). | Ověřená finální instalace a všechny distribuované rastrové velikosti proti masteru, screenshoty skutečného UI a reálný Chrome Store upload. |
| P0 | Živý stav a návrat do konverzace | Opravy pro agent decisions a Terminál vyšly v `0.46.6 Preview`; reálný Terminál, iTerm a Warp UAT zbývá | Při běžící session se nevytvoří kopie, agent čeká skutečně tam, kam akce vede, odvozený stav je přiznaný |
| P1 | Web výkon a kvalita napříč zařízeními | V kódu jsou automatizované responzivní a výkonové kontroly; produkční PSI ani Safari+iPhone UAT nejsou doložené | Produkční crawl, Lighthouse/PSI, Safari iPhone/iPad, 320–3840 px, reduced motion a Core Web Vitals s pravdivým výsledkem |
| P1 | Chrome Store a konektory | Rozšíření je veřejné, ale finální upload aktuálního ZIP a živé DOM testy podporovaných webů zbývají | Přesná verze v obchodě, screenshoty skutečného UI, každý konektor odzkoušený na živé službě |
| P1 | AI Pomocník a copy CZ/EN | Implementovaná diagnostika z lokálního stavu; neověřené případy a obsahový audit zbývají | Sada testů CZ/EN, chybové stavy, navazující dotazy, přesná navigace a audit textů |
| P2 | Komerční připravenost | Developer ID/notarizace, DPA a platby nejsou uzavřené | Zákonné dokumenty, podepsané instalátory, reálné Windows QA a ověřený nákup/licence |

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
