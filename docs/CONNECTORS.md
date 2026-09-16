# Podpora služeb a konektory

Tento dokument je **poctivý zdroj pravdy** o tom, co Agenteeq umí u které služby. Legenda:

- ✅ ověřeno na skutečných datech,
- 🧪 beta – implementováno podle formátu, ale neověřeno na živých datech,
- ⚠️ heuristika (odvozeno, může se mýlit),
- ❌ nelze bez podpory dodavatele.

## Matice podpory (v0.2.0)

| Služba | Zdroj | Registrace spuštění | Živý přepis | Průběh úlohy | Potřebuje rozhodnutí | Limity | Útrata |
|---|---|---|---|---|---|---|---|
| **Claude Code** (CLI i Claude Desktop → Code) | přepisy + hooky | ✅ do 2 s, s hooky okamžitě | ✅ | ✅ kroky a čas tahu; plán úkolů 🧪 (TodoWrite) | ✅ otázka, schválení plánu; ✅ povolení nástroje jen s hooky | ✅ z hlášky „hit your … limit“; 🧪 záloha z historie Claude Desktop, když zrovna neběží žádná konverzace | ruční zápis |
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
| **OpenAI / Anthropic API** | Admin API | – | – | – | – | – | 🧪 automaticky |
| AI aplikace na Macu | `ps`, Ollama API | ✅ procesy | – | – | – | – | – |

### Kde konektory hledají data na kterém systému

Agenteeq je vyvíjený a ověřovaný na macOS. Jádro běží i na Windows (doloženo v CI, viz
`docs/WINDOWS.md`), ale **to, kde tam ty nástroje opravdu ukládají, ověřené není** – a dokud
to někdo nepotvrdí na skutečném stroji, patří sem 🧪, ne ✅.

| Konektor | macOS | Windows | Stav Windows |
|---|---|---|---|
| Claude Code | `~/.claude/projects` | `%USERPROFILE%\.claude\projects` | 🧪 cesta se poskládá sama, neověřeno |
| Codex | `~/.codex/sessions` | `%USERPROFILE%\.codex\sessions` | 🧪 neověřeno |
| Copilot CLI | `~/.copilot/session-state` | `%USERPROFILE%\.copilot\session-state` | 🧪 neověřeno |
| Gemini CLI, Qwen Code | `~/.gemini/tmp`, `~/.qwen/tmp` | `%USERPROFILE%\.gemini\tmp`, `…\.qwen\tmp` | 🧪 neověřeno |
| Cursor | `~/Library/Application Support/Cursor/User` | `%APPDATA%\Cursor\User` | 🧪 neověřeno |
| Copilot ve VS Code | `~/Library/Application Support/Code/User` | `%APPDATA%\Code\User` | 🧪 neověřeno |
| Claude Desktop (historie limitů) | `~/Library/Application Support/Claude` | `%APPDATA%\Claude` | 🧪 neověřeno |
| Běžící aplikace | `ps` | PowerShell `Win32_Process` | 🧪 mechanismus hotový, katalog aplikací zná zatím jen `.app` |
| Lokální agenti | `ps` + `lsof` | `Win32_Process` + `Get-NetTCPConnection` | 🧪 totéž |
| Webové aplikace | rozšíření pro Chrome → HTTP | totéž | ✅ na systému nezávislé |
| Náklady z Admin API | HTTPS | totéž | ✅ na systému nezávislé |

**Hooky Claude Code** jsou příkaz pro shell, a ten je na každém systému jiný. Na macOS a Linuxu
se zapíše POSIXový tvar, na Windows tvar pro `cmd.exe` (`curl.exe`, dvojité uvozovky, `>NUL`,
`|| ver >NUL` místo `|| true`). 🧪 **Neověřeno:** že Claude Code na Windows hooky opravdu
spouští přes `cmd.exe`. Je to podložený předpoklad — Node se `shell: true` tam používá
`ComSpec`, tedy `cmd.exe` — ne ale ověřený fakt. Stavový řádek je na Windows schválně bez
diakritiky, protože kódová stránka `cmd.exe` by z „neběží“ udělala nesmysl přímo ve stavovém
řádku Claude Code.

