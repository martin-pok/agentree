# Agenteeq 0.46.1 — connector and authentication acceptance

**Status: automated fixes prepared on a review branch. This is NOT a real-Mac sign-off.** The baseline is the actual `src/napojeni.js`, `src/connectors/web.js`, Chrome extension adapters and `docs/ACCOUNTS.md`. CI mocks do not demonstrate that a third-party service currently lets a user sign in.

## Two different meanings of “connected”

**Provider-authenticated CLI (Claude Code / Codex):** Settings → Connect → the provider's *own installed CLI* starts its login in the browser. Complete the provider's confirmation/return (the CLI owns its localhost callback). Agenteeq polls the official CLI login status, then refreshes local account information **before** issuing the success event. If there is no local transcript yet, the modal must say so — no invented token data, limits or spending.

**Observed website (Chrome extension):** Settings → Connect opens the official supported site. User signs in there separately. The paired Chrome extension reports actual conversation status/counts over authenticated localhost ingestion. A fresh observation **is not OAuth authentication** and must be labeled as an observed browser feed. No message text is transferred.

**Google account of Agenteeq:** independent PKCE login via Supabase Auth → Google → one-time loopback callback (Mac), or localized website account page. An actual Google consent-screen round trip, photo and signed-in session can only be verified with a real user session; code mocks are not proof.

**API Admin keys:** separate from personal ChatGPT/Claude subscriptions and OAuth. Admin API billing must not be represented as individual subscription expenditure.

## Provider coverage at Settings → Connections

| Provider | Mechanism | Signal that confirms | Required live UAT |
| --- | --- | --- | --- |
| Claude Code | Native `claude auth login --claudeai` + CLI status | `loggedIn: true`; updated local profile, optional data timestamp | Login, cancel, retry, upgrade, stale cache, plan and first session |
| Codex | Native `codex login` + CLI status | Verified `Logged in using …`; updated local profile | Login, cancel, retry, profile and first session |
| ChatGPT | Extension | Fresh authenticated-extension ingest from chatgpt.com | Logged-in and logged-out tab, streaming, close, reopen |
| Codex web | Extension | Fresh ingest from chatgpt.com/codex | Do not confuse with ordinary ChatGPT chat |
| Claude.ai | Extension | Fresh ingest from claude.ai | State/counts and stale tab |
| Gemini | Extension | Fresh ingest from gemini.google.com | State/counts and new conversation |
| Microsoft Copilot | Extension | Fresh ingest from copilot.microsoft.com | Beta: selector diagnosis and live state |
| Perplexity | Extension | Fresh ingest from perplexity.ai | Beta: selector diagnosis and live state |
| Grok | Extension | Fresh ingest from grok.com | Beta: selector diagnosis and live state |
| Qwen Chat | Extension | Fresh ingest from chat.qwen.ai | Beta: selector diagnosis and live state |
| GitHub Copilot web | Extension | Fresh ingest from github.com/copilot | Beta: selector diagnosis and live state |
| Cursor / VS Code Copilot / Gemini CLI / Qwen Code / Copilot CLI | Local files/processes | Existing connector's observed data with source/freshness | Not OAuth rows; real fixture/live machine check required |
| Ollama / LM Studio | Local host/model/process evidence | Only what the local API actually proves | Running host != active inference; confirm request lifecycle |
| Anthropic / OpenAI Admin API | User-supplied admin credentials | Successful authorized billing response | Distinguish billing API from subscriptions; 401/403/429 and secret storage |
| Agenteeq Google account | Supabase PKCE | Fresh callback and session from Google; account/profile photo | Login, cancel, popup blocked, expired code, logout, offline, reload |

## Security invariants

- Browser-event proof must never be called an OAuth approval. A compromised tab or stale extension must not silently unlock a provider account.
- An unsuccessful CLI status command cannot establish authentication even if output contains login-looking text.
- Re-run local account data before confirmation; a failed refresh must say data unavailable, not “all data ready.”
- After user cancellation, late async refresh must **not** reopen a success modal.
- `/api/ingest/web` accepts only the declared service host/path on HTTPS; strip query strings/fragments so temporary URL tokens and user queries are not preserved.
- Preserve least-privilege extension tokens (separate from Claude hooks), host/origin checks, CSRF prevention, no provider passwords or refresh tokens in logs, and no transcript contents in extension uploads.
- Provider plan, subscriptions, token usage, limits, organization billing and conversation status are **different signals**. Do not synthesize values when the source does not supply them.

## Log and end-to-end verification gate

Automated CI can inspect source code, HTTP responses, mocked OAuth providers, extension protocol, SSE replay and Chromium/WebKit rendering. It **cannot** read live `~/Library/Logs`, actual local process logs, Keychain entries, or personal service sessions on the user's Mac.

At real-device UAT, record for **each** provider: Connect click time; official domain opened; browser callback or extension activity time; CLI command exit status (without stdout secrets); status probe success/failure; first verified session and age; account/plan freshness; SSE time; UI confirmation; disconnect/revocation; relogin; app restart; and whether **the same data** reappears. Collect elapsed times and redact tokens, emails, personal paths, conversation content, full URLs with queries, and authorization codes before storing any logs.

**Acceptance:** No “Connected” badge for mere website activity. No assertion that data is current when it is not. Confirm only supported live credentials and report partial/beta states without hiding errors. Do not close the gate without macOS UAT and a real Chrome Store-extension version check.
