# Cloud účty — co jde přes oficiální API, když si uživatel napojí svůj účet

Tento dokument je **poctivý zdroj pravdy** o tom, co veřejná (dokumentovaná) API poskytovatelů skutečně
nabízejí — bez ohledu na to, co z toho už Agenteeq implementuje. Fakta jsou ověřená v oficiální
dokumentaci ke dni **12. 9. 2026** (odkazy u každé buňky); nic tady není odhad. Kde API neexistuje,
je to řečeno přímo, včetně toho, kde se dá tahle mezera v dokumentaci vidět.

Legenda buněk:

- **endpoint** — plná URL, HTTP metoda, potřebný typ klíče a rozsah oprávnění.
- **❌ veřejné API neexistuje** — s odkazem na oficiální dokumentaci, kde se dá ověřit, že chybí.
- **Implementováno v Agenteeq** — odkaz na `src/connectors/cloud-billing.js`, jinak jde jen o audit bez kódu.

**Klíčové rozlišení pro produkt:** každý poskytovatel má typicky dvě zcela oddělené věci — (A) **firemní/organizační
účet** s administrátorským API klíčem (Admin/Management key), který dává agregovaná data za celou organizaci,
a (B) **běžné spotřebitelské předplatné** (ChatGPT Plus/Pro, Claude Pro/Max, Gemini Advanced, Perplexity Pro,
Grok, le Chat Pro, Copilot Individual), které **nemá žádné veřejné API** — ani na útratu, ani na limity, ani na
historii chatů. Tohle rozlišení určuje, komu Agenteeq může nabídnout automatické napojení a komu jen ruční zápis.

---

## Anthropic / Claude

### Firemní účet (Claude Console / Claude Platform, Admin API klíč `sk-ant-admin01-…`)

| Útrata v penězích | Limity předplatného | Spotřeba tokenů | Seznam konverzací / historie chatů | Realtime stav běžícího agenta |
|---|---|---|---|---|
| `GET https://api.anthropic.com/v1/organizations/cost_report` — hlavičky `x-api-key: <Admin klíč>`, `anthropic-version: 2023-06-01`. **Implementováno** (`fetchAnthropic`). [Usage and Cost API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api) | `GET https://api.anthropic.com/v1/organizations/rate_limits` — stejný Admin klíč. Vrací nakonfigurované stropy (RPM, tokeny/min) po skupinách modelů, `batch`, `files`, `skills`, `web_search`. Jednorázový dotaz za celou organizaci, žádná stránkovací komplikace. **Neimplementováno** (viz doporučení níže). [Rate Limits API](https://platform.claude.com/docs/en/manage-claude/rate-limits-api) | `GET https://api.anthropic.com/v1/organizations/usage_report/messages` — stejný Admin klíč. Denní/hodinové/minutové koše, pole `uncached_input_tokens`, `cache_read_input_tokens`, `cache_creation.{ephemeral_1h_input_tokens,ephemeral_5m_input_tokens}`, `output_tokens`. **Implementováno** (`fetchAnthropicUsage`/`parseAnthropicUsage`). [dtto](https://platform.claude.com/docs/en/manage-claude/usage-cost-api#usage-api) | ❌ veřejné API neexistuje. Admin API vrací jen agregáty (náklady, tokeny, rate limity) — nikdy obsah zpráv ani seznam vláken. Přepisy Claude Code, které Agenteeq čte, jsou **lokální soubory na disku** (`~/.claude/projects/…`), ne API. [Usage and Cost API — FAQ](https://platform.claude.com/docs/en/manage-claude/usage-cost-api#frequently-asked-questions) nic o obsahu zpráv nezmiňuje, jen tokeny a náklady. | ❌ veřejné API neexistuje. Nejbližší je „freshness do 5 minut" u Usage/Cost API, což není realtime a není to stav běžícího agenta. [tamtéž, „How fresh is the data?"](https://platform.claude.com/docs/en/manage-claude/usage-cost-api#frequently-asked-questions) |

### Běžné spotřebitelské předplatné (Claude Pro/Max na claude.ai)

| Útrata v penězích | Limity předplatného | Spotřeba tokenů | Seznam konverzací / historie chatů | Realtime stav běžícího agenta |
|---|---|---|---|---|
| ❌ neexistuje — paušál, žádné API. | ❌ veřejné API neexistuje. Dokumentace explicitně říká: „The Admin API is unavailable for individual accounts." [Usage and Cost API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api) — Pro/Max limity („resets in X hours") se zobrazují jen v appce. Soubor `plan-usage-history.json`, který Agenteeq čte jako zálohu (`src/connectors/claude-desktop-usage.js`), je **neoficiální interní formát aplikace**, ne API — může se kdykoli změnit nebo zmizet, viz `docs/CONNECTORS.md`. | ❌ neexistuje. | ❌ neexistuje. Jediná oficiální cesta je ruční export (Nastavení → Soukromí → Export dat, doručeno e-mailem do 24 h) — to není API, je to jednorázová akce člověka. | ❌ neexistuje. |