Základ složky řeší jediná funkce `appSupportDir()` v `src/platform.js`; struktura pod ní je
na obou systémech stejná. Konektory, které běžící procesy zjistit nedokážou, hlásí **„nevíme“**,
nikdy „nic neběží“ – rozdíl mezi selháním zjišťování a zjištěným stavem se tu nesmí stírat.

### Proč některé věci nejdou

- **Předplatné a extra usage** (ChatGPT, Claude, Gemini, Perplexity, Grok, Qwen, Copilot): žádná z těchto služeb neposkytuje veřejné API pro útratu jednotlivce. Agenteeq proto nabízí ruční zápis s rozpočty. Výjimka: zůstatek kreditů Codexu, který Codex sám zapisuje do sessions.
- **Schválení akce na dálku**: Agenteeq umí upozornit a otevřít konverzaci nebo zkopírovat příkaz, ale nástroje nemají bezpečné API pro vzdálené schválení. Nepoužíváme simulaci kláves.
- **Desktopová aplikace Microsoft Copilot a ChatGPT (chat)**: obsah konverzací není dostupný v čitelném lokálním formátu. Web s rozšířením ano.
- **Kredity Codexu a dokoupení** (`src/credits.js`): zůstatek hlásí každá session zvlášť v `rate_limits.credits.balance`; paralelní session posílají zastaralé hodnoty, proto se z pouhého nárůstu nedá usuzovat na nákup. `detectTopUps` bere nárůst jako dokoupení jen tehdy, když se udrží (medián odečtů v následujících 30 min zůstane nad původní úrovní), a dva nárůsty do 15 min slučuje. Počítá se ze všech odečtů v paměti, ne ze zkrácené uložené historie. Starší soubory než sledované okno se jednorázově projdou jen kvůli řádkům s kredity (`scanCreditHistory`, ~1,2 s na 449 MB). Ověřeno proti ručnímu přepočtu: 7 dokoupení od 12. 7. 2026, zůstatek 5,314314.
- **Pomocní agenti Claude Code**: přepisy leží v `~/.claude/projects/<projekt>/<id konverzace>/subagents/agent-<agentId>.jsonl` (hloubka 3, všechny zprávy `isSidechain: true`). Načítají se jako samostatné session s `parentId` rodiče a `subagent.label = 'Pomocný agent'`; v seznamech se skrývají pod rodičem, tokeny se počítají u nich (ne dvakrát). Název = `input.description` volání nástroje `Agent`/`Task` v rodičovském přepisu, spárované přes `agentId:` ve výsledku nástroje. Ověřeno na 6 vláknech (Claude Code 2.1.266).
- **Vlastní agenti** (`src/custom-agents.js`): uživatelem zadané lokální služby (ComfyUI `/queue`, Ollama `/api/tags`, OpenAI-kompatibilní `/v1/models`). Povolený hostitel: loopback (127.0.0.0/8, `::1`), 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, `localhost`, `*.local`; zakázáno 169.254.0.0/16 a 0.0.0.0, veřejné adresy a přihlašovací údaje v URL. Zapamatuje se jen origin. Dotaz: GET, `redirect: 'manual'`, timeout 1,5 s, strop 64 kB, výjimka se nikdy nepropaguje. Stav se obnovuje každých 30 s. 🧪 Beta – ověřeno proti lokálnímu testovacímu serveru, ne proti všem verzím těchto služeb.
- **Extra usage Claude** (`u.xu` v `plan-usage-history.json`): procento vyčerpaného limitu extra usage. Jednotka není zdokumentovaná; mapování na `rate_limits.spend_limit.used_percentage` ze stavového řádku Claude Code opíráme o tři fakty – sousední `fh`/`sd` jsou procenta oken, stavový řádek hlásí stejnou trojici a `xu` na reálných datech (81 vzorků, 13.–27. 8. 2026) nepřekročilo 100 (18,2 → 64,4). Zobrazuje se v Útratě jako graf čerpání + skoky nárůstu, označené 🧪 Beta. Přesná data ze stavového řádku (`claude:spend_limit`) mají přednost před historií (`claude:spend_limit:history`).
- **Historie vytížení plánu Claude**: `~/Library/Application Support/Claude/plan-usage-history.json` obsahuje ~30 dní vzorků (`t`, `org`, `u.fh`, `u.sd`, `u.xu`), Agenteeq je vydává přes `GET /api/usage/claude?days=…` pro graf ve Statistikách. Pole `org` se nikdy neposílá do UI ani do API. Formát je interní a nezdokumentovaný → 🧪 Beta.
- **Limity aplikace ChatGPT (chat)**: nejsou nikde na disku. Ověřeno 12. 9. 2026 v `~/Library/Application Support/com.openai.chat` – jsou tam konverzace, nápovědy a modely, ale ani jeden soubor neobsahuje `rate_limit`, `quota` ani `usage_limit`. Jediný lokálně čitelný limit OpenAI hlásí Codex sám (`limit_id: codex`); druhý bucket `limit_id: premium` chodí s prázdnými okny (`primary`/`secondary` = `null`, 14 výskytů za 30 dní), takže se nezobrazuje. V kartě Limity a kredity je to uvedené: limit Codexu je oddělený od chatu v ChatGPT a limit běžící aplikace ChatGPT nemá Agenteeq odkud přečíst.
- **Webové aplikace nesdílejí tokeny** – grafy tokenů je proto neobsahují.

