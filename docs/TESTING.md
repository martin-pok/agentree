# Testování a ověření

## Automatické testy

```bash
npm test         # node:test, sériově, bez sítě, nad dočasnými fixturami
npm run check    # node --check pro všechny .js/.mjs
npm run smoke    # balíček: pack → instalace do dočasného prefixu → start s dočasnými složkami → API a statické soubory
```

Browserová regresní sada `scripts/qa-desktop.mjs` běží nad dočasným serverem ve **Chromiu i WebKitu**. Vedle tras, custom pickerů, živých aktualizací, mobilních šířek a nulových chyb konzole ověřuje i světlý/tmavý režim: výchozí light, perzistenci dark přes reload, reakci `system` na změnu media preference, 24 abstraktních avatarů a AA kontrast základních textových/semantických tokenů. Screenshoty ukládá do `dist/qa/`.

Regrese interakcí modalu jsou povinné: křížek, klik mimo, Escape a návrat fokusu na spouštěcí tlačítko. Paleta a změna hodnoty custom pickeru se nesmějí testovat jen podle výsledného textu — ověř i to, že při hoveru či změně modelu nedojde k přepsání celého listu/ovládacího pásu a neztratí se fokus.

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

Pravidla: testy nikdy nečtou skutečné `~/.claude`, `~/.codex` ani `~/.agentree` (vždy `AGENTREE_SOURCE_HOME` a `AGENTREE_HOME` do `os.tmpdir()`), nativní notifikace, Klíčenka a síť jsou vypnuté.

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

### Rozšíření (pro každý web: ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat, GitHub Copilot)

- [ ] Načti `extension/` jako rozbalené, otevři web, pošli zprávu.
- [ ] Během generování je session „Pracuje“, po dokončení „Čeká na zadání“ do 2 s.
- [ ] Přepis obsahuje obě strany bez duplicit; titulek odpovídá konverzaci.
- [ ] Nová konverzace = nová session; přepnutí konverzace nesmíchá přepisy.
- [ ] Při nefunkčním adaptéru ulož HTML úryvek zprávy a tlačítka Stop jako fixturu a oprav selektory v `extension/sites.js`.

## Protokol ověření — 0.6.0 (12. 9. 2026, macOS, Node 24.18)

Ruční QA na oddělené instanci (port 4621, `AGENTREE_HOME` v dočasné složce, `AGENTREE_OPEN=dry`); skutečná data aplikace zůstala nedotčená.

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
| Bezpečnost: zápis bez hlavičky `X-Agentree` → 403, datová složka 0700, `data.json` 0600, procházení složek uzamčené do domovského adresáře | ✅ |
| **Neověřeno** | Skutečné spuštění agentů z UI na reálném projektu; rozšíření prohlížeče na živých webech; konektory Cursor / Copilot / Gemini / Qwen bez dat na tomto Macu |

## Protokol ověření — v0.5.0 (11. 9. 2026, macOS, Node 24.18)

Ruční QA běželo na **oddělené instanci** (port 4630, `AGENTREE_HOME` v dočasné složce, `AGENTREE_OPEN=dry`) nad skutečnými přepisy — skutečná data aplikace zůstala nedotčená a nic se reálně nespustilo.

| Oblast | Výsledek |
|---|---|
| `npm test` (63), `npm run check` (70 souborů), `npm run smoke` (79 souborů, 156 kB) | ✅ |
| Projekty: prázdný stav, návrhy ze složek (bez pracovních složek aplikace Codex), nový projekt s výběrem složky v prohlížeči složek, detail, přidání 3 konverzací s hledáním, brief se uloží sám, export CSV (200, správný název souboru) | ✅ 1440 px |
| Agenti: filtr projektu s počty, výběr, hromadné zařazení do nového projektu z dialogu | ✅ 1440 px |
| Detail agenta: karta projektu („Zařazeno ručně“) | ✅ |
| Přehled: Spustit agenta — Codex na pozadí v projektu se sandboxem, složka z projektu, toast zkušebního režimu, vyčištění zadání | ✅ |
| Mobil 375 px: Přehled, Projekty, detail projektu, Agenti — bez vodorovného rolování | ✅ |
| Konzole prohlížeče | ✅ bez chyb |
| **Neověřeno živě:** skutečné spuštění Claude Code/Codexu v Terminálu a na pozadí (spotřebovalo by limity), Gemini/Qwen CLI (nejsou nainstalované), Ollama (není nainstalovaná; testováno proti falešnému serveru), předvyplnění `?q=` u webových služeb, instalace LaunchAgentu z UI, přetažení myší (logika drop ověřena, nativní drag v náhledu ne) | 🧪 |

## Protokol ověření — v0.3.0 (10. 9. 2026, macOS, Node 24.18)

| Ověření | Výsledek |
|---|---|
| `npm test` | 37/37 prošlo (nově `test/openers.test.mjs` + otevření přes HTTP API v režimu `dry`) |
| `npm run check` | 50 souborů bez chyby |
| Skutečná data | 82 sessions za 1 369 ms |
| Loga | 16 log na přehledu načteno, žádné rozbité |
| Nabídka otevření | Codex vlákno → „Otevřít v Codexu“ + „Otevřít složku“ (Codex CLI není v PATH, proto bez Terminálu); Claude Code → „Otevřít Claude“ + „Pokračovat v Terminálu“ + „Otevřít složku“; neplatný cíl → 422 |
| Vzhled | Scéna s notovou osnovou, nová paleta, tmavá hlavní karta; desktop 1440 px a mobil 375 px bez vodorovného rolování |
| **Neověřeno** | Skutečné spuštění akcí otevření na tomto Macu (záměrně nespuštěno automaticky — přebírá fokus a u Claude by v Terminálu obnovilo právě běžící session); ověřit ručně podle checklistu: otevřít Codex vlákno, Terminál s `claude --resume`, složku ve Finderu |

## Protokol ověření — v0.2.0 (10. 9. 2026, macOS, Node 24.18)

| Ověření | Výsledek |
|---|---|
| `npm test` | 32/32 prošlo (≈0,7 s) |
| Nalezená a opravená chyba při ověření | Falešné upozornění „dokončil úlohu“, když Claude Code > 3 min generoval bez zápisu do přepisu. Oprava: „pracuje“ drží do explicitního konce tahu (max 30 min), nečinnost bez konce tahu nikdy nehlásí dokončení; pokryto testy |
| `npm run check` | 48 souborů bez chyby |
| Latence streamu (automatický test) | nový řádek přepisu → SSE událost pod 2 s (celý test 111 ms) |
| Skutečná data vývojového Macu | 82 sessions (Claude Code 4, Codex 78) načteno za 1 314 ms; živá session „Pracuje“ s aktuálním nástrojem, počtem kroků a časem tahu; limity a historie kreditů Codexu; 4 běžící AI aplikace |
| Obrazovky v prohlížeči | Přehled, Agenti, Detail agenta (266 položek přepisu), Statistiky, Útrata (validace formuláře, fokus na chybné pole), Nastavení, paleta ⌘K, panel upozornění — konzole bez chyb |
| Mobil 375 px | bez vodorovného rolování |
| **Neověřeno** | rozšíření na živých webech, Cursor s aktivním agentem, Copilot CLI / VS Code / Gemini CLI / Qwen Code s reálnými daty, Admin API s klíči, instalace hooků do skutečného `~/.claude/settings.json` (ověřeno jen v dočasném HOME), LaunchAgent (ověřen jen vygenerovaný plist) |
