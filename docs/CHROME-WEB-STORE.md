# Rozšíření v Chrome Web Store

Stav k 26. 9. 2026: **připraveno k odeslání, zatím neodesláno.** Dokud v obchodě není, aplikace
i web ukazují ruční instalaci („Načíst rozbalené“). Po schválení stačí vložit adresu do
`public/js/obchod.js` a aplikace i web přepnou na „Přidat do Chromu“ (hlídá
`test/chrome-web-store.test.mjs`).

## Co musí udělat vlastník (jednou, asi 20 minut)

Registrace vývojáře stojí **jednorázově 5 USD** (ne ročně) a zaplatit ji může jen majitel účtu
Google, pod kterým bude rozšíření vedené.

1. Otevři [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   přihlas se účtem Google, který má zapnuté **dvoufázové ověření** (bez něj obchod nic nezveřejní),
   přijmi podmínky a zaplať 5 USD kartou.
2. V účtu vyplň **kontaktní e-mail** a ověř ho. U otázky na obchodníka (trader) zvol, že nejsi
   obchodník – rozšíření je zdarma a nic neprodává. (Kdyby se to změnilo, obchod chce adresu a telefon.)
3. `npm run build:extension` → nahraj `dist/agenteeq-extension-<verze>.zip` přes **Add new item**.
4. Vyplň kartu podle sekcí níže (texty jsou hotové, jen je zkopíruj) a klikni na
   **Submit for review**. Kontrola obvykle trvá pár dní.
5. Po schválení zkopíruj adresu stránky rozšíření
   (`https://chromewebstore.google.com/detail/agenteeq/<ID>`) do `public/js/obchod.js`
   a vydej novou verzi. ID pošli i sem, ať ho doplníme do dokumentace.

Další verze: nový ZIP nahraješ v témže záznamu (**Package → Upload new package**). Verze
v `extension/manifest.json` musí být vyšší než zveřejněná. Zvedá se spolu s verzí aplikace –
`npm run build:extension` i `test/dokumentace.test.mjs` odmítnou, když se rozejdou. Automatické nahrávání z CI (Chrome Web Store API) jde doplnit později – potřebuje
OAuth klienta v Google Cloud, který si musí vytvořit vlastník.

## Karta obchodu (Store listing)

| Pole | Hodnota |
|---|---|
| Název | z manifestu: `Agenteeq – AI agenti v reálném čase` |
| Shrnutí | z manifestu (132 znaků): „Posílá stav a počty zpráv z webových AI aplikací do Agenteeq na tomto počítači (127.0.0.1). Text zpráv neposílá.“ |
| Kategorie | Productivity → Workflow & Planning |
| Jazyk | čeština (okno rozšíření je zatím jen česky) |
| Ikona obchodu | `branding/chrome-web-store/export/icon-128.png` (obraz 96 × 96, průhledný okraj 16 px) |
| Snímky obrazovky | `branding/chrome-web-store/export/snimek-1-1280x800.png`, `snimek-2-…`, `snimek-3-…` |
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
• Pozná, jestli služba právě odpovídá, nebo už dopsala.
• Spočítá zprávy v konverzaci a zachytí upozornění na vyčerpaný limit.
• Pošle to do aplikace Agenteeq, kde vidíš, kdo pracuje a kdo čeká na tebe.
• Zadání z aplikace („Spustit agenta“) vloží rovnou do okna služby.

Soukromí
• Neposílá text tvých zpráv ani odpovědí, názvy konverzací ani historii prohlížení.
• Data jdou jen do aplikace Agenteeq na tomtéž počítači (127.0.0.1), nikdy na internet.
• Každou službu můžeš v okně rozšíření vypnout.

Rozšíření potřebuje aplikaci Agenteeq pro Mac (zdarma ke stažení na https://agentree-fawn.vercel.app/). Spáruješ je jednorázovým kódem z aplikace: Nastavení → Propojení → Rozšíření pro Chrome.

Zásady ochrany soukromí: https://agentree-fawn.vercel.app/soukromi
```

Anglická verze popisu pro pozdější anglickou kartu (až okno rozšíření umí anglicky):

```
Agenteeq shows all your AI agents in one place: Claude Code, Codex or Cursor on your computer and, with this extension, web chats too – ChatGPT, Claude.ai, Gemini, Perplexity, Microsoft Copilot, Grok, Qwen and GitHub Copilot.

What the extension does
• Detects whether a service is responding or has finished.
• Counts the messages in a conversation and picks up limit notices.
• Sends this to the Agenteeq app, where you see who is working and who is waiting for you.
• Pastes a prompt from the app (“Start an agent”) straight into the service’s window.

Privacy
• Never sends the text of your messages or replies, conversation titles or browsing history.
• Data goes only to the Agenteeq app on the same computer (127.0.0.1), never to the internet.
• You can turn off any service in the extension window.

The extension needs the Agenteeq app for Mac (free at https://agentree-fawn.vercel.app/en). Pair them with a one-time code from the app: Settings → Connections → Chrome extension.

Privacy policy: https://agentree-fawn.vercel.app/en/privacy
```

## Postupy ochrany soukromí (Privacy practices)

**Jediný účel (Single purpose):**

> Zobrazit stav konverzací z webových AI služeb (odpovídá / dopsáno, počty zpráv, upozornění na limit) v aplikaci Agenteeq na tomtéž počítači.

**Zdůvodnění oprávnění:**

| Oprávnění | Zdůvodnění do formuláře |
|---|---|
| `storage` | Uloží přístupový klíč ze spárování s aplikací Agenteeq, seznam služeb, které uživatel vypnul, a poslední stav spojení. Nic jiného. |
| `alarms` | Jednou za 30 minut ohlásí aplikaci Agenteeq na tomtéž počítači, že rozšíření běží, aby aplikace neukazovala „neozývá se“, když zrovna není otevřená žádná konverzace. |
| Host `http://127.0.0.1:4620/*` | Jediná adresa, kam rozšíření posílá data: aplikace Agenteeq na tomtéž počítači (localhost). Na internet nic neposílá. |
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
The extension works together with the free Agenteeq desktop app for macOS (https://github.com/martin-pok/agentree/releases). Without the app, the extension window shows "Agenteeq na Macu neběží" (Agenteeq is not running on the Mac) – this is expected.
To test: install the app, open Settings → Connections → Chrome extension, click "Vytvořit jednorázový kód" (create one-time code), paste the code into the extension window and click "Spárovat" (pair). Then open any conversation on chatgpt.com or claude.ai – it appears in the app's Overview within a few seconds.
The extension only sends conversation status and message counts to http://127.0.0.1:4620 (the local app). It never sends message text.
```

## Distribuce

- Viditelnost: **veřejná** (Public). Kdo chce nejdřív zkoušet v úzkém kruhu, zvolí „Unlisted“ –
  rozšíření půjde nainstalovat jen z odkazu; adresa v `public/js/obchod.js` funguje stejně.
- Regiony: všechny.
- Po instalaci z obchodu dostane rozšíření jiné ID než ruční („rozbalená“) kopie. Párování na ID
  nezávisí (každá instalace si vezme vlastní klíč přes jednorázový kód). Kdo měl ruční kopii,
  po instalaci z obchodu ji v `chrome://extensions` odebere, ať se konverzace nehlásí dvakrát.
