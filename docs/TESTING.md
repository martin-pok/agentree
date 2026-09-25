# Testování a ověření

## Automatické testy

```bash
npm test          # node:test, sériově, bez sítě, nad dočasnými fixturami
npm run check     # node --check pro všechny .js/.mjs
npm run smoke     # balíček: pack → instalace do dočasného prefixu → start s dočasnými složkami → API a statické soubory
npm run qa:contrast  # WCAG 2.2 AA nad vykreslenou plochou (aplikace, web, okno rozšíření)
npm run qa:site      # prohlídka webu: Chromium/WebKit, light/dark, 360–1440 px, klávesnice a omezení pohybu
npm run qa:extension # párování, výpadek, odebrání oprávnění a služby v popupu
npm run qa:native    # macOS/Windows: rozbalí archiv z dist/, spustí aplikaci, počká na server a vykreslené rozhraní v okně, nafotí ho a ověří, že po ukončení server skončil (CI: aplikace pro Mac, plášť pro Windows)
npm run showcase    # prohlídka skutečného UI se smyšlenými daty a izolovaným serverem
```

`qa:contrast` nepočítá dvojice tokenů, ale **každý viditelný text**: projde ho v aplikaci
(8 obrazovek × světlý a tmavý režim × 1440 a 375 px), na landing page a v okně rozšíření
a spočítá kontrast proti pozadí, které pod textem doopravdy leží – včetně poloprůhledných vrstev
nad sebou a přechodů (u těch bere nejsvětlejší zastávku, tedy nejhorší případ). Odhalí tak i to,
co kontrola tokenů v `qa-desktop.mjs` minout musí: oba tokeny v pořádku, jejich kombinace na
konkrétním místě ne. Vyžaduje Playwright (`PLAYWRIGHT_PATH` nebo globální instalace).

Browserová regresní sada `scripts/qa-desktop.mjs` běží nad dočasným serverem ve **Chromiu i WebKitu**. Vedle tras, custom pickerů, živých aktualizací, mobilních šířek a nulových chyb konzole ověřuje i světlý/tmavý režim: výchozí light, perzistenci dark přes reload, reakci `system` na změnu media preference, dostupné abstraktní avatary a AA kontrast základních textových/semantických tokenů. Screenshoty ukládá do `dist/qa/`.

