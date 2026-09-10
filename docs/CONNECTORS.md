# Podpora služeb a konektory

Tento dokument je **poctivý zdroj pravdy** o tom, co Dirigent umí u které služby. Legenda:

- ✅ ověřeno na skutečných datech,
- 🧪 beta — implementováno podle formátu, ale neověřeno na živých datech,
- ⚠️ heuristika (odvozeno, může se mýlit),
- ❌ nelze bez podpory dodavatele.

## Matice podpory (v0.2.0)

| Služba | Zdroj | Registrace spuštění | Živý přepis | Průběh úlohy | Potřebuje rozhodnutí | Limity | Útrata |
|---|---|---|---|---|---|---|---|
| **Claude Code** (CLI i Claude Desktop → Code) | přepisy + hooky | ✅ do 2 s, s hooky okamžitě | ✅ | ✅ kroky a čas tahu; plán úkolů 🧪 (TodoWrite) | ✅ otázka, schválení plánu; ✅ povolení nástroje jen s hooky | ✅ z hlášky „hit your … limit“ | ruční zápis |
| **Codex** (ChatGPT app, CLI, VS Code) | `~/.codex/sessions` | ✅ | ✅ | ✅ kroky a čas tahu; plán 🧪 (`update_plan`) | ❌ Codex žádosti o schválení do souborů nezapisuje | ✅ % limitu 5 h / týden, čas obnovy, ✅ zůstatek kreditů | ruční zápis |
| **ChatGPT** (web) | rozšíření | 🧪 | 🧪 | ⚠️ generuje / hotovo | ❌ | 🧪 hláška limitu na stránce | ruční zápis |
| **Claude.ai** (web) | rozšíření | 🧪 | 🧪 | ⚠️ generuje / hotovo | ❌ | 🧪 | ruční zápis |
| **GitHub Copilot** | VS Code chaty 🧪, Copilot CLI 🧪, github.com/copilot 🧪 | 🧪 | 🧪 | ⚠️ | ❌ (VS Code), ❌ CLI | ❌ | ruční zápis |
| **Microsoft Copilot** | web přes rozšíření 🧪; desktopová aplikace jen jako proces ✅ | 🧪 web | 🧪 web, ❌ aplikace | ⚠️ web | ❌ | 🧪 web | ruční zápis |
| **Gemini** | web 🧪, Gemini CLI 🧪 | 🧪 | 🧪 | ⚠️ | ❌ | 🧪 web | ruční zápis |
| **Perplexity** | web přes rozšíření | 🧪 | 🧪 | ⚠️ | ❌ | 🧪 | ruční zápis |
| **Grok** | web přes rozšíření | 🧪 | 🧪 | ⚠️ | ❌ | 🧪 | ruční zápis |
| **Qwen** | Qwen Chat web 🧪, Qwen Code CLI 🧪 | 🧪 | 🧪 | ⚠️ | ❌ | 🧪 web | ruční zápis |
| **Cursor** | SQLite `state.vscdb` | 🧪 (formát ✅, bez aktivních agentů) | 🧪 | ✅ plán úkolů z `todos` 🧪 | 🧪 `hasBlockingPendingActions` | ❌ | ruční zápis |
| **OpenAI / Anthropic API** | Admin API | — | — | — | — | — | 🧪 automaticky |
| AI aplikace na Macu | `ps`, Ollama API | ✅ procesy | — | — | — | — | — |

### Proč některé věci nejdou

- **Předplatné a extra usage** (ChatGPT, Claude, Gemini, Perplexity, Grok, Qwen, Copilot): žádná z těchto služeb neposkytuje veřejné API pro útratu jednotlivce. Dirigent proto nabízí ruční zápis s rozpočty. Výjimka: zůstatek kreditů Codexu, který Codex sám zapisuje do sessions.
- **Schválení akce na dálku**: Dirigent umí upozornit a otevřít konverzaci nebo zkopírovat příkaz, ale nástroje nemají bezpečné API pro vzdálené schválení. Nepoužíváme simulaci kláves.
- **Desktopová aplikace Microsoft Copilot a ChatGPT (chat)**: obsah konverzací není dostupný v čitelném lokálním formátu. Web s rozšířením ano.
- **Webové aplikace nesdílejí tokeny** — grafy tokenů je proto neobsahují.

