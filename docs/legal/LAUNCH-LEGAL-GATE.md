# Agenteeq — legal and claims go/no-go checklist

**Working paper, 13 October 2026. Not legal approval, registration, certification or public policy.**

## P0 — before public commercial availability
- [ ] **Entity**: verified operator/controller name, business ID, registered/contact address and non-public contact e-mail in CZ/EN website; verify whether entrepreneur registration/consumer-information obligations apply. No invented personal or company details.
- [ ] **Privacy**: rewrite currently incomplete public `site/soukromi` + `site/en/privacy` with GDPR Art. 13 (purposes, lawful bases, controller, retention, recipients, transfers, rights, DPO if required, consequence of optional account), real network inventory (updates via GitHub and CNB, Vercel logs, optional Google/Supabase/cloud, provider APIs). Do not send sensitive requests through public GitHub Issues. [PRIVACY-REVIEW.cs.md](PRIVACY-REVIEW.cs.md)
- [ ] **DPA + security**: audit real supplier roles, Vercel/Supabase/Google terms, EEA transfers, regional storage vs support access, cloud account delete, backup retention, credentials, RLS, incident communication.
- [ ] **Terms**: legal counsel reviews [TERMS.cs.md](TERMS.cs.md) and [TERMS.en.md](TERMS.en.md); decide launch scope beta (free/paid), activation, platform/connector support, acceptance, refund/defects and real customer support channel.
- [ ] **IP**: document true owner/assignment/contractor rights, no unresolved employer/company rights, font/image licences, third-party marks, source licence policy; legal clearance before paying for Czech/EU trademark. [IP-REGISTER.md](IP-REGISTER.md)
- [ ] **Signing**: production Mac/Windows user warnings are truthful; do not market “verified Apple developer / notarized” without actual Developer ID / notarization.
- [ ] **Distribution proof**: 0.46.11 public GitHub release **not yet published**, 0.46.11 Chrome Store **not uploaded**, manual real-device UAT missing; claim “available 0.46.11 everywhere” is false. [#208](https://github.com/martin-pok/agentree/issues/208), [#172](https://github.com/martin-pok/agentree/issues/172).
- [ ] **Third-party permissions**: Chrome Store Limited Use, provider integrations; preserve provenance, minimal permissions and do not overclaim access to users' chats/costs/limits.
- [ ] **No fake trust badges**: GitHub Scorecard, Mozilla Observatory or TLS scan are technical audit tools only; claims of ISO, GDPR-certified, W3C-certified or a registered mark require actual third-party or official evidence.

## P0 only if charging consumers
- [ ] Checkout UI: complete provider identity and contact, total prices incl VAT, automatic renewal, billing cycle, transparent button and order confirmation, technical steps and terms on durable medium.
- [ ] Consumer rights: mandatory conformity/remedies for digital content and services, withdrawal (normally 14 days) and digital content exceptions **only** when legally required express consent/acknowledgment/confirmation exist; cancellations and support.
- [ ] Handle complaints in required timeframes; ADR references and local requirements vetted by qualified counsel per target jurisdiction.
- [ ] Tax/accounting invoices, lawful payment processor and privacy/DPA, proper records and platform terms.

## P1 before showing on site
- [ ] Product owner + lawyer sign off final *dated* CZ and EN policy with source-of-truth URLs; keep change history and clear language precedence.
- [ ] Add visible terms, privacy, brand/press use and support links to both languages and installation/app onboarding; users must be able to access before accepting/paying.
- [ ] Check WCAG, readability and 320px reflow; avoid dark patterns, forced prechecked consent, cookie banner if not actually needed.
- [ ] Maintain secret/no-personal-data guardrails for public repo: private contracts and evidence stored separately with restricted access.
- [ ] Operational procedure: 30/60/90-day review of users' reported claims, privacy logs, incident response and actual report/badge expiry.

## Practical ownership matrix
| Task | Engineering evidence | Account/owner evidence | Legal sign-off |
|---|---|---|---|
| Current web privacy | Trace all network endpoints and retention behavior | Actual operator, DPA, contact, legal entity | Necessary |
| App terms CZ/EN | Features, version, availability and actual licensing | Checkout + refund policy, if paid | Necessary |
| Brand rules | Canonical asset hashes and licence inventory | Artist/contractor IP assignments, logo origin | IP review |
| Trademark filing | Candidate use, classes, search terms | Filed mark applicant and filing costs | Strongly recommended |
| OpenSSF / Observatory / TLS | Actual reproducible report URL | Choose public/private repo and badges disclosure | Not a substitute for legal compliance |

**Never store actual confidential legal contracts or identity documents here.** For a private repository, retain GitHub connector access (permissions) and explicitly define who can view it. The private status does not itself secure previously leaked public Git history.

## Authoritative starting sources
- GDPR Art. 13 https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679
- EU digital content/services https://eur-lex.europa.eu/legal-content/cs/TXT/?uri=CELEX%3A32019L0770
- Consumer rights https://europa.eu/youreurope/citizens/consumers/shopping/shopping-consumer-rights/index_en.htm
- ÚPV https://upv.gov.cz/prumyslova-prava/ochranne-znamky/narodni-prihlaska-ochranne-znamky
- EUIPO https://www.euipo.europa.eu/cs/online-services
- OpenSSF https://openssf.org/projects/best-practices-badge/
- W3C https://www.w3.org/WAI/WCAG2AA-Conformance
