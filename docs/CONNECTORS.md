# Podpora služeb a konektory

Tento dokument je **poctivý zdroj pravdy** o tom, co Agenteeq umí u které služby. Legenda:

- ✅ ověřeno na skutečných datech,
- 🧪 beta – implementováno podle formátu, ale neověřeno na živých datech,
- ⚠️ heuristika (odvozeno, může se mýlit),
- ❌ nelze bez podpory dodavatele.

## Matice podpory

| Služba | Zdroj | Registrace spuštění | Živý přepis | Průběh úlohy | Potřebuje rozhodnutí | Limity | Útrata |
|---|---|---|---|---|---|---|---|
| **Claude Code** (CLI i místní Claude Desktop → Code) | přepisy + hooky | ✅ do 2 s, s hooky okamžitě | ✅ | ✅ kroky a čas tahu; plán úkolů 🧪 (TodoWrite) | ✅ otázka, schválení plánu; ✅ povolení nástroje jen s hooky | ✅ vyčerpané okno s přesnou obnovou z odmítnutí 429 (`quotaLimits`, i v Claude Desktopu → Code); ✅ % a obnova ze stavového řádku; 🧪 čerstvá historie Claude Desktopu (≤ 30 min, obnova neznámá) | cena předplatného nedostupná |
| **Claude Desktop → vzdálený Code** | místní IndexedDB cache 🧪 | do 2 s od změny cache, ne od události v cloudu | dostupná část | uložené nástroje | poslední hlášený stav | jen uložená hláška, jinak důvod neznámý | neúplné tokeny, žádný odhad |
| **Codex** (ChatGPT app, CLI, VS Code) | `~/.codex/sessions` | ✅ | ✅ | ✅ kroky a čas tahu; plán 🧪 (`update_plan`) | ❌ Codex žádosti o schválení do souborů nezapisuje | ✅ % limitu 5 h / týden, čas obnovy, ✅ zůstatek kreditů | cena předplatného nedostupná |
| **ChatGPT** (web) | rozšíření | 🧪 | 🧪 | ⚠️ generuje / hotovo | ❌ | 🧪 hláška limitu na stránce | cena předplatného nedostupná |
| **Claude.ai** (web) | rozšíření | 🧪 | 🧪 | ⚠️ generuje / hotovo | ❌ | 🧪 | cena předplatného nedostupná |
| **GitHub Copilot** | VS Code chaty 🧪, Copilot CLI 🧪, github.com/copilot 🧪 | 🧪 | 🧪 | ⚠️ | ❌ (VS Code), ❌ CLI | ❌ | cena osobního plánu nedostupná |
| **Microsoft Copilot** | web přes rozšíření 🧪; desktopová aplikace jen jako proces ✅ | 🧪 web | 🧪 web, ❌ aplikace | ⚠️ web | ❌ | 🧪 web | cena předplatného nedostupná |
| **Gemini** | web 🧪, Gemini CLI 🧪 | 🧪 | 🧪 | ⚠️ | ❌ | 🧪 web | cena předplatného nedostupná |
| **Perplexity** | web přes rozšíření | 🧪 | 🧪 | ⚠️ | ❌ | 🧪 | cena předplatného nedostupná |
| **Grok** | web přes rozšíření | 🧪 | 🧪 | ⚠️ | ❌ | 🧪 | cena předplatného nedostupná |
| **Qwen** | Qwen Chat web 🧪, Qwen Code CLI 🧪 | 🧪 | 🧪 | ⚠️ | ❌ | 🧪 web | cena předplatného nedostupná |
| **Cursor** | SQLite `state.vscdb` | 🧪 (formát ✅, bez aktivních agentů) | 🧪 | ✅ plán úkolů z `todos` 🧪 | 🧪 `hasBlockingPendingActions` | ❌ | cena předplatného nedostupná |
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
| Gemini CLI, Qwen Code | `~/.gemini/tmp`, `~/.qwen/projects` | `%USERPROFILE%\.gemini\tmp`, `…\.qwen\projects` | 🧪 neověřeno |
| Cursor | `~/Library/Application Support/Cursor/User` | `%APPDATA%\Cursor\User` | 🧪 neověřeno |
| Copilot ve VS Code | `~/Library/Application Support/Code/User` | `%APPDATA%\Code\User` | 🧪 neověřeno |
| Claude Desktop (vzdálený Code) | `~/Library/Application Support/Claude/IndexedDB` | `%APPDATA%\Claude\IndexedDB` | 🧪 interní cache, macOS ověřený; Windows neověřený |
| Claude Desktop (historie limitů) | `~/Library/Application Support/Claude` | `%APPDATA%\Claude` | 🧪 neověřeno |
| Běžící aplikace | `ps` | PowerShell `Win32_Process` | 🧪 mechanismus hotový, katalog aplikací zná zatím jen `.app` |
| Lokální agenti | `ps` + `lsof` | `Win32_Process` + `Get-NetTCPConnection` | 🧪 totéž |
| Webové aplikace | rozšíření pro Chrome → HTTP | totéž | ✅ na systému nezávislé |
| Náklady z Admin API | HTTPS | totéž | ✅ na systému nezávislé |

**Hooky Claude Code:** macOS/Linux používají POSIX příkaz, Windows explicitní
`powershell.exe -EncodedCommand` a `curl.exe`. Vnější Git Bash/PowerShell tak neinterpretuje
vnitřní uvozovky ani fallback. Příkaz i stavový řádek předávají UTF-8 a při nedostupném
serveru končí úspěšně, aby nezablokovaly Claude. Token čte curl ze souboru s hlavičkami
(`curl -H @soubor`); na Windows PowerShell nejdřív vejde do datové složky Agenteeq
(`Set-Location -LiteralPath`) a curl.exe dostane jen ASCII jméno souboru, protože jeho podpora
Unicode v argumentech není jistá. Nativní Windows test ověřuje HTTP přenos (i ze složky
s diakritikou, `&` a apostrofem) a výpadek; skutečné vyvolání hooku uvnitř Claude Code zůstává
samostatným integračním QA.

**Příkaz pro pokračování (kopírování u konverzace Claude Code):** macOS a Linux
`cd '<složka>' && claude --resume <id>`, Windows tvar pro PowerShell (výchozí terminál Windows)
`Set-Location -LiteralPath "<složka>"; claude --resume <id>` – uvozovky chrání `&` ve jméně složky
(„Design & Web“) v PowerShellu i v cmd.exe, `$`, zpětný apostrof a typografické uvozovky se
zneplatní zpětným apostrofem (`src/platform.js#prikazVeSlozce`). 🧪 Windows tvar je ověřený jen
testem generovaného řetězce, na skutečném Windows (PowerShell 5.1 i 7, cmd.exe) neověřený.

Základ složky řeší jediná funkce `appSupportDir()` v `src/platform.js`; struktura pod ní je
na obou systémech stejná. Konektory, které běžící procesy zjistit nedokážou, hlásí **„nevíme“**,
nikdy „nic neběží“ – rozdíl mezi selháním zjišťování a zjištěným stavem se tu nesmí stírat.

### Proč některé věci nejdou

