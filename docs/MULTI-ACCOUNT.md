# ADR — Univerzální správa více účtů LIBOVOLNÉHO AI poskytovatele

**Stav:** částečně implementováno; doplněna ochrana odmítnutí neověřených Claude identit, ale session-binding a oddělené Claude kvóty zůstávají nehotové; návrh tarifikace Pro je produktové doporučení, nikoliv schválená cena nebo aktivovaný paywall. **Datum:** 2026-10-11.

## Zjištěný stav implementace

- `src/provider-accounts.js` vytváří pseudonymní identitu `claude:<hash>` ze skutečného `accountUuid`, u Codexu `codex:<hash>` z `accountId`. Nesmí se ukládat OAuth tokeny ani emaily.
- `src/app.js` již obsluhuje `claudeAccounts`, `codexAccounts`, `providerAccounts()` a historické pozorování. `src/subscriptions.js` umí více plánů, ale zobrazení plánu neprokazuje identitu běžící session.
- `src/provider-accounts.js#normalizeCodexAccount` získává oddělené buckets limitů a credits z odpovědi účtu. Claude ze souboru `~/.claude.json` dodává plán/identitu, ale ne průkazně všechna zbývající okna jednotlivých účtů.
- `src/plans.js#PAID_FEATURES` je zatím prázdná: **žádný skutečně zapnutý multi-account paywall neexistuje**.
- Ke každé session chybí obecně spolehlivý immutable account binding pro více současně spuštěných profilů. **Nikdy** neodvozovat účet pouze z názvu služby, modelu, ceny nebo posledního globálně přihlášeného účtu.

## UX rozhodnutí: progressive disclosure

**Jedna licence od každé služby** je výchozí a zůstává plně čitelná bez nové sekce správy. Uživatelské rozhraní ukazuje pouze Claude, Codex atd. s aktuálními limity a zdrojem/časem odečtu.

**Více licencí jedné služby** aktivuje při více skutečně identifikovaných účtech složenou kartu poskytovatele (např. Claude), s jednotlivými podkartami „Claude 1“, „Claude 2“ (uživatelsky přejmenovatelnými). Každá karta má plán, identitu v anonymní podobě, profil/zařízení, zdroj a čerstvost odečtu, intervaly limitů s časem resetu, připojené běhy a poslední synchronizaci. Mezi účty lze filtrovat agenty a limity; barevné kódování **není jediná indikace** identity. Zastaralé údaje přecházejí do „Neznámé“, nikdy do 0 %.

## Datový kontrakt cílového řešení

`ProviderAccount`: `id` (pseudonymní stabilní klíč), `provider`, `alias`, `plan`, `source`, `hostId`, `observedAt`, `health`, `limitBuckets[]` (název, spotřebováno, reset, jednotka, observedAt, provenance).

`SessionAccountBinding`: `sessionId`, `accountId|null`, `confidence: verified|unresolved|user_assigned`, `source`, `observedAt`. Účet při běhu nejprve odvodit ze **stejného procesu/profilu/konfiguračního adresáře** jako session; když není doložen, zachovat `null` + „Účet nelze určit“. Uživatelské přiřazení je explicitní metadata, není samo o sobě důkaz odečtu kvóty.

**Limity** agregovat jedině uvnitř stejného účtu, stejného limitního okna a stejné jednotky. Limity různých účtů/modelů nikdy nesčítat do falešné společné rezervy. Pro Claude 5h/7d a Codex primary/secondary zobrazit oddělená okna. Modelový limit zobrazit jen tehdy, pokud zdroj jednoznačně identifikuje model/bucket. Cenové plány nejsou API kredity ani příslib objemu tokenů.

## Monetizace

Navržené klíčové oprávnění: `providerMultiAccount: 'pro'`. **Neaktivovat** dřív, než jsou hotové identity, oddělení kvót, migrace starších dat a UX. Free: jeden aktivně spravovaný účet pro každého poskytovatele, ale automatická detekce a bezpečné zobrazení neznámých sekundárních běhů musí zůstat funkční (neblokovat monitoring nebo bezpečnost). Pro: neomezené spravované účty v rámci rozumného technického limitu; bez automatického přepínání nebo obcházení limitů poskytovatelů. Team není automaticky totéž co více osobních účtů.

## Acceptance + crazy cases

