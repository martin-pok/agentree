# AGENTS.md – jak vyvíjet Agenteeq

Tento soubor je závazný pro každého, kdo mění kód: člověka, Claude Code, Codex i jiné agenty. Je krátký schválně. Detaily jsou v `docs/`.

## 1. Poslání a principy produktu

Agenteeq ukazuje **v reálném čase a na jednom místě** všechny AI agenty, kteří pro uživatele pracují, a upozorní ho ve chvíli, kdy je potřeba jeho rozhodnutí.

1. **Pravdivost nad efektem.** Nikdy nezobrazuj vymyšlená nebo odhadnutá data jako skutečná. Heuristiku pojmenuj (např. „stav z přepisu“) a zdokumentuj v `docs/CONNECTORS.md`. Neověřený konektor = štítek **Beta**.
2. **Realtime je jádro.** Změna u zdroje se má v UI projevit do 2 s (souborové zdroje) nebo okamžitě (hooky, rozšíření). Každá změna datové cesty musí mít test latence nebo jej zachovat (`test/http.test.mjs`).
3. **Local-first a soukromí.** Server poslouchá jen na `127.0.0.1`. Další adresa (domácí síť, Tailscale) vzniká výhradně po výslovném zapnutí uživatelem v Nastavení a i pak z ní bez spárovaného zařízení nejde přečíst nic – viz `docs/SECURITY.md`. Přepisy obsahují citlivý obsah – nikdy je neposílej mimo počítač, nelogguj jejich obsah, nepřidávej telemetrii bez výslovného rozhodnutí vlastníka produktu.
4. **Do konfigurace jiných nástrojů zasahuj jen na výslovnou akci uživatele**, vždy se zálohou a idempotentně (vzor: `src/hooks-installer.js`).
5. **Spolehlivost.** Chyba jednoho konektoru nesmí shodit server ani ostatní konektory. Watchery se obnovují, plný průchod běží každých 10 s.

## 2. Příkazy

```bash
npm start         # server + dashboard na http://127.0.0.1:4620
npm run dev       # server s restartem při změně src/ a bin/
npm test          # všechny testy (node:test), ~20 s
npm run check     # syntaktická kontrola všech .js/.mjs
npm run smoke     # balíček pro zákazníky: pack → instalace do dočasné složky → start → API
npm run pack      # dist/agenteeq-<verze>.tgz

npm run build:extension   # dist/agenteeq-extension-<verze>.zip (rozšíření pro Chrome)
npm run build:site        # dist/web – landing page v kořeni, rozhraní aplikace na /app
npm run release:mac       # celé vydání: testy → smoke → rozšíření → web → .app (--install vymění i /Applications)
```

Proměnné pro vývoj a testy: `PORT`, `AGENTEEQ_HOME` (data aplikace), `AGENTEEQ_SOURCE_HOME` (odkud číst zdroje – v testech vždy dočasná složka), `AGENTEEQ_OPEN=dry` (otevírání a spouštění agentů jen vrátí plán – **povinné v testech a při ručním QA na cizích datech**), `AGENTEEQ_OLLAMA_URL`, `AGENTEEQ_PROCESSES=0`, `AGENTEEQ_NATIVE_NOTIFY=0`, `AGENTEEQ_KEYCHAIN=0`, `AGENTEEQ_CLOUD=0`, `AGENTEEQ_QUIET=1`. Viz `src/config.js`.

## 3. Mapa repozitáře