## Otevření v aplikaci (`src/openers.js`)

| Zdroj | Otevřít v aplikaci | Pokračovat v Terminálu | Stav ověření |
|---|---|---|---|
| Codex | `codex://threads/<id>` – přesně dané vlákno v aplikaci ChatGPT | `codex resume <id>` jen když je Codex CLI v PATH | ✅ schéma a formát nalezeny v aplikaci ChatGPT (používá ho pro odkaz na vlákno); 🧪 otevření ověřit v QA |
| Claude Code | otevře aplikaci Claude **bez konkrétní session** – aplikace zná `claude://resume`, ale parametry odkazu nejsou veřejně popsané, proto je nepoužíváme | `cd <projekt> && claude --resume <id>` – přesně daná session | ✅ plán testován; 🧪 spuštění ověřit v QA |
| Cursor, Copilot ve VS Code | otevře složku projektu v editoru | – | 🧪 |
| Web (rozšíření) | otevře konverzaci v prohlížeči, jen `https://` | – | 🧪 |
| Cokoli se složkou projektu | „Otevřít složku“ ve Finderu | – | 🧪 |

- Nabídku akcí (`session.open`) počítá server podle nainstalovaných aplikací (`/Applications/*.app`) a CLI v PATH přihlašovacího shellu.
- Terminál se ovládá přes AppleScript (Terminal.app). Při prvním použití se macOS zeptá na povolení **Automatizace**; odmítnutí vrátí srozumitelnou chybu s návodem.
- Loga služeb: `public/logos/` z `@lobehub/icons-static-svg` 1.95.0 (MIT), používaná jen k označení napojených služeb.

## Spuštění agenta (`src/launcher.js`)

