# Bezpečnost a soukromí

Agentree čte velmi citlivá data: přepisy práce s AI (kód, klientské informace, prompty). Bezpečnost je proto součást produktu, ne doplněk.

## Model hrozeb

| Hrozba | Opatření | Kde |
|---|---|---|
| Přístup z jiného počítače v síti | Server poslouchá jen na `127.0.0.1` | `bin/agentree.mjs`, `src/config.js` |
| Škodlivý web čte data přes DNS rebinding | Odmítnutí požadavků s jiným `Host` než `127.0.0.1`/`localhost` | `src/http.js#handle` |
| Škodlivý web mění data (CSRF) | Mutace vyžadují `X-Agentree: 1` (vynutí CORS preflight, který server nepovolí) + kontrola `Origin` | `src/http.js#guardMutation` |
| Podvržené události hooků / rozšíření | Hooky používají vlastní náhodný token; každá instalace rozšíření dostává jiný token vázaný na svůj Chrome origin, vše se porovnává v konstantním čase | `src/http.js#tokenOk`, `src/http.js#extensionTokenOk`, `src/datastore.js` |
| Web získá token přes párování | Dashboard vytvoří náhodný jednorázový kód platný 10 minut; rozšíření předá vlastní náhodné ID instalace, server ho po prvním použití zneplatní a vydá oddělený token jen pro tento origin | `src/app.js#pairExtension`, `src/http.js` |
| Únik zadání při předání do Gemini | Zadání není v URL, JSON odpovědi ani v trvalých datech. Spárovaný doplněk ho vyzvedne jednou z localhostu; server ho drží pouze v paměti nejvýše 60 sekund. | `src/http.js#putWebHandoff`, `extension/background.js` |
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

## Zpevnění desktopu — 2026-09-11

- API odmítá cizí Origin a cross-site metadata i při čtení a připojení SSE.
  Cross-Origin-Resource-Policy je `same-origin`. Chybové logy nevypisují URL ani výjimky s možným obsahem dat.
- SSE má nejvýše 32 klientů; pomalý klient s více než 1 MB neodeslaných dat se odpojí.
- Admin API požadavky odmítají přesměrování ještě před odesláním klíče na jinou adresu.
- Desktop používá nativní `SecItem` helper; hodnota klíče jde soukromou stdin rourou,
  nikdy v argumentech procesu ani do dočasného souboru. Helper přijímá pouze dva známé typy klíčů.
  CLI bez helperu nové klíče neukládá; bezpečně odmítne akci a nabídne desktop / proměnné prostředí.
- Nečitelný či poškozený `data.json` zastaví načítání a zůstane beze změny místo přepsání výchozí databází.

Podklady: [Apple SecItem](https://developer.apple.com/documentation/security/updating-and-deleting-keychain-items),
[odmítnutí přesměrování před únikem](https://developer.mozilla.org/docs/Web/API/Response/redirected).

## Známé hranice a podmínky distribuce

- **Lokální HTTP není izolace od jiných lokálních procesů.** Program běžící pod uživatelem může oslovit API, číst data a spustit povolené akce. Agentree proto není určeno pro nedůvěryhodné sdílené účty. Rozšíření s oprávněním k localhostu je rovněž privilegovaný klient; jednorázový kód snižuje riziko automatického vyzrazení tokenu, ale nechrání proti malwaru pod stejným uživatelem.
- **Veřejný macOS release:** aktuální lokální build je ad-hoc podepsaný. Před distribucí klientům je nutný stabilní Developer ID podpis, notarizace a ověření čisté instalace/aktualizace na dalším Macu. Ad-hoc změna podpisu může znovu vyžádat souhlas Klíčenky.
- **Licence zdrojů:** `package.json` zatím uvádí `UNLICENSED`. Vlastník musí před prezentací jako open-source zvolit licenci; zveřejnění na GitHubu samo licenci nenahrazuje.
- **Data v `~/.agentree/data.json` nejsou šifrovaná** (práva 0600). Obsahují výdaje, upozornění a token, ne přepisy.
- **Agent spuštěný z Agentree má stejná práva jako uživatel.** Na pozadí výchozí režim jen čte/plánuje; „Smí upravovat soubory“ je volba uživatele. Zadání pro Terminál leží až 24 h v `~/.agentree/prompts` (0600) a výstup běhů v `~/.agentree/runs` (0600).
- **Offline licence je ochrana proti náhodnému sdílení, ne DRM** (podrobně `docs/LICENSING.md`).
- **Jiné lokální programy** téhož uživatele mohou číst stejné zdroje jako Agentree — to je vlastnost macOS, ne Agentree.
- **Rozšíření čte obsah stránek AI aplikací** v prohlížeči uživatele a posílá ho jen na `127.0.0.1`. Před veřejnou distribucí je nutné ověřit podmínky jednotlivých služeb a Chrome Web Store policy. Současná vývojová instalace přes „Načíst rozbalené“ není vhodný veřejný onboarding; pro běžné uživatele je nutná publikace ve Chrome Web Store.

## Soukromí

- Žádná telemetrie, žádná analytika. Písma jsou lokální. Síťová komunikace: Admin API jen s klíčem uživatele, Ollama na `127.0.0.1`, otevření zvolené služby na výslovnou akci uživatele.
- Importované přepisy jsou v paměti (max. 400 položek na session). Výstup agentů spuštěných na pozadí se ukládá do lokálních logů v `~/.agentree/runs`; ty mohou obsahovat citlivé informace. Logy HTTP serveru obsah zpráv nevypisují.
- Před případnou cloudovou verzí: end-to-end šifrování, opt-in po zdrojích, zásady zpracování údajů (GDPR), smlouvy se zpracovateli.

## Hlášení problému

Bezpečnostní problém nahlas vlastníkovi repozitáře soukromě (ne veřejnou issue).
