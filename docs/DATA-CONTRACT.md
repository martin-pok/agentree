# Datový kontrakt

Server: `http://127.0.0.1:4620`. Všechny odpovědi JSON (UTF-8). Chyby: `{ "error": "Česká zpráva", "errors"?: { pole: "zpráva" } }`.

## Zabezpečení požadavků

| Typ | Požadavek |
|---|---|
| Všechny | Hlavička `Host` musí být `127.0.0.1` nebo `localhost` (jinak 403) |
| Mutace z dashboardu (POST/PUT/PATCH/DELETE) | `X-Dirigent: 1`; pokud je `Origin`, musí být lokální původ serveru (jinak 403) |
| Hooky a rozšíření | `X-Dirigent-Token: <ingestToken>` (jinak 401) |

## REST

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/api/health` | `{ ok, version, ready }` |
| GET | `/api/state` | Úplný snapshot (viz níže) |
| GET | `/api/sessions/:id` | `{ session: SessionSummary, transcript: TranscriptEntry[] }` (max 400) |
| GET | `/api/sessions/:id/transcript?after=<seq>` | `{ entries }` |
| POST | `/api/sessions/:id/open` | `{ target: "app" \| "terminal" \| "folder" }` → `{ ok, label }`; 404 neznámá session, 422 akce není k dispozici, 502 macOS akci odmítl (zpráva říká proč) |
| GET | `/api/stream` | Server-Sent Events |
| POST | `/api/hooks/claude-code` | Vstup Claude Code hooku (token) → `{ ok, id }` |
| POST | `/api/ingest/web` | Data z rozšíření (token) → `{ ok, id }` |
| GET | `/api/extension/pair` | `{ token, version }` jen pro `Origin: chrome-extension://…` |
| POST | `/api/spend/ledger` | Nový výdaj → 201 `{ entry, spend }`; 422 s `errors` |
| PATCH | `/api/spend/ledger/:id` | `{ endDate: "RRRR-MM-DD" \| null }` — ukončení předplatného |
| DELETE | `/api/spend/ledger/:id` | `{ spend }` |
| PUT | `/api/spend/budgets` | `{ total?, currency?, rates?: {USD, EUR}, services?: {služba: částka \| ""} }` → `{ spend }` |
| GET | `/api/alerts` | `{ unread, items }` (max 300, nejnovější první) |
| POST | `/api/alerts/read` | `{ ids: string[] \| "all" }` → `{ unread }` |
| POST | `/api/alerts/test` | Testovací upozornění |
| PUT | `/api/settings` | `{ notifications: Partial<Notifications> }` → `{ settings }` |
| POST | `/api/integrations/claude-hooks/install` \| `uninstall` | `{ claudeHooks: HooksStatus }`; 422 při neplatném settings.json |
| PUT / DELETE | `/api/secrets/:id` | `openai-admin` \| `anthropic-admin`; PUT `{ value }` → `{ integrations }` |
| POST | `/api/connectors/rescan` | `{ connectors }` |

## SSE události (`/api/stream`)

| Událost | Data |
|---|---|
| `hello` | `{ version, now, ready }` — po každém (znovu)připojení; klient stáhne `/api/state` |
| `session` | `SessionSummary` (jen při skutečné změně) |
| `session:remove` | `{ id }` |
| `transcript` | `{ id, reset: boolean, entries: TranscriptEntry[] }` — nové **nebo aktualizované** položky (upsert podle `seq`) |
| `runtimes` | `Runtime[]` |
| `limits` | `Limit[]` |
| `credits` | `CreditRecord[]` |
| `alert` | `{ alert: Alert, unread }` |
| `alerts` | `{ unread }` |
| `spend` | `SpendPayload` |
| `connectors` | `ConnectorStatus[]` |
| `settings` | `Settings` |
| `integrations` | `Integrations` |

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
  title: string;
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

## Trvalá data `~/.dirigent/data.json`

`{ version: 1, ingestToken, settings, spend: { currency, rates, budgets, ledger }, alerts (max 300), alertKeys (deduplikace, TTL 60 dní), credits }` — zapisováno atomicky s právy 0600.
