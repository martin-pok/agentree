# Dirigent

**Všichni AI agenti na jednom místě, v reálném čase.** Dirigent vidí, co právě dělá Claude Code, Codex, Cursor, Copilot i webové chaty (ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen). Ukáže živý přepis a průběh úlohy. Upozorní, když agent potřebuje tvé rozhodnutí, narazí na limit nebo když útrata přeroste rozpočet.

> Stav: **v0.2.0 — lokální beta pro macOS.** Běží na tvém Macu, data neopouštějí počítač. Co je ověřené a co ne, přesně popisuje [docs/CONNECTORS.md](docs/CONNECTORS.md).

## Rychlý start

Potřebuješ macOS a Node.js 22.13 nebo novější. Žádné závislosti, žádný build.

```bash
cd ~/dirigent
npm start
```

Otevři <http://127.0.0.1:4620>.

Doporučené další kroky přímo v aplikaci (**Nastavení**):

1. **Okamžité události Claude Code**: jedním klikem přidá hooky, díky kterým uvidíš žádost o povolení nástroje v řádu milisekund.
2. **Rozšíření pro Chrome**: webové AI aplikace (načti rozbalené ze složky `extension/`).
3. **Spouštění po přihlášení**: aby upozornění chodila vždy:

```bash
node ~/dirigent/bin/dirigent.mjs install-agent
```

## Co umí

| Oblast | Funkce |
|---|---|
| Přehled | Kolik agentů pracuje, kdo čeká na tebe, časová osa „Dnešní směna“, spotřeba tokenů, limity předplatných, útrata měsíce |
| Agenti | Seznam všech sessions (30 dní) s filtry podle stavu, zdroje a poskytovatele, živá aktivita a plán úkolů |
| Detail agenta | Živý přepis (zprávy, nástroje, výstupy), běžící čas tahu a počet kroků, složení tokenů, příkaz pro pokračování |
| Statistiky | Tokeny podle poskytovatele, heatmapa aktivity, podíl aplikací, projekty, modely, limity a kredity |
| Útrata | Výdaje a předplatné (ruční i z Admin API), rozpočty s upozorněním na 80 % a 100 %, prognóza do konce měsíce, historie kreditů |
| Upozornění | Rozhodnutí, limity, rozpočty, dokončené dlouhé úlohy. Nativní notifikace macOS, notifikace prohlížeče, přehled v aplikaci |

## Vývoj

```bash
npm test          # 31 testů: parsery, stav, upozornění, rozpočty, hooky, HTTP API, realtime stream
npm run check     # syntaktická kontrola všech JS souborů
npm run dev       # server s automatickým restartem při změně src/
```

Než začneš měnit kód (člověk i AI agent), přečti **[AGENTS.md](AGENTS.md)**.

## Dokumentace

| Dokument | Obsah |
|---|---|
| [AGENTS.md](AGENTS.md) | Pravidla a postupy pro agentický vývoj, definice hotového, mapa repozitáře |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Jak data tečou od zdroje do dashboardu, stavový model, výkon, odolnost |
| [docs/CONNECTORS.md](docs/CONNECTORS.md) | Podpora jednotlivých služeb: co jde, co nejde a proč, stav ověření |
| [docs/DATA-CONTRACT.md](docs/DATA-CONTRACT.md) | REST API, SSE události a datové typy |
| [docs/SECURITY.md](docs/SECURITY.md) | Model hrozeb, soukromí, práce s klíči a konfigurací uživatele |
| [docs/TESTING.md](docs/TESTING.md) | Automatické testy, ruční QA checklist, protokol ověření verze |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Vize, zákazník, hodnota, hypotézy monetizace (neověřené) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Cesta z lokální bety k SaaS, s akceptačními kritérii |
| [CHANGELOG.md](CHANGELOG.md) | Historie verzí |