GitHub CI má samostatnou browserovou bránu s připnutým Playwrightem 1.62.1; neinstaluje se jako runtime závislost produktu. Lokálně lze použít `PLAYWRIGHT_PATH` a `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (absolutní cesta k dostupnému Chromiu/Chromu). V CI se používají prohlížeče dodané Playwrightem. Automatický kontrast a klávesnicové testy jsou dílčí důkaz, nikoli certifikace kompletní shody WCAG; doplňuje je vizuální audit a ověření skutečných nativních integrací.

Regrese interakcí modalu jsou povinné: křížek, klik mimo, Escape a návrat fokusu na spouštěcí tlačítko. Paleta a změna hodnoty custom pickeru se nesmějí testovat jen podle výsledného textu – ověř i to, že při hoveru či změně modelu nedojde k přepsání celého listu/ovládacího pásu a neztratí se fokus.

| Soubor | Pokrývá |
|---|---|
| `test/claude-code.test.mjs` | Parser přepisu: zadání → nástroj → výsledek → konec tahu, deduplikace tokenů, `AskUserQuestion`, limity a čas obnovy, přerušení, systémový kontext, popisy nástrojů, plán úkolů |
| `test/connectors.test.mjs` | Codex (skutečný konektor nad dočasnými soubory: přepis, stav, tokeny, limity, kredity, přechod mezi formáty), Gemini CLI, Copilot VS Code a CLI, Cursor, web (streamovaná odpověď se aktualizuje na místě), rozpoznání procesů |
| `test/spend-alerts-hooks.test.mjs` | Validace výdajů a rozpočtů, opakované platby, převody měn, prognóza, prahy rozpočtu, instalace/odinstalace hooků (zachování nastavení, idempotence, záloha, neplatný JSON), upozornění (rozhodnutí, dokončení, limity, deduplikace), LaunchAgent |
| `test/http.test.mjs` | Snapshot, ochrana Host/CSRF/token, **latence realtime streamu < 2 s**, hook → „potřebuje rozhodnutí“ → upozornění, výdaje a rozpočty přes API, ingest z rozšíření a párování, instalace hooků přes API, nastavení, statické soubory, path traversal |

| `test/projects.test.mjs` | Normalizace a validace projektů, přednost ručního zařazení před složkou (nejdelší shoda, hranice cesty), „mimo projekty“, snímky, mazání, CSV (BOM, uvozovky, ochrana proti vzorcům) |
| `test/launcher.test.mjs` | Nabídka agentů podle instalace, plány pro Claude Code / Codex / web / Ollama, zadání nikdy v příkazu, validace vstupů, lokální chat nad falešnou Ollamou (stream, historie, 409, chyba modelu) |
| `test/license-runs.test.mjs` | Licence (platná, podvržená, cizí klíč, formát, vypršení, tarif), zamykání funkcí, běhy na pozadí (hotovo, selhání, zastavení, chybějící program) |
| `test/projects-launch-http.test.mjs` | Projekty přes API včetně SSE a automatického zařazení, export CSV, spuštění agenta (zkušební režim), 402 bez licence a odemčení licencí, limit projektů, lokální chat, běhy, automatické spouštění, procházení složek |
| `test/tailscale.test.mjs` | Adresy v tailnetu (hranice rozsahu `100.64.0.0/10`), MagicDNS jméno a jeho přednost před adresou, povolené hodnoty hlavičky `Host`, poctivé selhání listeneru na adrese, kterou Mac nemá, a odmítnutí zapnutí bez běžícího Tailscale přes API |
| `test/extension-assets.test.mjs` | Shoda písem a barevných tokenů rozšíření s aplikací, licence písem, maximální váha 500, platnost a determinismus vlastního ZIP balíčku |
| `test/site.test.mjs` | Sestavení webu (landing page v kořeni, rozhraní na `/app`, data živé prohlídky, přepis manifestu a `sw.js`), existence všech odkazovaných souborů, design systém a váhy písma, popisek „Ukázka rozhraní“ u každého panelu, živá prohlídka jen na dívání se snímky jako zálohou |
| `test/ukazka.test.mjs` | Ukázkový režim `/app?ukazka`: posun časů na „teď“, jen čtení ze snímku (zápis 403, žádná síť), hlášení připravenosti jen vlastnímu původu, data označená „UKÁZKA“ a bez cest ze stroje, kde se web sestavuje |
| `test/ucet-web.test.mjs` | Přehled účtu na webu: PKCE v prohlížeči, návratová adresa, souhrny agentů/tokenů/útraty, názvy oken limitů, shoda služeb s aplikací, web do souhrnů jen čte |
| `test/cloud-sync.test.mjs` | Synchronizace souhrnů: tokeny po dnech, útrata po měsících bez poznámek, limity bez hlášek, seznam povolených polí, opt-in, založení a obnova zařízení, vypnutí smaže souhrny, výpadek sítě, HTTP jen z tohoto Macu |
| `test/napojeni.test.mjs` | Napojení modelů tlačítkem proti atrapě `claude`/`codex`: čtení stavu jen z ověřeného výstupu (neznámý = „nevím“), příkaz v uvozovkách, potvrzení po přihlášení, už napojený, vypršení a zrušení, webový chat přes rozšíření, HTTP jen z tohoto Macu |
| `test/extension-overeni.test.mjs` | Ověření webových služeb: diagnostika adaptéru na stránce, anonymizovaný vzorek stránky (bez textu, jmen, odkazů a čísel), přehrání vzorků z `test/fixtures/web/` v minimálním DOM (`test/mini-dom.mjs`) |
| `test/spend-export.test.mjs` | Export útraty do CSV: řádek za platbu v každém měsíci, posun 31. na konec kratšího měsíce, kurz a měna aplikace, zdroj záznamu, součty = obrazovka Útrata, ochrana proti vzorcům, desetinná čárka, HTTP a hlídání počtu měsíců, žádné tlačítko v živé prohlídce |
| `test/ucet.test.mjs` | Účet Agenteeq proti atrapě Supabase Auth: odkaz s PKCE, návrat jen na tento Mac a jen jednou, cizí kód ani chyba z Googlu nikoho nepřihlásí, výpadek sítě není odhlášení, jednorázové obnovovací tokeny, odhlášení a smazání účtu, token nejde zapsat přes API klíčů |
| `test/nastup.test.mjs` | Nástup obrazovky: počítadlo skončí přesně na hodnotě, začíná prázdné, nepřestřelí, řády se usazují zprava, čtečka dostane celé číslo; nástup jednou po otevření a vypnutý omezeným pohybem |

Testy závislé na macOS (`lsof` při převzetí portu, chování `/private/tmp`) se na jiném systému **přeskočí s důvodem**, ne přeskočí tiše a ne spadnou: `npm test` je proto zelený na Macu i na Linuxu.

Pravidla: testy nikdy nečtou skutečné `~/.claude`, `~/.codex` ani `~/.agenteeq` (vždy `AGENTEEQ_SOURCE_HOME` a `AGENTEEQ_HOME` do `os.tmpdir()`), nativní notifikace, Klíčenka a síť jsou vypnuté.

## Ruční QA checklist (před vydáním)

### Dashboard

- [ ] `npm start` → přehled se načte do 3 s, konzole bez chyb.
- [ ] Spusť novou session Claude Code → objeví se v „Dnešní směně“ a v seznamu do 2 s, detail ukazuje přepis a běžící čas.
- [ ] Zapni okamžité události v Nastavení → v nové session požádá Claude o povolení nástroje → do 1 s karta „Potřebuje tvé rozhodnutí“, notifikace macOS, sametový bod ve scéně, číslo v titulku karty.
- [ ] Codex v aplikaci ChatGPT: zadej úlohu → „Pracuje“, po dokončení „Čeká na zadání“; limity v Přehledu odpovídají aplikaci.
- [ ] Útrata: přidej výdaj, nastav rozpočet pod útratu → upozornění 100 %; ukonči předplatné; smaž výdaj.
- [ ] Detail vlákna Codexu → „Otevřít v Codexu“ otevře aplikaci ChatGPT přímo na daném vláknu.
- [ ] Detail session Claude Code → „Pokračovat v Terminálu“ otevře Terminál s `cd <projekt> && claude --resume <id>` (při prvním použití macOS požádá o povolení Automatizace; po odmítnutí se zobrazí návod).
- [ ] „Otevřít složku“ otevře Finder; u webové konverzace „Otevřít konverzaci“ otevře správnou URL.
- [ ] Klávesnice: Tab projde navigaci, ⌘K otevře hledání, Esc zavírá dialogy, šipky ovládají graf.
- [ ] Šířky 1440, 1180, 880 a 375 px: bez vodorovného rolování, spodní navigace na mobilu.
- [ ] `prefers-reduced-motion`: animace vypnuté.
- [ ] V Nastavení přepni Světlý / Tmavý / Podle systému; změna je okamžitá, po restartu zůstane a `Podle systému` zareaguje na změnu macOS bez restartu.
- [ ] Dark mode: běžný text, pomocný text, badge, ovládací prvky, grafy a fokus mají čitelný kontrast; žádná světlá karta nemá světlý text a žádný tmavý povrch tmavý text.

### Přístup z telefonu a Tailscale

- [ ] Nastavení → **Přístup přes Tailscale**: bez nainstalovaného Tailscale je přepínač vypnutý a karta nabízí kroky k instalaci.
- [ ] S přihlášeným Tailscale zapni přepínač → karta ukáže adresu (`jméno.tailnet.ts.net:4620`) a kopírování funguje.
- [ ] Z telefonu ve stejném tailnetu otevři tu adresu → objeví se párovací obrazovka; bez kódu se nenačte nic.
- [ ] Vytvoř kód na Macu, zadej ho na telefonu → přehled se načte a živě se aktualizuje.
- [ ] Zapni k tomu i **Přístup z domácí sítě** a jednu z cest vypni → druhá dál funguje a telefon zůstává spárovaný.
- [ ] Vypni obě → z telefonu se nepřipojí nic a spárovaná zařízení zmizí ze seznamu.
- [ ] Spusť `tailscale serve` → karta ohlásí HTTPS adresu; po `tailscale serve reset` zase ne.

### Web (landing page)

- [ ] `npm run build:site` → `dist/web`, otevři kořen: stránka se načte, konzole bez chyb.
- [ ] `/app` otevře rozhraní aplikace (rozcestník „Kde máš Agenteeq?“, když za ním žádný server není).
- [ ] Šířky 1440 a 375 px bez vodorovného rolování; světlý i tmavý režim; Tab projde všechny odkazy s viditelným fokusem.
- [ ] Tlačítko „Stáhnout pro Mac“ vede na existující vydání na GitHubu.
- [ ] Prohlídka: při dojetí k rámu se Přehled rozsvítí (čísla vyjedou), přepnutí na Projekty a Útratu přehraje jejich nástup; výřez živého rozhraní sedí na snímek; s omezeným pohybem rovnou konečný stav.

### Rozšíření (pro každý web: ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat, GitHub Copilot)

- [ ] Načti `extension/` jako rozbalené, otevři web, pošli zprávu a počkej na odpověď.
- [ ] Během generování je session „Pracuje“, po dokončení „Čeká na zadání“ do 2 s.
- [ ] Session nese jen stav a počty zpráv: žádný přepis, název „<Služba> · konverzace <konec ID>“.
- [ ] Nová konverzace = nová session; přepnutí konverzace nesmíchá počty.
- [ ] Okno rozšíření → **Ověřit tuto stránku**: konverzace podle adresy, pole pro zadání nalezeno,
      počty zpráv odpovídají stránce, „Pracuje → hotovo zachyceno“. Klikni **Sedí**, nebo **Nesedí**.
- [ ] **Uložit vzorek stránky** a vzorek přidej do `test/fixtures/web/` (návod v README tamtéž).
      Potvrzený vzorek je regresní test; až teprve pak smí být služba v `docs/CONNECTORS.md` ✅.

## Protokol ověření – 0.27.0 (25. 9. 2026, Linux kontejner, Node 22.22)

| Kontrola | Výsledek |
|---|---|
| `npm test` | 517 testů, 513 prošlo, 4 přeskočeny s důvodem (2× jen macOS nebo Windows, 2× oprávnění souborů nejde ověřit pod rootem) |
| `npm run check` | 196 souborů bez syntaktické chyby |
| `test/spend-export.test.mjs` | 6 testů exportu útraty; 4 záměrné chyby (předplatné jen jednou, bez ochrany proti vzorcům, desetinná tečka, bez kontroly měsíců) každou zachytí aspoň jeden test |
| Prohlížeč (Chromium) | Útrata → Výdaje → *Export CSV* při 1440 i 375 px, světlý i tmavý režim: tlačítko v záhlaví sekce, nic nepřetéká, klik stáhne `agenteeq-utrata-RRRR-MM-DD.csv` se správnými řádky, konzole čistá |
| Živá prohlídka (`dist/web`, `/app?ukazka#/utrata`) | Tlačítko exportu chybí, tabulka výdajů ukázky se vykreslí, konzole čistá |
| Uživatelské testování (Chromium, 54 kroků) | Nový uživatel: průvodce klávesnicí, prázdná Útrata, první výdaj přes vlastní nabídky, odmítnutí prázdné částky s hláškou, Esc, rozpočet, export CSV, Nastavení. Aktivní uživatel (ukázková scéna): 8 obrazovek × 1440/375 px × světlý/tmavý – nic nepřetéká, každý ovládací prvek má název, konzole čistá; detail agenta s rozhodnutím, export projektu, paleta ⌘K → Přidat výdaj. Web: landing page a živá prohlídka 1440/375 světle i tmavě, `/app?ucet`, rozcestník |
| Nálezy a opravy | Vybraná položka nabídky měla pro čtečku název s fajfkou (opraveno, hlídá `qa:desktop` – bez opravy selže). Nabídky a kalendář v modálním okně nově uvnitř okna (preventivně pro WebKit/VoiceOver; v Chromiu se chyba neprojevila). Odmítnutí prázdné částky zapíše do konzole zamítnutý požadavek 422 – je to očekávaná validace serveru, ne chyba skriptu |
| **Neověřeno** | Otevření souboru v Excelu a Numbers na Macu (formát ověřený testem: středník, desetinná čárka, BOM); nabídky a kalendář ve WebKitu a s VoiceOverem (WebKit prověří CI v `qa:desktop`) |