| Agent | Režimy | Jak | Stav ověření |
|---|---|---|---|
| Claude Code | Terminál, na pozadí | Terminál: `claude --session-id <uuid> -- "<zadání ze souboru>"`; pozadí: `claude -p --session-id <uuid> --permission-mode plan\|acceptEdits -- <zadání>`. Známé ID session → rovnou zařazení do projektu | ✅ přepínače ověřeny v `claude --help` 2.1.212; 🧪 skutečné spuštění |
| Codex | aplikace, Terminál, na pozadí | Aplikace: `codex://threads/new?prompt=` (schéma nalezeno v aplikaci ChatGPT, zadání do 6 000 znaků); Terminál: `codex -- "<zadání>"`; pozadí: `codex exec --skip-git-repo-check -C <složka> -s read-only\|workspace-write -- <zadání>`. CLI i z aplikace ChatGPT (`Contents/Resources/codex`). Session z pozadí se páruje podle složky a času startu | ✅ přepínače v `codex --help` 0.153.4; 🧪 skutečné spuštění |
| Gemini CLI, Qwen Code | Terminál | `gemini -i "<zadání>"`, `qwen -i "<zadání>"` – jen když jsou v PATH | 🧪 nenainstalováno na vývojovém Macu |
| Ollama | lokálně | `POST /api/chat` na `127.0.0.1:11434`, odpověď se streamuje do přepisu v Agenteeq; konverzace žije do restartu serveru | 🧪 testováno proti falešnému serveru |
| ChatGPT, Claude.ai, Perplexity, Microsoft Copilot, Grok | web | Otevře `?q=<zadání>` a zadání vždy zkopíruje do schránky (parametr není oficiálně dokumentovaný) | 🧪 |
| Gemini, Qwen Chat | web | Otevře aplikaci, zadání je ve schránce | 🧪 |

**Zdarma:** Agenteeq nemá vlastní AI – spuštění běží na předplatných a limitech uživatele. Skutečně zdarma jsou lokální modely v Ollamě a bezplatné úrovně služeb (např. Gemini CLI s osobním účtem Google, bezplatné webové verze).

## Konektory v detailu

### Claude Code – `src/connectors/claude-code.js` ✅

