# Bezpečnost a soukromí

Autorizace SSE se kontroluje před každou událostí i heartbeat. Odebrání zařízení zavře jeho stávající stream okamžitě. Vypnutí Tailscale odmítne také vzdálený požadavek přes loopback proxy, i když domácí síť zůstane zapnutá. Ověřená Tailscale IP musí být současně na místním rozhraní a v identitě hlášené Tailscale; samotný CGNAT rozsah nestačí.

Agenteeq čte velmi citlivá data: přepisy práce s AI (kód, klientské informace, prompty). Bezpečnost je proto součást produktu, ne doplněk.

## Model hrozeb

| Hrozba | Opatření | Kde |
|---|---|---|
| Přístup z jiného počítače v síti | Server poslouchá jen na `127.0.0.1`; další adresa vznikne výhradně po výslovném zapnutí uživatelem (domácí síť nebo Tailscale) a i pak jen se spárovaným zařízením | `bin/agenteeq.mjs`, `src/config.js`, `src/lan.js` |
| Škodlivý web čte data přes DNS rebinding | Odmítnutí požadavků s jiným `Host` než `127.0.0.1`/`localhost` a než vlastní zapnuté adresy (`lan.hosts()`) | `src/http.js#handle` |
| Škodlivý web mění data (CSRF) | Mutace vyžadují `X-Agenteeq: 1` (vynutí CORS preflight, který server nepovolí) + kontrola `Origin` | `src/http.js#guardMutation` |
| Podvržené události hooků | Náhodný 48znakový token hooků, porovnání v konstantním čase. Rozšíření ho nedostane a pro jeho cesty neplatí | `src/http.js#tokenOk`, `src/datastore.js` |
| Podvržená data rozšíření | Každá instalace rozšíření má vlastní token (32 náhodných bajtů) platný jen z původu `chrome-extension://…`, pro který byl vydán. Na disku je jen jeho sha256, nejvýš 5 instalací. Nové spárování téže instalace starý token zneplatní. Token rozšíření neplatí pro hooky | `src/http.js#extensionOk`, `src/app.js#extensionInstallation` |
| Web získá token přes párování | Bez kódu se spáruje jen rozšíření, jehož původ `chrome-extension://<ID>` (nastavuje ho prohlížeč, web ani jiné rozšíření ho nepodvrhnou) odpovídá ID z Chrome Web Store nebo ID složky, kterou připravila aplikace. Párování bez kódu přijímá jen požadavky přímo z tohoto Macu (ne přes proxy ani ze sítě, kde se `Origin` dá podvrhnout). Jakýkoli jiný původ dostane 409 a musí předat jednorázový kód: náhodný, platný 10 minut, vytvořit ho smí jen člověk u Macu, server ho porovná v konstantním čase a po prvním použití zneplatní. Schvalovací tlačítko pro cizí rozšíření záměrně chybí – jiné rozšíření by mohlo žádost podstrčit těsně před kliknutím | `src/app.js#pozadatOSparovani`, `src/app.js#pairExtension`, `src/http.js` |
| Vyčerpání sledování souborů | Kořeny přepisů přidávané za běhu (z hooku nebo z procesu) mají strop 24 na konektor | `src/koreny-prepisu.js#MAX_KORENU` |
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
| Vzorce v exportu CSV (CSV injection) | Buňky začínající `= + - @` dostanou prefix `'`; platí pro export projektu i útraty | `src/csv.js#bunka` |
| Zablokování serveru velkým požadavkem | Limit těla 1 MB, validace a ořez polí z rozšíření | `src/http.js#readBody`, `connectors/web.js` |

## Zpevnění desktopu – 2026-09-11

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