## Konektory v detailu

### Claude Code — `src/connectors/claude-code.js` ✅

- **Zdroj:** `~/.claude/projects/<projekt>/<session-id>.jsonl` (hloubka 1). Claude Desktop → Code zapisuje stejný formát s `entrypoint: "claude-desktop"`.
- **Použitá pole:** `type` (`user`, `assistant`, `custom-title`, `ai-title`, `summary`), `timestamp`, `cwd` (první = projekt), `gitBranch`, `message.model`, `message.content[]` (`text`, `tool_use`, `tool_result`), `message.stop_reason` (`end_turn`/`stop_sequence` = konec tahu, `tool_use` = pokračuje), `message.usage` (deduplikace podle `message.id`, poslední záznam vyhrává), `isApiErrorMessage` (limity), `isSidechain` (subagenti), `isMeta`.
- **Potřebuje rozhodnutí:** `AskUserQuestion` bez výsledku, `ExitPlanMode` bez výsledku; s hooky `Notification` typu `permission_prompt` / `elicitation_dialog`.
- **Limity:** text chyby API odpovídající `LIMIT_RE`, čas obnovy z „resets 1am“ (místní časová zóna).
- **Hooky:** `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `SessionEnd` → `POST /api/hooks/claude-code`. Příkaz: `curl -m 2 … || true` s timeoutem 5 s — nikdy neblokuje Claude Code. Instalace přes Nastavení (záloha `settings.json.dirigent-backup-<čas>`).
- **Známá omezení:** bez hooků se žádost o povolení nástroje v přepisu neobjeví (dlouho běžící nástroj vypadá jako „pracuje“ až 10 min).

### Codex — `src/connectors/codex.js` ✅

- **Zdroj:** `~/.codex/sessions/YYYY/MM/DD/rollout-…-<uuid>.jsonl` (hloubka 3).
- **Použitá pole:** `session_meta` (`id`, `cwd`, `originator` → aplikace, `git.branch`), `turn_context.model`, `event_msg.task_started` / `task_complete` (běh tahu), `event_msg.token_count.info.total_token_usage` (tokeny, přírůstky do hodin), `event_msg.token_count.rate_limits` (`primary`/`secondary.used_percent`, `window_minutes`, `resets_at`, `credits.balance`, `plan_type`, `rate_limit_reached_type`), `event_msg.item_completed.item` (`UserMessage`, `AgentMessage`, `CommandExecution`, `McpToolCall`, `FileChange`, `WebSearch`, `ContextCompaction`). Starší sessions bez `item_completed` se čtou z `response_item`.
- **Titulek:** název vlákna z `~/.codex/session_index.jsonl` (`id`, `thread_name`, platí nejnovější `updated_at`; ověřeno), jinak první skutečné zadání (systémový kontext začínající `<`, `#`, `The following is` se přeskakuje), jinak název složky. Index se čte při plném průchodu (10 s).
- **Známá omezení:** žádosti o schválení nejsou v souborech.

### Cursor — `src/connectors/cursor.js` 🧪