## Protokol ověření – 0.26.0 (24. 9. 2026, Linux kontejner, Node 22.22)

Webové služby jsou z tohoto prostředí nedostupné (síťová pravidla), takže živé stránky ověří
až uživatel oknem rozšíření. Tady se ověřilo všechno kolem:

| Kontrola | Výsledek |
|---|---|
| `npm test` | 510 testů, 506 prošlo, 4 přeskočeny s důvodem (2× jen macOS nebo Windows, 2× oprávnění souborů nejde ověřit pod rootem) |
| `npm run check` | 194 souborů bez syntaktické chyby |
| `test/extension-overeni.test.mjs` | Diagnostika (přesně / obecná záloha / nenalezeno), řádky ověření nesou stav větou, vzorek bez textu, jmen, odkazů, skriptů, hodnot polí a čísel, cesta s dotazem → `x-id`, skryté pole a hláška o limitu, zkrácení obří stránky, přehrání vzorku = živá diagnostika |
| Mutace | 6 záměrných chyb ve vzorku a diagnostice – každou zachytí aspoň jeden test |
| Chromium × mini-DOM | 6 syntetických stránek (ChatGPT, Claude, Gemini, Grok, Perplexity, Qwen): diagnostika ve skutečném Chromiu = diagnostika přehraného vzorku, vzorek bez textu stránky |
| `qa:extension` (Chromium) | 14 scénářů okna, nově ověření ve světlém i tmavém režimu: karta jen na podporované stránce, rozbalení klávesnicí, okno ≤ 600 px i rozbalené, potvrzení, stažený vzorek má správný tvar a jméno. WebKit v prostředí chybí |
| `qa:contrast` | WCAG 2.2 AA i pro rozbalené ověření se všemi tóny, světlý i tmavý režim |
| **Neověřeno** | Skutečné stránky osmi služeb – čeká na vzorky z Macu |