- **Lokální HTTP není izolace od jiných lokálních procesů.** Program běžící pod uživatelem může oslovit API, číst data a spustit povolené akce. Agenteeq proto není určeno pro nedůvěryhodné sdílené účty. Rozšíření s oprávněním k localhostu je rovněž privilegovaný klient; jednorázový kód snižuje riziko automatického vyzrazení tokenu, ale nechrání proti malwaru pod stejným uživatelem.
- **Veřejný macOS release:** aktuální lokální build je ad-hoc podepsaný. Před distribucí klientům je nutný stabilní Developer ID podpis, notarizace a ověření čisté instalace/aktualizace na dalším Macu. Ad-hoc změna podpisu může znovu vyžádat souhlas Klíčenky.
- **Licence zdrojů:** `package.json` zatím uvádí `UNLICENSED`. Vlastník musí před prezentací jako open-source zvolit licenci; zveřejnění na GitHubu samo licenci nenahrazuje.
- **Data v `~/.agenteeq/data.json` nejsou šifrovaná** (práva 0600). Obsahují výdaje, upozornění a token, ne přepisy.
- **Agent spuštěný z Agenteeq má stejná práva jako uživatel.** Na pozadí výchozí režim jen čte/plánuje; „Smí upravovat soubory“ je volba uživatele. Zadání pro Terminál leží až 24 h v `~/.agenteeq/prompts` (0600) a výstup běhů v `~/.agenteeq/runs` (0600).
- **Offline licence je ochrana proti náhodnému sdílení, ne DRM** (podrobně `docs/LICENSING.md`).
- **Jiné lokální programy** téhož uživatele mohou číst stejné zdroje jako Agenteeq – to je vlastnost macOS, ne Agenteeq.
- **Rozšíření čte obsah stránek AI aplikací** v prohlížeči uživatele, ale na `127.0.0.1` posílá jen stav a počty zpráv (od 0.25.0), nikdy text. Před veřejnou distribucí je nutné ověřit podmínky jednotlivých služeb a Chrome Web Store policy (odpovědi do formuláře obchodu: `docs/CHROME-WEB-STORE.md`).

## Nezávislý audit 2026-09-20: co je opraveno a co ne

Audit (čtení kódu + živé zkoušky proti dočasnému serveru) našel 18 nálezů. Tabulka říká, kde která věc stojí, ať se nedá tvrdit víc, než platí.

| # | Závažnost | Nález | Stav |
|---|---|---|---|
| 2 | střední | ID konverzace začínající „-“ se čte jako přepínač (`claude --resume --dangerously-skip-permissions`) | **opraveno**, test předvádí útok |
| 3 | střední | „Otevřít složku“ spustí `open <cesta>` i na balíček `.app` | **opraveno**, balíčky a odkazy na ně se odmítnou |
| 6 | nízká–střední | záloha nastavení Claude Code s právy 0644 | **opraveno** (0600, dřívější zúženy) |
| 7 | nízká–střední | `/api/extension/pair-code` vytvoří i telefon nebo proxy; rozšíření sdílí token s hooky a ten se neotáčí | **opraveno** (kód jen z Macu; od 0.25.0 vlastní token pro každou instalaci, vázaný na její `Origin`, otočí se novým spárováním). Zůstává: token hooků se neotáčí a samostatné „odpojit rozšíření“ zatím není – odpojí ho nové spárování nebo 5 novějších instalací |
| 1 | **vysoká** | spárovaný telefon smí i spouštět agenty s libovolnou složkou, instalovat hooky, měnit klíče a číst přepisy; LAN je prostý HTTP a cookie nemá `Secure` | **opraveno v 0.18.0** (rozsah jen pro čtení, `src/remote-scope.js`). Zůstává: LAN je prostý HTTP – přístup z telefonu nezapínej v cizí síti a používej Tailscale |
| 4, 5 | střední | loopback je důvěryhodný bez tajemství; „z tohoto Macu“ se odhaduje z hlaviček | **opraveno v 0.18.0 pro okno aplikace na Macu, 5. 10. 2026 i pro plášť ve Windows a spuštění z Terminálu** (klíč okna – viz „Klíč okna“ níž) |
| 8 | nízká | ingest token je v argumentech `curl` v hooku | otevřené (čitelný jen pro téhož uživatele) |
| 9 | nízká | `git` se spouští v cizích složkách s konfigurací repozitáře (`core.fsmonitor`) | **opraveno v 0.18.1** (přebití voleb na příkazové řádce, test předvádí útok) |
| 10, 11 | nízká | vydávací workflow: práva zápisu pro všechny úlohy, akce připnuté značkou ne SHA, značka vložená přímo do skriptu, bez kontrolních součtů a atestace; CI nemá import certifikátu | otevřené, řeší se spolu se získáním Developer ID |
| 12–14, 16–17 | nízká / info | minimální prostředí potomka, čištění souborů se zadáním, SSRF sonda na privátní adresy, CSP `unsafe-inline` (styly), kontrola odesílatele zpráv v rozšíření | otevřené |
| 18 | info | hlavičky webu | **opraveno 5. 10. 2026** (`vercel.json`, viz „Hlavičky webu“) |
| 15 | info | PIN má 5 pokusů celkem | ponecháno, dostatečné |

