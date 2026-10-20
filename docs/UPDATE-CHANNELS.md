# Aktualizační kanály Agenteeq

Aktualizace v aplikaci mají dva explicitní kanály. Nastavení se ukládá lokálně a **výchozí je Stabilní**.

| Kanál | Zdroj | Co nabízí |
| --- | --- | --- |
| Stabilní | `GET /repos/martin-pok/agentree/releases/latest` | Pouze stabilní vydání GitHub, bez prerelease a konceptů |
| Preview | `GET /repos/martin-pok/agentree/releases?per_page=30` | Poslední veřejně vydanou sémantickou verzi, včetně prerelease, pokud je novější než nainstalovaná |

## Od zeleného CI k připravenému instalačnímu balíčku

Workflow `.github/workflows/prepare-preview-draft.yml` („Připravit vydání“) se spouští **jen ručně**, když se vydání opravdu chystá (rozhodnutí vlastníka 20. 10. 2026: po merge do `main` už žádný Draft sám nevzniká). Ověří, že na aktuálním `main` prošly kompletní Testy, a dále přesné SHA zdroje, verzi `package.json`, verzi Chrome manifestu a existenci odpovídajícího `CHANGELOG.md` / „Co je nového“. Jen pokud se verze ještě netagovala, odešle existujícímu `release.yml` požadavek sestavit **neveřejný Draft** z tohoto SHA. Po auditu příloh se Draft hned zveřejní (`publish.yml`), nebo ho nahradí novější; starší nezveřejněné Drafty maže `prune-drafts.yml`.

Toto **nikdy samo nezveřejňuje vydání** ani neinstaluje software. GitHub Preview se objeví v aktualizačním kanálu teprve po úspěšném buildu, ověření checksumů, reálném UAT a výslovném publikování pomocí `publish.yml`. Stable `Latest` zůstává oddělené. Existující tag a release přílohy se nesmějí přepsat novou verzí stejného čísla.

## Bezpečnost a očekávání

- **Preview je opt-in.** Je označené jako testovací a může obsahovat chyby. Přepnutí zpět na Stabilní okamžitě zneplatní nabídku Preview balíčku; starý asynchronní požadavek nesmí přepsat aktuální kanál.
- Automatický režim znamená automatické *stažení*, nikoliv tichou instalaci a restart. Instalaci musí uživatel stále potvrdit v aplikaci/Finderu.
- Vybere se pouze validní nedraftové vydání s číselnou verzí; metadata binárky musí mít odpovídající **přesný název, cestu ve správném tagu, velikost a SHA-256 digest**. Stahovaný ZIP se ověřuje proti SHA-256 před jeho uložením a možností instalace. Neúplná příloha se nenabízí.
- Jestliže uživatel má Preview novější než dostupné stabilní vydání, kanál Stabilní **neprovádí downgrade**.
- Aktualizace se mohou ověřovat jen při povoleném síťovém přístupu. Selhání GitHub API nebo chybějící kompatibilní balíček se nesmí vydávat za úspěšnou aktualizaci.
- Rozhraní pouze nabídne vydání, které je skutečně publikované na GitHubu; není to důkaz instalace ani nativního QA na konkrétním počítači.

## UAT před plným produkčním vydáním

Na reálném Apple Silicon Macu ověřit přepnutí Stable → Preview → Stable, restart aplikace (perzistence nastavení), nabídku nového vydání, kontrolní součet, instalaci a restart v režimu ručně a automaticky, offline chování a změnu kanálu při probíhajícím stahování. Samostatně ověřit Gatekeeper a podepsání/notarizaci; úspěšné unit/CI testy je nenahrazují.
