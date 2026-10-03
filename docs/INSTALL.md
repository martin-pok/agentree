# Instalace Agenteeq

Agenteeq je dashboard všech AI agentů na tvém Macu. Běží lokálně – tvoje konverzace, klíče ani projekty nikam neodcházejí.

## Požadavky

### Desktopový balíček pro Mac

`Agenteeq-<verze>-macOS-arm64.zip` (asi 38 MB) je samostatná aplikace pro Mac s čipem Apple (M1 a novější) a macOS 14 Sonoma nebo novější. Mac s procesorem Intel nepodporujeme: Apple podporu Intelu ukončuje a Agenteeq se vyvíjí jen pro Apple Silicon. Rozbal a přesuň Agenteeq.app do Aplikací. Node ani Terminál nejsou pro používání potřeba. Původní projekty z `~/.agenteeq` zůstanou zachované.

Červené zavření okna ponechá dohled nad agenty běžet; kliknutí v Docku nebo horní liště okno obnoví. **⌘Q / Agenteeq → Ukončit Agenteeq** ukončí i lokální službu a agenty spuštěné z Agenteeq na pozadí. Ostatních agentů v samostatných aplikacích se ukončení netýká.

První spuštění zobrazí šestikrokový průvodce. Vrátíš se k němu v Nastavení tlačítkem **Prohlédnout průvodce**. Co se změnilo v nové verzi, ukáže aplikace po aktualizaci sama; znovu to otevřeš kliknutím na verzi dole v postranním panelu. Oznámení podléhají povolení macOS. Start po přihlášení nastavíš v Nastavení systému → Obecné → Přihlašovací položky.

Lokální build je ad-hoc podepsaný. Před distribucí zákazníkům vydavatel musí zajistit Developer ID podpis a notarizaci; nepoužívat plošné vypínání Gatekeeperu.

### Instalace jedním příkazem (Terminál)

```bash
curl -fsSL https://agentree-fawn.vercel.app/install.sh | bash
```

Skript (`site/install.sh`, na webu `/install.sh`) stáhne z posledního vydání na GitHubu balíček `Agenteeq-<verze>-macOS-arm64.zip`, porovná velikost a otisk SHA-256 s hodnotou, kterou GitHub u přílohy zveřejňuje, rozbalí ho a ověří podpis (`codesign --verify --deep --strict`). Teprve potom ukončí běžící Agenteeq (jako ⌘Q, nejvýš 10 s), starou verzi přesune do Koše a novou dá do `/Applications` – nebo tam, kde už Agenteeq je; když `/Applications` nejde zapsat, do `~/Applications`. Nakonec aplikaci otevře.

Proč odpadne krok v Nastavení: soubor stažený curlem v Terminálu nedostane příznak `com.apple.quarantine`, takže se Gatekeeper neptá. Razítko Applu tu nahrazuje otisk z GitHubu: příloha bez otisku se nestáhne (stejné pravidlo jako aktualizace v `src/updates.js`) a při jakékoli neshodě skript skončí dřív, než sáhne na nainstalovanou aplikaci. Nepoužívá `sudo`, aplikaci nikdy nemaže (když Koš nejde použít, nechá ji vedle jako `Agenteeq-<verze>.backup.app`), nic neodesílá a mluví jen s `api.github.com` a `github.com`. Opakované spuštění se stejnou verzí nic nestahuje.

