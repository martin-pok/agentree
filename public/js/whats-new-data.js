// Co je nového – lidsky, česky, z pohledu uživatele. Každé vydání sem MUSÍ přidat záznam
// (hlídá test/whats-new.test.mjs), jinak uživatel neví, co se v aplikaci změnilo.
export const RELEASES = [
  {
    version: '0.27.0',
    date: '2026-09-25',
    title: 'Útratu si stáhneš do tabulky',
    items: [
      'V Útratě u Výdajů je nové tlačítko „Export CSV“. Stáhne posledních 12 měsíců – každé předplatné v každém měsíci, kdy běželo, takže součty sedí s tím, co vidíš v aplikaci.',
      'U každé platby je původní částka, kurz i přepočet do měny, kterou máš v aplikaci, aby šel převod zkontrolovat. Soubor otevřeš rovnou v Excelu nebo Numbers.',
    ],
  },
  {
    version: '0.26.0',
    date: '2026-09-25',
    title: 'Rozšíření ukáže, jestli službu čte správně',
    extension: true,
    items: [
      'V okně rozšíření na stránce ChatGPT, Gemini, Claude.ai a dalších klikni na „Ověřit tuto stránku“. Uvidíš, co rozšíření na stránce našlo: konverzaci, pole pro zadání, počty zpráv a jestli zachytilo, že agent pracoval a skončil.',
      'Když něco nesedí, klikni na „Nesedí“ a ulož vzorek stránky. Je to jen stavba stránky bez textu zpráv, názvů a odkazů – podle něj se rozšíření opraví.',
    ],
  },
  {
    version: '0.25.0',
    date: '2026-09-24',
    title: 'Účet Agenteeq a modely napojené jedním klikem',
    extension: true,
    items: [
      'Rozšíření pro Chrome je potřeba jednou spárovat znovu: v Nastavení vytvoř jednorázový kód a vlož ho do rozšíření. Dosavadní spojení přestalo platit.',
      'Při spárování dostane každý prohlížeč vlastní přístupový klíč, který platí jen pro něj. Dřív rozšíření sdílelo klíč s propojením Claude Code, takže kdo ho získal, mohl podvrhnout i upozornění z Claude Code.',
      'Nové spárování starý klíč téhož prohlížeče zneplatní a ostatní prohlížeče nechá připojené. Na disku se ukládá jen otisk klíče, ne klíč samotný.',
      'Modely napojíš jedním klikem v Nastavení → Propojení → Napojené modely. Přihlásíš se přímo u Anthropicu nebo OpenAI a Agenteeq sám pozná, až je hotovo.',
      'Rozšíření pro Chrome už z webových chatů nebere text ani názvy konverzací – jen jestli agent pracuje, nebo čeká.',
      'Souhrny ze všech svých Maců uvidíš i na webu: agentree-fawn.vercel.app/app?ucet. Stačí se přihlásit stejným účtem Google.',
      'Po přihlášení si můžeš zapnout synchronizaci souhrnů: tokeny, útrata, limity a počty agentů. Co přesně odchází, uvidíš v kartě účtu. Vypnutím se souhrny z účtu smažou.',
      'Nově se můžeš přihlásit přes Google v Nastavení → Účet a vzhled. Z Googlu si Agenteeq vezme jen jméno a e-mail; konverzace a kód zůstávají na tvém Macu. Bez účtu funguje všechno jako dřív.',
      'Přehled, Projekty a Útrata se při otevření plynule rozsvítí: karty vyjedou, měřidlo rozpočtu se dokreslí a čísla vyjedou na své místo. Jen jednou po otevření, ne při každé změně. Když máš v systému omezený pohyb, ukáže se všechno rovnou.',
    ],
  },
  {
    version: '0.24.0',
    date: '2026-09-22',
    title: 'Čísla v Agenteeq odpovídají zdrojům',
    items: [
      'Tokeny Claude Code už nejsou nadsazené. Když relaci rozdělíš (fork), nový soubor si nese celou historii té původní a Agenteeq ji počítal podruhé – za měsíc to dělalo o 59 % víc, než kolik se spotřebovalo.',
      'Kredity Codexu ukazují skutečný zůstatek. Když došly, Codex hlásil nulu, ale Agenteeq dál ukazoval poslední kladné číslo. Teď je vidět nula i kdy byla zjištěná.',
      'Vyčerpaný limit jednoho modelu už nezmizí jen proto, že v téže relaci odpověděl jiný model. Limit ví, který model narazil.',
      'U limitů i kreditů je vidět, jak starý je údaj. Co je staré, je zvýrazněné, aby se to nečetlo jako stav teď.',
      'Místo „dokoupeno“ stojí „doplněno“: z dat Codexu nejde poznat, jestli se kredity koupily, nebo vrátily. A počítá se jen uvnitř jedné konverzace, takže zmizela doplnění, která ve skutečnosti nebyla.',
    ],
  },
  {
    version: '0.23.1',
    date: '2026-09-22',
    title: 'Grafy v čase říkají pravdu o tom, co je pod kurzorem',
    items: [
      'Kurzor v grafech kreditů a limitů už neuskakuje o dny. Body se ukládají jen v okamžicích změny, takže se dřív hledal „nejbližší bod“ — i když ležel týden jinam. Teď se čte poslední odečet před kurzorem a svislice sleduje kurzor přesně.',
      'Bublina rozlišuje, jestli jsi na skutečném měření („Hodnota“), nebo jestli hodnota jen drží z dřívějška („Poslední známá“ a pod tím, kdy se naměřila).',
      'U zůstatku kreditů je vidět, kdy byl zjištěný. Když je starší než dva dny, zvýrazní se — abys ho nečetl jako stav teď.',
    ],
  },
  {
    version: '0.23.0',
    date: '2026-09-22',
    title: 'Telefon připojíš QR kódem',
    items: [
      'V Nastavení → Otevřít na telefonu je vedle jednorázového kódu i QR. Namíříš na něj foťák a telefon se otevře rovnou spárovaný. Nic neopisuješ — ani adresu, ani číslo.',
      'Kód se z adresy hned smaže, takže nezůstane v historii prohlížeče. Šestimístné číslo je pořád pod QR, když čtečku použít nechceš.',
      'Web Agenteeq má tlačítko Stáhnout a poctivý postup pro první spuštění. Snímky na něm ukazují skutečnou aplikaci, ne nakreslenou atrapu.',
    ],
  },
  {
    version: '0.22.0',
    date: '2026-09-21',
    title: 'Poslední aktivita doplní řádky podle místa',
    items: [
      'Když rozbalíš „Všechny nástroje a služby“, pravý sloupec se prodlouží. Poslední aktivita teď doplní tolik řádků, kolik se pod ni vejde, takže dole nezůstane prázdno. Po sbalení se zase zkrátí.',
      'Banner průvodce má místo barevného přechodu kreslenou žárovku. Je nakreslená čárou v barvě textu, takže drží ve světlém i tmavém režimu.',
    ],
  },
  {
    version: '0.21.1',
    date: '2026-09-21',
    title: 'Průvodce se přizpůsobí tvaru obrazovky',
    items: [
      'Na vysokém okně se průvodce natahoval přes celou obrazovku do úzkého sloupce a vizuál plaval uprostřed prázdna. Teď je to vodorovná karta 920 × 600: obrázek vlevo, text vpravo. Na nízkém okně se stáhne na výšku obrazovky, na telefonu jde obrázek nahoru a text pod něj.',
    ],
  },
  {
    version: '0.21.0',
    date: '2026-09-21',
    title: 'Průvodce je vidět a mluví o dnešních funkcích',
    items: [
      'V Nastavení je místo nenápadného tlačítka banner s barevným pruhem a popisem, co průvodce ukáže.',
      'Průvodce má novou obrazovku o limitech a penězích: okna limitů všech nástrojů, předplatná přepočítaná do korun kurzem ČNB a kalendářní „Dnes“.',
      'Doplněné texty u projektů (logo klienta, vlastní pořadí karet tažením) a u soukromí (klíč okna aplikace, telefon jen pro čtení).',
    ],
  },
  {
    version: '0.20.1',
    date: '2026-09-21',
    title: 'Rolování ve vyhledávání zůstane ve vyhledávání',
    items: [
      'Když jsi ve vyhledávání (⌘K) dojel seznamem na konec, začala se posouvat stránka vzadu. Kolečko teď patří tomu, co je navrchu: seznam si posouvání nechá u sebe a stránka pod překryvem stojí, dokud vyhledávání nezavřeš.',
      'Totéž platí pro upozornění, dialogy, výběr složky i spodní nabídku na telefonu.',
    ],
  },
  {
    version: '0.20.0',
    date: '2026-09-21',
    title: 'Dnes je kalendářní den, karty už neproblikávají',
    items: [
      'Období „Dnes“ počítá od půlnoci. Dosud bylo nejkratší období „24 hodin“, do kterého ráno patřila i noční práce z předchozího dne – proto čísla nesedila s tím, co za dnešek počítáš ty. Obě období jsou teď vedle sebe a přibylo „14 dní“.',
      'Obrázky na kartách projektů zůstanou na místě. Dřív každé překreslení (přetažení karty, příchod živých dat) vyrobilo nový obrázek a pod ním na okamžik prosvitl podkladový přechod.',
      'Vybraná služba ve „Spustit agenta“ měla obrys dvakrát, což na tmavém pozadí vypadalo jako stín. Zůstal jeden.',
      'Stav vpravo nahoře se jmenuje „Připojeno“.',
    ],
  },
  {
    version: '0.19.1',
    date: '2026-09-21',
    title: 'Nabídka vypadá stejně na šířku i na výšku',
    items: [
      'Na monitoru na výšku měla nabídka vlastní vzhled: jiné podbarvení, jiný hover a místo mosazného pruhu tečka. Teď se chová úplně stejně jako na šířku, jen se položky rozestoupí a jsou vyšší, aby se lépe trefovaly.',
      'Dlouhý název se v nabídce zkrátí tečkami místo toho, aby roztlačil panel. Odsazení vlevo a vpravo je díky tomu stejné na každé šířce okna.',
    ],
  },
  {
    version: '0.19.0',
    date: '2026-09-21',
    title: 'Vždy čerstvá data a rychlejší načtení',
    items: [
      'Dovednosti, historie vytížení plánu a extra usage se načítaly jednou za běh aplikace. Kdo přidal SKILL.md nebo odpracoval další hodinu, viděl stará čísla. Teď se čtou při každém otevření stránky – a dosavadní obsah zůstane, dokud nedorazí nový, takže nic nebliká.',
      'Soubory aplikace nesou značku verze počítanou z obsahu. Prohlížeč se serveru zeptá, jestli se něco změnilo, a na nezměněný soubor dostane odpověď v pár bajtech místo celého stažení. Jakmile vydám novou verzi, značka se změní a stáhne se hned.',
      'Živá data zůstávají bez cache: změna je v okně do 25 ms.',
    ],
  },
  {
    version: '0.18.4',
    date: '2026-09-21',
    title: 'Přehled jde znovu otevřít v prohlížeči',
    items: [
      'Od zavedení klíče okna vracela adresa 127.0.0.1:4620 v prohlížeči jen „Agenteeq běží“. V Nastavení → Profil a vzhled je teď tlačítko Zkopírovat odkaz: vloží se do Safari nebo Chromu a přehled se otevře. Odkaz platí jen na tomhle Macu a jen do restartu aplikace.',
    ],
  },
  {
    version: '0.18.3',
    date: '2026-09-21',
    title: 'Jasná hláška, když se podklady neuloží',
    items: [
      'Podklady projektu hlásily „Neuloženo…“, když se čeká na doťukání, a „Neuloženo“, když se zápis nepovedl – rozdíl tří teček. Selhání je teď červené, říká „Neuložilo se! Zkopíruj si text.“ a hlášku dole doplní, proč.',
      'Pro červený toast existoval trojí název tónu. Zůstal jeden, takže se hlášky nemohou rozejít.',
    ],
  },
  {
    version: '0.18.2',
    date: '2026-09-21',
    title: 'Limity hlásí všude totéž a časová osa nic nezamlčí',
    items: [
      'Obnovené okno limitu hlásilo na Přehledu „0 %“, ve Statistikách „Obnoven“ a v rozbaleném seznamu „obnoveno“ – tři různá tvrzení o jednom čísle. Teď všude stojí „Obnoveno“ a vyčerpané okno „Vyčerpáno“.',
      'Časová osa „Dnešní směna“ ukazuje sedm nejdůležitějších agentů. Když jich je víc, stojí pod ní, kolik jich zbývá, s odkazem na seznam Agenti. Dřív se tiše zahodili.',
    ],
  },
  {
    version: '0.18.1',
    date: '2026-09-21',
    title: 'Bezpečnější práce s cizími repozitáři',
    items: [
      'Git, který Agenteeq spouští v tvých projektech, už nespustí příkaz ze souboru nastavení cizího repozitáře (třeba staženého z internetu). Dřív mohla naklonovaná složka při zobrazení stavu spustit vlastní skript.',
    ],
  },
  {
    version: '0.18.0',
    date: '2026-09-21',
    title: 'Bezpečnější přístup: telefon jen čte, okno aplikace má klíč',
    items: [
      'Spárovaný telefon teď slouží ke čtení stavu. Nesmí spouštět agenty, měnit nastavení a klíče, instalovat propojení ani procházet disk Macu. Zůstává mu sledování agentů, přepisů, limitů i útraty a označování upozornění za přečtená. Tyhle akce si uděláš na Macu.',
      'Okno aplikace používá klíč, který se vytvoří při každém spuštění. Jiný program nebo jiný uživatel na tomtéž Macu se na místní adrese Agenteeq bez klíče k ničemu nedostane. Propojení s Claude Code a rozšíření pro Chrome fungují jako dřív.',
    ],
  },
  {
    version: '0.17.3',
    date: '2026-09-21',
    title: 'Kratší seznam Dovedností a oprava okna rozšíření',
    items: [
      'Dovednosti se načítají po 36 kartách a tlačítkem Zobrazit dalších. Stránka se 147 dovednostmi byla na telefonu vysoká přes 37 000 px, teď asi 9 700 px.',
      'Okno rozšíření pro Chrome se zastaralou verzí přesáhlo 600 px, které Chrome ukáže. Seznam služeb je kratší a všechno se vejde.',
    ],
  },
  {
    version: '0.17.2',
    date: '2026-09-20',
    title: 'Menu jako velké dlaždice na monitoru na výšku',
    items: [
      'Když je okno vysoké a otočené na výšku, položky menu v levém panelu se změní na velké dlaždice přes celou šířku panelu. Jsou stejně vysoké, mají stejné mezery a začínají kousek pod profilem, podle návrhu z Figmy. Celá dlaždice je klikatelná a aktivní má tmavé (v tmavém režimu světlé) vyplnění.',
      'Rozměry se řídí výškou okna, takže tvar drží na 1920 i 2560 px.',
    ],
  },
  {
    version: '0.17.1',
    date: '2026-09-20',
    title: 'Kontrastní tlačítka v tmavém režimu',
    items: [
      'V tmavém režimu jsou hlavní tlačítka (Spustit agenta, Uložit, Vytvořit projekt…), vybrané přepínače, zapnuté přepínače a zatržítka světlá s tmavým písmem. Kontrast je přes 16 : 1, dřív šlo o tmavou plochu na tmavém pozadí.',
    ],
  },
  {
    version: '0.17.0',
    date: '2026-09-20',
    title: 'Vlastní pořadí karet v detailech a opravené tlačítko Změnit',
    items: [
      'Karty v pravém panelu detailu agenta a detailu projektu si přesuneš tažením za úchyt nahoře uprostřed karty. Zvednutá karta se drží pod myší a ostatní se plynule uhýbají. Pořadí se ukládá do Agenteeq a zůstane i po zavření aplikace.',
      'V Nastavení, v části Vzhled, jde uspořádání karet vrátit tlačítkem Obnovit výchozí.',
      'Tlačítko „Změnit“ u projektu v detailu agenta mělo nulové vnitřní odsazení a text se dotýkal okraje. Opraveno.',
    ],
  },
  {
    version: '0.16.0',
    date: '2026-09-20',
    title: 'Řazení projektů tažením, víc barev a čitelnější odznaky',
    items: [
      'Karty projektů si seřadíš tažením: chytíš kartu, zvedne se a ostatní se plynule uhýbají. Na telefonu se táhne za úchyt v rohu karty, z klávesnice Alt a šipkami. Pořadí se ukládá; Esc tah zruší.',
      'Barev projektů je šestnáct a kalná žlutá je nahrazená čistě slunečnicovou. Starší projekty se žlutou se převedou samy.',
      'Logo klienta vyplní celý rámeček tak, jak sis ho vybral(a) ve výřezu, bez bílých pruhů. Logo nahrané dřív s okraji stačí nahrát znovu s volbou Vyplnit.',
      'Zelené odznaky (počet agentů) a vybraná volba vzhledu mají bílé písmo na tmavší zelené, takže se čtou i v malé velikosti.',
    ],
  },
  {
    version: '0.15.2',
    date: '2026-09-20',
    title: 'Vyvážené sloupce bez prázdných ploch',
    items: [
      'Přehled i Statistiky si srovnávají sloupce karet podle skutečné výšky obsahu. Útrata a Poslední aktivita (v Přehledu) a čtveřice žebříčků (ve Statistikách) se přesunou tam, kde je právě míň místa, takže pod kratším sloupcem nezůstává prázdná plocha.',
      'Přesun se dělá jen při znatelném rozdílu, ať karty neskáčou. Na telefonu jde všechno pod sebe ve stejném pořadí jako dřív.',
      'Karty na stránce Útrata mají mezi sebou stejné mezery.',
    ],
  },
  {
    version: '0.15.1',
    date: '2026-09-20',
    title: 'Přehlednější Dovednosti, výraznější přepínače a živější horní pás',
    items: [
      'Dovednosti mají jasné pořadí: hledání a řazení nahoře, pod nimi popsané filtry Zdroj a Původ. Vybraná položka je tmavá a tučnější, takže je vidět, co je zapnuté.',
      'Jediná karta rozpočtu se roztáhne přes celou šířku, na telefonu také.',
      'Opraveno tlačítko „Všichni agenti“ v horním pásu Přehledu, které mělo bílé pozadí a nečitelný světlý text.',
      'Horní pás Přehledu má výraznější a světlejší barevný přechod.',
    ],
  },
  {
    version: '0.15.0',
    date: '2026-09-20',
    title: 'Čitelnější ovládání, výřez obrázků a vlastní kalendář',
    items: [
      'Odkazy jako „Detail“, „Zdroje dat“ nebo „Zobrazit vše“ vypadají jako tlačítka: mají obrys, šipku a při najetí myší se vyplní. Rozbalovací přehled limitů je taky tlačítko.',
      'Obrázek projektu se ukládá s výřezem, který si sám nastavíš: obrázek posouváš tahem a přibližuješ posuvníkem, hned vidíš, co se uloží, a aplikace řekne doporučené rozměry i to, kdy by byl obrázek rozmazaný. Ukládá se ve vysokém rozlišení, takže je na kartě ostrý.',
      'Datum se vybírá v kalendáři ve stylu aplikace místo systémového okna.',
      'Poslední zadání v detailu agenta jde rozbalit celé a ukazuje celý text, ne jen prvních pár slov.',
      'U průměru tokenů je napsáno, z jakého období vychází (předchozích 7 dní).',
    ],
  },
  {
    version: '0.14.0',
    date: '2026-09-20',
    title: 'Předplatné v Útratě, aktuální kurz a čitelnější tokeny',
    items: [
      'Útrata teď počítá i předplatné. Agenteeq pozná plán Claude z přihlášeného Claude Code a plán ChatGPT z limitů Codexu. U každého uvidíš, z čeho to zjistil, cenu z ceníku a částku v korunách.',
      'Kurz koruny se stahuje z ČNB a u částek stojí, k jakému dni platí. Ručně zadaný kurz zůstane, jak jsi ho nastavil(a). Když se z dat nedá poznat cena (ChatGPT Pro má dvě), vybereš ji sám a do té doby se nepočítá.',
      'Složení tokenů má vlastní měřítko pro spotřebu a pro cache, takže je vidět poměr vstupu a výstupu i rozdíl mezi zápisem a čtením cache.',
      'Nabídka v levém panelu se drží u sebe i na vysokém monitoru a odznak upozornění ukazuje nejvýš 10+.',
      'Opraven tmavý useknutý stín pod tlačítky ve výběru agenta při zaostření klávesnicí.',
    ],
  },
  {
    version: '0.13.0',
    date: '2026-09-20',
    title: 'Přehled všech limitů, obrázky projektů a klidnější upozornění',
    items: [
      'Upozornění se ukazují po jednom a poznáš je na první pohled: zelená s fajfkou znamená, že se akce povedla, červená s vykřičníkem, že ne. Čtyři stejné černé pruhy pod sebou jsou pryč.',
      'Okna limitů mají rozbalovací přehled všech nástrojů. U každého vidíš změřené limity a stáří měření, a u těch, které limit z místních dat neprozradí, je to napsané přímo – nic se nedomýšlí.',
      'Projekty mají obrázky. Nahraj obrázek karty nebo logo klienta (velké fotky se zmenší samy) a najdeš projekt rychleji. Bez obrázku dostane karta elegantní přechod; barva projektu zůstala jako jemný pruh.',
      'Mapa „Kdy agenti pracují“ se při najetí plynule zvětší a ukáže den, hodinu, počet tokenů, v kolika dnech se tam pracovalo a který nástroj měl největší podíl.',
      'Z levého panelu zmizelo „Živá data“, stav spojení už je nahoře vpravo.',
    ],
  },
  {
    version: '0.12.1',
    date: '2026-09-20',
    title: 'Poctivější stavy, přehlednější Nastavení, bezpečnější spouštění',
    items: [
      'Aplikace už netvrdí „nainstalováno“ jen proto, že na disku zůstala složka. Gemini CLI, Qwen Code, Copilot a Cursor se hlásí jako nalezené, jen když je nástroj opravdu na Macu; jinak stojí, že po něm zbyla jen stopa.',
      'Pod číslem „tokenů dnes“ v postranním panelu je vidět, které nástroje ho způsobily, a popisek říká, že jde o vstup a výstup bez cache, ne o cenu ani limit.',
      'Nastavení je o čtvrtinu kratší. Zdroje agentů jsou jeden přehledný seznam, webové služby jedna řada čipů a nenalezené nástroje jsou sbalené. Propojení s Claude Code a instalace pro další lidi se ukážou jen tomu, komu dávají smysl.',
      'Bezpečnost podle nezávislého auditu: konverzace s podvrženým označením už nespustí příkaz s cizím přepínačem, „Otevřít složku“ neotevře balíček jako program, zálohy nastavení Claude Code jsou jen pro tebe a kód pro spárování rozšíření vydá jen Mac.',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-09-15',
    title: 'Agenti na telefonu odkudkoli, přes tvou vlastní síť',
    items: [
      'Nová karta v Nastavení: Přístup přes Tailscale. Jedním přepínačem začne Agenteeq naslouchat i na adrese, kterou tomuhle Macu přidělil tvůj tailnet – a ty vidíš agenty z telefonu i mimo domov.',
      'Žádná veřejná adresa přitom nevzniká. Párování telefonu kódem a token platí dál a domácí síť zůstává samostatný přepínač, takže vypnutí jednoho nezavře druhý.',
      'Aplikace ukáže i to, jestli máš přes „tailscale serve“ zapnuté HTTPS. Bez něj si telefon aplikaci neuloží na plochu; spouštět ho za tebe Agenteeq nebude.',
      'Okno rozšíření pro Chrome má teď stejná písma a barvy jako aplikace, včetně nočního režimu.',
      'Agenteeq má vlastní web s popisem a stahováním. Rozhraní na něm zůstává na adrese /app.',
    ],
  },
  {
    version: '0.11.1',
    date: '2026-09-14',
    title: 'Připraveno na dlouhý provoz',
    items: [
      'Když se soubor s daty poškodí, aplikace naběhne dál: data obnoví z poslední zálohy a řekne ti, co se stalo. Poškozený soubor nechá uložený vedle.',
      'Když se změny nedaří uložit na disk (plný disk, práva ke složce), uvidíš to hned v horní části okna – nic se neztratí potichu.',
      'Po náhodném pádu se lokální služba obnoví sama i po týdnech běhu, ne jen třikrát za celou dobu.',
      'Smazaná konverzace z přehledu zmizí hned, projekty připojené odkazem jsou vidět a agent se špatně nastavenými hodinami nesvítí „pracuje“ navždy.',
      'Na Macu bez Claude Code se nenabízí propojení, které nejde použít, a na telefonu jsou menší odkazy lépe trefitelné.',
    ],
  },
  {
    version: '0.11.0',
    date: '2026-09-13',
    title: 'Rozšíření pro Chrome, které víš, že máš',
    extension: true,
    items: [
      'Průvodce i první kroky na Přehledu vysvětlují rozšíření pro Chrome: co dělá a jak ho za minutu nainstalovat.',
      'Rozšíření má nové okno: hned vidíš, jestli je spárované, kdy naposledy poslalo data a které služby sleduje.',
      'Aplikace si pamatuje, že je rozšíření spárované. Po restartu už neukazuje „nenainstalováno“.',
      'Když v Chromu běží starší verze rozšíření, aplikace i rozšíření řeknou, jak ji obnovit.',
      'Po každé aktualizaci se tady ukáže, co se změnilo. Kdykoli se sem vrátíš přes verzi v postranním panelu.',
    ],
  },
  {
    version: '0.10.2',
    date: '2026-09-13',
    title: 'Zadání vždy ve schránce, do Gemini se vloží samo',
    items: [
      'Po spuštění aplikace nebo webu je zadání spolehlivě ve schránce. Dřív se kopírování v okně aplikace a na telefonu tiše nepovedlo.',
      'Čeština ve schránce zůstává celá – žádné „n�zev“ místo „název“.',
      'Gemini a Qwen neumí převzít zadání z adresy. S rozšířením se zadání vloží do jejich okna samo, odešleš ho Enterem.',
      'Přehled má pevné sloupce: bloky už neskáčou podle šířky okna a nevznikají prázdné mezery.',
    ],
  },
  {
    version: '0.10.1',
    date: '2026-09-13',
    title: 'Poctivě o tom, co aplikace nevidí',
    items: [
      'Když ti chybí rozšíření pro Chrome, Přehled i Agenti řeknou, že konverzace z prohlížeče nevidí a jak to napravit.',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-09-13',
    title: 'Útrata ožila, dovednosti mají původ',
    items: [
      'Dovednosti se dají filtrovat podle původu: od Anthropicu, od OpenAI, z pluginu nebo tvoje vlastní.',
      'Nový widget „Kam dnes šly tokeny“ ukáže, který nástroj dnes spotřeboval nejvíc.',
      'Útrata ukazuje kredity a data hned nahoře místo prázdných bloků.',
      'Okno aplikace jde znovu chytit za horní okraj a přesunout.',
    ],
  },
  {
    version: '0.9.9',
    date: '2026-09-13',
    title: 'Čísla ověřená proti zdrojům',
    items: [
      'Tokeny v grafech jsou přepočítané třikrát nezávisle a sedí s přepisy Claude Code a Codexu.',
      'Tmavé záhlaví okna místo bílého systémového pruhu, ploché karty bez stínů, čitelný přepis.',
      'Plynulé rolování na displejích 120 a 240 Hz.',
    ],
  },
];

const parts = (v) => String(v).split('.').map((n) => Number(n) || 0);
export function compareVersions(a, b) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// Vydání, která uživatel ještě neviděl. Kdo nikdy nic neviděl (první aktualizace s touto
// funkcí), dostane jen aktuální vydání – ne celou historii najednou.
export function unseenReleases(lastSeen, current) {
  const upTo = RELEASES.filter((r) => compareVersions(r.version, current) <= 0);
  if (!lastSeen) return upTo.slice(0, 1);
  return upTo.filter((r) => compareVersions(r.version, lastSeen) > 0);
}
