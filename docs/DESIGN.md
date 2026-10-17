# Design systém

Jeden systém pro všechny produkty: aplikaci (`public/`), web (`site/`), okno rozšíření pro Chrome
(`extension/`) a podklady pro obchod (`branding/chrome-web-store/`). Hodnoty žijí v tokenech
`public/styles.css :root`. Web a rozšíření je opisují a shodu hlídají testy. Komponenta si nesmí
zavést vlastní odstín, zaoblení, výšku ani stín, dokud je nepřidá do tokenů a do tohoto dokumentu.

Identita, barvy a písmo popisuje `AGENTS.md` (oddíl Design). Tady jsou pravidla tvaru a ovládacích
prvků, která se nesmí rozjet mezi produkty.

**Jeden tvar pro všechny velikosti:** jediným schváleným masterem je
`public/brand/agenteeq-dock.svg`. Jeho bílá hlava má poměr **78:53**,
oči **8:16**, poloměr hlavy **20** a anténa leží na ose **x=54**. Ikona
v Docku, značka na webu, Chrome rozšíření i macOS menu bar se zmenšují
**uniformním měřítkem**: žádná samostatně překreslená „menší hlava“, žádná
deformace poměru stran. Menu bar a transparentní značka používají stejnou
geometrii bez podkladové dlaždice.
Velká ikona aplikace v macOS **Docku** používá schválený filled
logomark: samostatnou bílou hlavu s jednou bílou anténou, dvěma tmavými
kapslovými očima, bez těla. Zakázaná celotělová varianta Scout se pro Dock
nepoužívá. Oficiální SVG master pro Dock je `public/brand/agenteeq-dock.svg`; transparentní varianta bez dlaždice je `public/brand/agenteeq-dock-transparent.svg`. Jejich rozměry jsou odvozené ze stejných souřadnic jako Swift generátor. Nativní vektor generuje `desktop/Icon.swift`, nikoli historická
binární ikona `desktop/Agenteeq.icns`. Motiv trojzubce i fialová anténa jsou
zakázané. Zdrojové logo zůstává oddělené pro malé plochy menu baru.

## Písmo Satoshi a licence

Satoshi (Indian Type Foundry, ITF Free Font License 2.0) smí být vložené do aplikace, rozšíření a na vlastní web, ale nesmí ležet ve veřejném repozitáři (§ 02). Soubor proto stahuje `scripts/satoshi.mjs` z Fontshare při sestavení a ověří ho podle SHA-256; bez souboru se sází Onest a server pravidlo `@font-face` vůbec nepošle. Soubor se nesmí upravovat ani převádět (žádné subsetování).

## Žádné částečné obrysy

Výslovný požadavek vlastníka: nepoužívat jednostranné barevné okraje ani částečné obrysy kolem karet, bannerů, upozornění či aktivních položek. Platí i pro jejich imitaci pomocí inset box-shadow nebo pseudo-elementu. Stav vyjadřovat jemnou plochou, ikonou a textem; případný obrys musí být rovnoměrný po celém obvodu. Běžné oddělovače dat a viditelný obrys klávesnicového fokusu zůstávají.

## Tvary

| Co | Tvar | Token |
|---|---|---|
| Tlačítko, odkazové tlačítko, čip, filtr, segmentová volba, záložka | kapsle | `--r-full` |
| Jednořádkové pole, výběr, vyhledávání, rozbalovací řádek (`summary`) | kapsle | `--r-full` |
| Položka navigace a nabídky, přepínač, štítek, odznak, klávesa (`kbd`) | kapsle | `--r-full` |
| Ukazatel průběhu a jeho výplň | kapsle | `--r-full` |
| Ikonové tlačítko, avatar, bod stavu | kruh | `50%` |
| Karta, dialog, nabídka, oznámení | zaoblená plocha | `--r-lg` (24 px) |
| Vnořená karta, řádek seznamu, víceřádkové pole | zaoblená plocha | `--r-md` (16 px) |
| Bublina nápovědy, blok kódu, drobná vnitřní plocha | zaoblená plocha | `--r-sm` (12 px) |
| Dlaždice s logem služby nebo projektu | zaoblený čtverec | `--r-logo` (28 % strany) |
| Kód v textu, obrys zaostření kolem odkazu v textu | jemné zaoblení | `--r-xs` (6 px) |
| Okno aplikace | zaoblená plocha | `--r-xl` (40 px) |

Pravidlo jednou větou: **všechno, na co se klepe a má jeden řádek, je kapsle.** Plochy mají
zaoblení podle hloubky vnoření a nic nemá ostré rohy.

Výjimky, které jsou záměrné:

