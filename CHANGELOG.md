# Changelog

## 0.5.0 — 2026-09-11

### Přidáno
- **Projekty:** konverzace ze všech služeb seřazené podle klientů a zakázek. Automatické zařazení podle složky (nejdelší shoda, i podsložky), ruční zařazení libovolné konverzace včetně webových chatů, „mimo projekty“, přetažení řádku na projekt, hromadný výběr v Agentech, filtr podle projektu. Detail projektu: KPI, stav a tokeny, brief s automatickým ukládáním, složky, tokeny podle služby, archiv, export do CSV (Excel/Numbers, ochrana proti vzorcům). Konverzace zůstávají v projektu i po vypadnutí z 30denního okna (snímky). Návrhy projektů ze složek, kde agenti pracují.
- **Spustit agenta** v Přehledu: Claude Code (Terminál s ID session, pozadí s oprávněním), Codex (aplikace s předvyplněným zadáním, Terminál, pozadí se sandboxem), Gemini CLI a Qwen Code (Terminál), webové služby (zadání v odkazu i ve schránce), lokální modely v Ollamě s odpovědí přímo v Agentree. Volba projektu a složky (vestavěný prohlížeč složek), připojení briefu, přehled běhů na pozadí s logem a zastavením. Zadání nikdy není součástí příkazu (soubor 0600 / argv).
- **Licence:** offline Ed25519 klíče (`scripts/license.mjs`), tarify Zdarma / Pro / Team, připravené zamykání funkcí (`PAID_FEATURES`, dnes vše odemčené), sekce Licence v Nastavení.
- **Sdílení a instalace pro další uživatele:** `npm run pack`, `npm run smoke` (ověří nainstalovaný balíček), `agentree --open`, návod `docs/INSTALL.md`, sekce v Nastavení.
- Průvodce prvním nastavením v Přehledu, automatické spouštění po přihlášení zapínatelné z Nastavení, ⌘K: projekty, „Spustit agenta“, „Nový projekt“.

### Změněno
- **Mobilní navigace:** spodní lišta má 5 cílů (Přehled, Agenti, Spustit agenta, Projekty, Více) místo 7; Statistiky, Útrata, Upozornění a Nastavení jsou v panelu Více (s počtem nepřečtených upozornění). Větší dotykové plochy a respektování bezpečné zóny iPhonu.
- Mobil: opraveno přetékání návodu v Nastavení, lámání nadpisů karet, cesty ke složce a řádků konverzací v detailu projektu.
- LaunchAgent restartuje Agentree jen po pádu; když už Agentree běží, druhá instance se v klidu ukončí.
- Příkaz pro automatické spouštění se v Nastavení skládá podle skutečné instalace (dřív pevná cesta `~/agentree`).

## 0.4.0 — 2026-09-10

### Změněno
- **Nový název Agentree** v celém projektu: aplikace, rozšíření, CLI (`bin/agentree.mjs`), balíček, proměnné prostředí (`AGENTREE_*`), hlavičky API (`X-Agentree`, `X-Agentree-Token`), LaunchAgent `cz.agentree.agent`, Klíčenka `cz.agentree.*`, složka projektu a repozitář.
- **Nové logo:** mosazný kořen (ty) a tři uzly agentů spojené větvemi; favicon a značka v rozšíření.
- Ze scény v hlavičce odstraněny linky a zlatá křivka; body aktivních agentů zůstávají.

### Migrace
- Data aplikace se ukládají do `~/.agentree`. Při prvním spuštění se `~/.dirigent/data.json` jednou zkopíruje (upozornění, výdaje, rozpočty, nastavení, token); původní soubor zůstane beze změny.

## 0.3.0 — 2026-09-10

### Přidáno
- **Otevřít v aplikaci:** vlákno Codexu přímo v aplikaci ChatGPT (`codex://threads/<id>`), aplikace Claude, projekt v Cursoru a VS Code, webová konverzace v prohlížeči. **Pokračovat v Terminálu** otevře Terminál s `claude --resume <id>` (resp. `codex resume`, `copilot --resume`, pokud je CLI v PATH). **Otevřít složku** ve Finderu. Nabídku akcí počítá server podle nainstalovaných aplikací.
- Oficiální loga služeb (Claude, Codex, ChatGPT, Gemini, GitHub Copilot, Microsoft Copilot, Perplexity, Grok, Qwen, Cursor, Ollama, LM Studio) z `@lobehub/icons-static-svg` 1.95.0 (MIT).
- Vlastní vizuální identita „koncertní sál“: ebenová scéna s notovou osnovou (každý aktivní agent je nota — smaragdová pracuje, sametová potřebuje tebe), tmavá hlavní karta, mosazné akcenty, jemná zrnitost.

### Změněno
- Paleta: samet `#C2335A`, smaragd `#22A38C`, mosaz `#C99A3E`, eben `#121019`, mlžná slonovina `#F4F3F7`; barvy poskytovatelů podle jejich značek.
- Kopírování příkazu je jen doplňková ikona; hlavní akcí je otevření.

## 0.2.0 — 2026-09-10

První verze k reálnému testování.

### Přidáno
- Realtime architektura: souborové watchery s inkrementálním čtením, SSE stream, přehodnocení stavů každých 5 s, pojistný průchod každých 10 s.
- Konektory: Claude Code / Claude Desktop Code, Codex (ChatGPT app, CLI, VS Code; názvy vláken z aplikace), Cursor, GitHub Copilot ve VS Code a CLI, Gemini CLI, Qwen Code, procesy AI aplikací a Ollama, náklady z Admin API OpenAI a Anthropic.
- Claude Code hooky pro okamžité události (instalace ze Nastavení, záloha, odinstalace).
- Rozšíření Chrome pro ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat a GitHub Copilot (beta).
- Upozornění: potřebuje rozhodnutí, limity (80/95/100 %), rozpočty (80/100 %), dokončené dlouhé úlohy; notifikace macOS a prohlížeče; centrum upozornění.
- Útrata: výdaje, opakované platby, rozpočty, prognóza, převody měn, historie kreditů Codexu.
- Obrazovky: Přehled s „Dnešní směnou“, Agenti, Detail agenta s živým přepisem, Statistiky (heatmapa, podíly, projekty, modely, limity), Útrata, Upozornění, Nastavení.
- Automatický start po přihlášení (`install-agent`).
- 32 automatických testů, dokumentace pro agentický vývoj.

### Opraveno (během ověření)
- Falešné upozornění „dokončil úlohu“ při dlouhém generování bez zápisu do přepisu.
- Projekt session se měnil podle `cd` během práce agenta — nyní platí složka, ve které session začala.
- Počet u konektorů odpovídá viditelným sessions, ne počtu souborů na disku.

### Změněno
- Prototyp v0.1 (jediný `server.mjs` a ukázková data) nahrazen modulární architekturou; ukázková data odstraněna.

## 0.1.0 — 2026-09-10

- Klikatelný prototyp: přehled, seznam agentů, spotřeba, konektory; lokální čtení Claude Code a Codexu; ukázková data.