Ověřeně v pořádku (audit je zkoušel): ochrana proti DNS rebindingu a CSRF, kontrola `Origin`/`Host`, tokenové cesty s `timingSafeEqual`, limity těla a SSE, procházení statických souborů, XSS (75 zkušebních řetězců v 8 vstupech: všude jen text), oprávnění datových souborů, WKWebView jen na 127.0.0.1, převzetí portu jen po ověření podpisu skriptu.

## Klíč okna (desktop na Macu i ve Windows, spuštění z Terminálu)

Server poslouchá na `127.0.0.1`, jenže smyčku sdílí všechny programy a všechny účty počítače.
Bez tajemství by si přehled, přepisy i akce mohl vzít jiný účet na tomtéž počítači nebo program
v sandboxu, který smí na síť, ale ne do souborů uživatele. Proto server s klíčem okna
(`config.localKey`, `AGENTEEQ_LOCAL_KEY`) bez něj vydá jen `/api/health` a cesty s vlastním
tajemstvím (hooky, rozšíření – ty klíč nepotřebují a fungují beze změny).

| Kdo spouští server | Odkud klíč | Jak se dostane do prohlížeče |
|---|---|---|
| Aplikace na Macu (`desktop/Agenteeq.swift`) | náhodný pro každé spuštění | okno načte `/?k=…` |
| Aplikace ve Windows (`desktop/windows/Agenteeq.cpp`) | 2× `CoCreateGuid` pro každé spuštění pláště | okno načte `/?k=…`; do hlášení QA se adresa zapisuje bez klíče |
| Terminál, `npm start`, LaunchAgent (`bin/agenteeq.mjs`, `src/klic-okna.js`) | 32 náhodných bajtů pro každé spuštění | `agenteeq --open`, nebo odkaz vypsaný do Terminálu (jen do terminálu, ne do logu) |

Server klíč z adresy jednou vymění za cookie `HttpOnly; SameSite=Strict` a přesměruje na čistou
adresu (`src/http.js#localKeyGate`). Aby `agenteeq --open` otevřel přehled i u serveru, který už
běží (LaunchAgent, jiný Terminál), leží klíč po dobu běhu v datové složce (`klic-okna`, práva 0600,
složka 0700) a při ukončení se smaže. Přečte ho jen týž uživatel – tedy ten, kdo k datům Agenteeq
smí i bez něj. `AGENTEEQ_LOCAL_KEY=0` ochranu vypne (jen pro vývoj). Hlídá `test/klic-okna.test.mjs`
a `npm run smoke:server`.

## Hlavičky webu (`vercel.json`)

Web (landing page, `/app`, přehled účtu `/app?ucet`) posílá na všech adresách:

- `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://*.googleusercontent.com; font-src 'self';
  connect-src 'self' https://quxfenxxdcafcuptucnn.supabase.co; manifest-src 'self'; worker-src 'self';
  object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. Odpovídá tomu,
  co web opravdu načítá: vlastní skripty a písma, fotku účtu od Googlu, API účtů v Supabase.
  `unsafe-inline` jen pro styly (atributy `style` s proměnnými CSS), skripty žádné vložené nejsou.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` (kamera, mikrofon, poloha, platby, USB vypnuté),
  `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`.

`npm run qa:site` posílá tytéž hlavičky (`scripts/build-site.mjs#hlavickyWebu`) a ověřuje, že
landing page, zásady soukromí, `/app`, `/app?ucet` a `/app?ukazka` se vykreslí bez porušení CSP.
Při změně domény účtů (Supabase) se musí změnit i `connect-src`.