- **Spotřebitelská předplatná a extra usage:** podporovaná rozhraní ChatGPT a Claude nezpřístupňují skutečně strženou částku osobního předplatného. Agenteeq automaticky přečte typ plánu z přihlášeného nástroje, pokud ho nástroj poskytne, ale cenu z veřejného ceníku za uživatelovu platbu nevydává. Další licence bez ověřitelného účtu ani ručně nevytváří; dřívější ruční záznamy zachová pouze v oddělené historii a CSV. Firemní API náklady jsou jiný zdroj a načítají se automaticky přes Admin API.
- **Osobní limity Claude:** Admin API Anthropicu měří organizaci na Claude API, nikoli využití osobního Claude Pro/Max. Pro tento plán Agenteeq používá pouze čerstvá měření z Claude Code nebo lokálního Claude Desktopu. Přihlášení CLI (`claude auth status --json`) se ověřuje zvlášť každé 2 minuty; nainstalované hooky nejsou důkaz přihlášení. Pokud čerstvé měření není, Přehled ukáže Claude bez procent a obnovy a stav přihlášení jen do 5 minut od kontroly. Ověřená změna přihlášení se pošle přes SSE bez reloadu.
- **Schválení akce na dálku**: Agenteeq umí upozornit a otevřít konverzaci nebo zkopírovat příkaz, ale nástroje nemají bezpečné API pro vzdálené schválení. Nepoužíváme simulaci kláves.
- **Desktopová aplikace Microsoft Copilot a ChatGPT (chat)**: obsah konverzací není dostupný v čitelném lokálním formátu. Web s rozšířením ano.
- **Kredity Codexu a dokoupení** (`src/credits.js`): zůstatek hlásí každá session zvlášť v `rate_limits.credits.balance`; paralelní session posílají zastaralé hodnoty, proto se z pouhého nárůstu nedá usuzovat na nákup. `detectTopUps` bere nárůst jako dokoupení jen tehdy, když se udrží (medián odečtů v následujících 30 min zůstane nad původní úrovní), a dva nárůsty do 15 min slučuje. Počítá se ze všech odečtů v paměti, ne ze zkrácené uložené historie. Starší soubory než sledované okno se jednorázově projdou jen kvůli řádkům s kredity (`scanCreditHistory`, ~1,2 s na 449 MB). Ověřeno proti ručnímu přepočtu: 7 dokoupení od 12. 7. 2026, zůstatek 5,314314.
- **Pomocní agenti Claude Code**: přepisy leží v `~/.claude/projects/<projekt>/<id konverzace>/subagents/agent-<agentId>.jsonl` (hloubka 3, všechny zprávy `isSidechain: true`). Načítají se jako samostatné session s `parentId` rodiče a `subagent.label = 'Pomocný agent'`; v seznamech se skrývají pod rodičem, tokeny se počítají u nich (ne dvakrát). Název = `input.description` volání nástroje `Agent`/`Task` v rodičovském přepisu, spárované přes `agentId:` ve výsledku nástroje. Ověřeno na 6 vláknech (Claude Code 2.1.266).
- **Vlastní agenti** (`src/custom-agents.js`): uživatelem zadané lokální služby (ComfyUI `/queue`, Ollama `/api/tags`, OpenAI-kompatibilní `/v1/models`). Povolený hostitel: loopback (127.0.0.0/8, `::1`), 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, `localhost`, `*.local`; zakázáno 169.254.0.0/16 a 0.0.0.0, veřejné adresy a přihlašovací údaje v URL. Zapamatuje se jen origin. Dotaz: GET, `redirect: 'manual'`, timeout 1,5 s, strop 64 kB, výjimka se nikdy nepropaguje. Stav se obnovuje každých 30 s. 🧪 Beta – ověřeno proti lokálnímu testovacímu serveru, ne proti všem verzím těchto služeb.
- **Extra usage Claude** (`u.xu` v `plan-usage-history.json`): interní soubor neuvádí jednotku ani význam tohoto čísla. Hodnota zůstává jen v diagnostické historické řadě a nezobrazuje se jako procento útraty. Útrata používá pouze čerstvý údaj ze stavového řádku Claude Code, pokud je dostupný.
- **Historie vytížení plánu Claude**: `~/Library/Application Support/Claude/plan-usage-history.json` obsahuje vzorky (`t`, `org`, `u.fh`, `u.sd`, `u.xu`), Agenteeq je vydává přes `GET /api/usage/claude?days=…` pro graf ve Statistikách. Souhrn ukazuje poslední místní den se vzorky, jeho datum, počet odečtů a poslední skutečná procenta 5hodinového a týdenního okna; po půlnoci včerejší data zůstanou správně označená datem. Nejde o tokeny ani cenu. Pole `org` se nikdy neposílá do UI ani do API. Formát je interní a nezdokumentovaný → 🧪 Beta.
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

## Pojistka: běžící agent je vždy vidět (`src/bezici-agenti.js`)

Hlavní úděl Agenteeq je vidět každého agenta, který na počítači běží. Přepis ale může chybět
(agent čeká na první zadání – Claude Code i Codex zakládají soubor až s první zprávou), nebo leží
ve složce, o které Agenteeq neví. Proto:

- **Kořeny přepisů nejsou napevno** (`src/koreny-prepisu.js`). Claude Code: `CLAUDE_CONFIG_DIR/projects`,
  jinak `~/.claude/projects` (ověřeno ve zdroji Claude Code 2.1.283), plus `~/.config/claude/projects`
  z verzí 1.0.x (podle ccusage; čte se, jen když existuje). Codex: `CODEX_HOME`, jinak `~/.codex`.
  Proměnné, které aplikace z Finderu nevidí, doplní za běhu: přihlašovací shell (sonda programů),
  **prostředí běžícího procesu** (macOS `ps -E`, Linux `/proc/<pid>/environ`) a **hook** Claude Code
  (`transcript_path` mimo známé kořeny přidá svůj kořen). Tatáž konverzace ze dvou kořenů
  (symlink) se čte jen jednou. Kořen, který ještě neexistuje (Claude Code zakládá `projects/` až
  s první zprávou), převezme sledování hned po vzniku: přímého rodiče hlídá nerekurzivní strážce,
  který reaguje jen na položku se jménem kořene (`src/watch.js#watchTree`, `hlidatVznik`). Nic
  širšího než rodič a nikdy domov; když chybí i rodič, platí opakování po 5 s – a navíc se
  sledování zkusí hned při každém průchodu procesů, dokud běží agent bez přepisu
  (`createKorenyPrepisu#zkusChybejici`). První spuštění nástroje, které založí `~/.claude` i `projects/`
  najednou, se tak ukáže do 2 s (persona „lehký uživatel“ v `test/persony.test.mjs`).
- **Proces bez konverzace se ukáže sám.** Každý proces agenta v příkazové řádce (claude, codex,
  gemini, qwen, copilot – bez pomocných procesů a podpříkazů bez konverzace, seznam z Claude Code
  2.1.283) se páruje s konverzací téhož nástroje. Procesem agenta je jen běžící program: spustitelný
  soubor, nebo skript pod interpretem (`node /…/bin/claude`, obalový `/bin/sh /…/bin/claude`). Shell,
  který ho jen spouští nebo zmiňuje (`sh -c "… /bin/claude …"`), `sudo`, `caffeinate` ani editor
  s cestou agentem nejsou – skutečný program je ve výpisu jako vlastní proces
  (`src/connectors/processes.js#program`). Páruje se s konverzací, která od jeho startu žila
  a běží ve stejné složce (macOS `lsof`, Linux `/proc/<pid>/cwd`; Windows složku neumí, páruje se
  jen podle času). **Jeden běh = jeden záznam:** proces, jehož přímý rodič je agentní proces téhož
  nástroje, patří k rodičovu běhu (výpis procesů nese PID rodiče: `ps -o ppid`, Windows
  `ParentProcessId`). Ověřeno ve zdroji npm balíčků (5. 10. 2026): `@openai/codex` 0.160.0
  `bin/codex.js` spouští nativní `vendor/<cíl>/bin/codex` jako dítě se stejnými argumenty,
  `@google/gemini-cli` 0.62.0 se spustí znovu jako vlastní dítě s `--max-old-space-size`
  (`GEMINI_CLI_NO_RELAUNCH`), `@qwen-code/qwen-code` 0.25.0 na Windows spouští `cli.js`
  z `cli-entry.js`. Agent spuštěný jiným agentem přes shell (rodič je `sh`) zůstává samostatný.
  Skript npm balíčku spuštěný přímo pod Node (Windows `<jméno>.cmd`, `npx`) se pozná podle cesty
  v balíčku (`bin` z package.json): `@openai/codex/bin/codex.js`, `@google/gemini-cli/bundle/gemini.js`
  (dřív `dist/index.js`), `@qwen-code/qwen-code/cli-entry.js` / `cli.js` (dřív `dist/index.js`),
  `@anthropic-ai/claude-code/cli.js` (1.x). 🧪 Windows tvar neověřený na skutečném stroji. Starší
  proces bere starší konverzaci, spárování mezi průchody nepřeskakuje. Nespárovaný proces je agent
  „běží od 14:02, zatím bez přepisu“ se stavem `waiting` – co přesně dělá, z procesu nevyčteme,
  a tak se to netvrdí. Zmizí, jakmile se přepis najde nebo proces skončí; nepovedený výpis
  procesů nic nepřidá ani neubere.