- **Zdroj:** `~/.claude/projects/<projekt>/<session-id>.jsonl` (hloubka 1). Claude Desktop → Code zapisuje stejný formát s `entrypoint: "claude-desktop"`.
- **Použitá pole:** `type` (`user`, `assistant`, `custom-title`, `ai-title`, `summary`), `timestamp`, `cwd` (první = projekt), `gitBranch`, `message.model`, `message.content[]` (`text`, `tool_use`, `tool_result`), `message.stop_reason` (`end_turn`/`stop_sequence` = konec tahu, `tool_use` = pokračuje), `message.usage` (deduplikace podle `message.id`, poslední záznam vyhrává), `isApiErrorMessage` (limity), `isSidechain` (subagenti), `isMeta`.
- **Potřebuje rozhodnutí:** `AskUserQuestion` bez výsledku, `ExitPlanMode` bez výsledku; s hooky `Notification` typu `permission_prompt` / `elicitation_dialog`.
- **Limity:** text chyby API odpovídající `LIMIT_RE`, čas obnovy z „resets 1am“ (místní časová zóna).
- **Hooky:** `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `SessionEnd` → `POST /api/hooks/claude-code`. Příkaz: `curl -m 2 … || true` s timeoutem 5 s – nikdy neblokuje Claude Code. Instalace přes Nastavení (záloha `settings.json.agenteeq-backup-<čas>`).
- **Známá omezení:** bez hooků se žádost o povolení nástroje v přepisu neobjeví (dlouho běžící nástroj vypadá jako „pracuje“ až 10 min).

### Claude Desktop – historie limitů – `src/connectors/claude-desktop-usage.js` 🧪

- **Proč existuje:** limity 5 h a týden se dnes berou jen ze stavového řádku Claude Code (`claude-code.js#ingestStatusline`), takže bez otevřené konverzace čísla zůstanou zastaralá. Tenhle konektor je záloha – čte historii, kterou si Claude Desktop ukládá sám pro sebe, a doplní čísla i mimo aktivní konverzaci.
- **Zdroj:** `~/Library/Application Support/Claude/plan-usage-history.json`. Formát **není nikde oficiálně zdokumentovaný** – jde o interní soubor aplikace Claude Desktop, který se může s libovolnou verzí aplikace změnit nebo zmizet.
- **Struktura (ověřeno osobně, 476 vzorků od 13. 8. 2026):** `{ version: 2, samples: [ { t: <ms epoch>, org: "<id organizace>", u: { fh: <0–100>, sd: <0–100>, xu?: <číslo> } } ] }`. `fh` = vytížení 5hodinového okna v %, `sd` = vytížení týdenního okna v %. Nové vzorky přibývají zhruba po 15 minutách i bez otevřené konverzace.
- **`xu` (extra usage):** přítomné jen u části vzorků (84 ze 476 v ověřených datech), poslední pozorovaná hodnota 64.35. **Jednotka není ověřená** – nejspíš dolary, ale netvrdíme to. Konektor ji zapíše jako limit s `kind: 'spend'` a `label: 'Extra usage'` jen pokud v daném vzorku existuje; `public/js/views/spend.js` ji zobrazí jako „vyčerpáno X %“, což může být zavádějící, dokud jednotka nebude ověřená.
- **Použití:** čte se jen **poslední** vzorek pole `samples`. Zapisuje limity s vlastními id `claude:five_hour:history` / `claude:seven_day:history` (a `claude:extra_usage:history`, pokud `xu` existuje), `source: 'plan-history'`, `resetsAt: null` (zdroj obnovu neobsahuje). Stavový řádek (`source: 'statusline'`) má vždy přednost – `public/js/ui.js#currentLimits` schová všechny ostatní anthropic limity, jakmile existuje alespoň jeden záznam se `source: 'statusline'`. Tahle historie se v UI tedy objeví, jen když zrovna neběží žádná konverzace se stavovým řádkem.
- **Sledování:** změna souboru (mtime) přes `watchTree` na nadřazené složce `~/Library/Application Support/Claude` (reaguje jen na `plan-usage-history.json`) + pravidelný plný průchod v intervalu `config.scanIntervalMs`, stejně jako u ostatních souborových konektorů.
- **Ověření:** cesta k souboru a tvar `{ t, org, u: { fh, sd, xu } }` ověřeny osobně na reálných datech (poslední 5 h = 99 %, týden = 41 %). **Beta**, protože jde o neveřejný interní formát bez záruky stability mezi verzemi.
- **Známá omezení:** bez `resetsAt`; vyžaduje nainstalovanou a alespoň jednou spuštěnou aplikaci Claude Desktop, aby soubor vůbec vznikl a dál se aktualizoval.

### Codex – `src/connectors/codex.js` ✅