## Soukromí

- Žádná telemetrie, žádná analytika. Písma jsou lokální. Síťová komunikace: denní kurz ČNB bez údajů o uživateli a kontrola veřejného releasu Agenteeq na GitHubu (jen verze a přesně ověřený instalační balíček; obojí vypíná `AGENTEEQ_CLOUD=0`), Admin API jen s klíčem uživatele, Ollama na `127.0.0.1`, otevření zvolené služby na výslovnou akci uživatele.
- Importované přepisy jsou v paměti (max. 400 položek na session). Výstup agentů spuštěných na pozadí se ukládá do lokálních logů v `~/.agenteeq/runs`; ty mohou obsahovat citlivé informace. Logy HTTP serveru obsah zpráv nevypisují.
- **Vzorek stránky z rozšíření (od 0.26.0):** vzniká jen na kliknutí a jen jako soubor u uživatele,
  nikam se neposílá. Obsahuje stavbu stránky bez textu zpráv, názvů, jmen, odkazů, obrázků,
  skriptů a hodnot polí; atributy s mezerou ztratí hodnotu, čísla a hashe z ID zmizí, z adresy
  zůstanou jen krátká slova stavby. Hlídá to `test/extension-overeni.test.mjs`.
- **Účet Agenteeq (od 0.25.0, `docs/ACCOUNTS.md`):** jen na výslovné přihlášení přes Google. Do cloudu (Supabase, Frankfurt) smí jen účet a souhrny – nikdy text konverzací, jejich názvy, cesty ke složkám ani kód. Přihlášení je PKCE s jednorázovým pokusem, návrat přijme jen tento Mac, obnovovací token leží v Klíčence, přístupový jen v paměti. Databáze má RLS na každé tabulce, ověřené skriptem `supabase/tests/rls.sql`.
- **Přehled na webu** (`/app?ucet`) drží relaci účtu v `localStorage` prohlížeče (jako běžné webové aplikace nad Supabase). Stránka nenačítá cizí skripty ani písma a nemá vložený kód třetích stran; web do souhrnů jen čte. Odhlášení relaci smaže a zneplatní na serveru.
- Zásady ochrany soukromí jsou od 0.29.0 na webu (`site/soukromi/index.html`, `site/en/privacy/index.html`). Před ostrým spuštěním účtů zbývá jejich právní kontrola a smlouva se zpracovatelem (Supabase).

## Hlášení problému

Bezpečnostní problém nahlas vlastníkovi repozitáře soukromě (ne veřejnou issue).

## Přístup z telefonu (od 12. 9. 2026)

Výchozí stav: **vypnuto**. Server poslouchá jen na `127.0.0.1`.

Po zapnutí (jen z Macu, `POST /api/lan/enable`):

- Druhý listener na **konkrétní privátní adrese** Macu, ne na `0.0.0.0` (a nikdy na veřejné adrese – `lanAddresses()` vybírá jen 10/8, 172.16/12, 192.168/16).
- Hlavička `Host` se kontroluje proti pevnému seznamu (`127.0.0.1`, `localhost`, vlastní privátní adresy) – ochrana proti DNS rebindingu.
- Každý požadavek z místní sítě musí mít token spárovaného zařízení. Výjimky: statické soubory (aby šla zobrazit párovací obrazovka), `/api/health` a `/api/lan/pair`.
- Párování: šestimístný PIN, platnost 5 minut, jedno použití, nejvýš 5 pokusů, srovnání `timingSafeEqual`. PIN vzniká a zobrazuje se jen na Macu.
- Token: 32 náhodných bajtů, cookie `HttpOnly; SameSite=Lax; Max-Age=90 dní`. V `data.json` je jen `sha256` hash – ze zálohy dat se přihlásit nedá. Nejvýš 10 zařízení.
- Z telefonu nelze: vytvořit PIN, zapnout/vypnout přístup, odpárovat zařízení, zjistit seznam zařízení (filtruje se i v `/api/state`).
- Z telefonu nejde číst celý přepis konverzace ani výstup agentů na pozadí (od 5. 10. 2026): `/api/sessions/:id` vrátí jen souhrn (stav, název, poslední zadání, aktivita, tokeny), `/api/sessions/:id/transcript` a `/api/runs/:id/log` odpoví 403 a událost SSE `transcript` se telefonu neposílá (`src/remote-scope.js`, `test/vzdaleny-prepis.test.mjs`).
- Vypnutí zavře listener a smaže všechna zařízení – pokud zároveň není zapnutá druhá cesta (Tailscale).
- Zápisy dál procházejí ochranou proti CSRF (`X-Agenteeq` + kontrola `Origin`, do níž se přidají jen vlastní privátní adresy).

