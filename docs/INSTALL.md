# Instalace Agentree

Agentree je dashboard všech AI agentů na tvém Macu. Běží lokálně — tvoje konverzace, klíče ani projekty nikam neodcházejí.

## Požadavky

### Desktopový balíček pro Mac

`Agentree-0.6.0-macOS-arm64.zip` je samostatná aplikace pro Apple Silicon a macOS 14+. Rozbal a přesuň Agentree.app do Aplikací. Node ani Terminál nejsou pro používání potřeba. Původní projekty z `~/.agentree` zůstanou zachované.

Červené zavření okna ponechá dohled nad agenty běžet; kliknutí v Docku nebo horní liště okno obnoví. **⌘Q / Agentree → Ukončit Agentree** ukončí i lokální službu a agenty spuštěné z Agentree na pozadí. Ostatních agentů v samostatných aplikacích se ukončení netýká.

První spuštění zobrazí čtyřkrokový průvodce. Vrátíš se k němu v Nastavení nebo Nápovědě. Oznámení podléhají povolení macOS. Start po přihlášení nastavíš v Nastavení systému → Obecné → Přihlašovací položky.

Lokální build je ad-hoc podepsaný. Před distribucí zákazníkům vydavatel musí zajistit Developer ID podpis a notarizaci; nepoužívat plošné vypínání Gatekeeperu.

**Kde balíček vzít.** V desktopové aplikaci Nastavení → Aplikace na tomto Macu → *Instalace pro další lidi* ukáže, jestli `dist/Agentree-<verze>-macOS-<architektura>.zip` z posledního buildu na tomto Macu existuje — s velikostí, datem vzniku a tlačítkem **Ukázat ve Finderu** (a zkopírováním cesty). Pokud balíček chybí, karta ukáže příkaz, kterým ho vytvoříš:

```bash
npm run build:mac
```

Balíček se uloží do `dist/` spolu s `dist/latest-build.json` (verze, architektura, druh podpisu). Server sám ověřuje jen soubor odpovídající aktuální verzi z `package.json` a architektuře procesu — cestu nikdy nebere z prohlížeče.

### Příkazová řádka

- macOS (Linux a Windows: dashboard a projekty fungují, otevírání aplikací a notifikace ne)
- [Node.js](https://nodejs.org) 22.13 nebo novější (`node --version`)

## Instalace

Od dodavatele dostaneš soubor `agentree-<verze>.tgz`. V Terminálu ve složce se souborem spusť:

```bash
npm install -g ./agentree-0.5.0.tgz
```

Pak Agentree spusť a otevři:

```bash
agentree --open
```

Dashboard běží na <http://127.0.0.1:4620>. Průvodce v Přehledu tě provede napojením.

## Napojení agentů

| Služba | Jak se napojí |
| --- | --- |
| Claude Code, Codex, Cursor, GitHub Copilot (VS Code i CLI), Gemini CLI, Qwen Code | Samy — Agentree čte jejich lokální přepisy. |
| Okamžité události Claude Code (žádost o povolení) | Nastavení → Okamžité události → Zapnout. |
| ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat | Rozšíření pro Chrome: Nastavení → Webové AI aplikace (návod krok za krokem). |
| Náklady API OpenAI a Anthropic | Nastavení → Náklady z API → Admin klíč (uloží se do Klíčenky). |
| Lokální modely zdarma | Nainstaluj [Ollama](https://ollama.com) a stáhni model (`ollama pull llama3.2`). V Přehledu → Spustit agenta → Ollama. |

## Automatické spouštění

Nastavení → Spouštění a data → **Spouštět po přihlášení**. Vypnout jde tamtéž, případně `agentree uninstall-agent`.

## Licence

Nastavení → Licence → vlož klíč začínající `AGT1.` a klikni na **Aktivovat**. Klíč se ověřuje offline, bez připojení k internetu.

## Aktualizace a odinstalace

- Aktualizace: `npm install -g ./agentree-<nová verze>.tgz` — data zůstanou.
- Odinstalace: `agentree uninstall-agent`, pak `npm uninstall -g agentree`. Data smažeš složkou `~/.agentree`.

## Řešení potíží

- **Port 4620 je obsazený** — Agentree už běží (otevři odkaz výše), nebo spusť `PORT=4621 agentree --open`.
- **Otevření v Terminálu nefunguje** — povol ovládání Terminálu: Nastavení systému → Soukromí a zabezpečení → Automatizace.
- **Agent se nezobrazuje** — Nastavení → Konektory → Znovu načíst. Sledují se konverzace za posledních 30 dní.
