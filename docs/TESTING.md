# Testování a ověření

## Automatické testy

```bash
npm test         # node:test, sériově, bez sítě, nad dočasnými fixturami
npm run check    # node --check pro všechny .js/.mjs
```

| Soubor | Pokrývá |
|---|---|
| `test/claude-code.test.mjs` | Parser přepisu: zadání → nástroj → výsledek → konec tahu, deduplikace tokenů, `AskUserQuestion`, limity a čas obnovy, přerušení, systémový kontext, popisy nástrojů, plán úkolů |
| `test/connectors.test.mjs` | Codex (skutečný konektor nad dočasnými soubory: přepis, stav, tokeny, limity, kredity, přechod mezi formáty), Gemini CLI, Copilot VS Code a CLI, Cursor, web (streamovaná odpověď se aktualizuje na místě), rozpoznání procesů |
| `test/spend-alerts-hooks.test.mjs` | Validace výdajů a rozpočtů, opakované platby, převody měn, prognóza, prahy rozpočtu, instalace/odinstalace hooků (zachování nastavení, idempotence, záloha, neplatný JSON), upozornění (rozhodnutí, dokončení, limity, deduplikace), LaunchAgent |
| `test/http.test.mjs` | Snapshot, ochrana Host/CSRF/token, **latence realtime streamu < 2 s**, hook → „potřebuje rozhodnutí“ → upozornění, výdaje a rozpočty přes API, ingest z rozšíření a párování, instalace hooků přes API, nastavení, statické soubory, path traversal |

Pravidla: testy nikdy nečtou skutečné `~/.claude`, `~/.codex` ani `~/.dirigent` (vždy `DIRIGENT_SOURCE_HOME` a `DIRIGENT_HOME` do `os.tmpdir()`), nativní notifikace, Klíčenka a síť jsou vypnuté.

## Ruční QA checklist (před vydáním)

### Dashboard

- [ ] `npm start` → přehled se načte do 3 s, konzole bez chyb.
- [ ] Spusť novou session Claude Code → objeví se v „Dnešní směně“ a v seznamu do 2 s, detail ukazuje přepis a běžící čas.
- [ ] Zapni okamžité události v Nastavení → v nové session požádá Claude o povolení nástroje → do 1 s karta „Potřebuje tvé rozhodnutí“, notifikace macOS, korálová světla v pásu, číslo v titulku karty.
- [ ] Codex v aplikaci ChatGPT: zadej úlohu → „Pracuje“, po dokončení „Čeká na zadání“; limity v Přehledu odpovídají aplikaci.
- [ ] Útrata: přidej výdaj, nastav rozpočet pod útratu → upozornění 100 %; ukonči předplatné; smaž výdaj.
- [ ] Detail vlákna Codexu → „Otevřít v Codexu“ otevře aplikaci ChatGPT přímo na daném vláknu.
- [ ] Detail session Claude Code → „Pokračovat v Terminálu“ otevře Terminál s `cd <projekt> && claude --resume <id>` (při prvním použití macOS požádá o povolení Automatizace; po odmítnutí se zobrazí návod).
- [ ] „Otevřít složku“ otevře Finder; u webové konverzace „Otevřít konverzaci“ otevře správnou URL.
- [ ] Klávesnice: Tab projde navigaci, ⌘K otevře hledání, Esc zavírá dialogy, šipky ovládají graf.
- [ ] Šířky 1440, 1180, 880 a 375 px: bez vodorovného rolování, spodní navigace na mobilu.
- [ ] `prefers-reduced-motion`: animace vypnuté.

### Rozšíření (pro každý web: ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat, GitHub Copilot)

- [ ] Načti `extension/` jako rozbalené, otevři web, pošli zprávu.
- [ ] Během generování je session „Pracuje“, po dokončení „Čeká na zadání“ do 2 s.
- [ ] Přepis obsahuje obě strany bez duplicit; titulek odpovídá konverzaci.
- [ ] Nová konverzace = nová session; přepnutí konverzace nesmíchá přepisy.
- [ ] Při nefunkčním adaptéru ulož HTML úryvek zprávy a tlačítka Stop jako fixturu a oprav selektory v `extension/sites.js`.

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