## Upozornění na telefon (od 0.40.0)

Web Push bez serveru Agenteeq (`src/webpush.js`, `src/push.js`). Výchozí stav: žádný odběr.

- Odběr zapíná jen **spárovaný telefon** (`POST /api/push/subscribe` s tokenem zařízení); z Macu 409. Odběr nese id zařízení a s odpárováním zaniká. Telefon vidí, zkouší a ruší jen svůj odběr (`src/remote-scope.js` povoluje jen tyto tři zápisy).
- **Kam smí Mac posílat:** jen `https://` bez vlastního portu na známé push služby (`*.push.apple.com`, `fcm.googleapis.com`, `android.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`). Ukradený token tak nedokáže z Macu posílat požadavky do domácí sítě ani jinam (SSRF). Kontroluje se při přihlášení i při každém odeslání.
- **Obsah** (titulek, text, cíl v aplikaci – totéž, co ukazuje oznámení systému) je šifrovaný pro telefon podle RFC 8291 (ECDH P-256 + AES-128-GCM); push služba vidí jen, že a kdy zpráva šla. Odesílatele prokazuje podpis VAPID (RFC 8292, ES256, platnost 12 h). Soukromý klíč VAPID leží v `data.json` (0600) – kdo ho získá, může posílat zprávy jen na odběry, které zná, a ty jsou ve stejném souboru.
- Adresa odběru a klíče telefonu se přes API nikdy nevracejí, ani na Macu.
- Push služba, která odběr nezná (404/410), ho zruší; jiná chyba se uloží k odběru a ukáže v Nastavení. Selhání se nehlásí jako doručení.
- Neověřeno na skutečném zařízení (Beta, `docs/CONNECTORS.md`).

## Přístup přes Tailscale (od 15. 9. 2026)

Druhá, nezávislá cesta ke stejným datům – pro situace mimo domácí síť. Výchozí stav: **vypnuto**
(`settings.tailscaleAccess`), zapíná se jen z Macu (`POST /api/tailscale/enable`).

Platí **beze změny všechno z předchozí kapitoly** (párování PINem, token v `HttpOnly` cookie, hash
v datech, CSRF, zákaz správy z telefonu) – včetně situace, kdy je před serverem `tailscale serve`
(viz níž). Liší se jen adresa, na které server naslouchá:

- Listener na **konkrétní adrese tohoto Macu v tailnetu** (`tailscaleAddresses()` v `src/lan.js`
  bere jen IPv4 z rozsahu `100.64.0.0/10`), ne na `0.0.0.0`. Adresu přiděluje Tailscale a dostane
  se na ni jen zařízení přihlášené do stejného tailnetu – veřejně neexistuje a není dohledatelná.
- Hlavička `Host` se rozšíří o adresu v tailnetu a o jméno v MagicDNS (`mac.tailnet.ts.net`,
  porovnává se malými písmeny). Jméno pochází z `tailscale status --json`; když ho tailnet nemá
  zapnuté, zůstane prázdné a pracuje se jen s adresou – nic se nedomýšlí.
- **Jméno se před vpuštěním do seznamu ověří** (`magicDnsName()` v `src/lan.js`): musí to být běžné
  DNS jméno malými písmeny, nejvýš 253 znaků, aspoň dvě části, žádný port, lomítko, mezera ani
  prázdná část. Je to jediná hodnota v téhle ochraně, která přichází z výstupu cizího programu,
  takže se do ní nesmí dostat nic neočekávaného. Co tvarem neprojde, se zahodí a pracuje se
  jen s adresou.
