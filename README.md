<img src="public/brand/agentree-mark.svg" width="64" height="64" alt="">

# Agentree

**Všichni AI agenti na jednom místě, v reálném čase.** Agentree vidí, co právě dělá Claude Code, Codex, Cursor, Copilot i webové chaty (ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen). Ukáže živý přepis a průběh úlohy. Upozorní, když agent potřebuje tvé rozhodnutí, narazí na limit nebo když útrata přeroste rozpočet.

> Stav: **v0.5.0 — lokální beta pro macOS, připravená k instalaci dalším uživatelům.** Běží na tvém Macu, data neopouštějí počítač. Co je ověřené a co ne, přesně popisuje [docs/CONNECTORS.md](docs/CONNECTORS.md).

## Rychlý start

Potřebuješ macOS a Node.js 22.13 nebo novější. Žádné závislosti, žádný build.

```bash
cd ~/agentree
npm start
```

Otevři <http://127.0.0.1:4620>. Průvodce v Přehledu tě provede napojením (hooky Claude Code, rozšíření pro Chrome, první projekt, první spuštění agenta). Automatické spouštění po přihlášení zapneš v **Nastavení → Spouštění a data**.

Instalace pro zákazníka nebo kolegu: `npm run pack` a návod [docs/INSTALL.md](docs/INSTALL.md). Licence a prodej: [docs/LICENSING.md](docs/LICENSING.md).

## Co umí

| Oblast | Funkce |
|---|---|
| Přehled | **Spustit agenta** (Claude Code, Codex, Gemini/Qwen CLI, webové AI, lokální Ollama) s projektem, složkou a briefem; kolik agentů pracuje, kdo čeká na tebe, časová osa „Dnešní směna“, spotřeba tokenů, limity předplatných, útrata měsíce |
| Agenti | Seznam všech sessions (30 dní) s filtry podle stavu, zdroje, poskytovatele a projektu, hromadné zařazení do projektu, přetažení na projekt |
| Projekty | Konverzace ze všech služeb podle klientů a zakázek: automaticky podle složky i ručně, stav a tokeny projektu, brief, archiv, export do CSV |
| Detail agenta | Živý přepis (zprávy, nástroje, výstupy), běžící čas tahu a počet kroků, složení tokenů; **otevření přímo v aplikaci** (vlákno Codexu, Claude, Cursor, VS Code, web) nebo **pokračování v Terminálu** |
| Statistiky | Tokeny podle poskytovatele, heatmapa aktivity, podíl aplikací, projekty, modely, limity a kredity |
| Útrata | Výdaje a předplatné (ruční i z Admin API), rozpočty s upozorněním na 80 % a 100 %, prognóza do konce měsíce, historie kreditů |
| Upozornění | Rozhodnutí, limity, rozpočty, dokončené dlouhé úlohy. Nativní notifikace macOS, notifikace prohlížeče, přehled v aplikaci |

## Vývoj

```bash
npm test          # 63 testů: parsery, stav, upozornění, rozpočty, hooky, projekty, spouštění, licence, HTTP API, realtime stream
npm run check     # syntaktická kontrola všech JS souborů
npm run smoke     # zabalí balíček, nainstaluje ho do dočasné složky a ověří, že běží
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
| [docs/INSTALL.md](docs/INSTALL.md) | Instalace a napojení pro zákazníky |
| [docs/LICENSING.md](docs/LICENSING.md) | Vydávání licencí, placené funkce, distribuce (pro vydavatele) |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Vize, zákazník, hodnota, hypotézy monetizace (neověřené) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Cesta z lokální bety k SaaS, s akceptačními kritérii |
| [CHANGELOG.md](CHANGELOG.md) | Historie verzí |
