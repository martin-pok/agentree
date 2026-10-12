# Release readiness — Agenteeq

**Aktualizováno 12. 10. 2026.** Tento dokument je kontrolní seznam, nikoliv potvrzení, že konkrétní instalace prošla ručním testováním.

## Zdroj pravdy

- **v0.46.7** má ověřený tag na `00daf73bbdc2f3e7bb7342ae0a15ef4d5e1a4b90`; tento commit prošel **8/8 CI**. GitHub workflow `Vydání` dokončilo všechny platformy a založilo **neveřejný draft release ID `410716060`** se všemi osmi přílohami (macOS Apple Silicon DMG/ZIP, Windows ZIP, Chrome extension ZIP, tři stabilní názvy, `SHA256SUMS.txt`). Každá příloha má nenulovou velikost a `sha256:` otisk v GitHub API. Jde o **hotové sestavení, ne publikované vydání ani schválenou instalaci na zařízení**; Mac build je ad-hoc podepsaný, nikoli Developer ID/notarizovaný. UAT: [issue #157](https://github.com/martin-pok/agentree/issues/157). Zveřejnění zůstává manuální krok výhradně přes `publish.yml` s `channel=preview`, po ověření release gate.
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
| Integrita publikovaných balíčků | `publish.yml` znovu stáhne **všech osm** příloh draftu a `scripts/verify-release-assets.mjs` porovná úplnost, velikost i SHA-256 s manifestem a GitHub API včetně shody stálých/číslovaných variant | Při jakékoli neshodě zastavit publikaci |
| Ruční QA | Mac, Windows beta, Chrome v CZ i EN podle [TESTING.md](TESTING.md) | Neoznačovat jako ověřené |
| Schválení a kanál | výslovně zvolit `preview` nebo `stable` při ručním `publish.yml`; pro Stable navíc potvrdit změnu `Latest` | Preview nikdy nesmí změnit stabilní `Latest`; koncept bez schválení ponechat neveřejný |

## Jaký je další postup

1. Projít nový draft `v0.46.7` a release notes proti požadavkům v issue #157. Zdroj a checksumy jsou sestavené, fyzická instalace se zatím neověřila.
2. Na skutečném Apple Silicon Macu zkontrolovat DMG, Gatekeeper (ad-hoc podpis), správnou ikonografii, Google OAuth, avatar, upgrade a návrat do konverzace; u Windows beta a Chrome přidat skutečné smoke testy.
3. Před publikací spustit `publish.yml` s výslovným kanálem `preview`: automatický krok znovu stáhne přílohy draftu, ověří všechny skutečné SHA-256 otisky proti `SHA256SUMS.txt` a GitHub API a odmítne nesoulad.
4. Pouze po schválení UAT a všech kontrol zveřejnit `v0.46.7` jako Preview. Stabilní `Latest` musí nadále ukazovat na `v0.46.0` až do samostatného rozhodnutí o Stable.

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