Poctivá hranice: tohle je cesta pro lidi, kteří Terminálu a tomuto webu důvěřují – ověřuje, že balíček je ten zveřejněný na GitHubu, ne kdo ho vydal. Pro běžnou distribuci a prodej je dál potřeba Developer ID a notarizace ([ROADMAP](ROADMAP.md) „Teď“ #3). Chování hlídá `test/instalace.test.mjs` (podvržený `curl`, skutečné `ditto`, `codesign` a `osascript`).

**Kde balíček vzít.** V desktopové aplikaci Nastavení → Aplikace na tomto Macu → *Instalace pro další lidi* ukáže, jestli `dist/Agenteeq-<verze>-macOS-<architektura>.zip` z posledního buildu na tomto Macu existuje – s velikostí, datem vzniku a tlačítkem **Ukázat ve Finderu** (a zkopírováním cesty). Pokud balíček chybí, karta ukáže příkaz, kterým ho vytvoříš:

```bash
npm run build:mac
```

Balíček se uloží do `dist/` spolu s `dist/latest-build.json` (verze, architektura, druh podpisu). Server sám ověřuje jen soubor odpovídající aktuální verzi z `package.json` a architektuře procesu – cestu nikdy nebere z prohlížeče.

### Příkazová řádka

- macOS – plná podpora
- Windows – aplikace i s vlastním oknem existuje (`npm run build:windows`, CI ji překládá
  a přikládá k běhu), ale zatím ji nikdo nespustil na skutečném stroji. Otevírání aplikací,
  Klíčenka a automatický start na Windows nefungují. Podrobně: [WINDOWS.md](WINDOWS.md)
- Linux – server, rozhraní, projekty a statistiky fungují; desktopová aplikace není
- [Node.js](https://nodejs.org) 22.13 nebo novější (`node --version`)

## Instalace

Od dodavatele dostaneš soubor `agenteeq-<verze>.tgz`. V Terminálu ve složce se souborem spusť:

```bash
npm install -g ./agenteeq-<verze>.tgz
```

Pak Agenteeq spusť a otevři:

```bash
agenteeq --open
```

Dashboard běží na <http://127.0.0.1:4620>. Průvodce v Přehledu tě provede napojením.

## Napojení agentů

| Služba | Jak se napojí |
| --- | --- |
| Claude Code, Codex, Cursor, GitHub Copilot (VS Code i CLI), Gemini CLI, Qwen Code | Samy – Agenteeq čte jejich lokální přepisy. |
| Okamžité události Claude Code (žádost o povolení, přesné limity) | Nastavení → Propojení → Propojení s Claude Code → Zapnout propojení. |
| ChatGPT, Codex na webu, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat, GitHub Copilot | Rozšíření pro Chrome – viz kapitola níže. |
| Náklady API OpenAI a Anthropic | Nastavení → Náklady za API → Admin klíč (uloží se do Klíčenky). |

## Rozšíření pro Chrome

Bez rozšíření Agenteeq nevidí agenty, se kterými pracuješ v prohlížeči, a zadání se do webových služeb nevkládá samo (jen se zkopíruje do schránky). Rozšíření posílá data jen do Agenteeq na tomto Macu (`127.0.0.1`), nic neodchází na internet. Funguje v Chromu, Brave, Arcu i Edge.

Až bude rozšíření v Chrome Web Store (`docs/CHROME-WEB-STORE.md`), karta nabídne tlačítko
**Otevřít Chrome Web Store** – tam stačí kliknout na **Přidat do Chromu**. Do té doby platí ruční
instalace:

1. V Agenteeq otevři **Nastavení → Propojení → Rozšíření pro Chrome**.
2. V Chromu otevři `chrome://extensions` a vpravo nahoře zapni **Režim pro vývojáře**.
3. Klikni na **Načíst rozbalené** a vyber složku `~/.agenteeq/extension` (cestu zkopíruješ tlačítkem na kartě). Složka leží mimo aplikaci, takže ji aktualizace Agenteeq nerozbije.
4. Hotovo – rozšíření se s Agenteeq spáruje samo, stačí mít aplikaci spuštěnou. Aplikace ho pozná
   podle ID, které mu Chrome přidělí (u ruční instalace se ID odvodí ze složky, u obchodu je pevné).
   Kdyby se nespárovalo (rozšíření načtené z jiné složky), karta nabídne jednorázový kód.

Karta pak ukáže **Připojeno** a čas posledního ozvání. Když Agenteeq aktualizuje rozšíření na novou verzi, karta i okno rozšíření vyzvou k obnovení v `chrome://extensions` (šipka ↻).
| Lokální modely zdarma | Nainstaluj [Ollama](https://ollama.com) a stáhni model (`ollama pull llama3.2`). V Přehledu → Spustit agenta → Ollama. |

## Agenti na telefonu

Agenteeq normálně poslouchá jen na tomhle Macu. Když chceš vidět agenty i z telefonu, zapni si
jednu ze dvou cest v **Nastavení → Aplikace na tomto Macu**. Obě vyžadují spárování telefonu
jednorázovým kódem, takže bez něj se k datům nedostane nikdo, ani kdo zná adresu.

| Kde jsi | Co zapnout | Co potřebuješ |
|---|---|---|
| Doma na stejné Wi-Fi | **Otevřít na telefonu** | Nic navíc. |
| Kdekoli (mobilní data, cizí Wi-Fi) | **Přístup přes Tailscale** | [Tailscale](https://tailscale.com) na Macu i na telefonu, přihlášený stejným účtem. |

Přes Tailscale to vypadá takhle:

1. Nainstaluj Tailscale na Mac (`brew install --cask tailscale`) i na telefon a přihlas se **stejným
   účtem** na obou. Na Macu ověř příkazem `tailscale status`, že jsi přihlášený.
2. V Agenteeq zapni **Nastavení → Aplikace na tomto Macu → Přístup přes Tailscale**. Karta ukáže
   adresu tvého Macu, například `mac-mini.tvuj-tailnet.ts.net:4620`.
3. Tamtéž o kartu výš klikni na **Vytvořit kód pro telefon** (šestimístný, platí 5 minut, na jedno použití).
4. Na telefonu otevři adresu z bodu 2 a kód zadej. Od té chvíle vidíš přehled odkudkoli.

Žádná veřejná adresa přitom nevzniká: provoz jde šifrovaným tunelem přímo mezi tvými zařízeními
a mimo tvůj tailnet se na tu adresu nikdo nepřipojí. Agenteeq Tailscale neinstaluje ani nespouští,
jen umí naslouchat na adrese, kterou ti přidělil.

**Aplikace na domovské obrazovce (PWA)** potřebuje HTTPS. Uvnitř tailnetu ho vytvoří příkaz
`tailscale serve https / http://127.0.0.1:4620` – Agenteeq stav téhle proxy jen ukáže, spouštět ji
za tebe nebude. Bez ní aplikace v prohlížeči telefonu funguje normálně, jen ji nejde uložit na plochu.

Vypnutím přepínače se spojení zavře. Když vypneš i druhou cestu, odpárují se všechna zařízení.

## Automatické spouštění

- **Desktopová aplikace:** Nastavení systému → Obecné → Přihlašovací položky → přidej Agenteeq.
- **Příkazová řádka:** Nastavení → Aplikace na tomto Macu → **Spouštění po přihlášení**. Vypnout jde tamtéž, případně `agenteeq uninstall-agent`.

## Licence

Nastavení → Účet a vzhled → Licence → vlož klíč začínající `AGT1.` a klikni na **Aktivovat**. Klíč se ověřuje offline, bez připojení k internetu.

## Aktualizace a odinstalace

### Desktopová aplikace

- **Aktualizace:** Agenteeq při spuštění a potom pravidelně ověří poslední veřejné vydání na GitHubu. Dostupná verze se objeví v horní liště tlačítkem **Stáhnout** a také v **Nastavení → Aplikace na tomto Macu → Aktualizace**. Tam zvolíš **Ručně** (výchozí) nebo **Automaticky**. Automatický režim stáhne jen ověřený balíček pro tento Mac; samotná výměna aplikace se vždy otevře ve Finderu, takže běžící aplikace ani data nejsou potichu nahrazené.
- **Instalace stažené verze:** v horní liště nebo Nastavení klikni na **Otevřít**. Ve Finderu rozbal archiv, ukonči Agenteeq (⌘Q) a nahraď Agenteeq.app ve složce Aplikace. Data v `~/.agenteeq` i spárování zůstanou; rozšíření pro Chrome se aktualizuje samo do své složky a v `chrome://extensions` ho jen obnovíš.
- **Odinstalace – pořadí je důležité:**
  1. V Agenteeq **Nastavení → Propojení → Propojení s Claude Code → Vypnout propojení**. Jinak Claude Code dál zkouší posílat události a v jeho stavovém řádku zůstane „Agenteeq neběží“.
  2. V `chrome://extensions` odeber rozšíření Agenteeq.
  3. Ukonči Agenteeq (⌘Q), odeber ho z Přihlašovacích položek a přesuň Agenteeq.app do Koše.
  4. Data smažeš složkou `~/.agenteeq` (výdaje, upozornění, projekty, nastavení). Přepisy agentů patří jejich aplikacím a zůstanou.

### Příkazová řádka

- Aktualizace: `npm install -g ./agenteeq-<nová verze>.tgz` – data zůstanou.
- Odinstalace: `agenteeq uninstall-agent`, pak `npm uninstall -g agenteeq`. Data smažeš složkou `~/.agenteeq`.

## Řešení potíží

- **Port 4620 je obsazený** – Agenteeq už běží (otevři odkaz výše), nebo spusť `PORT=4621 agenteeq --open`.
- **Otevření v Terminálu nefunguje** – povol ovládání Terminálu: Nastavení systému → Soukromí a zabezpečení → Automatizace.
- **Agent se nezobrazuje** – Nastavení → Propojení → Zdroje dat → **Načíst znovu**. Sledují se konverzace za posledních 30 dní. Webové služby (ChatGPT, Gemini…) potřebují rozšíření pro Chrome.
- **„Agenteeq nelze otevřít, protože vývojář nemůže být ověřen“** – build není notarizovaný. Veřejné vydání musí být podepsané a notarizované vydavatelem; plošné vypínání Gatekeeperu nepoužívej.
- **Rozšíření ukazuje „Neozývá se“** – Chrome je zavřený nebo je rozšíření vypnuté v `chrome://extensions`. Po otevření Chromu se do minuty ozve samo.
