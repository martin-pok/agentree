# Datový kontrakt

Server: `http://127.0.0.1:4620`. Všechny odpovědi JSON (UTF-8). Chyby: `{ "error": "Česká zpráva", "errors"?: { pole: "zpráva" } }`.

## Zabezpečení požadavků

| Typ | Požadavek |
|---|---|
| Všechny | Hlavička `Host` musí být `127.0.0.1` nebo `localhost` (jinak 403) |
| Mutace z dashboardu (POST/PUT/PATCH/DELETE) | `X-Agenteeq: 1`; pokud je `Origin`, musí být lokální původ serveru (jinak 403) |
| Hooky a rozšíření | `X-Agenteeq-Token: <ingestToken>` (jinak 401) |

## REST

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/api/health` | `{ ok, version, ready, lifecycle?: { pid, ownerPid } }` – lifecycle pouze u desktopového serveru |
| GET | `/api/state` | Úplný snapshot (viz níže) |
| GET | `/api/sessions/:id` | `{ session: SessionSummary, transcript: TranscriptEntry[] }` (max 400) |
| GET | `/api/sessions/:id/transcript?after=<seq>` | `{ entries }` |
| POST | `/api/sessions/:id/open` | `{ target: "app" \| "terminal" \| "folder" }` → `{ ok, label }`; 404 neznámá session, 422 akce není k dispozici, 502 macOS akci odmítl (zpráva říká proč) |
| GET | `/api/stream` | Server-Sent Events |
| POST | `/api/hooks/claude-code` | Vstup Claude Code hooku (token) → `{ ok, id }` |
| POST | `/api/ingest/web` | Data z rozšíření (token instalace + její `Origin`) → `{ ok, id }`; 401 = rozšíření spárovat znovu |
| POST | `/api/extension/handoff` | `{ site }` (token instalace + `Origin`) → `{ prompt: string \| null, prefilled? }`; zadání jen jednou a jen pro danou službu |
| POST | `/api/extension/hello` | `{ version? }` (token instalace + `Origin`) → stav rozšíření |
| POST | `/api/extension/pair-code` | Vytvoří `{ code, expiresAt }`; vyžaduje lokální mutační ochranu |
| POST | `/api/extension/pair` | Hlavičky `Origin: chrome-extension://…`, `X-Agenteeq-Pair-Code` a volitelně `X-Agenteeq-Installation-Id` (`[A-Za-z0-9-]{8,64}`) → jednorázově `{ token, version }`. Token je nový pro každé spárování, platí jen z tohoto `Origin` a nové spárování téže instalace ten starý zneplatní |
| POST | `/api/spend/ledger` | Nový výdaj → 201 `{ entry, spend }`; 422 s `errors` |
| PATCH | `/api/spend/ledger/:id` | `{ endDate: "RRRR-MM-DD" \| null }` – ukončení předplatného |
| DELETE | `/api/spend/ledger/:id` | `{ spend }` |
| GET | `/api/spend/export?mesicu=12` | `text/csv` (UTF-8 s BOM, středníky, desetinná čárka), `Content-Disposition: attachment; filename="agenteeq-utrata-RRRR-MM-DD.csv"`. Řádek za platbu v každém měsíci posledních `mesicu` měsíců (1–36, výchozí 12, jinak 422): měsíc, datum platby, služba, typ, opakování, poznámka, částka, měna, kurz a částka v měně aplikace, zdroj (Ručně / Admin API / Podle ceníku). Součty po měsících = `monthlyTotals` |
| PUT | `/api/spend/budgets` | `{ total?, currency?, rates?: {USD, EUR}, services?: {služba: částka \| ""} }` → `{ spend }` |
| GET | `/api/alerts` | `{ unread, items }` (max 300, nejnovější první) |
| POST | `/api/alerts/read` | `{ ids: string[] \| "all" }` → `{ unread }` |
| POST | `/api/alerts/test` | Testovací upozornění |
| PUT | `/api/settings` | `{ notifications?: Partial<Notifications>, welcomeCompleted?: boolean, onboardingDismissed?: boolean, appearance?: 'light' \| 'dark' \| 'system', avatar?: number \| null }` → `{ settings }` |
| POST | `/api/integrations/claude-hooks/install` \| `uninstall` | `{ claudeHooks: HooksStatus }`; 422 při neplatném settings.json |
| PUT / DELETE | `/api/secrets/:id` | `openai-admin` \| `anthropic-admin`; PUT `{ value }` → `{ integrations }`. Přihlášení k účtu (`ucet`) tudy nejde – 404 |
| POST | `/api/ucet/prihlaseni` | Jen z tohoto Macu → `{ url, otevreno }` a otevře přihlášení přes Google v prohlížeči; 503 když přihlášení na serveru účtů ještě neběží nebo server neodpovídá, 404 bez nastavených účtů. Viz `docs/ACCOUNTS.md` |
| POST | `/api/ucet/zruseni` \| `odhlaseni` \| `smazani` | Jen z tohoto Macu → `{ ucet: UcetStatus }`. `smazani` smaže účet i data v cloudu, na Macu nic; 401 bez přihlášení |
| POST | `/api/ucet/synchronizace` | Jen z tohoto Macu, `{ zapnuto: boolean }` → `{ ucet }`. Zapnutí hned pošle souhrny, vypnutí je z účtu smaže; 401 bez přihlášení, 422 bez volby |
| POST | `/api/ucet/synchronizovat` | Jen z tohoto Macu → `{ ucet }`; pošle souhrny hned (když je synchronizace zapnutá) |
| GET | `/api/ucet/nahled` | Jen z tohoto Macu → `{ nahled: { usage_daily, spend_monthly, limits, agent_status, connections } }` – přesně to, co by odešlo |
| GET | `/api/napojeni` | Jen z tohoto Macu → `{ napojeni: Napojeni[] }` (`{ id, druh: 'agent' \| 'web', label, provider, logo, nainstalovano: true \| false \| null, napojeno: true \| false \| null, plan?, ceka, posledni?, oknoDni? }`). Spouští `claude auth status` a `codex login status` |
| POST | `/api/napojeni/:id` \| `/api/napojeni/:id/zrusit` | Jen z tohoto Macu. `claude-code`, `codex`, `web:chatgpt` \| `web:claude` \| `web:gemini` \| `web:perplexity` → `{ ok, ceka?, uz?, plan?, prikaz? }`; 422 nenainstalováno nebo bez Terminálu (s `prikaz`), 409 bez rozšíření (`rozsireni: true`), 404 neznámé |
| GET | `/ucet/navrat/:pokus` | Návrat z přihlášení (HTML, mimo `/api`). Jen z tohoto Macu, pokus platí 10 minut a jednou. `?code=` vymění kód za přihlášení, `?chyba=` ohlásí zrušení |
| POST | `/api/connectors/rescan` | `{ connectors }` |
| GET | `/api/lan` | `LanStatus`; jinam než na tento Mac bez `pin` a `devices` |