## Protokol ověření – 0.25.0 (24. 9. 2026, Linux kontejner, Node 22.22)

Mimo macOS: skutečné přihlášení u Googlu, `claude auth login` / `codex login` v Terminálu a
Klíčenka se tu ověřit nedají – testy běží proti atrapám a na Macu je potvrdí ruční QA níž.

| Kontrola | Výsledek |
|---|---|
| `npm test` | 497 testů, 493 prošlo, 4 přeskočeny s důvodem (2× jen macOS nebo Windows, 2× oprávnění souborů nejde ověřit pod rootem) |
| `npm run check` | 189 souborů bez syntaktické chyby |
| `qa:contrast`, `qa:desktop` | WCAG 2.2 AA v aplikaci, na webu i v okně rozšíření; desktopové trasy bez chyb |
| Cloudová databáze | `supabase/tests/rls.sql` 15/15; upsert souhrnů přes RLS ověřen v transakci vrácené zpět |

- [ ] Na Macu: Nastavení → Účet a vzhled → Přihlásit se přes Google → okno Agenteeq se vrátí a potvrdí přihlášení; po restartu aplikace zůstane přihlášení (Klíčenka).
- [ ] Na Macu: Napojené modely → Napojit u Claude Code i Codexu → Terminál, prohlížeč dodavatele, potvrzení s plánem.
- [ ] Web: `/app?ucet` → Přihlásit se přes Google → přehled s daty z Maců; Odhlásit se → zpět na přihlášení; bez synchronizace vysvětlení, kde ji zapnout.
- [ ] Synchronizace souhrnů: zapnout, „Co přesně posíláme“ odpovídá tomu, co je v tabulkách Supabase; vypnout → souhrny z účtu zmizí.

