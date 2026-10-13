# Agenteeq — další kvalitativní sprint (směr 0.46.8)

**Výchozí fakta z GitHubu, 12. 10. 2026.** Zdrojový stav po PR #159 a #160 je v `main`; PR #161 odstranil použitý jednorázový release spouštěč. Tag `v0.46.7` je záměrně neměnný, vytvořený z `00daf73b`; GitHub má neveřejný draft s 8 přílohami. Veřejné Preview je `v0.46.6`, stabilní Latest `v0.46.0`. **Živé UAT na uživatelském Macu není doložené.** Dokončení CI není dokončení fyzické instalace. Zpřesnění stavu vždy ověř v GitHub API, ne jen v tomto dokumentu.

## Vývojový cíl

Agenteeq poskytuje spolehlivý, local-first přehled AI práce napříč nativním macOS nástrojem, Chrome extension a veřejným webem. Každý údaj musí být buď potvrzený zdrojem, nebo transparentně označený. **Roboti jsou součástí brandu, nikoli překážkou při práci:** na webu hravější, v desktopu pouze subtilní kontextový doplněk a v extension kompaktní status. Nepřidávat nové ilustrace místo skutečných screenshotů ani vytvářet samostatně deformované malé varianty Dock loga. Dodržovat `docs/DESIGN.md`.

## P0 — uzavřít funkční a bezpečnostní rizika

| Pořadí | Problém / zdroj pravdy | Výsledek a ověřitelná definice hotovo | Co nepotřebuje placené služby |
|---|---|---|---|
| 1 | UpdateService: závod při Preview → Stable → Preview; PR #160 | Opožděné odpovědi a chyby nepřepíšou novější stav; změna SHA/velikosti zneplatní starý stažený ZIP, 8/8 CI na `main` | Automatizované regresní testy |
| 2 | `install.sh`: nejnovější Stable je nižší než nainstalovaná Preview; PR #162 | Bez tichého downgrade; před stažením zastavit při `0.46.6 > 0.46.0` i při nečitelném čísle verze; otestovat SemVer na Linuxu a nativní nahrazení na Mac CI | macOS GitHub runner + testovací bundle, ne produkční Mac |
| 3 | Chrome popup může po odpojení aplikace dál svítit zeleně; PR #163 | Každé viditelné obnovení ověří `/api/health`; stará čísla a diagnostika se neprezentují jako živá; po restartu se spojení samo obnoví; test CZ/EN, dark/light | Chrome CI, HTTP stuby, bez účtu |
| 4 | Spolehlivost releasu: PR #159 a jednorázový spouštěč #161 | Všechny draft soubory před publikací znovu ověřit proti `SHA256SUMS.txt` a GitHub API; žádný souběžný zbytečný workflow listener; výsledky CI a tag SHA zaznamenat | GitHub API / CI |
| 5 | Živý stav agentů, 20 současně běžících, odvozené versus skutečné stavy | Syntetická zátěž v `test/twenty-agents-stress.test.mjs`, SSE po výpadku, žádné dvojí započtení a pravdivý stav; chybějící fyzické pozorování explicitně `neověřeno` | Testy s fixturami; skutečné procesy až při UAT |

**Bezpečnostní hranice:** lokální přepisy/klíče nikdy nesdílet s cloudem; neinstalovat hooky bez schválení; bez nových runtime dependencies; bez placených API volání a bez nesouhlasených cloudových nákladů.

## P1 — funkční prémiový zážitek ve třech produktech

| Produkt | Provedení | Akceptace |
|---|---|---|
| **macOS app** | Stav `pracuje/čeká/neznámé/offline` číst z faktů, ne odhadovaných počtů; přepnutí do původní konverzace nesmí vytvořit druhý proces. Minimalistické role maskota dle `docs/DESIGN.md` | UAT pro Claude Code, Codex, Terminál/iTerm/Warp; žádný duplicitní běh; přehled a oznámení jsou konzistentní |
| **Chrome extension** | Přesně sdělit stav spojení a posledního úspěšného hlášení; parování a zotavení při restartu služby bez opakované instalace; užitečná diagnostika podporovaných adaptérů | Scénáře online/offline/párování, 5s poll bez závodů; z kontrolní sady nesmí vznikat falešná čísla |
| **Web** | Premium landing page ponechat vizuálně konzistentní, optimalizovat rychlost, SEO a přístupnost; CTA musí odpovídat existujícímu zveřejněnému releasu | 320–3840 px bez overflow, `qa:site`+`qa:contrast` zelené, korektní canonical/hreflang, produkční PSI doložené reálným měřením, žádná smyšlená „100“ |
| **Brand** | Jeden schválený Dock master pro macOS, web a extension; screenshoty do obchodu pouze ze skutečného UI. Na webu může být robot výraznější, v aplikaci nepřekrývat obsah | Shoda proporcí PNG/ICNS/ICO a SVG; reduced motion, správné kontrasty, žádná fialová anténa ani stará značka |