> **„Jen z tohoto Macu“** znamená obojí zároveň: spojení po smyčce **a** hlavička `Host` rovná `127.0.0.1`/`localhost`, **a** žádné hlavičky od reverzní proxy (`X-Forwarded-*`, `Forwarded`, `Tailscale-User-*`). Samotná adresa protistrany nestačí – `tailscale serve` se na server obrací z `127.0.0.1` za cizí zařízení. Viz `docs/SECURITY.md`.

| POST | `/api/lan/enable` \| `disable` | Přístup z domácí sítě → `{ lan: LanStatus }`; jen z tohoto Macu (403, viz níž), 422 bez privátní adresy, 502 když listener nelze otevřít |
| POST | `/api/tailscale/enable` \| `disable` | Přístup z vlastní sítě Tailscale → `{ lan: LanStatus }`; jen z tohoto Macu (403 – loopback **a** `Host: 127.0.0.1`/`localhost`, bez stop po proxy), 422 když Tailscale neběží nebo Mac ještě nemá adresu v tailnetu, 502 když listener nelze otevřít |
| POST | `/api/lan/pin` | `{ pin: { code, expiresAt } }`; jen z `127.0.0.1` (403), 409 s vypnutými oběma cestami |
| POST | `/api/lan/pair` | `{ pin, label? }` → token do `HttpOnly` cookie; 401 chybný kód, 410 vypršel, 429 po pěti pokusech |
| DELETE | `/api/lan/devices/:id` | `{ lan: LanStatus }`; jen z `127.0.0.1` (403), 404 neznámé zařízení |
| POST | `/api/remote/detect` | `{ tunnels: { at, list: Tunnel[], advice } }`; jen z `127.0.0.1` (403) |
| GET | `/api/projects` | `{ projects: ProjectsPayload }` |
| POST | `/api/projects` | `{ name, description?, color?, folders?: string[] }` → 201 `{ project, projects }`; 422 s `errors`; 402 `upgrade` při limitu verze Zdarma (jen je-li zapnutý) |
| PATCH | `/api/projects/:id` | Částečná změna (`name`, `description`, `color`, `folders`, `notes`, `archived`) → `{ project, projects }`; 404, 422 |
| DELETE | `/api/projects/:id` | `{ projects }` – konverzace zůstanou, jen se uvolní z projektu |
| POST | `/api/projects/assign` | `{ sessionIds: string[] (1–1000), projectId: string \| "" \| null }` → `{ projects }`. `id` = ručně do projektu, `""` = mimo projekty (přebije složku), `null` = zpět na pravidlo složky. ID nemusí ještě existovat (webový chat, budoucí session) |
| GET | `/api/projects/:id/export` | `text/csv` (UTF-8 s BOM, středníky), `Content-Disposition: attachment` |
| GET | `/api/launch` | `LaunchPayload` |
| POST | `/api/launch` | `LaunchRequest` → `{ ok, kind, mode, label, sessionId, run, copyPrompt, dry?, plan? }`; 422 s `field`; 402 `upgrade`; 502 macOS akci odmítl |
| POST | `/api/launch/refresh` | Znovu zjistí nainstalované agenty → `LaunchPayload` |
| GET | `/api/runs` | `{ runs: Run[] }` |
| POST | `/api/runs/:id/stop` | `{ runs }`; 404, 409 už skončil |
| GET | `/api/runs/:id/log` | `{ log }` – posledních 16 kB výstupu |
| POST | `/api/runs/clear` | Skryje dokončené běhy → `{ runs }` |
| POST | `/api/sessions/:id/reply` | Jen lokální chat: `{ text }` → `{ ok }`; 404, 409 model odpovídá, 422 |
| POST | `/api/sessions/:id/stop` | Jen lokální chat → `{ ok }`; 409 model neodpovídá |
| GET / PUT / DELETE | `/api/license` | PUT `{ key }` → `{ ok, license: LicenseStatus }`; 422 s důvodem. Celý klíč se nikdy nevrací |
| POST | `/api/integrations/autostart/install` \| `uninstall` | `{ ok, dry?, integrations }` |
| GET | `/api/fs/folders?path=` | `{ path, home, parent, dirs: [{ name, path, git }] }` – jen složky v domovském adresáři, bez skrytých; 400 relativní, 403 mimo domov, 404 |

