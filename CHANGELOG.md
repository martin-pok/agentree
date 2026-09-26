# Changelog

## Nevydáno

### Web: stejné okraje obsahu a anglické ukázky

- FAQ a instalační postup lícují s ostatními sekcemi. Používají společnou šířku `.wrap`
  místo užšího sloupce; boční okraje hlídá `qa:site` v obou jazycích na 360–1440 px.
- Anglický web používá vlastní anglické výřezy skutečné aplikace, včetně názvů ukázkových
  projektů, činností a žádosti o rozhodnutí. `shots:site` fotí obě jazykové verze a ukládá
  jejich rozměry společně; HTML rezervuje správnou výšku i tam, kde se překlad zalomí jinak.
- Tlačítka otevření konverzace ze serveru se překládají při vykreslení v aplikaci, například
  „Pokračovat v Terminálu“ → „Continue in Terminal“. Cizí popisky zůstávají escapované.
- WebKit QA počká na dokončení asynchronního startu před reloadem. Dřívější předčasný
  reload rušil úvodní dotaz a způsoboval chybu importu modulu ve starém dokumentu.
- Nativní QA používá vlastní volný port i data. Může běžet vedle otevřené aplikace;
  dřívější pokus o port 4620 vedl ke správnému odmítnutí kolize, ale falešnému selhání QA.
  Otevírání agentů, Klíčenka, účet a nativní oznámení jsou v QA výslovně vypnuté.

### Claude Code se najde, i když ho aplikace z Finderu nevidí v PATH

- **Oprava:** na Macu hlásilo Nastavení u Claude Code „Není nainstalovaný“, přestože byl.
  Aplikace spuštěná z Finderu hledá programy přihlašovacím shellem, který nečte `~/.zshrc` –
  a právě tam instalátor Claude Code přidává `~/.local/bin`. Agenteeq teď po shellu projde
  i místa, kam program dávají známé instalace (`~/.local/bin`, `~/.claude/local`, Homebrew,
  globální npm, bun, Volta, pnpm, nvm).
- **Oprava:** „nehledalo se“ se už nevydává za „není“. Když se programy vůbec nehledaly, řádek
  ukáže „Nepodařilo se zjistit“; když se hledaly a nenašly, „Nenalezen“ (ne „Není nainstalovaný“).
- U každého agenta je vidět, kdy na tomhle Macu naposledy pracoval, nebo že za posledních
  30 dní nepracoval. Tokeny i stav se berou z přepisů na tomhle Macu – práce, která běžela
  jinde (třeba Claude Code v cloudu), tu vidět není a tohle to řekne přímo u agenta.

### Nastavení: menu přepíná skupiny, stránka se nehýbe

- Klik na položku v levém menu Nastavení ukáže vybranou skupinu jako v Nastavení macOS. Dřív to
  byly kotvy na jedné dlouhé stránce: klik ji posunul k sekci a nadpis „Nastavení“ odjel
  z obrazovky. Teď se nehne nadpis, menu ani stránka; hluboko v dlouhé skupině se stránka jen
  srovná tak, aby nová skupina začínala u menu, které stojí dál na svém místě.
- `qa:desktop` kliká na všechny položky menu na 1440 i 375 px a hlídá, že se nic nepohnulo;
  `qa:contrast` měří každou skupinu zvlášť.

### Aplikace: plynulé posouvání kolečkem

- Krok kolečka myši se v aplikaci rozloží do plynulého dojezdu, stejně jako na webu – dřív
  každé cvaknutí skočilo o kus stránky najednou (WKWebView na Macu kolečko nerozkládá).
  Zapne se jen na počítači bez dotyku a bez „omezit pohyb“. Na kraji stránky zůstává nativní
  odraz, vnořené seznamy dostanou kolečko samy, pod otevřeným vyhledáváním nebo dialogem se
  stránka nehne a přepnutí obrazovky, klávesnice i posuvník mají před dojezdem přednost.
- Během posouvání karty pod stojícím kurzorem už jedna po druhé nenaskakují do zvednutého
  stavu se stínem. Kliknout jde kdykoli, i hned po posunu.
- Web a aplikace mají teď jeden modul (`public/js/plynule-posouvani.js`) místo dvou kopií.
- Měřeno se 4× zpomaleným procesorem na ukázkových datech: všechny obrazovky drží při
  posouvání 60 snímků za vteřinu. `qa:desktop` nově měří plynulý a přesný dojezd, klik hned
  po posunu, zamčenou stránku a přednost cizího posunu.

### Angličtina v aplikaci: přepínač v Nastavení

- Nastavení mají novou kartu „Jazyk aplikace“ (Čeština / English) hned pod Vzhledem. Volba se
  ukládá na server, který podle ní vepíše `<html lang>` do stránky ještě před odesláním – takže
  se po přepnutí (stránka se znovu načte) rozhraní naběhne rovnou ve zvoleném jazyce, bez
  probliknutí druhého jazyka.
- Anglický slovník (`public/js/i18n/en.js`) je teď kompletní pro celé rozhraní aplikace, včetně
  levé lišty a záhlaví, které byly napevno v index.html a předtím zůstávaly česky i po přepnutí
  jazyka.

### Rozcestník „Kde máš Agenteeq?“: ukázka jedním klepnutím

- **Oprava:** kdo otevřel `/app` bez `?ukazka` (a bez páru na skutečný Mac), viděl jen políčko
  na adresu Macu – nic, do čeho by šlo napsat, když žádný Mac po ruce není. Obrazovka teď má
  hned nahoře tlačítko „Prohlédnout ukázku bez instalace“, které jedním klepnutím otevře
  skutečné rozhraní se smyšlenými daty. Připojení ke skutečnému Macu zůstává pod ním jako
  druhá cesta.

### Aplikace pro Windows: rozhraní konečně ví, že běží v aplikaci

- **Oprava:** most mezi oknem a rozhraním na Windows spadl dřív, než stránka vůbec vznikla
  (WebView2 ho pouští před vytvořením `<html>`). Rozhraní se proto chovalo jako v prohlížeči:
  nemělo rozvržení okna aplikace (`is-desktop`, `is-windows`), radilo spouštět server
  z Terminálu a plášť od něj nedostal žádnou zprávu (připravenost, přepnutí vzhledu). Týká se
  vydání 0.27.0 pro Windows.
- Na macOS se příznak aplikace nastavuje už na začátku dokumentu, takže se rozhraní vykreslí
  rovnou s rozvržením okna.
- **CI spouští to, co si člověk stáhne:** `npm run qa:native` rozbalí archiv pro Mac i Windows,
  spustí aplikaci, počká na vykreslené rozhraní, nafotí okno a ověří, že po ukončení aplikace
  skončí i server. Dřív se aplikace pro Mac v CI vůbec nespouštěla a plášť pro Windows se jen
  překládal.
- Nový test hlídá, že aplikace funguje samostatně: bez npm závislostí, bez cizích serverů,
  bez Claude Code, účtu i sítě.

### Web: plynulé posouvání

- Kolečko a trackpad na počítači posouvají stránku plynulým dojezdem místo skoků po krocích.
  Stránka se dál posouvá skutečným posunem okna, takže nástupy dlaždic, lepivá lišta, hledání na
  stránce, klávesnice, posuvník i odkazy na sekce fungují jako dřív.
- Na telefonu, tabletu a dotykovém notebooku zůstává posouvání celé nativní a s „omezit pohyb“ se
  efekt nezapne. `qa:site` měří plynulý dojezd, Page Down, odkaz na sekci a to, že se na dotyku ani
  s omezeným pohybem nezapne.
- Oprava: anglická stránka ukazovala u kopírovatelné adresy české „Kliknutím zkopíruješ“ a
  „zkopírováno“.

### Web: anglická verze a přepínač jazyka

- Stránka je i anglicky na `/en`, se stejnou stavbou jako česká (hlídá to test). Výchozí zůstává
  čeština; přepínač CZ | EN je v liště na každé šířce, vyhledávače dostanou `hreflang` a sitemap
  s oběma verzemi.
- Oprava: tlačítko v liště ukazovalo „Stáhnout   pro Mac“ s dvojitou mezerou (mezera z `gap`
  flexu místo obyčejné mezery).
- Rozšíření: stránka už netvrdí nic, co neumí – posílá jen stav konverzace a počty zpráv, žádný
  text, a jen aplikaci na stejném počítači.

### Web: nová stavba stránky a oprava posouvání na iPhonu

- **Oprava: prohlídka na webu blokovala posouvání na iPhonu.** Vložená aplikace (`/app?ukazka`
  v rámu) si v iOS Safari nechávala tah prstem, takže přes rám, který zabíral skoro celou
  obrazovku, nešlo stránku posunout. Ve stránce teď žádný rám není.
- **Stránka je řada jednotek s jednou zprávou**: vycentrovaný nadpis, jedna věta, výzva a pod tím
  jeden obraz produktu. Produkt ukazují výřezy skutečného rozhraní v dlaždicích (pruh stavu,
  seznam agentů, rozhodnutí, limit, projekt, Útrata) – bez postranního panelu a spodní lišty,
  nic přes sebe, nic uříznuté. Propojení, soukromí, stažení a otázky bez rámečků, na plochách.
- Telefon má vlastní výřezy z telefonního rozvržení aplikace. Nástup dlaždic řídí CSS podle
  posouvání, nic neběží samo.
- `npm run qa:site` měří, že tah prstem (Chromium) a kolečko (Chromium i WebKit) přes hero i každou
  dlaždici posune stránku a že dlaždice po dojetí do okna není průhledná.

## 0.27.0 – 2026-09-25 · export útraty do CSV

- **Útrata → Výdaje → Export CSV:** posledních 12 měsíců pro účetnictví nebo vlastní tabulku.
  Řádek za každou platbu v každém měsíci – měsíční předplatné má řádek v každém měsíci, kdy
  běželo (31. se v kratším měsíci posune na poslední den), takže součet za měsíc sedí s obrazovkou.
- Každý řádek nese částku v původní měně, kurz a částku v měně aplikace, aby šel převod
  zkontrolovat, a zdroj: zapsáno ručně, Admin API, nebo předplatné podle ceníku.
- Soubor otevře česká tabulka napřímo: středník, desetinná čárka, UTF-8 s BOM. Poznámka
  začínající `=`, `+`, `-` nebo `@` se nespustí jako vzorec. API `GET /api/spend/export?mesicu=1–36`.
- Zápis CSV sdílí export projektu i útraty (`src/csv.js`). V živé prohlídce na webu tlačítko
  není – nemá server, ze kterého by stahovalo.

### Z uživatelského testování

- Vybraná položka v nabídkách (Služba, Typ platby, Měna, …) měla pro čtečku obrazovky název
  „ChatGPT ✓“ – fajfka z CSS se propisovala do názvu, ač výběr hlásí `aria-selected`. Teď má
  fajfka prázdný alternativní text; starší prohlížeč ji ukáže jako dřív.
- Nabídky a kalendář otevřené v modálním okně se vkládají dovnitř okna (dřív na konec stránky)
  a běží ve vrchní vrstvě, takže je okno neořízne. V Chromiu byly položky pro čtečku dostupné už
  předtím; změna míří na WebKit a VoiceOver (aplikace pro Mac), kde to tady ověřit nešlo.
  `qa:desktop` teď v okně „Přidat výdaj“ vybírá službu, datum a hlídá, že Esc zavře jen kalendář.

## 0.26.0 – 2026-09-25 · ověření webových služeb v okně rozšíření

- **Okno rozšíření → Ověřit tuto stránku.** Na stránce podporované služby adaptér řekne, co
  našel a čím: konverzaci podle adresy, pole pro zadání (přesně, jen obecnou zálohou, nebo
  vůbec), počty zpráv (přesně, nebo obecnou zálohou), zachycený přechod pracuje → hotovo
  a hlášku o limitu. Uživatel potvrdí, jestli počty sedí. Stav nese vždy věta, ne jen barva.
- **Uložit vzorek stránky:** anonymizovaná stavba stránky bez textu zpráv, názvů, jmen,
  odkazů, obrázků, skriptů a hodnot polí; z popisku tlačítka zůstane jen slovo jako „Stop“,
  z hlášky o limitu jen klíčové slovo, z adresy jen stavba s ID nahrazenými `x-id`. Soubor si
  uloží uživatel; nic se nikam neposílá.
- Vzorky z živých stránek patří do `test/fixtures/web/` a test je přehraje v minimálním DOM bez
  závislostí (`test/mini-dom.mjs`): potvrzený vzorek je regresní test, nepotvrzený „todo“.
  Stejné stránky ve skutečném Chromiu dávají stejnou diagnostiku jako jejich přehraný vzorek.
- Popis rozšíření v manifestu i v okně už neříká „přepis“ – od 0.25.0 posílá jen stav a počty.
- `docs/ROADMAP.md` prověřená proti kódu: co je hotové, co se rozhodlo jinak a co brzdí ostrý
  provoz (sekce „Teď – po 0.25.0“).

## 0.25.0 – 2026-09-24 · účet Agenteeq, napojení modelů a vlastní klíč pro každé rozšíření

