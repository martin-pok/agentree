# Rozšíření v Chrome Web Store

## Ověřený stav — 28. 10. 2026

- Veřejná karta stále nabízí **0.46.55** (ověřeno z veřejného HTML 28. 10.); screenshoty a popis jsou staré. Nové podklady připravené v PR #382 nebyly publikovány.
- Nový pokus 28. 10. o **0.46.85** [40668049868](https://github.com/martin-pok/agentree/actions/runs/40668049868) stáhl a ověřil ZIP, ale krok pro Google dostal prázdné `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` i `CWS_REFRESH_TOKEN`. Google balíček nepřijal; nejde o čekání na review. Stejně skončil i předchozí pokus 40541331183 z 27. 10.
- Automatický workflow mění **jen ZIP a odesílá jej ke kontrole**. Obrázky a popis musí vydavatel změnit v existující položce Developer Dashboardu, pro CZ i EN. Úspěch uploadu ZIPu neznamená aktualizovaný listing.
- Tento pracovní přístup nedokáže číst ani spravovat GitHub Secrets (HTTP 403) a nemá připojený přihlášený prohlížeč vydavatele Googlu. Hodnoty se nikdy neposílají do chatu.
- Připravená sada pro vydavatele obsahuje přesný ZIP zveřejněné 0.46.85, ikonu, šest snímků, čtyři promo podklady, oba opravené popisy a postup. SHA-256 balíčku `740f04b4c241ff9bb10e676fa8843230579dd73d622da45dc3b8a839bed82d41` souhlasí se zveřejněným `SHA256SUMS.txt`; zdroj `3aebf3d`. Příprava sady neznamená publikaci ani fyzické UAT.
- Publikační úkol zůstává otevřený, dokud veřejná karta nepotvrdí schválenou novou verzi, všechny nové obrázky a opravený popis. Tvrzení „Text zpráv neposílá“ nesmí doprovázet novou verzi, která předává viditelné zprávy pouze spárované místní aplikaci.

**Nové podklady:** screenshoty 1280×800 a promo 440×280 / 1400×560 v obou jazycích byly znovu vyrenderované ze současného rozhraní. Sada obsahuje 12 souborů včetně ověřeného ZIPu, ikony, šesti screenshotů a čtyř promo obrázků. Listing obrázky je nutné nahrát přes Developer Dashboard; automatický workflow nahrává pouze ZIP rozšíření. Fyzické Mac/Chrome UAT a veřejná verze obchodu tím nejsou potvrzené.

## Historie distribuce — 23. 10. 2026

**Veřejný Chrome Web Store nabízí 0.46.55.** Ověřeno na [veřejné kartě rozšíření](https://chromewebstore.google.com/detail/agenteeq/hocghhpigfilngdajmafkdcljdedanch) 23. 10. 2026; jde o samostatný stav vůči [desktopovému Preview v0.46.60](https://github.com/martin-pok/agentree/releases/tag/v0.46.60). Veřejný release obsahuje `agenteeq-extension-0.46.60.zip` (267 110 B, SHA-256 `0e6f312c4b909a5fa90219e70d6b050df31697d087ea001ef066f6e4ff0f2ab5`), jehož příloha prošla auditem vydání. Dostupnost ZIPu na GitHubu **neznamená zveřejnění v obchodě**.

[Workflow pro Chrome Web Store v0.46.60](https://github.com/martin-pok/agentree/actions/runs/39906389905) skončilo jako `success`, ale jeho log uvádí, že `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` a `CWS_REFRESH_TOKEN` jsou prázdné. Krok proto odešel s varováním a ZIP do obchodu **nenahrál**. Po doplnění přístupu nebo ručním nahrání musí Google balíček přijmout a veřejná karta musí ukazovat správnou verzi. Zelený stav workflow sám tento krok nedokazuje. Aktuální koordinace: [#172](https://github.com/martin-pok/agentree/issues/172).

**Před odesláním 0.46.60 do obchodu:** ověřit balíček na skutečném Chrome s aktuální nainstalovanou aplikací na Macu: párování, CZ/EN, názvy a viditelné zprávy podporovaných chatů, přepnutí do původní relace, výpadek spojení a obnovu po restartu. Zkontrolovat, že popis obchodu odpovídá skutečně odesílané verzi, protože veřejný popis pro 0.46.55 výslovně říká, že text zpráv nepředává, zatímco 0.46.60 je předává pouze místní aplikaci. Pro ruční upload použít jediný ZIP a odpovídající listing/snímky z ověřeného aktuálního buildu; postup a kontrolní součty jsou níže. Stav fyzického UAT je veden v [RELEASE-READINESS.md](RELEASE-READINESS.md) a [#208](https://github.com/martin-pok/agentree/issues/208).

---
### Historické podklady níže (stav k 13. 10. 2026)

Následující inventáře dokazují starší opravy pipeline, ale **nesmějí se znovu používat k uploadu aktuální verze**. Balíček pro 0.46.60 je určen výše; jeho odpovídající podklady je nutné vybrat z aktuálního ověřeného buildu.

Stav ověřený k 12. 10. 2026: **položka je zveřejněná, ale veřejná verze je stále 0.31.4** (záznam Chrome Web Store, aktualizace 4. 10. 2026). Vlastník potvrdil, že položka je v Chrome Web Store veřejně
dostupná. Příznak `CHROME_WEB_STORE_PUBLISHED` v `public/js/obchod.js` je zapnutý od verze 0.37.1:
web i aplikace nabízejí instalaci jedním kliknutím (**Přidat do Chromu**) a rozšíření se spáruje samo.
Na snímku veřejné stránky z 11. 10. 2026 je stále starý symbol a stará tmavá prezentační grafika.
Aktuální podklady v tomto repozitáři se na veřejné stránce projeví až po nahrání a zveřejnění
nového balíčku a obrázků v Developer Dashboard.

Příznak je jediné místo, které instalaci z obchodu zapíná všude najednou: kartu v aplikaci
(Nastavení → Propojení → Rozšíření pro Chrome, tlačítko **Přidat do Chromu**), web
(úvodní stránka a stránka Instalace `site/instalace`, `site/en/install` – sestavení
`scripts/build-site.mjs#rozsireniNaWebu` nechá jen blok `rozsireni:obchod`) a popis vydání.
Když je vypnutý, ukazuje se všude ruční instalace. Po zapnutí je potřeba web přestavět (`npm run build:site`, na hostingu se to stane samo).

## Ověřitelná sada pro vydavatele — nová příprava (po 0.46.7)

**Cíl:** zabránit tomu, aby se do obchodu omylem nahrál starší ZIP s novými
screenshoty, nebo ZIP z jiného commitu než vizuální podklady. CI na `main`
po vykreslení reálného popupu a buildění rozšíření skládá jediný artifact
`chrome-store-review-kit`:

- `package/agenteeq-extension-X.Y.Z.zip` — **jediný ZIP pro Package → Upload new package**;
- `listing/` — ikona 128 px, české a anglické screenshoty 1280×800 a promo obrázky;
- `STORE-KIT.json` — přesná verze, zdrojové SHA, seznam a SHA-256 souborů;
- `SHA256SUMS.txt` a `PUBLISHING-GATE.txt` — ověření příloh a ruční stop podmínky.

Skript `scripts/prepare-chrome-store-kit.mjs` rozbalí manifest ze **skutečně
sestaveného ZIPu**, porovná jej se zdrojovým manifestem a verzí aplikace, ověří
rozměry všech devíti obrázků a připojí jejich kryptografické otisky. Souborům
nepřisuzuje žádný status publikace. Testy používají odlišné a poškozené ZIPy.

**Před použitím:** vybrat artefakt z dokončeného běhu `Testy` na `main`
s přesně **8/8 úspěšnými úlohami**, porovnat SHA commitu, ověřit skutečné UI,
proporce ikony, CZ/EN, párování a navigaci z čistého Chrome profilu i po
restartu hostitele. Artefakt je připravená sada, nikoli schválený release.
Vlastník musí ručně nahrát jednotlivý ZIP a odpovídající obrázky do existující
položky `hocghhpigfilngdajmafkdcljdedanch`, potvrdit publikaci a následně
ověřit veřejnou verzi i zobrazení. **Nepublikovat jen proto, že prošlo CI.**

## Konkrétní kontrolní balíček 0.46.8 — zatím **nevydáno**

Z PR #184, úspěšného CI runu [38302384956](https://github.com/martin-pok/agentree/actions/runs/38302384956), vznikl artefakt `agenteeq-extension-store-upload` **ID 11771456640**. Nalezený vnitřní soubor `agenteeq-extension-0.46.8.zip` má **244 296 B**, SHA-256 `a17a810d0cc159682ba1b801eda3ba0c7bbe8566bd9596d73fb55aaf42d1a7d1`. Ručně ověřený manifest je MV3 **0.46.8**; balíček obsahuje 32 souborů, obě lokalizace CZ/EN a skutečné PNG ikony **16, 32, 48 a 128 px**. Nejsou v něm nečekané absolutní cesty ani soubory `../`. Kontrola je z kandidátského **PR CI**; neznamená, že totéž již bylo publikováno v Chromu nebo že pozdější release tag poskytne bajtově totožný ZIP.

**Ověřený publisher kit z `main`:** dokončený úspěšný běh [`Testy` #38303337878](https://github.com/martin-pok/agentree/actions/runs/38303337878), přesné zdrojové SHA `dd32fa98879a8c34137c6bde49b50dc205202e93`, artefakt **`chrome-store-review-kit` ID `11771448189`**. Ze skutečně staženého archivu bylo nezávisle zkontrolováno **10/10 obsahových souborů** proti `STORE-KIT.json` i `SHA256SUMS.txt`: SHA-256 a velikosti sedí, všech šest CZ/EN screenshotů má 1280×800, promo 440×280, marquee 1400×560 a ikona 128×128. `listing/icon-128.png` je **bajtově totožná** s ikonou uvnitř instalačního ZIPu. Interní manifest je MV3 `0.46.8` a ZIP má SHA-256 `a17a810d0cc159682ba1b801eda3ba0c7bbe8566bd9596d73fb55aaf42d1a7d1`.

**Důležitá distribuční odchylka — ověřeno porovnáním skutečných archivů 12. 10. 2026:** právě popsaná sada z CI obsahuje ZIP **244 296 B / `a17a810d…`**, kdežto jediný ZIP stejné verze v oficiálním draftu GitHub releasu `v0.46.8` obsahuje **244 357 B / `98e6af3e…`** (přesný SHA-256 `98e6af3ed918595832ec39b839f3550202ded6c7a03ab3d0fe3ec33f463b0119`). Po rozbalení obou archivů je všech 32 názvů stejných a **28 souborů bajtově identických**, ale ikony `icons/icon-16.png`, `icon-32.png`, `icon-48.png` a `icon-128.png` se liší. Příčinou je dodatečné rasterizování ikon v Chromiu během Store CI; release použil schválené ikony z Git repozitáře. **Starý review kit není totožný s release ZIPem a nesmí být prezentován jako jeho identická kopie.** Oprava v [PR #190](https://github.com/martin-pok/agentree/pull/190) zakazuje tiché přepisování těchto schválených PNG a kontroluje přesnou shodu obalových obrázků s ZIPem. Pro skutečný upload vybrat až novou ověřenou sadu po úspěšném CI a nezávisle porovnat její ZIP s oficiálním release digestem; schválení a UAT stále zůstávají oddělené. Tato oprava **nemění již sestavený draft**.

**Zbývá reálné UAT a publikace:** vyzkoušet ZIP na čistém Chrome profilu vedle skutečně nainstalovaného Agenteeq, párování, filtry, přepnutí do existujícího agenta, dostupnost/offline a obnovu po restartu; fyzicky ověřit macOS balíček a kompatibilitu. Obrázky obchodu zobrazují **skutečné UI s testovacími daty**, ne živé přihlašování. Teprve po úspěchu a schválení vlastníka pod existujícím ID `hocghhpigfilngdajmafkdcljdedanch` v [Developer Dashboard](https://chrome.google.com/webstore/devconsole) nahrát **Package → Upload new package**, CZ/EN screenshoty/promo, projít Privacy practices, odeslat ke kontrole a po schválení ověřit veřejný listing. GitHub CI nic nezveřejňuje. Viz [issue #172](https://github.com/martin-pok/agentree/issues/172) a [release gate #187](https://github.com/martin-pok/agentree/issues/187).

## Stav účtu vydavatele

Registrace vývojáře byla uhrazena. Vydavatel zvolil stav **neobchodník** a ověřil kontaktní e-mail.

Veřejný záznam Chrome Web Store ověřený 12. 10. 2026 stále ukazuje verzi **0.31.4**. V repozitáři je od PR #184 ve zdrojovém manifestu kandidát **0.46.8**; **ani zelené CI, ani ZIP pro Store nejsou důkazem jeho veřejného vydání**. Verzi přílohy z konkrétního buildu je vždy nutné číst z `manifest.json` uvnitř výsledného ZIPu. Developer Dashboard
vyžaduje opětovné ověření vlastníka Google účtu, takže aktualizaci balíčku a obrázků musí předcházet
jeho přihlášení. Zelené CI samo nic do obchodu nenahrává. ID položky:
`hocghhpigfilngdajmafkdcljdedanch`.
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
| Shrnutí | z `extension/_locales` (nejvýš 132 znaků): uvádí stav agenta, skutečné názvy a viditelné zprávy předávané jen místní aplikaci. |
| Kategorie | Productivity → Workflow & Planning |
| Jazyk | angličtina (výchozí, `default_locale`) a čeština. Okno i název v Chromu se řídí jazykem prohlížeče: český Chrome dostane češtinu, ostatní angličtinu. Obchod vyplní obě karty z `_locales` sám; popis a snímky se zadávají pro každý jazyk zvlášť. |
| Ikona obchodu | `branding/chrome-web-store/export/icon-128.png` (obraz 96 × 96, průhledný okraj 16 px) |
| Snímky obrazovky | česky `branding/chrome-web-store/export/snimek-1-1280x800.png`, `snimek-2-…`, `snimek-3-…`; anglicky totéž v `export/en/` |
| Malá propagační dlaždice | `branding/chrome-web-store/export/promo-small-440x280.png` |
| Velká dlaždice (nepovinná) | `branding/chrome-web-store/export/marquee-1400x560.png` |
| Domovská stránka | https://agentree-fawn.vercel.app/ |
| Podpora | https://github.com/martin-pok/agentree/issues |

Snímky se vyrábějí ze skutečného okna rozšíření s ukázkovými stavy a počty:
`PLAYWRIGHT_PATH=… node branding/chrome-web-store/snimky.mjs`. Dlaždice a ikony:
`node branding/chrome-web-store/render.mjs` (na Macu s Chromem).
Pro anglickou kartu jsou vedle tří snímků v `export/en/` také anglické verze obou dlaždic.
Třetí snímek ukazuje skutečný stav okna při vypnuté místní aplikaci; starý výřez předchozího
rozhraní aplikace už se v podkladech obchodu nepoužívá.

### Popis (Description)

```
Agenteeq ukazuje všechny tvoje AI agenty na jednom místě: Claude Code, Codex nebo Cursor z tvého počítače a díky tomuto rozšíření i webové chaty – ChatGPT, Claude.ai, Gemini, Perplexity, Microsoft Copilot, Grok, Qwen a GitHub Copilot.

Co rozšíření dělá
• Pozná, jestli služba právě odpovídá, nebo už dopsala, a jak dlouho odpovídá.
• Spočítá zprávy v konverzaci a zachytí upozornění na vyčerpaný limit.
• Ukáže skutečný název konverzace a viditelné zprávy v místní aplikaci.
• V okně rozšíření ukáže všechny otevřené konverzace s AI; kliknutím se přepneš do karty.
• Pošle to do aplikace Agenteeq, kde vidíš, kdo pracuje a kdo čeká na tebe.
• Zadání z aplikace („Spustit agenta“) vloží rovnou do okna služby.

Soukromí
• Názvy a viditelné zprávy posílá jen spárované místní aplikaci; přílohy, cookies ani historii prohlížení neposílá.
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
• Shows the real conversation title and visible messages in the local app.
• Lists the open conversations that the extension can see; click one to switch to its tab.
• Brings the current status into Agenteeq and can paste a prompt from the app into that chat.

Privacy
• It sends visible messages and conversation titles only to the paired local Agenteeq app.
• It never sends attachments, cookies or browsing history to the app.
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
| Volitelné: host 127.0.0.1 (libovolný port) | Jen když uživatel v okně rozšíření nastaví jiný port aplikace Agenteeq než výchozí 4620 (aplikace spuštěná s proměnnou `PORT`). Chrome se na oprávnění zeptá v tu chvíli; bez něj rozšíření dál mluví jen s 127.0.0.1:4620. Data nikdy neodcházejí mimo tento počítač. |
| `content_scripts` na chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, copilot.microsoft.com, perplexity.ai, grok.com, chat.qwen.ai, github.com/copilot | Na stránce otevřené konverzace zjistí stav, počty, skutečný název, viditelné zprávy, model a případný limit. Údaje předává jen spárované místní aplikaci. Na jiných webech neběží. |

**Vzdálený kód (Remote code):** Ne. Veškerý kód je v balíčku.

**Shromažďovaná data (Data usage):** data neopouštějí počítač uživatele, ale rozšíření je
předává místní aplikaci, proto je poctivé je přiznat:

- ☑ **Obsah webu (Website content)** – počty a text viditelných zpráv, název konverzace, název modelu, text upozornění na limit.
- ☑ **Osobní komunikace (Personal communications)** – text viditelných zpráv; jen přenos do spárované místní aplikace, bez serveru provozovatele.
- ☑ **Historie webu (Web history)** – adresa a identifikátor otevřené konverzace na podporované službě.
- ☐ všechno ostatní (osobní údaje, přihlašovací údaje, finance, zdraví, poloha,
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
The extension sends conversation status, real titles and visible messages to http://127.0.0.1:4620 (the paired local app). It does not send them to a remote server.
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

## Automatické nahrání po zveřejnění vydání

Workflow `.github/workflows/chrome-web-store.yml` se spustí po každém zveřejnění vydání (i ručně
s tagem). Stáhne ZIP rozšíření z příloh, ověří ho proti `SHA256SUMS.txt` a verzi manifestu,
nahraje ho do položky `hocghhpigfilngdajmafkdcljdedanch` přes Chrome Web Store API a odešle ke
kontrole. Zveřejnění v obchodě pak závisí jen na kontrole Googlu.

Jednorázově potřebuje tři tajné hodnoty repozitáře (Settings → Secrets and variables → Actions):
`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` – OAuth klient typu Desktop v Google Cloud
projektu se zapnutým Chrome Web Store API, přihlášený účtem vydavatele (scope
`https://www.googleapis.com/auth/chromewebstore`). Bez nich workflow skončí chybou, aby zelený běh
nemohl znamenat, že aktualizace ve skutečnosti nebyla nahrána. Obrázky v záznamu obchodu API
nemění; ty se mění ručně v Developer Dashboard.