## Protokol ověření – 0.12.0 (15. 9. 2026, Linux kontejner, Node 22.22)

Tohle vydání vzniklo mimo macOS, takže se rozpadá na dvě části: co šlo doložit tady a co musí
potvrdit Mac. Nic z druhé skupiny se nevydává za ověřené.

| Kontrola | Výsledek |
|---|---|
| `npm test` | 439 testů, 438 prošlo, 1 přeskočen s důvodem (vyžaduje macOS) |
| `npm run check` | 136 souborů bez syntaktické chyby |
| `npm run build:extension` | `dist/agenteeq-extension-0.12.0.zip`, 18 souborů, 179 kB; rozbalení ověřeno |
| `npm run build:site` | `dist/web`, 71 souborů; landing page v kořeni, rozhraní na `/app` |
| Landing page v Chromiu | 1440 px a 375 px, světlý i tmavý režim: konzole bez chyb, žádné vodorovné rolování |
| Kontrast WCAG 2.2 AA (landing page) | Všechny texty splňují AA – měřeno nad vykreslenou stránkou (1440 px light/dark, 375 px light/dark) |
| Kontrast WCAG 2.2 AA (okno rozšíření) | Všechny texty splňují AA – 344 px, světlý i tmavý režim, spárované i nespárované |
| `npm run smoke` | Balíček 0.12.0 (132 souborů, 744 kB) se nainstaluje a běží; písma rozšíření jsou v balíčku |
| Ochrana proti DNS rebindingu a proxy | Požadavek přeposlaný proxy z tohoto Macu nedostane práva desktopové aplikace: PIN, přepínače ani `/api/launch` se za ním nevydají (`test/tailscale.test.mjs`) |
| `npm run qa:contrast` (aplikace) | Všech 8 obrazovek × světlý/tmavý × 1440/375 px splňuje AA. Nalezena a opravena skutečná chyba: odznak „Ověřeno“ 4,45:1 → token `--ok` ztmaven na `#0B6F5F` |
| Tailscale: jednotky a HTTP | Detekce adres, MagicDNS, `Host`, selhání listeneru a odmítnutí zapnutí bez tailnetu (`test/tailscale.test.mjs`) |