- **Zaškrtávací políčko** je zaoblený čtverec (`--r-xs`). Kulaté políčko by se pletlo s přepínačem
  jedné volby.
- **Řádek seznamu, který může mít dva řádky** (volba projektu, výběr konverzace), drží `--r-md`
  i ve chvíli, kdy se vejde na jeden. Všechny položky jednoho seznamu tak vypadají stejně.
- **Grafy** (sloupce, buňky teplotní mapy, značky na časové ose) mají vlastní drobná zaoblení.
  Nejsou to ovládací prvky.

Obrys zaostření kopíruje tvar prvku. Globální pravidlo `:focus-visible` proto zaoblení nenastavuje,
jinak by se kapsle při ovládání klávesnicí přepnula na jiný tvar.

## Tlačítka

**Velikosti.** Jedna stupnice pro celý systém. Pole, výběry a segmentové volby mají stejnou výšku
jako tlačítko vedle nich.

| Velikost | Výška | Písmo | Kde |
|---|---|---|---|
| malé | 32 px | 13 px | lišty nad seznamy, ovládání pod polem pro zadání, `.btn--sm` |
| základ | 40 px | 14 px | aplikace, rozšíření, pole a výběry |
| velké | 48 px | 15 px | web (základ), hlavní akce v dialogu |
| výzva | 56 px | 17 px | jen hlavní výzva na webu (`.btn--lg`) |

Segmentová volba počítá výšku i s rámem: základní má 40 px (tlačítka 32 px a rám 4 px), malá 32 px
(tlačítka 28 px a rám 2 px – `.seg--sm` v aplikaci, přepínač jazyka `.lang` na webu). Vnitřních
28 px smí být jen uvnitř takového rámu. Volba jedné ze dvou (třeba jazyk v Nastavení) je taky
segmentová volba: kapsle 40 px, ne karta. Přepínač má 48 × 28 px, v okně rozšíření malou velikost
40 × 24 px. Tvar (kapsle) a barva zapnutého stavu (`--action`) jsou všude stejné.

**Popisek** je vždy Satoshi 500, věta s malými písmeny, sloveso, které říká, co se stane. Řez se při
výběru nemění: vybraná volba se pozná podle plochy, ne podle tučnějšího písma, které by text
posunulo. Totéž platí pro menu Nastavení, které je z tlačítek: Satoshi 500 ve všech stavech.

**Položka navigace a nabídky** (postranní panel, spodní lišta na telefonu, paleta příkazů, panel
Více) tlačítko není – je to řádek seznamu míst a má Satoshi 400 jako ostatní text v seznamu. I tady
jeden řez pro všechny stavy: aktivní stránku ukazuje skleněná plocha s bílou hranou a barva textu (žádný boční proužek). Položka
postranního panelu má výšku ze stupnice: 40 px, na nejnižším okně 32 px, na monitoru na výšku 48 px
(dlaždice spodní lišty na telefonu má ikonu nad popiskem, není jednořádková).

**Postranní panel** se skládá ze značky, profilu, navigace a patičky. Navigace se nikdy nezmenší
ani neroluje – místo na nízkém okně uvolňuje profil. Ten si podobu (vysoký, střední, v řádku, na
jednom řádku) vybírá podle místa, které mu v panelu skutečně zbylo (`@container`), ne podle výšky
okna; výška okna jen určuje, kterou podobu panel chce. Když místo chybí – jiné měření písma
v jiném prohlížeči, delší patička –, profil zvolí menší podobu, a když není místo ani na jeden
řádek, schová se celý. Nikdy se neořízne napůl. Řádky profilu a patičky jsou jednořádkové
(dlouhé se zkrátí), aby výška panelu nezávisela na jménu ani na počtu zdrojů.

**Varianty.**

| Varianta | Plocha | Použití |
|---|---|---|
| hlavní | `--action`, text `--on-action` | jedna hlavní akce v místě |
| vedlejší | karta s vlasovou linkou | ostatní akce |
| tiché | bez plochy, plocha až při najetí | akce v řádku, ikonová tlačítka |
| nebezpečné | `--velvet-solid`, bílý text | mazání a odvolání |
| odkaz | text s podtržením | pomocná akce uvnitř věty |

**Stavy.** Najetí změní plochu nebo linku (nikdy tvar), stisk zmenší tlačítko na 98 %, zakázané
tlačítko má průhlednost 55 % a kurzor „nelze“. Zaostření z klávesnice ukazuje obrys 2 px.

## Rozestupy v Nastavení

Dialog vzhledu konkrétního agenta používá pro každou skupinu voleb celou šířku. Na širokém okně jsou podoby a barvy ve čtyřech sloupcích, doplňky v pěti; na telefonu ve dvou a třech. Ikona i popisek leží uvnitř jedné kapsle vysoké alespoň 72 px. Obecná třísloupcová mřížka nastavení se na tyto skupiny nesmí použít.

