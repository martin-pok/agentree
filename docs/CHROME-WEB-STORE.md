# Rozšíření v Chrome Web Store

Stav k 3. 10. 2026: **odesláno ke kontrole, čeká na Google.** První zamítnutí se týkalo výčtu
názvů služeb v anglickém popisu; popis jsme zjednodušili a znovu odeslali. Po schválení se položka
automaticky zveřejní. Její stálá adresa a ID už jsou v `public/js/obchod.js`; příznak
`CHROME_WEB_STORE_PUBLISHED` zůstává do ověření veřejné stránky vypnutý. Potom se zapne a vydá se
nová verze aplikace, která nabídne instalaci jedním kliknutím a automatické spárování.

Příznak je jediné místo, které instalaci z obchodu zapíná všude najednou: kartu v aplikaci
(Nastavení → Propojení → Rozšíření pro Chrome, tlačítko **Otevřít Chrome Web Store**), web
(úvodní stránka a stránka Instalace `site/instalace`, `site/en/install` – sestavení
`scripts/build-site.mjs#rozsireniNaWebu` nechá jen blok `rozsireni:obchod`) a popis vydání.
Dokud je vypnutý, ukazuje se všude ruční instalace a web výslovně píše, že rozšíření na schválení
čeká. Po zapnutí je potřeba web přestavět (`npm run build:site`, na hostingu se to stane samo).

## Stav účtu vydavatele

Registrace vývojáře byla uhrazena. Vydavatel zvolil stav **neobchodník** a ověřil kontaktní e-mail.

