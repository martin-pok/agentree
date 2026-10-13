# Release readiness — Agenteeq

**Aktualizováno 13. 10. 2026.** Tento dokument je kontrolní seznam, nikoliv potvrzení, že konkrétní instalace prošla ručním testováním.

**P0 legal gate před komerčním/placeným vydáním:** [Pracovní právní sada](legal/README.md) je výslovně označená jako DRAFT, nikoli účinné Terms, legal opinion nebo certifikace. Je třeba dokončit identitu správce, GDPR Art. 13 v CZ/EN, neveřejný kanál žádostí namísto veřejných GitHub Issues, síťový/retention audit, vlastnictví IP a spotřebitelská pravidla; aktuální [issue #224](https://github.com/martin-pok/agentree/issues/224). **Neumisťovat na veřejný web nepodepsané šablony ani badge certifikací.**

## Zdroj pravdy

- **v0.46.11: jediný aktuální release kandidát, soukromý Draft kompletní a bajtově ověřený, nikoliv veřejný.** Zdrojový commit `1e72a0057637ad249e70388444346a80526e7083` po [PR #215](https://github.com/martin-pok/agentree/pull/215) prošel [8/8 main CI](https://github.com/martin-pok/agentree/actions/runs/38430918556); anotovaný tag `v0.46.11` míří přesně tam. [Release + automatický nezávislý audit](https://github.com/martin-pok/agentree/actions/runs/38432569881) založily **Draft release ID `411899483`, 8 příloh** a znovu stáhly každý soubor z GitHub REST: `assetsVerified=8`, `archiveCount=7`, `draft=true`; všechny SHA-256 souhlasí s GitHub API a všech 7 archivů s `SHA256SUMS.txt` (artefakt `release-draft-audit` ID `11831787377`). Obsahuje aktuální brand pro Mac/Windows/web/Chrome, CZ/EN release notes a regresní kontrolu ikon v reálném Windows ZIPu. **Zbývá:** otestovat instalaci a upgrade na skutečném Apple Silicon Macu včetně Gatekeeperu, Google SSO/avataru a navrácení do původních relací, Windows beta/Chrome instalaci a přesné ikony; bez toho nelze tvrdit hotové UAT ani distribuci. Manual `publish.yml` **již opravený v [PR #216](https://github.com/martin-pok/agentree/pull/216)**: používá REST by ID pro soukromé Drafty, SHA-256 znovustažených bajtů, ochranu Stable Latest a před zveřejněním kontroluje nezměněné přílohy. PR i následné [main CI #38440054592](https://github.com/martin-pok/agentree/actions/runs/38440054592) prošly **8/8**; jde o **připravenost workflow**, nikoli živé UAT, schválení nebo publikaci. Po skutečném ověření zařízení je stále nutné výslovně schválit ruční vydání **pouze `v0.46.11` jako Preview**. Po zveřejnění ověřit `draft=false`, `prerelease=true`, downloady, aktuální CZ/EN changelog a nezměněný Stable Latest `v0.46.0`. Samostatně ověřit reálný Chrome Store update [#172](https://github.com/martin-pok/agentree/issues/172) a Vercel avatar/PWA pixelovou shodu [#213](https://github.com/martin-pok/agentree/issues/213). **Žádné nové tagy, přepisování starších Draftů ani předstírání instalace.**
- **v0.46.10: neveřejný Draft je sestavený, nezávislý byte audit a UAT stále otevřené.** [PR #206](https://github.com/martin-pok/agentree/pull/206) a [PR #207](https://github.com/martin-pok/agentree/pull/207) byly sloučeny; zdrojový commit `10cefd1bc09256dc307996a0f08380b5533b22e2` prošel [8/8 `main` CI](https://github.com/martin-pok/agentree/actions/runs/38405805432). Anotovaný tag `v0.46.10` odkazuje na přesně tento commit. [Workflow Vydání](https://github.com/martin-pok/agentree/actions/runs/38406755030) dokončilo sestavení a založilo **Draft ID `411720718` s 8 přílohami**, jejichž metadata v GitHub API mají SHA-256. [Nezávislý audit](https://github.com/martin-pok/agentree/actions/runs/38422293844) reálně stáhl všech 8 příloh a ověřil jejich SHA-256 proti GitHub API i 7/7 proti manifestu (`assetsVerified=8`, `archiveCount=7`, artefakt ID `11826814020`); PR #211 opravil spouštění auditu. **Zatím nepotvrzené:** Mac/Chrome/Windows UAT, Google OAuth a fotka, pixelová kontrola všech ikon, veřejné vydání a instalace na uživatelově Macu ([#208](https://github.com/martin-pok/agentree/issues/208)). Draft v0.46.9 zůstává neměnný. **Brand gate:** starý `desktop/Agenteeq-icon.png` s odlišnými proporcemi byl nalezen ve zdrojích a Windows aplikace jej dosud mohla kopírovat dovnitř archivu; pro další buildy musí být fyzicky odstraněn a všechny podporované ikony otestovány proti masteru. Změny brandu sloučené až po tagu nejsou automaticky obsahem Draftu v0.46.10.
- **v0.46.9: existující neveřejný Draft, zatím nikoli vydaná aktualizace.** Sjednocené verze v package/extension, CHANGELOG a „Co je nového“ byly sestavené z tagu `v0.46.9` na `d6e16eb5946da1cfb33d28b7358a5b5ddee03983`. [Přesné CI](https://github.com/martin-pok/agentree/actions/runs/38370312412) 8/8 zelené; [release workflow](https://github.com/martin-pok/agentree/actions/runs/38371118618) úspěšně vytvořil Draft ID `411468280` s 8 přílohami. [Nezávislý audit uložených souborů](https://github.com/martin-pok/agentree/actions/runs/38390677679) reálně stáhl všech osm příloh, ověřil jejich SHA-256 proti GitHub API i sedm záznamů proti `SHA256SUMS.txt`: `assetsVerified=8`, `archiveCount=7`, `draft=true`. Důkaz: `release-draft-audit`, artifact ID `11808737176`. **Ani tento úspěch nenahrazuje skutečné Mac/Windows/Chrome UAT; 0.46.9 stále není veřejně vydaná, nainstalovaná nebo publikovaná v Chrome Store.** Další postup v [issue #194](https://github.com/martin-pok/agentree/issues/194).
- **v0.46.8:** tag na přesném zdrojovém commitu `dd32fa98879a8c34137c6bde49b50dc205202e93`; PR #184 i výsledné `main` prošly **8/8 CI**. Automatické `prepare-preview-draft.yml` úspěšně předalo build workflow [Vydání #38304142467](https://github.com/martin-pok/agentree/actions/runs/38304142467), všechny platformy prošly a GitHub vytvořil **neveřejný draft release ID `410973749` s 8 přílohami**. Všech osm příloh bylo 13. 10. nezávisle staženo z tohoto draftu a ověřeno proti digestům GitHub API; sedm archivů také proti `SHA256SUMS.txt` (`scripts/verify-release-assets.mjs`: 8/8). Izolované spuštění skutečného macOS ZIPu na Apple Silicon Macu prošlo 11/11 nativních smoke kontrol; podrobnosti níže. **Není to veřejný release ani ověřená instalace/aktualizace běžné aplikace.** Evidence: [issue #187](https://github.com/martin-pok/agentree/issues/187). Další kód sloučený po tagu není v těchto instalátorech.
- **v0.46.7** má ověřený tag na `00daf73bbdc2f3e7bb7342ae0a15ef4d5e1a4b90`; tento commit prošel **8/8 CI**. GitHub workflow `Vydání` dokončilo všechny platformy a založilo **neveřejný draft release ID `410716060`** se všemi osmi přílohami (macOS Apple Silicon DMG/ZIP, Windows ZIP, Chrome extension ZIP, tři stabilní názvy, `SHA256SUMS.txt`). Každá příloha má nenulovou velikost a `sha256:` otisk v GitHub API. Jde o **hotové sestavení, ne publikované vydání ani schválenou instalaci na zařízení**; Mac build je ad-hoc podepsaný, nikoli Developer ID/notarizovaný. UAT: [issue #157](https://github.com/martin-pok/agentree/issues/157). Zveřejnění zůstává manuální krok výhradně přes `publish.yml` s `channel=preview`, po ověření release gate.
- Poslední potvrzené **zveřejněné** Preview: **[v0.46.6](https://github.com/martin-pok/agentree/releases/tag/v0.46.6)** (12. 10. 2026, 11:45 UTC). Tag míří na commit `27f3d2a`, CI pro tento SHA má 8/8 úspěšných kontrol, release build prošel a osm příloh Mac/Windows/Chrome včetně `SHA256SUMS.txt` je dostupných s nenulovou velikostí a zveřejněnými SHA-256 otisky. Stabilní Latest zůstává **v0.46.0** (9. 10. 2026). Živé UAT Mac instalace, aktualizace, Google přihlášení a Windows zařízení nebylo provedeno.
- Spouštění QA: `.github/workflows/test.yml`; sestavení: `.github/workflows/release.yml`; zveřejnění: `.github/workflows/publish.yml`.
- **Nepřebírat statusy z README ani z tagu:** veřejnou dostupnost musí potvrdit `GET /repos/martin-pok/agentree/releases/tags/v<version>` s `draft=false` a skutečnými assety. **Pozor: GitHub tento endpoint vrací jako HTTP 404 u neveřejného draftu.** Před publikací musí `publish.yml` zjistit `databaseId` z autentizovaného `gh release view`, načíst `GET /releases/<ID>`, ověřit stejný tag + `draft=true` a až potom nezávisle porovnat SHA-256 skutečně stažených bajtů. Nelze zaměňovat 404 draftu s chybějící verzí.

## Dílčí ověření kandidáta 0.46.8 na Macu — 13. 10. 2026

- Zdroj binárky: osm skutečně stažených příloh neveřejného draftu `410973749`. Verifikátor potvrdil všech 8/8 názvů, velikostí a SHA-256 vůči GitHub API a sedm archivů vůči `SHA256SUMS.txt`. Mac ZIP má SHA-256 `f8060456cb3e6145e019c64d46aedf785161be90cffbdc47b8a1dc0dd8329dd6`; DMG `e3b93866c9edf38c101aa938dc59c81321564f73a6e04c073393e6873b37f239`.
- Prostředí: skutečný Mac s Apple Silicon, macOS 27.0.1, izolovaná testovací data a port (`AGENTEEQ_DESKTOP_QA=1`, `AGENTEEQ_SOURCE_HOME` a `AGENTEEQ_HOME` v dočasné složce, cloud/Keychain/procesy vypnuté). Skutečný ZIP běžel přes `npm run qa:native` z `main` `aa63cfec6abd1e9060ba5b2210da573f78a73f8c`: **11/11** včetně platného ad-hoc podpisu, startu přibaleného Node, vykreslení okna/navigace, odsazení pod záhlavím a ukončení serveru spolu s oknem. Snímek zachytil úvodního průvodce; nezaznamenává dokončení průvodce ani práci s reálnými účty.
- Skutečný DMG šel připojit jen pro čtení; obsahuje `Agenteeq.app` verze `0.46.8`, arm64 a odkaz do `/Applications`. `codesign --verify --deep --strict` prošel, ale podpis je **ad-hoc, bez Team ID**. `spctl --assess` na tomto systému vrátil `internal error in Code Signing subsystem`; Gatekeeper tím není ověřený.
- V `/Applications` zůstala původní `0.46.3`; QA ji nevyměnilo. Instalace z Finderu, upgrade a zachování dat, Dock po instalaci, Google OAuth/avatar, skutečné Chrome párování a Windows zařízení stále čekají na samostatné UAT. Lokální celoplošný snímek z QA neukládat do veřejného repozitáře, protože zachycuje i obsah plochy.

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
| Neměnný zdroj publikace | `publish.yml` uloží SHA tagu při ověření CI a porovná jej s tagem z GitHubu i lokálním tagem při tvorbě poznámek; před změnou viditelnosti jej ověří znovu. Přesunutý tag znamená nový schvalovací cyklus, nikoli převzetí jiného zeleného commitu. | Při změně SHA zastavit publikaci |
| Ruční QA | Mac, Windows beta, Chrome v CZ i EN podle [TESTING.md](TESTING.md) | Neoznačovat jako ověřené |
| Schválení a kanál | výslovně zvolit `preview` nebo `stable` při ručním `publish.yml`; pro Stable navíc potvrdit změnu `Latest` | Preview nikdy nesmí změnit stabilní `Latest`; koncept bez schválení ponechat neveřejný |

## Jaký je další postup

**Audit release draft** se automaticky spouští po úspěšném sestavení nového Draftu a jednorázově po zavedení tohoto workflow pro již hotovou 0.46.9. Volitelně lze stejný audit spustit ručně z GitHub Actions s přesným tagem, např. `v0.46.9`. Workflow provádí pouze čtecí operace, ale auditovací úloha potřebuje omezené oprávnění `contents: write` jen k zobrazení neveřejných GitHub Draftů; žádný příkaz nic neupravuje. Stáhne všechny skutečné přílohy, porovná jejich SHA-256 s GitHub API i `SHA256SUMS.txt` a uloží malý `release-draft-audit` report. Úspěšný audit **nenahrazuje** instalaci, Google OAuth, vizuální kontrolu ikony ani další reálné UAT. Nespouští publikaci.

1. Draft `v0.46.8`, release notes, skutečné stažené přílohy a izolovaný nativní start jsou ověřené výše. Fyzická instalace a upgrade se zatím neověřily.
2. Na skutečném Apple Silicon Macu zkontrolovat DMG, Gatekeeper (ad-hoc podpis), správnou ikonografii, Google OAuth, avatar, upgrade a návrat do konverzace; u Windows beta a Chrome přidat skutečné smoke testy.
3. Před publikací spustit `publish.yml` s výslovným kanálem `preview`: automatický krok znovu stáhne přílohy draftu, ověří všechny skutečné SHA-256 otisky proti `SHA256SUMS.txt` a GitHub API a odmítne nesoulad.
4. Pouze po schválení UAT a všech kontrol zveřejnit `v0.46.8` jako Preview. Starší `v0.46.7` draft nepřepisovat ani automaticky nepublikovat. Stabilní `Latest` musí nadále ukazovat na `v0.46.0` až do samostatného rozhodnutí o Stable.

5. Samostatnou novější `v0.46.9` jako Preview lze zveřejnit až po zeleném CI přesného commitu, novém tagu, ověřeném draftu, dokončeném zařízení UAT a výslovném schválení. Nikdy ji neoznačovat za dostupnou jen podle čísla v kódu.
6. Nejnovější `v0.46.11` jako Preview lze zveřejnit pouze po zeleném kompletním CI kandidáta 0.46.11 i přesného `main` commitu, vytvoření **samostatného** neměnného tagu a Draftu, nezávislé kontrole skutečných příloh a splnění živého UAT v [#208] a [#213](https://github.com/martin-pok/agentree/issues/208). Zveřejnění nesmí změnit Stable Latest ani automaticky aktualizovat Chrome Web Store.

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