Lepivá horní lišta a podmenu Nastavení se odvozují z `--main-top` (horní odsazení `.main`, které
si každý režim – web, macOS okno, telefon, Koncert – nastaví sám). Žádné jiné číslo: lišta, která
se lepí níž, než kde v toku stojí, při otevření sjede přes první kartu. Na užších oknech, kde je
lišta neprůhledná, kryje pás nad ní stín v barvě papíru. Dvě nezávislé volby pod sebou (kanál
a způsob aktualizací) mají každá viditelný popisek a mezi skupinami 24 px – víc než 10 px mezi
kartami uvnitř skupiny, takže se obrysy vybraných karet nikdy nedotknou.

## Okno rozšíření (schváleno 14. 10. 2026)

Vlastník vybral směr „Jedna hlavní věc“ (scéna) s prvky ze směrů „Všechny AI na dlani“ a „Živá
značka“. Závazná podoba `extension/popup.html`:

- **Žádné velké číslo.** Počty jen drobně: stránkování reflektoru, počty ve skupinách, souhrnná věta.
- **Hlavička 56 px** stojí, roluje jen zbytek: značka „Agenteeq ↗“ je odkaz, který otevírá aplikaci
  (jediné místo s touto akcí; bez běžící aplikace jen značka), kapsle stavu spojení, kruhová obnova
  a kruh Sledované služby a port. **Pata není** – vlastník 14. 10. 2026: druhé „Otevřít Agenteeq“
  vedle „Otevřít v Agenteeq“ bylo matoucí. Ověření stránky je kapsle u řádku aktuální karty. Dvě
  viditelná ovládání nikdy nenesou stejný nebo podobný popisek (hlídá qa-extension). Okno má
  380 × 600 px; obsah na spodním okraji se rozplyne maskou.
- **Reflektor:** skleněná karta `--r-lg` se září v pigmentu stavu (růže = potřebuje tě / selhalo,
  okr = limit, šalvěj = pracuje, mlha = klid). Pořadí: rozhodnutí → pracující agent → odpovídající chat
  v jiné kartě → nezjištěno → klid. Víc rozhodnutí = stránkování se skutečným počtem a šipkami
  (←/→, tah); nová položka jen tečka na šipce, okno nikdy samo nepřeskočí. Akce říká pravdu:
  „Otevřít konverzaci“ (focus-agent otevře tu konverzaci v aplikaci), u chatu „Přepnout na kartu“ –
  nikdy „Rozhodnout“.
- **Co se děje:** filtr Vše · Agenti · Chaty (kapsle 32 px), skupiny Teď / Dnes / Dříve, řádek
  `--r-md` s dlaždicí loga (`--r-logo`) a tečkou stavu, název, „nástroj · činnost“ v `*-ink`
  pigmentu, čas vpravo. Stav se v řádcích neopakuje jako štítek – nese ho skupina a barva činnosti.
- **Pravdivé stavy:** nezjištěný výpis procesů i nedostupná aplikace = „nezjištěno“, nikdy nula.
  Bez aplikace jedna hlavní výzva (Stáhnout) a chaty, které rozšíření vidí samo. Aplikace běží, ale
  ověření selže = „Nepodařilo se ověřit spojení s Agenteeq“, nikdy „neběží“ ani „nespárováno“.
- **Pohyb:** stisk do 90 ms, nástup po částech, FLIP při filtru, podsvícení nové položky, záře mezi
  stavy přes `@property`. Smyčkou se smí hýbat jen tečka „pracuje“. `prefers-reduced-motion` vypne vše.

## Kontrola

- `npm run qa:tvary` projde vykreslenou aplikaci (všechny obrazovky, 1440 i 375 px, paletu příkazů
  a upozornění), web a okno rozšíření a změří tvar každého ovládacího prvku. Stejným průchodem
  změří, že jednořádkový ovládací prvek s vlastní plochou má výšku ze stupnice (32 / 40 / 48 px;
  výjimky jsou jen vnitřních 28 px malé segmentové volby a výzva webu 56 px) a že vybraná volba
  má stejný řez písma jako nevybraná vedle ní. Kruhy (avatar, ikonové tlačítko) a prvky uvnitř
  věty do stupnice nepatří. Porušení pravidla shodí CI.