`Napojeni.nainstalovano: null` znamená, že se programy zatím nepodařilo zjistit, ne že chybí. U `druh: agent` je `posledni` čas poslední místní aktivity v milisekundách od epochy (0 = žádná ve sledovaném okně); `oknoDni` je počet dní sledovaného okna, případně null, není-li známý.

## SSE události (`/api/stream`)

| Událost | Data |
|---|---|
| `hello` | `{ version, now, ready }` – po každém (znovu)připojení; klient stáhne `/api/state` |
| `session` | `SessionSummary` (jen při skutečné změně) |
| `session:remove` | `{ id }` |
| `transcript` | `{ id, reset: boolean, entries: TranscriptEntry[] }` – nové **nebo aktualizované** položky (upsert podle `seq`) |
| `runtimes` | `Runtime[]` |
| `limits` | `Limit[]` |
| `credits` | `CreditRecord[]` |
| `alert` | `{ alert: Alert, unread }` |
| `alerts` | `{ unread }` |
| `spend` | `SpendPayload` |
| `connectors` | `ConnectorStatus[]` |
| `settings` | `Settings` |
| `integrations` | `Integrations` |
| `projects` | `ProjectsPayload` |
| `runs` | `Run[]` |
| `launch` | `LaunchPayload` |
| `license` | `LicenseStatus` |
| `napojeni` | `{ id, label, udalost: 'napojeno' \| 'vyprselo', plan?, uz? }` – jednorázová zpráva, žádný trvalý stav |
| `ucet` | `UcetStatus` + `udalost?: 'prihlaseno' \| 'chyba' \| 'odhlaseno' \| 'smazano'` |
| `usage` | `{ launches }` |

