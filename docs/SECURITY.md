# Bezpečnost a soukromí

Agenteeq čte velmi citlivá data: přepisy práce s AI (kód, klientské informace, prompty). Bezpečnost je proto součást produktu, ne doplněk.

## Model hrozeb

| Hrozba | Opatření | Kde |
|---|---|---|
| Přístup z jiného počítače v síti | Server poslouchá jen na `127.0.0.1`; další adresa vznikne výhradně po výslovném zapnutí uživatelem (domácí síť nebo Tailscale) a i pak jen se spárovaným zařízením | `bin/agenteeq.mjs`, `src/config.js`, `src/lan.js` |
| Škodlivý web čte data přes DNS rebinding | Odmítnutí požadavků s jiným `Host` než `127.0.0.1`/`localhost` a než vlastní zapnuté adresy (`lan.hosts()`) | `src/http.js#handle` |
| Škodlivý web mění data (CSRF) | Mutace vyžadují `X-Agenteeq: 1` (vynutí CORS preflight, který server nepovolí) + kontrola `Origin` | `src/http.js#guardMutation` |
| Podvržené události hooků / rozšíření | Náhodný 48znakový token, porovnání v konstantním čase | `src/http.js#tokenOk`, `src/datastore.js` |
| Web získá token přes párování | Dashboard vytvoří náhodný jednorázový kód platný 10 minut; rozšíření ho musí ručně předat, server ho porovná v konstantním čase a po prvním použití zneplatní | `src/app.js#pairExtension`, `src/http.js` |
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
- **Rozšíření čte obsah stránek AI aplikací** v prohlížeči uživatele a posílá ho jen na `127.0.0.1`. Před veřejnou distribucí je nutné ověřit podmínky jednotlivých služeb a Chrome Web Store policy.

## Soukromí

- Žádná telemetrie, žádná analytika. Písma jsou lokální. Síťová komunikace: Admin API jen s klíčem uživatele, Ollama na `127.0.0.1`, otevření zvolené služby na výslovnou akci uživatele.
- Importované přepisy jsou v paměti (max. 400 položek na session). Výstup agentů spuštěných na pozadí se ukládá do lokálních logů v `~/.agenteeq/runs`; ty mohou obsahovat citlivé informace. Logy HTTP serveru obsah zpráv nevypisují.
- Před případnou cloudovou verzí: end-to-end šifrování, opt-in po zdrojích, zásady zpracování údajů (GDPR), smlouvy se zpracovateli.

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
- Vypnutí zavře listener a smaže všechna zařízení – pokud zároveň není zapnutá druhá cesta (Tailscale).
- Zápisy dál procházejí ochranou proti CSRF (`X-Agenteeq` + kontrola `Origin`, do níž se přidají jen vlastní privátní adresy).

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