Balíček verze 0.31.4 je v Chrome Web Store. Opravená metadata jsou znovu odeslaná ke kontrole s
automatickým zveřejněním po schválení. ID položky: `hocghhpigfilngdajmafkdcljdedanch`.
Stav vydání se ověřuje v [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

Po zveřejnění ověřit veřejnou stránku, zapnout příznak a vydat novou verzi aplikace, která obchod
nabídne. Balíček aplikace 0.31.4 instalaci z obchodu ještě nespáruje sám (použije se jednorázový kód
z testovacích pokynů níže). Od další verze aplikace důvěřuje ID položky v obchodě bez ohledu na
příznak zveřejnění: příznak řídí jen to, jestli aplikace a web obchod nabízejí, ne párování. Instalace
z obchodu se proto spáruje sama, hned jak ji Google zveřejní, i na verzi vydané před schválením.

Další verze: nový ZIP nahraješ v témže záznamu (**Package → Upload new package**). Verze
v `extension/manifest.json` musí být vyšší než zveřejněná. Zvedá se spolu s verzí aplikace –
`npm run build:extension` i `test/dokumentace.test.mjs` odmítnou, když se rozejdou. Automatické nahrávání z CI (Chrome Web Store API) jde doplnit později – potřebuje
OAuth klienta v Google Cloud, který si musí vytvořit vlastník.

## Karta obchodu (Store listing)

| Pole | Hodnota |
|---|---|
| Název | z `extension/_locales`: `Agenteeq – AI agenti v reálném čase` / `Agenteeq – AI agents in real time` |
| Shrnutí | z `extension/_locales` (nejvýš 132 znaků): „Webové chaty s AI v aplikaci Agenteeq na tvém počítači: jestli agent pracuje a kolik má konverzace zpráv. Text zpráv neposílá.“ / „Your web AI chats in the Agenteeq app on your computer: whether the agent is working and how many messages. Sends no message text.“ |
| Kategorie | Productivity → Workflow & Planning |
| Jazyk | angličtina (výchozí, `default_locale`) a čeština. Okno i název v Chromu se řídí jazykem prohlížeče: český Chrome dostane češtinu, ostatní angličtinu. Obchod vyplní obě karty z `_locales` sám; popis a snímky se zadávají pro každý jazyk zvlášť. |
| Ikona obchodu | `branding/chrome-web-store/export/icon-128.png` (obraz 96 × 96, průhledný okraj 16 px) |
| Snímky obrazovky | česky `branding/chrome-web-store/export/snimek-1-1280x800.png`, `snimek-2-…`, `snimek-3-…`; anglicky totéž v `export/en/` |
| Malá propagační dlaždice | `branding/chrome-web-store/export/promo-small-440x280.png` |
| Velká dlaždice (nepovinná) | `branding/chrome-web-store/export/marquee-1400x560.png` |
| Domovská stránka | https://agentree-fawn.vercel.app/ |
| Podpora | https://github.com/martin-pok/agentree/issues |

Snímky se vyrábějí ze skutečného okna rozšíření a skutečného rozhraní aplikace se smyšlenými daty:
`PLAYWRIGHT_PATH=… node branding/chrome-web-store/snimky.mjs`. Dlaždice a ikony:
`node branding/chrome-web-store/render.mjs` (na Macu s Chromem).

### Popis (Description)

```
Agenteeq ukazuje všechny tvoje AI agenty na jednom místě: Claude Code, Codex nebo Cursor z tvého počítače a díky tomuto rozšíření i webové chaty – ChatGPT, Claude.ai, Gemini, Perplexity, Microsoft Copilot, Grok, Qwen a GitHub Copilot.

Co rozšíření dělá
• Pozná, jestli služba právě odpovídá, nebo už dopsala, a jak dlouho odpovídá.
• Spočítá zprávy v konverzaci a zachytí upozornění na vyčerpaný limit.
• V okně rozšíření ukáže všechny otevřené konverzace s AI; kliknutím se přepneš do karty.
• Pošle to do aplikace Agenteeq, kde vidíš, kdo pracuje a kdo čeká na tebe.
• Zadání z aplikace („Spustit agenta“) vloží rovnou do okna služby.

Soukromí
• Neposílá text tvých zpráv ani odpovědí, názvy konverzací ani historii prohlížení.
• Data jdou jen do aplikace Agenteeq na tomtéž počítači (127.0.0.1), nikdy na internet.
• Každou službu můžeš v okně rozšíření vypnout.

Rozšíření potřebuje aplikaci Agenteeq pro Mac (zdarma ke stažení na https://agentree-fawn.vercel.app/). S aplikací se spáruje samo, žádný kód opisovat nemusíš.

Zásady ochrany soukromí: https://agentree-fawn.vercel.app/soukromi
```

### Anglická karta (English listing)

Okno rozšíření mluví anglicky v každém Chromu, který není český (`extension/i18n.js`, `extension/_locales/en`).

```
Agenteeq is a local dashboard for the status of AI work on your Mac. The extension connects supported web chats with the companion app so you can see what needs attention without opening every tab.

What it does
• Detects whether a supported conversation is replying, waiting or finished.
• Shows how long a reply has been in progress and counts messages in the active conversation.
• Lists the open conversations that the extension can see; click one to switch to its tab.
• Brings the current status into Agenteeq and can paste a prompt from the app into that chat.

Privacy
• It never sends the text of messages, responses, titles or browsing history.
• All data stays on your computer and reaches only the local Agenteeq app at 127.0.0.1.
• You can turn off individual services in the extension window.

Requires the free Agenteeq app for Mac: https://agentree-fawn.vercel.app/en

Privacy policy: https://agentree-fawn.vercel.app/en/privacy
```

## Postupy ochrany soukromí (Privacy practices)

**Jediný účel (Single purpose):**

> Zobrazit stav konverzací z webových AI služeb (odpovídá / dopsáno, počty zpráv, upozornění na limit) v aplikaci Agenteeq na tomtéž počítači.

**Zdůvodnění oprávnění:**

| Oprávnění | Zdůvodnění do formuláře |
|---|---|
| `storage` | Uloží přístupový klíč ze spárování s aplikací Agenteeq, seznam služeb, které uživatel vypnul, a poslední stav spojení. Nic jiného. |
| `scripting` | Po instalaci nebo aktualizaci rozšíření vloží sledovací skript do už otevřených karet podporovaných služeb. Bez toho by tyto karty do obnovení stránky nic nehlásily a rozepsaná konverzace by v Agenteeq chyběla. Žádný jiný skript se nikam nevkládá. |
| `alarms` | Jednou za 30 minut ohlásí aplikaci Agenteeq na tomtéž počítači, že rozšíření běží, aby aplikace neukazovala „neozývá se“, když zrovna není otevřená žádná konverzace. |
| Host `http://127.0.0.1:4620/*` | Jediná adresa, kam rozšíření posílá data: aplikace Agenteeq na tomtéž počítači (localhost). Na internet nic neposílá. |
| Host chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, copilot.microsoft.com, perplexity.ai, grok.com, chat.qwen.ai, github.com/copilot | Tytéž weby jako u content skriptů. Oprávnění slouží jen k vložení sledovacího skriptu do karet, které byly otevřené už před instalací nebo aktualizací (`scripting`). Z těchto webů se nic neposílá jinam než do aplikace na tomtéž počítači. |
| `content_scripts` na chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, copilot.microsoft.com, perplexity.ai, grok.com, chat.qwen.ai, github.com/copilot | Na stránce otevřené konverzace zjistí, jestli služba odpovídá, kolik je zpráv, název modelu a případné upozornění na limit. Text zpráv neodesílá. Na jiných webech neběží. |

**Vzdálený kód (Remote code):** Ne. Veškerý kód je v balíčku.

**Shromažďovaná data (Data usage):** data neopouštějí počítač uživatele, ale rozšíření je
předává místní aplikaci, proto je poctivé je přiznat:

- ☑ **Obsah webu (Website content)** – počty zpráv, název modelu, text upozornění na limit.
- ☑ **Historie webu (Web history)** – adresa a identifikátor otevřené konverzace na podporované službě.
- ☐ všechno ostatní (osobní údaje, přihlašovací údaje, finance, zdraví, poloha, komunikace,
  aktivita uživatele) – nesbírá se.

Zaškrtni všechna tři potvrzení: data se neprodávají třetím stranám, nepoužívají se k účelu, který
nesouvisí s jediným účelem rozšíření, a nepoužívají se k posuzování úvěruschopnosti.

**Zásady ochrany soukromí (URL):** https://agentree-fawn.vercel.app/soukromi (anglicky
https://agentree-fawn.vercel.app/en/privacy). Zdroj: `site/soukromi/index.html`,
`site/en/privacy/index.html`.

## Poznámky pro kontrolu (Test instructions)

```
The extension works together with the free Agenteeq desktop app for macOS (https://github.com/martin-pok/agentree/releases). Without the app, the extension window shows "Agenteeq isn’t running on this computer" – this is expected. The extension window follows the browser language (English, or Czech in a Czech browser).
To test: install and open the app. Once the extension is published, it pairs with the app automatically. During review the app doesn't know the store ID yet, so pair it with a one-time code: in the app open Settings → Connections → Chrome extension → "Nespárovalo se samo? Použij jednorázový kód" (didn't pair on its own? use a one-time code), click "Vytvořit jednorázový kód" (create one-time code), paste the code into the extension window and click "Pair". (The app can be switched to English in Settings → Account and appearance.) Then open any conversation on chatgpt.com or claude.ai – it appears in the app's Overview within a few seconds.
The extension only sends conversation status and message counts to http://127.0.0.1:4620 (the local app). It never sends message text.
```

## Distribuce

- Viditelnost: **veřejná** (Public). Kdo chce nejdřív zkoušet v úzkém kruhu, zvolí „Unlisted“ –
  rozšíření půjde nainstalovat jen z odkazu; adresa v `public/js/obchod.js` funguje stejně.
- Regiony: všechny.
- Po instalaci z obchodu dostane rozšíření jiné ID než ruční („rozbalená“) kopie. Aplikace věří
  oběma: ID z adresy v `public/js/obchod.js` a ID odvozenému ze složky, kterou sama připravila
  (`src/platform.js#idRozbalenehoRozsireni`). Obě se proto spárují samy a každá instalace dostane
  vlastní klíč. Na verzi aplikace 0.31.4 a starší se verze z obchodu spáruje
  jednorázovým kódem. Kdo měl ruční kopii, po instalaci z obchodu ji v `chrome://extensions` odebere,
  ať se konverzace nehlásí dvakrát.