---

## OpenAI / ChatGPT + Codex

### Firemní účet (Admin API klíč `sk-admin-…`)

| Útrata v penězích | Limity předplatného | Spotřeba tokenů | Seznam konverzací / historie chatů | Realtime stav běžícího agenta |
|---|---|---|---|---|
| `GET https://api.openai.com/v1/organization/costs?start_time&bucket_width=1d` — `Authorization: Bearer <Admin klíč>`. **Implementováno** (`fetchOpenAI`). [Usage API reference](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions) | `GET https://api.openai.com/v1/organization/projects/{project_id}/rate_limits` — Bearer Admin klíč. **Jen po projektech**, ne za celou organizaci — nejdřív je potřeba vylistovat projekty (`GET /v1/organization/projects`) a pak volat rate limits pro každý. **Neimplementováno** — jedno číslo „limit organizace" by bylo zavádějící, viz doporučení níže. [List project rate limits](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/rate_limits/methods/list_rate_limits) | `GET https://api.openai.com/v1/organization/usage/completions?start_time&bucket_width=1d` — Bearer Admin klíč. Pole `input_tokens`, `output_tokens`, `input_cached_tokens`, `num_model_requests` po koších. **Implementováno** (`fetchOpenAIUsage`/`parseOpenAIUsage`). Obdobné endpointy existují i pro `usage/images`, `usage/audio_speech` atd. — nevyužito, mimo rozsah Claude/Codex použití. [Usage | OpenAI API Reference](https://platform.openai.com/docs/api-reference/usage/completions) | ❌ veřejné API neexistuje **pro ChatGPT appku**. OpenAI má samostatné [Conversations API](https://platform.openai.com/docs/api-reference/conversations/create) (`POST/GET /v1/conversations`), ale to ukládá jen konverzace **vytvořené přes Responses/Assistants API** — úplně jiné úložiště než historie v ChatGPT appce, a ani tam neexistuje endpoint na vylistování všech konverzací (jen `retrieve` podle známého ID). Potvrzeno i diskuzí vývojářů o chybějícím list endpointu. [Get Conversations list endpoint missing](https://community.openai.com/t/get-conversations-list-endpoint-missing/1359530) | ❌ veřejné API neexistuje. Codex CLI zapisuje `rate_limits.credits.balance` a % okna do **lokálních** session souborů (`~/.codex/sessions/…`), což Agenteeq už čte — to není síťové API, je to soubor na disku. |

### Běžné spotřebitelské předplatné (ChatGPT Plus/Pro/Free)

| Útrata v penězích | Limity předplatného | Spotřeba tokenů | Seznam konverzací / historie chatů | Realtime stav běžícího agenta |
|---|---|---|---|---|
| ❌ neexistuje — paušál. | ❌ veřejné API neexistuje. Plus/Pro alokace modelů nejsou ani zveřejněná čísla, natož API — appka jen řekne „ChatGPT bude pokračovat jiným modelem, dokud se alokace neobnoví". [ChatGPT Usage Limits](https://www.progressiverobot.com/2026/08/25/chatgpt-usage-limit-5-hour-plus-pro/) potvrzuje, že jde o interní, nezveřejněné hodnoty — a explicitně odděluje limity appky od API kvót vývojářů. | ❌ neexistuje. | ❌ neexistuje. Ověřeno i přímo na disku 12. 9. 2026: `~/Library/Application Support/com.openai.chat` obsahuje konverzace, ale žádný soubor s `rate_limit`/`quota`/`usage_limit` (viz `docs/CONNECTORS.md`, sekce „Limity aplikace ChatGPT"). | ❌ neexistuje. |

---

## Google Gemini + AI Studio

### Firemní/enterprise cesta (GCP projekt s napojeným Cloud Billing)

