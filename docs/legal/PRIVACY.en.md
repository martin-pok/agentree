# Agenteeq — Privacy Notice (English draft for legal review)

**DRAFT ONLY · NOT EFFECTIVE OR PUBLISHED.** Prepared 13 October 2026. Effective date **[INSERT ON APPROVAL]**. This is a working revision of `site/en/privacy/index.html`, not a substitute until technical and legal verification is complete.

## 1. Identity of the controller and contact
The controller for account, support and website operations is **[VERIFIED LEGAL NAME, BUSINESS IDENTIFIER IF APPLICABLE, FULL ADDRESS]**, reachable for GDPR data-subject requests at **[DEDICATED NON-PUBLIC PRIVACY EMAIL]** and security matters at **[SECURE CONTACT]**. DPO: **[STATE IF APPOINTED/REQUIRED]**. Do not submit a private data access or erasure request through a public GitHub Issue.

Local-first app functionality runs on the user's own machine. Whether the provider acts as a controller/processor in a given local-only operation must be assessed based on actual determination of the purposes and means; we do not claim the whole product processes no personal data when optional accounts and network requests exist.

## 2. Categories, purposes and lawful bases
**Local application data:** The application may read permitted AI tool metadata, transcripts, project paths, agent processes and preferences on the user's computer to display a real-time overview. These local text and code files are not intended to be uploaded to the optional Agenteeq account. Local storage is managed by the software and the user's device; precise paths and deletion behavior must be verified.

**Optional account and summary sync:** Google sign-in supplies an account identity and authorised profile information, potentially name, email and avatar metadata, to authenticate an optional account. Authenticated numeric summaries can include device version/platform, last seen time, per-day counts of agents/tokens/conversations, spending and limits and provider connection status. The intended lawful basis for providing this user-requested service is GDPR Article 6(1)(b) (contract performance), subject to verification of each exact processing operation. Conversation bodies, private file paths, code and passwords are **not intended** to be transferred in this summary sync. The downloaded avatar is intended to stay on-device. The optional account is not necessary for the local app's core functions; without an account optional sync is unavailable.

**Website and routine online requests:** The website is served by Vercel and may result in technical access logs including IP, request date and user-agent. The app checks public releases on GitHub to verify updates, and may obtain currency rates from the Czech National Bank. These technical requests do not contain local AI conversation content, but recipients can process technical network data. Intended legal basis for our necessary security logs is legitimate interest in secure service provision (Article 6(1)(f)) following balancing; requested functional operations may be necessary to provide the service (Article 6(1)(b)). Recipient sites may have their own controller responsibilities.

**Provider connections:** At the user's request, model sign-in and usage/billing API calls interact with the appropriate third-party provider (such as Anthropic, OpenAI or Google) under its terms; an explicit prompt insertion action may intentionally send user-supplied content to the provider and is distinct from Agenteeq account sync. Native API credentials are intended to use the macOS Keychain where supported; independently verify current implementation.

**Support and security reports:** Contact details and communications voluntarily supplied for support or claims may be processed to fulfil the service contract or for appropriately balanced legitimate interests. For statutory invoicing (if sales are activated), processing may be necessary to meet a legal obligation. **No live payment flow has been verified**, and payment processors/retention must be described before activation.

## 3. Recipients and international transfers
Potential recipients/suppliers include Supabase for the optional account and summary storage (EU Frankfurt region stated by the project), Vercel website hosting, Google identity, public GitHub release checks, Czech National Bank and third-party AI services when enabled. Legal classifications as controller/processor, DPAs, subprocessors and recipient access must be verified: **[INSERT VERIFIED PROCESSOR REGISTER AND CONTACT/REGION INFORMATION]**.

An EU server region does not alone prove all remote support/metadata processing stays within the EEA. **[INSERT ANY INTERNATIONAL TRANSFER COUNTRIES, ARTICLE 45 ADEQUACY OR ARTICLE 46 SCC SAFEGUARDS, AND HOW TO REQUEST A COPY]**. Until confirmed, do not advertise “all personal data always stays in the EU”.

## 4. Retention and deletion
- Local working data: held on the user-controlled device until deletion via the app/OS; removing Agenteeq does not automatically remove files belonging to other AI tools.
- Optional account and synced summaries: **[INSERT VERIFIED RETENTION, USER-INITIATED DELETE, BACKUP ERASURE TIMELINE AND ANY LEGAL EXCEPTIONS]**.
- Website/security logs and support records: **[INSERT VERIFIABLE HOST AND SUPPORT RETENTION OR OBJECTIVE CRITERIA]**.
- Statutory accounting records: **[INSERT ONLY IF PAID BUSINESS LAUNCHES]**.
Do not promise instant deletion of every backup or log without actual evidence.

## 5. Your rights
Where applicable you may request access, rectification, erasure, restriction, portability, object to processing based on legitimate interests and withdraw consent wherever consent is the actual lawful basis. Requests are handled subject to statutory conditions and exceptions, normally within one month under GDPR. You may complain to the Czech Data Protection Authority (https://uoou.gov.cz) or another competent supervisory authority. Personal identity verification, where necessary, should be proportionate and private, not via public GitHub.

## 6. Cookies and technical storage
The current website states it uses no advertising, analytics or tracking cookies; the application/extension can store necessary pairing, session and preference data locally. **[AUDIT ACTUAL COOKIES, LOCAL STORAGE, PURPOSES, DURATIONS, AND EU EPRIVACY CONSENT REQUIREMENTS]**. Adding optional analytics would require an updated notice and any legally necessary consent.

## 7. Policy changes
Material revisions will be versioned and published with an effective date and any required advance notice. Contact and evidence must be kept current. **[INSERT VERIFIED EFFECTIVE DATE, OPERATOR IDENTITY, CURRENT PROCESSORS AND RETENTION]**.

**Not approved for publication while any placeholder or unsupported claim remains.** Technical/legal reconciliation: [PRIVACY-REVIEW.cs.md](PRIVACY-REVIEW.cs.md). GDPR articles 6, 12–14, 15–22, 28, 44–49: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679 .