Každých 15 s komentář `: ping`.

## Typy

### UcetStatus (`state.ucet`, událost `ucet`)

`{ stav: 'nenastaveno' | 'odhlaseno' | 'overuji' | 'prihlaseno' | 'nedostupne', ceka: boolean, jmeno, email, chyba, trvale: boolean, sync: { zapnuto, posledni, chyba, odeslano } }`. Tokeny nikdy. Mimo tento Mac jen `{ stav }`. `nedostupne` = uložené přihlášení se nepodařilo ověřit (síť), ne odhlášení. `trvale` = obnovovací token je v Klíčence.

```ts
type Status = 'needs_input' | 'limited' | 'working' | 'waiting' | 'idle' | 'archived';
type Provider = 'anthropic' | 'openai' | 'google' | 'github' | 'microsoft' | 'cursor' | 'perplexity' | 'xai' | 'alibaba' | 'local' | 'other';

interface SessionSummary {
  id: string;                 // "<connector>:<localId>"
  connector: string;          // claude-code | codex | cursor | copilot-cli | vscode-copilot | gemini-cli | qwen-code | web
  provider: Provider;
  app: string;                // lidský název aplikace, např. "Codex · ChatGPT app"
  source: 'local' | 'web' | 'desktop-cache';
  parentId: string | null;    // pomocné vlákno (automatická kontrola, pomocný agent) → ID rodičovské konverzace; mimo seznamy a počty agentů, tokeny se počítají
  subagent: { kind: 'review' | 'agent' | 'other'; label: string } | null;
  taskName: string;           // plánovaná úloha ze značky <scheduled-task>; spuštění téže úlohy jsou v seznamu agentů jedním řádkem
  title: string;              // název vlákna → první skutečné zadání → „Plánovaná úloha · <název>“ / popis pomocného vlákna → název složky
  cwd: string; project: string; model: string; branch: string;
  status: Status;
  reason: string;             // důvod stavu (co agent dělá / co potřebuje)
  stale: boolean;             // tah nebyl ukončen, ale dlouho se nic neděje (nehlásí „dokončeno“)
  open: { id: 'app' | 'terminal' | 'folder'; label: string }[];  // dostupné akce otevření (podle nainstalovaných aplikací)
  startedAt: number; lastAt: number;   // ms
  turns: number;
  tokens: { input: number; output: number; cacheWrite: number; cacheRead: number };
  hourly: Record<string, number>;      // "2026-09-10T18" (UTC hodina) → tokeny (vstup + výstup + zápis cache)
  spans: [number, number][];           // úseky aktivity za 24 h (ms)
  progress: { done: number; total: number; current: string } | null;
  activity: string;                    // jen když working
  turnStartedAt: number; turnSteps: number;  // jen když working
  lastPrompt: string;
  pending: { kind: 'permission' | 'question' | 'plan'; text: string; at: number; source: string } | null;
  limit: { reached: boolean; text: string; at: number; resetsAt: number | null } | null;
  resume: string | null;      // příkaz pro Terminál
  url: string | null;         // webová konverzace
  hooked: boolean;
  observation?: { at: number; transcriptThrough: number; partial: true }; // remote Claude: query observation time, available cached transcript boundary; never complete usage
  transcriptSeq: number;
}

interface TranscriptEntry { seq: number; at: number; role: 'user' | 'assistant' | 'tool' | 'result' | 'system' | 'error'; text: string; tool?: string; status?: 'ok' | 'error' }

interface Limit { id: string; provider: Provider; app: string; label: string; usedPercent: number | null; windowMinutes: number | null; resetsAt: number | null; resetsBy?: number; reached: boolean; plan: string | null; text: string; at: number; source?: 'statusline' | 'desktop-usage' | 'plan-history' | string }
// resetsAt = přesný čas obnovy od zdroje; resetsBy = jen horní mez z historie Claude Desktopu
// (okno skončí nejpozději v tu chvíli). Rozhraní (`public/js/ui.js#limitObnova`) ukazuje u každého
// okna jedno z: přesný čas, „nejpozději“, „obnoveno …“, nebo výslovně „čas obnovy zdroj neuvádí“.