| Útrata v penězích | Limity předplatného | Spotřeba tokenů | Seznam konverzací / historie chatů | Realtime stav běžícího agenta |
|---|---|---|---|---|
| ❌ **není Gemini-specifické REST API s API klíčem.** Existuje jen obecné Google Cloud Billing (export do BigQuery, Cloud Billing Budget API) — vyžaduje GCP projekt, `gcloud`/service account OAuth, ne Gemini API klíč. Dokumentace přímo odkazuje jen na konzoli: „view your balance… through the web interface" / Cloud Console pro detailní reporty. [Billing | Gemini API](https://ai.google.dev/gemini-api/docs/billing) | ❌ dtto — kvóty jsou vidět v AI Studio Dashboard nebo Google Cloud Console (Cloud Quotas), ne přes Gemini API klíč. [Google AI plans](https://ai.google.dev/gemini-api/docs/google-ai-plans) | ❌ dtto — jen dashboard `aistudio.google.com/usage`, případně Cloud Monitoring metriky pro `generativelanguage.googleapis.com` (GCP auth, ne API klíč). | ❌ veřejné API neexistuje pro AI Studio „Chat" historii ani pro appku Gemini. | ❌ neexistuje. |

### Běžné spotřebitelské předplatné (Gemini Advanced, osobní Google účet)

| Útrata v penězích | Limity předplatného | Spotřeba tokenů | Seznam konverzací / historie chatů | Realtime stav běžícího agenta |
|---|---|---|---|---|
| ❌ neexistuje — součást Google One, paušál. | ❌ neexistuje. | ❌ neexistuje. | ❌ neexistuje. | ❌ neexistuje. |

AI Studio samotné (bez placeného klíče) je navíc **zdarma a mimo Gemini API kvóty** — což ještě víc snižuje šanci, že by u něj vzniklo API na „útratu". [Billing | Gemini API](https://ai.google.dev/gemini-api/docs/billing)

---

## Perplexity

