# Design systém

Jeden systém pro všechny produkty: aplikaci (`public/`), web (`site/`), okno rozšíření pro Chrome
(`extension/`) a podklady pro obchod (`branding/chrome-web-store/`). Hodnoty žijí v tokenech
`public/styles.css :root`. Web a rozšíření je opisují a shodu hlídají testy. Komponenta si nesmí
zavést vlastní odstín, zaoblení, výšku ani stín, dokud je nepřidá do tokenů a do tohoto dokumentu.

Identita, barvy a písmo popisuje `AGENTS.md` (oddíl Design). Tady jsou pravidla tvaru a ovládacích
prvků, která se nesmí rozjet mezi produkty.

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

Segmentová volba počítá výšku i s rámem: základní má 40 px (tlačítka 32 px a rám 4 px), malá 32 px.
Přepínač má 48 × 28 px, v okně rozšíření malou velikost 40 × 24 px. Tvar (kapsle) a barva zapnutého
stavu (`--action`) jsou všude stejné.

**Popisek** je vždy Onest 500, věta s malými písmeny, sloveso, které říká, co se stane. Řez se při
výběru nemění: vybraná volba se pozná podle plochy, ne podle tučnějšího písma, které by text
posunulo.

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

## Kontrola

- `npm run qa:tvary` projde vykreslenou aplikaci (všechny obrazovky, 1440 i 375 px, paletu příkazů
  a upozornění), web a okno rozšíření a změří tvar každého ovládacího prvku. Porušení pravidla
  shodí CI.
- `npm run qa:contrast` měří kontrast textů podle WCAG 2.2 AA na téže ploše.