## P1 — paralelní distribuce a marketing (nečekat na dokončení všech funkcí)

- **Distribuce:** odlišovat build, draft, Preview publikaci a Stable Latest. Publikace `v0.46.7` vyžaduje schválené UAT z [issue #157](https://github.com/martin-pok/agentree/issues/157), nezávislé ověření osmice příloh a explicitní `channel=preview`. Do již vytvořeného `v0.46.7` tagu nepatří nové opravy po freeze; ty vydat až dalším kandidátem.
- **Chrome Store:** audit nahrané verze, screenshoty skutečné aktuální extension, platný popis, CZ/EN, QA párování a odkazu do app. Nahrání přes účet vydavatele je oddělené od GitHub buildu; neoznačovat jej za hotové bez důkazu.
- **Produktová komunikace:** připravit reálné ukázky „jedno místo pro běžící agenty“, „čeká na moje rozhodnutí“, „otevřu původní konverzaci“, rozdíl mezi lokální app a extension, transparentní označení Beta/neznámé. Neslibovat ověřené uživatelské přínosy, které nemají měření.
- **Release evidence:** zdrojově kontrolovaný manifest verze/assetů/checksumů, vizuální QA z reálně renderovaného produktu a checklist go/no-go. Žádné nerealistické marketingové screenshoty vydávané za produkt.


### Ověřitelná sada pro Chrome Store — připravovaný krok

Technické artefakty z různých CI jobů se nesmějí ručně kombinovat bez důkazu
shodné verze. Nová izolovaná práce `ci/chrome-store-review-kit-0468` proto
generuje jeden hashovaný souborový kit z reálně sestaveného rozšíření a
vyrenderovaných podkladů, dostupný jen pro běh na `main`. Pro doručení
uživateli stále zbývá ověřené 8/8 CI na hlavním SHA, skutečný Chrome a
macOS/Windows UAT, schválení uploadu a následné ověření verze v obchodě.
Nezapínat automatické vydávání bez výslovného schválení vlastníka.

## Nezavádět placené závislosti

Developer ID + notarizace, případný Apple Developer membership, Stripe a další platební API, právní review a placený monitoring patří do samostatných rozhodnutí vlastníka. **Zatím neaktivovat, nenakupovat, nic nefakturovat.** Vývoj CI, local-first funkce, brand, automatizované testy a bezplatné nasazení nepodmiňovat těmito účty. Při chybějícím přístupu vytvořit konkrétní blokující issue se skutečným důvodem; náhradní výsledek netvrdit za hotový.

## Operativní kapacitní ochrany

1. Držet malá samostatná PR podle typu změny: produktová oprava, QA, design, marketing. Současný každodenní vývoj nesmí blokovat jedna velká nenasaditelná branch.
2. Každé PR: doložit kořenový problém, test důležité chyby, jednu změnu chování, 8/8 CI přesného SHA, merge a ověření `main` CI. Dlouhé Playwright joby **nepřeskakovat**.
3. Pokud se objeví P0 regres, zastavit propagaci vydání, nikoli automaticky celý jiný vývoj; opravovat na izolované větvi. Otevřené drafty neměnit potichu.
4. Milník `0.46.8` znamená **nového kandidáta**, nikoliv automatickou veřejnou publikaci. Bump verze i tag vznikají až po dokončení QA a výběru obsahu.
5. Po každém merge aktualizovat tuto roadmapu / changelog a přesné odkazy na CI. Kritické externí UAT požadavky držet v issue s jasným vlastníkem a důkazem výsledku.

## Předpoklady a blokery, které nesmíme vydávat za vyřešené

- Mac UAT instalace, Developer ID/notarizace, Google OAuth/profile foto, Dock ikona v reálném zařízení a návrat do iTerm/Warp: **nezjištěno v reálném prostředí**, evidence [#157](https://github.com/martin-pok/agentree/issues/157).
- Chrome Web Store upload aktuálního ZIP, živé DOM adaptery, iPhone/Safari, Windows beta a skutečné PageSpeed výsledky: **nutné samostatné ověření**; žádná nahraná Store verze se automaticky neodvodí z repozitáře.
- Produkční soukromí, EULA/DPA/DPH a platební infrastruktura: obchodní/compliance práce vyžaduje rozhodnutí; vývoj bez jejich placení může pokračovat.