- Obě cesty jsou nezávislé: vypnutí jedné nezavře listener druhé a spárované telefony se mažou,
  teprve když se zavírá **poslední** otevřená cesta.
- Zapnutí, které nedokáže otevřít listener, se vrátí zpět na vypnuto a řekne proč (`502`). Rozhraní
  nikdy neohlásí zapnutý přístup, který ve skutečnosti neposlouchá.
- Agenteeq Tailscale **neinstaluje ani nespouští** a nespouští ani `tailscale serve`. Jen se ptá na
  stav a naslouchá na adrese, kterou už uživatel má (princip 4 v `AGENTS.md`).

### Co je „požadavek z tohoto Macu“ (a proč nestačí adresa protistrany)

Desktopová aplikace a prohlížeč na Macu mají výjimku: nepotřebují token a jen jim se vydá PIN,
seznam zařízení a plný `/api/state`. Rozhodnout, kdo tu výjimku dostane, **nejde podle adresy
protistrany samotné**. `tailscale serve` – a každá jiná reverzní proxy běžící na tomhle Macu –
zakončí TLS pro cizí zařízení z tailnetu a na server se obrátí z `127.0.0.1`. Kdyby stačila
adresa, spuštěním jediného příkazu by kterýkoli uzel v tailnetu získal práva desktopové aplikace:
data bez tokenu, cizí PIN ještě před jeho použitím a `POST /api/launch`, tedy spuštění agenta.

`zTohotoMacu()` v `src/http.js` proto vyžaduje **obojí zároveň**:

1. spojení přišlo po smyčce (`isLoopback`), **a**
2. požadavek se hlásí na `Host: 127.0.0.1` nebo `localhost`, **a**
3. nenese hlavičky, které přidává reverzní proxy (`X-Forwarded-*`, `Forwarded`, `Tailscale-User-*`).

Požadavek přeposlaný přes `tailscale serve` nese jméno v MagicDNS, takže výjimku nedostane
a chová se jako každé jiné vzdálené zařízení: musí být spárovaný. Hlídá to regresní test
v `test/tailscale.test.mjs`.

Aby se z telefonu po HTTPS dalo vůbec spárovat, je v seznamu povolených `Origin` kromě
`http://<adresa>:<port>` i `https://<vlastní jméno>` – je to pořád naše vlastní adresa
a cizí web si `Origin` podvrhnout nemůže.

Cookie s tokenem dostane příznak `Secure`, když proxy hlásí `X-Forwarded-Proto: https`. Server sám
TLS nezakončuje, takže jinak HTTPS nepozná; hlavičce se věří jen u spojení po smyčce, tedy od
proxy běžící na tomhle Macu. Podvržení téhle hlavičky nic neotevírá – jen přidá `Secure`, kterým
si útočník zavře vlastní spojení po `http`.

### HTTPS přes `tailscale serve`

Proxy s certifikátem od Let's Encrypt je jediná cesta, jak si telefon uloží aplikaci na plochu
jako PWA. Agenteeq stav téhle proxy jen **čte** (`tailscale serve status --json`) a co nerozezná,
hlásí jako neznámé – nikdy jako zapnuté. Sám ji nespouští. Detekce je ověřená proti dokumentaci,
ne proti živému tailnetu: v `docs/REMOTE.md` je proto vedená jako **Beta**.

### Proč nestačí adresa v rozsahu 100.64.0.0/10

Přepínač se odemkne, teprve když `tailscale status --json` potvrdí, že Tailscale **běží**.
Samotná adresa z toho rozsahu Tailscale nedokazuje: je to rozsah pro CGNAT (RFC 6598) a od
některých operátorů ji Mac dostane i bez něj. Bez té kontroly by se naslouchání otevřelo do sítě
operátora a rozhraní by o té adrese tvrdilo, že je „v síti Tailscale“.

Bez `tailscale serve` jede aplikace po `http://` uvnitř tailnetu – v prohlížeči funguje normálně,
jen ji telefon neuloží na plochu.
