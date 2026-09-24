# Roadmapa

Každá položka má akceptační kritéria. Pořadí je doporučené – nejdřív ověřit hodnotu, potom škálovat.
Stav je prověřený proti kódu (naposledy 24. 9. 2026, po vydání 0.25.0). Hotové položky zůstávají
přeškrtnuté s odkazem, kde to je, aby bylo vidět, co se rozhodlo jinak, než stálo v plánu.

## Teď – po 0.25.0

Pořadí podle toho, co brzdí ostrý provoz. U položek „vlastník“ je potřeba účet nebo rozhodnutí,
které kód za nikoho neudělá.

| # | Úkol | Kdo | Akceptační kritéria |
|---|---|---|---|
| 1 | Přihlášení přes Google naostro | vlastník | OAuth klient v Google Cloud, poskytovatel Google zapnutý v Supabase, adresy návratu podle [ACCOUNTS.md](ACCOUNTS.md); přihlášení na Macu i na webu projde a zapíše se do protokolu v `docs/TESTING.md` |
| 2 | Zásady ochrany údajů a DPA se Supabase | vlastník | Právně zkontrolované zásady (co odchází: jen souhrny, viz [ACCOUNTS.md](ACCOUNTS.md) a [DATA-CONTRACT.md](DATA-CONTRACT.md)), odkaz v Nastavení → Účet a na webu; DPA podepsané před prvním cizím uživatelem |
| 3 | Podpis a notarizace aplikace pro Mac | vlastník | Developer ID a notarizační profil v tajemstvích GitHubu (`AGENTEEQ_SIGN_IDENTITY`, `AGENTEEQ_NOTARY_PROFILE`); popis vydání pak sám přestane radit `xattr` |
| 4 | Ověřit webové konektory na živých stránkách | vlastník + vývoj | Pro každý z 8 webů: diagnostika v okně rozšíření projde a vzorek stránky je v `test/fixtures/web/` s testem adaptéru; teprve pak ✅ v [CONNECTORS.md](CONNECTORS.md) |
| 5 | Ruční QA účtu a napojení modelů na Macu | vlastník | `claude auth login` / `codex login` tlačítkem, návrat do aplikace, potvrzení; zápis do protokolu |
| 6 | Rozšíření v Chrome Web Store | vlastník | Veřejná instalace jedním klikem; popis v obchodě odpovídá tomu, co rozšíření posílá (jen stav a počty) |

