# Bezpečnost a soukromí

Agentree čte velmi citlivá data: přepisy práce s AI (kód, klientské informace, prompty). Bezpečnost je proto součást produktu, ne doplněk.

## Model hrozeb

| Hrozba | Opatření | Kde |
|---|---|---|
| Přístup z jiného počítače v síti | Server poslouchá jen na `127.0.0.1` | `bin/agentree.mjs`, `src/config.js` |
| Škodlivý web čte data přes DNS rebinding | Odmítnutí požadavků s jiným `Host` než `127.0.0.1`/`localhost` | `src/http.js#handle` |
| Škodlivý web mění data (CSRF) | Mutace vyžadují `X-Agentree: 1` (vynutí CORS preflight, který server nepovolí) + kontrola `Origin` | `src/http.js#guardMutation` |
| Podvržené události hooků / rozšíření | Náhodný 48znakový token, porovnání v konstantním čase | `src/http.js#tokenOk`, `src/datastore.js` |
| Web získá token přes párování | `/api/extension/pair` jen pro `Origin: chrome-extension://[a-p]{32}` (prohlížeč `Origin` nedovolí podvrhnout) | `src/http.js` |
| XSS z obsahu přepisů | Veškerý dynamický text přes `esc()`; markdown až po escapování; odkazy jen `http(s)` s `rel="noopener noreferrer"`; CSP `script-src 'self'` | `public/js/format.js`, `views/session.js`, `src/http.js#SECURITY` |
| Clickjacking | `X-Frame-Options: DENY`, `frame-ancestors 'none'` | `src/http.js` |
| Path traversal na statických souborech | Normalizace cesty a kontrola prefixu `public/` | `src/http.js#serveStatic` |
| Injekce do notifikace macOS | Text předán jako `argv` do `osascript`, ne do skriptu | `src/notify.js` |
| Spuštění cizího příkazu přes „Otevřít“ | Klient posílá jen cíl (`app`/`terminal`/`folder`); plán sestaví server ze session dat. ID musí odpovídat `[\w.-]`, cesta prochází `shellQuote`, příkaz jde do `osascript` jako argv; URL jen `https://` a `codex://threads/<uuid>`; mutace chráněná proti CSRF | `src/openers.js`, `src/http.js` |
| Rozbití konfigurace Claude Code | Zápis jen na výslovnou akci, záloha, validace JSON, idempotence, odinstalace odebere jen vlastní hooky; hook má timeout a `|| true` | `src/hooks-installer.js` |
| Únik API klíčů | Uložení do Klíčenky macOS, prohlížeči se klíč nikdy nevrací; proměnné prostředí mají přednost | `src/secrets.js` |
| Spuštění cizího příkazu přes „Spustit agenta“ (nejcitlivější místo) | Klient posílá jen `agent`, `mode`, zadání a cestu; příkaz sestaví server z pevné šablony a cesty k binárce zjištěné na serveru. Zadání **nikdy není součástí příkazu**: na pozadí jde jako samostatný prvek argv za `--` (spawn bez shellu), v Terminálu se čte ze souboru 0600 přes `"$(cat '<soubor>')"`. Složka musí být absolutní existující adresář bez řídicích znaků a prochází `shellQuote`. Oprávnění Claude Code jen `plan`/`acceptEdits`, sandbox Codexu jen `read-only`/`workspace-write` (nikdy `bypassPermissions` ani `danger-full-access`). Mutace chráněná proti CSRF | `src/launcher.js`, `src/app.js#launch`, `test/launcher.test.mjs` |
| Procházení disku přes prohlížeč složek | Jen názvy podsložek (ne soubory) v domovském adresáři, bez skrytých a bez symlinků; v kořeni domova se nenahlíží do podsložek (macOS by žádal o přístup k Dokumentům/Ploše); GET bez CORS nejde přečíst z cizího webu | `src/app.js#listFolders` |
| Podvržená licence | Ed25519 podpis nad celými daty klíče, veřejný klíč v kódu, soukromý mimo repozitář a mimo balíček (`npm run smoke` hlídá); klientovi se vrací jen maskovaný klíč | `src/license.js`, `scripts/license.mjs` |
| Vzorce v exportu CSV (CSV injection) | Buňky začínající `= + - @` dostanou prefix `'` | `src/projects.js#projectCsv` |
| Zablokování serveru velkým požadavkem | Limit těla 1 MB, validace a ořez polí z rozšíření | `src/http.js#readBody`, `connectors/web.js` |

## Známá rizika (přijatá pro v0.2.0)

- **Klíč v argv při ukládání do Klíčenky.** `security add-generic-password -w <klíč>` je na zlomek sekundy vidět ve výpisu procesů stejného uživatele. Řešení v roadmapě: nativní Keychain API v desktopové aplikaci.
- **Data v `~/.agentree/data.json` nejsou šifrovaná** (práva 0600). Obsahují výdaje, upozornění a token, ne přepisy.
- **Agent spuštěný z Agentree má stejná práva jako uživatel.** Na pozadí výchozí režim jen čte/plánuje; „Smí upravovat soubory“ je volba uživatele. Zadání pro Terminál leží až 24 h v `~/.agentree/prompts` (0600) a výstup běhů v `~/.agentree/runs` (0600).
- **Offline licence je ochrana proti náhodnému sdílení, ne DRM** (podrobně `docs/LICENSING.md`).
- **Jiné lokální programy** téhož uživatele mohou číst stejné zdroje jako Agentree — to je vlastnost macOS, ne Agentree.
- **Rozšíření čte obsah stránek AI aplikací** v prohlížeči uživatele a posílá ho jen na `127.0.0.1`. Před veřejnou distribucí je nutné ověřit podmínky jednotlivých služeb a Chrome Web Store policy.

## Soukromí

- Žádná telemetrie, žádná analytika, žádná síťová komunikace kromě: Google Fonts (dashboard), Admin API (jen s klíčem uživatele), Ollama na `127.0.0.1`.
- Obsah přepisů se nikam neukládá (jen v paměti, max. 400 položek na session); logy serveru neobsahují obsah zpráv.
- Před případnou cloudovou verzí: end-to-end šifrování, opt-in po zdrojích, zásady zpracování údajů (GDPR), smlouvy se zpracovateli.

## Hlášení problému

Bezpečnostní problém nahlas vlastníkovi repozitáře soukromě (ne veřejnou issue).