**Zbývá ověřit na macOS** (`npm run release:mac`): build `.app` (swiftc, codesign, notarizace),
výměna aplikace v `/Applications`, nativní oznámení, Klíčenka, převzetí portu po starší verzi,
ruční QA checklist výše – zvlášť část „Přístup z telefonu a Tailscale“ proti živému tailnetu.

## Protokol ověření – 0.6.0 (12. 9. 2026, macOS, Node 24.18)

Ruční QA na oddělené instanci (port 4621, `AGENTEEQ_HOME` v dočasné složce, `AGENTEEQ_OPEN=dry`); skutečná data aplikace zůstala nedotčená.

| Oblast | Výsledek |
|---|---|
| `npm test` (140), `npm run check` (98 souborů) | ✅ |
| Tokeny proti ručnímu přepočtu ze souborů: Codex 6 139 058 = 6 139 058; Claude Code 11 225 911 vs 11 218 348 (0,07 %, hranice hodinových přihrádek) | ✅ |
| Rozpady podle aplikace, složky a modelu i heatmapa sedí na součet období do posledního tokenu | ✅ |
| Pomocní agenti Claude Code: 6 vláken z `subagents/`, navázaná na rodiče, 1 133 552 tokenů, název z popisu úlohy | ✅ |
| Kredity Codexu: zůstatek 5,314314 = surová data; 7 dokoupení od 12. 7. s částkami shodnými se skoky v datech | ✅ |
| Limity: jeden měřák na limit (přesná data ze stavového řádku vytlačí záložní historii) | ✅ |
| Vlastní agenti: veřejná adresa, 169.254.169.254, 0.0.0.0 i jméno s heslem odmítnuty; přesměrování se nenásleduje (ověřeno proti skutečnému serveru); ComfyUI na 127.0.0.1:8188 hlásí frontu | ✅ |
| Kontrast textu: 8 obrazovek × světlý a tmavý režim, žádné podkročení WCAG 2.2 AA | ✅ |
| Mobil 375 px: 8 obrazovek bez vodorovného rolování, žádný dotykový cíl pod 24 × 24 px | ✅ |
| Desktop 1440 px po mobilních opravách bez změny | ✅ |
| Fokus klávesnicí: viditelný obrys 2 px (ověřeno skutečným Tabem, ne programovým focusem) | ✅ |
| Bezpečnost: zápis bez hlavičky `X-Agenteeq` → 403, datová složka 0700, `data.json` 0600, procházení složek uzamčené do domovského adresáře | ✅ |
| **Neověřeno** | Skutečné spuštění agentů z UI na reálném projektu; rozšíření prohlížeče na živých webech; konektory Cursor / Copilot / Gemini / Qwen bez dat na tomto Macu |

## Protokol ověření – v0.5.0 (11. 9. 2026, macOS, Node 24.18)

Ruční QA běželo na **oddělené instanci** (port 4630, `AGENTEEQ_HOME` v dočasné složce, `AGENTEEQ_OPEN=dry`) nad skutečnými přepisy – skutečná data aplikace zůstala nedotčená a nic se reálně nespustilo.