Perplexity má jediný veřejný produkt — vývojářské **Sonar/Agent API** (`https://api.perplexity.ai`,
`POST /chat/completions` resp. nově `/v1/agent` a alias `/v1/responses`), placené předplacenými kredity.
[Chat Completions](https://docs.perplexity.ai/api-reference/chat-completions-post), [API reference index](https://docs.perplexity.ai/api-reference)

### Vývojářský účet (Sonar/Agent API klíč, prepaid kredity)

| Útrata v penězích | Limity předplatného | Spotřeba tokenů | Seznam konverzací / historie chatů | Realtime stav běžícího agenta |
|---|---|---|---|---|
| ❌ **žádný endpoint** — zůstatek kreditů a útrata jsou vidět jen v dashboardu `perplexity.ai/settings/api`. API reference nezná endpoint na zůstatek ani historii útraty. [API token usage reports and billing (komunitní vlákno, potvrzuje absenci)](https://community.perplexity.ai/t/api-token-usage-reports-and-billing/60) | ❌ neexistuje mimo dashboard. | ❌ neexistuje mimo dashboard — API vrací tokeny jen v odpovědi jednotlivého požadavku (`usage` v response těla), ne jako agregovaný report. | ❌ neexistuje — Sonar/Agent API je bezstavové (stejně jako Anthropic Messages API), nedrží konverzace na serveru. | ❌ neexistuje. |

### Běžné spotřebitelské předplatné (Perplexity Pro na perplexity.ai)

Zcela oddělený produkt od Sonar API — Pro předplatné nemá **žádné** veřejné API, ani na spuštění dotazu,
natož na útratu/limity/historii/realtime stav.

---

## xAI / Grok

Management API běží na samostatném hostu `https://management-api.x.ai`, autentizace **Management klíčem**
(xAI Console → Settings → Management Keys, samostatný typ klíče od inferenčního `api.x.ai` klíče).
[Using Management API](https://docs.x.ai/developers/management-api-guide), [Management API reference](https://docs.x.ai/developers/rest-api-reference/management)

### Firemní/týmový účet (Management klíč)

| Útrata v penězích | Limity předplatného | Spotřeba tokenů | Seznam konverzací / historie chatů | Realtime stav běžícího agenta |
|---|---|---|---|---|
| `GET https://management-api.x.ai/v1/billing/teams/{team_id}/prepaid/balance` (zůstatek kreditu) a `GET .../postpaid/invoice/preview` (aktuální vyúčtování) — Management klíč. [Billing Management API](https://docs.x.ai/developers/rest-api-reference/management/billing) | `GET https://management-api.x.ai/v1/billing/teams/{team_id}/postpaid/spending-limits` — měsíční hard/soft strop útraty. Není to „limit předplatného" v smyslu RPM/TPM, jen strop útraty. [tamtéž](https://docs.x.ai/developers/rest-api-reference/management/billing) | `POST https://management-api.x.ai/v1/billing/teams/{team_id}/usage` — časové řady spotřeby podle zvolených dimenzí (pozor: je to `POST`, ne `GET`). [tamtéž](https://docs.x.ai/developers/rest-api-reference/management/billing) | ❌ neexistuje — `api.x.ai` inference je bezstavová; `grok.com` (spotřebitelský chat) nemá export/list API. | ❌ neexistuje. |

### Běžné spotřebitelské předplatné (Grok/SuperGrok přes X)

❌ žádné veřejné API na cokoliv — spend je paušál, limity/historie/realtime nejsou zdokumentované ani dostupné.

---

## Mistral

Admin API běží pod `https://api.mistral.ai/v1/admin/*`, hlavička `x-api-key: <Admin klíč organizace>`.
[Usage and limits](https://docs.mistral.ai/admin/billing-usage/usage-limits)

### Firemní/organizační účet (Admin API klíč)

| Útrata v penězích | Limity předplatného | Spotřeba tokenů | Seznam konverzací / historie chatů | Realtime stav běžícího agenta |
|---|---|---|---|---|
| `GET https://api.mistral.ai/v1/admin/usage?month=&year=&workspace_id=` — náklady a spotřeba po kategoriích (`chat`, `completion`, `ocr`, `audio`, `connectors`, `libraries_api`, `fine_tuning`, `vibe_usage`). Admin klíč. [Usage metrics with the Admin API](https://docs.mistral.ai/admin/admin-api/usage-metrics) | `GET`/`POST https://api.mistral.ai/v1/admin/spend-limit` (měsíční strop útraty) a `GET https://api.mistral.ai/v1/admin/rate-limit` (RPS a limity tokenů podle modelu). Admin klíč. [tamtéž](https://docs.mistral.ai/admin/admin-api/usage-metrics) | Součást `admin/usage` výše (tokeny/náklady po kategorii), plus `GET .../v1/admin/analytics/vibe/usage/by_workspace` a `by_organization` pro spotřebu tokenů u Vibe/coding agenta. [tamtéž](https://docs.mistral.ai/admin/admin-api/usage-metrics) | ⚠️ **jen počty, ne obsah.** `GET https://api.mistral.ai/v1/admin/analytics/lechat/usage/by_user_stats` a `.../by_time_stats` vrací počty zpráv/souborů/konverzací/agentů podle uživatele nebo času — **nikdy text zpráv**. Žádný endpoint nevrací obsah konverzace le Chat. [tamtéž](https://docs.mistral.ai/admin/admin-api/usage-metrics) | ❌ neexistuje — analytika je dávková (podle `start_time`/`end_time`), ne živý stav běžícího požadavku. |

### Běžné spotřebitelské předplatné (le Chat Free/Pro, osobní účet)

❌ žádné veřejné API — le Chat jako spotřebitelský produkt nemá vlastní API oddělené od výše uvedeného
firemního Admin API (to navíc vyžaduje organizaci, ne osobní le Chat účet).

---

## GitHub Copilot

Organizační/enterprise endpointy vyžadují PAT (classic scope `read:org` nebo `manage_billing:copilot`) nebo
jemně-zrněné oprávnění „View Organization Copilot Metrics" / „View Enterprise Copilot Metrics".
[REST API endpoints for Copilot usage metrics](https://docs.github.com/en/rest/copilot/copilot-usage-metrics), [Billing usage](https://docs.github.com/en/rest/billing/usage)

### Firemní/organizační účet (org nebo enterprise token)

| Útrata v penězích | Limity předplatného | Spotřeba tokenů | Seznam konverzací / historie chatů | Realtime stav běžícího agenta |
|---|---|---|---|---|
| `GET https://api.github.com/orgs/{org}/copilot/billing` (počet sedadel/plán) + `GET https://api.github.com/organizations/{org}/settings/billing/ai_credit/usage` nebo (na úrovni enterprise) `GET https://api.github.com/enterprises/{enterprise}/settings/billing/premium_request/usage` — útrata za AI kredity a přečerpání „premium requests" nad rámec plánu. [Billing usage](https://docs.github.com/en/rest/billing/usage), [GitHub changelog — billing API](https://github.blog/changelog/2025-11-03-manage-budgets-and-track-usage-with-new-billing-api-updates/) | `GET https://api.github.com/orgs/{org}/copilot/billing/seats` — kolik sedadel/kdo má přiřazený Copilot; číselný „zbývá X požadavků" strop se dá jen odvodit z `premium_request/usage` výše, žádný přímý „limit" endpoint. | `GET https://api.github.com/orgs/{org}/copilot/metrics/reports/organization-1-day` a `.../organization-28-day/latest` (obdobně `/enterprises/{enterprise}/copilot/metrics/reports/…`) — vrací **podepsané odkazy na NDJSON reporty** s adopcí/zapojením, ne přímo JSON tělo. [REST API endpoints for Copilot usage metrics](https://docs.github.com/en/rest/copilot/copilot-usage-metrics) | ⚠️ **jen agregované metriky zapojení, nikdy obsah chatu.** `users-1-day`/`users-28-day` reporty ukazují vzorce používání funkcí na uživatele, ne text konverzace — žádný GitHub endpoint nevrací obsah Copilot Chatu. [tamtéž](https://docs.github.com/en/rest/copilot/copilot-usage-metrics) | ❌ neexistuje — reporty jsou denní/28denní dávky, ne živý stav. |

### Individuální předplatné (GitHub Copilot Individual)

❌ organizační/enterprise billing a metrics endpointy vyžadují `read:org`/`manage_billing:copilot` na
organizaci — na osobní účet se nevztahují. Vlastní spotřebu vidí uživatel jen v `github.com/settings/copilot`
a přímo ve VS Code; žádný zdokumentovaný REST endpoint pro osobní kvótu neexistuje.

---

## Co z toho plyne pro Agenteeq

1. **Spotřeba tokenů (OpenAI `usage/completions`, Anthropic `usage_report/messages`) je teď v konektoru** (`src/connectors/cloud-billing.js`, metoda `tokenUsage()` a pole `tokens` v `providers()`), ale ještě není v UI. Další krok: karta ve Statistikách vedle grafu nákladů — **nikdy nesčítat s útratou**, jde o jinou metriku (viz `AGENTS.md` „Zachovej význam metrik"), a zapsat tvar do `docs/DATA-CONTRACT.md`.
2. **Anthropic `GET /v1/organizations/rate_limits`** je jediný z auditovaných „limitních" endpointů, který je jedním dotazem za celou organizaci (ne po projektech/workspace). Bezpečný a levý další krok — ukázat nakonfigurovaný strop RPM/TPM vedle skutečné spotřeby jako „kolik % stropu je vyčerpáno".
3. **OpenAI limity jsou po projektech**, ne za organizaci (`GET /v1/organization/projects/{id}/rate_limits`). Než se implementují, je potřeba nejdřív vylistovat projekty (`GET /v1/organization/projects`) a nechat uživatele vybrat, který sledovat — jedno souhrnné číslo za organizaci by bylo zavádějící a v rozporu s „pravdivost nad efektem" z `AGENTS.md`.
4. **GitHub Copilot a Mistral mají firemní billing/metrics API**, které by šlo přidat jako další konektory typu `cloud-billing` (Admin/organizační klíč, žádné OAuth). Musí se ale jasně označit, že jde o **agregáty a počty**, nikdy o obsah konverzací — u Copilotu i Mistralu (le Chat analytika) je riziko, že si uživatel „počet zpráv" splete s „přečtu si, co si agent psal". Texty v UI to musí říct přímo.
5. **U všech běžných spotřebitelských předplatných** (ChatGPT Plus/Pro, Claude Pro/Max, Gemini Advanced, Perplexity Pro, Grok, le Chat, Copilot Individual) žádné oficiální API není a nejde o dočasnou mezeru — je to produktové rozhodnutí dodavatelů oddělit spotřebitelský chat od placeného API. Energii má smysl dát do lepšího **ručního zápisu** (rychlé předvyplnění podle zvoleného plánu, upomínky na obnovu limitu), ne do dalších pokusů o čtení něčeho, co dodavatel záměrně nezveřejňuje.