- **Zdroj:** `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (SQLite, pouze čtení přes `node:sqlite`, Node ≥ 22.13), dotaz každé 3 s jen při změně souboru/WAL.
- **Použitá data:** tabulka `composerHeaders` (`composerId`, `workspaceId`, `lastUpdatedAt`, `isSubagent`, `value.hasBlockingPendingActions`), `cursorDiskKV` klíče `composerData:<id>` (`generatingBubbleIds`, `status`, `todos`, `modelConfig.modelName`, `fullConversationHeadersOnly`) a `bubbleId:<composer>:<bubble>` (`type` 1 = uživatel, 2 = agent, `text`, `toolFormerData.name/status`, `tokenCount`). Složka projektu z `workspaceStorage/<workspaceId>/workspace.json`.
- **Ověření:** struktura potvrzena na vývojovém Macu (verze Cursoru z dubna 2026), ale bez agentů v posledních 30 dnech.

### GitHub Copilot ve VS Code — `src/connectors/copilot.js` 🧪

- **Zdroj:** `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.json` a `globalStorage/emptyWindowChatSessions/*.json` (i `Code - Insiders`).
- **Použitá pole:** `sessionId`, `creationDate`, `lastMessageDate`, `customTitle`, `requests[].message.text`, `requests[].response[]` (`value`, `markdownContent`, `toolInvocationSerialized`), `requests[].result` (dokončeno), `modelId`.
- **Ověření:** potvrzena jen horní úroveň prázdného souboru (`version: 3`). Nové verze VS Code mohou používat `.jsonl` — zatím nepodporováno.

### GitHub Copilot CLI — `src/connectors/copilot.js` 🧪

- **Zdroj:** `~/.copilot/session-state/**/*.jsonl`. Události `session.start`, `user.message`, `assistant.message`, `tool.execution_start`, `assistant.turn_end`, `session.idle`, usage. Tolerantní parser; na vývojovém Macu bez uložených sessions.

### Gemini CLI a Qwen Code — `src/connectors/gemini-family.js` 🧪

- **Zdroj:** `~/.gemini/tmp/<hash>/chats/*.json`, resp. `~/.qwen/tmp/…`. Pole `sessionId`, `startTime`, `messages[]` (`type` user/gemini/error, `content`, `toolCalls[]`, `tokens.{input,output,cached,thoughts}`, `model`).
- **Ověření:** Gemini CLI je nainstalované, ale bez uložených chatů; Qwen Code nenainstalovaný.

### Webové aplikace — `extension/` + `src/connectors/web.js` 🧪

- Rozšíření Chrome MV3 sleduje stránky (MutationObserver), posílá `site`, `conversationId`, `url`, `title`, `generating`, posledních 60 zpráv (max 8 000 znaků), `model`, `limit` na `http://127.0.0.1:4620/api/ingest/web` s tokenem.
- **Párování:** `GET /api/extension/pair` odpoví jen na `Origin: chrome-extension://…`; ruční zadání klíče v okně rozšíření.
- **Adaptéry:** ChatGPT (`[data-message-author-role]`, `stop-button`), Claude.ai (`[data-testid="user-message"]`, `[data-is-streaming]`), Gemini (`user-query`, `model-response`); ostatní generický adaptér podle atributů/tříd a tlačítka Stop.
- **Neověřeno proti živým webům.** Služby DOM často mění. Postup ověření je v `docs/TESTING.md`.
- **Omezení:** port 4620 je v manifestu napevno; stránky s virtualizovaným seznamem zpráv pošlou jen vykreslené zprávy.

### Náklady z Admin API — `src/connectors/cloud-billing.js` 🧪

- OpenAI: `GET /v1/organization/costs?start_time&bucket_width=1d` (Bearer admin klíč). Anthropic: `GET /v1/organizations/cost_report?starting_at&ending_at` (`x-api-key`, `anthropic-version: 2023-06-01`). Tolerantní čtení částky (`amount` číslo / řetězec / `{value}`), měna USD, obnova 1 h.
- **Neověřeno proti skutečným klíčům.** Při prvním připojení zkontroluj tvar odpovědi a uprav `parse*Costs` + test.

### Procesy — `src/connectors/processes.js` ✅

- `ps -axo pid=,etime=,%cpu=,rss=,args=` každých 5 s, pravidla v `RUNTIMES`; Ollama přes `http://127.0.0.1:11434/api/ps`.
