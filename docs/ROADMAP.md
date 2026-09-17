# Roadmapa

Každá položka má akceptační kritéria. Pořadí je doporučené – nejdřív ověřit hodnotu, potom škálovat.

## v0.6 – z bety k prvnímu prodeji (navazuje na 0.5.0)

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | Živé ověření spuštění agentů | Claude Code a Codex v Terminálu i na pozadí spuštěny z UI na reálném projektu; session se zařadí do projektu; zápis do protokolu v `docs/TESTING.md` |
| 2 | Rozhodnout placené funkce | `PAID_FEATURES` nastavené podle rozhovorů s 10 uživateli; texty v Nastavení a na webu odpovídají |
| 3 | Platby a vydání klíče | Stripe Checkout → webhook → `scripts/license.mjs issue` → e-mail zákazníkovi do 1 min |
| 4 | EULA a zásady ochrany údajů | Právně zkontrolováno, odkaz v Nastavení → Licence |
| 5 | Projekty: štítky a šablony briefu | Filtrování podle štítku; nový projekt ze šablony (agentura, vývoj, marketing) |
| 6 | Projekty: náklady v Kč | Tokeny projektu přepočtené odhadem ceny API s viditelným označením „odhad“ |

## v0.3 – spolehlivá beta pro každodenní používání

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | **Ověřit rozšíření na všech 8 webech** | Checklist v `docs/TESTING.md` projde pro každý web; fixtury DOM uložené v `test/fixtures/web/`; testy adaptérů přes minimální DOM (bez závislostí) |
| 2 | Ověřit Cursor, Copilot CLI, VS Code, Gemini CLI na reálných datech | Každý konektor `verified: true` + fixtury z reálných souborů (anonymizované) |
| 4 | Hooky do skutečného `~/.claude/settings.json` | Ruční QA: žádost o povolení → upozornění < 1 s; odinstalace vrátí soubor do původního stavu |
| 5 | Upozornění s akcí | Klik na notifikaci macOS otevře detail agenta (nativní helper nebo `terminal-notifier`-like řešení bez závislosti) |
| 6 | Ukládání klíčů bez argv | Klíč se nikdy neobjeví ve výpisu procesů |
| 7 | Konfigurovatelný port i v rozšíření | Změna portu nevyžaduje úpravu manifestu |
| 8 | ~~Linux a Windows cesty~~ **hotovo v 0.12.0** | Cesty řeší `appSupportDir()` v `src/platform.js`, testy s fixturami běží. Zbývá **ověřit je na skutečném Windows** a označit v `docs/CONNECTORS.md` ✅ místo 🧪 – viz [WINDOWS.md](WINDOWS.md) |
| 9 | ~~Plášť aplikace pro Windows~~ **postavený, neověřený** | Vlastní okno nad WebView2, odznak v hlavním panelu, systémová oznámení – hotovo, CI ho překládá. Zbývá **spustit na skutečném Windows a podívat se na to**, pak podepsat build. Viz [WINDOWS.md](WINDOWS.md) |

## v0.4 – nativní aplikace a historie

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | Menubar aplikace (Tauri nebo Swift) s ikonou stavu | Ikona ukazuje počet čekajících agentů; server se spouští s aplikací; podepsaná a notarizovaná |
| 2 | Historie > 30 dní v SQLite | Statistiky za 12 měsíců do 1 s; migrace bez ztráty dat |
| 3 | Export útraty (CSV) | Export odpovídá tabulce výdajů včetně převodu měn |
| 4 | Pravidla upozornění | Uživatel nastaví ticho (noc), prioritu podle projektu, souhrn místo jednotlivých notifikací |

## v1.0 – SaaS (Pro a Team)

| # | Úkol | Akceptační kritéria |
|---|---|---|
| 1 | Účty a přihlášení | Přihlášení bez hesla (magic link / passkey); lokální verze funguje bez účtu |
| 2 | E2E šifrovaná synchronizace více počítačů | Server nevidí obsah přepisů; klíče jen v zařízeních; audit |
| 3 | Push notifikace na mobil (PWA / nativní) | Upozornění „potřebuje rozhodnutí“ na telefonu < 3 s |
| 4 | Platby (Stripe) | Předplatné Pro/Team, faktury s DPH (CZ/EU), zkušební období |
| 5 | Týmový workspace | Sdílený přehled a rozpočty, role vlastník/člen, bez sdílení obsahu přepisů bez souhlasu |
| 6 | Právní a compliance | Zásady ochrany údajů, DPA, podmínky, kontrola podmínek služeb pro rozšíření |

## Známé problémy (backlog)

- Dlouho běžící nástroj bez hooků vypadá jako „pracuje“ až 10 minut, i když čeká na povolení.
- Webové adaptéry posílají jen vykreslené zprávy (virtualizované seznamy).
- Codex nezapisuje žádosti o schválení – nelze detekovat „potřebuje rozhodnutí“.
- Kurzy měn jsou ruční (výchozí hodnoty orientační).
- Časová osa ukazuje max. 7 agentů.