```
bin/agenteeq.mjs            vstup CLI: start serveru, install-agent / uninstall-agent
src/app.js                  složení aplikace: konektory → Store → upozornění, časovače, snapshot stavu
src/http.js                 REST API, SSE stream, statické soubory, bezpečnostní kontroly
src/model.js                jednotný model session + CENTRÁLNÍ odvození stavu (deriveStatus)
src/store.js                stav v paměti, události pro SSE a upozornění, limity, kredity
src/alerts.js               pravidla upozornění, deduplikace, nativní notifikace
src/spend.js                výdaje, rozpočty, převody měn, prognóza, upozornění na rozpočet
src/datastore.js            trvalá data ~/.agenteeq/data.json (atomický zápis)
src/hooks-installer.js      instalace Claude Code hooků (záloha, idempotence, odinstalace)
src/secrets.js              API klíče v Klíčence macOS
src/launch-agent.js         automatický start po přihlášení (LaunchAgent)
src/openers.js              „Otevřít v aplikaci / Pokračovat v Terminálu / Otevřít složku“ – bezpečný plán akcí
src/lan.js                  přístup z telefonu: listenery na vlastních adresách (domácí síť, Tailscale), PIN, tokeny
src/tunnel.js               detekce cest ven (Tailscale, Cloudflare Tunnel, ngrok) – jen zjišťuje a radí
src/projects.js             projekty: validace, zařazení (ručně / podle složky / mimo), snímky, CSV
src/launcher.js             rychlé spouštění agentů: detekce, plán (argv, bez shellu pro zadání), validace
src/runs.js                 běhy agentů na pozadí: proces, log, stav, zastavení
src/ollama.js, local-chat.js  lokální modely v Ollamě jako běžná session s živým přepisem
src/license.js, plans.js    offline licence (Ed25519) a placené funkce; klíč vydavatele NIKDY v repozitáři
scripts/license.mjs         vydávání licencí (viz docs/LICENSING.md)
scripts/smoke-package.mjs   ověření instalačního balíčku
src/watch.js                rekurzivní watcher s obnovou, fronta souborů, výpis souborů
src/connectors/*.js         jeden soubor = jeden zdroj dat (viz docs/CONNECTORS.md)
public/index.html           kostra aplikace
public/styles.css           design systém a všechny komponenty
public/js/app.js            router, SSE, horní lišta, notifikace, paleta ⌘K
public/js/state.js          klientský stav a slučování událostí do jednoho snímku
public/js/views/*.js        obrazovky (mount/update/unmount)
public/js/projects-ui.js    formulář projektu, prohlížeč složek, dialog zařazení
public/js/launcher-ui.js    karta „Spustit agenta“ a běhy na pozadí
public/js/charts.js         SVG grafy bez knihoven
public/js/icons.js          barvy poskytovatelů, loga služeb (glyph/logoKey), ikony UI
public/logos/               oficiální loga služeb (@lobehub/icons-static-svg 1.95.0, MIT)
extension/                  rozšíření Chrome MV3 pro webové AI aplikace (písma jsou kopie public/fonts)
site/                       landing page (marketing) – mimo public/, do balíčku aplikace nepatří
scripts/build-site.mjs      složí dist/web: site/ do kořene, public/ pod /app
scripts/build-extension.mjs balíček rozšíření (vlastní ZIP, bez závislostí)
scripts/release-mac.mjs     vydání jedním příkazem
test/                       testy; helpers.mjs spouští server nad dočasnými fixturami
docs/                       architektura, konektory, datový kontrakt, bezpečnost, testy, produkt, roadmapa, jméno produktu
```

## 4. Závazná technická pravidla