1. 2× Claude Pro v paralelních `CLAUDE_CONFIG_DIR`, samostatné procesy, hooky a účty; žádné křížové přiřazení.
2. Claude 1 běží, Claude 2 je vyčerpaný; zobrazit správný stav jen u Claude 2.
3. 20 paralelních běhů napříč 3 účty, současná změna loginu a reconnect SSE; zachovat identity a správné počty.
4. Restart, výpadek CLI, offline, smazaný profil, neúplné `accountUuid`, chybějící model bucket, různá časová pásma resetu.
5. Dvě session se stejnou cestou/projektem, ale různými účty: žádná heuristika podle složky.
6. Sekundární účet bez limit API: „Data nedostupná“, ne náhradní hodnota z primárního.
7. Historická session bez účtu zůstane unassigned i po přihlášení nového účtu.
8. Ochrana soukromí: žádné tokeny, e-maily, autentizační soubory nebo obsah přepisů v synchronizaci a logování.
9. Free→Pro→Free bez ztráty historie a přiřazení; nepřístupné placené ovládání nesmí vypnout zobrazení aktivních agentů.
10. UAT na skutečném Macu, Chrome a případně dalším hostiteli. Synthetic fixture ani CI **nenahrazují** reálné víceúčtové přihlášení.

## Povinná univerzální architektura — žádné výjimky podle značky

Multi-account platí pro **každého poskytovatele a každou použitelnou integraci**, například Claude, Codex/OpenAI, Gemini/Google, GitHub Copilot, Cursor, OpenRouter, Mistral, Grok i budoucí služby. Není dovoleno implementovat oddělené obchodní nebo datové chování jen pro Claude. Jednotný datový model musí mít provider adaptery pro získání **skutečně ověřených** identit a limitů; adaptér bez podpory důvěryhodných dat musí transparentně hlásit `unavailable`.

První implementační vrstva: `src/provider-accounts.js` poskytuje `providerIdentity`, `validAccountId`, `groupAccountsByProvider`, `sessionAccountBinding`, univerzální normalizaci historie až 96 účtů. Test `test/provider-multi-account.test.mjs` zkouší dvě oddělená Google identity, jiného providera, nemožnost podvrhnout account binding a kompatibilitu Claude/Codex. Přehled účtů už nepovažuje každého neznámého poskytovatele za Codex.

**To není dokončená feature.** Provider adaptéry pro účet/kvóty jsou reálně implementované pouze pro konkrétní zdroje Claude a Codex; Gemini, Copilot, Cursor atd. se nesmějí v UI tvářit jako ověřené připojené licence bez vlastních důkazů. Vazba `SessionAccountBinding` zatím tvoří samostatný validovaný kontrakt, nikoli automatické kompletní přiřazení všech běhů. Pro dokončení potřebujeme: profily a jejich read-only account identity adapters, verifikaci session→account na úrovni procesu/konfiguračního domova, per-account kvóty a jejich freshness, aliase/editace v UI, robustní migrace a bezpečný Pro gate. Free musí stále zobrazit všechny detekované agenty bez placené vazby.

## Implementační stav k poslední revizi

- `src/app.js` již odmítá publikovat `claudeAccounts` bez ověřeného `accountUuid` jako aktivní licence. Nová regresní kontrola v `test/subscriptions.test.mjs`.
- `test/security-adversarial.test.mjs` obsahuje negativní scénáře pro vzdálené mutace, přepis, neplatné kvóty a podvržené identity.
- **Zatím není hotovo**: prokazatelná vazba mezi běžící session a konkrétní licencí, oddělená živá Claude 5h/7d okna pro každý profil, filtrování agentů dle licence, plnohodnotný CRUD aliasů a e2e UAT více přihlášených účtů. Proto nejde tuto část označit za dokončenou ani zapnout placený paywall.
- Bezpečnostní audit a neověřené brány: [SECURITY-AUDIT-0461.md](SECURITY-AUDIT-0461.md).

## Gates

- Konkrétní provider-level identifikace session, přístup ke kvótám a jejich provenance musí být implementované a regresně testované před uvedením jako fungující.
- Dokud API kvóty účtu chybí, použít transparentní `unknown`; žádné predikce prezentované jako fakta.
- Nové UI otestovat na 1/2/5 účtech, dlouhých alias names, lokalizaci CZ/EN, malém okně a přístupnosti.
- Monetizační hranici a copy následně zapsat do `docs/LICENSING.md`, `CHANGELOG.md` a `docs/DATA-CONTRACT.md` až s implementací.
