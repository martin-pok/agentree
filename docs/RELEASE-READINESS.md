# Release readiness — Agenteeq

**Aktualizováno 12. 10. 2026.** Tento dokument je kontrolní seznam, nikoliv potvrzení, že konkrétní instalace prošla ručním testováním.

## Zdroj pravdy

- Aktuální připravovaná verze na release větvi je **0.46.7 Preview**, která zatím **nemá veřejný release ani instalační balíček**. Před sestavením vyžaduje přesný úspěšný GitHub CI run, verzi balíčku a Chrome manifestu shodnou s tagem a kontrolu artefaktů. Nikdy ji neoznačovat jako `Latest` bez samostatného schválení.
- Poslední potvrzené **zveřejněné** Preview: **[v0.46.6](https://github.com/martin-pok/agentree/releases/tag/v0.46.6)** (12. 10. 2026, 11:45 UTC). Tag míří na commit `27f3d2a`, CI pro tento SHA má 8/8 úspěšných kontrol, release build prošel a osm příloh Mac/Windows/Chrome včetně `SHA256SUMS.txt` je dostupných s nenulovou velikostí a zveřejněnými SHA-256 otisky. Stabilní Latest zůstává **v0.46.0** (9. 10. 2026). Živé UAT Mac instalace, aktualizace, Google přihlášení a Windows zařízení nebylo provedeno.
- Spouštění QA: `.github/workflows/test.yml`; sestavení: `.github/workflows/release.yml`; zveřejnění: `.github/workflows/publish.yml`.
- **Nepřebírat statusy z README ani z tagu:** veřejnou dostupnost musí potvrdit `GET /repos/martin-pok/agentree/releases/tags/v<version>` s `draft=false` a skutečnými assety.

## Povinné brány před zveřejněním

| Brána | Důkaz | Co znamená neúspěch |
|---|---|---|
| Stejný commit | SHA pro testy i tag a pracovní strom bez necommitnutých změn | Nesestavovat z jiného SHA |
| Jazyk a syntaxe | `npm run check`; `npm test`; `test/i18n.test.mjs` | Zastavit release |
| UI a přístupnost | `npm run qa:desktop`, `qa:extension`, `qa:site`, `qa:contrast` v CI | Zastavit release |
| Verze distribuce | tag = `package.json` = extension manifest = metadata sestavení | Zastavit release |
| Branding | `test/brand-robot.test.mjs` a vizuální kontrola PNG/ICO/ICNS i screenshotů | Zastavit publikaci |
| Zdroje dat | kontrola hranice „naměřené / odvozené / neznámé“ a citlivých informací v URL | Zastavit publikaci při regresi |
| Instalace | DMG, ZIP macOS Apple Silicon, Windows beta ZIP, Chrome extension ZIP a jejich checksumy | Zastavit publikaci |
| Ruční QA | Mac, Windows beta, Chrome v CZ i EN podle [TESTING.md](TESTING.md) | Neoznačovat jako ověřené |
| Schválení a kanál | výslovně zvolit `preview` nebo `stable` při ručním `publish.yml`; pro Stable navíc potvrdit změnu `Latest` | Preview nikdy nesmí změnit stabilní `Latest`; koncept bez schválení ponechat neveřejný |

## Jaký je další postup

1. Zvolit jediný SHA, dokončit všechny jeho CI joby a vyřešit případná selhání. Nenahrazovat test tichým vynecháním.
2. Porovnat nativní binární ikony, App bundle a screenshoty Chrome Store proti aktuálnímu značkovému SVG. Automatická kontrola SVG sama nestačí.
3. Na skutečném zařízení ověřit připojení, odpojení, návrat autorizace a upgrade bez ztráty nastavení.
4. Teprve poté vytvořit nebo opravit release tag, sestavit artefakty, ověřit checksumy a publikovat.

## Co zůstává mimo automatickou garanci

- Stav přihlášení u externích poskytovatelů, skutečné browser DOM po změně webu a notifikace na reálných telefonech.
- Developer ID/notarizace macOS, dokud nejsou dostupné přihlašovací údaje a nativní test.
- Právní schválení dokumentů a DPA.
- Automatické testy se nemohou vydávat za ruční QA produktového dojmu nebo viditelnosti loga v binárních ikonách.

**Zásada:** jen veřejné vydání s ověřenými balíčky smí být na webu označené jako dostupné. Nenahradit „neověřeno“ slovem „hotovo“.

## UAT matrix — global launch (release gate, not a claim of completion)

Every row must record: build SHA, OS/device, locale, test data, actual result, screenshot/log reference, tester, date and defect link. **Not executed = unverified**, never green by assumption.

| Scenario | Acceptance criteria | Negative / edge cases | Evidence |
|---|---|---|---|
| First launch on clean Apple Silicon Mac | DMG opens, app starts without Terminal workaround, main workflow discoverable | Gatekeeper, missing permissions, denied filesystem access, offline start | Real-device recording + notarization verification |
| Upgrade from published 0.46.0 | Settings, history, projects and device pairing preserved | Interrupted download, corrupt package, process restart, low disk space, rollback | Before/after state checks + application logs |
| Connect Claude Code / Codex | User sees real observed agent state and navigates to matching session | No installation, obsolete schema, permissions revoked, empty logs, concurrent agents | Provider-origin evidence and timestamp |
| API-derived usage / limits / costs | Each number has source and last successful observation; estimated vs billed clearly distinguished | 401, 403, 429, 500, timeout, zero, partial response, clock skew, DST, stale cache, reconnect | Mocked integration tests + real provider account |
| Extension pairing and refresh | Origin/token protections, active tab state, accurate recovery from disconnect | Wrong extension origin, expired code, token rotation, browser restart, site DOM change | Chrome real-profile test + API security assertions |
| Smartphone LAN/Tailscale | Valid paired device loads authorized overview and cannot access confidential transcripts | Network switches, sleep/wake, permission removal, malicious Origin/Host, unpaired device | iOS + Android where supported, security logs |
| Global usability and accessibility | Core goal reached without documentation; navigation, headings, focus and labels work | 320 px viewport, 200% zoom, keyboard-only, reduced motion, light/dark, CZ/EN, long text | Screen recordings, accessibility audit, task success |
| Persistent local-first storage | Offline reading works; data remains consistent after restart and updates | Abrupt quit, interrupted writes, corrupt DB, concurrent watchers, insufficient disk | Controlled fault injection + backup/restore |
| Licensing and checkout | Valid offline license activates correct features; payment maps to exactly one entitlement | Duplicate webhook, expired/invalid key, refund, offline validation, reinstall, clock tampering | Sandbox purchase-to-activation evidence |
| Uninstall / support | User can export or remove own data; diagnostics avoid prompts and secrets | Denied deletion, partial uninstall, wrong log redaction, loss of signing key | Real-device audit + privacy review |

### Freshness contract

- `observedAt` means the provider or source was actually observed, not merely that a cached record was rendered.
- `receivedAt` means Agenteeq received the information; it must not silently substitute for `observedAt`.
- A provider-reported timestamp and a locally inferred status must remain distinguishable in UI and exports.
- A reconnect, HTTP success or SSE heartbeat **does not** make an old provider reading fresh.
- Unknown or invalid timestamps must render as *unknown*, not *live*; future times require explicit clock-skew handling.
- Define per-source staleness thresholds only after measuring real update cadence; do not invent universal freshness SLAs.
- UAT must include empty results, partial data, out-of-order events, DST changes, device sleep/wake and provider rate limiting.

### Launch evidence and stop rule

Shipping is blocked if any critical defect remains open, any mandatory CI job fails, any supported OS lacks completed install/upgrade QA, or source freshness is presented inaccurately. No draft release is called published. Browser-only tests never replace real-device UAT.