| Oblast | Výsledek |
|---|---|
| `npm test` (63), `npm run check` (70 souborů), `npm run smoke` (79 souborů, 156 kB) | ✅ |
| Projekty: prázdný stav, návrhy ze složek (bez pracovních složek aplikace Codex), nový projekt s výběrem složky v prohlížeči složek, detail, přidání 3 konverzací s hledáním, brief se uloží sám, export CSV (200, správný název souboru) | ✅ 1440 px |
| Agenti: filtr projektu s počty, výběr, hromadné zařazení do nového projektu z dialogu | ✅ 1440 px |
| Detail agenta: karta projektu („Zařazeno ručně“) | ✅ |
| Přehled: Spustit agenta – Codex na pozadí v projektu se sandboxem, složka z projektu, toast zkušebního režimu, vyčištění zadání | ✅ |
| Mobil 375 px: Přehled, Projekty, detail projektu, Agenti – bez vodorovného rolování | ✅ |
| Konzole prohlížeče | ✅ bez chyb |
| **Neověřeno živě:** skutečné spuštění Claude Code/Codexu v Terminálu a na pozadí (spotřebovalo by limity), Gemini/Qwen CLI (nejsou nainstalované), Ollama (není nainstalovaná; testováno proti falešnému serveru), předvyplnění `?q=` u webových služeb, instalace LaunchAgentu z UI, přetažení myší (logika drop ověřena, nativní drag v náhledu ne) | 🧪 |

## Protokol ověření – v0.3.0 (10. 9. 2026, macOS, Node 24.18)

| Ověření | Výsledek |
|---|---|
| `npm test` | 37/37 prošlo (nově `test/openers.test.mjs` + otevření přes HTTP API v režimu `dry`) |
| `npm run check` | 50 souborů bez chyby |
| Skutečná data | 82 sessions za 1 369 ms |
| Loga | 16 log na přehledu načteno, žádné rozbité |
| Nabídka otevření | Codex vlákno → „Otevřít v Codexu“ + „Otevřít složku“ (Codex CLI není v PATH, proto bez Terminálu); Claude Code → „Otevřít Claude“ + „Pokračovat v Terminálu“ + „Otevřít složku“; neplatný cíl → 422 |
| Vzhled | Scéna s notovou osnovou, nová paleta, tmavá hlavní karta; desktop 1440 px a mobil 375 px bez vodorovného rolování |
| **Neověřeno** | Skutečné spuštění akcí otevření na tomto Macu (záměrně nespuštěno automaticky – přebírá fokus a u Claude by v Terminálu obnovilo právě běžící session); ověřit ručně podle checklistu: otevřít Codex vlákno, Terminál s `claude --resume`, složku ve Finderu |

## Protokol ověření – v0.2.0 (10. 9. 2026, macOS, Node 24.18)

| Ověření | Výsledek |
|---|---|
| `npm test` | 32/32 prošlo (≈0,7 s) |
| Nalezená a opravená chyba při ověření | Falešné upozornění „dokončil úlohu“, když Claude Code > 3 min generoval bez zápisu do přepisu. Oprava: „pracuje“ drží do explicitního konce tahu (max 30 min), nečinnost bez konce tahu nikdy nehlásí dokončení; pokryto testy |
| `npm run check` | 48 souborů bez chyby |
| Latence streamu (automatický test) | nový řádek přepisu → SSE událost pod 2 s (celý test 111 ms) |
| Skutečná data vývojového Macu | 82 sessions (Claude Code 4, Codex 78) načteno za 1 314 ms; živá session „Pracuje“ s aktuálním nástrojem, počtem kroků a časem tahu; limity a historie kreditů Codexu; 4 běžící AI aplikace |
| Obrazovky v prohlížeči | Přehled, Agenti, Detail agenta (266 položek přepisu), Statistiky, Útrata (validace formuláře, fokus na chybné pole), Nastavení, paleta ⌘K, panel upozornění – konzole bez chyb |
| Mobil 375 px | bez vodorovného rolování |
| **Neověřeno** | rozšíření na živých webech, Cursor s aktivním agentem, Copilot CLI / VS Code / Gemini CLI / Qwen Code s reálnými daty, Admin API s klíči, instalace hooků do skutečného `~/.claude/settings.json` (ověřeno jen v dočasném HOME), LaunchAgent (ověřen jen vygenerovaný plist) |
