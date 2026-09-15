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
| POST | `/api/ingest/web` | Data z rozšíření (token) → `{ ok, id }` |
| POST | `/api/extension/pair-code` | Vytvoří `{ code, expiresAt }`; vyžaduje lokální mutační ochranu |
| POST | `/api/extension/pair` | Hlavička `Origin: chrome-extension://…` a `X-Agenteeq-Pair-Code` → jednorázově `{ token, version }` |
| POST | `/api/spend/ledger` | Nový výdaj → 201 `{ entry, spend }`; 422 s `errors` |
| PATCH | `/api/spend/ledger/:id` | `{ endDate: "RRRR-MM-DD" \| null }` – ukončení předplatného |
| DELETE | `/api/spend/ledger/:id` | `{ spend }` |
| PUT | `/api/spend/budgets` | `{ total?, currency?, rates?: {USD, EUR}, services?: {služba: částka \| ""} }` → `{ spend }` |
| GET | `/api/alerts` | `{ unread, items }` (max 300, nejnovější první) |
| POST | `/api/alerts/read` | `{ ids: string[] \| "all" }` → `{ unread }` |
| POST | `/api/alerts/test` | Testovací upozornění |
| PUT | `/api/settings` | `{ notifications?: Partial<Notifications>, welcomeCompleted?: boolean, onboardingDismissed?: boolean, appearance?: 'light' \| 'dark' \| 'system', avatar?: number \| null }` → `{ settings }` |
| POST | `/api/integrations/claude-hooks/install` \| `uninstall` | `{ claudeHooks: HooksStatus }`; 422 při neplatném settings.json |
| PUT / DELETE | `/api/secrets/:id` | `openai-admin` \| `anthropic-admin`; PUT `{ value }` → `{ integrations }` |
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
| `usage` | `{ launches }` |

Každých 15 s komentář `: ping`.

## Typy

```ts
type Status = 'needs_input' | 'limited' | 'working' | 'waiting' | 'idle' | 'archived';
type Provider = 'anthropic' | 'openai' | 'google' | 'github' | 'microsoft' | 'cursor' | 'perplexity' | 'xai' | 'alibaba' | 'local' | 'other';

interface SessionSummary {
  id: string;                 // "<connector>:<localId>"
  connector: string;          // claude-code | codex | cursor | copilot-cli | vscode-copilot | gemini-cli | qwen-code | web
  provider: Provider;
  app: string;                // lidský název aplikace, např. "Codex · ChatGPT app"
  source: 'local' | 'web';
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
  transcriptSeq: number;
}

interface TranscriptEntry { seq: number; at: number; role: 'user' | 'assistant' | 'tool' | 'result' | 'system' | 'error'; text: string; tool?: string; status?: 'ok' | 'error' }

interface Limit { id: string; provider: Provider; app: string; label: string; usedPercent: number | null; windowMinutes: number | null; resetsAt: number | null; reached: boolean; plan: string | null; text: string; at: number }

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
  "title": "max 120 znaků",
  "generating": true,
  "messages": [{ "role": "user | assistant", "text": "max 8000 znaků" }],
  "model": "volitelné",
  "needsInput": "volitelný text",
  "limit": "volitelný text hlášky o limitu"
}
```

## Trvalá data `~/.agenteeq/data.json`

`settings.welcomeCompleted` je samostatný boolean pro čtyřkrokový úvod (výchozí false). `settings.appearance` je `light` (výchozí), `dark` nebo `system`; ovlivňuje jen vzhled na tomto Macu. `onboardingDismissed` řídí existující checklist napojení. Dokončení úvodu nemění napojení ani souhlas s hooky. `integrations.desktop` označuje nativní obal; desktop nepovolí instalaci soupeřícího CLI LaunchAgentu přes API (422).

`{ version: 1, ingestToken, extensionPairing?: { code, expiresAt } | null, settings (+ onboardingDismissed), spend: { currency, rates, budgets, ledger }, alerts (max 300), alertKeys (deduplikace, TTL 60 dní), credits, projects: { items, assignments, snapshots (max 3000) }, license: { key, activatedAt } | null, usage: { launches } }` – zapisováno atomicky s právy 0600. Snímky konverzací v projektech se při živé práci ukládají s odstupem 15 s.

Další soubory: `~/.agenteeq/prompts/<uuid>.txt` (zadání pro Terminál, 0600, mazání po 24 h), `~/.agenteeq/runs/<id>.log` (výstup běhů na pozadí, 0600).