- **Rozšíření pro Chrome dostávalo token hooků Claude Code.** Kdo ho získal z kteréhokoli
  prohlížeče, mohl podvrhnout hooky („potřebuje rozhodnutí“, limity) i konverzace ostatních
  prohlížečů a nové spárování na tom nic neměnilo (`docs/SECURITY.md`, nález #7). Teď dostane
  každá instalace při spárování vlastní token platný jen z jejího původu `chrome-extension://…`.
  Token hooků pro rozšíření neplatí a token rozšíření neplatí pro hooky.
- Nové spárování téže instalace starý token zneplatní, jiné profily Chromu zůstanou připojené.
  Na disku je jen sha256 tokenu a nejvýš 5 instalací.
- **Rozšíření spárované postaru je potřeba spárovat znovu.** Aplikace ho nehlásí jako připojené,
  protože server by jeho data odmítl, ale jako „Spáruj znovu“ – v Nastavení i v prvních krocích
  na Přehledu. Rozšíření po odmítnutém tokenu hned nabídne nové spárování.
- Testy procházejí i na Windows: cesta k souborům se skládá z URL a konce řádků drží
  `.gitattributes` jednotné na všech systémech.

### Přehled účtu na webu

- **`/app?ucet`:** přihlášení přes Google i na webu a přehled souhrnů ze všech Maců – agenti teď,
  tokeny za 30 dní, útrata tohoto měsíce, limity s obnovou a zařízení. Funguje, i když je Mac
  vypnutý; web jen čte a vidí jen řádky přihlášeného (RLS).
- Rozcestník „Kde máš Agenteeq?“ nabízí přihlášení účtem; uložené přihlášení otevře přehled rovnou.

### Synchronizace souhrnů do účtu

- **Nastavení → Účet a vzhled → Synchronizovat souhrny do účtu** (vypnuto, dokud ho nezapneš).
  Odchází jen čísla: tokeny po dnech, útrata po měsících, limity, počty agentů a které zdroje
  jsou napojené. Každý řádek projde seznamem povolených polí; název konverzace, cesta, zadání ani
  poznámka k výdaji neodejdou (hlídá test).
- „Co přesně posíláme“ ukáže přesně odcházející balík. Vypnutí souhrny z účtu smaže.
- Databáze: `usage_daily.tokens` (vstup + výstup, jako v aplikaci), rozpad po dnech je `null`,
  ne nula; útrata zná i druh Extra usage.

### Napojení modelů tlačítkem a webové chaty bez textu

- **Nastavení → Propojení → Napojené modely.** U Claude Code a Codexu klik na „Napojit“ spustí jejich
  vlastní přihlášení v Terminálu (otevře se prohlížeč u Anthropicu nebo OpenAI). Agenteeq se
  každé 2 s ptá `claude auth status` / `codex login status` a po přihlášení ukáže „Napojení …
  proběhlo v pořádku“ i s plánem. Webové chaty (ChatGPT, Claude.ai, Gemini, Perplexity) se napojí
  otevřením služby; potvrdí je první stav z rozšíření.
- **Rozšíření pro Chrome už neposílá text zpráv ani název konverzace**, jen stav (pracuje, čeká,
  limit) a počty zpráv. Server text zahodí i od starší verze rozšíření. Webová konverzace se
  jmenuje podle služby a konce svého ID a nemá přepis.

### Účet Agenteeq: přihlášení přes Google

- **Nastavení → Účet a vzhled → Přihlásit se přes Google.** Otevře se prohlížeč, po přihlášení se
  okno Agenteeq vrátí do popředí a potvrdí, kdo se přihlásil. Bez účtu funguje všechno dál.
- Přihlášení je PKCE s jednorázovým pokusem (10 minut). Návrat přijme jen tento Mac. Obnovovací
  token je v Klíčence macOS, přístupový jen v paměti. Výpadek sítě není odhlášení: stav je
  „nedostupné“ a obnova se zkouší znovu.
- Cloudová databáze (Supabase, Frankfurt) je připravená na souhrny: tokeny po dnech, útrata po
  měsících, limity a počty agentů. Text konverzací, jejich názvy, cesty ani kód do ní nejdou.
  Každá tabulka má RLS, ověřenou skriptem `supabase/tests/rls.sql` (15 případů).
- Účet jde odhlásit i smazat i s daty v cloudu; na Macu se nic nemaže. Postup a nastavení
  projektu: `docs/ACCOUNTS.md`.

### Nástup obrazovek a živá prohlídka na webu

- **Přehled, Projekty a Útrata se při otevření rozsvítí.** Karty projektů vyjedou postupně,
  měřidlo rozpočtu se dokreslí jen do skutečné hodnoty, pruhy a sloupečky aktivity se naplní
  a čísla vyjedou do svých okének jako na počítadle. Nejvyšší řád jde k cíli bez přetočení, takže
  číslo nikdy neukáže víc, než je; řády se usazují zprava doleva a čtečka dostane celé číslo.
  Jednou po otevření obrazovky, ne při živých aktualizacích; s omezeným pohybem v systému vůbec.
- **Prohlídka na webu je živá aplikace.** Místo statických snímků je v rámu skutečné rozhraní
  nad smyšlenými daty (`/app?ukazka`). Nástup se přehraje, až k rámu návštěvník dojede, a při
  přepnutí obrazovky. Ukázka nic neukládá a na nic se neptá; data (`/ukazka/data.json`) vznikají
  při sestavení webu ze stejné scény jako snímky a cesty stroje se v nich nahrazují – kdyby
  nějaká unikla, sestavení spadne. Snímky zůstávají jako záloha bez JavaScriptu a při načítání.
- Ukázková scéna má útratu (zapsaná předplatná, kredity a rozpočet 6 000 Kč, v prohlídce 70 %
  místo dřívějších 0 Kč) a tři projekty s aktivitou za poslední dny. Snímky na webu jsou z ní
  přegenerované a popisky obrázků odpovídají tomu, co na nich je.

## 0.24.0 – 2026-09-22 · audit pravdivosti dat

Audit porovnal, co aplikace ukazuje, se surovými soubory Claude Code, Codexu, Claude Desktopu
a Cursoru na skutečném Macu – pravdu přitom počítal vlastním kódem, ne parserem aplikace.
Našel čtyři údaje, které se se zdrojem neshodovaly, a tři skryté slabiny.

- **Tokeny Claude Code byly nadsazené o 59 %.** Odbočka relace si do nového souboru kopíruje
  celou historii rodiče a aplikace ji počítala znovu: za 30 dní 7,6 mil. místo skutečných 4,8 mil.,
  některé dny dvojnásobek. Tokeny teď patří jen řádkům relace svého souboru (u pomocného agenta
  relace rodiče), nezávisle na pořadí načítání.
- **Kredity Codexu ukazovaly zůstatek, který už neexistoval.** Od 15. 8. Codex hlásil nulu
  (`has_credits: false`) a aplikace těch 5 008 odečtů zahodila – svítilo 5,31. Teď nula, s datem
  posledního odečtu, a živě i po startu.
- **Vyčerpaný limit jednoho modelu shodila odpověď jiného.** Opus 5 zablokovaný do 23:20 svítil
  84 s po vyčerpání jako volný, protože v téže relaci odpověděl Opus 5.5. Limit teď ví, který
  model narazil, a skončí jen obnovou nebo odpovědí téhož modelu.
- **Doplnění kreditů se počítalo napříč konverzacemi.** Starší konverzace umí nahlásit zastaralý
  zůstatek; porovnáno s jinou to vypadalo jako nákup. Místo 7 je 6 doplnění a jmenují se
  „doplněno“ – nákup a vrácení kreditů vypadají v datech stejně.
- **Velké ukazatele limitů neříkaly, jak starý je odečet.** Týdenní limit Codexu z odečtu starého
  20 h vypadal jako živý. Všude je teď „změřeno před …“, po šesti hodinách zvýrazněné; okno bez času
  obnovy po své délce vyprší. Zůstatek kreditů nese datum na Přehledu, ve Statistikách i na Útratě.
- Skryté slabiny: historie Claude Desktopu nemíchá účty, agent Cursoru bez času změny se nevyřadí,
  do surových odečtů kreditů se neukládají opakované hodnoty (strop by jinak vytlačil první nákupy).
- `npm run audit:data` – audit jako nástroj: porovná aplikaci se zdroji na tomto Macu kdykoli znovu.
- Česká sazba: číslo s jednotkou a předložka „v“ s časem se nerozdělují na dva řádky.


## 0.23.1 – 2026-09-22 · grafy v čase říkají pravdu o tom, co je pod kurzorem

- **Kurzor v grafu už neuskakuje o dny.** Historie kreditů i limitů se ukládá komprimovaně,
  jen okamžiky změny. Hledal se „nejbližší bod“, takže při týdenní mezeře bublina ukázala
  datum týden jinam, než kam člověk mířil. Teď se čte poslední odečet před kurzorem – jediná
  hodnota, o které v tom čase něco víme – a svislice i tečka sledují kurzor přesně.
- **Bublina rozlišuje měření od držené hodnoty.** Když jsme na odečtu, stojí tam „Hodnota“.
  Když hodnota jen drží z dřívějška, stojí tam „Poslední známá“ a pod ní „naměřeno“ s datem.
  Tvrdit „v tomhle čase to bylo X“ by bylo tvrzení, které nemáme z čeho doložit.
- **Zůstatek kreditů má datum.** Dřív svítilo jen číslo, i když pocházelo z odečtu starého
  měsíc. Vedle něj je teď „zjištěno před …“, a co je starší než dva dny, se zvýrazní mosazí.


## 0.23.0 – 2026-09-22 · QR kód pro telefon a skutečné stažení

- **Telefon se páruje QR kódem.** V Nastavení → Otevřít na telefonu je vedle jednorázového kódu
  i QR. Namíříš na něj foťák a telefon se otevře už spárovaný — žádné opisování adresy ani čísla.
  Kód se z adresy hned maže, takže nezůstane v historii prohlížeče. Šestimístné číslo zůstává
  pod QR jako záložní cesta.
- **Generátor QR je vlastní** (`public/js/qr.js`, režim bajtů, korekce M, verze 1–10), protože
  aplikace nemá běhové závislosti. Výstup byl ověřen dekodérem Applu (Vision) na verzích 1 až 10
  včetně české diakritiky; test drží otisk ověřené podoby.
- **Web má konečně tlačítko Stáhnout.** Míří na přílohu se stálým jménem v posledním vydání,
  takže povýšení verze ho nerozbije. Součástí je i poctivý postup pro první spuštění:
  beta není podepsaná u Applu, takže ji macOS napoprvé pustí až přes Nastavení systému.
- **Snímky na webu jsou skutečná aplikace**, ne atrapa z divů. Generuje je `npm run shots:site`
  z téže ukázkové scény jako prohlídka, zvlášť pro světlý a tmavý režim a zvlášť pro telefon.
- Prohlídka i snímky běží pod neutrální identitou, ne pod jménem majitele Macu.


### Vizuální revize · 2026-09-18

- Web: neutrální grafitový/světlý podklad s jemným statickým mesh světlem místo plošné fialové. Bez canvasu, blur filtru a animovaného překreslování pozadí.
- Web, aplikace a popup: okamžitá odezva stisku (90 ms), krátké hover přechody (180 ms), pohyb šipek a otevření detailu. Reduced motion vypíná pohyb; akce nečekají na konec animace.

### Revize 0.12.0 · 2026-09-17

- Odebrání zařízení ukončí i otevřený živý proud. Každá událost znovu kontroluje autorizaci; vypnutí Tailscale blokuje i zbývající lokální proxy.
- Obnova vzdálených listenerů ověřuje MagicDNS a vlastnictví Tailscale IP po startu i změně sítě. Zastavení čeká na rozpracovanou obnovu.
- Windows otevírá webové konverzace bez macOS funkcí. Hooky používají explicitní PowerShell místo předpokladu cmd.exe; Windows CI testuje UTF-8 i nedostupný server. Intel build má podporovaný runner.
- Kratší web s interaktivní prohlídkou, pravdivými instalačními pokyny, responzivitou, reduced-motion variantou, canonical, sitemap a llms.txt.
- Přehled nenatahuje prázdné karty; scéna nemá nekonečný dekorativní přejezd. Rozšíření má čitelnější texty, větší ovládací cíle a přístupné chyby párování.
- Browser QA v CI kontroluje aplikaci, web a popup v Chromiu/WebKitu a textový kontrast. Chrome API v popup testech jsou simulované; nejde o potvrzení selektorů živých služeb.


## 0.22.0 – 2026-09-21 · využití plochy a ikona průvodce

- **Prázdno pod kratším sloupcem Přehledu:** rozbalený seznam limitů protáhl pravý sloupec o 253 px a pod levým zůstala díra. `doplnAktivitu()` dopočítá počet řádků Poslední aktivity z naměřeného rozdílu výšek (mez 6–24, nikdy víc, než je konverzací) a `watchBalance()` ho spouští i při změně výšky, ne jen při nových datech. Naměřeno: mezera 253 → 11 px, řádků 6 → 10; po sbalení zpět na 7.
- **Ikona průvodce:** vlastní kreslená žárovka (`BULB` v `public/js/icons.js`), vložená inline a obarvená `currentColor` – jeden soubor pro oba režimy, žádná externí licence. Nahrazuje barevný přechod s kolečky. Ověřeno: světlý #16141D, tmavý #F5F2F8.

## 0.21.1 – 2026-09-21 · tvar průvodce

- `.welcome-dialog` neměl výšku, takže ho `max-height: 100dvh` natáhl přes celou obrazovku (na okně 2560 × 1900 sloupec ~920 × 1860). Nově `height: min(600px, 100dvh - 40px)`, `.welcome-art` bez `min-height: 500px` a `.welcome-content` s vlastním rolováním. Nízké okno (≤ 700 px) kartu stáhne na výšku obrazovky.
- Naměřeno: 2560 × 1900 → 920 × 600 (poměr 1,53), 1440 × 900 → 920 × 600, 1440 × 700 → 920 × 660, 1130 × 1900 → 920 × 600, 375 × 812 → jeden sloupec. Všude se vejde bez přetečení.

## 0.21.0 – 2026-09-21 · průvodce

- **Banner místo nenápadného tlačítka** (`.guide-banner`): barevný pruh, název, popis a plné tlačítko. Dřív obrysové tlačítko na prázdném řádku, které splývalo s pozadím.
- **Průvodce doplněn o dnešní funkce:** nová obrazovka „Limity a peníze“ (okna limitů, předplatná v korunách kurzem ČNB, kalendářní „Dnes“) s vlastní ukázkou; projekty zmiňují logo klienta a vlastní pořadí karet; soukromí klíč okna a telefon jen pro čtení. Z pěti kroků šest.
- Test hlídá, že počet kroků odpovídá slibu v banneru a že průvodce zmiňuje limity, kurz ČNB, loga projektů i zabezpečení okna.

## 0.20.1 – 2026-09-21 · posouvání uvnitř překryvů

- **Řetězení posouvání ve vyhledávání:** `.palette-list` neměl `overscroll-behavior`, takže po dojetí na konec pokračovalo kolečko na stránce vzadu. Doplněno u všech rolovatelných oblastí v překryvech (`.palette-list`, `.pop-list`, `.modal`, `.sheet`, `.fb-list`, `.pick-list`).
- **Vyhledávání nezamykalo stránku:** na rozdíl od dialogů a spodní nabídky nepřidávalo `has-modal`. Kolečko mířené mimo seznam (na ztmavené pozadí) proto posunulo stránku – naměřeno 1200 → 3483 px. Obě opravy jsou potřeba: `overscroll-behavior` řeší konec seznamu, zámek stránky plochu okolo. Ověřeno v Chromiu i WebKitu.

## 0.20.0 – 2026-09-21 · kalendářní den, stabilní karty, čisté pilulky

- **Kalendářní „Dnes“:** `periodBuckets('today')` počítá od půlnoci po hodinách. Období „24 hodin“ zůstává (rolling), ale je pojmenované podle toho, co měří – ráno do něj patří i noční práce z předchozího dne. Naměřeno na skutečných datech: Dnes 203 tis. × 24 hodin 1,32 M. Přibylo „14 dní“ (`fortnight`). Postranní panel i Přehled už kalendářní den používaly.
- **Problikávání obrázků na kartách projektů:** `fill()` přepisoval celou mřížku, takže každé překreslení vyrobilo nový `<img>`. Nová `sesadKarty()` porovnává karty po jedné – nezměněná se ponechá, u změněné se převezme původní obrázek. Ověřeno: po přetažení i po šesti živých aktualizacích **0 znovu vytvořených obrázků**.
- **Dvojitý obrys u vybrané pilulky** (`border` + inset `box-shadow`) vypadal na tmavém podkladu jako stín. Zůstal jeden obrys, jiné pozadí a tučnější text.
- **`.lchip` bylo v CSS dvakrát** pro dvě různé komponenty (chip limitu × výběr agenta). Chip limitu přejmenován na `.lim-chip`.
- Stav připojení: „Živě“ → „Připojeno“.

## 0.19.1 – 2026-09-21 · jednotná nabídka

- **Nabídka na výšku měla druhý vzhled** (vlastní dlaždice, jiný hover s posunem, tečka místo mosazného pruhu, jiné barvy). Pravidlo pro portrét zredukováno na dva řádky – rozestup a výška cíle; všechno ostatní se dědí. Naměřeno: aktivní položka, běžná položka, hover i odsazení jsou v obou režimech shodné.
- **Nabídka přetékala panel:** `.nav` je mřížka bez `grid-template-columns`, takže si brala šířku podle nejdelší položky („Upozornění“ + odznak „10+“). Odsazení bylo 16 px × 11 px. Doplněno `minmax(0, 1fr)` a zkracování názvu tečkami; odsazení je teď symetrické na každé šířce.
- Testy: statická kontrola, že portrétní pravidlo nepředefinuje vzhled, a živé porovnání obou režimů v `qa-desktop` (Chromium i WebKit).

## 0.19.0 – 2026-09-21 · čerstvost dat a cache

- **Zastaralá data v klientovi:** Dovednosti (`views/skills.js`), historie plánu (`views/stats.js`) a extra usage (`views/spend.js`) se načítaly jen při prvním otevření za běh aplikace. Nově se čtou při každém otevření stránky; dosavadní obsah zůstane do příchodu nového (žádné bliknutí).
- **ETag pro statické soubory** (`znacka()` v `src/http.js`): SHA‑1 z obsahu, ne z času změny – kopie souboru při aktualizaci aplikace tak nezpůsobí falešnou změnu. Opakovaný dotaz dostane 304 s nulou bajtů (ověřeno: 33 819 B → 0 B); po změně obsahu se značka změní a soubor se stáhne hned.
- **Service worker v6:** kód a styly se tahaly s `cache: 'no-store'`, což zakazuje i ověření u serveru – aplikace se stahovala celá při každém otevření. Nově `no-cache`: vždy ověřeno, ale nezměněné soubory jen potvrzené.
- Ověřeno: API a stream nikdy z cache, živá změna je v okně do 25 ms, `/api/skills` se volá i při návratu na stránku.

## 0.18.4 – 2026-09-21 · odkaz do prohlížeče

- **Regrese z 0.18.0:** klíč okna zavřel i přístup z prohlížeče na Macu, takže `127.0.0.1:4620` ukazovalo jen informační stránku. `POST /api/local/browser-link` (jen z tohoto Macu) vrátí cestu s klíčem, adresu složí okno podle své vlastní (funguje i za `tailscale serve` a na jiném portu). Tlačítko v Nastavení → Profil a vzhled.

## 0.18.3 – 2026-09-21 · tiché chyby a nejednotné pojmy

- **Podklady projektu:** „Neuloženo…“ (čeká na doťukání) a „Neuloženo“ (zápis selhal) se lišily třemi tečkami. Selhání má vlastní znění, červenou barvu, `role="alert"` a toast říká, čeho se týká (`stavUlozeni()` v `views/project.js`).
- **Tóny toastů:** `velvet`, `coral` i `err` znamenaly totéž. Zůstal `err` (40 volání sjednoceno); neznámý tón spadne na `info`, ne na „úspěch“.
- **Dokumentace:** README hlásilo 297 testů (bylo 398) a nabízelo ke stažení 0.12.0. Nový `test/dokumentace.test.mjs` hlídá verzi v README, existenci záznamu v CHANGELOGu i „Co je nového“, shodu verze rozšíření a počet testů s tolerancí 10 %.
- Prověřeno: všechny `catch` v klientovi hlásí chybu uživateli (žádná tichá ztráta), server odmítá nesmyslné vstupy, duplicitní čtyřřádkové bloky jen dva (oba prověřené).

## 0.18.2 – 2026-09-21 · konzistence zobrazení, úklid

- **Nalezeno proklikáním aplikace:** obnovené okno limitu hlásilo tři různé věci (Přehled „0 %“, Statistiky „Obnoven“, rozbalený seznam „obnoveno“), zatímco API drželo poslední naměřených 34 %. Popis stavu teď vzniká na jednom místě (`limitState()` v `public/js/ui.js`) a všechna tři zobrazení ho jen vypisují. „0 %“ je tvrzení o měření, které po obnově neproběhlo, proto „Obnoveno“.
- **Časová osa:** `slice(0, 7)` zahazoval zbylé agenty beze stopy. Pod osou je teď odkaz „Dalších N je v sekci Agenti“.
- **Úklid:** 17 mrtvých pravidel CSS (`.conn-*` po staré připojovací obrazovce, `.ext-feat*`, `.site-grid`, `.table-scroll`). Backlog v `docs/ROADMAP.md` prověřen proti kódu – ruční kurzy měn odstraněny (vyřešeno v 0.14.0).
- Ověřeno: 110 kliknutí robotem přes všech osm stránek bez jediné výjimky, validace odmítá nesmyslné vstupy (7 z 7), data přežijí restart serveru, souběžná úprava nezaloží duplikát.

## 0.18.1 – 2026-09-21 · bezpečnostní nález č. 9

- `src/git.js`: každý `git` běží s `-c core.fsmonitor=false -c core.hooksPath=/dev/null -c core.pager=cat -c protocol.ext.allow=never -c diff.external=` a `GIT_TERMINAL_PROMPT=0`. Volby z příkazové řádky přebíjejí `.git/config` cizího repozitáře. Test naopak vytvoří repozitář s `core.fsmonitor` a ověří, že skript neběží (ověřeno, že bez ochrany test padá).

## 0.18.0 – 2026-09-21 · bezpečnostní nálezy č. 1, 4, 5

- **#1 (vysoká) – rozsah telefonu:** `src/remote-scope.js`. Zařízení mimo tento Mac smí číst (`GET`) a jen dvě změny: spárovat se a označit upozornění za přečtená; `/api/fs/*` (procházení disku) je zakázané. Spouštění agentů, nastavení, klíče, hooky, projekty, výdaje, vlastní agenti, média i licence vrací 403 „jen na Macu“. Testy: `remote-scope.test.mjs` a průchod přes skutečnou LAN v `lan.test.mjs`.
- **#4, #5 (střední) – klíč okna aplikace:** `AGENTEEQ_LOCAL_KEY` (Swift ho vygeneruje pro každé spuštění, 64 znaků). Se zapnutým klíčem vydá server požadavek z tohoto Macu jen s cookie `agenteeq_local` (nastaví ji jednorázová adresa `/?k=…` a přesměruje na čistou), nebo s hlavičkou `X-Agenteeq-Key`. Bez klíče projde jen `/api/health` a cesty s vlastním tajemstvím (hooky, rozšíření). Spuštění z terminálu klíč nepoužívá. Převzetí osiřelého serveru (`desktop/lifecycle.mjs`) bere údaje z `/api/health`, protože `/api/state` je chráněný.

## 0.17.3 – 2026-09-21 · kontrola všemi QA skripty

- Poprvé lokálně spuštěné `qa:contrast`, `qa-desktop`, `qa-site`, `qa-extension` (Playwright v dočasné složce mimo repozitář, Chromium i WebKit). Kontrast: všechny texty splňují AA včetně tmavého režimu. **Nalezeno a opraveno:** okno rozšíření se zastaralou verzí mělo 621 px (limit Chromu 600) → `.sites { max-height: 232px }`.
- Dovednosti: 36 karet na stránku + „Zobrazit dalších“ (147 karet: 37 202 → 9 746 px na telefonu). Filtry stránkování vrací.

## 0.17.2 – 2026-09-20 · menu jako dlaždice na výšku

- `@media (orientation: portrait) and (min-width: 881px) and (min-height: 1100px)`: `.nav` je mřížka osmi velkých dlaždic, výška `clamp(64px, 5.1dvh, 140px)`, mezera `.95dvh`, první dlaždice `5.3dvh` pod profilem, patička dole (`margin-top: auto`). Rozvržení vychází z Figma návrhu pro okno 1440 × 2560; následná vizuální revize vrátila boční odsazení a zrušila trvalou výplň dlaždic.
- Oprava podle skutečného vertikálního monitoru: dlaždice mají klidový průhledný povrch, po najetí nebo fokusu se jemně rozsvítí, aktivní stránku značí text a mosazný bod. Nabídka má opět boční odsazení v panelu. Popup zastaralého rozšíření se vejde do limitu 600 px. Windows testy používají systémově správnou cestu a POSIX práva kontrolují jen tam, kde je systém poskytuje.

## 0.17.1 – 2026-09-20 · tmavý režim: tlačítka

- Nové tokeny `--action` / `--on-action` / `--action-hover`: ve světlém režimu tmavá plocha s bílým textem, v tmavém světlá `#F5F2F8` s textem `#16141D` (naměřeno 16,4 : 1 proti textu, 17,9 : 1 proti stránce). Použito pro `.btn--primary`, vybrané `.seg` tlačítka, zapnutý `.switch`, zatržítko, `.link:hover`, ukazatel měřiče, aktivní záložku Nastavení, `.nav-launch`, vybraný den kalendáře. Dřív `--ink-surface`, tedy tmavá na tmavé.

## 0.17.0 – 2026-09-20 · vlastní pořadí karet

- **Rozložení karet:** `settings.layout` (`agentSide`, `projectSide`; jen známé klíče a ID `[\w-]{1,40}`, nejvýš 20; `null` vrátí výchozí). `public/js/layout-prefs.js` (`applyOrder`, `saveOrder`, `resetLayout`, úchyt `GRIP`), `enableReorder` má volbu `handle`. Pravý panel detailu agenta a projektu, tah za úchyt, Alt + šipky; při tahu se panel nepřekresluje. Tlačítko „Obnovit výchozí“ v Nastavení. Testy v `project-order.test.mjs`.
- Oprava: `.side-head .link { padding: 0 }` přebíjel odsazení tlačítka „Změnit“.

## 0.16.0 – 2026-09-20 · řazení projektů, paleta, kontrast odznaků

- **Ruční pořadí projektů:** `public/js/reorder.js` (tah myší za kartu, dotykem za úchyt `[data-grip]`, Alt + šipky, Esc vrací; FLIP animace, doletění na místo, klik po tahu se zahodí, okrajové rolování). Cíl se hledá podle rozvržení (`offsetLeft/Top`), ne podle rozpracované animace – jinak tah kmital. `PUT /api/projects/order` (`reorderProjects`: mění jen vybrané, ostatní nechá na místě). Pořadí karet je teď pořadí uživatele, ne poslední aktivita.
- **Paleta projektů:** 16 barev, kalná #C99A3E → #F2B824 (migrace ve `normalizeProjects` i při úpravě).
- **Logo:** `object-fit: cover` bez vycpávky, výřez loga se výchozím „Vyplnit“.
- **Kontrast:** `--teal-solid` (#0D7A67, bílý text 5,3 : 1) pro `.nav-badge` a vybranou volbu vzhledu; dřív černé písmo na světle zelené.

## 0.15.2 – 2026-09-20 · vyvážené sloupce

- `public/js/balance.js`: sekce `data-float` v kontejneru se dvěma `.bal-col` se rozdělí mezi sloupce tak, aby byl rozdíl výšek nejmenší (všechna rozdělení, práh 40 px proti poskakování, `ResizeObserver`). Jeden sloupec: původní pořadí. Použito na Přehledu (Útrata, Poslední aktivita) a ve Statistikách (čtyři žebříčky místo dvou natažených řad, které nechávaly prázdná místa uvnitř karet). Testy v `overview-layout.test.mjs`.
- Útrata: mezera pod souhrnem.

## 0.15.1 – 2026-09-20 · Dovednosti, přepínače, horní pás

- **Regrese z 0.15.0:** `.link` v horním pásu Přehledu (tmavá plocha) dostal bílé pozadí a světlý text i dvojitou šipku; `.pulse-bar .pb-all` má vlastní variantu a `.link:has(.icon)::after` se skrývá. Test `ui-polish`.
- **Dovednosti:** hledání + řazení v jednom řádku, filtry Zdroj a Původ jako popsané řádky v jednom bloku, poznámka pod nimi. Vybraný přepínač `.seg--light` je tmavý a `font-weight: 500`; neaktivní text `--ink-2` místo `--mute`. Launcher si drží původní světlý vybraný stav.
- Karty rozpočtu `auto-fit`: jediná karta vyplní šířku. Horní pás Přehledu: tři vrstvené radiální přechody (teal, mosaz, fialová), popisky 0,78 alfa (kontrast ≥ 5 : 1 v nejsvětlejším místě, spočteno, `qa:contrast` běží jen v CI).

## 0.15.0 – 2026-09-20 · čitelné ovládání, výřez obrázků, kalendář

- **Klikatelný text:** `.link` je obrysové tlačítko (tmavé písmo, šipka u odkazů, vyplnění při najetí); souhrn „Všechny nástroje a služby“ je tlačítko s obrysem. Dřív šedý text, který se nedal poznat od popisku.
- **Výřez obrázku** (`public/js/cropper.js`): okno v poměru výsledku (karta 7 : 2 → 1400 × 400 px, logo 512 × 512), posun tahem, přiblížení posuvníkem/kolečkem, „Celé logo“ / „Vyplnit“, varování při zvětšení zdroje nad 1,4×. Půlené zmenšování a WebP 0,92 (JPEG jako záloha). Doporučené rozměry v popisu. Náhled přes `data:` (CSP nepovoluje `blob:`). Karta má `aspect-ratio: 7 / 2`, takže ji už neořezává `object-fit`.
- **Kalendář** (`public/js/datepicker.js`): nahrazuje systémový `<input type="date">`, hodnota zůstává RRRR-MM-DD, ovládání klávesnicí (šipky, PageUp/Down, Home/End, Enter, Esc zavře jen kalendář). Vzhled spouštěče a nabídky sdílí s výběrem z nabídky (`selects.js`, `.picker-*`).
- **Poslední zadání:** bere celý text z přepisu (souhrn drží 280 znaků) a sbalí ho na 5 řádků s tlačítkem Zobrazit celé/Sbalit.
- „⌀ za den“ u tokenů uvádí období (předchozích 7 dní). Podíly ve složení tokenů: „<1 %“ a „>99 %“ místo zaokrouhlení na 0 a 100.

## 0.14.0 – 2026-09-20 · předplatné a kurz v Útratě, čitelné složení tokenů

- **Předplatné v Útratě:** `src/subscriptions.js` zjišťuje plán Claude z `~/.claude.json` (jen typ účtu a úroveň limitů, nic osobního) a plán ChatGPT z `plan_type` v limitech Codexu. Ceníková částka bez DPH jde do měsíčního součtu, předpovědi i grafu; ručně zapsané předplatné téže služby ji nahradí (žádné dvojí počítání). Nejednoznačná cena (ChatGPT Pro 100/200 $) se nepočítá, dokud ji uživatel nevybere. Zdroje cen a jejich stav jsou v docs/CONNECTORS.md.
- **Kurz z ČNB:** `src/rates.js` – denní lístek, odmítá nesmyslná data, nejvýš každých 6 h, poslední kurz se ukládá, ručně zadaný se nepřepisuje (`ratesSource`). Vypíná `AGENTEEQ_CLOUD=0`. Jediný odchozí dotaz bez údajů o uživateli.
- **Složení tokenů:** `tokenBreakdown()` – spotřeba (vstup + výstup) a cache mají každá vlastní měřítko a podíly; sdílený pruh utopil vstup i výstup pod čtením z cache.
- **Levý panel:** nabídka se centruje místo natažení přes celou výšku; odznaky ukazují nejvýš „10+“.
- **Chyba:** obrys zaostření uvnitř vodorovně rolovatelných řádků (výběr agenta, přepínače) byl oříznut a vypadal jako tmavý stín pod tlačítkem; uvnitř takových řádků leží obrys uvnitř tlačítka.

## 0.13.0 – 2026-09-20 · přehled limitů všech nástrojů, obrázky projektů, klidnější toasty

- **Toasty:** vždy nejvýš jeden (`toast()` nahrazuje předchozí, stejné hlášení jen zopakuje pohyb). Druh se odvozuje z `tone`: zelený s fajfkou (povedlo se), červený s vykřičníkem a `role="alert"` (chyba), tmavý s „i“ (poznámka), upozornění agenta se zvonkem.
- **Limity všech nástrojů:** `public/js/limits-ui.js` – rozbalovací „Všechny nástroje a služby“ na Přehledu a ve Statistikách. Změřená okna jako čipy se stářím měření; nástroje bez měření mají poznámku, proč (nenainstalováno / limit se z místních dat nedá zjistit / web nesdílí). Obnovené okno se píše „obnoveno“, ne „0 %“.
- **Projekty:** nahrání obrázku karty a loga klienta ve formuláři (`prepareImage` zmenší přes canvas na 1280/512 px, server dál ověřuje obsah podle magic bytes). Výchozí přechod `.cover--<preset>` pro všech osm předvoleb; barva projektu zůstává jako jemný pruh a kroužek loga. Selhání obrázku po uložení projektu neshodí formulář (zabrání duplicitě).
- **Mapa „Kdy agenti pracují“:** `heatDetails()` – tooltip s dnem, hodinou, tokeny, počtem aktivních dnů z možných a nejsilnějším nástrojem; plynulý zoom buňky, zvýraznění řádku a hodiny; popis mapy pro čtečky (nejsilnější hodina).
- Z levého panelu odstraněno „Živá data“ (zůstává jen hlášení ztráty spojení). Test `ui-polish`.

## 0.12.1 – 2026-09-20 · poctivější stavy, přehlednější Nastavení, opravy z bezpečnostního auditu

- **Konektory netvrdí instalaci bez opory.** Gemini CLI, Qwen Code, Copilot CLI, VS Code Copilot a Cursor usuzovaly „je nainstalovaný“ z existence složky s daty (~/.gemini drží i nastavení MCP). Stav se teď rozhoduje ze tří údajů: nástroj nalezen / hledáno a nenalezeno / nevím (`src/connectors/install-state.js`, test `install-honesty`).
- **Sidebar:** pod „tokenů dnes“ jsou dva nástroje s největším podílem a popisek vysvětluje metriku (vstup + výstup bez cache). Číslo samo ověřeno třemi nezávislými metodami proti surovým přepisům.
- **Nastavení:** zdroje agentů jeden seznam (2 066 → 480 px), webové služby čipy, sbalené „Nenalezeno“ a „Doplňková data“, Vlastní agenti sbalení, pamatování otevřeno/zavřeno, prázdná karta se nezobrazí, „Instalace pro další lidi“ jen tam, kde existuje balíček z buildu. Stránka 8 686 → 6 713 px.
- **Bezpečnost (nezávislý audit, 18 nálezů):** ID konverzace nesmí začínat pomlčkou (argument injection do `claude --resume`), „Otevřít složku“ odmítne balíčky a odkazy na ně, zálohy nastavení Claude Code 0600, párovací kód rozšíření jen z Macu. Zbývající nálezy (oprávnění spárovaného telefonu, lokální tajemství pro loopback, CI) jsou v docs/SECURITY.md.
- Diagnostický nástroj `scripts/tools/ax-probe.swift` pro zjištění, co aplikace vystavují přes Přístupnost macOS (podklad pro detekci desktopových aplikací bez záznamu na disku).

## 0.12.0 – 2026-09-15 · Tailscale jako plnohodnotná cesta z telefonu, web a rozšíření na úrovni aplikace

- **Tailscale je napojený, ne jen detekovaný.** Nové nastavení `settings.tailscaleAccess` a endpoint
  `POST /api/tailscale/enable|disable` (jen z `127.0.0.1`). Se zapnutým přepínačem přidá `src/lan.js`
  listener na adrese Macu v tailnetu (`tailscaleAddresses()`, výhradně IPv4 z `100.64.0.0/10`).
  Domácí síť a Tailscale jsou dvě nezávislé cesty: vypnutí jedné nezavře listener druhé a spárovaná
  zařízení se mažou, teprve když se zavírá poslední z nich.
- **Bezpečnost beze změny.** Párování šestimístným PINem, token v `HttpOnly` cookie a hash v datech
  platí i pro tailnet. Kontrola hlavičky `Host` a `Origin` jde nově přes `lan.hosts()`, což kromě
  adresy pustí i jméno v MagicDNS (`mac.tailnet.ts.net`, porovnání malými písmeny).
- **Poctivý stav místo domněnek.** `src/tunnel.js` čte z `tailscale status --json` jméno, adresy
  i tailnet a z `tailscale serve status --json` stav HTTPS. Čemu nerozumí nebo na co se neptal,
  hlásí jako neznámé, nikdy jako vypnuté. Detekce `serve` je vedená jako **Beta**
  (ověřeno proti dokumentaci, ne proti živému tailnetu) – viz `docs/REMOTE.md`.
- **Neúspěšné zapnutí se vrátí zpět.** Když listener nejde otevřít, přepínač se přepne zpátky na
  vypnuto a řekne proč (502). Rozhraní neohlásí zapnutý přístup, který neposlouchá.
- **Rozšíření pro Chrome** používá tatáž písma (Urbanist, Onest, Geist Mono) a tytéž barevné tokeny
  jako aplikace, včetně nočního režimu. Shodu písem i tokenů hlídá `test/extension-assets.test.mjs`.
  Nový `npm run build:extension` složí `dist/agenteeq-extension-<verze>.zip` bez závislostí
  a deterministicky (dvě sestavení téhož kódu dají tentýž soubor).
- **Web.** `site/` je landing page, `npm run build:site` z ní a z `public/` složí `dist/web`:
  stránka v kořeni, rozhraní aplikace na `/app` (manifest PWA a `sw.js` se přepíšou na novou adresu).
  Kontrast textů ověřen na WCAG 2.2 AA v obou režimech na 1440 px i 375 px.
- **Vydání.** `npm run release:mac` nejdřív ověří, že jsou po ruce nástroje Xcode (jinak by chybějící `swiftc` vysvitl až po testech a smoke), pak projde testy, smoke, rozšíření, web a build aplikace. S přepínačem
  `--install` vymění i aplikaci v `/Applications` – předchozí verzi přitom nemaže, odloží ji
  do `~/.agenteeq/zalohy`.
- **Z bezpečnostní revize (nález s vysokým dopadem):** o tom, jestli je požadavek „z tohoto Macu“,
  nerozhoduje jen adresa protistrany, ale i hlavička `Host` a stopy po reverzní proxy. `tailscale
  serve`, který karta sama doporučuje kvůli HTTPS, se totiž na server obrací z `127.0.0.1` –
  a výjimka pro desktopovou aplikaci by tak kterémukoli uzlu v tailnetu dala data bez tokenu,
  cizí párovací PIN i `POST /api/launch`. Nově takový požadavek potřebuje spárované zařízení
  jako každé jiné vzdálené. Přibyl regresní test a do `allowedOrigins()` vlastní adresa
  `https://…`, aby se z telefonu po HTTPS dalo spárovat.
- **Listener se po pozdější chybě uklidí.** Obsluha selhání startu zůstávala navěšená i po
  úspěšném otevření: chyba na už naslouchajícím socketu by ho vyřadila z evidence, ale nezavřela,
  takže `stop()` by ho neměl jak zavřít a další zapnutí by narazilo na obsazený port. Teď se
  obsluha po úspěšném startu odvěsí a listener se v takovém případě zavře sám.
- **Cookie s tokenem dostane `Secure` za HTTPS proxy.** Příznak se odvozoval z `url.protocol`,
  jenže `url` se staví nad pevným `http://127.0.0.1`, takže se nenastavil nikdy. Dokud HTTPS nebyla
  podporovaná cesta, nevadilo to; s `tailscale serve` ano. Nově se pozná podle
  `X-Forwarded-Proto` od proxy na tomhle Macu.
- **Přepínač Tailscale se odemkne, až když Tailscale opravdu běží.** Adresa z rozsahu
  `100.64.0.0/10` sama nestačí – je to rozsah pro CGNAT a od některých operátorů ji Mac dostane
  i bez Tailscale; naslouchání by se otevřelo do sítě operátora.
- **Z bezpečnostní revize vlastního kódu:** jméno z MagicDNS se před vpuštěním do seznamu
  povolených hodnot hlavičky `Host` ověří na tvar běžného DNS jména (`magicDnsName()`) – je to
  jediná hodnota v téhle ochraně, která přichází z výstupu cizího programu. A stav
  `tailscale serve` porovnává port jako port, ne jako podřetězec: `includes(':4620')` sedělo
  i na proxy mířící na `:46200` a rozhraní by ohlásilo HTTPS, které nikam nevede.
- **Kontrast měřený, ne odhadovaný.** Nový `npm run qa:contrast` projde každý viditelný text
  v aplikaci (8 obrazovek × světlý/tmavý × 1440/375 px), na landing page i v okně rozšíření
  a spočítá jeho kontrast proti pozadí, které pod ním doopravdy leží, včetně poloprůhledných vrstev.
  Našel tím skutečnou chybu: odznak „Ověřeno“ a stav „Připojeno“ měly na světlé ploše 4,45:1, tedy
  těsně pod AA pro text 11 px. Token `--ok` je proto tmavší (`#0B6F5F`) a podklad odznaku světlejší;
  po opravě prochází AA všechno.
- **`npm run smoke` už neselhává na úklidu.** Mazání dočasné složky nečekalo, až server skončí,
  a padalo na `ENOTEMPTY` – kontrola přitom prošla. Teď se počká na konec procesu (po dvou
  vteřinách `SIGKILL`) a teprve pak se maže. Bez toho by se na téhle chybě zastavil `release:mac`.
- **Testy běží i mimo macOS.** Testy závislé na `lsof` a na cestě `/private/tmp` se místo padání
  přeskočí s důvodem; `npm test` je tak zelený na Linuxu i na Macu (297 testů, 3 přeskočené).

## 0.11.1 – 2026-09-14 · připraveno na dlouhý provoz a čistou instalaci

Z testu čisté instalace, testu odolnosti a zátěžového testu:

- **Poškozený data.json** aplikaci neshodí: poškozený soubor zůstane bajt po bajtu jako
  `data.json.poskozeno-<čas>`, data se obnoví z `data.json.bak` (vzniká před každým zápisem),
  bez zálohy od výchozích hodnot – vždy s kritickým upozorněním. Chyba oprávnění start dál zastaví.
- **Selhání zápisu** se nehlásí jako úspěch: `PUT /api/settings` vrátí 500, selhání na pozadí ukáže
  pruh „Změny se nedaří uložit na disk“ (zmizí sám). Test hlídá řetězec emit → SSE → EVENTS → applyEvent.
- **Desktop:** počítadlo automatických restartů serveru se po minutě stabilního běhu vynuluje.
- **Konektory:** symbolické odkazy na projekty se procházejí, smazaný přepis zmizí hned, budoucí
  časová razítka se ořízou na teď.
- **Čistá instalace:** `/api/usage/claude` bez dat vrací `{ available: false }` místo 404; Přehled
  nenabízí propojení s Claude Code bez Claude Code; odkaz „Nastavit rozšíření“ má 32 px.
- **Vydání:** `build:mac` umí notarizaci (`AGENTEEQ_NOTARY_PROFILE`), INSTALL.md odpovídá aplikaci.

## 0.11.0 – 2026-09-13 · rozšíření pro Chrome vysvětlené všude, Co je nového, spolehlivé načítání

- **Průvodce** má nový krok „Agenti i v prohlížeči“ s tlačítkem na instalaci. **První kroky** na Přehledu
  i **karta v Nastavení** vysvětlují, co rozšíření dělá (agenti z webu v přehledu, zadání vložené samo).
- **Pravdivý stav rozšíření:** spárování a poslední ozvání se ukládají, po restartu aplikace už neukazuje
  „nenainstalováno“. Rozšíření se hlásí při startu Chromu, každých 30 minut a při otevření okna. Stavy:
  aktivní / připojeno / neozývá se / chybí, plus upozornění na zastaralou verzi v Chromu.
- **Nové okno rozšíření:** stav, spárování ve dvou krocích, přepínače služeb, tmavý režim.
- **Co je nového:** po aktualizaci se ukáže, co se změnilo; znovu přes verzi v postranním panelu.
- **Spolehlivost:** překreslení nečeká na snímek obrazovky (skryté okno ho nevykreslí), první stažený stav
  se použije hned a načítání má pojistku, když živý proud nepozdraví. Webový agent v kartě na pozadí
  nespadne na „bez aktivity“ (150 s místo 45 s).

## 0.10.2 – 2026-09-13 · zadání vždy ve schránce, do Gemini se vloží samo

- Zadání do schránky zapisuje server (`pbcopy`), ne okno – to v aplikaci i na telefonu tiše selhávalo.
  Proměnné jazyka se `pbcopy` odebírají, jinak rozbije diakritiku (změřeno).
- Gemini a Qwen neumí převzít zadání z adresy: rozšíření si ho vyzvedne (jednou, 2 minuty, jen pro danou
  službu, jen s tokenem) a vloží do pole zprávy. Neodesílá.
- Přehled má pevné sloupce místo sloupcové sazby; prázdný blok nenechává mezeru.

## 0.10.1 – 2026-09-13 · aplikace řekne, když konverzace z prohlížeče nevidí

Otevřít Gemini v prohlížeči a nevidět v Agenteeq nic vypadá jako chyba. Chyba to je – ale ne
v rozpoznávání: konverzace ve webových nástrojích (Gemini, ChatGPT, Claude.ai, Perplexity, Grok,
Microsoft Copilot, Qwen Chat) se do Agenteeq dostanou **výhradně přes rozšíření pro Chrome**.
Stránku otevřenou v prohlížeči odjinud přečíst nelze. Dokud rozšíření není připojené, aplikace
o takové konverzaci vědět nemůže.

Špatně bylo, že o tom aplikace mlčela. Nově:

- Na **Přehledu** je mezi běžícími aplikacemi dlaždice **Web – nesleduje se · bez rozšíření**,
  která vede rovnou do Nastavení.
- Na **Agentech** přibyla položka v sekci „Běží na Macu, ale bez přepisu“ s vysvětlením, kterých
  služeb se to týká a proč to jinak nejde.

Obojí se ukazuje jen dokud rozšíření nikdy nic neposlalo; po připojení zmizí.

## 0.10.0 – 2026-09-13 · původ dovedností, živá Útrata a nový widget

**Počet tokenů v panelu se už neláme.** Řádek má 146 px a číslo s popiskem dohromady přesně
146 px, takže flexbox zlomil obojí doprostřed – „482 tis.“ na dvou řádcích. Ani číslo, ani
popisek se teď nelámou; když na sebe vedle sebe nezbude místo, popisek se přesune celý pod číslo.

**Dovednosti jdou filtrovat podle původu.** Zdroj říká, který nástroj dovednost čte; původ říká,
kdo ji napsal – a to je to, co hledáš, když máš mezi 147 dovednostmi najít ty svoje dvě. Rozlišuje
se podle cesty na disku: Od Anthropicu (137), Od OpenAI (6), Z pluginu (2), Moje (2). Vlastní
dovednosti navíc nesou zelený štítek. Hlídá to sedm testů včetně případů, kdy se slovo z cesty
vyskytne jinde.

**Útrata už nevede nulami.** Blok „Kredity a extra usage“ je jediná část stránky, kterou Agenteeq
zná sám ze souborů na disku – a byl schovaný úplně dole, pod třemi prázdnými bloky. Je vysoký
1200 px a je v něm skutečný obsah (zůstatek kreditů, historie dobití, vyčerpané extra usage
u Claude). Přesunul se nahoru hned pod souhrn; výdaje, rozpočty a předplatné, které si zapisuješ
ručně, jsou pod ním.

**Nový widget „Kam dnes šly tokeny.“** Souhrn nahoře odpovídá na „kolik dnes“, tohle na druhou
půlku otázky – který nástroj to byl. Počítá se ze stejných hodinových přihrádek jako měřák, takže
se čísla nemůžou rozejít; ověřeno, že panel, měřák i widget ukazují shodně 504 386. Zaplnil taky
prázdné místo na Přehledu: rozdíl sloupců klesl z 210 px na 36 px.

## 0.9.9 – 2026-09-13 · prověření čísel v grafech a oprava tažení okna

**Okno nešlo chytit za horní pruh.** První pokus pověsil plochu k uchopení dovnitř webového
pohledu – ten si ale obsluhu myši řeší sám, takže se `mouseDownCanMoveWindow` neuplatnilo
a pruh jen polykal kliknutí. Obsah okna je teď kontejner se dvěma sourozenci: webový pohled
přes celou plochu a nad ním pruh k uchopení, který události myši dostává běžnou cestou AppKitu.
Tažení navíc spouští výslovně přes `performDrag` místo spoléhání na systémovou heuristiku
a dvojklik na pruh okno zvětší, jako na běžném záhlaví.

Čísla v grafu vypadají vysoko, tak jsem je prověřil proti zdrojovým souborům. **Sedí.** Graf
nesčítá cache ani nic nenadsazuje; hodinové přihrádky obsahují jen vstup + výstup, stejně jako
hlavní metrika od verze 0.7.0.

Ověřeno třemi nezávislými způsoby:

- **Běžící sezení Claude Code:** aplikace 1 450 795, ruční přepočet ze souboru po odstranění
  duplicit 1 452 210 – rozdíl 0,1 %. (Claude Code zapisuje tutéž zprávu do přepisu opakovaně;
  aplikace duplicity odstraňuje podle `message.id`. Naivní součet dá 4 517 400, tedy trojnásobek
  – na tohle je při jakékoli kontrole potřeba dát pozor.)
- **Codex, 30. 8.:** aplikace 901 970, přepočet ze souborů 901 970 – na token přesně.
- **Nejvyšší přihrádka v datech** (8 071 892 za jedinou hodinu 15. 8.) odpovídá souboru na token.
  Že celá částka padla do jedné hodiny, není chyba aplikace: Codex v tom souboru orazítkoval
  všech 21 záznamů stejnou vteřinou.

Proč tedy miliony: u Codexu se s každým tahem posílá znovu necachovaná část kontextu, takže
souhrn za dlouhé sezení jde do milionů. Je to technická metrika z přepisů, ne kredity ani cena.
Graf to teď říká i sám pod sebou a odkazuje na Útratu, kde jsou skutečné náklady – dřív to bylo
napsané jen u měřáku nad ním.

Nic v historických datech jsem neupravoval. Čísla odpovídají zdrojům a měnit je znamená lhát.

## 0.9.8 – 2026-09-13 · ploché karty místo stínů

Karty se vznášely nad stránkou na měkkých stínech. Místo nich je drží vlasová linka: hrany jsou
ostré, takže je vidět, že jsou přesně zarovnané, a nic se nerozmazává do okolí.

- Stín karet měl tři vrstvy včetně rozmazání do 46 px. Nově je to jedna linka o šířce 1 px.
  V tmavém režimu je zřetelnější, protože karta se tam od podkladu liší jen o 0,006 jasu –
  hranu tedy nese výhradně ona.
- **Stín nad „Okna limitů“** vrhal pruh se stavem agentů. Jako jediný blok ve stránce měl
  vyzdvižení určené pro plovoucí prvky – 80 px rozmazání, které padalo dolů na sloupce pod ním.
  Tmavá výplň na světlém podkladu ho oddělí sama. Vyzdvižení zůstává jen tomu, co se nad stránku
  opravdu vysouvá: dialogům, nabídkám, paletě příkazů a plovoucí liště na telefonu.
- Bloky Přehledu naskakují naráz. Postupné naskakování po 60 ms mělo smysl, dokud o pořadí
  rozhodoval kód; teď o rozmístění rozhoduje sazba, takže by vypadalo náhodně – a během něj
  bloky chvíli neseděly v řadě, což vypadalo jako křivý layout.

Zarovnání ověřeno měřením: oba sloupce 484 px, levé hrany karet přesně na 0 a 556 px, pravé na
484 a 1040 px, **žádné desetinné pixely**, mezery 40 px mezi bloky a 16 px pod nadpisy.

## 0.9.7 – 2026-09-13 · Přehled se vyvažuje sám, přepis je zase čitelný

**Tmavý text na tmavé bublině v přepisu – moje chyba z 0.9.0.** Třídu `.md` používá jak čtečka
dovedností, tak přepis konverzace. Když jsem pro čtečku přidal obecné pravidlo s barvou textu,
přebilo to styly přepisu: zpráva uživatele dostala tmavě šedou na tmavém pozadí a odkazy v ní
zčernaly. Pravidla čtečky jsou teď omezená na `.reader`, takže přepis si drží vlastní bílý text
i světlé odkazy. Doloženo v servírovaném souboru: barvu v `.md` nastavuje už jen čtečka.

**Prázdná plocha na Přehledu.** Dva pevné sloupce s natvrdo přiřazenými bloky nemohly vyjít:
výška bloků závisí na datech – jednou je dlouhý seznam rozhodnutí, jindy graf a dlaždice.
Kterýkoli sloupec pak skončil dřív a vedle druhého zůstala díra; naměřeno až **1242 px** rozdílu.

Přehled je nově sloupcová sazba, která bloky rozdělí tak, aby oba sloupce končily stejně vysoko,
ať jsou data jakákoli. Blok se přitom nikdy neroztrhne napůl. Rozdíl sloupců klesl na **138 px**,
což je při nedělitelných blocích minimum.

**Běží na tomto Macu** se přesunulo pod mřížku přes celou šířku. V půlce sloupce se osm dlaždic
skládalo do čtyř řad; přes celou šířku jsou v jedné řadě a sekce měří 129 px místo stovek.

Na telefonu zůstává jeden sloupec a bloky jdou pod sebou v logickém pořadí.

## 0.9.6 – 2026-09-13 · tmavé záhlaví okna

Bílý systémový pruh nad aplikací rušil. Okno teď nemá vlastní titulkový pruh: obsah sahá až
k hornímu okraji, takže se za tlačítky okna roztáhne tmavý pruh aplikace i s jeho přechodem.
Název okna je skrytý – značka je v postranním panelu a dvakrát tam nepatří.

- Plocha zůstává od kraje ke kraji; ustoupí jen postranní panel, aby se jeho roh nepotkal
  s tlačítky okna. Ta sahají do 28 px, panel začíná na 44 px a na stejné výšce se zastaví
  i při rolování. Dole má stejných 44 px.
- Pozadí okna je tmavé v obou režimech vzhledu. Je vidět jen při změně velikosti okna a patří
  tam podklad, ne barva karet.
- Táhnout okno jde dál za horní pruh – záhlaví existuje, jen je průhledné. Záměrně nesaháme na
  `isMovableByWindowBackground`, které by rušilo označování textu uvnitř aplikace.

## 0.9.5 – 2026-09-13 · postranní panel drží pohromadě

Na nižším okně končila bílá karta panelu dřív než její obsah: poslední položky nabídky a stav
spojení visely mimo ni na pozadí. Naměřeno při okně 800 px – patička přesahovala **112 px ven**.
Příčinou byla pevná spodní hranice výšky (`min-height: 640px`) a chybějící omezení přetečení,
takže kartu nic nedrželo.

Panel je teď postavený jako karta s kotvami: značka nahoře, stav spojení dole, nabídka mezi nimi.
Z karty nemůže vylézt nic; kdyby se nabídka přece jen nevešla, roluje se uvnitř.

Aby k rolování vůbec nedošlo, ustupuje na nižším okně **dekorace, ne navigace**. Profil se ve třech
krocích překlopí z vysokého sloupce (avatar nad jménem nad číslem) do řádku – avatar vlevo, jméno
vedle, číslo pod tím:

| Výška okna | Profil | Položky nabídky |
|---|---|---|
| 1080 px | 223 px, avatar 80 px | všech 8 vidět |
| 800 px | 90 px, avatar 48 px | všech 8 vidět, neroluje |
| 700 px | 56 px, avatar 40 px | všech 8 vidět, neroluje |
| 620 px | 56 px | roluje o 5 px, vše zůstává v kartě |

Řádek nabídky má i v nejmenším kroku 46 px, tedy s rezervou nad hranicí WCAG 2.2 pro cíl prstu.
Karta má nově stejnou mezeru dole jako nahoře (48 px). Na telefonu se nemění nic – všechna
pravidla platí až od 881 px šířky.

## 0.9.4 – 2026-09-13 · Codex na webu a prověřený řetězec rozšíření

- **Codex na webu se sleduje jako samostatný nástroj.** Běží na stejné doméně jako ChatGPT
  (`chatgpt.com/codex`), takže ho dřív pohltil obecnější záznam a úloha se zařadila pod ChatGPT.
  Nově má vlastní adaptér i vlastní jméno „Codex · web“. Šest testů hlídá rozpoznávání adres:
  že `/codex/tasks/…` je Codex, `/c/…` je ChatGPT, `/codexfoo` není Codex, že cizí stránka se
  nerozpozná jako AI nástroj a že každý adaptér ustojí i prázdnou stránku.
- Každá služba z rozšíření musí být známá i serveru – jinak by se konverzace zahodila jako
  „Neznámá služba“. Hlídá to test.

Ověřeno proti běžícímu serveru: příjem konverzace bez tokenu i s cizím tokenem vrací 401,
párování bez hlavičky Origin nebo z cizí adresy se odmítne, párovací kód platí jen jednou,
čtení stavu z cizí stránky vrací 403 a zápis bez ochranné hlavičky také 403. Spouštění agentů
prověřeno ve všech režimech (v aplikaci, na pozadí, v Terminálu, na webu) včetně chybových
stavů: neznámý agent, prázdné zadání, nepodporovaný režim a zadání nad 20 000 znaků.

## 0.9.3 – 2026-09-13 · rozšíření do prohlížeče dotažené do konce

Konverzace z ChatGPT, Claude.ai a dalších webových aplikací se dají sledovat jen přes rozšíření
v prohlížeči – lokálně o nich na disku nic není. Serverová část byla hotová, ale rozšíření samo
mělo dvě vady, kvůli kterým se nedalo spolehlivě používat.

- **Aktualizace aplikace rozšíření rozbíjela.** Chrome si u rozbaleného rozšíření pamatuje cestu
  ke složce a čte ji při každém startu. Ta složka ležela uvnitř balíčku aplikace, který se při
  aktualizaci celý nahradí – Chrome pak našel prázdné místo a rozšíření si sám vypnul. Aplikace
  si teď při startu udělá kopii do datové složky (`~/.agenteeq/extension`), kterou aktualizace
  nesmaže, a v návodu ukazuje právě ji. Kopie se obnoví jen při změně verze.
- **Rozšíření nemělo ikonu.** V liště Chromu byl šedý dílek skládačky, i když návod říká „klikni
  na ikonu rozšíření". Teď má ikony ve všech velikostech, které Chrome používá.
- Verze rozšíření se drží verze aplikace; hlídá to test.

Celý řetězec ověřen od začátku do konce: jednorázový kód → spárování jako rozšíření Chromu →
odeslání konverzace → konverzace je v Agenteeq vidět jako běžící agent. Šest testů navíc hlídá
kopírování, přežití aktualizace, ikony i to, že rozšíření nemluví s ničím jiným než
s Agenteeq na `127.0.0.1`.

## 0.9.2 – 2026-09-13 · žádná běžící aplikace už nezůstane bez odpovědi

Nejčastější stížnost na Agenteeq zní „běží mi agent a aplikace ho nezaregistrovala". Tohle vydání
ji řeší u kořene – a to i v případě, kdy za to Agenteeq nemůže.

**Co se dělo.** Když agent běžel v aplikaci ChatGPT, Přehled ukazoval, že ChatGPT běží, ale
v seznamu agentů po něm nebyla stopa a nikde nebylo vysvětlení proč. Vysvětlivka existovala,
ale jen dole na stránce Agenti, kam se nikdo nedívá. Vypadalo to jako chyba.

**Ověřeno za běhu takové úlohy (13. 9. 2026):** aplikace ChatGPT o konverzaci na tento Mac
nezapisuje nic. Složka aplikace nezapsala za 40 minut jediný soubor, v `~/.codex/sessions` je
nejnovější záznam z 6. 9., v datech Codexu se změnily jen cookies, TLS a mezipaměť sítě a text
konverzace není nikde na disku. Není co číst – a produkt to musí říct, ne mlčet.

**Co se změnilo:**

- Dlaždice běžící aplikace na Přehledu nese značku **bez přepisu**, vede na vysvětlení a po
  najetí myší ukáže celý ověřený důvod. Uživatel se to dozví tam, kde se dívá.
- Přibylo vysvětlení pro **Claude Desktop**: chaty z něj jsou na serveru, ale sezení Claude Code
  z něj se čtou normálně – ověřeno, 82 z 83 sezení desktopové aplikace má přepis na tomto Macu.
- Seznam „co umíme číst" a „co ne" je nově na jednom místě (`public/js/no-transcript.js`)
  a **hlídají ho čtyři testy**: každá známá aplikace musí být právě v jedné z obou skupin, nesmí
  být v obou, nesmí tam zůstat aplikace, která už neexistuje, a každé vysvětlení musí mít
  ověřený důvod, radu a odkaz. Nová aplikace tedy neprojde do vydání bez zařazení.

## 0.9.1 – 2026-09-13 · plynulost na 120 a 240 Hz

Při 120 Hz má prohlížeč na jeden snímek 8,3 ms, při 240 Hz jen 4,2 ms. Cokoli, co se v každém
snímku překresluje, se v takovém rozpočtu pozná. Audit našel čtyři takové věci a jednu, která
sekala jinak – překreslením pohledu uprostřed gesta.

**Překreslování v každém snímku rolování:**

- `background-attachment: fixed` na těle stránky nutilo prohlížeč překreslit obě velké
  přechodové plochy pokaždé, když se stránka pohnula. Pozadí má teď vlastní pevnou vrstvu,
  kterou kompozitor nakreslí jednou. Vzhled je stejný.
- Zrnitost v horním pruhu se míchala přes `mix-blend-mode: overlay`, což znamená při každém
  překreslení znovu načíst podklad. Teď je to obyčejná průhledná vrstva.
- Prstenec kolem živé tečky se animoval přes `box-shadow` – a běžel napořád, u každé tečky na
  stránce. Nově je to transformace a průhlednost, tedy práce pro kompozitor, ne pro překreslování.
- Kostry při načítání posouvaly `background-position`. Také přepsáno na transformaci – a to
  zrovna ve chvíli, kdy má procesor nejvíc práce.

**Práce, která padala doprostřed gesta:**

- Překreslení pohledu chodí ze streamu pokaždé, když agent něco udělá. Naměřený přepočet stylů
  a layoutu má medián 0,7–1,9 ms, ale špičky 12 až 26 ms podle stránky – každá taková špička je
  při 120 Hz zahozený snímek, při 240 Hz jich je až šest. Během rolování se teď témata jen
  sbírají a vykreslí se, jakmile se pohyb zastaví.
- Přepisování časových údajů běželo každou vteřinu a třikrát procházelo celý dokument. `rel()`
  přitom jemněji než na minuty nepočítá, takže štítky stačí jednou za deset vteřin; vteřinový
  krok zůstal jen běžícím stopkám, a jen když nějaké na stránce jsou. Během rolování se nesahá
  na text vůbec a po zastavení se údaje hned doženou (ověřeno: 12,5 s souvislého rolování bez
  jediného zápisu, dohnáno do 200 ms po zastavení).
- Řádek v seznamu agentů se mimo obrazovku nepočítá ani nekreslí.

## 0.9.0 – 2026-09-13 · dovednosti se dají číst v aplikaci

**Obsah dovednosti si přečteš rovnou v Agenteeq.** Doteď šel jen zkopírovat nebo stáhnout –
což znamenalo otevřít editor kvůli tomu, aby ses podíval, co ta dovednost vlastně dělá.
Klik na kartu (nebo na Číst) otevře čtečku s vysázeným textem: nadpisy, seznamy, bloky kódu
s názvem jazyka, citace, tabulky i odkazy. Vedle textu je cesta k souboru na jedno klepnutí
do schránky, hlavička souboru a tlačítka Kopírovat vše a Stáhnout. Zavírá se Esc a zaostření
se vrací tam, odkud se čtečka otevřela.

Markdown si Agenteeq sází sám (`public/js/markdown.js`, žádná knihovna navíc). Text se nejdřív
celý proescapuje a značky se hledají až nad ním, takže HTML ze souboru se nikdy nestane HTML
stránky; odkaz projde jen na http, https a mailto. Hlídá to deset testů a ověření proti všem
147 skutečným souborům SKILL.md na tomto Macu – všechny se vykreslily, žádná uniklá značka,
žádná obsluha události, žádná výjimka.

**Stránka Dovednosti dostala tvar.** Nad seznamem je souhrn (kolik jich je, z kolika zdrojů,
kolik textu celkem, kdy se naposledy něco změnilo), přibylo řazení podle názvu, poslední úpravy
a velikosti, a hledá se i v cestě k souboru. Karty mají jasnou hierarchii a vedlejší akce jen
jako ikony, takže se do řádku vejde víc sloupců: při 1024 px dva, při 1440 px tři, při 1800 px
čtyři. Stránka tím spadla z 27 036 px na 9 164 px.

**Poslední aktivita na Přehledu je přes celou šířku.** Držela se v úzkém levém sloupci a táhla
ho o 263 px pod pravý, kde zůstávalo prázdno. Teď je pod mřížkou přes celou šířku a položky se
skládají do sloupců podle místa (3 / 2 / 1). Rozdíl výšky sloupců klesl z 263 px na 133 px.

## 0.8.5 – 2026-09-13 · prostor na širokém displeji

- **Vyhledávací pole už při kliknutí neuskočí.** Rostlo ze 280 na 320 px, a protože je zarovnané
  doprava, celé se posunulo o 40 px stranou. Šířka je teď stálá; zpětnou vazbu dává rámeček.
  (300 px nešlo – při té šířce se lišta na 1440 px láme na dva řádky.)
- **Detail agenta nemá vedle bočního sloupce díru.** Přepis měl pevnou výšku, takže levý sloupec
  skončil a zbytek řádku zůstal prázdný: naměřeno 903 px prázdna na ploše široké 980 px. Oba
  sloupce teď sahají stejně hluboko a místo díry je vidět víc konverzace. Ověřeno ve třech
  situacích: dlouhý přepis (ořeže se), krátký přepis (nikde nic nechybí) i krátký boční sloupec
  (přepis si drží spodní hranici výšky).
- **Dovednosti se skládají do více sloupců.** 147 dovedností v jednom sloupci dělalo stránku
  vysokou 27 036 px, ve které zůstávalo 80 % šířky prázdných. Na širokém displeji jsou teď dva
  sloupce a stránka měří 13 604 px; na užším displeji zůstává jeden sloupec a na telefonu se
  nic nemění.

## 0.8.4 – 2026-09-13 · tři opravy na telefonu

- **Stav spojení měl u tečky zase popisek.** Pod 560 px se text schovával a v liště zůstala jen
  osamocená zelená tečka, která sama o sobě nic neříká. Každý stav má teď i krátkou variantu
  („Živě“, „Připojuji…“, „Bez spojení“) a přepíná se v CSS. Lišta má na telefonu jen 327 px,
  takže delší popisek ji dřív zalomil – přednost ustoupit má proto nadpis stránky, ne tlačítka.
  Ověřeno pro všechny názvy stránek i všechny stavy spojení: nic se nezalomí.
- **Menu „Další sekce“ už nevypadá jako slepené karty.** Prstenec zaostření leží podle výchozího
  stylu 3 px vně prvku, ale řádky menu byly 2 px od sebe – prstenec se tak kreslil přes sousední
  řádky. Změřeno: u zaostřeného řádku 936–992 px sahal prstenec 931–997 px, tedy 3 px do obou
  sousedů. Nově je prstenec uvnitř řádku a mezera je 6 px.
- **Karty projektů mají výraznější podbarvení.** Místo skvrny v rohu prosvítá barva projektu
  horní polovinou karty. Výška 55 % není odhad: patička se statistikami začíná na 57 % a její
  drobné písmo by na podbarvení nemělo dost kontrastu (4,35 : 1 při plné síle, AA žádá 4,5).
  Nahoře leží jen název a popis, které i ve špičce gradientu drží 8,6–14,2 : 1.

## 0.8.3 – 2026-09-13 · přístup z telefonu přežije restart aplikace

Zapnutý přístup z telefonu se po restartu aplikace sám nespustil. V nastavení svítil jako
zapnutý, ale listener pro místní síť neběžel – telefon se prostě nepřipojil a vypadalo to,
že je rozbitý.

Příčina: listener se věšel na událost `listening` hlavního serveru. Desktopová aplikace si ale
port zabírá schválně dřív, než vůbec načte data (aby se o něj dvě instance nepraly), takže
událost proběhla dávno předtím, než se na ni bylo možné navěsit. V `npm start` je pořadí
opačné, a proto to nikdy nespadlo v testech.

Nově se stav serveru kontroluje rovnou: když už naslouchá, listener se spustí okamžitě.
Hlídají to dva testy – jeden ověřuje, že se spustí, druhý že se bez zapnutého nastavení
neotevře nic.

## 0.8.2 – 2026-09-13 · na telefonu papír až k hornímu okraji

Na telefonu mizí tmavý pruh nahoře. Byl to dekorační pás `.stage`, na kterém na počítači „plave“
logo a titulek – na malé obrazovce z něj ale zůstal jen banner, který ubíral místo.

- `.stage` se pod 880 px skrývá a obsah začíná 24 px od horního okraje (plus výřez).
- `body` má na telefonu papírové pozadí místo tmavého „stolu“. Ten byl vidět jen při přetažení
  a v pásu pod stavovým řádkem – tedy přesně tam, kde působil jako další pruh.
- Stavový řádek v appce uložené na plochu je nastavený na `default`: plocha začíná pod ním
  a jeho pozadí je barva stránky, takže čas a baterka zůstanou čitelné. `black-translucent`
  by na bílém podkladu kreslil bílý text. **iOS si tenhle údaj čte při ukládání na plochu –
  appku na ploše je proto potřeba jednou smazat a uložit znovu.**

Rozvržení na počítači se nezměnilo: pruh, odsazení i tmavé pozadí zůstávají přesně jako dřív.

## 0.8.1 – 2026-09-13 · rozcestník pro rozhraní bez serveru

Rozhraní Agenteeq se dá nahrát i odjinud než z Macu (statická kopie na webhostingu, třeba Vercel).
Taková stránka ale nemá za sebou žádný server – data leží vždycky na Macu. Doteď v ní aplikace
hlásila „Agenteeq server neběží“ a ukazovala adresu `127.0.0.1:4620`, což je na telefonu sám
telefon: rada, která nemohla nikdy vést k cíli.

- Nově se při startu jednou ověří, jestli za stránkou vůbec je Agenteeq (`/api/health`). Když
  není, místo aplikace se ukáže **rozcestník**: zeptá se na adresu Macu a prohlížeč tam pošle.
  Adresa se zapamatuje, takže příště stačí jedno klepnutí (`public/js/connect.js`).
- Adresa v domácí síti (IP nebo jméno `.local`) jede po `http` a doplní se jí port 4620; tunel
  venku (Tailscale, Cloudflare) po `https` na svém vlastním jménu. Cokoli jiného než `http(s)`
  – `javascript:`, `data:`, `file:`, adresa s heslem – se odmítne.
- Karta „server neběží“ na spárovaném telefonu už neukazuje `127.0.0.1`, ale skutečnou adresu,
  na které je stránka otevřená, a radí zkontrolovat Mac místo Terminálu.
- **Verze aplikace v macOS už nezůstává pozadu.** `Info.plist` měl natvrdo 0.6.0, takže Finder
  i okno „O aplikaci“ hlásily starou verzi i po instalaci nové. Číslo se teď razítkuje při
  každém buildu z `package.json` (`scripts/plist-version.mjs`) a okno „O aplikaci“ si ho bere
  z balíčku. Hlídají to dva testy.

## 0.8.0 – 2026-09-13 · nový název Agenteeq

Produkt se jmenuje **Agenteeq**. Přejmenováno je všechno viditelné i vnitřní: rozhraní, okno aplikace, dokumentace, balíček (`agenteeq`), příkaz (`agenteeq`), aplikace (`Agenteeq.app`), značka, ikony, PWA manifest, datová složka (`~/.agenteeq`), proměnné prostředí (`AGENTEEQ_*`), služba v Klíčence (`cz.agenteeq.*`) i položka pro spouštění po přihlášení. Typografie ani velikosti se nezměnily – jen text.

Aby se nikomu nerozbil běžící systém, zůstávají čtyři mosty:

- data z `~/.agentree` se při prvním spuštění jednou zkopírují do `~/.agenteeq` (originál zůstává),
- staré proměnné prostředí `AGENTREE_*` dál fungují,
- hooky Claude Code a rozšíření prohlížeče nainstalované pod starým názvem fungují dál (server bere i hlavičky `X-Agentree` a `X-Agentree-Token`),
- spárované telefony se starou cookie zůstávají spárované.

Klíče v Klíčence uložené pod starým názvem služby se nepřenášejí – ty je potřeba vložit znovu v Nastavení.

## 0.7.0 – 2026-09-13

Vydání s prací z 12. a 13. 9. Číslo verze se zvedlo hlavně proto, aby bylo v aplikaci na první pohled vidět, že běží nová: 0.6.0 zůstávalo i po instalaci nového buildu.

Hlavní změny (podrobně níž): pravdivé počítání tokenů (vstup + výstup, bez režie cache), práce pomocných agentů Claude Code, detektor všech lokálních a neznámých agentů, přepnutí do okna aplikace jedním klikem, dovednosti na jednom místě, vlastní agenti, přístup z telefonu s párováním kódem, karta Mimo domov, prémiová načítací animace, PWA a plynulé rolování na mobilu.

## Vyladěné detaily rozhraní – 2026-09-12

- **Mimo domov** (Nastavení → Aplikace na tomto Macu): Agenteeq zjistí, jestli máš nainstalovaný Tailscale, Cloudflare Tunnel nebo ngrok, u každého řekne, co znamená pro soukromí (privátní síť vs. veřejná adresa), doporučí nejvhodnější a vypíše kroky. Sám žádnou cestu ven neotvírá. Párování kódem platí i tam – kdo zná adresu, ale nemá spárované zařízení, data nedostane. Patnáct testů, vše s injektovaným spouštěním (žádné skutečné binárky).
- **Audit cloudových API** (`docs/CLOUD-ACCOUNTS.md`): pro sedm poskytovatelů ověřeno v dokumentaci, co přes oficiální API opravdu jde. Výsledek je nutné znát: **obsah konverzací ani stav běžícího agenta nedává v reálném čase žádný poskytovatel** a spotřebitelská předplatná (ChatGPT Plus/Pro, Claude Pro/Max, Gemini Advanced, Perplexity Pro, Grok, Copilot Individual) nemají veřejné API vůbec. Firemní účty s Admin klíčem dávají náklady, tokeny a část limitů – u Anthropicu, OpenAI, xAI, Mistralu a GitHub Copilotu. Konektor nákladů proto umí i **spotřebu tokenů** (`/v1/organization/usage/completions` a `/v1/organizations/usage_report/messages`); tokeny se nikdy nesčítají s penězi. Patnáct nových testů bez sítě.
- **Nová načítací obrazovka.** Místo obyčejného kolečka se dokresluje samotná značka Agenteeq: kmen, pak obě větve, uzly se rozsvěcují, jak k nim růst dorazí, a po dokončení se jemně rozsvítí halo. Smyčka 2,2 s bez viditelného střihu, animuje se jen `transform`, `opacity` a `stroke-dashoffset` (běží na GPU, nebrzdí rolování). Po prvním nasazení jsem časování přepracoval: logo bylo čitelné jen 360 ms z každé smyčky, teď drží dokreslené 38–76 % času, a značka narostla ze 72 na 96 px, aby na celé obrazovce nepůsobila ztraceně. Při zapnutém omezení pohybu se nic nehýbe a značka je hned celá. K tomu skeleton pro karty, které se dopočítávají.
- **Agenteeq teď najde i agenty, o kterých nemá ponětí.** Nový detektor (`src/connectors/local-agents.js`) čte běžící procesy a otevřené porty: zná dvacet lokálních prostředí (Ollama, LM Studio, llama.cpp, vLLM, ComfyUI, koboldcpp, Jan, GPT4All, LocalAI, Open WebUI, MLX, SGLang, TabbyAPI, LiteLLM, whisper.cpp, A1111, InvokeAI a další) a k tomu heuristiku pro cokoli neznámého – vlastní model z Hugging Face pozná podle `.gguf`/`.safetensors`, přepínače `--model` nebo obsazeného portu pro lokální inferenci. U takových je v seznamu odznak **Vlastní / neznámý** a poctivá věta, že u nich Agenteeq neumí číst konverzace ani limity. Ověřeno na skutečných 504 procesech: falešný model `qwen2.5-7b-instruct-q4` na portu 8000 se objevil do deseti sekund včetně jména a portu, systémové procesy ani Agenteeq sám se neoznačí nikdy. Osm testů.
- **Přepnutí do okna jedním klikem.** Na Přehledu jsou dlaždice běžících aplikací tlačítka a na Agentech je u každé běžící aplikace „Přepnout do aplikace“ – Claude, ChatGPT, Cursor, VS Code, Microsoft Copilot, Perplexity, Grok, LM Studio i Ollama. Konec hledání okna mezi dvaceti dalšími. Název aplikace se nikdy nebere z požadavku, jen z pevného seznamu v `src/openers.js`, a hlídá to test i na pokusy o podstrčení cizí cesty.
- **Agenteeq jde otevřít na telefonu** (Nastavení → Otevřít na telefonu). Výchozí stav je vypnuto: server pak poslouchá jen na `127.0.0.1` jako dosud. Po zapnutí se přidá listener na adresu Macu v domácí síti, telefon si zobrazí párovací obrazovku a jednorázovým šestimístným kódem (5 minut, pět pokusů) se spáruje. Token má telefon v cookie `HttpOnly`, v datech aplikace leží jen jeho SHA-256 hash. Bez spárování nedostane z místní sítě žádná data (401) – vydá se mu jen statická aplikace, aby měl z čeho zobrazit párování. Kód, seznam zařízení, zapínání i odpárování jsou dostupné výhradně z Macu; hlavička `Host` se kontroluje proti pevnému seznamu (ochrana proti DNS rebindingu) a vypnutí zavře spojení a odpáruje všechna zařízení. Hlídá to šest testů, včetně skutečného spojení přes síťovou adresu.
- **Běžící aplikace bez přepisu jsou vidět na Agentech.** ChatGPT (a stejně tak Microsoft Copilot, Perplexity, Grok) v aplikaci žádné konverzace na disk neukládá, takže se v seznamu nikdy neobjevil a vypadalo to, že ho Agenteeq „nezaregistroval“. Teď má vlastní sekci „Běží na Macu, ale bez přepisu“ s dobou běhu a vysvětlením, proč u něj přepis být nemůže a co s tím jde udělat (rozšíření v prohlížeči). Ověřeno: mezipaměť konverzací aplikace ChatGPT se naposledy zapsala 1. 6. 2025, za poslední tři hodiny nezapsala nic, v `~/.codex/state_5.sqlite` (včetně WAL) je nejnovější vlákno z předchozího dne a fulltextové hledání unikátního slova z dnešního chatu nenašlo na disku nic.
- **PWA**: přidán `manifest.webmanifest` (dosud chyběl, přitom ho service worker načítal), ikony 192/512/apple-touch, hlavičky pro domovskou obrazovku iOS a theme-color zvlášť pro světlý a tmavý režim. Service worker v3: navigation preload, kód a styly vždy ze sítě (`no-store`), API se necachuje nikdy.
- **Plynulost na telefonu**: dlouhé seznamy dostaly `content-visibility` – vynucený layout na Dovednostech spadl z 30 ms na 0,4 ms, na Statistikách a Přehledu po odrolování z 14–30 ms na 2 ms. Pole mají na mobilu 16 px (Safari už nepřibližuje stránku při kliknutí), `overscroll-behavior` brání přetahování celé plochy a vodorovné pásy mají setrvačné rolování.
- **Vždy čerstvá data**: po návratu do aplikace, obnovení sítě i probuzení stránky si Agenteeq sám znovu natáhne stav – telefon spojení se streamem uspí a bez toho by chvíli ukazoval stará čísla.
- **Historie extra usage u Claude** je v Útratě vedle kreditů Codexu: graf čerpání za období, které pokrývá historie plánu, a seznam skoků, kdy čerpání narostlo (naposledy +16,1 % dne 21. 8.). Hodnota se zobrazuje jako procento vyčerpaného limitu – jednotku soubor neuvádí, ale plyne ze tří věcí: vedle leží 5hodinové a týdenní okno také v procentech, oficiální stavový řádek Claude Code hlásí stejnou trojici `five_hour` / `seven_day` / `spend_limit` (kde `spend_limit` má `used_percentage`) a hodnota na skutečných datech nikdy nepřekročila 100 (18,2 → 64,4 za měsíc). Přesná data ze stavového řádku mají dál přednost. 🧪 Beta, protože to Anthropic nikde nedokumentuje.
- **KRITICKÉ: hlavní čísla tokenů byla o řád vyšší, než kolik jsi doopravdy spotřeboval.** Do součtu se počítal i zápis do cache – technická režie, kdy se stejný kontext zapisuje znovu s každým tahem. Dnešní realita: vstup 2 948 + výstup 629 841 = **632 789 tokenů**, ale zápis do cache 4 847 361, takže aplikace hlásila 5 480 150. Hlavní metrika je teď vstup + výstup, tedy stejná spotřeba, jakou vidíš u dodavatele; režie cache (zápis i čtení) zůstává ve složení tokenů u konkrétní konverzace, kam patří. Sjednoceno pro Claude i Codex, popisky přejmenované ze „zpracovaných tokenů“ na „tokeny“ a hlídají to tři testy. Ověřeno proti ručnímu přepočtu ze souborů: Codex 6 139 058 na token přesně, Claude 2 242 340 vs 2 252 120 (0,4 %, hranice hodinových přihrádek).
- **Úklid kódu.** Z rozhraní zmizely pozůstatky po odstraněné funkci obálek a log projektu – sedm pomocných funkcí v `projects-ui.js`, dvě metody pro nahrávání v `api.js` (nikdo je nevolal a odpovídající CSS v projektu vůbec není), plus `logoLabel`, `runsSummary` a `STATUSES`, které nepoužíval ani jejich vlastní soubor. Po dnešní změně kreditů zmizel i dopočet dokoupení v prohlížeči: rozpoznává je server nad všemi odečty, v UI by na to byla jen zkrácená historie. Tři skripty, které ležely ve `scripts/` bez jakéhokoli odkazu, mají teď vlastní příkazy (`npm run qa:desktop`, `qa:keychain`, `fonts:vendor`).
- **Na telefonu se rozjížděl obsah Dovedností a Nastavení mimo obrazovku.** Karty jsou prvky mřížky a ty mají výchozí `min-width: auto`, takže minimální šířku určila nejdelší nezalomitelná cesta k souboru – z karty dovednosti bylo 890 px na 375px displeji a v Nastavení se stejně rozjely všechny sekce. Mřížky teď mají `minmax(0, 1fr)` a dlouhá cesta se zkrátí třemi tečkami. Ověřeno na všech osmi obrazovkách: nula přetékajících prvků na 375 px, desktop 1440 px bez změny.
- Na telefonu se u karty „Spustit agenta“ schovává text tlačítka pro obnovení nabídky, takže na kliknutí zbývala plocha 14×22 px. WCAG 2.2 žádá aspoň 24×24; teď má 32×32 a díky zápornému okraji se vzhled nezměnil.
- **Historie dokoupených kreditů sahá tam, kam sahají data** – ne jen 30 dní zpět. Agenteeq jednorázově projde i starší konverzace Codexu a vytáhne z nich výhradně řádky se zůstatkem kreditů (žádné přepisy, žádné tokeny); na tomto Macu tím přibylo pět dřívějších dokoupení od 12. 7.
- **Částky u dokoupení odpovídají skutečnosti.** Codex hlásí zůstatek z každé konverzace zvlášť a starší konverzace posílá zastaralé hodnoty, takže řada skáče nahoru a dolů – Agenteeq z toho dřív dopočítal i nákupy, které se nestaly, a u skutečných ukazoval nižší částky (třeba +19,6 místo +108,5). Nákup se teď pozná podle toho, že se nárůst udrží: medián následujících odečtů musí zůstat nad původní úrovní. Detekce běží na serveru nad všemi odečty, ne nad zkrácenou uloženou historií, a má vlastní testy.
- **U jednoho limitu svítila dvě různá čísla.** Jakmile dorazila přesná data ze stavového řádku Claude Code, měřáky ve Statistikách a v detailu agenta kreslily vedle sebe i záložní hodnotu z historie plánu – tedy „5 h 42 %“ a hned pod tím „5 h 13 %“. Měřáky teď respektují stejnou přednost zdrojů jako zbytek aplikace: přesná data vyhrávají, záloha se skryje. Hlídá to test.
- Aktivní záložka v Nastavení hlásí `aria-current="true"` místo prázdné hodnoty, která podle specifikace znamená opak – odečítače obrazovky teď řeknou, ve které sekci uživatel je. Vzhled se nemění, styl se váže na přítomnost atributu.
- **Práce pomocných agentů se už neztrácí.** Claude Code píše jejich přepisy do `<projekt>/<konverzace>/subagents/agent-*.jsonl`, tedy o dvě úrovně hlouběji, než konektor četl – dnešních 1 133 552 tokenů (23 % práce Claude) tak v Agenteeq vůbec nebylo. Teď se načtou jako samostatné konverzace navázané na rodiče: v seznamu agentů zůstávají skryté pod ním, ale mají vlastní přepis, stav i tokeny. Jméno dostanou z popisu úlohy v rodičovském přepisu (párování přes `agentId`), takže v detailu rodiče je vidět „Pomocní agenti: 6 · 1,13 M“ a proklik na to, co každý dělal.
- **Soukromí a bezpečnost** (Nastavení → Aplikace na tomto Macu): karta říká narovinu, co kde leží – konverzace se jen čtou z disku a drží v paměti, trvale se ukládá jen nastavení, projekty, rozpočty a historie upozornění, klíče k API patří do Klíčenky a ven z Macu nejde nic kromě volitelného dotazu na náklady tvým vlastním klíčem. Texty upozornění jsou jediná trvale ukládaná data odvozená z obsahu konverzací a teď je jde jedním tlačítkem smazat (i s klíči proti opakování). Datová složka se nově zakládá s právy 0700 a při startu se na ně srovná; soubor měl 0600 už dřív.
- **Vlastní agenti** (Nastavení → Propojení): lokální služby bez vlastního konektoru – ComfyUI, Ollama a servery s rozhraním OpenAI (LM Studio, vLLM, llama.cpp). Agenteeq se jich ptá jen na stav a ukazuje je i mezi běžícími aplikacemi na Přehledu. Bezpečnost na prvním místě: adresa smí mířit výhradně na tento Mac nebo do místní sítě (loopback, 10.x, 172.16–31.x, 192.168.x, .local), cloudová metadata na 169.254.x jsou zakázaná natvrdo, z adresy zůstane jen origin (cesta ani dotaz se nepřenesou), dotaz je vždy GET, nenásleduje přesměrování, má časový limit 1,5 s a strop 64 kB na odpověď. Přihlašovací údaje se neukládají, agentů je nejvýš osm a zápis vyžaduje stejnou ochranu proti CSRF jako ostatní změny.
- **Historie vytížení plánu Claude** ve Statistikách: 30 dní skutečných vzorků z historie, kterou si zapisuje aplikace Claude Desktop – graf 5hodinového okna, týdenního okna a extra usage. Čte se na vyžádání (`GET /api/usage/claude`), nikam se neukládá a identifikátor organizace ze vzorků se ven nedostane. U extra usage zůstává poznámka, že zdroj neuvádí jednotku.
- Karta **Limity a kredity** říká pravdu o pokrytí: každá aplikace má vlastní limit (Codex odděleně od chatu v ChatGPT) a pod měřáky se vypíše, které aplikace limity hlásí a která běžící aplikace svůj limit na disk nezapisuje, takže ho Agenteeq nemá odkud přečíst. Seznam se odvozuje ze skutečného stavu, nic se nedoplňuje odhadem.
- Instalace pro další lidi v nainstalované aplikaci: složka `dist/` existuje jen ve vývojovém repu, takže běžný uživatel dřív viděl vývojářský příkaz `npm run build:mac`, se kterým nic nezmůže. Karta teď ukáže samotnou aplikaci s tlačítky Ukázat ve Finderu a Kopírovat cestu a poradí, že ji stačí ve Finderu zabalit (Komprimovat) – Node.js je uvnitř, příjemce nic doinstalovávat nemusí.
- Nová sekce **Dovednosti**: na jednom místě všechny soubory `SKILL.md`, které máš na Macu – u Claude, v jeho pluginech a plánovaných úlohách i u Codexu. Každá položka ukazuje název a popis z hlavičky souboru, zdroj, velikost, kdy byla naposledy upravena a cestu (stejné názvy z různých pluginů tak jdou rozlišit). Obsah se dá jedním klikem zkopírovat a použít u jiné služby nebo agenta, nebo stáhnout jako `.md`. Filtr podle zdroje a hledání v názvu i popisu. Agenteeq soubory jen čte a nikam je neodesílá; obsah vydává výhradně podle id z čerstvě projitého seznamu, takže přes tuto cestu nejde přečíst jiný soubor na disku.

- Nastavení → Instalace pro další lidi (desktopová aplikace): karta dřív jen napsala „předej instalační ZIP“ a nedala žádný způsob, jak ho získat. Server teď sám zjistí, jestli `dist/Agenteeq-<verze>-macOS-<architektura>.zip` z posledního `npm run build:mac` existuje (velikost, datum), a karta podle toho ukáže buď název souboru s tlačítky **Ukázat ve Finderu** a Kopírovat cestu, nebo návod, jak balíček vytvořit. Nový endpoint `/api/install/reveal` odvozuje cestu vždy sám ze složky `dist/` na serveru (nikdy z požadavku), má stejnou ochranu proti CSRF jako ostatní mutace a v režimu `AGENTEEQ_OPEN=dry` jen vrátí plán.
- V Nastavení nefungovalo žádné tlačítko: klik spolkla hned první podmínka obsluhy, protože `[data-appearance]` nese i kořenové `<html>` a `closest()` k němu dolezl. „Jak propojit“, „Načíst znovu“, „Poslat zkušební“ ani odebrání licence a klíčů tak nic nedělaly – a v tmavém režimu klik navíc potichu přepnul vzhled na světlý. Podmínka teď míří jen na tlačítka volby vzhledu.
- „Jak propojit“ u webových zdrojů skutečně vede k cíli: odroluje na kartu rozšíření, krátce ji zvýrazní a přesune fokus na první krok. Místo odkazu bez obrysu je z něj plnohodnotné tlačítko.
- Router při přepnutí obrazovky vyměňuje uzel `#view` za čistou kopii, takže posluchače předchozího pohledu zmizí. Dosud se hromadily a po N návštěvách se jedna akce provedla N× – stejná příčina jako u nezavíratelných dialogů na Útratě, teď vyřešená pro všechny obrazovky naráz.

- Dlaždice výběru vzhledu (Světlý / Tmavý / Podle systému) mají stejný vnitřní okraj nahoře i dole; pevná minimální výška je pryč, obsah se svisle vystředí.
- Dialog projektu: „Barva“ už nezasahuje do pole Popis. Skupina barev je místo `fieldset` s `legend` (kde prohlížeč ignoruje horní okraj) běžný podnadpis a `role="radiogroup"` s popiskem, takže odstup odpovídá zbytku formuláře.
- Limity Claude (5 h a týden) zůstávají aktuální, i když zrovna neběží žádná konverzace. Agenteeq je bere ze záložního zdroje – historie vytížení plánu, kterou si sama zapisuje aplikace Claude Desktop. Přesná data ze stavového řádku Claude Code mají dál přednost a záloha se skryje, jakmile dorazí. Formát souboru je interní a nezdokumentovaný, proto 🧪 Beta.
- Extra usage z téhož zdroje se zobrazí jen jako číslo a s poznámkou, že zdroj neuvádí jednotku – Agenteeq z něj nedělá procenta ani koruny.
- Útrata: dialogy „Přidat výdaj“ a „Měsíční rozpočty“ jde zavřít křížkem, kliknutím mimo i Escapem. Posluchač kliknutí se přidával na trvalý uzel `#view` při každém vstupu na stránku a nikdy se neodebíral, takže jeden klik otevřel tolik dialogů, kolik bylo návštěv – zavřený jen odhalil identický pod sebou.
- Nastavení: skok na sekci je plynulý. Lišta záložek se posouvá vlastním `scrollLeft` místo `scrollIntoView`, které rozhýbalo i rolování stránky, a po dobu rolování nepřepisuje aktivní záložku sledovač viditelnosti. Respektuje omezení pohybu v systému.
- Ikony a fonty už neproblikávají: loga, fonty a brand se servírují s trvalou cache (dosud `no-cache`, tedy revalidace u každého překreslení) a obrázky se dekódují synchronně.
- Agenti: zdroj je nadřazený filtr nad projekty – po přepnutí na Cloud ukazují nulu i počty u projektů, ne jen seznam.
- Sledování procesů: vnitřní `codex app-server`, který si spouští aplikace ChatGPT, se už nepočítá jako samostatný Codex CLI. ChatGPT je detekovaný samostatně.
- Kolekce profilových obrázků má 29 variant: přepracované #1, #2, #5 a #6 (u #6 se kvůli neplatnému oblouku dosud nevykreslil srpek vůbec) a pět nových – kompas, mozaika, rytmus, planeta s prstencem a papírový drak.

## Přehlednější seznam agentů a pravdivá útrata – 2026-09-11

- Seznam agentů u každé konverzace ukazuje, kde běží: ikona notebooku pro tento Mac, ikona mraku pro webové aplikace. Stejné ikony má filtr zdroje; podrobnosti o službě zůstávají na stránce agenta.
- Automatické kontroly Codexu (`guardian_review`) a pomocní agenti se už nezobrazují jako samostatní agenti s názvem složky (dříve např. 9× „POKORNY DESIGN“). Patří k rodičovské konverzaci podle `parent_thread_id`, její detail ukazuje jejich počet a tokeny; ve statistikách a útratě se tokeny dál počítají a vlastní upozornění neposílají.
- Plánovaná úloha je v seznamu agentů jedním řádkem s počtem spuštění (dříve 47× uživatelské jméno). Název „Plánovaná úloha · <název>“ pochází ze značky `<scheduled-task>`; jednotlivá spuštění se dál započítávají do tokenů a statistik.
- Přepis na detailu agenta nekrade kolečko myši: posouvá se celá stránka, přepis až po kliknutí nebo tabulátoru; Esc nebo kliknutí mimo ho uvolní.
- Tmavý režim: monochromatická loga (OpenAI, GitHub Copilot, Grok, Cursor, Ollama, LM Studio) mají podle brand manuálů bílou variantu, kontrast 1,29 : 1 → 16,23 : 1. Barevná loga beze změny.
- Útrata: čerpání dokoupeného extra usage Claude ze stavového řádku (`rate_limits.spend_limit`). Dokoupení kreditů Codexu se slučuje, takže jedno dokoupení se už nepočítá několikrát (na reálných datech 22 → 10), a zobrazí se seznam s datem a částkou.

## Stabilita ovládání – 2026-09-11

- Nastavení se na širokých desktopových oknech vycentruje podle skutečné osy aplikace, zatímco navigace zůstává čitelně po ruce.
- Modal „Měsíční rozpočty“ se spolehlivě zavře křížkem, kliknutím mimo dialog i klávesou Esc; click už nemůže propadnout do stránky pod overlayem a fokus se vrací na prvek, který dialog otevřel, i ve WebKitu.
- Rychlé hledání při hoveru už nepřekresluje celý seznam a volba modelu ve spouštěči nepřestavuje celý ovládací pás – obě interakce zůstávají plynulé bez blikání a ztráty fokusu.

## Vzhled a vývojový standard – 2026-09-11

- Přidaný plnohodnotný tmavý režim se třemi volbami v Nastavení: výchozí Světlý, Tmavý a Podle systému. Volba se trvale ukládá na tomto Macu, před prvním vykreslením neblikne opačný režim a synchronizuje i nativní chrome macOS.
- Dark mode používá vlastní kontrastní tokeny namísto inverze; automatická browser QA měří AA kontrast textových a stavových kombinací v Chromiu i WebKitu.
- Kolekce lokálních abstraktních SVG profilových obrázků má 24 variant (dvojnásobek), bez externích požadavků a bez změny existujících indexů.
- Přidaný `docs/PRODUCT-AND-ARCHITECTURE.md`: produktový kompas, systém pravdivosti dat, UX/UI a theme contract, architektura, vývojový protokol a releasová brána.

## Vylepšení desktopu – 2026-09-11

- Nastavení ukazuje samostatný stav všech osmi webových zdrojů rozšíření, včetně Perplexity a Groku; žádný z nich se neoznačuje za připojený před prvními skutečnými daty.
- Paleta vyhledávání reaguje na ukazatel myši, zkratka pro spuštění agenta má čitelný kontrast a posuvníky používají jemný vzhled Agenteeq.

## 0.6.0 – 2026-09-11

- Samostatná macOS aplikace: Swift/AppKit, WKWebView, přibalený Node, Retina ikona s původním logem na bílé ploše, menu a klávesové zkratky, Dock/menubar, nativní export a oznámení s návratem do konverzace.
- Čtyřkrokový první průvodce, trvalé dokončení, opakování v Nastavení/Nápovědě, animace respektující omezení pohybu.
- Vlastní rozbalovací nabídky v designu Agenteeq, klávesnice, fokus, formulářové hodnoty a chybové stavy. Lokální fonty včetně českých sad a licencí; CSP povoluje písma jen z vlastního originu.
- Lifecycle: atomický single-instance zámek, vlastnictví serveru, úklid při EOF/SIGTERM/SIGINT i pádu rodiče, omezená obnova po pádu, čekání při rychlém restartu, bezpečné převzetí ověřené starší CLI instance, cizí proces se neukončuje. Port se získá před přístupem ke sdíleným datům.
- Desktop nespouští druhý CLI LaunchAgent ani service worker. Upozornění přicházejí přímo ze služby i při zavřeném okně.

## 0.5.0 – 2026-09-11

### Přidáno
- **Projekty:** konverzace ze všech služeb seřazené podle klientů a zakázek. Automatické zařazení podle složky (nejdelší shoda, i podsložky), ruční zařazení libovolné konverzace včetně webových chatů, „mimo projekty“, přetažení řádku na projekt, hromadný výběr v Agentech, filtr podle projektu. Detail projektu: KPI, stav a tokeny, brief s automatickým ukládáním, složky, tokeny podle služby, archiv, export do CSV (Excel/Numbers, ochrana proti vzorcům). Konverzace zůstávají v projektu i po vypadnutí z 30denního okna (snímky). Návrhy projektů ze složek, kde agenti pracují.
- **Spustit agenta** v Přehledu: Claude Code (Terminál s ID session, pozadí s oprávněním), Codex (aplikace s předvyplněným zadáním, Terminál, pozadí se sandboxem), Gemini CLI a Qwen Code (Terminál), webové služby (zadání v odkazu i ve schránce), lokální modely v Ollamě s odpovědí přímo v Agenteeq. Volba projektu a složky (vestavěný prohlížeč složek), připojení briefu, přehled běhů na pozadí s logem a zastavením. Zadání nikdy není součástí příkazu (soubor 0600 / argv).
- **Licence:** offline Ed25519 klíče (`scripts/license.mjs`), tarify Zdarma / Pro / Team, připravené zamykání funkcí (`PAID_FEATURES`, dnes vše odemčené), sekce Licence v Nastavení.
- **Sdílení a instalace pro další uživatele:** `npm run pack`, `npm run smoke` (ověří nainstalovaný balíček), `agenteeq --open`, návod `docs/INSTALL.md`, sekce v Nastavení.
- Průvodce prvním nastavením v Přehledu, automatické spouštění po přihlášení zapínatelné z Nastavení, ⌘K: projekty, „Spustit agenta“, „Nový projekt“.

### Změněno
- **Mobilní navigace:** spodní lišta má 5 cílů (Přehled, Agenti, Spustit agenta, Projekty, Více) místo 7; Statistiky, Útrata, Upozornění a Nastavení jsou v panelu Více (s počtem nepřečtených upozornění). Větší dotykové plochy a respektování bezpečné zóny iPhonu.
- Mobil: opraveno přetékání návodu v Nastavení, lámání nadpisů karet, cesty ke složce a řádků konverzací v detailu projektu.
- LaunchAgent restartuje Agenteeq jen po pádu; když už Agenteeq běží, druhá instance se v klidu ukončí.
- Příkaz pro automatické spouštění se v Nastavení skládá podle skutečné instalace (dřív pevná cesta `~/agenteeq`).

## 0.4.0 – 2026-09-10

### Změněno
- **Nový název Agenteeq** v celém projektu: aplikace, rozšíření, CLI (`bin/agenteeq.mjs`), balíček, proměnné prostředí (`AGENTEEQ_*`), hlavičky API (`X-Agenteeq`, `X-Agenteeq-Token`), LaunchAgent `cz.agenteeq.agent`, Klíčenka `cz.agenteeq.*`, složka projektu a repozitář.
- **Nové logo:** mosazný kořen (ty) a tři uzly agentů spojené větvemi; favicon a značka v rozšíření.
- Ze scény v hlavičce odstraněny linky a zlatá křivka; body aktivních agentů zůstávají.

### Migrace
- Data aplikace se ukládají do `~/.agenteeq`. Při prvním spuštění se `~/.dirigent/data.json` jednou zkopíruje (upozornění, výdaje, rozpočty, nastavení, token); původní soubor zůstane beze změny.

## 0.3.0 – 2026-09-10

### Přidáno
- **Otevřít v aplikaci:** vlákno Codexu přímo v aplikaci ChatGPT (`codex://threads/<id>`), aplikace Claude, projekt v Cursoru a VS Code, webová konverzace v prohlížeči. **Pokračovat v Terminálu** otevře Terminál s `claude --resume <id>` (resp. `codex resume`, `copilot --resume`, pokud je CLI v PATH). **Otevřít složku** ve Finderu. Nabídku akcí počítá server podle nainstalovaných aplikací.
- Oficiální loga služeb (Claude, Codex, ChatGPT, Gemini, GitHub Copilot, Microsoft Copilot, Perplexity, Grok, Qwen, Cursor, Ollama, LM Studio) z `@lobehub/icons-static-svg` 1.95.0 (MIT).
- Vlastní vizuální identita „koncertní sál“: ebenová scéna s notovou osnovou (každý aktivní agent je nota – smaragdová pracuje, sametová potřebuje tebe), tmavá hlavní karta, mosazné akcenty, jemná zrnitost.

### Změněno
- Paleta: samet `#C2335A`, smaragd `#22A38C`, mosaz `#C99A3E`, eben `#121019`, mlžná slonovina `#F4F3F7`; barvy poskytovatelů podle jejich značek.
- Kopírování příkazu je jen doplňková ikona; hlavní akcí je otevření.

## 0.2.0 – 2026-09-10

První verze k reálnému testování.

### Přidáno
- Realtime architektura: souborové watchery s inkrementálním čtením, SSE stream, přehodnocení stavů každých 5 s, pojistný průchod každých 10 s.
- Konektory: Claude Code / Claude Desktop Code, Codex (ChatGPT app, CLI, VS Code; názvy vláken z aplikace), Cursor, GitHub Copilot ve VS Code a CLI, Gemini CLI, Qwen Code, procesy AI aplikací a Ollama, náklady z Admin API OpenAI a Anthropic.
- Claude Code hooky pro okamžité události (instalace ze Nastavení, záloha, odinstalace).
- Rozšíření Chrome pro ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat a GitHub Copilot (beta).
- Upozornění: potřebuje rozhodnutí, limity (80/95/100 %), rozpočty (80/100 %), dokončené dlouhé úlohy; notifikace macOS a prohlížeče; centrum upozornění.
- Útrata: výdaje, opakované platby, rozpočty, prognóza, převody měn, historie kreditů Codexu.
- Obrazovky: Přehled s „Dnešní směnou“, Agenti, Detail agenta s živým přepisem, Statistiky (heatmapa, podíly, projekty, modely, limity), Útrata, Upozornění, Nastavení.
- Automatický start po přihlášení (`install-agent`).
- 32 automatických testů, dokumentace pro agentický vývoj.

### Opraveno (během ověření)
- Falešné upozornění „dokončil úlohu“ při dlouhém generování bez zápisu do přepisu.
- Projekt session se měnil podle `cd` během práce agenta – nyní platí složka, ve které session začala.
- Počet u konektorů odpovídá viditelným sessions, ne počtu souborů na disku.

### Změněno
- Prototyp v0.1 (jediný `server.mjs` a ukázková data) nahrazen modulární architekturou; ukázková data odstraněna.

## 0.1.0 – 2026-09-10

- Klikatelný prototyp: přehled, seznam agentů, spotřeba, konektory; lokální čtení Claude Code a Codexu; ukázková data.
# Opravy desktopu – 2026-09-11

- Přehled při rychlých živých datech aktualizuje jen dotčené části; časová osa se nepřekresluje pro každý tokenový přírůstek a graf má omezenou obnovovací frekvenci.
- Otevřený výběr projektu drží nad obsahem vlastní vrstvu bez kolidujícího tmavého obrysu zdrojového ovládacího prvku.
- Bílé plochy grafu tokenů, klidového stavu a nezařazených konverzací podle tokenu `--card`.
- Bezpečné odsazení a ořez dlouhých názvů ve vlastních nabídkách; oddělené popisky limitových grafů.
- Nativní ukládání klíčů bez argv, zákaz přesměrování Admin API, omezení SSE a ochrana poškozené databáze.
- Dashboard nyní označuje lokálně zpracované tokeny přesněji; nejde o cenu ani limit předplatného. Rozšíření Chrome se páruje jednorázovým 10minutovým kódem místo vydání tokenu podle obecného původu rozšíření.
- Regresní ověření v Chromiu/WebKitu a nativní Klíčence. Podmínky veřejné distribuce v `docs/SECURITY.md`.