- **Nepovedený výpis procesů ≠ nic neběží.** Chyba nebo časový limit `ps` / PowerShellu přepne
  zdroje „Aplikace na tomto Macu“ i „Neznámí a lokální agenti“ hned do stavu `error` (událost
  `connectors` bez čekání na pětisekundové porovnání), ponechá poslední známý stav a Přehled to
  řekne („Nepodařilo se zjistit, co na tomto Macu teď běží. Ukazuji poslední známý stav.“, v souhrnu
  „nepodařilo se zjistit, co běží“ místo „0 aplikací běží“). Prázdný seznam po chybě se nikdy
  neukáže jako „Sledování procesů je vypnuté“ ani „neběží žádný AI nástroj“.
- **Testy:** `test/detekce-agentu.test.mjs` včetně skutečného živého procesu `claude` ve složce
  „Design & Web“ s `CLAUDE_CONFIG_DIR` (Linux): zaregistruje se, po prvním zápisu do přepisu se
  spáruje, cizí proces s jiným `CLAUDE_CONFIG_DIR` test nevidí a druhý, nespárovaný proces po skončení
  zmizí. Sdílený výpis procesů není starší než jeden průchod (průchod po 1,5 s na Macu a Linuxu, po 5 s na Windows – `src/platform.js#INTERVAL_PROCESU_MS`; platnost výpisu je polovina intervalu). Nově spuštěný nástroj se v Přehledu objeví do 2 s: změřeno 0,15–1,26 s při 13 nástrojích spuštěných naráz.
  Časy po cestách (`test/zachyceni-agentu.test.mjs` a `test/persony.test.mjs`, Linux, skutečné
  procesy, výchozí interval, měřeno do události v SSE streamu 5. 10. 2026): CLI v Terminálu
  (Claude Code, npm Codex, Gemini CLI) 1,48–1,50 s – určuje to interval výpisu procesů; agent
  spuštěný z Agenteeq: záznam běhu do 10 ms, agent v přehledu 1,27 s; přepis Claude Code / Codexu
  10–70 ms; Cursor 8–950 ms; webová konverzace přes rozšíření 3–40 ms; desktopová aplikace
  z výpisu procesů 1,26–1,28 s. Persony (lehký uživatel, dva účty Claude + dva profily Codexu, 12
  souběžných agentů) hlídají, že každý agent je v přehledu právě jednou, se správným názvem a stavem.

## Konektory v detailu

### Claude Code – `src/connectors/claude-code.js` ✅