interface CreditRecord { id: string; provider: Provider; app: string; label: string; balance: number; unlimited: boolean; at: number; history: { at: number; balance: number }[] }

interface Alert { id: string; key: string; at: number; read: boolean; level: 'action' | 'critical' | 'warning' | 'info'; kind: 'needs_input' | 'limit' | 'limit_near' | 'budget' | 'done' | 'test'; title: string; body: string; sessionId?: string }

interface LedgerEntry { id: string; service: string; kind: 'subscription' | 'extra' | 'credits' | 'api'; amount: number; currency: 'CZK' | 'USD' | 'EUR'; date: string; recurring: 'monthly' | null; endDate: string | null; note: string; createdAt: number }

interface SpendPayload {
  currency: string; monthKey: string;               // "2026-09"
  month: { key: string; total: number; services: Record<string, number>; kinds: Record<string, number> };
  months: typeof month[];                            // posledních 6 měsíců
  recurring: number; forecast: number;
  budgets: { scope: string; label: string; spent: number; budget: number; pct: number }[];
  ledger: LedgerEntry[]; budgetsConfig: { total: number; services: Record<string, number> };
  rates: Record<string, number>;                     // Kč za 1 jednotku měny
  services: Record<string, { label: string; provider: Provider }>; kinds: Record<string, string>; currencies: string[];
}

interface Notifications { needsInput: boolean; limits: boolean; budget: boolean; done: boolean; doneMinSeconds: number; native: boolean; browser: boolean }

// SessionSummary navíc (0.5.0):
//   projectId: string | null;
//   projectSource: 'manual' | 'folder' | 'none' | null;   // none = záměrně mimo projekty
//   chat?: { available: boolean };                        // jen connector 'local-chat'

interface Project { id: string; name: string; color: string; description: string; notes: string; folders: string[]; archived: boolean; createdAt: number; updatedAt: number }
interface ProjectSnapshot { id: string; projectId: string; title: string; app: string; provider: Provider; connector: string; source: string; model: string; cwd: string; url: string; resume: string; startedAt: number; lastAt: number; turns: number; tokens: { input: number; output: number; cacheWrite: number } }
interface ProjectsPayload { items: Project[]; assignments: Record<string, string>; snapshots: Record<string, ProjectSnapshot>; colors: string[]; limits: { name: number; description: number; notes: number; folders: number; assign: number } }

interface LaunchTarget { id: string; label: string; logo: string; provider: Provider; group: 'agent' | 'local' | 'web'; modes: LaunchMode[]; projectModes: LaunchMode[]; permissions?: Record<string, string>; sandboxes?: Record<string, string>; models?: string[]; note: string; beta?: boolean; prefill?: boolean }
type LaunchMode = 'terminal' | 'background' | 'app' | 'web' | 'local';
interface LaunchPayload { targets: LaunchTarget[]; modes: Record<LaunchMode, string>; openMode: 'exec' | 'dry' | 'off' }
interface LanStatus {
  enabled: boolean; listening: boolean; error: string; port: number;
  addresses: string[]; // privátní adresy Macu v domácí síti (10/8, 172.16/12, 192.168/16)
  url: string;
  tailscale: {
    enabled: boolean;      // přepínač „Přístup přes Tailscale"
    available: boolean;    // Mac má adresu v tailnetu, takže je co zapnout
    listening: boolean;    // listener na té adrese skutečně běží
    error: string;
    addresses: string[];   // jen IPv4 z rozsahu 100.64.0.0/10
    name: string;          // jméno v MagicDNS, prázdné když ho tailnet nemá
    url: string;           // adresa pro telefon: jméno má přednost před adresou
  };
  pin: { code: string; expiresAt: number } | null; // jen na Macu
  devices: { id: string; label: string; at: number }[]; // jen na Macu
}