- `npm run qa:desktop-inset` v Chromiu a WebKitu simuluje `is-desktop` z WKWebView a měří,
  že nadpis i akce na Přehledu, Agentech a v Nastavení zůstávají pod 44px nativním pruhem.
  Na šířkách 900–1440 px začínají stejně vysoko jako levý panel; při 880 px a méně
  se navigace přesouvá dolů a hlavní obsah zůstává mimo horní pruh. V Nastavení navíc měří, že se
  lepivý nadpis při otevření neposune (lepí se na `--main-top`, tedy přesně tam, kde v toku stojí),
  že žádná karta nezasahuje pod akce vpravo nahoře a že dvě skupiny voleb v Aktualizacích mají
  mezi sebou aspoň 16 px. Výstupem jsou i snímky.
  `npm run qa:native` navíc změří tytéž souřadnice v běžící macOS aplikaci přes sondu WKWebView,
  i když je nad Přehledem otevřený úvodní průvodce.
- `npm run qa:desktop` ověří postranní panel na oknech 620–1200 px vysokých při šířce 881, 1180
  a 1440 px, česky i anglicky, i s patičkou při výpadku spojení, s víc zdroji tokenů, než se
  vypisuje, a s patičkou uměle vyšší o 48 px: poslední položka navigace je celá vidět, nabídka
  neroluje a profil není oříznutý (smí se jen přeskládat nebo schovat). Měří se až v ustáleném
  stavu po změně velikosti okna, ne po pevném čekání.
- `npm run qa:contrast` měří kontrast textů podle WCAG 2.2 AA na téže ploše; v okně rozšíření i po posunu na konec osy a s otevřenými listy.

## Typografie Satoshi a maskot (od 0.41.0)

`public/refinement.css` sjednocuje role: 12 px pomocné údaje, 14 px kompaktní ovládání,
16 px běžný text, 18 px zvýrazněný text, 20 px nadpis karty, 24 px sekce,
32 px titul stránky a až 48 px úvodní nadpis. Hodnoty jsou v rem; řádkování
1,5–1,6 u textu, 1,35–1,4 u malých nadpisů a 1,15–1,2 u velkých.
Satoshi 400 je základ, 500 zvýraznění. Běžný text má tracking 0 a zapnutý
kerning. Velké nadpisy −0,025 až −0,035 em; wordmark 18 px / 500 / +0,045 em.
Číselné přehledy používají tabulární číslice. Mezery vycházejí z 4px základu.

Pohyb maskota řídí `public/js/mascot-motion.js` (oči) a `public/refinement.css` (stavy).
Rozhodnutí vlastníka 8. 10. 2026: roboti se hýbou podle stavu agenta, tělo nikdy nelétá ani
neposkakuje. Pracuje: anténa pulzuje, paže „píšou“. Potřebuje tebe: zvednutá ruka, krátké
zamávání každých 5 s. Čeká a nečinný: přimhouřené oči. Selhalo a limit: svěšená anténa,
ztlumené oči. Oči sledují kurzor nejvýš ±3 px vodorovně a ±2 px svisle; občasné mrknutí
trvá 180 ms, po 8–14 sekundách mrkne jeden viditelný robot.
Systémové omezení pohybu má přednost, ruční vypnutí se ukládá lokálně.
Pohyb není jediným nositelem stavu a robot nevydává zvuky.

Ověření jednotlivých pravidel přístupnosti není certifikace celé aplikace:
kontrolujeme reflow, text-spacing, kontrast textových tokenů, fokus a omezení pohybu.

## Vzhled konkrétního agenta – rozhodnutí z živého testování 14. 10. 2026

Uživatel mění vzhled **v detailu právě otevřeného agenta**, nikoli v Přehledu pomocí dlouhého seznamu všech agentů. Identita upravované konverzace je pevně daná jejím ID. V Přehledu se nastavení pouze zobrazuje; změna nezasahuje do práv, chování, modelu ani dat agenta.

Editor je vlastní modální dialog s tlačítkovými kapslemi o výšce 48 px, stavem `aria-pressed`, čitelným minimálně 12px textem a zřetelným fokusem; systémové `<select>` se v něm nepoužívají. Kromě jména, barev a čtyř základních siluet nabízí nepovinné vektorové doplňky (čepici, brýle, tričko a skafandr). Každý doplněk žije ve shodném `viewBox="0 0 108 112"`; značka v Docku ani oficiální logo se nikdy nekustomizují. Uložení zachová původní lokální klíč `agenteeq:agent-personas:v1` a přidává jen volitelné pole `accessory`. Chybné hodnoty se ignorují. Klávesnice/Escape, dlouhé jméno, české a anglické UI, 375px viewport a snížený pohyb patří do QA; živé vizuální schválení nelze nahradit pouze jednotkovým testem.

**Stav:** implementováno ve zdroji v PR #261, nikoli dosud schváleno pro vydání.