- **Bez runtime závislostí.** Jen Node.js standardní knihovna a vanilla JS v prohlížeči. Důvod: instalace jedním příkazem, žádný supply-chain risk u nástroje, který čte citlivé přepisy. Výjimku schvaluje vlastník produktu a zapíše se do `docs/ARCHITECTURE.md`.
- **ES moduly všude** (`"type": "module"`). Rozšíření používá klasické skripty (požadavek MV3 content scripts).
- **Stav session se odvozuje jen v `src/model.js#deriveStatus`.** Konektor nastavuje fakta (`running`, `pending`, `limit`, `lastAt`, …), nikdy přímo `status`.
- **Každý dynamický text v HTML jde přes `esc()`** (`public/js/format.js`). Přepisy a titulky jsou nedůvěryhodný vstup. Markdown v přepisu renderuje jen `md()` v `views/session.js` (nejdřív escapuje).
- **Mutace API** vyžadují hlavičku `X-Agenteeq: 1` a lokální `Origin` (ochrana CSRF). Vstupy od hooků a rozšíření vyžadují `X-Agenteeq-Token`. Nové endpointy přidávej do tabulky v `src/http.js` a do `docs/DATA-CONTRACT.md`.
- **Změna tvaru dat** = upravit současně server, `public/js/state.js`, dotčené obrazovky, `docs/DATA-CONTRACT.md` a testy.
- **Web a rozšíření drží design aplikace.** `site/lp.css` a okno rozšíření opisují tokeny z `public/styles.css` a shodu hlídají testy (`test/site.test.mjs`, `test/extension-assets.test.mjs`). Na webu je každá ukázka rozhraní popsaná jako ukázka – nikdy se nevydává za skutečná data.
- **UI texty česky**, věty s malými písmeny (sentence case), aktivní slovesa, tlačítko říká, co se stane. Chybové hlášky říkají, co se stalo a co dělat. Bez anglicismů, kde existuje běžné české slovo.
- **Design:** identita „koncertní sál“ (eben, mlžná slonovina, samet = rozhodnutí, smaragd = práce, mosaz = akcent), podpisový prvek je tmavá scéna, kde každý aktivní agent svítí jako bod (smaragdový pracuje, sametový potřebuje tebe). Logo: `public/brand/`. 8px mřížka, **max. váha písma 500** (žádný bold 700), fonty Urbanist / Onest / Geist Mono, paleta a tokeny v `public/styles.css :root`. Loga služeb vkládej jen přes `glyph()` z `public/js/icons.js`. Texty na barvách používají varianty `*-ink` kvůli kontrastu WCAG 2.2 AA. Viditelný fokus, `prefers-reduced-motion`, žádné vodorovné rolování na 360 px. Režimy `light`, `dark`, `system` jsou jeden tokenový systém: žádné lokální inverze, přímé bílé texty na světlé kartě nebo neověřený kontrast. Viz `docs/PRODUCT-AND-ARCHITECTURE.md`.

## 5. Přidání nového konektoru (postup)

1. Prozkoumej skutečná data na disku a zapiš **ověřený** formát do `docs/CONNECTORS.md` (bez domněnek; neověřené označ).
2. Vytvoř `src/connectors/<id>.js` s rozhraním: `id, name, provider, kind, verified, source, description, start(), scan(), stop(), idle(), status()` a volitelně `ingest*()`.
3. Parsování drž v čisté exportované funkci (`apply…`), aby šla testovat bez souborového systému.
4. Používej `store.ensure()`, `touch()`, `pushEntry()`, `addTokens()` a `store.commit(s)`. Limity přes `store.setLimit()`, kredity přes `store.setCredits()`.
5. Zaregistruj v `src/app.js` (a v `SESSION_CONNECTORS`, pokud vytváří sessions) a přidej poskytovatele do `public/js/icons.js#PROVIDERS`, pokud je nový.
6. Testy: parser (fixtury v testu), stav přes `deriveStatus`, případně HTTP/SSE.
7. Ruční ověření v prohlížeči na skutečných datech, pak `verified: true`.

## 6. Definice hotového (Definition of Done)

Změna je hotová, až když platí vše:

- [ ] `npm test` a `npm run check` projdou.
- [ ] Nové chování má test (parser, stav, API nebo stream).
- [ ] Ověřeno v prohlížeči: desktop 1440 px a mobil 375 px, konzole bez chyb, klávesnice a fokus funguje.
- [ ] Žádná vymyšlená data; heuristiky a neověřené části popsané v dokumentaci.
- [ ] Aktualizovaná dokumentace (`docs/*`, tabulky podpory) a záznam v `CHANGELOG.md`.
- [ ] Commit s popisem proč, ne jen co.

## 7. Poctivý stav k verzi 0.8.0

Ověřeno na skutečných datech (macOS, Node 24): Claude Code / Claude Desktop Code, Codex (ChatGPT app), procesy AI aplikací, Claude Code hooky (automatický test i instalace do dočasného HOME), realtime stream, útrata a rozpočty.