## v0.6 – z bety k prvnímu prodeji (navazuje na 0.5.0)

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | Živé ověření spuštění agentů | Claude Code a Codex v Terminálu i na pozadí spuštěny z UI na reálném projektu; session se zařadí do projektu; zápis do protokolu v `docs/TESTING.md` |
| 2 | Rozhodnout placené funkce | `PAID_FEATURES` nastavené podle rozhovorů s 10 uživateli; texty v Nastavení a na webu odpovídají |
| 3 | Platby a vydání klíče | Stripe Checkout → webhook → `scripts/license.mjs issue` → e-mail zákazníkovi do 1 min |
| 4 | EULA a zásady ochrany údajů | Právně zkontrolováno, odkaz v Nastavení → Licence (zásady viz „Teď“ #2) |
| 5 | Projekty: štítky a šablony briefu | Filtrování podle štítku; nový projekt ze šablony (agentura, vývoj, marketing) |
| 6 | Projekty: náklady v Kč | Tokeny projektu přepočtené odhadem ceny API s viditelným označením „odhad“ |

## v0.3 – spolehlivá beta pro každodenní používání

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | **Ověřit rozšíření na všech 8 webech** | Viz „Teď“ #4. Od 0.25.0 rozšíření posílá jen stav a počty zpráv, takže se ověřuje: rozpoznání služby, ID konverzace z adresy, počty zpráv, přechod pracuje → hotovo a pole pro vložení zadání |
| 2 | Ověřit Cursor, Copilot CLI, VS Code, Gemini CLI na reálných datech | Každý konektor `verified: true` + fixtury z reálných souborů (anonymizované) |
| 4 | Hooky do skutečného `~/.claude/settings.json` | Ruční QA: žádost o povolení → upozornění < 1 s; odinstalace vrátí soubor do původního stavu (zatím ověřeno jen v dočasném HOME) |
| 5 | ~~Upozornění s akcí~~ **hotovo** | Klik na upozornění otevře aplikaci na správné obrazovce (`desktop/Agenteeq.swift`, `userNotificationCenter(_:didReceive:)`) |
| 6 | ~~Ukládání klíčů bez argv~~ **hotovo** | Hodnoty do Klíčenky jdou jen přes stdin (`test/security-hardening.test.mjs`) |
| 7 | Konfigurovatelný port i v rozšíření | Změna portu nevyžaduje úpravu manifestu (dnes pevně `127.0.0.1:4620`) |
| 8 | ~~Linux a Windows cesty~~ **hotovo v 0.12.0** | Cesty řeší `appSupportDir()` v `src/platform.js`, testy s fixturami běží. Zbývá **ověřit je na skutečném Windows** a označit v `docs/CONNECTORS.md` ✅ místo 🧪 – viz [WINDOWS.md](WINDOWS.md) |
| 9 | ~~Plášť aplikace pro Windows~~ **postavený, neověřený** | Vlastní okno nad WebView2, odznak v hlavním panelu, systémová oznámení – hotovo, CI ho překládá a přikládá k vydání. Zbývá **spustit na skutečném Windows a podívat se na to**, pak podepsat build. Viz [WINDOWS.md](WINDOWS.md) |

## v0.4 – nativní aplikace a historie

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | Nativní aplikace s ikonou stavu | **Zčásti hotovo:** aplikace pro Mac (Swift, `desktop/`) spouští server, má ikonu v řádku nabídek a počet čekajících agentů v Docku. Zbývá počet i u ikony v řádku nabídek a podpis s notarizací („Teď“ #3) |
| 2 | Historie > 30 dní | Statistiky za 12 měsíců do 1 s; migrace bez ztráty dat; bez runtime závislostí |
| 3 | Export útraty (CSV) | Export odpovídá tabulce výdajů včetně převodu měn (export projektu do CSV už existuje) |
| 4 | Pravidla upozornění | **Zčásti hotovo:** ztlumení projektu a „jen rozhodnutí“ podle projektu. Zbývá noční ticho a souhrn místo jednotlivých upozornění |

## v1.0 – SaaS (Pro a Team)

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | ~~Účty a přihlášení~~ **hotovo v 0.25.0, jinak než v plánu** | Přihlášení přes Google (PKCE) místo magic linku, Supabase v EU; lokální verze funguje bez účtu. Viz [ACCOUNTS.md](ACCOUNTS.md). Naostro chybí jen nastavení poskytovatele („Teď“ #1) |
| 2 | ~~E2E šifrovaná synchronizace přepisů~~ **nahrazeno v 0.25.0** | Rozhodnutí vlastníka: přepisy počítač neopouštějí vůbec. Synchronizují se jen souhrnná čísla (tokeny po dnech, útrata, limity, počty agentů), dobrovolně a s RLS; přehled na webu je jen čte |
| 3 | Push upozornění na mobil | Upozornění „potřebuje rozhodnutí“ na telefonu < 3 s. Dnes je telefon jen přehled přes síť (Tailscale / LAN, [REMOTE.md](REMOTE.md)); účet by šel využít pro doručení bez otevřeného portu |
| 4 | Platby (Stripe) | Předplatné Pro/Team, faktury s DPH (CZ/EU), zkušební období |
| 5 | Týmový workspace | Sdílený přehled a rozpočty, role vlastník/člen, bez sdílení obsahu přepisů bez souhlasu |
| 6 | Právní a compliance | Zásady ochrany údajů, DPA, podmínky, kontrola podmínek služeb pro rozšíření |

## Známé problémy (backlog)

Seznam se udržuje proti kódu: co je hotové, odsud mizí (naposledy prověřeno 24. 9. 2026).

- Bez hooků se žádost o povolení nepozná jistě: po 90 s čekání nástroje stav řekne „možná čeká na tvé povolení“, ale zůstává „Pracuje“ (`src/model.js#deriveStatus`).
- Webové služby vykreslují dlouhé konverzace jen zčásti (virtualizované seznamy), takže počet zpráv z rozšíření může být u dlouhé konverzace nižší než skutečný.
- Codex nezapisuje žádosti o schválení – nelze detekovat „potřebuje rozhodnutí“.
- Časová osa ukazuje max. 7 agentů; od 0.18.2 pod ní stojí, kolik jich zbývá, s odkazem na Agenty.
- GitHub Actions hlásí zastaralý Node 20 u `actions/checkout@v4` a `actions/setup-node@v4` (zatím jen varování).
