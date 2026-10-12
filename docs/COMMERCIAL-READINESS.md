# Agenteeq — commercial readiness & product positioning

**Working strategy, 11 October 2026.** This is a release/marketing decision aid, not a declaration that the product is ready to sell. Detailed technical acceptance gates remain in [RELEASE-READINESS.md](RELEASE-READINESS.md) and [SECURITY.md](SECURITY.md).

## Promise grounded in shipped functionality

**One place to see what your AI tools are doing, what needs your attention, and where limits and costs stand.** Lead with the actual app and real scenarios; do not position Agenteeq as a replacement for Claude, Codex or Cursor, or imply that every integration supplies identical live data.

- **Audience to validate first:** developers, solo founders and small agencies actively using at least two AI coding/chat tools.
- **Primary job to be done:** find the agent waiting for a decision without opening every tool.
- **Second job:** understand available usage limits, subscriptions and verified API expenditure without conflating estimates with billed costs.
- **Differentiator:** local-first desktop experience with optional browser extension and optional cloud account. Full conversation text is not uploaded by the account sync.
- **Trust boundary:** some sources are heuristic or beta, and source coverage must be visible. Local-first does not mean risk-free or offline-only.

## Conversion design: show, prove, then ask

| Stage | Customer question | Evidence / action | Acceptance |
| --- | --- | --- | --- |
| Hero | What does this do for me? | One crisp outcome, *real current product UI*, primary Mac beta download | First-screen CTA is clear at 320–1440 px and in CZ/EN |
| Product tour | What problem does it solve? | Attention-needed agent → direct return to its source; usage, projects and spend | Every visual maps to a working feature or is explicitly an illustrative example |
| Trust | What happens to my code and accounts? | Direct privacy-policy link beside local-first claims; explain optional sync | No absolute security promises; both languages link to corresponding policy |
| Download | Can I install it without fighting macOS? | Verified DMG + SHA-256, version and clear signed/notarized status | Real Apple Silicon install/update UAT; no misleading Gatekeeper copy |
| Activation | Did I receive value quickly? | First verified agent detected; offer explicit extension connection if needed | UAT observes time to first *verified* useful signal, not fabricated demos |
| Retention | Is it dependable enough for daily work? | Reconnect/restart, stale data, permission prompts and 20-agent stress | Automated QA plus real-device sign-off |

## Release tiers and non-negotiable gates

**0.46.1 Preview (test distribution):** full green CI on exact source SHA, Mac/Windows/extension build artifacts, version/tag consistency, installable DMG, truthful signing status, manual Apple Silicon acceptance. A Git tag or draft alone is not a release. Preview should not silently become the Latest stable download.

**Public paid distribution (not cleared):** Developer ID signing and notarization, clean machine install + upgrade, signed or independently verifiable checksums, verified OAuth login/profile picture and logout, real Chrome Store extension/version parity, legal review of privacy terms/EULA and processor agreements, support/rollback and incident process. Known issues must be documented and never marketed away.

**Security acceptance:** protect local API and remote scope; verify CSRF/origin/host controls and revocation; use system Keychain for secrets; never log credentials or transcript bodies; keep permissions minimal for extension and release CI; validate Supabase RLS with nonowner accounts; run secret scan and release artifact integrity checks. A self-assessment is not a third-party penetration test.

## Pricing and research — hypotheses, not a launched offer

- The current `PAID_FEATURES` map is empty; during beta, marketing must say functions are unlocked rather than imply a live paid plan.
- Interview 10 active target users before finalizing tiers. Ask about tool stack, frequency of blocked agent decisions, cost of missed interruptions, willingness to pay and what would make them uninstall.
- Keep truthful multi-agent visibility useful in the free offer; test a paid value layer around reliable advanced workflows or multi-account management **only when those features are complete**.
- No checkout, pricing table, paywall or performance percentage without a deliverable behind it.

## Measurement without betraying the privacy promise

Use consented research sessions, anonymous voluntary feedback and aggregate manually recorded activation tasks. The current product claims **no analytics/tracking**; do not silently introduce session replay, fingerprinting or telemetry for conversion experiments.

**Launch decision:** product owner approves pricing, external communications and public paid launch only after all above gates have evidenced pass/fail outcomes. Engineering may autonomously implement tested, reversible improvements on reviewable branches.
