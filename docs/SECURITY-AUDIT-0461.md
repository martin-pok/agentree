# Bezpečnostní audit — Agenteeq 0.46.1 / více účtů

**Datum:** 2026-10-11. **Stav:** průběžný review zdrojového kódu + nové regresní scénáře, **nikoliv** externí nezávislý penetrační test ani certifikace. Všechny výsledky vztahovat na přesný commit a CI run.

## Scope & threat model

Aktiva: přepisy soukromých konverzací, lokální zdrojový kód, přihlašovací tokeny Claude/Codex, lokální licence Agenteeq, metadata projektů, citlivé účty a kvóty. Útočníci: web ze škodlivé domény (DNS rebinding/CSRF), neoprávněný klient lokální sítě, kompromitovaný spárovaný telefon, škodlivé Chrome rozšíření, upravený přepis agenta (prompt injection), kompromitovaná aktualizace/binární balík, lokální malware a útočník schopný nahradit konfigurační soubor nebo symlink.

Cesty: Node HTTP/SSE, Chrome extension ingestion/pairing, Claude hooky, lokální process scan, filesystem connectors, mobilní LAN/Tailscale, OAuth redirect, auto-update a podpis balíků, licence offline a synchronizace účtů.

## Pozorování a provedená opatření

| Priorita | Oblast | Zjištění | Důkaz / opatření | Stav |
|---|---|---|---|---|
| P0 | Neznámá identita Claude | Dříve se účet bez ověřeného UUID mohl dostat do seznamu aktivních předplatných a nesprávně vykázat plán | `src/app.js` filtruje neidentifikovatelné účty; `test/subscriptions.test.mjs` přidán negativní test | Opraveno v kódu; CI/UAT ověřit |
| P0 | Přiřazení session→licence | Neexistuje obecně dokázané přiřazení každého běhu k účtu, zvlášť při více `CLAUDE_CONFIG_DIR` a `CODEX_HOME` | `docs/MULTI-ACCOUNT.md` | Otevřeno; nepoužívat jako bezpečný údaj |
| P0 | Vzdálené spouštění | `remoteScope` explicitně nepovoluje hostitelské mutace ze spárovaného telefonu | `test/security-adversarial.test.mjs` | Strukturálně chráněno, integrační bypass/fuzz neověřeno |
| P0 | Přepisy na telefonu | Vzdálené API blokuje přímý transcript a log, SSE má oddělené typy událostí | `src/remote-scope.js`, `src/http.js`, nové regresní testy | Ověřit nested pole a nové event typy napříč všemi cestami |
| P0 | Distribuce a aktualizace | Bez prověření podpisu/notarizace, supply chain, artifact hash a skutečného upgradu nelze tvrdit, že distribuovaná aplikace je bezpečná | `docs/RELEASE-READINESS.md` | Otevřeno, release gate |
| P1 | API / CSRF / DNS rebinding | Kód kontroluje Host, Origin, vlastní mutační hlavičky a tokeny; nutná skutečná útočná matice metod, různých Host, IPv6, WebSocket/SSE, redirects a reverse proxy | `src/http.js`, `src/lan.js` | Statický review, dynamický fuzz neproveden |
| P1 | Souběh tokenů a účtů | Stale OAuth soubor se nesmí vydávat za přihlášení; citlivé tokeny se nesmí objevovat v UI ani logu | `src/app.js`, `src/provider-accounts.js` a testy | Dílčí ochrana; race testy a TOCTOU pro symlinky otevřené |
| P1 | Provider limity | Neplatná procenta se odmítají, neznámý účet se nepřiřadí; jednotlivé limity různých účtů nelze směšovat | `normalizeCodexAccount` a `test/security-adversarial.test.mjs` | Dílčí ochrana; sjednocení session limitů není hotové |
| P1 | Prompt injection | Texty od agentů, repozitářů a webových zdrojů jsou nedůvěryhodné; hrozí záměna obsahu za instrukce a exfiltrace při použití Pomocníka | Nutný red-team fixture set | Neotestováno |
| P1 | Token storage a revokace | Spárované zařízení má token hashovaně, cookie HttpOnly/SameSite; nutné ověřit revokaci při souběhu a replay | `src/lan.js` | Statický review; adversariální end-to-end neproveden |
| P1 | DoS | 20 agentů a mnoho SSE klientů může vyčerpat CPU, paměť, file descriptors a fronty | `test/twenty-agents-stress.test.mjs` | Syntetický test identity, ne benchmark škálování |
| P2 | Závislosti / secrets | Audit zranitelností npm deps, detekce secretů, SAST a SBOM s uloženým důkazem runu | Doporučené CI brány | Neověřeno v tomto auditu |

## Red-team plán před tvrzením „bezpečná aplikace“

1. **API authz matice:** každá route × metoda × localhost, nespárované LAN zařízení, spárovaný telefon, cizí Origin, nesprávný Host, žádný/expirující token; ověřovat těla odpovědí, nejen status.
2. **Escalace privilegií:** porovnat read-only telefon, extension ingest token, Claude hook token a lokální web UI; zaměnit tokeny a simulovat krádež každého z nich.
3. **RCE a souborový přístup:** fuzz prompt/cwd/path/URL všech endpointů, traversal s percent-encoding, null bytes, symlinky, shell metacharacters, argument confusion a TOCTOU.
4. **SSE/DoS:** 1/20/100 agentů, 1/50/200 klientů, bursty 1000 událostí, odpojení/reconnect, restart, latence p50/p95/p99, paměť a počet otevřených descriptorů.
5. **Více účtů:** 2× Claude, 3× Codex, přepínání loginu při běžících agentech, exspirace a revokace, neznámé identity, konflikty profilů, falešné limity a ochrana metadata.
6. **Prompt injection:** nedůvěryhodný přepis, README, výstup toolu a instrukce ve webových datech nesmí změnit bezpečnostní politiku ani spustit nevyžádané akce.
7. **Supply chain:** `npm audit`, lockfile integrity, secret scan, SAST, analýza GitHub Actions permissions, pinning akcí, podepisování a ověření digestů/stahovaných binárek, macOS notarization, Windows podpis.
8. **Privacy:** kontrola exportu, telemetrie, logů, cloud sync a mobilních payloadů na tokeny, cesty, celé přepisy a osobní data.
9. **UAT:** Apple Silicon a Windows beta skutečné instalace, Chrome Store publikovaný balík a kontrola nejnovějších externích providerů.

**Marketing rule:** bez doložené kontroly všech relevantních P0/P1, ověřené distribuce a externího testu netvrdit „penetračně otestováno“, „auditováno“, „nezranitelné“ ani „certifikováno“. Je možné věcně popisovat konkrétní testovaná opatření a jejich rozsah.