- **Zdroj:** `~/.codex/sessions/YYYY/MM/DD/rollout-…-<uuid>.jsonl` (hloubka 3).
- **Použitá pole:** `session_meta` (`id`, `cwd`, `originator` → aplikace, `git.branch`, `parent_thread_id` + `thread_source` / `source.subagent` → pomocné vlákno), `turn_context.model`, `event_msg.task_started` / `task_complete` (běh tahu), `event_msg.token_count.info.total_token_usage` (tokeny, přírůstky do hodin), `event_msg.token_count.rate_limits` (`primary`/`secondary.used_percent`, `window_minutes`, `resets_at`, `credits.balance`, `plan_type`, `rate_limit_reached_type`), `event_msg.item_completed.item` (`UserMessage`, `AgentMessage`, `CommandExecution`, `McpToolCall`, `FileChange`, `WebSearch`, `ContextCompaction`). Starší sessions bez `item_completed` se čtou z `response_item`.
- **Titulek:** název vlákna z `~/.codex/session_index.jsonl` (`id`, `thread_name`, platí nejnovější `updated_at`; ověřeno), jinak první skutečné zadání (systémový kontext začínající `<`, `#`, `The following is` se přeskakuje), u plánovaného spuštění název ze značky `<scheduled-task name="…">` („Plánovaná úloha · …“), u pomocného vlákna jeho popis („Automatická kontrola Codexu“, „Pomocný agent <přezdívka>“), jinak název složky. Index se čte při plném průchodu (10 s).
- **Pomocná vlákna:** `session_meta.parent_thread_id` s `thread_source: guardian_review` / `source.subagent.other: guardian` (automatická kontrola příkazů) nebo `source.subagent.thread_spawn` (pomocný agent). Session dostane `parentId` a `subagent`; v seznamech a počtech agentů se nezobrazuje, pokud je rodič sledovaný, tokeny se počítají. Ověřeno na 69 vláknech `guardian` a 1 `thread_spawn` (Codex 0.153.4).
- **Plánované úlohy:** první zpráva `<scheduled-task name="…">` → `taskName`. Spuštění stejné úlohy jsou v seznamu agentů jedním řádkem (poslední spuštění + počet), tokeny všech spuštění se počítají. Ověřeno na 47 spuštěních úlohy `pd-intake`.
- **Známá omezení:** žádosti o schválení nejsou v souborech.

### Cursor – `src/connectors/cursor.js` 🧪

