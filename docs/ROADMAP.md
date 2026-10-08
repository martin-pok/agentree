# Roadmapa

Každá položka má akceptační kritéria. Pořadí je doporučené – nejdřív ověřit hodnotu, potom škálovat.
Stav je prověřený proti kódu (naposledy 7. 10. 2026, po vydání 0.38.1). Hotové položky zůstávají
přeškrtnuté s odkazem, kde to je, aby bylo vidět, co se rozhodlo jinak, než stálo v plánu.

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

## Známé problémy (backlog)

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