Beta (formát podle dokumentace nebo odvozený, bez dat na vývojovém Macu): Cursor (formát ověřen, ale bez aktivních agentů), GitHub Copilot CLI, Copilot ve VS Code, Gemini CLI, Qwen Code, rozšíření prohlížeče (selektory neověřené proti živým webům), Admin API náklady.

Nemožné bez podpory dodavatele: čtení konverzací z desktopové aplikace Microsoft Copilot, útrata za předplatné a extra usage u ChatGPT/Claude/Gemini/Perplexity/Grok/Qwen (nemají veřejné API → ruční zápis), schválení akce agenta na dálku z Agenteeq.

Další práce: [docs/ROADMAP.md](docs/ROADMAP.md).

## 8. Core operating contract

`AGENTS.md` je krátký závazný kontrakt; úplný produktový, architektonický a releasový kontext je v [docs/PRODUCT-AND-ARCHITECTURE.md](docs/PRODUCT-AND-ARCHITECTURE.md). Před každou změnou jej otevři. Při konfliktu platí pořadí: bezpečnost a skutečná data → tento soubor → datový kontrakt → aktivní kód a testy → starší dokumentace.

- **Zachovej význam metrik.** Tokeny, API náklady, kredity a limity jsou rozdílné hodnoty. Nikdy je nesčítej ani nepřejmenuj jen kvůli hezčímu dashboardu.
- **Chraň pracovní plynulost.** Živá data nesmějí přepsat otevřený picker, formulář, dialog, scroll pozici ani focus. Nové realtime chování musí mít regresní test.
- **Přidávej konektor po pravdě.** Bez skutečných dat je stav `Beta`/`Neověřeno`; přihlašování vždy zůstává na stránce dodavatele nebo přes oficiální klíč v Klíčence.
- **Drž desktop a web spolu.** Změna vzhledu, lifecycle nebo bridge se ověřuje v Chromiu i WebKitu a v macOS buildu. `light` je výchozí; `dark` a `system` musí projít AA kontrastem a změnou bez restartu.
- **Před releasem dokaž, neodhaduj.** Testy, syntax, screenshoty, bezpečnostní diff, smoke a podpis jsou důkazy. Do GitHub `main` jde změna jen přes green PR.

## 9. Standard celé produktové rodiny

Vizuální přijetí není totéž co zelené testy. Plošný fialový podklad LP byl uživatelem odmítnut; preferuj neutrální základ s jemným mesh světlem, které nepřekrývá obsah. Ovládací prvky mají okamžitou a jednotnou odezvu stisku/hover/fokusu; nečekat na animaci před provedením akce. Žádné nekonečné animování pozadí, těžké blur filtry nebo generické světelné efekty. Nový vzhled ukázat a vizuálně ověřit, neoznačovat automaticky za prémiový jen podle testů.

Web, aplikace i rozšíření jsou jeden produkt a mají stejný standard řemesla: prémiový, srozumitelný UX/UI, jasná hierarchie a seskupení souvisejících informací, WCAG 2.2 AA a skutečně ověřená funkčnost. Nový vzhled musí navazovat na identitu Agenteeq, ne na obecnou šablonu. Pohyb vysvětluje změnu stavu; dekorativní nekonečné animace nepřidávat. Web má být stručný, responzivní a mít správná metadata, canonical a indexační soubory. Každá prodejní výzva musí vést na skutečně dostupný výsledek.

Vzdálený přístup se testuje také po restartu, výpadku sítě, odebrání zařízení a vypnutí jedné z cest. Vysvětluj rozdíl mezi zavřeným oknem, ukončeným serverem a vypnutým či uspaným hostitelem. Přístup při vypnutém hostiteli vyžaduje samostatné rozhodnutí o trvale běžícím serveru; neslibovat ho pouze změnou rozhraní.

Při souběžné práci rozdělit vlastnictví souborů, ponechat hlavnímu agentovi designový směr a integraci a ověřit výsledný společný diff. Průběžně předávat ověřené odkazy a výsledky, nejen závěrečný report.