- **Zdroj:** `<kořen>/<projekt>/<session-id>.jsonl` (hloubka 1), kořeny viz „Pojistka“ výše – výchozí `~/.claude/projects`. Claude Desktop → Code zapisuje stejný formát s `entrypoint: "claude-desktop"`.
- **Použitá pole:** `type` (`user`, `assistant`, `custom-title`, `ai-title`, `summary`), `timestamp`, `cwd` (první = projekt), `gitBranch`, `message.model`, `message.content[]` (`text`, `tool_use`, `tool_result`), `message.stop_reason` (`end_turn`/`stop_sequence` = konec tahu, `tool_use` = pokračuje), `message.usage` (deduplikace podle `message.id`, poslední záznam vyhrává), `isApiErrorMessage` (limity), `isSidechain` (subagenti), `isMeta`.
- **Potřebuje rozhodnutí:** `AskUserQuestion` bez výsledku, `ExitPlanMode` bez výsledku; s hooky `Notification` typu `permission_prompt` / `elicitation_dialog`.
- **Limity – odmítnutí od serveru (`quotaLimits`, od 0.35.0):** chyba API 429 (`isApiErrorMessage: true`, `apiErrorStatus: 429`, `error: "rate_limit"`) nese v přepisu objekt `quotaLimits` `{ status, resetsAt, rateLimitType, overageStatus, overageDisabledReason, isUsingOverage, unifiedRateLimitFallbackAvailable, upgradePaths[] }`. Zapisuje ho Claude Code v Terminálu i v Claude Desktopu → Code (`entrypoint: "claude-desktop"`), kde stavový řádek nikdy neběží – proto je to pro Desktop jediný přesný zdroj okna. Ověřeno na skutečných přepisech (4. 10. 2026, jen metadata): 47 záznamů, všechny `rateLimitType: "five_hour"`, `status: "rejected"`, `resetsAt` v epoch sekundách, `isUsingOverage: false`, `overageDisabledReason: "org_level_disabled"`.
  - `quotaLimit()` z něj udělá okno `claude:<druh>:quota`, `source: 'transcript-quota'`, vyčerpáno (100 %), `resetsAt` = přesně `resetsAt × 1000`, `at` = čas záznamu. Jen `status: "rejected"`; jiný stav (varování) se nezapisuje. `resetsAt` jiného tvaru než celé číslo v sekundách = čas obnovy neznámý.
  - Druhy: `five_hour` → „Limit 5 h“, `seven_day` → „Týdenní limit“ (✅ ověřené jen `five_hour`; 🧪 `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `overage` podle typu `rateLimitType` v Claude Agent SDK, na skutečném účtu zatím neviděné). Neznámý druh = obecný „Limit využití“ bez délky okna, nic se nedomýšlí. `overage` je vyčerpané extra usage → druh `spend`, ne okno plánu.
  - Dokupované využití: `isUsingOverage: true` → poznámka „dokupované využití zapnuté“; `isUsingOverage: false` s neprázdným `overageDisabledReason` → „vypnuté“; jinak žádná poznámka.
  - Platnost: okno je vyčerpané až do `resetsAt` (výjimka z 30minutového pravidla, protože server uvedl přesný konec); po něm z živého přehledu zmizí. Úspěšná odpověď před obnovou ho **neuvolní** – může jít o jiný účet nebo dokupované využití a okno předplatného je pořád vyčerpané. Záznam se stejnou hláškou už nevytváří druhý řádek z textu (`LIMIT_RE`).
- **Limity – text hlášky (starší Claude Code bez `quotaLimits`):** text chyby API odpovídající `LIMIT_RE`, čas obnovy z „resets 1am“, u vzdálenější obnovy i s dnem („resets Oct 9, 5pm“) a ze starší podoby s časem za svislítkem (místní časová zóna; nerozpoznaný tvar = bez času obnovy, `parseResets`).
- **Přednost zdrojů jednoho okna Claude (`public/js/ui.js#currentLimits`):** přesná měření (stavový řádek, uložená stránka Usage, odmítnutí `quotaLimits`) – z nich nejnovější, při shodném čase v tomto pořadí; teprve bez nich čerstvý vzorek historie Claude Desktopu. Odhad z textu hlášky se skryje, jakmile je k dispozici přesné měření.
- **Hooky:** `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `SessionEnd` → `POST /api/hooks/claude-code`. Příkaz: `curl -m 2 -H @<soubor> … || true` s timeoutem 5 s – nikdy neblokuje Claude Code. Token (`X-Agenteeq-Token`) v příkazu ani v `settings.json` není: hlavičky leží v `~/.agenteeq/claude-hooky-hlavicky` (0600, atomický zápis při každé instalaci, odinstalace ho smaže) a curl je čte přes `-H @soubor` (curl 7.55+; macOS 14+ má curl 8, curl.exe ve Windows 10 1803+ má 7.55.1+). Cesta je v příkazu v jednoduchých uvozovkách (POSIX `'\''`); na Windows PowerShell vejde do složky (`Set-Location -LiteralPath '…'` se zdvojenými apostrofy včetně ‘ ’) a curl.exe dostane jen ASCII jméno souboru, takže nevadí ani diakritika ve jménu uživatele. Chybějící nebo nečitelný soubor = curl skončí ještě před odesláním a hook mlčí stejně jako u neběžícího Agenteeq; stavový řádek ukáže „Agenteeq neběží“. Příkazy z verzí do 0.46 (token přímo v příkazu) fungují dál a Agenteeq je sám nepřepisuje – Nastavení je ukáže jako „Je potřeba obnovit“ a „Obnovit propojení“ je zapíše nově. Instalace přes Nastavení (záloha `settings.json.agenteeq-backup-<čas>`).
- **Zdraví propojení (`src/model.js#hookHealth`, souhrn `hookHealth`):** Claude Code načítá hooky při startu, takže konverzace spuštěná před zapnutím propojení události neposílá a její stav (žádost o povolení) zůstává odhadem z přepisu, dokud se Claude Code nespustí znovu. Čas zapnutí ukládá instalace z Nastavení (`data.json` → `claudeHooks: { od, presne: true }`); propojení zapnuté ručně nebo starší verzí dostane `od` = chvíle, kdy ho Agenteeq poprvé viděl, a `presne: false` – o konverzacích začatých dřív pak Agenteeq neříká „před zapnutím“, ale „nevím“ (`unknown`). U aktivní konverzace CLI (pracuje, čeká na tebe, čeká na zadání; ne pomocník ani proces bez přepisu) rozliší: `linked` (přišla událost), `before` (přepis začal před zapnutím), `silent` (zadání v přepisu přišlo po zapnutí i po startu Agenteeq, ale hook `UserPromptSubmit`, který mu v Claude Code předchází, do 30 s nedorazil – propojení z ní nejspíš nefunguje), `pending` (začala po zapnutí, zatím bez zadání, podle kterého to poznat). `hookAt` se neukládá: po restartu Agenteeq potvrdí propojení až další událost, a proto se ticho posuzuje jen u zadání, která Agenteeq slyšel. settings.json se kontroluje každých 30 s (přepsání jiným nástrojem se projeví samo) a tlačítkem „Zkontrolovat znovu“ (`POST /api/integrations/claude-hooks/check`). Detail konverzace u `before`/`unknown` nabídne pokračování v Terminálu (nebo zkopírování příkazu), u `silent` odkaz do Nastavení → Claude; karta Claude ukazuje počty a u `silent` varování s „Zkontrolovat znovu“ a „Přeinstalovat propojení“.
- **Známá omezení:** bez hooků se žádost o povolení nástroje v přepisu neobjeví (dlouho běžící nástroj vypadá jako „pracuje“ až 10 min).

#### Pravidla pravdivosti (audit 2026-09-22, hlídá `test/pravdivost-dat.test.mjs`)

- **Tokeny patří relaci, ne souboru.** Odbočka (fork) kopíruje historii rodiče i s jeho `sessionId`.
  Počítají se jen řádky, jejichž `sessionId` je relace souboru; u pomocného agenta
  (`<rodič>/subagents/agent-*.jsonl`) je to relace rodiče. Bez toho se tokeny počítaly dvakrát.
- **Limit ví, který model narazil.** Hláška o limitu nese model `<synthetic>`; zablokovaný model je
  poslední úspěšný před ní. Limit skončí obnovou nebo odpovědí *téhož* modelu, nezávisle na tom,
  v jakém pořadí se soubory načtou.
- Hodnoty ověříš kdykoli: `npm run audit:data`.

### Claude Desktop – vzdálený Code – `src/connectors/claude-desktop-code.js` 🧪

- **Ověřená příčina a zdroj (2026-09-26):** vzdálený Code agent pro tento repozitář byl
  uložený v Claude Desktopu, ale nevytvořil místní JSONL v `~/.claude/projects`. Na macOS čteme
  `~/Library/Application Support/Claude/IndexedDB/https_claude.ai_0.indexeddb.leveldb`
  a výhradně odkazované externí hodnoty v odpovídající `.indexeddb.blob`. Windows cesta se
  skládá pod `%APPDATA%\Claude\IndexedDB`, na skutečném Windows stroji neověřená.
- **Formát ověřený na disku:** `react-query-cache` → `clientState.queries[]` s
  `queryKey[0] === "sessions_api_list_sessions"` → `state.data.pages[].data[]`.
  Relace nese `id: "session_…"`, `title`, `created_at`, `updated_at`, `session_status`,
  `status_bucket`, `post_turn_summary.status_category` a `session_context.{model,sources}`.
  Datum platnosti stavu je **`state.dataUpdatedAt` tohoto dotazu**, nikoli globální datum cache.
- **Dostupný přepis:** záznam `code:cse_…` s `product: "code"`,
  `tree.kind: "code_session"`, `tree.messages[]`. Zprávy mají `created_at`, `uuid`,
  `type`, případně `message.{content,model,usage}`. `cse_` a `session_` sdílejí stejnou příponu.
  Duplicitní UUID se počítá jednou; pomocné výstupy s `parent_tool_use_id` se nezapočítávají rodiči.
  Převod zpráv používá stejný parser jako lokální Code, tokeny výhradně z uloženého `message.usage`.
- **Pravdivost:** tento interní zdroj zůstává Beta. Cache může chybět, může obsahovat jen
  starší část přepisu a dodavatel ji může změnit. `observation.partial` vždy označuje neúplnost;
  `transcriptThrough` popisuje poslední dostupné razítko. Neznámé tokeny se neodhadují.
  Metadata přidají jen bod hlášené změny do osy, nikdy souvislou práci od vytvoření relace.
  `running/working/busy` je čerstvý jen při pozorování konkrétního dotazu během 2 minut;
  později platí stávající model stale. `failed` přebíráme ze serverové kategorie, přesný důvod
  (např. limit) bez uložené chyby netvrdíme. Konverzace se otevírá na `https://claude.ai/code/session_…`.
- **Vytížení plánu z uložené stránky Usage 🧪 (neověřeno na skutečných datech):** stránka Usage
  na claude.ai načítá `five_hour` a `seven_day` s `utilization` (procenta) a `resets_at` (ISO čas
  obnovy od serveru) – stejná dvojice, jakou hlásí stavový řádek Claude Code. Pokud ji Desktop uloží
  do `react-query-cache`, zapíše konektor limity `claude:five_hour:desktop` / `claude:seven_day:desktop`
  se `source: 'desktop-usage'` a přesným `resetsAt`, platné k `state.dataUpdatedAt` dotazu. Dotaz se
  hledá **podle tvaru odpovědi**, ne podle jména klíče (nezdokumentované); čas z budoucnosti se
  zahodí; nic dalšího z odpovědi (ani z jiných dotazů) se nečte. Že Desktop tuto odpověď do trvalé
  cache opravdu ukládá, jsme na Macu zatím neověřili – když ji tam nenajde, nic se nezmění.
- **Živá okna (`public/js/ui.js#currentLimits`):** zobrazují jen měření z posledních 30 minut
  (výjimka: odmítnutí `quotaLimits` platí do svého přesného času obnovy). Čerstvý vzorek historie
  Claude Desktopu se od 0.35.0 ukáže jako živé okno s „obnova neznámá · podle Claude Desktopu“,
  starší jen v grafu. Čas obnovy se ukáže jen ze zdroje, který ho přímo poslal; po resetu staré
  měření z přehledu zmizí.
- **Bezpečnost a zotavení:** pouze čtení běžných souborů; žádný LOCK, žádné změny databáze,
  žádná autentizace ani odchozí dotazy. Zpracují se jen dva uvedené druhy klíčů; profily účtu
  v query cache nevstupují do modelu; z uložené stránky Usage jen dvě procenta a dva časy obnovy. Živé SST soubory určuje manifest, WAL přebírá novější
  sekvence a smazání. CRC32C, velikostní hranice a kontrola indexů brání čtení poškozených bloků.
  Neúplný konec WAL se odloží do další změny. Při neznámém formátu se zachová poslední stav
  a konektor hlásí chybu. Watcher běží nad IndexedDB; záložní průchod běží každých 10 s.
- **Testy:** obnovení ranní relace bez CLI přepisu, změny přes skutečný HTTP/SSE do 2 s,
  poškozený zápis a zotavení, kompakce SST/WAL, tombstone, neúplný konec, komprimovaný blob,
  osiřelé bloby, neznámá verze, deduplikace tokenů a stará data. Data v testech jsou umělá.
- **Specifikace:** [LevelDB tabulky](https://github.com/google/leveldb/blob/main/doc/table_format.md),
  [LevelDB log](https://github.com/google/leveldb/blob/main/doc/log_format.md),
  [Chromium IndexedDB](https://github.com/chromium/chromium/blob/main/content/browser/indexed_db/indexed_db_leveldb_coding.cc),
  [Snappy](https://github.com/google/snappy/blob/main/format_description.txt).

### Claude Desktop – historie limitů – `src/connectors/claude-desktop-usage.js` 🧪

- **Proč existuje:** Claude Desktop ukládá historii čerpání plánu. Konektor z ní kreslí historické grafy a čerstvý vzorek (≤ 30 min) ukáže i v živém přehledu – Claude Code v Claude Desktopu stavový řádek nespouští, takže bez toho okna Claude chyběla úplně.
- **Zdroj:** `~/Library/Application Support/Claude/plan-usage-history.json`. Formát **není nikde oficiálně zdokumentovaný** – jde o interní soubor aplikace Claude Desktop, který se může s libovolnou verzí aplikace změnit nebo zmizet.
- **Struktura (ověřeno osobně, 476 vzorků od 13. 8. 2026):** `{ version: 2, samples: [ { t: <ms epoch>, org: "<id organizace>", u: { fh: <0–100>, sd: <0–100>, xu?: <číslo> } } ] }`. `fh` = vytížení 5hodinového okna v %, `sd` = vytížení týdenního okna v %. Nové vzorky přibývají zhruba po 15 minutách i bez otevřené konverzace.
- **`xu` (extra usage):** soubor neuvádí jednotku ani význam čísla. Historická řada zůstává v diagnostickém API, ale konektor ji nezapisuje jako živý limit a aplikace ji nevydává za procenta nebo útratu.
- **Čas obnovy:** soubor ho nenese. Agenteeq ho z této historie nikdy nedopočítává ani neextrapoluje; u okna stojí výslovně „obnova neznámá · podle Claude Desktopu“. Graf ve Statistikách nadále ukazuje jednotlivá historická měření s časem.
- **Použití (změna pravidla v 0.35.0):** čte se poslední vzorek pole `samples` a celá řada pro historický graf. Vzorek se značkou `source: 'plan-history'` je v `public/js/ui.js#currentLimits` živým oknem jen tehdy, když je **nejvýš 30 minut starý** (stejné pravidlo jako u ostatních živých limitů, viz 0.29.3; 29 min ano, 31 min ne) a okno nemá čerstvé přesné měření (stavový řádek, uložená stránka Usage, odmítnutí `quotaLimits`). Pozdější vzorek historie přesné měření nepřepíše a nepůjčí si jeho čas obnovy.
- **Proč je to pravdivé:** 0.29.3 historii z živého přehledu vyřadilo, protože se vydávala za aktuální stav i hodiny po měření a připojoval se k ní dopočtený čas obnovy. Teď se ukáže jen měření Claude Desktopu staré nejvýš 30 minut (ten si vytížení načítá zhruba po 15 minutách), s uvedeným stářím („změřeno před 12 min“), zdrojem a výslovně neznámou obnovou. Nic se nedopočítává; starší vzorek zůstává v grafu.
- **Sledování:** změna souboru (mtime) přes `watchTree` na nadřazené složce `~/Library/Application Support/Claude` (reaguje jen na `plan-usage-history.json`) + pravidelný plný průchod v intervalu `config.scanIntervalMs`, stejně jako u ostatních souborových konektorů.
- **Ověření:** cesta k souboru a tvar `{ t, org, u: { fh, sd, xu } }` ověřeny osobně na reálných datech (poslední 5 h = 99 %, týden = 41 %). **Beta**, protože jde o neveřejný interní formát bez záruky stability mezi verzemi.
- **Známá omezení:** bez `resetsAt`; bez čerstvého vzorku (Desktop zavřený, nebo si vytížení nenačítá) Claude v přehledu limitů okno nemá a rozbalovací seznam nástrojů řekne proč; vyžaduje nainstalovanou a alespoň jednou spuštěnou aplikaci Claude Desktop, aby soubor vůbec vznikl a dál se aktualizoval.

### Codex – `src/connectors/codex.js` ✅

- **Zdroj:** `~/.codex/sessions/YYYY/MM/DD/rollout-…-<uuid>.jsonl` (hloubka 3).
- **Použitá pole:** `session_meta` (`id`, `cwd`, `originator` → aplikace, `git.branch`, `parent_thread_id` + `thread_source` / `source.subagent` → pomocné vlákno), `turn_context.model`, `event_msg.task_started` / `task_complete` (běh tahu), `event_msg.token_count.info.last_token_usage` (přírůstek za požadavek, bez cache pro hlavní metriku) a `total_token_usage` (deduplikace snapshotu; záložní zdroj u starších přepisů), `event_msg.token_count.rate_limits` (`primary`/`secondary.used_percent`, `window_minutes`, `resets_at`, `credits.balance`, `plan_type`, `rate_limit_reached_type`), `event_msg.item_completed.item` (`UserMessage`, `AgentMessage`, `CommandExecution`, `McpToolCall`, `FileChange`, `WebSearch`, `ContextCompaction`). Starší sessions bez `item_completed` se čtou z `response_item`.
- **Titulek:** název vlákna z `~/.codex/session_index.jsonl` (`id`, `thread_name`, platí nejnovější `updated_at`; ověřeno), jinak první skutečné zadání (systémový kontext začínající `<`, `#`, `The following is` se přeskakuje), u plánovaného spuštění název ze značky `<scheduled-task name="…">` („Plánovaná úloha · …“), u pomocného vlákna jeho popis („Automatická kontrola Codexu“, „Pomocný agent <přezdívka>“), jinak název složky. Index se čte při každém průchodu souborů (10 s).
- **Pomocná vlákna:** `session_meta.parent_thread_id` s `thread_source: guardian_review` / `source.subagent.other: guardian` (automatická kontrola příkazů) nebo `source.subagent.thread_spawn` (pomocný agent). Session dostane `parentId` a `subagent`; v seznamech a počtech agentů se nezobrazuje, pokud je rodič sledovaný, tokeny se počítají. Ověřeno na 69 vláknech `guardian` a 1 `thread_spawn` (Codex 0.153.4).
- **Plánované úlohy:** první zpráva `<scheduled-task name="…">` → `taskName`. Spuštění stejné úlohy jsou v seznamu agentů jedním řádkem (poslední spuštění + počet), tokeny všech spuštění se počítají. Ověřeno na 47 spuštěních úlohy `pd-intake`.
- **Známá omezení:** žádosti o schválení nejsou v souborech.

#### Kredity (`rate_limits.credits`)

- `has_credits: false` s nulou nebo bez částky znamená **nulu** – kredity došly. Karta kreditů
  vznikne jen tomu, kdo je kdy měl (kladný odečet kdekoli v historii).
- Doplnění se hledá **uvnitř jedné konverzace**: starší konverzace umí nahlásit zastaralý zůstatek.
  Totéž doplnění viděné víc konverzacemi naráz je jedno. Jmenuje se „doplněno“, ne „dokoupeno“ –
  nákup a vrácení kreditů vypadají v datech stejně.

### Cursor – `src/connectors/cursor.js` 🧪

- **Zdroj:** `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (SQLite, pouze čtení přes `node:sqlite`, Node ≥ 22.13). Dotaz běží při změně `state.vscdb` nebo `state.vscdb-wal` (sledování souboru, `watchExactFile`) a jako pojistka každou 1 s, jen když se podpis souboru/WAL změnil. Průchody jdou za sebou, nikdy souběžně. Dřív jen kontrola po 3 s – nový agent se ukázal až za ~3 s, teď v řádu desítek až stovek ms.
- **Použitá data:** tabulka `composerHeaders` (`composerId`, `workspaceId`, `lastUpdatedAt`, `isSubagent`, `value.hasBlockingPendingActions`), `cursorDiskKV` klíče `composerData:<id>` (`generatingBubbleIds`, `status`, `todos`, `modelConfig.modelName`, `fullConversationHeadersOnly`) a `bubbleId:<composer>:<bubble>` (`type` 1 = uživatel, 2 = agent, `text`, `toolFormerData.name/status`, `tokenCount`). Složka projektu z `workspaceStorage/<workspaceId>/workspace.json`.
- **Ověření:** struktura potvrzena na vývojovém Macu (verze Cursoru z dubna 2026), ale bez agentů v posledních 30 dnech.

### GitHub Copilot ve VS Code – `src/connectors/copilot.js` 🧪

- **Zdroj:** `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.json` a `globalStorage/emptyWindowChatSessions/*.json` (i `Code - Insiders`).
- **Použitá pole:** `sessionId`, `creationDate`, `lastMessageDate`, `customTitle`, `requests[].message.text`, `requests[].response[]` (`value`, `markdownContent`, `toolInvocationSerialized`), `requests[].result` (dokončeno), `modelId`.
- **Ověření:** potvrzena jen horní úroveň prázdného souboru (`version: 3`). Nové verze VS Code mohou používat `.jsonl` – zatím nepodporováno.

### GitHub Copilot CLI – `src/connectors/copilot.js` 🧪

- **Zdroj:** `~/.copilot/session-state/**/*.jsonl`. Události `session.start`, `user.message`, `assistant.message`, `tool.execution_start`, `assistant.turn_end`, `session.idle`, usage. Tolerantní parser; na vývojovém Macu bez uložených sessions.

### Gemini CLI a Qwen Code – `src/connectors/gemini-family.js` 🧪

Tvar záznamů je převzatý ze zdrojového kódu obou nástrojů (`packages/core/src/services/chatRecordingService.ts`),
ne odhadnutý. Hlídá ho `test/gemini-qwen.test.mjs`.

- **Gemini CLI – zdroj:** `~/.gemini/tmp/<projekt>/chats/*.jsonl` (starší verze `*.json` se čtou dál).
  První řádek jsou metadata (`sessionId`, `projectHash`, `startTime`), pak zprávy s `id`; tentýž `id`
  znovu = novější verze téže zprávy (tokeny se dopisují až po dokončení), platí poslední. `$set.messages`
  nahradí historii, `$rewindTo` ji zkrátí. Pomocní agenti leží v `chats/<rodič>/*.jsonl` a patří pod rodiče.
- **Gemini CLI – tokeny:** vstup = `input − cached + tool`, výstup = `output + thoughts`, cache zvlášť.
- **Qwen Code – zdroj:** `~/.qwen/projects/<projekt>/chats/*.jsonl`, strom záznamů (`uuid`, `parentUuid`,
  `type` user/assistant/tool_result/system, `message.parts`, `usageMetadata`). Soubory `*.runtime.json`
  nejsou konverzace. Název z `system/custom_title`.
- **Qwen Code – tokeny:** z `usageMetadata` stejně jako u Gemini. Záznamy s `forkedFrom` jsou kopie
  rodiče po `/branch` a tokeny se u nich nepočítají podruhé.
- **Ověření:** formáty ze zdrojového kódu a test nad fixturami; Gemini CLI na vývojovém Macu bez
  uložených chatů, Qwen Code nenainstalovaný. Proto 🧪.

### Webové aplikace – `extension/` + `src/connectors/web.js` 🧪

- **Ověření webové služby (od 0.26.0):** okno rozšíření → řádek *tato karta* → *Počty nesedí? Ověřit stránku* (od 0.29.0 samostatný pohled) ukáže, co adaptér
  na stránce našel a čím (přesným selektorem služby, nebo obecnou zálohou), a uloží anonymizovaný
  vzorek stránky. Vzorek v `test/fixtures/web/` je regresní test adaptéru. Služba smí dostat ✅
  až s potvrzeným vzorkem – do té doby 🧪, ať je to zadrátované sebelíp.
- Rozšíření Chrome MV3 sleduje stránky (MutationObserver) a posílá **jen stav a počty**: `site`, `conversationId`, `url`, `generating`, `counts: { user, assistant }`, `model`, `limit` na `http://127.0.0.1:4620/api/ingest/web` s tokenem. Text zpráv ani název konverzace neodesílá (od 0.25.0, rozhodnutí vlastníka produktu – `docs/ACCOUNTS.md`). Server zahodí text i od starší verze rozšíření a webová konverzace nemá přepis.
- **Napojení tlačítkem:** Nastavení → Napojené modely → Napojit u webového chatu otevře službu v prohlížeči; první stav z ní napojení potvrdí.
- **Párování (od 0.29.0 bez kódu):** rozšíření o spárování požádá samo (`POST /api/extension/pripojit`). Server mu vydá token jen tehdy, když jeho původ `chrome-extension://<ID>` odpovídá ID z Chrome Web Store (`public/js/obchod.js`) nebo ID složky, kterou připravila aplikace (`src/platform.js#idRozbalenehoRozsireni`). Jiná kopie dostane 409 a spáruje se postaru: Nastavení vytvoří jednorázový 16znakový kód platný 10 minut, uživatel ho vloží do okna rozšíření a `POST /api/extension/pair` ho jednou vymění za token této instalace. Token není v `/api/state`, URL ani argumentech procesu.
- **Adaptéry:** ChatGPT a Codex na webu (`chatgpt.com/codex`; oba `[data-message-author-role]`, `stop-button`), Claude.ai (`[data-testid="user-message"]`, `[data-is-streaming]`), Gemini (`user-query`, `model-response`); ostatní generický adaptér podle atributů/tříd a tlačítka Stop.
- **Nová konverzace bez ID:** dokud služba nepřidělí ID v adrese, rozšíření posílá konverzaci pod zástupným ID karty (`tab-…`, `extension/sites.js#tabId`). První hlášení pod skutečným ID nese `nahrazuje: "tab-…"`; server záznam převede (začátek, probíhající tah, počty) a zástupný odebere – v přehledu je jedna konverzace, ne „duch“ vedle skutečné. `nahrazuje` přijme jen tvar zástupného ID a jen u téže služby, takže jím nejde smazat skutečnou konverzaci. Údaj se posílá, dokud server nepotvrdí příjem.
- **Neověřeno proti živým webům.** Služby DOM často mění. Postup ověření je v `docs/TESTING.md`.
- **Omezení:** port 4620 je v manifestu napevno; u stránek s virtualizovaným seznamem zpráv jsou počty jen z vykreslených zpráv.

### Náklady z Admin API – `src/connectors/cloud-billing.js` 🧪

- OpenAI: `GET /v1/organization/costs?start_time&bucket_width=1d&limit=180` a `GET /v1/organization/usage/completions?…&limit=31` (Bearer admin klíč). Obě odpovědi jsou stránkované (`has_more` + `next_page` → parametr `page`); konektor dočte všechny stránky, nejvýš 12, jinak chyba. Stropy `limit` jsou ze specifikace OpenAI (costs 1–180, usage při `1d` nejvýš 31). Do 3. 10. 2026 šel jediný dotaz s limitem 180: u nákladů 180 dní zpět zasáhne 181 kalendářních dní, takže chyběl nejnovější den, a usage s limitem 180 byl mimo specifikaci. Anthropic: `GET /v1/organizations/cost_report?starting_at&ending_at` (`x-api-key`, `anthropic-version: 2023-06-01`). Tolerantní čtení částky (`amount` číslo / řetězec / `{value}`), měna USD, obnova každých 10 min. **Jednotky se liší:** OpenAI posílá dolary, Anthropic nejmenší jednotky měny jako desetinný řetězec (`"123.45"` = 1,2345 $, podle dokumentace endpointu); parser Anthropicu proto dělí stem. Do 3. 10. 2026 se Anthropic četl jako dolary a API útrata vycházela stokrát vyšší.
- **Dny jsou dny dodavatele v UTC** (`start_time` / `starting_at` koše). Útrata je proto řadí do měsíců podle UTC data a obrazovka Útrata to u skupiny „Automaticky z Admin API“ říká. Místní den aplikace (Přehled, Statistiky) se týká tokenů z konverzací, ne těchto košů.
- **Spotřeba tokenů je vedlejší dotaz.** Když selže a náklady projdou, stav zůstává `connected`, ale `tokens` je `null` a `tokensError` nese důvod (Nastavení ho ukáže u klíče). Selhání se nikdy nehlásí jako prázdná spotřeba.
- **Jednotky částek se liší:** OpenAI posílá dolary, Anthropic nejmenší jednotky měny jako desetinný řetězec (`"123.45"` = 1,2345 $, podle dokumentace endpointu `cost_report`); parser Anthropicu proto dělí stem. Do 3. 10. 2026 se Anthropic četl jako dolary a API útrata vycházela stokrát vyšší.
- **Rozpad po modelech (od 0.34.0).** Všechny čtyři dotazy jdou seskupené: OpenAI `costs?group_by=line_item` (model = část `line_item` před první čárkou, např. `gpt-6-astra, input_tokens` → `gpt-6-astra`; položka bez čárky, třeba nástroj, zůstane pod svým jménem) a `usage/completions?group_by=model`; Anthropic `cost_report?group_by[]=description` (pole `model`, `token_type`, `cost_type`; u nákladů mimo tokeny je `model` null) a `usage_report/messages?group_by[]=model`. Parametry a pole ověřeny 4. 10. 2026 proti referenci API ([Anthropic cost report](https://platform.claude.com/docs/en/api/admin-api/usage-cost/get-cost-report), [Anthropic messages usage](https://platform.claude.com/docs/en/api/admin-api/usage-cost/get-messages-usage-report), [OpenAI OpenAPI](https://github.com/openai/openai-openapi)). Denní součet se počítá ze stejných seskupených řádků (`parse*CostModels` → `parse*Costs`), takže rozpad a denní útrata se nerozejdou – hlídá regresní test. Náklady bez modelu jsou řádek „Bez modelu (nástroje, úložiště)“. Tokeny modelu mají význam dodavatele: OpenAI `input` zahrnuje cached vstup, Anthropic `input` je jen nekešovaný a mezipaměť (čtení + zápis) je zvlášť v `cached`. Že se jména modelů v nákladech a ve spotřebě shodují, je předpoklad podle dokumentace – neověřeno na skutečných datech.
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

- `ps -axo pid=,etime=,%cpu=,rss=,args=` každých 5 s, pravidla v `RUNTIMES`; Ollama přes `/api/ps` na adrese
  z `AGENTEEQ_OLLAMA_URL` (výchozí `http://127.0.0.1:11434`), stejným klientem jako chat (`src/ollama.js`).


### Zachycení agentů v činnosti – `src/detekce.js` + `public/js/detekce-ui.js`

- **Co dělá:** když na Macu poprvé poběží AI nástroj z katalogu `RUNTIMES`, o kterém Agenteeq
  zatím nic neví, ukáže kartu „Zachytil jsem agenta“: co to je (`popis`), kde pracuje (`druh`),
  od kdy běží a co o něm Agenteeq uvidí. Uživatel ho přidá do Mých nástrojů, nebo zvolí
  „Nesledovat“ – pak se už nikdy neozve. Se zavřeným oknem přijde jedno souhrnné oznámení macOS.
- **Co se ukládá:** jen identifikátor z katalogu, čas prvního a posledního běhu a rozhodnutí
  (`data.json → nastroje`, `normalizeNastroje`). Žádné cesty, argumenty ani názvy souborů.
- **Kdy oznámení nepřijde:** nástroj, jehož data Agenteeq už čte (`konektory` s daty), je rovnou
  „známý“. Výjimka je úplně nová instalace, kde uživatel zatím nic nevidí.
- **Co karta tvrdí:** „Čtou se konverzace a tokeny“ jen u sledovaného nástroje; kde zdroj sdílí víc
  nástrojů (záložka Code v Claude Desktop, Codex v ChatGPT), platí přesná věta `vidim`. Rozšíření
  pro Chrome není zdroj desktopové aplikace téže služby. Hlídá `test/nastroje-ui.test.mjs`.
- **Přehled:** dlaždice ukazují, co běží, co je v Mých nástrojích a co tu Agenteeq už někdy viděl
  běžet – ne celý katalog. Přehled limitů ukáže i nástroje bez dat s poznámkou, že limity ani tokeny
  z nich zatím nečte.
- **Rozpoznávání (🧪 u položek s `overeno: false`):** podle cesty aplikace nebo názvu příkazu.
  Ověřené na skutečném Macu: Claude Desktop, Claude Code, ChatGPT, Codex, Cursor, Warp, Ollama
  a webové aplikace z Chromu (Google AI Studio, Stitch, Replit). Ostatní (Windsurf, Antigravity, Kiro, Trae, Zed,
  Microsoft Copilot, Gemini CLI, Qwen Code, Aider, Goose, OpenCode, Amp, Crush, Droid, Auggie,
  Perplexity, Comet, ChatGPT Atlas, Dia, Grok, LM Studio a webové aplikace Gemini, NotebookLM,
  ChatGPT, Claude, Perplexity, Grok, Copilot, DeepSeek, Lovable, v0, Bolt) jsou podle názvu balíčku
  nebo příkazu, zatím nepotvrzené na skutečném stroji. Zrádné případy (Adobe Express, `code` jako
  složka, Codex uvnitř ChatGPT.app) hlídá `test/detekce.test.mjs`.
- **Aplikace Codex (`codex-app`) 🧪:** podle zdrojového kódu příkazu `codex app` (openai/codex,
  `codex-rs/cli/src/desktop_app/mac.rs` a `windows.rs`, větev main 5. 10. 2026) se desktopová
  aplikace na macOS instaluje jako `/Applications/Codex.app` nebo `~/Applications/Codex.app`
  s bundle ID `com.openai.codex` (tentýž bundle se smí jmenovat i `ChatGPT.app` – pak ho Agenteeq
  vidí jako ChatGPT) a na Windows jako balíček Microsoft Store `OpenAI.Codex_…`. Rozpoznává se proto
  každý proces z `…/Codex.app/Contents/…` a z `…\WindowsApps\OpenAI.Codex_…\…`, včetně vnitřního
  `codex app-server`, který se nikdy nepočítá jako Codex CLI. Jméno spustitelného souboru ani cesta
  vnitřního `codex` zdroj neuvádí – **neověřeno na skutečném stroji**. Vlákna aplikace čte konektor
  Codexu z `~/.codex/sessions` (`originator: "Codex Desktop"`); session se jmenuje „Codex · aplikace“,
  protože z přepisu nejde poznat, jestli šlo o Codex.app, nebo ChatGPT.app.
## Předplatné a kurz koruny (Útrata)

Zjišťuje se z toho, co nástroje samy zapisují na Macu; nic osobního se neukládá ani neodesílá.
Co není ověřené na skutečných datech, je **Beta**.

| Část | Zdroj | Stav |
|---|---|---|
| Plán Claude | `claude auth status --json` musí právě potvrdit přihlášení v každém nalezeném `CLAUDE_CONFIG_DIR`; teprve potom se čte jeho `.claude.json` → `oauthAccount.organizationType`, úroveň limitu a `accountUuid`. Na disku Agenteeq zůstane pouze otisk UUID, plán a čas pozorování. E-mail, jméno a token se nepředávají. Soubor se sleduje a změna se propíše přes SSE. | ✅ `claude_pro` ověřeno na skutečném účtu; starý soubor po odhlášení se odmítne. 🧪 izolované alternativní adresáře a plány `claude_max` / Team / Enterprise jsou ověřené fixturami, ne dvěma skutečnými přihlášenými účty. |
| Plán ChatGPT a limity Codexu | Lokální oficiální Codex `app-server` → `account/rateLimits/read` vrací **v jedné odpovědi** `accountId`, `rateLimits.planType`, okna a kredit. Profil se rozlišuje otiskem `accountId`; pro každý nalezený `CODEX_HOME` se čte zvlášť. Historický `rate_limits.plan_type` z přepisů bez účtové identity se už nevydává za aktuální plán v Útratě. Názvy kódů se překládají podle Codexu (`codex-rs/tui/src/subscription.rs`, commit `afb436d`, 4. 10. 2026). | ✅ `plus` a tvar app-serveru ověřen na skutečném účtu 4. 10. 2026; přepínání dvou účtů a dva současné domovy testované fixturami. Bez `accountId` nebo při chybě RPC není číslo aktuálního účtu dostupné. |
| Ceník zjištěného plánu | `src/cenik.js`: veřejný ceník poskytovatele v USD, ověřený 4. 10. 2026 na claude.com/pricing, support.claude.com (Max) a chatgpt.com/pricing + help.openai.com (přes vyhledávání; přímý přístup z vývojového prostředí blokovaný). Ukazuje se jako „ceník“ s datem a odkazem, s přepočtem kurzem ČNB. Plány bez veřejné ceny (Enterprise, Edu) a neznámé kódy cenu nemají. U Claude Team a Max bez známé úrovně jen dolní mez („od“). ChatGPT Go se cenou liší podle země – uvedena je cena v USA. | ✅ ceny ověřené k datu; při změně ceníku upravit `src/cenik.js` a `CENIK_OVERENO` |
| Ceník API pro odhad projektu | `public/js/cenik-api.js`: ceny API Anthropicu v USD za MTok (vstup, výstup, čtení z cache, zápis do cache na 5 min), ověřené 7. 10. 2026 na platform.claude.com/docs/en/about-claude/pricing. Model z přepisu se mapuje podle ID (`claude-opus-4-7` → Opus 4.7). Ukazuje se jen jako „odhad“ v detailu projektu s datem a odkazem, nikdy se nesčítá s útratou. Stránka si u Sonnet 5.5 odporuje v ceně čtení z cache (tabulka 0,20 $, text 0,10 $) – použita tabulka. Haiku 5.5 (cena podle délky promptu), OpenAI, Google a ostatní ceník nemají a hlásí se jako „bez ověřeného ceníku“. | ✅ ceny ověřené k datu; při změně upravit `public/js/cenik-api.js` a `CENIK_API_OVERENO` |
| Odhad žádosti o povolení bez hooků (Claude Code) | `src/connectors/claude-code.js#druhCekani` + `src/model.js#deriveStatus`: nástroj bez výsledku se rozliší na čtení / úpravu souboru / ostatní; úprava čekající přes 20 s se hlásí jako „Nejspíš čeká na tvé povolení“. Režim oprávnění se bere z pole `permissionMode` řádku přepisu, **když tam je** – jeho přítomnost a hodnoty (`default`, `acceptEdits`, `plan`, `bypassPermissions`) zatím nejsou ověřené na skutečných přepisech; bez pole platí výchozí režim s ptaním. | 🧪 Beta – ověřit na skutečném přepisu a doplnit vzorek do testů |
| Zdraví propojení s Claude Code (`src/model.js#hookHealth`) | Že Claude Code načítá hooky jen při startu, vychází z jeho dokumentace (snímek hooků při spuštění, změny za běhu až po kontrole v `/hooks`), ne z měření konkrétní verze. Začátek konverzace je první záznam přepisu, ne start procesu: Claude Code spuštěný před zapnutím, ve kterém první zadání přišlo až po něm, se hlásí jako `silent` místo `before` (text proto říká „nejspíš“ a radí i nové spuštění). Pokračování přes `claude --resume` nese původní začátek, takže zůstane `before`, dokud nepřijde první událost. Jestli Claude Desktop → Code spouští hooky z `~/.claude/settings.json`, ověřené není – jeho konverzace bez události příznak nemají. | 🧪 Beta – ověřit na skutečném Claude Code: start před a po zapnutí, `--resume`, jiný `CLAUDE_CONFIG_DIR`, Claude Desktop |
| Pomocník – hledání v přepisech | `src/pomocnik.js`: čte řádky `user`/`assistant` (Claude Code) a `event_msg` `user_message`/`agent_message` (Codex), rozbor dotazu (období, nástroj, slova) je heuristika bez slovníku. Tvary slov: lehký kmenovač bez diakritiky (pádové koncovky, odvozené -ace/-ovat/-ový/-ní, vkladné e), takže „fakturaci“ najde „faktury“ a „platby“ „plateb“; kmen od 5 písmen se hledá jako začátek slova, kratší jen jako celé slovo s pádovou koncovkou (ne „plat“ → „platforma“). Tolerance překlepů tu není. Přepisy se procházejí od nejnovějších (podle času změny souboru) s jedním rozpočtem na celý dotaz (5 s, 4000 souborů – i když se po prázdném období hledá ve starších) a s průběžným uvolňováním smyčky událostí. Z přepisu nad 3 MB se čte začátek a posledních 512 kB (konec konverzace i nejčerstvější text); prostředek ne a odpověď „nic se nenašlo“ to řekne. Nedoběhlé hledání se nikdy nehlásí jako „nic není“. Ověřeno testy na vzorových přepisech, ne na velkém skutečném archivu. | 🧪 Beta |
| Pomocník – formulace lokálním modelem (Ollama) | Úryvky nalezených konverzací smí dostat jen model na tomto počítači: adresa z `AGENTEEQ_OLLAMA_URL` musí být loopback (`127.0.0.0/8`, `::1`, `localhost`), jinak se Ollamy Pomocník vůbec nezeptá a v odpovědi řekne proč. Vyřazené modely: cloudové (`remote_host`/`remote_model` v `/api/tags`, přípona `-cloud`/`:cloud` – lokální server je přeposílá na ollama.com; pole podle `api/types.go` Ollamy, ne podle skutečné odpovědi s cloudovým modelem) a embeddingové (`capabilities` bez `completion`; u starších verzí bez `capabilities` podle jména `embed`/`minilm`/`bge` a rodiny `bert`/`nomic-bert`, případně ověření přes `/api/show`). Výběr: model načtený v paměti (`/api/ps`) má přednost, jinak nejmenší nainstalovaný, shoda podle jména. Bez vhodného modelu Pomocník odpovídá bez formulace. Testováno proti falešnému serveru, ne se skutečným modelem. | 🧪 Beta |
| Upozornění na telefon (Web Push) | `src/webpush.js` + `src/push.js`: šifrování RFC 8291 ověřené proti testovacímu vektoru z RFC (příloha A), podpis VAPID ověřený veřejným klíčem, odeslání s hlavičkami `TTL`, `Urgency`, `Content-Encoding: aes128gcm`. Skutečné doručení přes push službu Apple (iOS 16.4+, aplikace z plochy) a Google zatím nikdo neověřil, stejně jako čas doručení. | 🧪 Beta – ověřit na skutečném iPhonu a Androidu přes `tailscale serve` |
| Skutečná cena spotřebitelského předplatného | Claude a ChatGPT ji zpřístupňují ve vlastním billing portálu nebo v App Store / Google Play; podporované spotřebitelské API s individuálně strženou částkou Agenteeq nemá. | ✅ zjištěný plán ukazuje jen ceník (viz výše), ne platbu; ceník se nepočítá do útraty. Dřívější ruční platby jsou vidět jen v historii a CSV, nevstupují do aktivních grafů a součtů |
| Více licencí stejné služby | Každý ověřeně přihlášený profil Claude (`accountUuid`) nebo Codex (`accountId`) má vlastní místní záznam. Při přepnutí se dřívější účet zachová jako historicky rozpoznaný, ale jeho procenta a kredit se okamžitě skryjí; u současně přihlášených izolovaných profilů se zobrazí každý zvlášť. | ✅ automatické rozlišení a přepnutí testováno; nelze zpětně přiřadit staré přepisy/kredity bez ID účtu. Z přepisu Claude ani ze stavového řádku se ID licence neposílá, takže jejich limity zůstávají bez účtového přiřazení. |
| Kurz USD/EUR | ČNB `denni_kurz.txt`, GET bez údajů o uživateli, nejvýš jednou za 6 h, poslední kurz se ukládá; vypíná se `AGENTEEQ_CLOUD=0`. Ručně zadaný kurz se nikdy nepřepíše | ✅ formát ověřen na skutečném lístku 2026-09-18 |

### Audit podporovaných rozhraní pro plány a náklady

| Služba | Co lze automatizovat | Co se nesmí tvrdit |
|---|---|---|
| OpenAI | Organization Usage API a `GET /organization/costs` poskytují ověřenou API spotřebu a náklady po připojení Admin API klíče. Codex ve svých limitních datech poskytuje aktuálně pozorovaný `plan_type`. | ChatGPT předplatné a API platforma mají oddělenou fakturaci. Admin API náklady proto nejsou cenou ChatGPT Plus/Pro a veřejný ceník není doklad o skutečné platbě. |
| Anthropic | Usage & Cost Admin API poskytuje ověřenou API spotřebu a náklady. Claude Code ve svém lokálním účtovém stavu poskytuje přesný typ přihlášeného plánu. | Claude předplatné a Claude API/Console jsou oddělené produkty. Admin API náklady nejsou cenou Claude Pro/Max a lokální kód plánu sám neprokazuje strženou částku. |
| GitHub Copilot | Organizace s odpovídajícím oprávněním může přes REST API načíst firemní Copilot plán a přiřazená místa. | Organizační endpoint se nesmí použít jako důkaz osobního Copilot předplatného ani zobrazit bez úspěšného autorizovaného dotazu. |
| Gemini API | Cloud Billing / AI Studio poskytuje API billing data; Google uvádí, že se mohou propsat se zpožděním. | API billing plán není spotřebitelský Gemini Advanced plán a nesmí se s ním slučovat. |

Agenteeq používá pouze oficiální, podporovaná rozhraní a lokální stav nástroje, který si uživatel sám připojil. Soukromé webové endpointy, cookies ani simulované přihlášení se pro zjišťování předplatného nepoužívají.

Ověřené zdroje auditu: [OpenAI Admin API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage), [oddělená fakturace ChatGPT a API](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform), [Anthropic Usage & Cost Admin API](https://docs.anthropic.com/en/api/usage-cost-api), [oddělené předplatné Claude a API/Console](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console), [GitHub Copilot REST](https://docs.github.com/en/rest/copilot/copilot-user-management), [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing/).
