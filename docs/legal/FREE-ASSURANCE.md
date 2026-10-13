# Zero-cost assurance and trust signals — truthful badge policy

**Evidence plan, not a certification**. 13 October 2026. “Free test”, “badge”, “formal certification”, and “legal compliance” are different things. Agenteeq must show only a badge the provider itself issued/authorises **for Agenteeq** and must link the actual current report and scope. No invented scores, logos or accreditation.

| Option | Monetary cost | Appropriate for current Agenteeq? | What it proves / what it does NOT prove |
|---|---|---|---|
| **OpenSSF Scorecard** ([project](https://openssf.org/projects/scorecard/), [official action](https://github.com/ossf/scorecard-action)) | $0 for **public GitHub repo** using the official action | **Yes, if repo stays public and action is configured securely** | Automated source/security-practice checks and a report; **not** a pentest or product certification |
| **OpenSSF Best Practices Badge** ([criteria](https://www.bestpractices.dev/en/criteria/0)) | $0 self-assessment | **Not yet eligible** unless project adopts a real **FLOSS licence** and meets the criteria. Repo currently reports `license=null`; do not add open-source licence just to get badge. | Self-asserted criteria audited to limited extent; not ISO/SOC2 or independent certified security |
| **Mozilla HTTP Observatory** ([test](https://developer.mozilla.org/en-US/observatory/docs/faq)) | $0 public HTTPS scan | **Yes**, test actual production pages; verify and retain report | Headers, CSP, HSTS and HTTP web posture; does not test native app/OAuth/GDPR |
| **Qualys SSL Labs** ([server test](https://www.ssllabs.com/ssltest/)) | $0 subject to usage terms | **Yes**, test public production hostname | TLS endpoint/configuration rating, **not** certificate of software security or legal compliance |
| **GitHub Actions workflow status** ([runs](https://github.com/martin-pok/agentree/actions)) | $0 on publicly available CI within quotas | **Yes** for transparent engineering/readme only | That exact job ran and passed; not a third-party compliance badge |
| **WCAG 2.2 AA** ([W3C conformance](https://www.w3.org/WAI/WCAG2AA-Conformance)) | Internal technical/manual audit can be $0 | **Not yet claimable**: contrast + shape tests are partial; real human assistive-technology audit outstanding #217 | Self-asserted WCAG conformance **after full audit**. W3C states it does **not** verify badge claims. No “W3C certified” wording |
| **OWASP ASVS / SAMM checklists** ([OWASP](https://owasp.org/www-project-application-security-verification-standard/)) | $0 to use methodology | Yes internally | Model for self-review/security controls, not independent certification |
| **GDPR certification, ISO/IEC 27001, SOC 2, external pentest certificate** | Usually not free if externally accredited/audited | **Do not display** without real assessment and actual evidence | An internal checklist or “privacy-first” product claim does NOT equal certified compliance |

## Priorities to implement and verify
1. **Security headers / TLS**: assess public `https://agentree-fawn.vercel.app` in HTTP Observatory + SSL Labs. Record report URL, domain, date, score, false positives and mitigation issue. A scan result is public and does not test an authenticated private environment. **No scan results are asserted in this file**.
2. **OpenSSF Scorecard, only while PUBLIC**: review workflow and permissions, use the *official pinned action SHA* following its current docs (e.g. push/scheduled, read minimal and OIDC if publishing), then publish results from the verified linked report; avoid granting workflows broad `contents: write` or storing third-party secrets. Its free hosted action for *private* repos may require paid GitHub Advanced Security; CLI scan remains possible privately without pretending to have public hosted badge.
3. **CI status**: can link to current `main` tests once verified (8/8 on commit `af3c1fa2`, run 38440054592). If repo goes private, publicly embedded CI badges and links may stop working.
4. **WCAG**: implement full screen/state keyboard, labels, targets, 400% reflow, VoiceOver/NVDA, CZ/EN and reduced-motion checklist. Publish a dated, scoped *accessibility statement* if true and reviewed. **Do not use W3C conformance logo now**. Tracking #217.
5. **Security disclosure**: configure private vulnerability reporting or dedicated non-public email; do not invite researchers to post credentials in public issues.
6. **Marketing trust area**: prefer verifiable plain-text claims “Local-first”, “Optional cloud summary sync”, “Source audited SHA-256”, current edition and real privacy link. A badge must never make a claim the reported tool does not evaluate.

## Website gate
- [ ] Show report issuer, report scope (web vs code vs extension vs native), last updated date, direct evidence URL and (if relevant) score.
- [ ] Hide badge when audit expires, scope changes, report fails or repository becomes private; don't use a static green screenshot.
- [ ] Do not publish logos until awarded/verified; do not call automated security scans “certified secure” or call self-reported WCAG a W3C certification.
- [ ] No extra web trackers or third-party JS only to display a badge; prefer safe links and SVG from issuer if licence permits.
- [ ] Compare customer benefit, page speed and trust effects before adding badge clutter.

**Source of truth:** https://openssf.org/projects/best-practices-badge/ · https://github.com/ossf/scorecard-action · https://developer.mozilla.org/en-US/observatory/docs/faq · https://www.ssllabs.com/projects/ssllabs-apis · https://www.w3.org/WAI/WCAG2AA-Conformance