- **Zdroj:** `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (SQLite, pouze čtení přes `node:sqlite`, Node ≥ 22.13), dotaz každé 3 s jen při změně souboru/WAL.
- **Použitá data:** tabulka `composerHeaders` (`composerId`, `workspaceId`, `lastUpdatedAt`, `isSubagent`, `value.hasBlockingPendingActions`), `cursorDiskKV` klíče `composerData:<id>` (`generatingBubbleIds`, `status`, `todos`, `modelConfig.modelName`, `fullConversationHeadersOnly`) a `bubbleId:<composer>:<bubble>` (`type` 1 = uživatel, 2 = agent, `text`, `toolFormerData.name/status`, `tokenCount`). Složka projektu z `workspaceStorage/<workspaceId>/workspace.json`.
- **Ověření:** struktura potvrzena na vývojovém Macu (verze Cursoru z dubna 2026), ale bez agentů v posledních 30 dnech.

### GitHub Copilot ve VS Code – `src/connectors/copilot.js` 🧪

- **Zdroj:** `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.json` a `globalStorage/emptyWindowChatSessions/*.json` (i `Code - Insiders`).
- **Použitá pole:** `sessionId`, `creationDate`, `lastMessageDate`, `customTitle`, `requests[].message.text`, `requests[].response[]` (`value`, `markdownContent`, `toolInvocationSerialized`), `requests[].result` (dokončeno), `modelId`.
- **Ověření:** potvrzena jen horní úroveň prázdného souboru (`version: 3`). Nové verze VS Code mohou používat `.jsonl` – zatím nepodporováno.

### GitHub Copilot CLI – `src/connectors/copilot.js` 🧪

- **Zdroj:** `~/.copilot/session-state/**/*.jsonl`. Události `session.start`, `user.message`, `assistant.message`, `tool.execution_start`, `assistant.turn_end`, `session.idle`, usage. Tolerantní parser; na vývojovém Macu bez uložených sessions.

### Gemini CLI a Qwen Code – `src/connectors/gemini-family.js` 🧪

- **Zdroj:** `~/.gemini/tmp/<hash>/chats/*.json`, resp. `~/.qwen/tmp/…`. Pole `sessionId`, `startTime`, `messages[]` (`type` user/gemini/error, `content`, `toolCalls[]`, `tokens.{input,output,cached,thoughts}`, `model`).
- **Ověření:** Gemini CLI je nainstalované, ale bez uložených chatů; Qwen Code nenainstalovaný.

### Webové aplikace – `extension/` + `src/connectors/web.js` 🧪

- Rozšíření Chrome MV3 sleduje stránky (MutationObserver), posílá `site`, `conversationId`, `url`, `title`, `generating`, posledních 60 zpráv (max 8 000 znaků), `model`, `limit` na `http://127.0.0.1:4620/api/ingest/web` s tokenem.
- **Párování:** Dashboard vytvoří jednorázový 16znakový kód platný 10 minut. Uživatel jej vloží do okna rozšíření; `POST /api/extension/pair` ho jednou vymění za lokální ingest token. Token není v `/api/state`, URL ani argumentech procesu.
- **Adaptéry:** ChatGPT (`[data-message-author-role]`, `stop-button`), Claude.ai (`[data-testid="user-message"]`, `[data-is-streaming]`), Gemini (`user-query`, `model-response`); ostatní generický adaptér podle atributů/tříd a tlačítka Stop.
- **Neověřeno proti živým webům.** Služby DOM často mění. Postup ověření je v `docs/TESTING.md`.
- **Omezení:** port 4620 je v manifestu napevno; stránky s virtualizovaným seznamem zpráv pošlou jen vykreslené zprávy.

### Náklady z Admin API – `src/connectors/cloud-billing.js` 🧪

- OpenAI: `GET /v1/organization/costs?start_time&bucket_width=1d` (Bearer admin klíč). Anthropic: `GET /v1/organizations/cost_report?starting_at&ending_at` (`x-api-key`, `anthropic-version: 2023-06-01`). Tolerantní čtení částky (`amount` číslo / řetězec / `{value}`), měna USD, obnova 1 h.
- **Neověřeno proti skutečným klíčům.** Při prvním připojení zkontroluj tvar odpovědi a uprav `parse*Costs` + test.

### Vzdálený přístup přes Tailscale – `src/tunnel.js` + `src/lan.js` 🧪

Není to konektor (nečte žádnou konverzaci), ale čte stav externího nástroje, a platí tu proto
totéž pravidlo: co není ověřené na skutečných datech, je **Beta**.

| Část | Zdroj | Stav |
|---|---|---|
| Je Tailscale nainstalovaný | `/Applications/Tailscale.app/Contents/MacOS/Tailscale` nebo `tailscale` v PATH | ✅ ověřeno jednotkovými testy nad vstřiknutým `run`/`fileExists` |
| Běží a pod jakým jménem | `tailscale status --json` → `BackendState`, `Self.DNSName`, `Self.TailscaleIPs`, `CurrentTailnet.MagicDNSSuffix` | 🧪 formát podle dokumentace a výstupu CLI; **neověřeno proti živému tailnetu** |
| Adresa Macu v tailnetu | síťová rozhraní Macu, IPv4 z `100.64.0.0/10` | ✅ hranice rozsahu pokryté testem (`test/tailscale.test.mjs`) |
| HTTPS přes `tailscale serve` | `tailscale serve status --json` → `Web[host:443].Handlers[cesta].Proxy` | 🧪 **neověřeno proti živému tailnetu.** Čte se obranně: co se nerozpozná, hlásí se jako neznámé, nikdy jako zapnuté |

- **Co Agenteeq nedělá:** neinstaluje Tailscale, nespouští `tailscale up` ani `tailscale serve`,
  nepřihlašuje se za uživatele a adresu tailnetu nikam neposílá.
- **Ověření před označením ✅:** na Macu s přihlášeným Tailscale zapnout přepínač, otevřít adresu
  z telefonu ve stejném tailnetu, spárovat kódem; pak `tailscale serve` zapnout i vypnout a ověřit,
  že to karta v Nastavení pozná. Postup je v `docs/TESTING.md`.

### Procesy – `src/connectors/processes.js` ✅

- `ps -axo pid=,etime=,%cpu=,rss=,args=` každých 5 s, pravidla v `RUNTIMES`; Ollama přes `http://127.0.0.1:11434/api/ps`.