interface Tunnel {
  id: 'tailscale' | 'cloudflared' | 'ngrok'; name: string; installed: boolean; running: boolean;
  url: string; remoteUrl: string; kind: 'privatni-sit' | 'verejny-tunel'; security: string; hint: string;
  // jen u tailscale:
  dnsName?: string; ips?: string[]; tailnet?: string;
  serve?: { running: boolean; unknown: boolean; url?: string }; // HTTPS přes „tailscale serve"; unknown = nezjištěno
}

interface LaunchRequest { agent: string; mode: LaunchMode; prompt: string /* max 20 000 */; cwd?: string; projectId?: string; permission?: 'plan' | 'acceptEdits'; sandbox?: 'read-only' | 'workspace-write'; model?: string }
interface Run { id: string; agent: string; label: string; cwd: string; prompt: string /* zkráceno */; sessionId: string | null; projectId: string | null; pid: number | null; status: 'running' | 'stopping' | 'done' | 'failed' | 'stopped'; exitCode: number | null; error: string; startedAt: number; endedAt: number | null }
interface LicenseStatus { valid: boolean; hasKey: boolean; plan: 'free' | 'pro' | 'team'; planLabel: string; reason?: string; expired?: boolean; maskedKey?: string; activatedAt?: number; license?: { id: string; name: string; email: string; plan: string; planLabel: string; seats: number; issuedAt: string; expiresAt: string | null }; paidFeatures: Record<string, string>; plans: Record<string, { label: string; rank: number }> }
```

## Vstup rozšíření (`POST /api/ingest/web`)

```json
{
  "site": "chatgpt | claude | gemini | mscopilot | perplexity | grok | qwen | github-copilot",
  "conversationId": "[A-Za-z0-9_.:-]{1,200}",
  "url": "https://…",
  "generating": true,
  "counts": { "user": 3, "assistant": 3 },
  "model": "volitelné",
  "needsInput": "volitelný text",
  "limit": "volitelný text hlášky o limitu"
}
```

Od 0.25.0 rozšíření **neposílá text zpráv ani název konverzace**, jen stav a počty zpráv podle role.
Starší rozšíření posílá ještě `title` a `messages[{ role, text }]`: server z nich spočítá role a text
i název zahodí, nic z toho neuloží. Konverzace z webu se v Agenteeq jmenuje podle služby a konce
svého ID („ChatGPT · konverzace 3f2a“) a nemá přepis.

## Trvalá data `~/.agenteeq/data.json`

`settings.welcomeCompleted` je samostatný boolean pro čtyřkrokový úvod (výchozí false). `settings.appearance` je `light` (výchozí), `dark` nebo `system`; ovlivňuje jen vzhled na tomto Macu. `onboardingDismissed` řídí existující checklist napojení. Dokončení úvodu nemění napojení ani souhlas s hooky. `integrations.desktop` označuje nativní obal; desktop nepovolí instalaci soupeřícího CLI LaunchAgentu přes API (422). `integrations.extension` je `{ state: 'missing' | 'ready' | 'active' | 'quiet', pairedAt, seenAt, version, expectedVersion, outdated, repair, path, sites }`; spárované je jen rozšíření s platným tokenem instalace. `repair: true` znamená rozšíření spárované před 0.25.0 (se sdíleným tokenem hooků), které je potřeba spárovat znovu.

`{ version: 1, ingestToken, extensionPairing?: { code, expiresAt } | null, extension: { pairedAt, seenAt, version }, extensionInstallations: [{ id, origin, tokenHash /* sha256, nikdy token */, pairedAt }] /* max 5 */, settings (+ onboardingDismissed), spend: { currency, rates, budgets, ledger }, alerts (max 300), alertKeys (deduplikace, TTL 60 dní), credits, projects: { items, assignments, snapshots (max 3000) }, license: { key, activatedAt } | null, usage: { launches } }` – zapisováno atomicky s právy 0600. Snímky konverzací v projektech se při živé práci ukládají s odstupem 15 s.

Další soubory: `~/.agenteeq/prompts/<uuid>.txt` (zadání pro Terminál, 0600, mazání po 24 h), `~/.agenteeq/runs/<id>.log` (výstup běhů na pozadí, 0600).
