# Changelog

## 0.46.62 – 2026-10-23 · Cloudové běhy Codexu

- **Codex v nativní aplikaci:** cloudové úlohy se zjišťují z autorizovaného seznamu Codexu. Jejich název, stav a odkaz se zobrazí mezi agenty i tehdy, když k nim na Macu neexistuje místní přepis.
- **Viditelný výpadek zdroje:** když seznam cloudových úloh nejde načíst nebo chybí přihlášení, Nastavení ukáže chybu zdroje místo závěru, že žádný běh neexistuje. Pracovní stav se po výpadku přestane vydávat za čerstvý.
- **Codex.app:** Agenteeq najde také Codex CLI zabalené v nativní aplikaci.

Veřejné Preview 0.46.61 vzniklo před touto opravou a cloudové běhy Codexu nedetekuje; oprava proto dostává nový tag.

## 0.46.61 – 2026-10-23 · Živí roboti a nikdy naslepo

- **Roboti jako živí:** dýchají, rozhlížejí se, anténa se pohupuje a každý má vlastní rytmus. Pracující robot se soustředí, píše a jádro mu pulzuje; robot, který tě potřebuje, zvedá ruku, naklání hlavu a netrpělivě poskočí; hotový je spokojený a občas radostně poskočí; po selhání svěsí hlavu, na limitu dřímá. Když na robota najedeš, natáhne se k tobě a pozdraví, a když agent dokončí práci, začne tě potřebovat nebo selže, robot na to sám zareaguje. Hýbou se jen roboti na obrazovce (seznam se stovkou agentů zůstává plynulý) a „Omezit pohyb“ i systémové omezení pohybu vše vypnou.
- **Celý příkaz všude, kde jde rozhodnout:** karta ve „Vyžaduje pozornost“ na Přehledu dřív ukazovala jen tlačítka a popis, který si agent napsal sám. Teď ukáže celý příkaz (nebo soubor, adresu), složku, přesné pravidlo pro „Povolit a příště se neptat“ i odpočet do návratu do terminálu, stejně jako karta v rohu. V detailu agenta přibylo pravidlo a odpočet.
- **Odpočet běží u každé kopie žádosti**, ne jen v rohu.
- **Hlídané v CI:** kontrola v prohlížeči (Chromium i WebKit) pošle skutečnou žádost, ověří přesný příkaz na Přehledu i v rohu, že Povolit a Zamítnout dojde až do odpovědi hooku a že se karta vejde na úzké okno.
- **Chrome Web Store:** vydávací workflow nyní skončí chybou, pokud chybí OAuth secrets; prázdné nahrání už nemůže vypadat jako úspěšné vydání.

## Web – 2026-10-23 · Snímky aplikace z aktuální verze

- Úvod webu (CZ i EN, počítač i telefon) ukazuje Přehled z aktuální verze: Vyžaduje pozornost, Stav agentů a dnešní den v pozdravu. Dřív tam byl snímek ze 13. 10.
- Dlaždice „Vědět včas“ ukazuje karty agentů s roboty (na počítači první řada, na telefonu jedna karta) místo staré tabulky; rozměry a popis obrázku odpovídají.
- Ukázková data mají u konverzací model (`claude-opus-5-5`, `claude-sonnet-5-5`, `gpt-5-codex`), takže karty nemají místo modelu pomlčku.
- `shots:site` fotí jen snímky, které web používá, a prohlížeč bere z `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` stejně jako `shots:hero`. Nepoužívané staré snímky jsou odstraněné. Desktopová binárka se tím nemění.

## Web – 2026-10-23 · Aktuální odkaz na Preview

- Úvodní a instalační stránka v češtině i angličtině ukazují veřejné Preview 0.46.60 i v případě, že prohlížeč nenačte seznam vydání z GitHubu. Tlačítko stabilního vydání dál míří na Stable Latest. Tato změna webu není součástí již zveřejněné desktopové binárky 0.46.60.

## 0.46.60 – 2026-10-22 · Názvy a přepisy webových konverzací

- **Google AI Studio:** běžící samostatná webová aplikace je po volbě „Sledovat“ vidět mezi sledovanými běžícími nástroji. Spárované rozšíření nyní rozpozná uložené prompty na `aistudio.google.com` a předá jejich stav aplikaci. Samotný běžící proces neprokazuje aktivní konverzaci; pro její název, zprávy a stav je nutné hlášení rozšíření.
- **Telefon přes QR:** Nastavení už nevypisuje IP adresu ani nenabízí její kopírování. Telefon se páruje naskenováním jednorázového QR bez ručního zadávání adresy nebo PINu; stejné instrukce platí i pro Tailscale a webový rozcestník.
- **Zjištěné plány Claude:** každý nalezený profil Claude Code se ověřuje přímo ve svém `CLAUDE_CONFIG_DIR`, výchozí profil bez něj. Dva současně přihlášené účty s různým UUID se zobrazí odděleně; nově objevený profil se kontroluje hned. CLI spuštěné z Finderu dostává správnou cestu k `node`; neúspěšný proces není důkaz přihlášení.
- **Přehlednější Nastavení:** účet a licence, vzhled a jazyk, pomocník i telefon a vzdálený přístup mají vlastní položky v levé navigaci. Vyhledávání a nápověda vedou do správné části.
- **Profilový obrázek:** výběr se rozbaluje podle skutečné výšky obsahu; sbalený náhled ukazuje celou první řadu bez ostrého přechodu přes avatary.
- **Potvrzení nového nástroje:** tlačítko „Rozumím“ / „Got it“ se při najetí a zaostření klávesnicí vyplní fialově s bílým textem.
- **ChatGPT, Codex a Claude Code v prohlížeči:** Agenteeq přebírá skutečný název z titulku stránky nebo aktivní konverzace v postranním seznamu. Už nezobrazuje poslední znaky interního ID jako název.
- **Přepis:** spárované rozšíření posílá viditelné zprávy jen do lokální aplikace. Detail agenta je průběžně aktualizuje bez zdvojování odpovědí. Neúplně vykreslená historie může zůstat neúplná.
- **ChatGPT ↔ Codex:** při přechodu v jedné kartě se znovu rozpozná služba i bez načtení celé stránky.
- **Codex v aplikaci:** poškozený název z indexu (například smíšené znaky latinky a cyrilice v jednom slově) už nepřepíše poslední čitelný název; případně se ukáže skutečné první zadání.

## 0.46.59 – 2026-10-22 · Angličtina i po aktualizaci

- **Jazyk při restartu:** úvodní obrazovka aplikace pro Mac, průběh aktualizace, nabídka a systémové dialogy používají uloženou volbu češtiny nebo angličtiny. Aktualizace ji nemění.
- **Sledování složek:** na Node 24 se neexistující kořen přepisů neoznačí za aktivní, i když `fs.watch` vrátí watcher bez chyby. Po vzniku složky se sledování zapne a první konverzace se doskenuje.
- **Aktualizace:** když zvolený kanál nenabízí novější vydání, aplikace to uvede přesně a nezamění tento stav za nejnovější verzi ve všech kanálech.

## 0.46.58 – 2026-10-21 · Spolehlivější kontrola aktualizací a upozornění

- **Nastavení → Aktualizace:** tlačítko „Zkontrolovat nyní“ se po dokončení kontroly znovu aktivuje, i když je verze stále stejná. Další pokus je možný také po chybě spojení.
- **Výpadek spojení:** hlášení se zobrazí čtyři sekundy od začátku výpadku. Opakované pokusy o spojení už časovač neposouvají stále dál.
- **Nepřečtená upozornění:** jako přečtená se v aplikaci označí až po potvrzení serverem. Neúspěšný požadavek neschová nepřečtené položky a opožděná odpověď nepřepíše novější počet.

## 0.46.57 – 2026-10-21 · Přehlednější mapa práce agentů

- **Statistiky:** mapa „Kdy agenti pracují“ používá místo okrové značkovou fialovou škálu. Intenzita stále odpovídá skutečné aktivitě; barva se přizpůsobuje světlému a tmavému vzhledu.
- Navazuje na veřejné Preview 0.46.56; změny této verze jsou popsány níže.

## 0.46.56 – 2026-10-21 · Přehled agentů, výběr a napojení rozšíření

- **Agenti:** hromadné zařazování konverzací jasně odlišuje plné tlačítko od filtrů, přesně počítá vybratelné konverzace, zachová výběr napříč filtry s viditelným upozorněním a potvrzuje počet položek v dialogu.
- **Přehled:** karty agentů dávají název konverzace do hlavní typografické úrovně; jméno agenta nebo nástroje zůstává menší podpůrný údaj.
- **Rozšíření Chrome:** značka v hlavičce už nikdy neotevře prázdnou stránku lokálního serveru. Spárované rozšíření požádá běžící nativní Agenteeq, aby zobrazil Přehled; klíč okna se do Chromu nepředává.
- **Dovednosti:** seznam nově zahrnuje `~/skills`, vlastní umístění `CLAUDE_CONFIG_DIR` a `CODEX_HOME` a symlinkované soubory i složky. Stejný soubor připojený na více místech se ukáže jen jednou; cykly symlinků se bezpečně přeskočí. Odstraněn byl také tichý limit 400 položek. Seznam se dál obnovuje při otevření stránky, po návratu do okna a každých 30 sekund.

## 0.46.55 – 2026-10-21 · Rozhodování v Agenteeq dotažené

- **Povolit a příště se neptat:** když Claude Code k žádosti nabídne trvalé pravidlo (stejné, jaké nabízí v terminálu), karta ho ukáže celé i s tím, kam se uloží („v tomto projektu, jen u tebe“, „jen v této konverzaci“…), a jedním klepnutím ho potvrdíš. Agenteeq žádné pravidlo nevymýšlí a nic v něm nemění.
- **Rozhodnutí tam, kde agent čeká:** tlačítka Zamítnout / Povolit jsou i přímo v „Vyžaduje pozornost“ na Přehledu a v detailu agenta, s celým příkazem. Karta v rohu se schová, když jsou tatáž tlačítka vidět na stránce, a nic nezakrývá. Klepnutí kdekoli vyřídí žádost všude.
- **Vždy aktuální:** karta zmizí hned, jakmile se rozhodlo jinde – odpověď v terminálu (doběhl nástroj, o který šlo, nebo začal jiný), nové zadání, konec tahu, nebo když Claude Code hook ukončí. Nikdy nezůstane viset tlačítko, které už nic neudělá.
- **Bez zdvojené bubliny:** u žádosti, o které jde rozhodnout v Agenteeq, se místo bubliny „Otevřít“ ukáže rovnou karta s volbami.

## 0.46.54 – 2026-10-21 · Rozhodnutí agenta přímo v Agenteeq

- **Povolit nebo zamítnout přímo v aplikaci (Beta):** když Claude Code žádá o povolení nástroje a okno Agenteeq je otevřené, vpravo dole se objeví karta s celým příkazem nebo souborem, složkou a tlačítky **Povolit** a **Zamítnout**. Rozhodnutí se vrátí do Claude Code a agent pokračuje. Zamítnutí agentovi řekne, že akci nechceš, ale nezastaví ho.
- **Terminál zůstává záloha:** když okno Agenteeq není vidět, funkce je vypnutá nebo nikdo do 45 s nerozhodne, Claude Code se zeptá v terminálu jako dřív. Agenteeq nikdy nic nezamítne ani nepovolí sám. Pravidla zákazu v nastavení Claude Code platí dál. Rozhodovat jde jen na Macu, telefon je dál jen ke čtení.
- **Agent „potřebuje tebe“ hned:** žádost o povolení je v přehledu vidět ve chvíli, kdy ji Claude Code položí, ne až po šesti vteřinách.
- **Zapnutí:** v Nastavení → Propojení s Claude Code klikni na **Obnovit propojení** (přidá hook PermissionRequest). V Nastavení → Upozornění jde rozhodování vypnout přepínačem „Rozhodovat v Agenteeq“.

## 0.46.53 – 2026-10-21 · Našli jsme na tvém Macu

- **Okno „Našli jsme na tvém Macu“:** po úvodním průvodci (a kdykoli z Nastavení → Propojení → „Najít AI nástroje na tomto Macu“) Agenteeq ukáže AI nástroje, které na počítači opravdu našel: co právě běží, aplikace ve složce Aplikace (Claude, ChatGPT, Codex, Cursor, VS Code, Windsurf, Zed, Warp, Ollama, LM Studio a další), programy v PATH (Claude Code, Codex, Gemini CLI, Qwen Code, Copilot CLI, Cursor Agent, Aider, OpenCode, Auggie) a nástroje, které tu už někdy běžely. Pod nimi jsou webové chaty v Chromu.
- **Každé napojení přes potvrzovací obrazovku:** „Napojit“ nejdřív ukáže, co Agenteeq uvidí, co neuvidí a co se po kliknutí stane. Teprve „Povolit“ spustí přihlášení u dodavatele (Claude Code, Codex), začne sledovat záznamy nástroje na tomto počítači, nebo vede k rozšíření pro Chrome. Bez potvrzení se nic nenapojí.
- **Poctivě:** nalezeno je jen to, co je ověřené. Když se na počítači hledat nedalo, okno to řekne a netvrdí, že tu nic není. Jména programů, která nosí i jiné běžné nástroje (goose, amp, crush, droid), se v PATH nehledají; rozpoznání, které nikdo neověřil na skutečném počítači, nese štítek Beta.
- **Rozšíření pro Chrome se aktualizuje z vlastního okna:** když má aplikace novější verzi, okno rozšíření ukáže „Je k dispozici verze …“ a tlačítko **Aktualizovat**. Ručně přidané rozšíření se jedním klepnutím znovu načte ze složky, kterou aplikace aktualizovala (dřív radilo jít na chrome://extensions a kliknout na Znovu načíst). Rozšíření z Chrome Web Store se hned zeptá obchodu a novou verzi nainstaluje; když ji obchod ještě nenabízí, řekne to. Když se nová verze nenačte, protože Chrome čte rozšíření z jiné složky, okno poradí, jak ho přidat znovu.

## 0.46.52 – 2026-10-20 · Napojení webových chatů funguje

- **Napojit ChatGPT, Claude.ai, Gemini a další webové chaty:** tlačítko „Napojit“ v Nastavení → Propojení končilo hláškou „Neznámá adresa API.“ Rozhraní posílalo označení služby (`web:chatgpt`) správně zakódované jako `web%3Achatgpt` a server takovou adresu nepoznal. Teď ji pozná a napojení se otevře: ChatGPT v prohlížeči a okno čeká, až rozšíření ohlásí první konverzaci. Test volá adresu přesně tak, jak ji posílá rozhraní.
- **Bez rozšíření pro Chrome** „Napojit“ webového chatu ukáže kartu rozšíření a zvýrazní krok „Přidat do Chromu“, místo aby jen vypsal hlášku.

## 0.46.51 – 2026-10-20 · Víc vidět agentů, žádné dotazy macOS a lišta po ruce

- **Tlačítka** se při najetí už neposouvají nahoru, změní jen barvu. Platí pro všechna tlačítka v aplikaci včetně „Spustit“ a „Poslat“ v Pomocníkovi.
- **Přepis agenta** je pro čtečku obrazovky zase seznam zpráv: oblast přebíjela roli seznamu, takže jednotlivé zprávy nebyly ohlášené jako položky.
- **Kontrola přístupnosti (axe)** prochází kromě osmi hlavních obrazovek i detail agenta, detail projektu a dialogy Nový projekt, Rozpočty, Co je nového, Rychlé hledání, Upozornění a Pomocník, ve světlém i tmavém vzhledu na počítači i telefonu. Nově kontroluje i čtyři stránky webu a okno rozšíření v devíti stavech.
- **Detekce agentů:** běžící Cursor Agent, Aider, Goose, OpenCode, Amp, Crush, Droid a Auggie v terminálu jsou v přehledu vidět jako běžící agent (Beta – jejich přepisy Agenteeq nečte). Dřív se neukázali vůbec. Když nikdo nepracuje a je otevřený ChatGPT nebo jiná AI aplikace, jejíž chaty Agenteeq nevidí, Stav agentů to řekne místo holého „nikdo nepracuje“.
- **Žádné dotazy macOS na Fotky a Zprávy:** agent spuštěný nebo obnovený z Agenteeq na pozadí se nespustí v domovské složce, v Knihovně ani přímo v Ploše, Dokumentech, Stažených a složkách médií. Prošel by je a macOS by se jménem Agenteeq ptal na povolení jedno za druhým. Aplikace řekne proč a nabídne složku projektu nebo Terminál.
- **Okno upozornění:** každé upozornění je dlaždice s jemným obrysem, nepřečtené má nádech barvy své úrovně (bez hnědé). Okno má lehký přechod a obrys. Tlačítko „Zobrazit všechna upozornění“ je vidět jako tlačítko a okno se vždy vejde do výšky obrazovky, takže nezajede pod okraj ani pod Pomocníka.
- **Profilový obrázek** v Nastavení je sbalený: celá první řada, pod ní náznak další v přechodu barvy značky a tlačítko „Zobrazit všechny“. Tab na schovaný obrázek výběr sám rozbalí.
- **Graf Tokeny na Přehledu:** služba bez změřených tokenů v daném sloupci má v popisku „–“, ne „0“, a poznámku, že chaty v aplikaci a na webu tokeny nehlásí. „0“ u OpenAI působilo, jako by tam nic neběželo.
- **Detail agenta a projektu:** úchyty pro přesouvání karet mají stejnou moderní kapsli ve značkové barvě jako widgety na Přehledu.
- **Horní lišta** se při posouvání dolů schová a při posunu nahoru vyjede shora, takže Hledat, Upozornění a Obnovit jsou po ruce kdekoli na stránce. Pod vysunutou lištou je gradient v barvě vzhledu, obsah pod ní plynule mizí místo tvrdé hrany. Malé posuny trackpadu lištou necukají, při fokusu z klávesnice nebo otevřených upozorněních zůstane vidět. Platí i v Nastavení a na telefonu.
- **Varování** (starší propojení s Claude Code, cizí informační řádek, limity, Útrata) už nejsou v hnědém boxu, ale řádek s ikonkou. Stav rozšíření má fajfku místo zeleného boxu.
- **Nastavení** při otevření neprobliká: místo věty „Zjišťuji, co je napojené…“ stojí kostra ve výšce seznamu modelů, takže po načtení nic neposkočí.
- **Stav agentů na Přehledu:** dlaždice v řadě jsou vždy stejně vysoké i se zalomeným popiskem.
- **Pomocník:** ikona „Nový rozhovor“ se po klepnutí protočí, takže je vidět, že se rozhovor vyčistil. Při omezeném pohybu jen krátce blikne.
- Obsahuje i nezveřejněné 0.46.49 a 0.46.50.
## 0.46.50 – 2026-10-20 · Zadání nahoře a méně prázdných míst

- **Přehled na telefonu:** pole pro zadání agenta je hned pod pozdravem, celé v prvním okně. Průvodce „Začni s Agenteeq“ stojí až pod ním a pod tím, co čeká na tebe. Dřív ho na prázdném Přehledu čtyři kroky průvodce odsunuly pod přehyb.
- **Statistiky:** karta „Tokeny podle složky“ nebo „podle modelu“, která v období nic nemá, se schová celá místo nadpisu nad „Bez dat.“.
- **Projekty:** karta bez nahraného obrázku nemá nahoře prázdný barevný pruh. Logo pak sedí v řádku s názvem.
- **Detail agenta a projektu:** jedno tlačítko zpět. Když je „zpět“ v hlavičce, odkaz „Všichni agenti“ nebo „Všechny projekty“ v obsahu se schová; při otevření přímým odkazem zůstane.
- **Načítání** v seznamu dovedností, v přepisu a ve výběru složky ukazuje malou hlavu robota s odleskem jako velká načítací scéna, ne obecný kroužek. Čtečka obrazovky oznámí, že se načítá, i ve výběru složky.
- **Ukázka:** pracující Claude Code a Codex jsou v Propojení „Napojeno“. Dřív tam vedle nich stálo „Nepodařilo se zjistit“, podle toho, co bylo na počítači s prohlídkou.
## 0.46.49 – 2026-10-20 · Spolehlivější server a CI

- **Server spuštěný z Terminálu** (`agenteeq`, LaunchAgent) se po neočekávané chybě řádně ukončí: zastaví agenty, které spustil, smaže klíč okna z disku a do logu zapíše příčinu. Dřív spadl bez úklidu. LaunchAgent ho pak spustí znovu. Aplikace pro Mac tuto pojistku už měla.
- **CI:** joby s Playwrightem běží na připnutém Ubuntu 24.04, protože `ubuntu-latest` se od 19. 10. 2026 postupně přepíná na 26.04. Sestavení pro Windows nastavuje Visual Studio vlastním skriptem místo neudržované cizí akce `ilammy/msvc-dev-cmd`. Testy na `main` se už navzájem neruší: dřív dvě rychle po sobě sloučené PR zrušily ověření prvního commitu a z něj pak nešlo připravit vydání.
- **Testy:** kontroly pravidla „nepodařilo se zjistit ≠ nic neběží“, které root přeskakoval, se pod rootem spustí znovu jako neprivilegovaný uživatel, takže proběhnou i v kontejnerech.
## 0.46.48 – 2026-10-20 · Úchyty jen na požádání a úklid vydání

- **Průběh dne na telefonu:** úchyty widgetů už trvale nesvítí. Přesouvá se v režimu „Upravit rozložení“ a prstem jen za úchyt, takže dotyk hlavičky widgetu posune stránku, ne kartu.
- **Okna limitů** nemají hovorové rady („V pohodě pro běžnou práci“). Slovo se ukáže až od 80 %: „Zbývá málo“. Graf na Přehledu se jmenuje „Tokeny“, odkud čísla jsou, říká „i“.
- **Větší cílové plochy:** legenda grafu a „Co je nového?“ v postranním panelu mají 44 px bez změny vzhledu.
- **Agenti:** pole hledání říká „Hledat agenta…“, kde všude hledá, je v popisku.
- **Pořadí karet:** když se uložení nepovede, vrátí se předchozí pořadí. Výchozí pořadí se použije až po úspěšném uložení.
- **Vydání:** po každém novém ověřeném Draftu se samy smažou starší nezveřejněné Drafty. Zveřejněná vydání a tagy zůstávají.

## 0.46.47 – 2026-10-20 · Dialog projektu bez rolování a sjednocené barvy

- **Nový projekt** se vejde do okna na počítači i na telefonu. Výběr složky je samostatný krok: zbytek formuláře se na tu chvíli schová a tlačítko „Zpět k projektu“ vede zpátky. Obrázek karty a logo klienta jsou sbalené pod jedním řádkem, vysvětlení složek je pod „i“. Na telefonu se barvy vejdou do dvou řádků.
- **Bublina „i“** v zavřeném stavu nezabírá místo, takže dialogy u spodního okraje zbytečně nerolují.
- **Vybraná volba** (jazyk, kanál a způsob aktualizací) má stejný tón jako vybraný vzhled, ne zelenou. Zelená zůstává jen pro „v pořádku“.
- **Klidové stavy** jako „Čeká na zadání“, „Nenainstalováno“ nebo štítky nástrojů už nejsou v hnědé varovné barvě. Ta zůstává jen pro varování.
- **Útrata:** starší ruční záznamy, které se nezapočítávají, nemají tlačítko „Ukončit“. Potvrzení smazání říká, že se do součtů nepočítaly.
- **Co je nového** ukazuje jen poslední verzi, starší jsou pod „Starší změny“. „Raději přes Terminál?“ má šipku místo nativního trojúhelníku. Průvodce na prázdném Přehledu má tolik sloupců, kolik má kroků. Na Linuxu stojí „přepne systém sám“. Tip Pomocníka správně říká, že pole pro úkol je pod pozdravem.

## 0.46.46 – 2026-10-20 · Pravdivé limity a stručný detail agenta

- **Všechny nástroje a služby** (rozbalení limitů na Přehledu a ve Statistikách): nástroj, ze kterého máme konverzace nebo dnešní tokeny, se už nikdy nehlásí jako „na tomto Macu není“. Dřív stálo vedle „287 tis. tokenů dnes“ zároveň „nejsou žádné konverzace Codexu“.
- Nástroje, které na počítači nejsou, jsou v jednom ztlumeném řádku „Na tomto Macu nenalezeno: …“ místo samostatného řádku pro každý. Selhané čtení dat se hlásí jako „Data se nepodařilo načíst“, ne jako nepřítomnost. U webových chatů je pomlčka a důvod pod „i“.
- **Detail agenta:** místo dlouhých poznámek o propojení stojí u stavu štítek „Stav odhadem“ nebo „Neúplný přepis“ s vysvětlením pod „i“. Detekovaný proces ukazuje „Běží od …, zatím bez přepisu“, PID je pod „i“. Varování, že propojení nic nehlásí, zůstává vidět i s tlačítkem.
- **Dialogy** po přihlášení, při zapnutí propojení s Claude Code a spouštění po přihlášení mají jednu viditelnou větu. Podrobnosti a cesty k souborům jsou pod „i“.
- **Poznámky v Nastavení** jsou prostý text bez rámečku, takže nevypadají jako pole nebo tlačítko. Rámeček a teplé pozadí mají jen chyby a stavy, které potřebují zásah. Pravidlo je zapsané v `docs/DESIGN.md`.

## 0.46.45 – 2026-10-20 · Klidnější Nastavení

- **Nastavení** už nemá pod každou kartou a přepínačem vysvětlující odstavec. Co karta dělá a jak funguje, je pod „i“ u nadpisu nebo u popisku. Týká se to třeba Mimo domov, Tailscale, Telefonu, Soukromí, Vzhledu, Jazyka, Zdrojů agentů a všech přepínačů upozornění. Stránka je tak výrazně kratší.
- Viditelné zůstává všechno, co nese stav nebo varování: adresa v domácí síti, stav licence a aktualizací, blokovaná oznámení a upozornění před odhlášením a smazáním účtu.
- „i“ se drží posledního slova nadpisu a nikdy neosiří na novém řádku. Bublina na úzkém telefonu nevyjede z obrazovky.

## 0.46.44 – 2026-10-20 · Vysvětlení pod „i“, ne v odstavcích

- **Měsíční rozpočty** začínají rovnou formulářem. Kdy Agenteeq upozorní a proč se bez připojeného API rozpočet neukáže, je pod „i“ u celkového rozpočtu. Kurzy měn a rozpočty jednotlivých služeb jsou sbalené (otevřené, když v nich už něco máš). Dialog se tak vejde i na telefon bez rolování, dřív měl dvojnásobnou výšku.
- **Útrata:** orientační kurz už není béžový varovný pruh, ale krátký údaj s „i“, které řekne, že se kurz ČNB nenačetl a kde ho nastavíš. Vysvětlení k součtům a k nepřipojenému API jsou pod „i“ u nadpisů. Hlášení o selhání načítání zůstává viditelné.
- **Časová osa na Přehledu:** místo dvou vět je pod osou odkaz „+N dalších agentů“, vysvětlení je pod „i“. Kolik agentů se nevešlo, je vidět vždy.
- **Statistiky:** věta o tokenech organizace z Admin API je pod „i“ u nadpisu.
- **Agenti:** karta „Konverzace v prohlížeči se nesledují“ je jeden řádek s nadpisem, „i“ a tlačítkem „Nastavit rozšíření“ místo tří vět, které říkaly totéž.

## 0.46.43 – 2026-10-20 · Kompaktní nahrávání a „i“ i na telefonu

- **Obrázek karty a logo klienta** v dialogu projektu mají náhled, název a „Nahrát“ v jednom řádku. Karta už není trojnásobně vysoká. Pod názvem zůstal jen rozměr a limit („1400 × 400 px · 4 MB“), formáty a doporučení jsou v bublině „i“.
- **Bublina „i“** má cílovou plochu 44 px, na telefonu se otevírá a zavírá klepnutím, klepnutí mimo ji zavře. U okraje dialogu roste na tu stranu, kde je místo, a číslo se od jednotky nikdy neoddělí.
- **Kam dnes šly tokeny** na Přehledu má zase viditelné pruhy v barvách služeb. Dřív jim chyběla barva a byly průhledné.
- **Agenti:** segment „Detekované procesy“ se při vypnutém sledování procesů neukazuje. Když zjišťování selže, stojí v něm „–“ s vysvětlením, ne zavádějící nula.

## 0.46.42 – 2026-10-19 · Cloud jako cloud a hledání, které najde

- **Cloudové relace Claude Code** už nejsou označené jako „na tomto počítači“. Přepis relace z claude.ai/code nese značku vzdáleného spuštění. Agenteeq ji teď čte a ukáže takovou konverzaci jako Cloud s aplikací „Claude Desktop · vzdálený Code“. Filtr Zdroj na Agentech ji zařadí správně.
- **Pozdrav na Přehledu** říká „Dnes: 1 konverzace“ místo „1 aktivní konverzace“. Počítá konverzace, které dnes měly aktivitu, i ty už nečinné. Vedle prázdného „Právě teď“ to dřív vypadalo jako rozpor. Když teď nikdo nepracuje, „Právě teď“ odkáže na dnešní konverzace v Agentech.
- **Hledání** najde agenta i podle projektu v Agenteeq (dřív jen podle názvu složky), větve, repozitáře, plného názvu a posledního zadání. Na Agentech se slova dotazu hledají každé zvlášť, takže „atlas portál“ najde „navigace klientského portálu“ v projektu Studio Atlas. Dvouřádkové výsledky hledání mají vzduch a nejsou natlačené na sebe.
- **Obnova dat** je klidné nadechnutí místo fialového záblesku přes celou obrazovku. Tón je slabý jen kolem středu, náběh i dojezd trvají 0,6 s a hlava robota pomalu dýchá.
- **Detail projektu → Služby:** loga služeb jsou větší a dobře vidět i na tmavé kartě.

## 0.46.41 – 2026-10-19 · Čistší detaily a roboti, kteří mluví k věci

- **Logo projektu** už nemá zvláštní rámeček v rozích. Logo s vlastním tvarem (zaoblená ikona) se ukáže samo, jen s jemným stínem. Průhledný znak dostane čistou bílou dlaždici s tenkou linkou. Dřív pod kulatějšími rohy ikony prosvítala bílá dlaždice a kolem byl dvojitý barevný prstenec.
- **Spouštění agenta:** zmizel štítek „Na webu“ vedle výběru služby. Vypadal jako tlačítko, ale nic nedělal. Volba, kde agenta spustit, se ukáže jen tam, kde opravdu je.
- **Bubliny robotů** mají nové texty. Každá věta řekne, co se děje a co z toho plyne pro tebe: počkat, rozhodnout, podívat se do detailu nebo zadat další úkol. Citáty z filmů nahradily krátké rady k zadávání a ukážou se jen v klidu, nikdy místo důležité zprávy.
- **Vybrané řádky v Agentech** mají místo hnědé jemný fialový tón značky s akcentem vlevo. Text zůstává stejně čitelný.
- **Úchyt widgetu** na Přehledu má kolem sebe vzduch. Leží 8 px pod lemem záře a 8 px nad kartou a nikde se nedotýká.

## 0.46.40 – 2026-10-19 · Jasné ovládání a robot bez uletěné ruky

- **Průběh dne a spotřeba** se rozbaluje výraznou kapslí přes celou šířku: šipka v kroužku, název, popis a vpravo „Zobrazit“ / „Skrýt“. Po najetí se jemně podsvítí značkovou fialovou, takže je vidět, že jde o akci.
- **Robot u pozdravu** má propracovanější gesta. Mávnutí drží paži v rameni (dřív se při něm ruka utrhla a uletěla), poskok má přikrčení, odraz a pružný dopad se zmenšujícím se stínem, náklon hlavy zvědavě podrží a vzácná otočka je pirueta na místě. Zvednutá ruka agenta, který čeká na tebe, míří do strany, takže už nemizí za hlavou.
- **Jméno v profilu** vede do Nastavení → Účet. Při najetí se pod ním plynule rozběhne podtržení.
- **Rozpočty:** vysvětlení, že se rozpočet počítá z nákladů za API, je schované za decentním „i“ u úvodní věty. Ukáže se po najetí, fokusu nebo klepnutí a Esc ho zavře, aniž by zavřel dialog.

## 0.46.39 – 2026-10-19 · Widgety, které si poskládáš

- **Průběh dne a spotřeba je nástěnka widgetů.**
  - Widget přesuneš tažením za nadpis nebo za úchyt nahoře. Šířku změníš tažením za pravý okraj.
  - Šířka se přichytává k celým sloupcům, sousední widget se plynule přizpůsobí a v řádku nikdy nezůstane díra.
  - Dotažením okraje skoro na konec pošleš souseda na další řádek. Dvojklikem na okraj vrátíš výchozí šířku.
  - Při najetí se widget jemně podsvítí značkovou fialovou.
  - Rozvržení se ukládá a platí i po restartu.
  - Klávesnicí: Alt + šipky mění pořadí, Alt + Shift + ←/→ šířku. Na telefonu je nástěnka jeden sloupec a přesouvá se za úchyt.
- **Vyžaduje pozornost** ukazuje jako hlavní to, o čem se rozhoduje (otázku agenta nebo důvod selhání). Stav je čip ve stejném tónu jako Stav agentů a akce drží spodní hranu karty, takže karta nemá prázdná místa.
- **Úvodní panel Přehledu** má živější a plastičtější fialový přechod s hloubkou a znatelnějším pohybem. Pohyb běží na grafické kartě, takže nebere výkon. Kdo má omezený pohyb, tomu zůstane v klidu.
- **Prázdný archiv projektů** už neukazuje přeškrtnuté kolečko. Po najetí vysvětlí jemná bublina, že v archivu zatím nic není. Neaktivní prvky v celé aplikaci mají obyčejný kurzor.
- **Řazení na Dovednostech** a další malé volby mají pohodlnou cílovou plochu 44 px místo tenkých 32 px.
- Oprava: karta puštěná při přetahování mimo mřížku (stránka se u okraje posouvala) zůstala „viset“ a pořadí se neuložilo.

## 0.46.38 – 2026-10-19 · Jemnější stav agentů a poznámky bez hnědé

- **Dlaždice „Stav agentů“ na Přehledu** už nemají sytou barevnou plochu. Stav nese jemný přechod 45° z barvy stavu do neutrální plochy a číslo v jeho barvě, bez rámečku. Po najetí kurzorem se dlaždice o kousek zvedne a tón v rohu zesílí; při omezeném pohybu zůstane na místě.
- **Poznámky v kartách** (Nastavení, Statistiky, Útrata, detail agenta) už nejsou v hnědém boxu. Obyčejná nápověda je skleněná plocha s jemnou linkou a chladným přechodem, skutečné varování si drží teplý tón, jen jemnější.
- U „Mimo domov“ nahradil štítek „nezjištěno“ u tlačítka samostatný box „Zjištění ještě neproběhlo“.

## 0.46.37 – 2026-10-19 · Projekty čitelné i v tmavém režimu

- **Projekt s černou barvou** měl v tmavém režimu tečku, aktivitu na kartě i obálku neviditelnou (kontrast zhruba 1 : 1). Černá se teď kreslí barvou textu, která se s režimem obrací: v tmavém je světlá, ve světlém tmavá. Uložená barva projektu se nemění.
- **„Tokeny podle služby“ v detailu projektu** mají každou službu ve vlastní barvě z palety grafů (jako Statistiky), místo aby byly všechny v barvě projektu. Pruhy jsou rozlišené a drží kontrast nad 3 : 1 v obou režimech.
- Na nejužším telefonu (320 px) se čas pod názvem konverzace v projektu usekl uprostřed slova („právě t“). Teď se zkracuje výpustkou.

## 0.46.36 – 2026-10-19 · Grafy čitelné i v tmavém režimu

- **Detail agenta Codex nebo Cursor v tmavém režimu:** sloupce „Aktivita za 24 hodin“ a výplň „Výstup“ ve Složení tokenů splývaly s kartou (kontrast zhruba 1 : 1), protože braly téměř černou barvu značky. Teď berou ověřenou paletu grafů jako Statistiky – Codex je zelený, Cursor fialový – a drží grafický kontrast nad 3 : 1 v obou režimech.
- Stejně se opravila časová osa agentů na Přehledu a grafy útraty podle služby (Přehled i Útrata).

## 0.46.35 – 2026-10-19 · Čistší karty agentů a přepis na telefonu

- Karta agenta, u kterého neznáme model, už za názvem aplikace neukazuje osamocenou pomlčku („Codex –“), která vypadala jako useknutý text. V tabulkovém zobrazení pomlčka ve sloupci modelu zůstává.
- Hlavička přepisu v detailu agenta se na úzkém telefonu zalamuje po celcích: „2 záznamy“ a „Zobrazit nástroje“ už se nerozpadají na dva řádky.

## 0.46.34 – 2026-10-19 · Pomocník bez AI, dokud ji nezapneš

- **Pomocník ve výchozím stavu odpovídá jen z návodů k Agenteeq a ze živého stavu agentů, dotaz nikam neodchází.** Odpovědi přes AI (Ollama, jinak Claude Code – otázka pak odejde do Anthropicu) se zapínají v Nastavení → Účet a vzhled → Pomocník odpovídá jako AI. Dřív byly zapnuté, dokud je člověk nevypnul (bug report 14. 10., bod 3: žádná otevřená AI v aplikaci). Kdo si AI už výslovně zapnul, tomu zůstane.
- Podtitul okna Pomocníka je „Průvodce aplikací“ místo „AI průvodce aplikací“.

## 0.46.33 – 2026-10-19 · Pomocník zná stav konkrétního nástroje

- **„Proč Codex nepracuje?“ odpoví ze živého stavu:** Pomocník dřív na otázku o konkrétním nástroji vrátil obecný návod k propojení (nebo ho přeformulovala AI, která stav agentů nezná), i když Codex právě stál na vyčerpaném limitu. Teď vypíše agenty toho nástroje, kteří selhali, narazili na limit nebo čekají na tebe – s důvodem, časem obnovy a tlačítkem Otevřít. Když žádný problém nemá, řekne to; nenačtený stav nevydává za „nic“ (bug report 14. 10., body 3 a 11).
- Otázky „jak/kde“ („Jak propojím Codex?“) a hledání starého chatu zůstávají u průvodce. O nástroji, jehož agenty Agenteeq nezná, Pomocník stav netvrdí.

## 0.46.32 – 2026-10-19 · Smazání se nepotvrdí omylem

- **Nevratné potvrzení má fokus na „Zrušit“:** dialogy Smazat účet, Smazat projekt, Smazat výdaj, Odebrat licenci, klíč, agenta, zařízení a Smazat historii upozornění dřív po otevření nastavily fokus na červené potvrzovací tlačítko, takže stisk Enter rovnou mazal. Teď Enter dialog jen zavře; smazání je vědomé klepnutí nebo Tab na tlačítko (bug report 14. 10., bod 10).
- `qa:desktop` v Chromiu i WebKitu otevře Smazat projekt, ověří fokus na „Zrušit“ a že Enter projekt nesmaže.
- Nezávislá kontrola všech bodů bug reportu na 0.46.31 (1440 i 375 px): stav je zapsaný v `docs/NOTION-BUG-REPORT-AUDIT-2026-10-15.md`.

## 0.46.31 – 2026-10-19 · Útrata: tabulka nákladů srovnaná

- **Koš u záznamu nákladu** je na počítači čtverec 44 × 44 px jako ostatní ikonová tlačítka (dřív 32 × 44) a od tlačítka „Ukončit“ ho dělí mezera 8 px – dřív se dotýkaly.
- **Služba v řádku** (logo a název) sedí na stejné ose jako datum, typ a poznámka; dřív byla o několik pixelů výš.
- Kontrola tmavého vzhledu a angličtiny na všech obrazovkách (375 i 1440 px): žádný useknutý text, žádná čeština v anglickém rozhraní, čistá konzole.

## 0.46.30 – 2026-10-19 · Telefon bez useknutých textů

- **Nastavení → Propojení:** webové chaty bez rozšíření jsou jeden řádek se seznamem služeb a jedním tlačítkem „Přidat rozšíření“ místo deseti stejných karet pod sebou. S rozšířením má každá služba dál svůj řádek a stav.
- **Přehled na telefonu:** přepínač „V aplikaci / Na pozadí / V Terminálu“ se vejde celý (dřív byla třetí volba useknutá), i na šířce 320 px.
- **Detail agenta:** nadpis „Agent“ místo „Detail agenta“, který se na telefonu usekl na „Detail age…“ (detail projektu má stejně krátké „Projekt“).
- **Konverzace v projektu:** dlouhá činnost a podpis v okně přidání konverzací končí třemi tečkami, ne useknutým písmenem.

## 0.46.29 – 2026-10-19 · Pomocník uhne při čtení

- **Pomocník na telefonu nezakrývá karty:** při posouvání dolů kulaté tlačítko sjede z cesty, při posunu nahoru a na konci stránky se vrátí. Otevřený chat ani tlačítko s fokusem z klávesnice neustupují; na počítači se nic nemění. Při omezeném pohybu jen zmizí, bez posunu.
- **Filtr projektů na Agentech:** místo useknuté věty „Založ první projekt a t…“ krátké „Založit projekt“.
- **Kredity Codexu u dvou účtů:** zůstatky dvou účtů se už nemíchají do jedné řady kreditů – ani z živých přepisů, ani z historie starších souborů. Aktuální kredit každého účtu dál ukazuje Codex sám.
- **Testy po sobě uklízí:** `npm test` běží ve vlastní dočasné složce a po doběhnutí ji smaže (dřív po sobě nechával tisíce složek).
- **Roadmapa podle skutečnosti:** úvod už neuvádí 0.46.12–0.46.14 jako aktuální kandidáty a řádek Chrome Web Store říká, co přesně chybí.

## 0.46.28 – 2026-10-19 · Pravdivá data i při výpadku

- **Chyba API už není „hotovo“:** konverzace Claude Code, jejíž tah skončil chybou API (výpadek serveru, přetížení, vypršelé přihlášení, příliš dlouhý prompt), se ukáže jako „selhalo“ s textem chyby a upozornění řekne „skončil chybou“ místo „spuštění selhalo“. Nové zadání nebo další odpověď stav vrátí.
- **Útrata při výpadku Admin API:** když náklady od Anthropicu nebo OpenAI nejde načíst (neplatný klíč, 429, výpadek), Útrata to řekne přímo – i s odpovědí dodavatele. Při selhání obou zdrojů už neukáže „Náklady za API nejsou připojené“, při selhání jednoho upozorní, že součet, prognóza a rozpočet jsou bez něj neúplné.
- **Synchronizace účtu nemaže útratu, kterou se nepodařilo zjistit:** dočasná chyba Admin API dřív z účtu smazala měsíční útratu dané služby a web ji ukázal jako nulu.
- **Náklady OpenAI po dnech UTC:** dotaz začíná půlnocí UTC, takže denní koše odpovídají kalendářním dnům a ranní útrata se nepřipíše včerejšku.
- **Jeden vyčerpaný limit = jedno upozornění:** dřív přišlo upozornění za každou konverzaci, která na limit narazila, a k tomu další za okno účtu – u jednoho 5h okna Claude nebo Codexu dvě i víc.
- **Počet aktivních konverzací v pozdravu a v pruhu Přehledu** nepočítá program, který jen běží bez přepisu (ten se ukazuje mezi běžícími aplikacemi).
- **Nečitelná složka s konverzacemi:** když Claude Code nebo Codex mají přepisy ve složce, kterou Agenteeq nesmí číst, Propojení to řekne jako chybu s cestou – dřív stálo „Složka existuje, zatím bez konverzací“.
- **Odhad ceny přes API u Claude Sonnet 5.5:** čtení z cache se počítá 0,10 $ za milion tokenů podle aktuálního ceníku Anthropicu (dřív 0,20 $ ze starší tabulky), odhad u konverzací se Sonnetem 5.5 tak už nevychází vyšší.
- **Limity Codexu u dvou účtů:** se dvěma složkami Codexu (`CODEX_HOME`) přihlášenými k různým účtům se okna 5 h a týden jedné licence přepisovala čísly druhé. Každé okno teď patří svému účtu; přepis, jehož účet nejde ověřit, limit nevydává za zjištěný.
- **Web: Windows se stejnou péčí jako Mac:** instalační stránka pro Windows má vlastní kroky, požadavky a řešení potíží; rozšíření ukazuje skutečné okno z aktuální verze místo atrapy.
- **Projekty a Nastavení:** Popis a Štítky v dialogu projektu jsou vedle sebe, takže se dialog na počítači vejde bez posouvání; kratší popisy u Pomocníka, synchronizace souhrnů a Dovedností; ikonová tlačítka mají na počítači 44 px.

## 0.46.27 – 2026-10-18 · Roboti pevně na zemi, obnova přes celou aplikaci

- **Všichni roboti stojí na zemi:** Mochi s bachratými nožkami i Rover na pásu dosahují na stín stejně jako ostatní postavy.
- **Nová ikona prázdných stavů:** oficiální hlava značky v barvě akce s jemným leskem a svítící anténou, oči se pomalu rozhlížejí.
- **Obnova je vidět na celé aplikaci:** po klepnutí na obnovení se přes rozhraní položí jemný fialový závoj s bílou hlavou robota a odleskem – nic neblokuje a čtečka obrazovky stav ohlásí.
- **Z bug reportu 14. 10.:** Pomocník na otázku po vzhledu agenta radí detail agenta (ne vzhled aplikace); Odhlásit a Smazat účet jsou na konci sekce Účet a vzhled; nápověda k obrázku projektu je kratší; mrak v synchronizaci je opticky vyvážený.
- **Pravdivé texty:** Útrata už neodkazuje na předplatné „níže“, Dovednosti uvádějí všechny složky, ze kterých čtou.

## 0.46.26 – 2026-10-18 · Klidné rozložení a dnešní den v pozdravu

- **Roboti podle Figmy:** paže vyrůstají z trupu bez mezery, oči jsou přesně uprostřed obličeje a nohy stojí na stínu – u všech devíti postav v aplikaci i na webu.
- **Otevřené okno už nehýbe stránkou:** hledání, upozornění ani dialog neschovají posuvník tak, aby se obsah posunul doprava a box Stav agentů se přeskládal. Místo pro posuvník je vyhrazené vždy.
- **Tlačítka s odsazením podle výšky:** 44px tlačítka na počítači mají 22 px po stranách (s ikonou 18 px) – už nevypadají stlačeně.
- **Tenký posuvník:** decentní kapsle bez podkladu, výraznější jen pod kurzorem.
- **Pozdrav vpravo:** místo počtů agentů (ty nese box Stav agentů) dnešní den jako kalendářní značka a pod ním dnešní aktivita – aktivní konverzace a tokeny z přepisů. Fialový přechod je jen jemný náznak, prolíná se rychleji a text zůstává tmavý na světlé ploše.

## 0.46.25 – 2026-10-18 · Přehled podle Figmy

- **Každé tlačítko na počítači má aspoň 44 px** – i malá tlačítka v kartách a seznamech, položky menu, odkazy u nadpisů, filtry, pole v Nastavení a položky palety. Kontrola `qa:tvary` to teď na počítači vynucuje na všech obrazovkách (dřív připouštěla 32 a 40 px).
- **Pozdrav s živým přechodem:** zprava se pomalu přelévá fialový přechod a na něm stojí, kolik agentů pracuje a kolik stojí (čeká na tebe, selhal nebo narazil na limit). Bez dat nebo při nejistém zjištění se počty neukazují.
- **Stav agentů:** dlaždice se obarví barvou stavu, jen když v ní něco je.
- **Typografie podle Figmy:** nadpisy sekcí 24 px, text v kartách 16 px, věta pod pozdravem 20 px; robot v pozdravu má paže víc do stran.

## 0.46.24 – 2026-10-18 · Šatník přesně na míru, agenti v cloudu, živý web

- **Šatník má 14 nových kousků:** baret, rybářský klobouček, květinový věneček, vikingská helma, hvězdičkové a lyžařské brýle, ruměnec s pihami, zástěra, baseballová bunda, laclové kalhoty, havajská košile a převleky rytíře, žabáka a včelky.
- **Čepice sedí na temeni a brýle přesně na očích** u všech 9 postav – i u širokých a nízkých (Bolt, Mochi, Rover), kde dřív čepice padala do obličeje a brýle přetékaly. Kukly, přilby a dresy převleků se kreslí podle tvaru hlavy a trupu dané postavy. Test měří obálku každé položky na každé postavě.
- **Mrak u agentů v cloudu:** vzdálené relace Claude Code (claude.ai/code) mají ikonu mraku místo notebooku a filtr Zdroj je podle toho třídí. Místní agenti (Claude Code, Codex, Cursor na tomto počítači) dál ukazují notebook.
- **Claude Code z claude.ai/code živě přes rozšíření (🧪 Beta):** otevřenou kartu rozšíření pozná zvlášť od chatu Claude.ai a během práce ukáže „Pracuje · podle otevřené karty v prohlížeči“. Když tutéž relaci zná i Claude Desktop, je v přehledu jeden agent; po zavření karty se stav vrátí k poslední uložené cache. Selektory na claude.ai/code zatím neověřené na živé stránce.
- **Web:** roboti v hero sledují kurzor v celém hero (i nad nadpisem), plynule – oči, náklon hlavy, paralaxa; panel rozšíření má lockup „Agenteeq / in browser“.

## 0.46.23 – 2026-10-18 · Pravdivá data: stavy agentů, tokeny, útrata a limity

Nezávislá kontrola pravdivosti dat našla 16 chyb; každá byla doložena konkrétním vstupem a špatným výsledkem a má regresní test.

**Stavy agentů**
- Agent, kterému jsi schválil povolení, už nehlásí „potřebuje tě“ – Agenteeq to pozná z dalšího nástroje nebo z doběhnutí schváleného (propojení s Claude Code je potřeba v Nastavení obnovit; hooky PreToolUse a PostToolUse 🧪 Beta).
- Schválené povolení pomocného agenta už nevisí na hlavní konverzaci.
- Konverzace, která čeká na dlouho pracujícího pomocného agenta, už po 30 minutách nepřejde do „bez aktivity“.
- Pomocný agent, který čeká na rozhodnutí nebo selhal, se ukáže na své hlavní konverzaci a započítá se v Přehledu, v rozšíření i v odznaku v Docku.
- Po úspěšném novém tahu už konverzace neukazuje dřívější selhání spuštění.
- Přerušený tah v Codexu (`turn_aborted`, ověřeno ve zdrojích Codexu 🧪) i v Claude Code už nevypadá jako práce ani jako „hotovo“.
- Druhý Claude Code ve stejné složce už nezmizí jen proto, že běží pomocný agent.
- Rozhodnutí a chyby vzdálených agentů ze starší cache Claude Desktopu se ukazují s časem, ke kterému platí, a souhrn v rozšíření nehlásí „nikdo nepracuje“, když u některého agenta chybí čerstvý stav.

**Tokeny a útrata**
- Tokeny a odhad ceny za posledních 30 dní u projektů počítají jen tokeny spotřebované v tomto období, ne celou historii konverzací, které v něm byly jen aktivní.
- Odhad ceny přes API počítá každý model jeho vlastní cenou, i když konverzace během práce model přepnula.
- Zápis do cache na hodinu se v odhadu ceny počítá dvojnásobkem ceny vstupu podle ceníku Anthropicu, ne jako levnější pětiminutový zápis.
- V časových pásmech s půlhodinovým posunem (například Indie) už „dnes“ nepřichází o tokeny z první půlhodiny dne.
- Cena podle ceníku API v detailu konverzace je označená jako odhad, stejně jako na kartě projektu.

**Limity**
- Codex: vyčerpaný týdenní limit už neoznačí okno 5 h jako vyčerpané ani o něm nepošle upozornění.
- Dvě licence Claude mají každá svůj řádek limitu; záznam bez účtu si nepůjčí čas obnovy jiné licence.
- Nečinná relace, která po obnově okna překreslí stavový řádek se starým měřením, už nepřepíše čerstvé číslo ani nevyhlásí „vyčerpáno“ s minulým časem obnovy.
- Jedno okno limitu hlášené stavovým řádkem, odmítnutím API i Claude Desktopem vyvolá jedno upozornění, ne tři.
- Procento z historie Claude Desktopu změřené před známou obnovou okna se už neukazuje jako současné.
- Vyžaduje pozornost nepíše „Nic neblokuje“, když je limit vyčerpaný.

## 0.46.22 – 2026-10-18 · Vyžaduje pozornost k užitku, skutečná loga nástrojů

- **Vyžaduje pozornost ukazuje, co se dá udělat hned.** Když nic neblokuje, místo prázdné karty „Momentálně bez upozornění“ jsou tu agenti, kteří za posledních 12 h dokončili práci a čekají na další krok (s tlačítkem Pokračovat), a limity od 80 %. Když není ani to, karta říká, co hlídá: žádosti o povolení (případně odkaz na zapnutí u Claude Code), selhání a nejvytíženější změřený limit – bez měření to přizná.
- **Žádné „nikdo nepracuje“ bez dat o agentech v cloudu.** Vzdálené relace Claude Code (např. z claude.ai/code) Agenteeq vidí jen z cache Claude Desktopu a „pracuje“ z ní platí 2 minuty. Když je cache starší, Stav agentů říká „Na tomto počítači nikdo nepracuje“ a dodá, odkdy jsou údaje o agentech v cloudu, místo tvrzení, že nepracuje nikdo.
- **Okno rozšíření pro Chrome se otevře v plné šířce.** Šířka popupu byla `min(380 px, šířka okna)`; Chrome popup otevírá skoro nulový a zvětšuje ho podle obsahu, takže se občas ukázal jen pruh pár pixelů. Teď má popup vlastních 380 px a na okno se přizpůsobí jen v rozsahu 300–379 px (velké zvětšení). Ověřeno v Chromiu: v 25px okně měla stará verze 25 px, nová 380 px.
- **Robot v pozdravu je zase základní Scout a nemhouří oči.** V klidu měli roboti oči stažené na 55 % a vypadali ospale; teď mají oči otevřené a jen občas mrknou. Pozdrav na Přehledu ukazuje Scouta místo přepracovaného Orbita.
- **Zaškrtnutí u dokončené úlohy je vidět i v tmavém režimu.** Značka stavu (Hotovo / Selhalo) u úloh spuštěných z Přehledu měla bílou ikonu na světlém tónu; teď má barvu plochy karty.
- **Skutečná loga webových AI nástrojů.** Replit, Lovable, v0, DeepSeek, Google AI Studio, NotebookLM, Trae a Amp mají vlastní logo (LobeHub 1.95.0, Simple Icons 16.34.0) místo obecné ikony nebo loga Gemini. Stitch a Bolt vlastní logo v žádné sadě nemají, nesou logo autora (Google, StackBlitz). Test hlídá, že žádný rozpoznávaný nástroj nezůstane bez loga.

## 0.46.21 – 2026-10-18 · Postavy a šatník přesně, upozornění s čistou geometrií

- **Rozšíření do Chrome Web Store se po zveřejnění vydání nahraje samo** (`.github/workflows/chrome-web-store.yml`), jakmile má repozitář přístup k API obchodu.

- **Upozornění (toast) s přesnou geometrií.** Kapsle s plným zaoblením se u dvouřádkového textu rozevřela a ikona ležela u zakřivené hrany. Teď má roh 22 px = poloměr ikony 14 + odsazení 8 ze všech stran: jeden řádek je přesná kapsle 44 px, delší text zaoblený obdélník se soustřednou ikonou; ikona, odkaz i křížek stojí u prvního řádku.
- **Oči vždy uprostřed obličeje.** Poloha očí se počítala jako u Scouta (24,5 bodu pod temenem × šířka hlavy), takže u postav s jiným poměrem hlavy vyjížděly z obličeje – Bolt je měl pod jeho spodním okrajem. Teď jsou ve středu tmavé plochy a jejich velikost nepřeroste výšku obličeje.
- **Šatník sedí na každé postavě.** Čepice se kotví k temeni, brýle, monokl, knír a obličejové části převleků k linii očí – obojí stejným měřítkem v obou osách, nic se nenatahuje. Oblečení dál drží trup. Ověřeno na všech 9 postavách × 34 položkách.
- **Přepracované postavy:** Orbit má kulatou hlavu a planetku s prstencem, Pixel ostré rohy a pixelový úsměv, Nova hvězdu na hrudi a hvězdičky na anténách, Bolt vyšší hlavu, Mochi je nově buchtička se šťastnýma očima ^^, ofinkou a tvářičkami.
- **Šatník bez výrazných obrysů:** čáry kolem čepic a oblečení jsou jen jemné dotažení hrany, jako u robota samotného.
- **Vzhled agenta se mění klepnutím na robota** v hlavičce detailu (odznak s tužkou), místo osamoceného tlačítka v řádku stavu.

## 0.46.20 – 2026-10-18 · Pomocník ve značkovém přechodu, odlišné profilové obrázky

- **Profilové obrázky se liší tvarem, ne jen barvou.** Kreslení ignorovalo připravené varianty a všech 29 obrázků bylo logo v jiných barvách. Teď se skládají z pěti hlav (logo, široká, kulatá, televize, kopule), osmi typů očí a pěti antén; první dva zůstávají přesně logem, uložená volba ukazuje na stejné místo.
- **Profilový obrázek bez tmavého proužku v aplikaci pro Mac.** WebKit při necelých pixelech nechal pod robotem prosvítat tmavé pozadí kolečka; obrázek teď přesahuje ořez o 1 px a kolečko s obrázkem nemá vlastní pozadí.
- **Kde agent běží je vidět.** Odznak tento počítač / web u robota v seznamu agentů má 28 px s ikonou 16 px (dřív 16 px s 10px ikonou) a popisek při najetí myší.
- **Pomocník: otevřené okno ve značkovém fialovém přechodu.** Hlavička v přechodu jako plovoucí tlačítko, s hlavou ze značky v průsvitném kroužku; odpovědi na kartě s fialovým okrajem, moje zprávy v přechodu, návrhy otázek jako fialové kapsle, pole s fialovým prstencem a tlačítko Poslat ve stejném přechodu jako tlačítko pomocníka. Světlý i tmavý vzhled.

## 0.46.19 – 2026-10-18 · Útrata v užším okně, rychlejší první agent na Macu, kontroly přístupnosti

- **Útrata: tabulka nákladů se v užším okně už neposouvá do strany.** Vedle postranního panelu se tabulka (min. 640 px) nevešla v oknech zhruba 700–1100 px – datum a koš byly mimo kartu. O podobě teď rozhoduje šířka karty (container query): pod 656 px se výdaje ukážou jako karty, stejně jako na telefonu.
- **Box se zkopírovatelnou cestou (Nastavení → Rozšíření) na telefonu:** dlouhá cesta už není natvrdo uříznutá pod tlačítkem Kopírovat – prolnutí u okraje ukazuje, že text pokračuje a jde posunout.
- **Agent spuštěný hned po startu aplikace se ukáže do 2 s i na macOS.** FSEvents doručuje události až od rozběhu proudu, který na vytíženém Macu trvá i přes sekundu – zápis v té mezeře se dřív ukázal až při dalším opakování. Sledování existujícího kořene přepisů teď po prvním zapnutí jednou doskenuje (`src/watch.js`, test v `test/detekce-agentu.test.mjs`). Odhalil to hraniční běh testu „čas do přehledu“ v CI (#180).
- **Automatická kontrola WCAG 2.2 A/AA (axe-core) v CI** (`npm run qa:axe`): všech 8 obrazovek ve světlém i tmavém vzhledu na počítači i telefonu, selže na každém porušení. Při prvním běhu našla tlačítko Hledat bez přístupného názvu na telefonu (vidět je jen lupa) – opraveno, má `aria-label`.
- **Přeskládání při přiblížení 400 % (WCAG 1.4.10) hlídá CI.** `qa:axe` nově kontroluje i 320 × 256 CSS px: všech 8 obrazovek bez vodorovného posunu a bez porušení axe ve světlém i tmavém vzhledu.
- **Ovládání klávesnicí hlídá CI (WCAG 2.1.1, 2.1.2, 2.4.7).** `qa:axe` na všech 8 obrazovkách (1440 i 375 px) projde Tabem celou stránku: musí se vrátit na začátek bez pasti a každá zastávka musí mít viditelný fokus. Ověřeno i naopak – schovaný fokus kontrola zachytí.
- **Oprava QA: tmavý Přehled se v `qa:axe` dřív netestoval.** Kontrola přepisovala `data-theme` v prohlížeči a aplikace ho po načtení nastavení vrátila na světlý – první obrazovka každého běhu se tak v „tmavém“ průchodu kontrolovala světlá. Vzhled se teď nastavuje uloženým nastavením jako u uživatele a kontrola selže, když se vykreslí jiný vzhled, než testuje. Tmavý Přehled prošel bez porušení.

## 0.46.18 – 2026-10-18 · AI pomocník, devět postav, 16 barev a tlačítko zpět

- **Pomocník odpovídá jako AI.** Na otázky k aplikaci odpoví vlastními slovy, česky i anglicky a s ohledem na předchozí zprávy, jen ze znalostní báze Agenteeq (návody průvodce + popis stránek); pod odpovědí nabídne tlačítka na správné místo v aplikaci. Zdarma: použije Ollamu na tomto počítači, jinak Claude Code na předplatné uživatele (`claude -p` s modelem Haiku, bez nástrojů, bez MCP, bez hooků a bez uložení konverzace, v prázdné dočasné složce; dotaz se neobjeví mezi agenty). Konverzace uživatele do modelu nikdy nejdou. Pod odpovědí je napsané, kdo odpověděl. Vypíná se v Nastavení → Účet a vzhled → Pomocník odpovídá jako AI; z telefonu Claude Code nespustí. Bez AI na počítači odpovídá průvodce jako dřív. „Co na mě čeká?“ a hledání starého chatu zůstávají přesné (živý stav, přepisy na disku). `src/pomocnik-ai.js`, `test/pomocnik-ai.test.mjs`.
- **Na počítači mají všechny akce 44 px a prvky v jedné řadě stejnou výšku.** Tlačítka, segmentové volby (kapsle 44, tlačítka 40), pole hledání, stav spojení i kulatá tlačítka horní lišty; dřív se v jedné řadě míchalo 40 a 44 px. Pravidlo je v `docs/DESIGN.md` a hlídá ho `qa:tvary`.
- **Tlačítko Hledat bez klávesové zkratky.** Zkratka ⌘K funguje dál, jen se v liště nevypisuje.
- **Devět postav s vlastní stavbou těla.** Scout, Orbit (velká kulatá hlava), Pixel (hranatý, čtvercové oči), Nova (štíhlá, dvě antény), Bolt (široký a robustní, blesk), Mochi (baculatý, tváře), Echo (vysoký, vizor), Rover (pásy místo nohou, periskop) a Sprout (lístek, tváře). Šatník je nakreslený jednou a na každou postavu se přenese podle její hlavy a trupu (`fit()` v `public/js/robot-svg.js`), brýle sedí na očích u všech. Agent bez vlastní volby si drží dosavadní výchozí vzhled.
- **Šestnáct barev místo čtyř**, výraznější výplň robota ve světlém režimu.
- **Postava a barva jsou v dialogu záložky jako šatník.** Dlaždice ukazují robota přesně tak, jak bude vypadat: každou postavu v tom, co má agent na sobě, každou barvu na zvolené postavě. Vlevo zůstává velký náhled a jméno, záložky jsou v jedné řadě i na tabletu a okno při přepínání neposkakuje. Tlačítka v liště dialogu mají stejnou výšku.
- **Obnova dat už neukazuje pruh ani systémový kurzor.** Ikona v tlačítku se na chvíli promění v hlavu robota ze značky, přes kterou přejede fialový odlesk (stejný motiv jako načítací scéna aplikace); plovoucí karta s pruhem zmizela, stav slyší jen čtečka obrazovky.
- **Rozšíření neslibuje aktualizaci, kterou Chrome Web Store nemá.** Kopie z obchodu teď řekne, že novější rozšíření má aplikace a kde ho nainstalovat; rozbalená kopie radí Znovu načíst.
- **Tlačítko zpět vedle nadpisu stránky.** Na počítači kulaté tlačítko 44 px se šipkou vedle nadpisu, na telefonu kapsle „‹ Přehled“ na vlastním řádku nad nadpisem, aby se nadpis nezkracoval; objeví se, jakmile se v aplikaci přešlo jinam, a vrátí na předchozí obrazovku (i se sekcí v adrese). Popisek říká kam („Zpět na Přehled“).
- **Šatník robota je dotažený a dá se kombinovat (#255).** Všech 34 položek je překreslených s obrysem, světlem a stínem a čitelných i v tmavém režimu (dřív byly ploché a například cylindr a sluchátka splývaly s pozadím). Brýle jsou jemné, s odleskem v čočkách. **Převlek se teď kombinuje s čepicí i doplňkem na obličej**: třeba pirát se slunečními brýlemi a kovbojským kloboukem. Vylučuje se jen s oblečením, protože obojí je tělo. Vlastní pokrývku hlavy převleku (čarodějův klobouk, kuchařská čepice, kukla) nahradí čepice, kterou si vybereš. Nové položky: kovbojský klobouk, vrtulková a mikulášská čepice, 3D brýle, srdíčkové brýle, páska přes oko a vesta (11 čepic, 8 doplňků na obličej, 7 kusů oblečení, 8 převleků).
- **Okno Vzhled agenta se zavře kliknutím mimo něj.**
- **Útrata: předplatné je označené jako pevná měsíční cena, ne útrata za API.** Když nejsou připojené náklady za API, stránka vysvětlí, že „Zjištěné plány“ jsou fixní cena tarifu a do útraty se nepočítají.
- **Tlačítko pomocníka vpravo dole je výraznější a nesplývá s kartami.** Má značkový fialový přechod se světlým odleskem, mezikruží barvy pozadí, které ho odděluje od obsahu pod ním (i v tmavém režimu), a v něm velkou hlavu ze značky Agenteeq (stejnou jako v logu) místo celého robota. Oči v tlačítku nesledují kurzor, jinde zůstávají.
- **Spouštěč na Přehledu: všechny ovládací prvky jsou 44 px a nabídka agentů se vykresluje správně.** Výběr agenta, režim, projekt, složka a „Spustit“ mají stejnou výšku 44 px (cíl pro klik podle WCAG 2.2). Rozbalená nabídka agentů dřív ležela pod kartami pod ní a prosvítala skrz ně, teď je nad nimi. Nová výška je ve stupnici velikostí v `docs/DESIGN.md` a hlídá ji `qa:tvary` i `qa:studio`.
- **Odkazy typu „Všechny →“ mají při najetí celý, nezaříznutý podklad.** Dřív měly vnitřní okraj jen 4 px.
- **Upozornění na telefon jsou přehlednější.** Dvě žluté bubliny textu nahradil jeden krátký řádek s tlačítkem „Spárovat telefon“ a jedna věta o doručování.
- **Ikony v Nastavení mají jednotnou stupnici.** Dlaždice v hlavičce karty 44 px s ikonou 22 px a vlastním podkladem (dřív 40/18 a splývalo s kartou), ikony ve volbách 36/20 px.
- **Vzhled agenta funguje spolehlivě na telefonu, tabletu i počítači.** Na telefonu se okno otevře jako spodní list s úchytem (stáhneš ho dolů a zavře se), náhled robota zůstává nahoře, záložky jsou v jedné řadě s posunem do strany a „Uložit vzhled“ je vidět pořád. Na počítači se nízká okna přizpůsobí výšce, na dotykových zařízeních mají záložky aspoň 40 px. Stránka pod oknem se nehýbe. Hlídá to nová kontrola na čtyřech velikostech (telefon, telefon naležato, tablet, počítač).

## 0.46.17 – 2026-10-17 · Aktualizace funguje i z Downloads a z DMG

- **Aktualizace aplikace spuštěné z Downloads nebo z DMG už nekončí chybou (#255).** Dřív po stažení aktualizace vyskočilo „Do složky …/AppTranslocation/… nejde zapisovat“: macOS spouští aplikaci otevřenou rovnou z Downloads nebo z DMG z dočasné cesty jen ke čtení a tam se nová verze nedala uložit. Agenteeq teď v takovém případě nainstaluje novou verzi do složky Aplikace (a když do ní nejde zapisovat, do `~/Applications`), restartuje se odtud a dřívější verzi vrátí, kdyby se nová nedala otevřít. Aplikace, která už je ve složce se zápisem, se vyměňuje na místě jako dřív. Poprvé z 0.46.16 na 0.46.17 ještě poběží starý aktualizátor: pokud Agenteeq spouštíš z Downloads nebo z DMG, přetáhni ho jednou do složky Aplikace.

## 0.46.16 – 2026-10-17 · Nový vzhled agenta, klidná upozornění a pravdivější stavy

- **Při otevřeném zvonečku stojí stránka pod ním.** Posouvá se jen seznam upozornění; po zavření jde stránka opět posouvat.
- **Vzhled agenta: nový dialog a šatník s 27 položkami (#255).** Dialog má vlevo živý náhled robota se jménem, podobou a barvou, vpravo záložky Hlava, Obličej, Oblečení a Převleky. U každé položky je robot přesně v tom, co by na sobě měl, takže se nevybírá naslepo. K dispozici je 8 čepic (kšiltovka, kulich, cylindr, koruna, párty čepička, čarodějův klobouk, sluchátka, kuchařská čepice), 5 doplňků na obličej (brýle, sluneční brýle, vizor, monokl, knír), 6 kusů oblečení (tričko, mikina, kravata, motýlek, šála, plášť) a 8 převleků na celé tělo (kosmonaut, dinosaurus, čaroděj, nindža, kuchař, pirát, superhrdina, kočka). Čepici, brýle a oblečení lze kombinovat. Dialog se na počítači vejde bez scrollování, na telefonu zůstává náhled nahoře. Dřív uložený vzhled zůstává platný.
- **Okno upozornění už nevyskakuje nahoru uprostřed rolování (#255).** Okno se překreslovalo při každé změně dat na pozadí (spojení, agenti), a tak se seznam postavil znovu a posuvník skočil na začátek. Překreslí se teď jen, když se upozornění opravdu změnila, a poloha rolování se zachová. Hlídá to skutečný test v prohlížeči (`npm run qa:studio`).
- **Spárování telefonu přes QR kód, bez opisování adresy (#255).** V Nastavení → Aplikace na tomto počítači stačí kliknout na **Spárovat telefon** a naskenovat QR kód: telefon otevře Agenteeq a spáruje se sám. QR nese jen adresu, na které Agenteeq opravdu naslouchá (domácí síť nebo Tailscale, mezi nimi jde přepnout); adresa na smyčce (`127.0.0.1`, `localhost`) se nikdy nekreslí, protože by z telefonu vedla do telefonu samotného. Funguje i při zapnutém samotném Tailscale. Okno na Macu se hned dozví, že telefon spárování dokončil, a použitý kód schová. Druhé otevření téže adresy řekne „kód už jednou posloužil“, ne „vypršel“. QR je i v tmavém režimu tmavý na bílém a větší (232 px), aby ho foťák zachytil. Číselný kód a adresa zůstávají jako záloha bez foťáku.
- **Kratší a pravdivější texty v aplikaci i rozšíření (#255).** Zmizela vata typu „na jednom místě“, „ty máš prostor na to podstatné“ nebo „Nainstaluješ ho za minutu“ a vysvětlivky, které opakovaly text o řádek níž (Tailscale, rozšíření v Nastavení, výčty služeb). Opravené jsou věty, které slibovaly víc, než aplikace dělá: úvod už netvrdí, že Agenteeq sám rozpozná plány a ověřené náklady za API (doplní je správcovský klíč), okno rozšíření neslibuje „Ozvu se“, Nápověda neodkazuje na průvodce, který na stránce není, a věta o soukromí u napojených modelů říká totéž co dialog napojení: hesla ani klíče Agenteeq neuvidí a z webových chatů nedostane text zpráv. Upozornění o soukromí, bezpečnosti, štítky Beta i „Nepodařilo se zjistit“ zůstaly beze změny.
- **Pomocník odpovídá na 20 nejčastějších otázek k Agenteeq – česky i anglicky, i s překlepy a bez diakritiky.** Agenti, schvalování povolení, otevření konverzace, spuštění agenta, limity, útrata, rozpočet, projekty, dovednosti, rozšíření pro Chrome, telefon a QR kód, aktualizace Stabilní/Preview, účet a synchronizace, upozornění, hooky Claude Code, Codex, soukromí, vzhled, jazyk a chybějící zdroje agentů. Každá odpověď vede tlačítkem rovnou na správné místo v aplikaci a říká i to, co Agenteeq neumí (třeba schválit akci za tebe nebo přečíst limit aplikace ChatGPT). Dřív třeba „Jak připojím telefon?“ poslalo do Napojených modelů a „Jak se odhlásím?“ skončilo obecnou otázkou. Na otázky mimo aplikaci (počasí, psaní kódu, zdraví) Pomocník poctivě řekne, že s nimi neporadí, a nabídne další krok místo hledání v konverzacích. Všechno běží na tomto počítači bez placeného API.
- **Vyváženější značka v hlavičce.** Hlava robota vedle nápisu „Agenteeq“ byla opticky menší než písmena. Teď je zhruba stejně vysoká jako velká písmena nápisu a mezera mezi logem a nápisem je všude stejná – v postranním panelu aplikace, v okně rozšíření pro Chrome i v hlavičce webu (na počítači i na telefonu). Samotné logo ani jeho proporce se nemění.
- **Čistá instalace vypadá záměrně, ne rozbitě.** Bez agentů, projektů a připojených zdrojů ukazuje každá obrazovka jeden prázdný stav s robotem, krátkou větou, co tu bude, a jednou hlavní akcí, která opravdu něco udělá (zkontrolovat zdroje dat, spustit agenta, založit projekt, nastavit upozornění, propojit API). Zmizely dlaždice s nulami a prázdná mapa aktivity ve Statistikách, „V pořádku, nikdo nepracuje“ se čtyřmi nulami na Přehledu, filtry s nulami nad prázdným seznamem Agentů a Upozornění a zdvojené „Nový projekt“. Útrata už neukazuje účty Claude Code a Codexu jako „Nelze ověřit“, když na počítači vůbec nejsou, a detail agenta rozliší „nenalezen“ od „nepodařilo se načíst“ s nabídkou zkusit znovu. Česky i anglicky; prázdný profil teď měří i `qa:tvary` a `qa:contrast` (issue #255).
- **Lišta na Macu neukazuje jistou nulu, když stav agentů chybí.** Vzdálený Claude Code (spuštěný v cloudu, z webu nebo z telefonu) zná Agenteeq jen ze seznamu relací, který si ukládá Claude Desktop. Když ho Claude Desktop delší dobu nenačetl, lišta hlásila „0“, i když agent podle posledních dat pracoval. Teď ukáže „?“ (nebo „2+“, když další pracují jistě) a popisek řekne, u kolika agentů chybí čerstvý stav. Číslo se navíc počítá ze stejného výběru jako Přehled a rozšíření, takže podřízený agent ani starší běh plánované úlohy se nepočítají dvakrát.

## 0.46.15 – 2026-10-16 · Aktuální Preview kandidát se sjednoceným changelogem a distribucí

- **Všechna funkční vylepšení od veřejné 0.46.12 v jednom kandidátu.** Bezpečnější aktualizace a restart Apple Silicon aplikace (včetně zaseknuté služby, potvrzení před ukončením vlastních agentů, návratu původního balíčku při chybě), pravdivý průběh přenesených dat a fáze instalace. Běžný Quit a skutečná výměna balíčku mají nativní macOS regresní QA.
- **Agentovy limity a rozhodnutí jsou pravdivější.** Potvrzený vyčerpaný Codex limit patří mezi problémy vyžadující pozornost, ne mezi čekání na další zadání; upozornění nepřetékají scrollováním do pozadí a odhlášení účtu vyžaduje potvrzení.
- **Nové prémiové rozhraní.** V detailu jednotlivého agenta je volba vzhledu včetně doplňků; přehlednější Dovednosti a kompaktnější editor projektu; minimalistické ruční obnovení; opticky větší symbol synchronizace.
- **Chrome rozšíření: jedna hlavní věc a časová osa.** Prioritní karta, agenti i chaty napříč nástroji, pravdivé stavy připojení, klávesové ovládání, světlo/tma a aktuální promo screenshoty. Okno se nyní při 320px šířce či větším přiblížení vejde celé bez vodorovného scrollu; skutečné browser QA hlídá pravý okraj hlavičky.
- **Web Mac i Windows.** Česká i anglická úvodní a instalační stránka přizpůsobí postup systému návštěvníka s možností ručního přepnutí. Opravena přesnost plynulého scrollování ve WebKitu i při zpomaleném vykreslování.
- **Integrita vydání.** Starší neměnný tag `v0.46.14` je na již otestovaném commitu `43fbc39`, který předcházel opravě textů `CHANGELOG` a in-app `Co je nového` v PR #268. V0.46.15 je nový kandidát z novějšího zdroje, nikoli přepsání tagu ani dřívějšího Draftu. Vydání smí vzniknout až po vlastním 8/8 main CI, CodeQL a nezávislém auditu osmi příloh. Veřejné Preview, Chrome Web Store a instalovaný Mac se automaticky nezmění pouze změnou čísla.

## 0.46.14 – 2026-10-16 · Aktualizace Macu bez zaseknutí a vlastní vzhled agentů

- **Nové okno rozšíření pro Chrome: jedna hlavní věc.** Velké číslo s počtem agentů zmizelo. Nahoře je skleněná karta s tím, co tě teď potřebuje – nástroj, název, důvod („Čeká na povolení: Bash“) a tlačítko **Otevřít konverzaci**, které ji otevře přímo v aplikaci (schválit z okna nic nejde, proto netvrdí „Rozhodnout“). Aplikaci jako celek otevírá značka **Agenteeq ↗** v hlavičce – v okně tak nejsou dvě skoro stejná tlačítka „Otevřít“ a pata zmizela; sledované služby a port jsou v hlavičce vedle obnovy, ověření stránky u řádku aktuální karty. Když tě potřebuje víc agentů, karta má stránkování se skutečným počtem („1 / 3“), šipky a ovládání šipkami na klávesnici; nové rozhodnutí jen označí šipku tečkou, okno samo nikam nepřeskočí. Bez rozhodnutí karta ukáže pracujícího agenta, odpovídající chat v jiné kartě (**Přepnout na kartu**), nebo klid.
- **Co se děje: agenti, chaty a poslední konverzace v jednom seznamu.** Pod kartou je časová osa Teď / Dnes / Dříve s logy nástrojů a služeb: pracující agenti s aktuální činností, chaty otevřené v kartách (s titulkem karty) a až 8 posledních konverzací z aplikace napříč nástroji – Codex, Cursor, Ollama, Grok, Qwen… Filtr Vše · Agenti · Chaty, ovládání šipkami a Enterem. Okno dostává jen titulek, nástroj, stav a čas; žádné přepisy ani cesty.
- **Poctivé „nezjištěno“.** Když Agenteeq nevidí výpis procesů nebo aplikace neběží, okno píše „Agenti na počítači: nezjištěno“ – nikdy „nikdo nepracuje“ ani nulu.
- **Bez aplikace: proč ji mít a jedna výzva.** Okno řekne, že Agenteeq na tomto počítači neběží, ukáže, co aplikace umí, a nabídne jediné hlavní tlačítko **Stáhnout Agenteeq**; znovu to zkusí obnova v hlavičce. Chaty v kartách, které rozšíření vidí samo, se ukazují i bez aplikace a bez spárování. Spárování jednorázovým kódem (16 znaků), port aplikace, sledované služby a ověření stránky zůstávají – služby a port i ověření jsou teď list nad oknem.
- **Vzhled aplikace i v okně.** Okno přebírá vzhled Obloha: mlha a inkoust, sklo s bílou hranou, tichá atmosféra, pigmenty stavů a inkoust jako hlavní akce – stará fialová je pryč. Světlý i tmavý režim, 380 × 600 px, funguje i na 320 px a při zvětšení 200 %. Pohyb reaguje na akci (okamžitý stisk, nástup položek, přeskládání při filtru, podsvícení nové položky); smyčkou se hýbe jen tečka u pracujícího agenta a při omezení pohybu se nehýbe nic.
- **Web rozlišuje Mac a Windows:** úvodní stránka i instalace (CZ/EN) automaticky volí postup pro návštěvníkův systém a nabízejí ruční přepnutí. Windows je nadále označené jako beta; přímé odkazy na systém respektují volbu, stránka funguje i bez JavaScriptu. Produkční nasazení a fyzické Windows UAT jsou samostatné brány.
- **Přesný dojezd webového scrollování ve WebKitu.** Plynulé posouvání i při zpomalených snímcích dojede na cílovou pozici; přidaný regresní test hlídá 400px kolečko bez změkčení přísného browser QA.
- **Opticky vyvážená ikona cloud synchronizace.** Samotný symbol mraku je větší, jeho 40px dlaždice i ostatní ikony se nemění.

- **Aktualizace z aplikace se už nezasekne a aplikace jde vždy ukončit.** Po „Aktualizovat a restartovat“ zůstávala aplikace na „Instalujeme…“ a nešla zavřít ani z Docku. Teď plášť před restartem sám zastaví službu s pevným časovým limitem a pojistka aplikaci ukončí i tehdy, když by macOS ukončení nedokončil. Pomocník výměny si poradí i se zaseknutým starým procesem (vždy ověří, že jde o Agenteeq). Stejná pojistka platí pro ⌘Q a Ukončit z Docku: aplikace skončí nejpozději do 15 s, i když služba neodpovídá. Ověřuje to nový test `npm run qa:update`, který na macOS v CI skutečně aktualizuje sestavenou aplikaci, a to i se zaseknutou službou.
- **Rychlejší aktualizace se skutečným průběhem.** Stahování ukazuje opravdová data (stažené MB z celku) a jde schovat na pozadí. Nová verze se rozbaluje rovnou vedle aplikace, takže odpadla jedna celá kopie. Načítací scéna při instalaci ukazuje pruh, který se doplňuje po skutečně dokončených krocích (rozbalení, podpis, uložení, restart). Průběh každé aktualizace se zapisuje do `~/Library/Logs/Agenteeq/update.log`.
- **Ukončení s běžícími agenty se zeptá.** Když běží agenti spuštění z Agenteeq, ⌘Q, Ukončit z Docku i aktualizace se nejdřív zeptají, protože je ukončení zastaví. Při odhlášení nebo vypnutí Macu se aplikace neptá a skončí hned.
- **Nenápadné obnovení dat.** Při ruční aktualizaci již nepřekáží velký animovaný robot a dvě informační věty. Zobrazuje se jediný srozumitelný stav, drobný indikátor a jemná průběžná linka bez vymyšlených procent. Běžné ovládání aplikace zůstává dostupné a omezený pohyb je respektován. Nový vzhled průběhu je součástí kandidáta 0.46.14.

- **Vzhled agenta upravíš přímo v jeho detailu.** Odpadl globální výběr agenta z Přehledu i systémové rozbalovací nabídky. Přidal se výběr barvy, podoby a drobných vektorových doplňků; změna je uložená jen pro vybraného agenta a jeho oprávnění se nemění.

## 0.46.13 – 2026-10-14 · bezpečnější aktualizace a pravdivé stavy

- **Aktualizace Macu se nesmí změnit v past.** Nativní instalátor před rozbalováním ukazuje stav, nabízí ukončení, po selhání vrátí původní rozhraní a při chybném spuštění nového balíčku obnoví předchozí verzi. Opravy jsou zatím ve zdroji, nikoli v již vydaných 0.46.12 binárkách; skutečný upgrade na Macu se ještě musí ověřit.
- **Kolečko myši uvnitř upozornění už nescrolluje podklad.** Konec seznamu zastaví scrollování uvnitř popupu. Odhlášení vyžaduje potvrzení; smazání účtu ho mělo již dříve.
- **Vyčerpaný limit Codexu nesmí vypadat jako čekání na zadání.** Potvrzené 100% vyčerpání 5hodinového nebo týdenního okna se promítá do stavu agenta, upozornění a hlavního panelu „Vyžaduje pozornost“. Po obnovení kapacity se blokace odstraní; samotný nulový zůstatek dodatečných kreditů neblokuje předplatné.
- **Přehlednější Dovednosti a editor projektu.** Vyhledávání Dovedností začíná vlevo a řazení zůstává vpravo. Editor projektu ve stísněném okně nechává Uložit a Zrušit dostupné, obsah scrolluje uvnitř a obrázky projektu a zákazníka jsou na širší obrazovce vedle sebe; nahrávání a ořezání dál funguje.

- **Plynulejší Agenti i se stovkou konverzací.** Při otevření obrazovky se karty doplňují po dávkách a každá dávka přepočítala vzhled všech dosavadních karet; se 140 agenty tak vznikaly zaseknuté snímky 50–110 ms. Karty mimo okno se teď vykreslí, až k nim stránka dojede, dávka jen připojí nové karty a oči robotů sledují kurzor bez měření robotů mimo okno. Vzhled karet se nemění.
- **Viditelný fokus v poli zadání agenta.** Rámeček, který jediný ukazuje, že píšeš do pole zadání, měl ve světlých vzhledech kontrast jen 2,0:1 proti okolí a snadno splýval. Teď má 3,1:1 proti okolí a 3,9:1 proti ploše pole (WCAG 2.2 AA, kritérium 1.4.11 chce aspoň 3:1), v tmavých vzhledech přes 7:1.
- **Popis vydání na GitHubu říká pravdu o kanálu.** U Preview už nedoporučuje instalaci jedním příkazem v Terminálu jako rovnocennou cestu – ta instaluje vždy nejnovější stabilní verzi, takže by místo Preview nainstalovala starší vydání. Interní odstavce o stavu z CHANGELOGu („dosud nevydaný“, „Dostupnost“) se do veřejného popisu nepřepisují; u 0.46.12 tak zveřejněné vydání tvrdilo, že nevyšlo. Kanál zná až zveřejnění (`publish.yml`), koncept o něm nic netvrdí.
- **Anglické rozhraní bez českých zbytků.** Titulek průvodce „ChatGPT, Gemini a Claude.ai taky.“, ukázka „Claude · Limit 5 h“, „v“ před počtem konverzací ve Statistikách, průběh úkolů a kontext v detailu agenta, popisky počtů v přehledu účtu i odznak v nabídce už jsou přeložené. `test/i18n.test.mjs` nově hledá i češtinu bez diakritiky: předložku přilepenou před dosazenou hodnotu a větu v poli rozhraní mimo `tr()`.
- **Správné tvary podle počtu.** „Další 3 jsou v sekci Agenti“ místo „Dalších 3 je“, „3 potřebují tebe“, „1 selhal“, „1 nalezená konverzace“, „1 nepřečtené“ a „A další 2“. Dlaždice Stav agentů, odznak v nabídce a přehled účtu berou popisek z jednoho místa (`public/js/stav-vety.js#popisPoctu`); místo „limit“ stojí „na limitu“, které sedí ke každému číslu.
- **„ze 4“, „ze 7“, „ze 20“.** Před číslem, které se čte od s, z, š, ž nebo skupiny souhlásek, píše aplikace „ze“ – v průvodci nastavením („0 ze 4 hotovo“), u limitů („0 ze 7 s měřeným limitem“), u rozpočtů i v upozorněních ze serveru. Rozhoduje `public/js/predlozky.js#ze`, společný pro klienta i server.
- **Hodně agentů už nerozbije tvary.** Pod časovou osou je věta s počtem skrytých agentů a kapsle „Všichni agenti“ (dřív odkaz s ostrými rohy, na telefonu 52 px vysoký). Místo prázdné karty „+5“ pod kartami Právě teď stojí kapsle „Dalších 5 agentů v sekci Agenti“. `npm run qa:tvary` i `qa:contrast` nově měří stav s 16 agenty navíc (`scripts/qa-agenti.mjs`), takže to CI pohlídá.
- **Dlouhé názvy konverzací končí celým slovem a „…“.** Dřív se useknuly po 100 znacích uprostřed slova. Celý název nese nové pole `fullTitle` a ukáže se v bublině nad kartou Právě teď a na časové ose.
- **Upozornění na limit bez sekund.** „Obnoví se 13. 10. 2026 04:09“ místo „4:09:56“.
- **Osa grafu tokenů mluví jako čísla vedle ní:** „2 tis.“ a „1,5 M“ místo „2k“ a „1,5M“.
- **Web nabízí aktuální Preview i bez spojení s GitHubem.** Odkaz „0.46.12 Preview pro Mac“ na hlavní stránce a na stránce Instalace (česky i anglicky) vede přímo na zveřejněné 0.46.12; dřív na 0.46.6 ukazoval, dokud se stránce nepodařilo dotázat GitHubu na novější verzi. README, ROADMAP a RELEASE-READINESS uvádějí 0.46.6 jen jako předchozí Preview.
- **Rozšíření nenabízí „novou“ verzi, která je starší.** Okno rozšíření i Nastavení porovnávaly verze jako text, takže rozšíření z Chrome Web Store novější než aplikace hlásilo „Je k dispozici verze 0.46.0, Chrome ji nainstaluje sám“. Teď se verze porovnávají podle čísel a rada „aktualizuj rozšíření“ se ukáže, jen když má aplikace opravdu novější verzi.
- **„Nepodařilo se ověřit“ místo „Agenteeq neběží“.** Když aplikace běží, ale rozšíření se s ní nepodaří ověřit, okno dřív tvrdilo, že Agenteeq na počítači neběží, a nabízelo stažení – nebo vyzvalo ke spárování, i když spárované bylo. Teď řekne „Nepodařilo se ověřit spojení s Agenteeq“ a za pár sekund to zkusí znovu samo.
- **Vzdálení agenti Claude Code s čerstvějším stavem 🧪.** Stav se dosud bral jen ze seznamu relací v cache Claude Desktopu, který se ukládá jen občas. Agenteeq teď stav relace najde v kterémkoli uloženém dotazu Claude Desktopu – například v detailu otevřené relace, když je čerstvější – a použije nejnovější z nich. Jestli Claude Desktop takový dotaz ukládá, zatím není na Macu ověřené; když ne, nic se nemění.

## 0.46.12 – 2026-10-14 · živé stavy vzdálených agentů a vyladění produktu

- **Vzdálení agenti Claude Code znovu pracují.** Claude Code spuštěný v cloudu z Claude Desktopu (nebo z webu a telefonu) se v Přehledu nikdy neukázal jako pracující a čekání na tvé rozhodnutí se od něj nikdy neohlásilo: stav se poznával podle hodnot, které Claude neposílá. Teď se čte stav i ve tvaru, v jakém ho posílá server („SESSION_STATUS_RUNNING“, skupina „WORKING“ / „BLOCKED“ / „FAILED“, „need_input“), a otázka agenta se ukáže v kartě rozhodnutí. Když Claude Desktop novější stav neuložil, karta neříká „Hotovo, čeká na další zadání“, ale „Při posledním načtení pracoval · novější stav Claude Desktop neuložil“; novější uložený přepis s rozběhnutým tahem má přednost. Nastavení → Zdroje agentů ukazuje, kdy Claude Desktop seznam relací naposledy uložil.
- **Přesnější právní evidence (bez spuštění nových podmínek):** technické CZ/EN privacy upozornění na GitHub kontrolu aktualizací a zákaz citlivých GDPR žádostí ve veřejných Issues pochází z PR #221; obě živé stránky také uvádějí pravdivé datum poslední aktualizace 13. 10. 2026 místo neaktuálního tvrzení o účinnosti od 27. 9.; pracovní právní přehledy nyní správně rozlišují tuto dílčí opravu od nevyřešené identity správce, neveřejného GDPR kontaktu, retenčních dob a právní revize (#232). Automatický test brání návratu zastaralého interního popisu. Nejde o certifikaci, právní schválení ani zveřejněnou novou verzi aplikace.
- PWA a Apple ikony nyní používají stejnou širokou hlavu s bílou anténou jako skutečně instalovaná Mac aplikace. Dřívější rastrové ikony měly odlišný tvar a fialovou anténu; CI je nově obrazově porovnává s oficiálním SVG.
- Náhledy Přehledu na českém a anglickém webu jsou znovu zachycené ze současné ukázkové aplikace. Číslo neveřejné zdrojové verze je v marketingovém snímku skryté, aby nevypadalo jako dostupná aktualizace.
- **Nastavení → Propojení si u nováčka neprotiřečí.** Řádek Claude Code a Codexu v „Napojených modelech“ psal „Agent na tomto počítači“ bez ohledu na to, jestli se program našel, a o dvě karty níž „Zdroje agentů“ hlásily „Claude Code na tomto počítači není“. Teď každá sekce říká jen to, co sama ověřila: Napojené modely ve štítku přítomnost programu a přihlášení (Nepodařilo se zjistit / Program nenalezen / Nenapojeno / Napojeno) a v podtitulku „Programovací agent“ s tím, kdy tu naposledy pracoval; Zdroje agentů to, jestli na počítači našly konverzace („Na tomto počítači nejsou žádné konverzace Claude Code“).
- **Vyčerpaný limit česky a anglicky.** Místo surové hlášky „You've hit your session limit · resets 11pm (Europe/Prague)“ stojí v Agentech, v kartě rozhodnutí, v detailu i v upozornění věta z rozpoznaných údajů: „Limit relace vyčerpán · obnoví se 12. 10. 23:00“, anglicky „Session limit used up · resets 12/10, 23:00“. Surová hláška zůstává jen tam, kde se ji rozpoznat nepodařilo, a v přepisu konverzace.
- **Čas obnovy limitu v zóně z hlášky.** Claude Code uvádí u obnovy zónu účtu („resets 11pm (Europe/Prague)“); čas se dřív bral v zóně počítače a na počítači v jiné zóně vyšel o hodiny vedle. Zóna se teď převádí přes Intl, správně i přes přechod letního času; neznámá zóna se nehádá.
- **Odpověď agentovi na limitu.** Se známým časem obnovy by odpověď skončila stejnou hláškou, proto se pole nenabídne a místo něj stojí „Agent je na vyčerpaném limitu. Odpovědět půjde po jeho obnově.“ Bez známého času obnovy (stav je jen odhad) odpovědět jde – limit se mezitím mohl obnovit – a poznámka pod polem to říká.
- **„Vyčerpáno“ se vejde do ukazatele.** Slovo v ukazateli limitu se dotýkalo oblouku; teď se jeho velikost řídí šířkou ciferníku a malý ukazatel je o něco větší.
- **Průvodce na Přehledu.** Nesplněný první krok zní „Najít agenty na tomto počítači“ místo „Agenti na tomto počítači nalezeni“ a tlačítka v kartách stojí na jedné linii.
- **Nastavení bez kolize s horní lištou.** V aplikaci pro Mac se lepivý nadpis Nastavení s akcemi vpravo nahoře (Připojeno, obnovit, hledat, upozornění) při otevření posunul o 100 px dolů a stál přes první kartu každé sekce. Lišta teď zůstává tam, kde stojí, nahoře v jedné linii s levým panelem, podmenu v jedné linii s nadpisem sekce, a při posouvání akce plynule ustoupí. Na užších oknech už nad lištou neprosvítá posouvaný obsah.
- **Aktualizace: dvě volby, dvě skupiny.** Kanál (Stabilní / Preview) a způsob (Ručně / Automaticky) mají vlastní popisek a mezi sebou vzduch, obrysy vybraných karet se už nedotýkají.
- **Útrata říká, co se počítá.** U starších ručních záznamů i u součtů stojí, že se do součtů, prognózy ani rozpočtu nepočítají. Dialog Rozpočty bez připojených nákladů za API řekne, že se rozpočet do té doby neukáže ani neupozorní.

**Stav 14. 10. 2026: zveřejněné Preview** ([v0.46.12](https://github.com/martin-pok/agentree/releases/tag/v0.46.12), 06:45 UTC) s 8 ověřenými přílohami pro Mac, Windows a Chrome. Fyzické vyzkoušení na zařízení (instalace, aktualizace, přihlášení, Windows a Chrome) před zveřejněním neproběhlo. Stable Latest zůstává `v0.46.0`; Chrome Web Store se aktualizuje samostatně.

## 0.46.11 – 2026-10-13 · aktuální značka a bezpečnější distribuce

**Dostupnost:** tato sekce popisuje obsah verze 0.46.11 ve zdrojovém kódu. Až úspěšné CI, nový neměnný tag, skutečné binárky, nezávislý SHA-256 audit, UAT a zveřejnění Preview potvrzují, že je aktualizace dostupná. Nestačí nový commit nebo neveřejný Draft. Stable Latest a Chrome Web Store se aktualizují samostatně.

### Co se změnilo

- **Jeden oficiální robot napříč platformami:** odstraněné historické nativní soubory `desktop/Agenteeq-icon.png`, `desktop/Agenteeq.icns` a `desktop/windows/Agenteeq.ico` ze zdrojového Gitu. Mac generuje ICNS ze schváleného `desktop/Icon.swift`; Windows vytváří ICO z aktuálního SVG-odvozeného 128px Chrome/Dock masteru. Všechny malé varianty zachovávají proporce široké hlavy, dvě kapslové oči a jedinou bílou anténu.
- **Čisté instalační balíčky:** Windows po sestavení odstraňuje staré pomocné obrázky ze své distribuční kopie. CI navíc kontroluje *skutečný rozbalený Windows ZIP*, aby nemohl obsahovat starý PNG/ICNS nebo trojzubec; macOS již generuje a balí čistou nativní ikonu.
- **Správná ikona i na webu a ve Vercelu:** sedm jazykových webových vstupů a stránka 404 odkazují na stejnou sadu skutečného `favicon.ico` a kanonického robotího SVG. Přidané testy webových cest; samostatný avatar projektu ve Vercel dashboardu vyžaduje vlastní ověření.
- **Aktuálnější odkazy na veřejné Preview:** český i anglický web umí načíst informace pouze o skutečně zveřejněném GitHub Preview s kontrolovaným instalačním souborem a nabídnout jeho přesný changelog. Neveřejné Drafty, chybné assety ani stahování nepodložené SHA-256 se nikdy nepropagují.

### Ověření a distribuce

- Opravy mají regresní testy značky, nativních buildů, reálného Windows ZIPu a bezpečné volby vydání. Nezávislý audit osmi skutečných souborů verze **0.46.10** prošel, ale neprokazuje nic o nových binárkách **0.46.11**.
- Změny následují až po neměnném tagu 0.46.10. Staré Drafty 0.46.7 až 0.46.10 zůstávají nepozměněné. Distribuovat se musí pouze nový přesně otestovaný a schválený kandidát 0.46.11; reálné Mac/Windows/Chrome UAT, Google OAuth/avatar a publikace se nesmějí zaměňovat za CI.

## 0.46.10 – 2026-10-13 · bezpečnější instalace aktualizací

**Dostupnost:** popis změn sám o sobě nepotvrzuje zveřejnění ani instalaci aplikace. Ověř skutečně publikovaný GitHub release a jeho přílohy; soukromý Draft se přes automatický updater nenabízí. Chrome Web Store se aktualizuje samostatně a vyžaduje ověření veřejné verze.

### Co se změnilo

- **Bezpečnější instalace na Macu:** pokud se běžící Agenteeq do 60 sekund neukončí, aktualizační pomocník nepřepíše aplikaci za jejího běhu; odstraní pouze připravenou dočasnou kopii. K běžné výměně dojde teprve po skutečném ukončení procesu.
- **Přísnější kontrola staženého ZIPu:** před instalací a zobrazením v souborech se kromě velikosti a SHA-256 ověřuje také identita otevřeného souboru a odmítnou se podstrčené symbolické odkazy i při souběžné výměně cesty.

### Ověření a distribuce

- Regresní testy simulují timeout pomocníka, bezpečný restart po skončení procesu a souběžnou záměnu ZIPu za symbolický odkaz s totožným obsahem. PR #206 prošel 8/8 CI na své přesné větvi; to není důkaz UAT nového instalačního balíčku 0.46.10.
- Starší neměnné tagy a přílohy v0.46.9 a v0.46.8 se tímto releasem nepřepisují. Zveřejnění 0.46.10 jako Preview samo o sobě nemění stabilní GitHub Latest; Chrome Web Store vyžaduje zvláštní publikaci.

## 0.46.9 – 2026-10-13 · jistější aktualizace a rychlejší první agent

**Stav: zdrojový Preview kandidát; zatím není zveřejněný ani nainstalovaný.** Vydání vyžaduje CI pro přesný commit, nový neměnný tag, ověřený draft se skutečnými soubory, UAT a výslovnou publikaci v Preview. Stable Latest a Chrome Web Store se samotným commitem nemění.

### Co se změnilo

- **Přepínání Stable / Preview bez zbytečného stahování:** změna kanálu okamžitě ruší probíhající přenos již nepotřebného instalátoru a bezpečně uklidí částečný soubor. Opakovaná kontrola stejného kanálu stahování nepřeruší.
- **Ověření těsně před instalací:** Mac znovu kontroluje celé SHA-256 a velikost ZIPu uloženého na disku, odmítá změněný, smazaný i podstrčený soubor a nabídne nové stažení bez spuštění poškozené aktualizace.
- **Odolnost vůči chybným GitHub tagům:** updater nepřijímá číselné verze, které JavaScript neumí přesně reprezentovat.
- **První konverzace Claude Code:** když poprvé vznikne adresář `projects/`, jednorázová následná kontrola zachytí JSONL i při ztracené události sledování. Bez trvalého procházení uživatelovy domovské složky.
- **Stejné ikony rozšíření v balíčku a Store podkladech:** build kontroluje binární shodu schválených PNG, aby podklady obchodu neobsahovaly odlišnou ikonu než skutečné Chrome rozšíření.

### Ověření a dostupnost

- Automatizované regresní testy se vztahují na popsané změny; jejich úspěch sám o sobě nepotvrzuje instalaci ani aktualizaci na skutečném Macu.
- Soubory v dřívějším neveřejném draftu **v0.46.8** zůstávají beze změny. 0.46.9 bude dostupná teprve po vytvoření a schválení vlastního vydání. Aktuální veřejné Preview zůstává **v0.46.6**, Stable **v0.46.0**.

## 0.46.8 – 2026-10-12 · rychlejší návrat k agentům a spolehlivější aktualizace

**Stav: Preview kandidát.** Tato sekce popisuje kód připravovaný do verze 0.46.8, nikoli
již publikovanou instalaci. Dostupnost vyžaduje zelené 8/8 CI na přesném SHA, bezpečný
sestavený balíček, živé UAT a zveřejnění GitHub Preview. Chrome Web Store má vlastní
publikační proces; žádný soubor z tohoto commitu se automaticky neobjeví v obchodě.

### Co uvidíš po instalaci vydané verze

- **Kliknutí z Chrome do aplikace:** existující lokální agent se otevře přímo v nativním okně, bez neautorizované karty localhostu a bez spuštění duplicitního procesu.
- **Filtry rozšíření:** Vše / Odpovídají / Limity; pravdivé upozornění na offline stav a automatické zotavení bez historických počtů.
- **Stejný počet agentů:** Chrome a desktop vycházejí ze stejného výběru; SSE po opětovném připojení nepřehraje staré události přes nový snapshot.
- **Lepší aktualizace:** velký archiv se ukládá po částech a dokončí až po ověření SHA-256; stejný současný požadavek sdílí jeden download, přepnutí kanálu nespustí starý instalační balíček.
- **Google fotografie:** při chybném primárním odkazu se zkusí pouze bezpečně ověřený alternativní obrázek; žádné libovolné externí hosty.
- **Poctivý web:** strukturovaná data nepředstírají zveřejnění vývojové verze; publikovaná verze se musí shodovat se stažitelnými přílohami.

### Před zveřejněním

- Kandidát musí projít CI na konkrétním commitu a musí být připravené, ověřené a nepřepisované release přílohy.
- Google OAuth/avatar, skutečný návrat do Terminálu/iTerm/Warp a průchod instalace/aktualizace na Apple Silicon Macu **nejsou potvrzené** pouze automatickými testy.
- Vydání Preview neovlivní stabilní Latest. Aktuální Chrome Store se nepovažuje za aktualizovaný bez ověření jeho veřejné verze.

### Technický přehled změn od 0.46.7

### automaticky sestavené release drafty

- Po kompletním zeleném CI na přesném commitu `main` se nová správně verzovaná aplikace sama připraví k sestavení jako **neveřejný** GitHub release draft, bez dalšího ručního kroku tagování či spouštění buildu.
- Přenos používá pouze již existující `release.yml`, očekávaný SHA commitu a kontrolu stejné verze v balíčku, extension, changelogu i „Co je nového“; nový commit nesmí dohnat zastaralý build.
- Žádné automatické publikování do Stable, Preview ani Chrome Web Store. Před zveřejněním zůstávají vyžadovány podpis/checksumy, reálný Mac UAT a schválení vlastníka.

### Chrome extension: pravdivá částečná detekce

- Pokud macOS výpis procesů selže, Chrome popup zobrazí varování i v okamžiku, kdy zná několik běžících nebo chybových agentů. Známé počty zůstávají, nejistota se neskrývá ani neduplikuje.
- API přenáší pouze boolean `procesyNevim`, žádný přepis, cestu ani soukromé údaje. Současné filtry konverzací zůstávají beze změny.
- Změna je **po tagu v0.46.7**; žádný už sestavený DMG ani veřejné rozšíření se nepřepisuje.

### přístup ke změnám přímo před aktualizací

- **Jasný changelog:** když je nová ověřená verze dostupná, Nastavení → Aktualizace nabízí odkaz na poznámky příslušného zveřejněného GitHub releasu, nikoli pouze číslo aktualizace.
- **Bez záměny draftu:** dialog „Co je nového“ ukazuje jen vydání, která jsou nanejvýš ve verzi skutečně nainstalované aplikace. Budoucí zdrojové záznamy se nevydávají za hotové a nainstalované.
- **CZ/EN a QA:** odkaz a historické filtrování mají anglickou lokalizaci a regresní testy. Novinka se projeví až v nové verzi aplikace; není to změna ve starších instalátorech.


### rychlejší a úspornější aktualizace

- **Jeden skutečný download:** souběžné kliknutí na stažení stejného balíčku využije jediný HTTP přenos a jeden bezpečně ověřený archiv místo zbytečného vícenásobného stahování.
- **Oddělené generace:** při přepnutí Stable / Preview či změně SHA-256 se starý požadavek nepřipojí k novému; nové vydání má vlastní stahování.
- **Obnova po chybě:** přerušený společný přenos uvolní stav pro opakování a na disku nenechá neúplný balíček. Tři regresní testy ověřují deduplikaci, výměnu otisku a retry.
- Změna vzniká po tagu v0.46.7; existující neveřejný draft a instalátory tím nejsou změněné.

### otevření existujícího agenta z Chrome extension

- **Přechod do nativní aplikace:** kliknutí na již zobrazeného lokálního agenta nově prochází pouze ověřeným tokenem rozšíření a přepne existující macOS okno. Neslibuje otevření localhostu v nové kartě Chromu, kde chyběla autorizace.
- **Oprávnění:** žádný klíč WKWebView, text přepisu, nový agent, shell ani širší oprávnění pro Chrome; požadavek musí být z tohoto Macu a z vlastní stránky popupu.
- **Ověření:** automatické testy tokenu, podvrženého původu, neznámého/archivovaného ID, nepřítomného desktopu a opakovaného kliknutí. Reálné UAT macOS zůstává samostatná podmínka.
- **Distribuce:** není součástí již sestaveného 0.46.7 draftu ani aktuálního Chrome Store balíčku.

### spolehlivější načtení profilové fotky

- **Google foto:** pokud Supabase vrátí neplatné `avatar_url`, aplikace zkusí alternativní `picture` místo prázdné profilovky. Obě adresy musí vždy projít stejnou kontrolou HTTPS a povolené Google CDN.
- **Testy:** kontrola škodlivé adresy, neplatného formátu, příliš dlouhé URL a priority validního primárního obrázku. Bez odesílání údajů mimo Google obrázkovou CDN.
- **Ověření:** jde o automaticky testovanou opravu metadat; skutečné zobrazení Google fotky v macOS UI stále vyžaduje UAT a není touto změnou prohlášeno za hotové.

### Chrome extension: pracovní filtr konverzací

- **Rychlé soustředění:** při více otevřených webových AI chatech je možné filtrovat Vše / Odpovídají / Limity, s pravdivým počtem v každém stavu. Přepnutí nevyvolá žádné síťové ani cloudové požadavky a respektuje uživatelem vypnuté služby.
- **Čerstvý stav má přednost:** otevřená karta používá diagnostiku skutečné stránky, ne starou hodnotu z background cache; ztráta aktuální diagnostiky nesmí skrýt dříve potvrzený chat.
- **Přístupnost a minimalismus:** tlačítka mají `aria-pressed`, fungují z klávesnice, při nulovém výsledku se zobrazí věta, nikoliv prázdná plocha. Filtry se u jedné konverzace neukazují.
- **Design QA:** odstraněna jednostranná mosazná linka u aktuální karty, místo ní subtilní celoplošné zvýraznění v design tokenech; nepřidává nové roboty ani ilustrace.
- **Kontroly:** regresní `node:test` + skutečné popup interakce v Chromium/WebKit při světlém a tmavém tématu, kontrola limitu Chrome 600 px. Tento kód **není** v již vytvořeném draftu v0.46.7 ani v Chrome Web Store.

### pravdivá verze na veřejném webu

- **SEO bez zavádějícího čísla:** veřejné JSON-LD `SoftwareApplication` už neuvádí vývojovou verzi z `package.json` jako veřejně stažitelnou. Nejnovější Stable a nepublikovaný Preview draft nejsou totéž.
- **Stejná pravidla CZ/EN:** obě jazykové varianty zachovávají validní strukturovaná data i odkaz ke skutečně zveřejněnému Stable a odstraňují neověřené `softwareVersion`.
- **Regresní testy:** sestaví skutečný web, parsují JSON-LD v obou jazycích a kontrolují existující odkazy GitHubu. Bez placených služeb, bez změny release tagů.

### živý stav po opětovném připojení

- **SSE a obnova spojení:** události ze starého spojení se po restartu místní služby už nedohrají přes nový snapshot. Tím se nemůže znovu objevit odstraněný agent ani přepsat novější stav.
- **20 současných agentů:** deterministické testy kontrolují obnovu, pořadí a jednorázové zpracování událostí bez přenosu přepisů nebo soukromých dat na cloud.
- **Bez vizuální regrese:** žádné nové UI ani runtime závislosti; Mac, webové zobrazení a přístup z telefonu používají stejnou logiku připojení.
- Tyto úpravy patří až do dalšího kandidáta, nikoli do už hotového draftu v0.46.7.

### jednotné počty agentů

- **Chrome extension počítá stejné agenty jako aplikace:** podřízené konverzace s viditelným rodičem se nezapočítají podruhé, u opakovaných naplánovaných úloh je v souhrnu pouze poslední běh.
- **Jeden výběr v kódu:** nativní/dashboard rozhraní i souhrn pro Chrome používají stejnou čistou funkci, takže se pravidla nerozcházejí při dalších změnách.
- **Regresní ověření:** syntetických 20 běžících agentů, rodič/pomocná vlákna, opakované úlohy, chybějící rodič a archiv; žádný text přepisu se rozšíření neposílá.
- Tato oprava je určená až pro nové vydání po draftu 0.46.7; nevkládá se zpětně do hotového DMG ani Chrome Store.

### úsporné a bezpečné stahování velkých aktualizací

- **Nižší paměťové nároky:** aktualizační ZIP se nepřidržuje celý v RAM; ověřuje se jeho SHA-256 postupně a ukládá se přímo do privátního dočasného souboru.
- **Atomické dokončení:** teprve po ověření přesné velikosti, obsahu a kanálu se soubor přejmenuje na finální ZIP; po chybě ani přerušeném spojení nezůstává neúplný balíček.
- **Souběžnost:** paralelní požadavky používají různé dočasné názvy; starý požadavek nesmí dokončit aktualizaci jiného kanálu.
- **Regresní testy:** osmimegabajtový proud bez volání `arrayBuffer`, přerušený přenos, špatný digest, překročená velikost i dva souběžné downloady.
- Jde o změnu zdrojového kódu pro budoucí vydání; již sestavený draft v0.46.7 se nemění.

### Chrome extension: pravdivý živý stav

- **Živá dostupnost:** otevřený popup každých 5 sekund ověří skutečnou dostupnost lokální aplikace, nejen cache posledních agentů.
- **Žádná falešná „Připojeno“:** při výpadku nebo selhání chráněného endpointu skryje staré počty a nabídne obnovení. Návrat aplikace se rozpozná automaticky, bez zavírání a otevírání popupu.
- **Subtilní značka:** rozhraní nepřidává dekorace ani roboty navíc, používá existující vizuální stavy a české/anglické texty.
- **Regresní ověření:** testy pokrývají neúspěšný HTTP health check, síťový výpadek, vyčištění starého stavu a návrat spojení.
- **Distribuce:** existující Chrome Store verze ani již sestavený macOS draft v0.46.7 se tím nemění.

### ochrana instalace Stable / Preview

- **Bez downgrade:** terminálový instalátor Stable nesmí přepsat novější Preview verzi již nainstalovanou na Macu. Prohlíží jen GitHub metadata a odmítne starší balíček ještě před jeho stažením.
- **Poškozená či neznámá verze:** pokud nelze z existujícího bundle ověřit číslo verze, instalátor jej odmítne přepsat.
- **Regresní testy:** scénáře Stable 0.46.0 proti Preview 0.46.6, víceciferná čísla verzí a neplatná metadata, včetně zachování původní instalace.
- Tyto úpravy vznikají **po vytvoření draftu v0.46.7** a nejsou součástí už připraveného DMG.

### spolehlivější aktualizace

- **Závody při přepínání kanálů:** staré HTTP odpovědi ani jejich chyby nemohou přepsat novější stav po přepnutí Preview → Stable → Preview.
- **Kontrola aktualizací:** stažený ZIP přestává být nabídnutý jako platný při změně SHA-256 nebo velikosti přílohy na GitHubu, i kdyby název a verze zůstaly stejné.
- **Stažení:** rozpracovaný požadavek nesmí dokončit aktualizaci, pokud byl v mezidobí přepnut kanál nebo změněn očekávaný digest. Regresní testy pokrývají souběžné požadavky bez skutečné sítě.
- **Vydání:** stávající neveřejný draft 0.46.7 stále odpovídá dřívějšímu tagu SHA `00daf73b`; tyto následné opravy se do již vytvořeného DMG zpětně nedostanou.

## 0.46.7 – 2026-10-12 · bezpečnější profilová fotografie z Googlu

- **Bezpečné načítání fotografie:** HTTP přesměrování se kontrolují před každým dalším síťovým požadavkem. Profilový obrázek se nikdy vědomě nestahuje z jiné domény než schválené Google CDN.
- **Přenos a velikost:** stahování fotky hlídá limit 300 kB průběžně; nepřiměřeně velký obrázek odmítne bez načtení celého obsahu.
- **Regresní testy:** kontrolují nebezpečná přesměrování, bezpečné přesměrování mezi servery Googlu a omezení velikosti streamu. CI workflow už nespouští dvě kolidující sady testů pro jednu vývojovou větev.
- **Stav ověření:** bezpečnostní scénáře byly ověřeny automatickými testy. Skutečné přihlášení Google, profilová fotografie a upgrade na uživatelském Macu vyžadují samostatné ruční UAT; Preview není stabilní vydání.

## 0.46.6 – 2026-10-12 · srozumitelná rozhodnutí agentů

- **Viditelná žádost o povolení:** stav „možná čeká na tvé povolení“ se zobrazí v Přehledu, seznamu agentů, detailu i projektu, pokud ho model odvodí. Není vydáván za potvrzenou interakci bez příslušných hooků.
- **Správná cesta ke konverzaci:** konverzace Claude Code nebo Codexu spuštěné z příkazového řádku odkazují primárně na Terminál; u stále běžící konverzace se nevytváří duplicitní nové pokračování.
- **Otázky v přepisu:** AskUserQuestion může ukázat přesné znění otázky a nabízené možnosti; nabídka je informační, vlastní odpověď probíhá v konverzaci.
- **Pomocník a živý stav:** „Co na mě čeká?“ bere dostupný stav agentů, místo hledání v historických konverzacích; chybějící načtení ani neověřené živé spojení se neprezentuje jako jistota.
- **Ověřování:** automatizované testy pokrývají chování konektorů, UI, přepis a odkazy. Otevření reálné konverzace a potvrzení dialogu na uživatelském Macu vyžaduje samostatné UAT.

## 0.46.5 – 2026-10-12 · volitelné aktualizace Preview

- **Stable / Preview:** v Nastavení lze zapnout testovací aktualizační kanál. Výchozí zůstává Stable. Režimy ručního a automatického stahování se nemění a instalace stále vyžaduje potvrzení.
- **Bezpečné nabídky:** Preview vyhledá nejnovější veřejné vydání podle čísla verze, nikdy ne koncept, a nabídne pouze balíček se správnou platformou, tagem, velikostí a SHA-256. Stažený obsah se dál kontroluje kryptografickým otiskem.
- **Bez nežádoucího downgradu:** návrat na Stable zruší starou nabídku Preview; opožděná odpověď ani stahování ji nemohou obnovit. Instalaci a chování na skutečném Macu je nutné před produkcí ověřit samostatně.

## 0.46.4 – 2026-10-12 · ověřené nativní ikony a bezpečnější instalace

- **macOS:** Dock používá skutečný distribuovaný `Agenteeq.icns` jako jediný zdroj ikony. Staré duplicitní ikony se do instalačního ZIPu nepřibalují; PNG náhled se generuje ze stejného souboru.
- **Windows:** ikona EXE se vytváří proporčně ze stejného zdrojového Dock masteru jako Mac a Chrome extension; její vzhled kontroluje automatický regresní test.
- **Ověřitelné stažení:** vydání obsahuje `SHA256SUMS.txt` s otisky skutečných instalačních příloh a během release buildu probíhá nezávislé ověření přes `sha256sum --check`.
- **Stav instalace:** testy sestavení ověřují artefakty a balení, nikoli to, jak se ikona vykresluje na konkrétním uživatelském Macu. Developer ID notarizace a živé UAT zůstávají otevřené.

## 0.46.3 – 2026-10-11 · stejná ikona v každé velikosti

- **Jednotný vizuální master:** stejný poměr stran bílé robotické hlavy, očí a antény na Docku, v menu baru, na webu a v Chrome extension; menší verze se jen proporčně škálují, nikoli překreslují.
- **Nativní a distribuční assety:** sjednocená macOS menu-bar kresba, reálné Chrome PNG soubory v rozlišení 16/32/48/128 px a stejná 128px ikona v Chrome Web Store.
- **Ověření:** regresní testy hlídají identitu SVG masterů, soulad exportů a rozměry PNG. Skutečná instalace macOS a finální zobrazení v Docku stále vyžadují kontrolu na zařízení.

## 0.46.2 – 2026-10-11 · spolehlivější připojení AI nástrojů

### Co se mění pro uživatele

- **Připojení Claude Code a Codexu:** stav „přihlášeno“ se potvrzuje až po ověření oficiálním CLI příkazem. Údaje o účtu a limitech se znovu načtou před potvrzením; případná nedostupnost dat je zobrazena místo nepravdivého úspěchu.
- **Všech devět podporovaných webových služeb v Nastavení:** ChatGPT, Codex web, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat a GitHub Copilot. U webových chatů aplikace správně označuje přijatá data z rozšíření, nikoliv neexistující OAuth autorizaci.
- **Spolehlivější návrat z prohlížeče:** první událost rozšíření se neztratí při otevírání webu a opožděný výsledek zrušeného přihlášení nepřepíše rozhodnutí uživatele.
- **Ochrana soukromí:** příchozí webové adresy musí odpovídat oficiální HTTPS doméně služby a neukládají se z nich parametry dotazu ani fragment.
- **Přihlášení do Agenteeq přes Google:** potvrzení přihlášení nezaměňuje autentizaci s dokončenou cloudovou synchronizací; ta má samostatný stav.

### Rozsah ověření

Automatizované regresní testy kontrolují autorizaci, běh dialogů, zrušení, datovou čerstvost, bezpečné domény a jazykové verze. **Živé přihlášení a instalace na skutečném Macu s daným účtem stále vyžadují UAT.** Nejde o potvrzení, že všechny služby nabízejí OAuth integraci nebo že okamžitě poskytují kompletní spotřebu a předplatné.

## Nevydáno

- **Web: instalace je plně ovladatelná i na telefonu (ve vývoji).** Česká i anglická instalační stránka nově používají totožné přístupné mobilní menu jako landing page; odkazy na Mac/Windows/rozšíření/potíže nezmizí pod breakpointem 900px. Automatické QA pokrývá i krátkou landscape obrazovku.
- **Web: lehčí produkční CSS (ve vývoji).** Build zachovává všechny vizuální deklarace i pořadí kaskády, ale odstraňuje pouze komentáře mimo CSS řetězce. Responzivita počítá s dotykovými tablety širšími než 900px. Nové regresní testy chrání pravidla i obsah řetězců.


- **Web: rychlejší a přesnější vykreslení (ve vývoji).** Odstraněno přednačítání nepotřebného Urbanist TTF; build přednačítá Satoshi WOFF2 jen tehdy, když je dostupné. Webové trackpady používají nativní plynulý posun a robotická hero scéna nepočítá parallax mimo viewport. CSS/JS mohou znovu použít validovanou cache.
- **Web: citlivá responzivita a přístupnost (ve vývoji).** Safe-area odsazení pro iPhone v landscape, čitelná šířka na velkých monitorech a minimálně 44px navigační dotykové cíle. Přidány breakpointové a laboratorní Web Vitals testy pro CZ/EN homepage, instalaci a zásady soukromí v Chromiu a WebKitu.
- **SEO (ve vývoji).** Webová ukázka rozhraní `/app` má vlastní `noindex` a crawler ji smí navštívit, aby značku respektoval. Šest veřejných stránek má regresní kontrolu canonical, hreflang, OG a priorit assetů. Skutečné Google PSI výsledky dosud nejsou ověřené; viz `docs/WEB-PERFORMANCE-AUDIT-0461.md`.


- **Oddělení limitů více Claude účtů (ve vývoji).** Pokud aplikace bezpečně rozpozná účet konkrétního běhu, jeho 5hodinové, týdenní a extra-usage okno již nebude sdílet stejné ID s jinou licencí. Úspěch u jiné licence nesmí odstranit její vyčerpaný limit. Neověřené víceúčtové údaje zůstávají neznámé, nikoli sloučené. Čeká na CI a ověření na skutečných účtech.


- **Přesnější přiřazení konverzací ke správnému profilu Claude Code (ve vývoji).** Když je identita konkrétního CLI profilu ověřená a přepis patří jednoznačně tomuto profilu, Agenteeq ji přiřadí ke konverzaci a aktualizuje její živý souhrn. Neznámé a kolidující profily se nepřiřazují odhadem. Ostatní poskytovatelé a kompletní per-account limity zatím zůstávají nedokončené.

## Nevydáno

### Co se změní pro uživatele ve verzi 0.46.1

> Následující změny jsou ve vývojové větvi. Nejsou automaticky dostupné v instalované aplikaci ani ve veřejném Chrome Web Store. Označení „vydáno“ vyžaduje samostatné ověření release.

- **Přehlednější hlavní okno na Macu:** obsah a horní akce už nezasahují do prostoru systémového záhlaví; banner průvodce byl odstraněn z Nastavení, kde překrýval horní ovládání. Průvodce samotný zůstává dostupný.
- **Živý počet pracujících agentů v horní liště macOS:** vedle ikony se zobrazuje aktuální počet; upozornění se s ním nepletou. Nula znamená žádnou právě evidovanou práci a pomlčka neznámý stav při výpadku. Počet se přepočítává i při časovém vypršení stavu.
- **Spolehlivější živý přehled:** aplikace odolává překrývajícím se SSE spojením a opožděným odpovědím API, které by jinak mohly vrátit staré údaje.
- **Srozumitelnější Pomocník:** drží polohu při čtení starších zpráv, poradí s fungováním aplikace a méně často nabízí nerelevantní navigaci.
- **Dovednosti mají v navigaci ikonu blesku.** Popisek nastavení pohybu se mění na „Omezit pohyb“ (EN „Reduce motion“).
- **Čistší identita značky:** rozšíření a podklady pro Chrome Web Store mají sjednocenou robotí hlavu; starý trojzubec a fialová anténa nejsou schválené motivy. Nový rozšířený filled logomark byl schválen pro Dock, jeho finální pixelově přesný vektor a aplikace do všech distribuovaných assetů stále vyžadují ověření.
- **Rozšíření pro Chrome:** přehlednější časové stavy a lepší zotavení z přerušení spojení; nové CZ/EN snímky jsou připravené v repozitáři, **nejsou dosud potvrzené jako veřejně zveřejněné**.
- **Sdílení prodejního webu:** česká i anglická landing page mají doplněná metadata pro obrázky na sociálních sítích. Produkční nasazení a SEO audit zůstávají samostatnými úkoly.

### Ověření a dostupnost

- **Zdrojový kód:** pracovní větev `work/app-extension-reliability-0461`, PR #130.
- **Automatické testy:** stav se posuzuje výhradně podle CI na přesném HEAD commitu.
- **Reálný Mac, Windows a Chrome:** ruční UAT dosud nelze označit jako hotové.
- **Veřejné vydání:** poslední ověřené GitHub vydání je `v0.46.0`; Chrome Web Store ještě vyžaduje nové publikování a kontrolu veřejné verze.


- **Hlava robota je stejná v macOS liště i ikonách aplikace.** Ikona vedle živého počtu agentů používá přesný tvar z oficiální značky. Náhled aplikace a ikona pro Windows už nemají starou fialovou anténu.
- **Rozšíření a podklady pro Chrome Web Store používají současnou značku.** Ikony rozšíření, hlavička okna a malí roboti v seznamu mají stejné proporce jako logo Agenteeq. České i anglické snímky a propagační plochy vycházejí z aktuálního světlého vzhledu a skutečného okna rozšíření.
- **Horní obsah v aplikaci pro Mac už nekoliduje se záhlavím.** Nadpis a horní akce začínají na stejné výšce jako levý panel, pod 44px oblastí tlačítek okna a tažného pruhu. Při zúžení okna zůstává hlavní obsah pod touto oblastí a navigace přejde dolů.
- **Pomocník drží místo v historii a odpovídá na obecné otázky.** Při čtení starších zpráv už nové vykreslení neposune chat na konec; automatický posun zůstává při vlastní zprávě a u dna. Na „Jak tahle app funguje?“ v češtině i angličtině vysvětlí Přehled, agenty, projekty a rozdíl mezi tokeny a účtovanými náklady bez nesouvisejících odkazů.
- **„Hotovo“ jen u agenta, který opravdu doběhl.** Karty v „Právě teď“ psaly „Hotovo“ u každé konverzace, která čeká na zadání – i když agent uprostřed práce přestal odpovídat nebo na zadání vůbec neodpověděl. Teď mají karty stejný štítek a barvu jako seznam Agentů a detail („Čeká na zadání“, „Potřebuje tebe“, „Pracuje“…) a pod ním skutečný důvod: „Hotovo, čeká na další zadání“, „Delší dobu bez aktivity“, nebo „Zatím bez odpovědi agenta“. Stejný důvod je u nedoběhlé konverzace vidět i na Agentech a v detailu a robot u ní neříká „Hotovo“. V boxu Stav agentů se počet jmenuje „potřebuje tebe“ jako všude jinde.
- **Detail konverzace neukazuje odpověď z předchozí konverzace.** Při přechodu z jedné konverzace do druhé se pod přepisem chvíli (a když se načtení nepovedlo, natrvalo) ukazovalo pole „Odpovědět agentovi“ nebo důvod, proč odpovědět nejde, z té předchozí.
- **Odpověď agentovi bez rizika rozdvojené konverzace.** Když se u běžícího Claude Code nepodaří zjistit, v jaké složce pracuje, nebo když se běh z Agenteeq teprve zastavuje, aplikace odpověď nepošle a řekne to. Složku běžícího agenta se navíc pokusí zjistit znovu, když se to napoprvé nepovede.
- **Pravdivější důvod, proč odpovědět nejde.** Místo „program claude se nenašel“ aplikace rozliší, jestli to systém zatím neumí (odpovídat jde jen na macOS), jestli se program teprve hledá, nebo jestli opravdu chybí.
- **Uložení rozpočtů už nezastaví kurz ČNB.** Dřív každé uložení Rozpočtů udělalo z denního kurzu ČNB ruční kurz, který se pak už neobnovoval. Teď se za ruční počítá jen kurz, který opravdu změníš. Kurz, který takhle zamrzl a od ČNB se liší jen zaokrouhlením, se sám vrátí k automatickému; jinak ho vrátí tlačítko „Použít kurz ČNB“.
- **Synchronizace nepřepisuje starší dny menšími čísly.** Do účtu se posílají jen dny, za které má počítač úplná data.
- **Vzdálený přístup nehádá.** Když se nepodaří zjistit, jestli je tunel nainstalovaný nebo jestli běží, Nastavení to řekne, místo „není nainstalováno“ nebo „neběží“. Návod k instalaci cloudflared odpovídá systému (Homebrew jen na Macu).
- **Příkaz pro pokračování na Windows.** Zkopírovaný příkaz pro pokračování v konverzaci Claude Code má na Windows tvar pro PowerShell a nerozpadne se ani u složky se znakem „&“ v názvu.
- **Pomocník nic nezakrývá.** Dokud je robot vpravo dole vidět, má obsah každé stránky dole rezervu na jeho tlačítko (na telefonu i nad spodní lištou). Poslední karta – štítek stavu v „Právě teď“, Detaily agenta, poslední konverzace v Agentech – se tak vždy dá odrolovat nad robota a ani prvek, na který přejdeš klávesnicí, pod ním nezůstane. Skrytý Pomocník místo nebere.
- **Přehled říká každou věc jednou.** Věta u pozdravu radí, co dál („Nejdřív rozhodni, co agent potřebuje – pak může pokračovat.“), bez počtů a bez vysvětlování, kde co je. Box Stav agentů má jednu větu se správným tvarem podle počtu („Čeká na tebe 1 agent / Čekají na tebe 2 agenti / Čeká na tebe 5 agentů“, „Selhal 1 agent“, „Na limit narazili 2 agenti“), čísla nesou dlaždice pod ní. Když se nepodaří zjistit, co na počítači běží, box to řekne i ve chvíli, kdy má přednost jiná zpráva.
- **Popisky filtrů běžnou sazbou.** Zdroj, Služba, Projekt v Agentech, Zdroj, Původ a Řadit v Dovednostech i dny v kalendáři už nejsou verzálky s prostrkáním.
- **Detail agenta bez dvojího tlačítka a prázdné plochy.** „Pokračovat v Terminálu“ je jen v kartě s požadavkem, ne ještě jednou v hlavičce. Karta s přepisem má přirozenou výšku: krátký přepis nenatahuje kartu do výšky bočního sloupce, dlouhý ho vyplní a dál se čte po kliknutí.
- **Agenti: počet sedí, tečka drží u textu.** Nápověda „Konverzace v prohlížeči se nesledují“ má vlastní kartu a nepočítá se mezi položky „Běží na tomto počítači, ale bez přepisu“. Zelená tečka pracujícího agenta už nevisí sama za čipem projektu – zalomí se vždy spolu se svým textem.
- **Pomocník rozumí tvarům slov.** „Najdi chat o fakturaci“ najde i konverzaci „platby a faktury“, „platby“ i „historie plateb“ nebo „platební brána“. Krátká slova se hledají jen celá, takže „plat“ nenajde „platformu“ a „data“ ne „databázi“.
- **Hledání nezdrží aplikaci a neříká nepravdu.** Celý dotaz má jeden časový rozpočet (dřív dostalo hledání mimo zadané období nový), přepisy se procházejí od nejnovějších a server mezitím odpovídá ostatním. Když se hledání nestihne dokončit, odpověď to řekne – nikdy netvrdí, že „v tom období nic není“. U velmi dlouhých konverzací se čte i konec, takže sedí, kdy konverzace naposledy pokračovala.
- **Úryvky konverzací neopustí počítač.** Odpověď formuluje jen model z Ollamy na tomto počítači: adresa mimo počítač se odmítne (a Pomocník to řekne), cloudové a embeddingové modely se nepoužijí. Přednost má model načtený v paměti, jinak nejmenší nainstalovaný.
- **Texty Pomocníka bez první osoby a mužského rodu**, např. „Možná hledáš některou z těchto voleb v aplikaci.“
- **Agent, jehož proces skončil, už „nepracuje“.** Když se Claude Code nebo Codex CLI ukončí uprostřed práce (zavřený Terminál, kill, pád), konverzace dřív ukazovala „Pracuje“ až 30 minut. Teď ji Agenteeq podle výpisu procesů do pár vteřin přepne na „Čeká na zadání“ s důvodem „Agent skončil uprostřed práce“ – nikdy na „Hotovo“ a bez upozornění na dokončenou úlohu. Když se výpis procesů nepovede, když ve stejné složce běží jiný proces téhož nástroje nebo když u procesu nejde zjistit složku, nic se nemění.
- **Pravdivé propojení s Claude Code.** Claude Code načítá propojení (hooky) jen při startu, takže konverzace, které běžely už před jeho zapnutím, žádnou událost nepošlou a jejich „čeká na tvé povolení“ zůstává odhadem z přepisu. Detail takové konverzace to teď řekne a nabídne pokračování v Terminálu (nebo zkopírování příkazu); přesný stav naskočí po novém spuštění Claude Code. Aplikace si pamatuje, kdy se propojení zapnulo – u propojení zapnutého ručně nebo starší verzí to poctivě neví a netvrdí „před zapnutím“.
- **Poznáš, když propojení nefunguje.** Když v konverzaci začaté po zapnutí propojení přijde zadání, ale z Claude Code žádná událost (jiný port, změněný klíč, nastavení přepsané jiným nástrojem, jiná složka nastavení `CLAUDE_CONFIG_DIR`), detail konverzace odkáže do Nastavení a karta Claude ukáže varování s „Zkontrolovat znovu“ a „Přeinstalovat propojení“. Karta zároveň ukazuje, kolik aktivních konverzací je propojených a kolik ne a proč. Nastavení Claude Code se kontroluje každých 30 s, takže vypnuté nebo přepsané propojení je vidět bez obnovení stránky.
- **Sestavení instalátoru DMG nepadá na „Resource busy“.** Finder po rozložení okna drží svazek ještě chvíli otevřený; odpojuje se teď zařízení disku (ne přípojný bod, který po prvním pokusu může zmizet), znovu s rostoucím odstupem, a vynucené odpojení přijde až v posledním pokusu.
- **Rozšíření pro Chrome mluví o stavu agentů správnou češtinou i anglicky.** Místo „Na tvé rozhodnutí čeká agentů: 1“ píše okno rozšíření totéž co aplikace – „Potřebuje tě 1 agent“, „Selhali 2 agenti“, „Na limit narazil 1 agent“ – a v anglickém Chromu větu konečně ukáže anglicky („1 agent needs you“), ne česky.
- **Klíč propojení s Claude Code už nestojí v nastavení Claude Code.** Příkazy hooků a stavového řádku dřív nesly klíč Agenteeq přímo v sobě, takže ho šlo vyčíst ze souboru `~/.claude/settings.json` (často čitelného pro všechny a čteného i jinými nástroji) a ze seznamu běžících procesů – a kdo ho měl, mohl Agenteeq podstrčit falešnou žádost o povolení nebo limity. Teď leží v souboru v datové složce Agenteeq, který čte jen tvůj účet, a příkaz na něj jen odkazuje (funguje i se složkou jako „Jan Novák/Design & Web“). Propojení zapsané dřívější verzí funguje dál; Nastavení u něj ukáže „Je potřeba obnovit“ a „Obnovit propojení“ ho zapíše nově – Agenteeq do nastavení Claude Code sám od sebe nesahá. Odinstalace soubor s klíčem smaže.
- **Sestavení vydání v GitHub Actions má jen ta práva, která potřebuje.** Zapisovat do repozitáře smí jen úloha, která zakládá tag, a úloha, která zakládá koncept vydání; sestavení aplikace pro Mac, Windows a rozšíření i testy mají token jen pro čtení a checkout bez uloženého tokenu. Cizí akce (nástroje Visual Studio pro Windows) je připnutá na konkrétní commit místo posuvné značky a jméno tagu ani vstup ručního spuštění se už nevkládají přímo do textu skriptu, takže se nedají vykonat jako příkaz. Dva běhy pro týž tag na sebe počkají místo založení dvou konceptů. Vydání dál vzniká jen jako koncept a zveřejňuje ho člověk. Hlídá `test/workflow-opravneni.test.mjs`.

## Web po vydání 0.46.0 – 2026-10-09

- Robot v sekci Soukromí jemně sleduje kurzor, když návštěvník používá myš; na dotyku a při omezeném pohybu zůstává v klidu.
- Ukázkový projekt má střídmý monogram místo výrazného provizorního loga. Český text na úvodu a stránce instalace prošel jazykovou úpravou; anglické texty zachovávají stejný význam.

## 0.46.1 – 2026-10-10 · Opravy brandingu a instalace

- Sjednocená dvoubarevná značka Agenteeq s bílou anténou napříč desktopovou aplikací, webem a Chrome extension.
- Nahrazeny zastaralé ikonové podklady rozšíření a odstraněn původní větvený symbol ze zdrojů propagačních vizuálů.
- Opraveno renderování podkladů Chrome Web Store pomocí Playwright; automatické snímky nyní čtou aktuální verzi rozšíření z manifestu.
- Rozšířené regresní testy brandingu a kontroly instalace na macOS a Windows.

## 0.46.0 – 2026-10-09 · Nový úvod webu s roboty, robotí profilové obrázky

- **Úvod webu ukazuje celou aplikaci.** Místo úzkého pruhu je pod nadpisem skutečný Přehled (pozdrav s robotem, pole pro zadání, rozhodnutí, stav agentů, roboti v „Právě teď“) v okně, které stojí nakloněné v prostoru a při posouvání se plynule narovná. Kolem okna roboti Agenteeq ve třech hloubkách – vzdálení malí a rozostření, blízcí velcí a rozostření, střední ostří – se skleněnými bublinami („Hotovo, testy prošly“, „Potřebuju tvé OK“). Na Macu se roboti lehce posouvají s myší. Roboti jednou přiletí a dál se hýbou jen s posouváním a myší (žádná smyčka); při omezeném pohybu je okno rovné a roboti stojí. Na telefonu zůstanou dva malí nad hranou okna, aby nic nezakrývali. Snímky vznikají z ukázkové scény skriptem `npm run shots:hero`.
- **Profilové obrázky jsou roboti.** 29 abstraktních obrázků v původní teplé paletě nahradilo 29 robotů ze stejného tvarosloví jako logo: liší se barvou, tvarem očí (kapsle, kulaté, šťastné, mrknutí, vizor, jedno oko, hvězdičky) a anténou (kulička, dvojitá, blesk, uši, srdíčko). Uložená volba zůstává na stejném pořadí. Vybraný obrázek má fialový kroužek značky místo okrového.
- **Dokončená stránka Stažení a Instalace.** Dlaždice rozšíření mají srovnané štítky i ovládání bez kolidujících linek, stažení pro Mac a Windows používá plné fialové ikony a instalační postup odpovídá skutečně nabízenému DMG nebo záložnímu ZIPu. Podklady pro Chrome jsou místní, takže vzhled nezávisí na načtení cizího obrázku.

## 0.45.1 – 2026-10-08 · Robot i v prázdných stavech

- **Prázdné stavy v novém stylu.** Místo tří barevných tvarů (kolečko, čtverec, trojúhelník) z původní značky ukazuje každá prázdná stránka – třeba Dovednosti, když na počítači žádné nejsou – hlavu robota Agenteeq se zavřenýma očima: odpočívá, protože tu zatím nic není. Je ve značkové fialové (v tmavém vzhledu světlejší), anténa jemně dýchá; při omezení pohybu stojí.

## 0.45.0 – 2026-10-08 · Odpověď agentovi z aplikace, nové rozšíření pro Chrome

- **Odpověz agentovi přímo z Agenteeq.** V detailu konverzace Claude Code je pod přepisem pole „Odpovědět agentovi“. Vybereš, jestli agent smí jen plánovat, nebo i upravovat soubory, a odešleš (⌘↵). Agent pokračuje v téže konverzaci na pozadí (`claude -p --resume`) a průběh vidíš v přehledu – nemusíš otevírat Terminál ani aplikaci Claude. Odpověď jde jen z Macu, na kterém agent běží, nikdy z telefonu. Když to nejde (konverzace právě běží v Terminálu, ve stejné složce pracuje jiný Claude Code, chybí program `claude`, nepodařilo se zjistit, co na počítači běží), pole se neukáže a místo něj je věta proč a tlačítko k pokračování tam, kde agent běží. Codex a další nástroje zatím ne.
- **Rozšíření pro Chrome jako malý Agenteeq.** Okno rozšíření má vzhled aplikace (stejné barvy, písmo a logo s hlavou robota, světlý i tmavý režim) a nově ukazuje agenty na tvém počítači, ne jen chaty v prohlížeči: nahoře kolik agentů pracuje celkem a jednou větou jejich stav, pod tím kdo čeká na tvé rozhodnutí a kdo pracuje, každý s robotem v barvě stavu (pracující mrká a kývá anténou, čekající bliká). Klepnutím se agent otevře v Agenteeq. Stav se obnovuje každých 5 s. Rozšíření dostává jen název, nástroj a krátký popis činnosti – žádný přepis ani cesty ke složkám.
- **Přesnější hláška u konverzace, kterou nejde obnovit.** Detekovaný proces Claude Code bez přepisu už netvrdí, že „odpovídat jde jen v Claude Code“.

## 0.44.0 – 2026-10-08 · Stav agentů na první pohled, jednotný vzhled, dovednosti ve vyhledávání

- **Stav agentů vedle rozhodnutí.** Řádek „Potřebuje tvé rozhodnutí“ se na širší obrazovce dělí na dva boxy. Vlevo decentní karta s tím, co čeká na tebe; vpravo nový box **Stav agentů**: jedna věta s barevnou tečkou (vše v pořádku / na rozhodnutí čeká N agentů / problém u N agentů), počty pracuje · čeká na tebe · selhalo · limit (každý vede na odpovídající filtr) a nanejvýš tři problémy s odkazem. Když se nepodaří zjistit, co na počítači běží, box to řekne – nikdy to nevydává za „nic neběží“. Oba boxy končí na stejné spodní hraně.
- **Karty v „Právě teď“ mají štítek stavu.** Vpravo nahoře každé karty: Běží (zelená), Čeká na tebe (zlatá), Selhalo / Limit (vínová), Hotovo, Proces. Na první pohled je vidět, co jede v pořádku a co řešit.
- **Vybraný filtr je vidět.** V Dovednostech (a všude, kde se filtruje: Agenti, Útrata…) byl vybraný filtr bílý na bílém panelu a nešel poznat. Teď je to kapsle v barvě značky i s počtem – stejně ve všech skupinách filtrů.
- **Dovednosti ve vyhledávání (⌘K).** Hledání najde dovednosti podle názvu, popisu, zdroje i cesty (s tolerancí překlepů jako u ostatních výsledků); výsledek rovnou otevře čtení dané dovednosti a pamatuje se mezi naposledy otevřenými. Seznam dovedností se navíc za běhu obnovuje každých 30 s a po návratu do okna – nová nebo upravená SKILL.md se ukáže sama.
- **Jednotné zaoblení rohů v celém produktu.** Jedna stupnice pro všechny motivy (Koncert si dřív nesl vlastní 16/24/40 px): 24 px velké plochy (levý panel, pozdrav, pole pro zadání, dialogy), 20 px karty, 12 px vnitřní dlaždice, 8/6 px drobnosti, kapsle pro všechno klikací na jeden řádek. V CSS nové vrstvy nezůstala žádná pevná hodnota.
- **Toast jako kapsle.** Upozornění dole má plně zaoblené konce, takže kulatá ikona vlevo s nimi ladí.
- **Slonovina bez tmavého panelu.** V motivu Koncert (Slonovina/Eben) už pod „Právě teď“ neleží původní tmavá scéna s gradientem ani zlatý proužek u pole pro zadání – karty jsou na čisté ploše jako v ostatních motivech.
- **Profilová fotka z Googlu.** Adresa fotky se hledá i v datech identity Googlu, kde ji Supabase u části účtů nese místo v metadatech uživatele. Karta účtu nově říká, proč fotka chybí (Google ji neposlal / nepodařilo se ji stáhnout / načítá se), místo tichých iniciál.

## 0.43.0 – 2026-10-08 · Roboti mluví: bubliny, gesta a pár překvapení

- **Bubliny robotů.** Najeď myší (nebo klávesnicí) na robota agenta a řekne krátkou větu podle svého stavu: pracuje, čeká na tvoje rozhodnutí, selhal, narazil na limit, je hotový. Bublina je světlá a skleněná (v tmavém vzhledu tmavé sklo), s ocáskem mířícím na hlavu robota. Umístění hledá samo: zkusí místo vedle robota v jeho kartě, nad ním, po stranách a pod ním a vybere to, které nezakryje tlačítko, odkaz, nadpis ani text. Česká sazba drží jednopísmenné předložky na začátku řádku.
- **Roboti se ozvou sami, ale jen když je to důležité.** Na Přehledu: když agent začne čekat na tebe, selže, narazí na limit nebo doběhne, jeho robot se jednou ozve (a zamává, když čeká na tebe). Nejvýš jednou za 9 s, ne hned po načtení stránky, a jen když má bublina volné místo – stav vždy říká i text karty.
- **Gesta.** Klepni na robota u pozdravu: zamává, poskočí nebo nakloní hlavu. Omezení pohybu v systému a přepínač „Ztišit pohyb“ gesta i samovolné bubliny vypnou.
- **Pár vzácných překvapení.** Občas robot místo běžné věty zacituje kultovní film. Kdo pětkrát rychle klepne na robota u pozdravu, nebo zadá jistý slavný kód ze starých her, uvidí víc.
- **Přehled drží jednotnou šířku obsahu.** Pozdrav s robotem a pole pro zadání byly úzký vystředěný sloupec (800 px uvnitř 1060 px) a nesedily s nadpisem stránky ani se sekcemi pod nimi. Teď celý Přehled začíná na hraně nadpisu a končí na pravé hraně horní lišty – stejně jako každá jiná stránka, na všech šířkách okna. Hlídá to test (`npm run qa:studio`).
- **Oprava poznámek k 0.42.0:** plovoucího robota s radami na ostatních stránkách nahradil pomocník vpravo dole; rady ke stránce jsou v jeho úvodní zprávě.

## 0.42.0 – 2026-10-08 · Pomocník, pohodlnější zadávání práce, robot jen tam, kde pomáhá
- **Pomocník (Beta).** Kulaté tlačítko s robotem vpravo dole otevře chat. Na „najdi chat, kde jsme před cca 3 měsíci řešili fakturaci, už nevím jaký LLM“ prohledá konverzace v přehledu i přepisy na disku tohoto počítače (Claude Code, Codex) – i starší než 30denní okno přehledu. Rozumí období („před 3 měsíci“, „minulý týden“, „v září“, „2 weeks ago“) a nástroji („v Codexu“). Výsledek ukáže s úryvkem a zvýrazněnými slovy; konverzaci z přehledu otevře, starší nabídne zkopírovat příkaz k pokračování (`claude --resume …`, `codex resume …`). Na „jak zapnu upozornění na telefon?“ ukáže volby v aplikaci a klepnutím na ně přejde. Hledání má limit (4 000 přepisů, 5 s) a když nestihne vše, řekne to – „nic jsem nenašel“ hlásí jen po skutečném prohledání. Když nic nesedí v zadaném období, nabídne shody z jiné doby a řekne to. S Ollamou může odpověď navíc zformulovat lokální model; data nikdy neopustí počítač. Telefon dostane jen to, co vidí v přehledu, nic z přepisů. Skrýt jde v Nastavení → Účet a vzhled, tam je i přepínač pohybu robotů.
- **Pole pro zadání jako u moderních AI nástrojů.** Agent se vybírá tlačítkem přímo v liště pole (Claude Code ▾): nabídka s hledáním, šipkami, Enterem a Esc, rozdělená na agenty na tomto počítači a na webu. Režim, projekt a složka jsou v téže liště hned pod textem, Spustit vpravo (zkratka v popisku tlačítka). Žádné rozbalování „Možností zadání“. Ověřeno automatickým testem v Chromiu i WebKitu (`npm run qa:studio`): výběr, hledání, klávesnice, klik mimo, zachovaný koncept a skutečné odeslání zadání.
- **Robot jen tam, kde pomáhá.** Na Přehledu sedí v panelu u pozdravu a ukazuje stav všech agentů najednou (zamává, když na tebe někdo čeká; píše, když agenti pracují) – věta pod nadpisem říká totéž slovy. Na ostatních stránkách už není pruh přes obsah: vpravo dole je malý plovoucí robot, který radu ke stránce nabídne jednou sám a pak na klepnutí nebo najetí myší. Nekoliduje s nadpisy (dřív v Nastavení zasahoval do obsahu).
- **Levý panel se zaoblenými rohy** a odstupem od kraje okna, i v aplikaci pro Mac.
- **Robot v tmavém vzhledu** má světlejší tělo, aby nesplýval s kartou.
- **Ikona v horní liště Macu je hlava robota** místo starého systémového symbolu (trojúhelník s tečkami). Kreslí se jako šablona, takže ji macOS sám obarví pro světlou i tmavou lištu; oči jsou průhledné výřezy.
- **Nová načítací scéna.** Při spuštění a při načítání dat je uprostřed ztlumená hlava robota a přes ni přejíždí jemný fialový odlesk; místo starého trojzubce se žlutou tečkou. Plocha scény je stejná jako světlé rozhraní, takže přechod do aplikace je jen prolnutí. S omezeným pohybem zůstane robot v klidu.

## 0.41.0 – 2026-10-08 · Nový vzhled s roboty, nové logo a písmo Satoshi

- **Pracovní plocha místo nástěnky.** Přehled začíná jednou otázkou „Co dnes posuneme dál?“ a polem pro zadání. Výběr agenta a podrobné volby jsou o klepnutí dál, rozhodnutí, která čekají na tebe, hned pod tím, živí agenti jako karty a statistiky dne po rozbalení „Průběh dne a spotřeba“.
- **Roboti za každého agenta.** Každý agent má svého robota (čtyři podoby, čtyři barvy, vlastní jméno – uložené jen v tomto prohlížeči, tlačítko „Upravit vzhled agentů“). Agenti jsou karty s robotem, robot je i v detailu konverzace.
- **Roboti ukazují stav.** Pracuje: anténa pulzuje a paže píšou. Potřebuje tebe: zvednutá ruka a krátké zamávání. Čeká: přimhouřené oči. Selhalo nebo limit: svěšená anténa. Oči sledují kurzor a občas mrknou. Stav je vždy i v textu; omezení pohybu v systému nebo přepínač „Ztišit pohyb“ animace vypne.
- **Rady robota.** Každá stránka má krátkou radu, jak ji použít; dá se skrýt.
- **Nové logo.** Hlava robota s anténou v aplikaci, ikoně pro Mac a Windows, na webu i v rozšíření.
- **Písmo Satoshi** v aplikaci, na webu i v rozšíření. Licence (ITF Free Font License 2.0) dovoluje písmo vložit do aplikace, ne ho šířit přes veřejný repozitář – soubor se proto stahuje z Fontshare až při sestavení a ověřuje podle otisku (`scripts/satoshi.mjs`). Bez něj se sází dosavadní Onest.
- **Bez jednostranných barevných proužků** u karet, bannerů a upozornění; stav nesou plocha, ikona a text.

## 0.40.0 – 2026-10-08 · Upozornění na telefon

- **Upozornění na telefon (Web Push).** Spárovaný telefon si v Nastavení → Upozornění zapne přepínač **Upozornění na tento telefon** a dostává tatáž upozornění jako systém na Macu: agent potřebuje rozhodnutí, limit, rozpočet, dokončený úkol, souhrny. Přijdou i se zavřenou aplikací v telefonu. Klepnutí otevře konverzaci nebo seznam upozornění. Platí stejná pravidla jako na Macu: noční ticho, souhrn při nárazu a nastavení podle druhu upozornění.
- **Bez vlastního serveru a bez účtu.** Mac posílá zprávu přímo push službě prohlížeče v telefonu (Apple, Google, Mozilla, Microsoft) podle standardů RFC 8291 a RFC 8292 (`src/webpush.js`, jen `node:crypto` a `https`). Obsah je šifrovaný pro konkrétní telefon, takže ho push služba nepřečte. Mac posílá jen na známé push služby přes HTTPS, nikam jinam. Šifrování odpovídá testovacímu vektoru RFC 8291 bajt po bajtu. Když je Mac vypnutý, nepřijde nic.
- **Odběr patří spárovanému telefonu.** Zapnout odběr smí jen spárovaný telefon a vidí, vyzkouší a zruší jen ten svůj. Mac v Nastavení ukazuje, které telefony upozornění mají, kdy byla naposledy doručena nebo proč selhala, a umí je vypnout. Odpárováním telefonu jeho odběr zanikne. Odběr, který push služba už nezná (410), se zapomene sám. Selhání doručení se ukáže, nikdy se nehlásí jako doručené.
- **Podmínky dané prohlížeči.** Push potřebuje HTTPS (`tailscale serve` nebo tunel). V iPhonu funguje jen z aplikace uložené na plochu (iOS 16.4 a novější). Karta to řekne podle toho, co telefon umí. Na skutečném telefonu zatím neověřeno, proto **Beta** (`docs/CONNECTORS.md`).

## 0.39.0 – 2026-10-07 · Statistiky za 90 dní a 12 měsíců, štítky a odhad ceny projektů

- **Statistiky za 90 dní a 12 měsíců.** Konektory čtou přepisy jen za 30 dní, takže starší čísla dřív zmizela. Agenteeq teď každý den ukládá malý souhrn (`<dataDir>/historie.json`, `src/historie.js`): tokeny (vstup + výstup) podle poskytovatele, aplikace, modelu a složky, hodiny s aktivitou a konverzace podle dne začátku. Den uvnitř 30denního okna se přepočítává z živých konverzací, den mimo okno se zmrazí. Ukládá se 400 dní, jen součty – žádné přepisy, názvy ani ID konverzací. Statistiky mají nová období **90 dní** (13 týdnů) a **12 měsíců** (kalendářní měsíce); graf, karty aplikací, modelů a složek i souhrnná čísla jdou z uložených souhrnů (`GET /api/historie`, `public/js/historie-stats.js`), mapa aktivity a limity zůstávají beze změny. Dny před začátkem ukládání se nedopočítávají ani nevydávají za nulu: pod grafem stojí, od kdy historie sahá.
- **Štítky projektů.** Projekt má až 8 štítků (klient, interní, Q4…), každý do 24 znaků, bez duplicit podle velikosti písmen. Zadávají se ve formuláři projektu (oddělené čárkou, s našeptáváním existujících), ukazují se na kartě i v hlavičce projektu a nad mřížkou projektů je filtr podle štítku s počty. Štítek v hlavičce vede na filtrovaný seznam (`#/projekty?stitek=…`); hledání projektů i ⌘K štítky znají.
- **Šablony projektu.** Nový projekt jde založit ze šablony **Agentura a klient**, **Vývoj** nebo **Marketing**: předvyplní kostru podkladů (např. klient, cíl zakázky, cílová skupina, termíny, rozpočet, tón a značka) a výchozí štítek. Prázdné podklady existujícího projektu nabídnou totéž tlačítky „Začít ze šablony“.
- **Odhad ceny projektu přes API.** Detail projektu ukazuje, kolik by jeho tokeny za posledních 30 dní stály přes API Anthropicu, v měně aplikace a vždy s označením „odhad“ – předplatné Pro/Max se platí paušálem. Ceník (`public/js/cenik-api.js`) je ověřený 7. 10. 2026 na oficiální stránce a uvedený s datem a odkazem. Modely bez ověřeného ceníku (OpenAI, Google, Haiku 5.5 s cenou podle délky promptu) se nedohadují: karta řekne, jakou část tokenů odhad kryje a které modely chybí.
- **Rozšíření najde Agenteeq i na jiném portu.** Aplikace spuštěná s proměnnou `PORT` dřív pro rozšíření neexistovala – adresa `127.0.0.1:4620` byla napevno. Okno rozšíření teď v stavu „neběží“ nabídne **Agenteeq běží na jiném portu?**: port (1024–65535) se uloží, token se zapomene a rozšíření se spáruje znovu. Jiný než výchozí port si vyžádá volitelné oprávnění `http://127.0.0.1/*` (podle dokumentace Chromu vzor bez portu platí pro všechny porty); povinná oprávnění v manifestu se nemění, takže aktualizace z obchodu rozšíření nevypne. Karta rozšíření v Nastavení u aplikace na jiném portu řekne, co zadat.
- **Přesnější „čeká na povolení“ bez hooků.** Dřív každý nástroj čekající přes 90 s dostal jen „možná čeká na tvé povolení“ a zůstal „Pracuje“ – i čtení souboru, které se na povolení nikdy neptá. Teď rozhoduje druh nástroje: úprava souboru (Edit, Write…) čekající přes 20 s se hlásí jako **Potřebuje rozhodnutí** s textem „Nejspíš čeká na tvé povolení“ (po schválení by proběhla během vteřin), čtení (Read, Grep…) žádnou poznámku nedostane a Bash nebo MCP po 90 s dál jen „možná“. Režim oprávnění z přepisu (`bypassPermissions`, `acceptEdits`) odhad vypne, když ho přepis nese – to je zatím neověřené (Beta, `docs/CONNECTORS.md`). S hooky se dál hlásí přesně.

## 0.38.2 – 2026-10-07 · hledání do hloubky, historie Claude a jistější ovládání

- **Hledání najde i sekce a nastavení.** ⌘K dřív znalo jen názvy osmi stránek, takže „limity“ nenašly nic. Nový index (`public/js/hledani.js`) zná sekce uvnitř stránek (Přehled, Statistiky, Útrata, Projekty), všechny karty Nastavení a jednotlivé přepínače upozornění a vzhledu, s českými i anglickými synonymy. Výběr skočí přímo na sekci a krátce ji zvýrazní; u nastavení dostane fokus konkrétní přepínač. Hledá se bez diakritiky, po slovech, podle tvaru slova („limitů“ ~ „limity“) a s tolerancí jednoho překlepu; shoda je v názvu podtržená. Našeptávání ukáže zbytek názvu šedě v poli a Tab (nebo → na konci) ho doplní. Bez dotazu nabídne naposledy otevřené (jen v tomto prohlížeči). Když se sekce bez dat neukazuje, aplikace to řekne místo tichého nic.
- **Po výběru z hledání zůstávala stránka zamčená.** Výběr výsledku nechal na stránce třídu překryvu, takže stránka se nedala posouvat a klávesové zkratky nereagovaly, dokud se neotevřel a nezavřel jiný dialog. Opraveno.
- **Zpětně načtené měření Claude ve Statistikách.** Ukazuje se poslední kalendářní den, který Claude Desktop skutečně změřil, jeho datum, počet odečtů a poslední vytížení 5hodinového a týdenního limitu. Po půlnoci se včerejší data neztratí ani nevydávají za dnešní. Tokeny ani cenu z těchto procent neodvozujeme. Webové chaty neposkytují zpětná data o tokenech.
- **Modal projektu drží pozici stránky.** Zavření už neodskočí na tlačítko, které modal otevřelo; fokus se vrací bez posunu a pozice se obnoví, pokud ji WebKit přesto změní.
- **Upozornění mají čitelný hover i klávesnicový fokus** ve světlém i tmavém vzhledu, s přechodem podle design tokenů.

## Instalace jedním příkazem: vždy otevře novou verzi – 2026-10-06

- **Žádná stará verze po instalaci.** Když už v Aplikacích ležela nejnovější verze, ale na pozadí ještě běžela starší (nahrazení ve Finderu bez ⌘Q), instalační příkaz napsal „nic se nestahuje“ a `open` probudil právě tu starou. Teď ji nejdřív ukončí stejně jako ⌘Q a otevře aplikaci z disku. Platí to i pro verze bez aktualizace jedním klepnutím (do 0.38.0).
- **Upozornění na další kopie.** Instalátor vypíše jiné kopie Agenteeq na Macu (např. ve Stažených souborech) s jejich verzí, protože je může otevírat Dock nebo Spotlight. Nic nepřesouvá ani nemaže.

## 0.38.1 – 2026-10-06 · aktualizace jedním klepnutím

- **Aktualizovat a restartovat.** V aplikaci pro Mac stačí u nové verze jedno klepnutí (v horní liště nebo v Nastavení → Aktualizace): ověřený balíček se stáhne, aplikace ho rozbalí, zkontroluje identifikátor, verzi i podpis, připraví vedle sebe a ukončí se. Malý pomocník pak vymění balíček v Aplikacích (předchozí verze jde do Koše) a spustí novou verzi. Když cokoli selže před ukončením, nic se nezmění a rozhraní řekne proč. Plášť pro Windows a příkazová řádka dál balíček jen stáhnou a ukážou.
- **Žádná stará verze po ručním nahrazení.** Aplikace po zavření okna běží dál na pozadí. Když ji někdo v Aplikacích nahradí novou verzí (z DMG nebo ZIP), klepnutí na ikonu dřív ukázalo pořád starou běžící kopii. Teď aplikace při návratu do popředí porovná verzi na disku s běžící a restartuje se do nové.

## 0.38.0 – 2026-10-06 · čtyři vzhledy, důvěryhodný účet a Nastavení bez mezer

- **Čtyři vzhledy ve dvou párech.** Nastavení → Účet a vzhled nabízí karty s náhledem: **Úsvit** (světlé sklo nad jemnou oblohou) a **Půlnoc** (půlnoční modrá) jsou výchozí pár, **Slonovina** (bílé karty pod tmavou scénou) a **Eben** (hluboká tma s výraznými barvami stavů) vracejí původní koncertní sál z verzí do 0.36. Přepínač **Střídat podle systému** střídá světlou a tmavou podobu vybraného páru; klepnutí na kartu při střídání přepne celý pár. Změna se projeví hned, uloží se na tomto Macu (nastavení `look`: `obloha` / `koncert`) a přežije restart. Barvy Koncertu jsou v `public/koncert.css` a mají stejnou specifičnost jako protějšky ve `styles.css`; kontrast a tvary se měří ve všech čtyřech vzhledech.
- **Účet Google, ve kterém se poznáš.** Karta účtu ukazuje fotku s logem Google, jméno, e-mail s označením **ověřený e-mail** (když ho Google potvrdil) a kdy ses naposledy přihlásil – vše tak, jak to poslal server účtů. Fotka, která se napoprvé nestáhne, se už neztratí do příští obnovy tokenu: karta řekne, že se zatím nenačetla, a za 10 minut se stáhne znovu. Důvod selhání jde do záznamu aplikace bez adresy fotky.
- **Soukromí bez nepřesností.** Karta Soukromí a bezpečnost dřív tvrdila, že server poslouchá výhradně na 127.0.0.1 a nic neodchází ven. Teď vypisuje, co skutečně odchází podle toho, co je zapnuté: kurzy ČNB a kontrola verzí (bez údajů o tobě), náklady za API, účet a přístup z telefonu.
- **Nápověda a zkratky.** Nová karta v Aplikace na Macu: klávesové zkratky (hledání, spuštění agenta, zavření), Co je nového, Nahlásit chybu a Zásady ochrany soukromí. „Otevřít v prohlížeči“ se přesunulo z karty Vzhled k aplikaci.
- **Spolehlivý zápis dat na Windows.** Když má soubor s daty na okamžik otevřený jiný program (antivir, indexování, zálohování), uložení se zopakuje místo toho, aby se změna ztratila.

## 0.37.1 – 2026-10-06 · čitelnost nového vzhledu

- **Doplňkový text čitelný i nad atmosférou.** Šedý text, který leží přímo na barevné obloze Dne (popisky filtrů, metadata sekcí), měl nad nejsytějším místem jen 3,8:1. Barva je o kousek tmavší a drží 4,5:1 všude (WCAG 2.2 AA); Noc už měla aspoň 6,3:1. Kontrast se tentokrát měřil i ze skutečných pixelů, protože výpočet ze stylů pevnou vrstvu atmosféry nevidí; test hlídá všechny vrstvy atmosféry obou vzhledů.
- **Útrata bez API na telefonu.** Ikona, text a tlačítko „Propojit API“ drží jednu osu; text už nevisí uprostřed karty.
- **Rozšíření z Chrome Web Store jedním kliknutím.** Rozšíření je v obchodě zveřejněné: web (úvodní stránka i Instalace) a Nastavení → Rozšíření pro Chrome nabízejí rovnou tlačítko **Přidat do Chromu** místo ruční instalace přes Režim pro vývojáře. Ruční cesta zůstává sbalená pro prohlížeče bez obchodu. Pryč je i vysvětlování, co rozšíření posílá.
- Kód v drobném textu (např. `SKILL.md` v Dovednostech) má aspoň 12 px.
- Instalátor DMG se při vydání 0.37.0 sestavil a prošel `hdiutil verify` na runneru s macOS.

## 0.37.0 – 2026-10-05 · nový vzhled Den a Noc, každý agent hned, poctivá synchronizace, instalace bez Terminálu

- **Nový vzhled Den a Noc.** Den je světlé sklo nad tichou oblohou (mlha #F3F5F8, inkoust #16203A), Noc je jeho zrcadlo na půlnoční modré. Tmavý rám okna a tmavý pás nahoře zmizely; postranní panel, karty a lišta jsou průsvitné sklo s bílou hranou. Hlavní pruh s živými agenty je jediná plocha s jemným modro‑šalvějovým nádechem. Barvy jsou tlumené pigmenty se stálým významem: šalvěj = pracuje, okr = čeká na zadání, růže = potřebuje tebe. Grafy mají novou kategoriální paletu s kontrastem ≥ 3 : 1 v obou režimech.
- **Pryč s ozdobami.** Zlatý proužek u aktivní položky menu, zlatá linka nad kartou Spustit agenta a barevné odznaky nahradila čistá plocha; odznaky jsou v barvě textu. Čísla, štítky a odznaky sází Onest s tabulkovými číslicemi (nula bez přeškrtnutí); neproporcionální písmo zůstalo jen kódu. Web a okno rozšíření převzaly nové základní barvy.
- **Každý spuštěný agent jednou a hned.** Codex, Gemini CLI a Qwen Code z npm se už neukazují dvakrát (spouštějí sami sebe jako dceřiný proces; výpis procesů nově nese rodiče a sloučí je). Rozpoznají se i skripty npm spuštěné přímo nebo přes `npx`. Nová konverzace z prohlížeče už nenechá druhý „duch“ záznam: rozšíření řekne, který zástupný záznam skutečná konverzace nahrazuje. Cursor se ukáže do 1 s místo 3 s (sledování databáze místo pravidelné kontroly). Nově se rozpoznává aplikace Codex pro Mac a Windows (🧪 podle zdrojového kódu `codex app`, neověřeno na stroji). Při prvním spuštění Claude Code se přepis načte hned, ne za 5 s. Změřeno bez obnovení stránky: CLI 1,5 s, aplikace 1,3 s, prohlížeč do 40 ms, přepisy do 70 ms.
- **Selhání zjišťování není „nic neběží“.** Když výpis procesů selže, Přehled to řekne a nechá poslední známý stav; dřív ukázal prázdno nebo „Sledování procesů je vypnuté“.
- **Synchronizace účtu bez „0 zařízení“.** Mac se do účtu nejdřív přidá a teprve pak se zapne synchronizace; když přidání selže, karta účtu řekne proč a další běh to dožene. Volba přežije restart. „Synchronizovat teď“ hlásí úspěch jen při úspěchu. Přehled na webu ukazuje čas poslední synchronizace, stará data označí a nepočítá je jako živá, útrata z Admin API se už nesčítá dvakrát a obnovuje se sám každou minutu i po návratu do karty.
- **Bezpečnost.** Web posílá bezpečnostní hlavičky (CSP, HSTS, zákaz vložení do rámu). Aplikace spuštěná z Terminálu a na Windows chrání rozhraní klíčem okna jako aplikace pro Mac: adresa bez klíče ukáže jen „Agenteeq běží“, `agenteeq --open` otevře přehled s klíčem. Spárovaný telefon vidí jen souhrn konverzace, ne celý přepis.
- **Instalace bez Terminálu.** Jeden postup všude (web, popis vydání, README, Nastavení): otevřít, v Nastavení systému → Soukromí a zabezpečení kliknout na Přesto otevřít. Nová stránka Instalace (`/instalace`, `/en/install`) s tlačítky pro Mac i Windows; karta „Instalace pro další lidi“ v Nastavení posílá odkaz na ni. Vydání nově obsahuje instalátor DMG s přetažením do Aplikací (ověří až běh workflow na macOS). Instalace rozšíření jedním klikem z Chrome Web Store je připravená za přepínačem a zapne se po schválení Googlem.
- **Bez omluv a vysvětlivek.** Z aplikace, webu i rozšíření zmizely ujišťování, texty v první osobě a návody „otevři tlačítkem výše“. Místo nich jsou akce: Nastavit rozpočet, Otevřít Claude / v Codexu přímo u čekajícího agenta, Spustit agenta v prázdném seznamu, odkazy rovnou na správnou kartu Nastavení.
- **Obnova dat bez problikávání.** Tlačítko obnovy se už nevypíná (kurzor „zakázáno“ a poskočení o pixel); ikona se plynule otočí a doběhne do klidové polohy, při omezeném pohybu se jen ztlumí.
- Neověřeno: aplikace Codex a výpis procesů s rodičem na skutečném Windows; DMG až v CI na macOS; hlavičky webu až po nasazení na Vercel.

## 0.36.4 – 2026-10-05 · účty nástrojů bez směšování licencí

- Útrata čte aktuální účet, plán, limity a kredit Codexu z jediné odpovědi oficiálního lokálního app-serveru. Účty z více `CODEX_HOME` odlišuje anonymním otiskem ID; přepis bez ID už nevytváří aktuální předplatné.
- Claude Code se ověřuje pro výchozí i nalezené izolované profily `CLAUDE_CONFIG_DIR`. Přihlášené účty jsou oddělené; odhlášený profil neukazuje starý plán jako aktuální.
- Nová karta Účty nástrojů rozlišuje aktivní a dříve rozpoznané licence. Po přepnutí zůstanou starší účty v přehledu, ale jejich limity a kredity se nevydávají za živé. Historický graf kreditů Codexu bez ID účtu se nezobrazuje, protože mohl spojovat více licencí.

## 0.36.3 – 2026-10-04 · stav limitů Claude bez falešného napojení

- Přehled ukazuje Claude i bez čerstvého měření, pokud je na Macu dostupný. Při ověřeném odhlášení nabídne přihlášení; při neznámém nebo starém stavu čeká na data. Nikdy nedoplní procento ani čas obnovy odhadem.
- Stav přihlášení Claude Code se čte zvlášť od nainstalovaných hooků. Jejich štítek v Nastavení výslovně říká „Hooky zapnuté“. Změny přihlášení se propíší živě a kontrolují se každé 2 minuty.
- Test souběžných nástrojů používá budoucí čas obnovy z epochy místo pevné hodiny 23:00, takže po 23. hodině správně ověřuje ještě aktivní limit.

## 0.36.2 – 2026-10-04 · srovnané filtry na Agentech, načítací scéna i na Windows

- **Filtry na Agentech v jedné mřížce.** Řádky filtrů měly každý jinou výšku a nedržely svislou ani vodorovnou osu: hledání viselo samo na vlastním řádku, zdroj vypadal jinak než poskytovatelé, řádek projektů se lámal do dvou výšek, „Vybrat“ stálo svisle jinde než čipy a nápověda „Konverzaci přetáhni na projekt“ visela pod nimi. Teď je nahoře jen hlavní filtr (stav) přes celou šířku a pod ním karta s řádky Zdroj, Služba a Projekt. Popisky mají vlastní sloupec, takže čipy všech řádků začínají na jedné svislé ose. Každý řádek má přesně 56 px a nic se v něm nezalamuje; co se nevejde, roluje s dozněním u okraje. Hledání a „Vybrat“ jsou v pravém sloupci zarovnané k témuž okraji. Všechny filtry mají jeden styl čipu. Nápověda k přetažení je u čipů projektů, na které se táhne. Na telefonu jde popisek nad řádek a hledání nahoru do karty. Stejný jazyk má karta filtrů na Dovednostech.
- **Plášť pro Windows ukazuje stejnou načítací scénu jako Mac.** Místo nápisu „Agenteeq“ systémovým písmem a hranatého tlačítka otevře okno hned po spuštění scénu `public/nacitani.html` ze souboru v balíčku (adresu skládá `UrlCreateFromPathW`, takže projde i složka s mezerou nebo „&“). Hlášky o obnově spojení, chyby i „Zkusit znovu“ mění jen text ve scéně, animace běží dál. Jakmile server běží, vystřídá ji rozhraní se stejnou animací. Okno smí ze souborů otevřít jen tuhle stránku. Když v balíčku chybí, zůstává prostá stránka pláště, nově s tlačítkem jako kapslí.
- Neověřeno: vzhled v samotném okně pro Windows (stroj s ověřením nemá Windows); plášť překládá CI a stránku scény jsme ověřili v Chromiu.

## 0.36.1 – 2026-10-04 · nová načítací obrazovka i v aplikaci pro Mac, karty projektů bez poskakování

- **Aplikace pro Mac ukazovala starou načítací obrazovku.** Nová animace značky z 0.36.0 žila jen ve webovém rozhraní. Okno pro Mac ji zakrývalo vlastním nativním překryvem (nápis „Agenteeq“ systémovým písmem a „Připravujeme tvůj pracovní prostor…“) a ten zmizel až s načtenými daty, takže animaci nikdo neviděl. Překryv teď ukazuje stejnou scénu (`public/nacitani.html`, značka shodná s `loaderHtml()`, hlídá test) ze souboru v balíčku – od prvního snímku okna, ještě před startem serveru, souvisle bez střihu až do načtení dat. Pak se scéna za 0,32 s rozplyne do Přehledu, při omezeném pohybu zmizí naráz. Hlášky „Obnovujeme spojení…“, chyby i tlačítko „Zkusit znovu“ (kapsle) jsou ve stejné scéně. Kdyby stránka v balíčku chyběla, zůstává původní prostý text jako záloha.
- **Karty projektů už neposkakují, když se načítají data.** Patička s počtem konverzací, tokeny a logy služeb se smí zalomit podle obsahu, takže karta (a s ní celý řádek mřížky) změnila výšku pokaždé, když se tokeny změnily z „–“ na číslo, číslo dojelo nebo přibylo logo (změřeno: patička 31, 39 i 77 px). Karta má teď pevný rozvrh: čísla vždy v jednom řádku, loga vpravo v řádku s časem aktivity, pevná výška patičky i posledního řádku. Výška karty je stejná s daty i bez nich (ověřeno na 360–1440 px); extrémně dlouhé číslo zkrátí popisek třemi tečkami, kartu nezvětší.
- Neověřeno: sestavení a vzhled v samotném okně pro Mac (stroj s ověřením nemá Xcode); stránka scény je ověřená v Chromiu a plášť přeloží workflow na runneru s macOS. Plášť pro Windows má dál vlastní jednoduchou stránku.

## 0.36.0 – 2026-10-04 · eura, okamžitá detekce agentů a přehledný účet

- **Částky v eurech.** Výchozí měna aplikace je euro. Dřívější výchozí koruna se u dat, kde ji nikdo ručně nezvolil, jednou převede na euro i s rozpočty (přepočtenými kurzem, ne jen přejmenovanými); ručně zvolená měna se nepřepíše. Ceny zjištěných plánů jsou hlavně v měně aplikace („172 €“) s ceníkovou cenou poskytovatele pod ní („ceník 200 $“).
- **Každý spuštěný agent hned a vidět.** Procesy se zjišťují po 1,5 s místo 5 s (Windows dál 5 s), takže nový nástroj je v Přehledu do 2 s – změřeno 0,15–1,26 s při 13 nástrojích spuštěných naráz. Mřížka běžících nástrojů už neschová ty nad osmý: běžící jsou vidět vždy všechny. Karta nových nástrojů ukáže čtyři a zbytek po „Zobrazit další“.
- **Oficiální loga** Warpu, Windsurfu, Kira, Zedu, Goose, OpenCode a Antigravity (dřív obecná ikona, u Antigravity logo Gemini). Zdroj a licence v `public/logos/README.md` (LobeHub MIT, Simple Icons CC0). Aider vlastní logo v obou zdrojích nemá.
- **Nové AI nástroje bez plovoucího okna.** Místo okna vpravo dole (pulzující tečka, texty v první osobě, drobné šedé písmo) jsou nově zachycené nástroje kartou nahoře v Přehledu: logo, název, jeden řádek „kde a od kdy“, štítek, co Agenteeq uvidí (Konverzace i tokeny / Jen stav běhu / Nastavit rozšíření), a tlačítka Sledovat a Nesledovat. Karta se mění jen při změně obsahu – živé události procesů ji už nepřekreslují a nic nebliká (změřeno: 0 změn DOM při 8 událostech). Upozornění a oznámení macOS říkají věcně „Nový AI nástroj: Warp“.
- **Zjištěné plány s úrovní a cenou.** U plánu zjištěného z Claude Code nebo Codexu je přesná úroveň (Claude Max 5× / 20×, ChatGPT Pro 100 / 200 / 500, Business, Business Premium) a cena z veřejného ceníku poskytovatele s přepočtem kurzem ČNB, odkazem na ceník a datem ověření (4. 10. 2026). Ceník není platba a do útraty se nepočítá; plány bez veřejné ceny ukazují „Podle smlouvy“. Oprava: kód `business` z Codexu je podle Codexu Enterprise, ne Business. Původ plánu je stručně „Zjištěno z účtu Claude Code / z limitů Codexu“, přesný kód je v nápovědě.
- **Účet Agenteeq: přehledná karta, fotka z Googlu a synchronizace pod účtem.** Karta v Nastavení má nahoře identitu (profilová fotka z Googlu, jméno, e-mail, stav), pod ní synchronizaci jako samostatnou plochu (přepínač, „Synchronizováno před 2 min“, „Synchronizovat teď“, odkaz na přehled na webu) a místo surového JSON nejdřív srozumitelný přehled, kolik řádků čeho odchází. Akce s účtem jsou oddělené dole. Nepřihlášený vidí, co účet přináší, tlačítko „Pokračovat přes Google“ a předem i to, že přihlášení zapne synchronizaci.
- **Přihlášení zapíná synchronizaci souhrnů** (rozhodnutí vlastníka z 4. 10., nahrazuje opt-in). Vypnout jde jedním přepínačem; vypnutím se souhrny z účtu smažou. Když účet při přihlášení neodpovídá, zapnutí platí hned a do účtu se dopíše později. Zásady ochrany soukromí (CZ i EN) jsou upravené.
- **Fotka z účtu Google** v kartě účtu i v postranním panelu („Vítej zpět“ ukazuje jméno z Googlu). Mac si ji stáhne jen z obrázkového serveru Googlu, ověří, že je to obrázek, a uloží ji k sobě; rozhraní nic nenačítá z cizího serveru a fotka se nikam neposílá. Klepnutí na avatar střídá fotku a obrázek.
- **Spolehlivé přihlášení.** Odhlásí jen skutečně odmítnutý token nebo ty sám. Přetížený server (429), zamčená Klíčenka po startu, dotaz systému na heslo, ztracená odpověď při obnově jednorázového tokenu, neúplná odpověď ani posunuté hodiny Macu už přihlášení nesmažou; karta řekne „Nelze ověřit“ a ověření se samo zopakuje (30 s, pak až 5 min). Synchronizace po odmítnutém tokenu (401) token obnoví a odešle znovu. Jméno a fotka zůstanou vidět i po startu bez sítě. Přihlášení vždy nabídne výběr účtu Google. Totéž platí pro přehled účtu na webu: dvě otevřené záložky se už nepřetahují o jednorázový token (obnova pod zámkem prohlížeče), 429 a výpadky neodhlásí a 401 nejdřív zkusí obnovu; v hlavičce je fotka z Googlu.
- **Načítací obrazovka jako jeden klidný celek.** Animace značky je souvislý příběh ve smyčce 3,2 s: mosazný kořen dá impulz, kmen vyroste, obě větve z něj vyrazí souměrně, každý uzel naskočí s jemným dopružením přesně ve chvíli, kdy k němu tah doroste, halo rozkvete a vše se plynule stáhne zpět do kořene. Zmizely šedé poloprůhledné uzly, osamělé tečky na koncích větví i pod kořenem a střih na konci smyčky. Pod scénou už není vidět kostra obrazovky (prázdný pruh a karta „Spustit agenta“); scéna stojí uprostřed volné plochy.
- **Na telefonu se nadpis při načítání nezkracuje.** Pilulka „Připojuji…“ ukrajovala nadpis na „Přeh…“; při prvním připojení se na úzké obrazovce neukazuje, totéž říká načítací scéna. „Bez spojení“ zůstává.
- **Panel při načítání drží tvar.** Místo prázdného kruhu a mezery stojí v profilu tvar avataru, jména, čísla a zdrojů ve stejné podobě, jakou pak vyplní data, a patička drží místo řádků počítače a verze. Nabídka se po načtení neposune ani o pixel (změřeno na 1024–1440 px).
- **Upozornění v jedné rovině.** Ikona, čas a tlačítko „Označit jako přečtené“ jsou svisle na středu karty, ne přilepené nahoře u titulku. Čas má vlastní sloupec, který zůstává i u přečtených položek, takže už neuskakuje doprava. Titulek, popis a odkaz mají pevný rytmus a karta bez odkazu nemá dole prázdné místo. Na telefonu dostane text celou šířku a čas je drobný popisek pod ním.

## 0.35.0 – 2026-10-04 · limity Claude i z aplikace Claude

- **Vyčerpaný limit Claude s přesnou obnovou i bez stavového řádku.** Claude Code v aplikaci Claude (Claude Desktop → Code) stavový řádek nespouští, takže Okna limitů ukazovala jen Codex. Při odmítnutí 429 zapisuje Claude Code do přepisu strukturovaný záznam `quotaLimits` s druhem okna a časem obnovy od serveru. Agenteeq z něj teď ukáže „Claude · Limit 5 h – Vyčerpáno“ s přesným odpočtem do obnovy, v Terminálu i v aplikaci Claude. Okno platí do obnovy, pak zmizí. Týdenní a další druhy se pojmenují (Týdenní limit, · Opus, · Sonnet), neznámý druh je obecný „Limit využití“ bez domýšlení. Pokud záznam říká, jestli běží dokupované využití, stojí to u okna („dokupované využití vypnuté“). Stejná hláška už nevytváří druhý řádek odhadnutý z textu.
- **Čerstvá historie Claude Desktopu je živé okno.** Vzorek vytížení nejvýš 30 minut starý ukáže Claude 5 h a týden s procenty, stářím měření a výslovným „obnova neznámá · podle Claude Desktopu“. Změna pravidla z 0.29.3: tehdy se historie vydávala za aktuální stav i hodiny po měření a připojoval se k ní dopočtený čas obnovy. Teď jde jen o čerstvé měření, čas obnovy se nikdy nedopočítává a starší vzorky zůstávají jen v grafu. Přednost má vždy přesné měření: stavový řádek, uložená stránka Usage a odmítnutí 429 (z nich nejnovější), teprve potom historie.
- **Claude bez čerstvého měření řekne proč.** V rozbalovacím přehledu „Všechny nástroje a služby“ stojí u Claude místo obecného „Bez údajů o limitu“, odkud se měření vezme: v Claude Desktopu otevřít Nastavení → Využití, nebo spustit Claude Code v Terminálu se stavovým řádkem (nebo ho nejdřív propojit). Cestu přes Desktop nabízí, jen když je Desktop na počítači.
- Neověřeno: odmítnutí `seven_day` (a `seven_day_opus` / `_sonnet` / `overage`) jsme na skutečném účtu zatím neviděli; názvy jsou podle typu v Claude Agent SDK.

## 0.34.3 – 2026-10-04 · stejná výška ovládacích prvků v řádku

- Přepínač zdroje na Agentech (Všechny zdroje / Na tomto Macu / Cloud) měl 32 px vedle čipů poskytovatelů se 40 px a působil jako jiný, menší prvek. V řádku s čipy má teď stejnou výšku i odsazení; stejně tlačítko Vybrat vedle čipů projektů a ikona smazání vedle „Ukončit“ ve Výdajích. `qa:desktop` kontroluje na všech obrazovkách (1440 i 375 px, Chromium i WebKit), že prvky ve stejném řádku mají stejnou výšku.

## 0.34.2 – 2026-10-04 · ověřené plány bez ruční evidence

- Útrata ukazuje jen plány z aktuálně pozorovaného účtu Claude Code nebo z limitů Codexu. Ruční přidávání licencí a plateb z rozhraní zmizelo; bez zdroje plán nevznikne a cena předplatného se neodhaduje.
- Peněžní souhrny, grafy, rozpočty a synchronizované souhrny počítají pouze ověřené náklady z připojených Admin API. Bez připojeného API se nezobrazuje falešná nula ani prázdná analytika. Dřívější ruční záznamy zůstávají v samostatně označené historii a CSV, bez vlivu na aktivní čísla.
- Přehled i Útrata jasně rozlišují náklady za API od předplatného. Prázdná karta historie se bez dat nenačítá. Zachovaný je rozpad nákladů Admin API po modelech z verze 0.34.0.

## 0.34.1 – 2026-10-04 · přepínače reagují hned

- **Statistiky: přepnutí období ukáže čísla hned.** Po kliknutí na Dnes / 24 hodin / 7 / 14 / 30 dní se dřív změnil jen cíl animovaného čísla a karty ukazovaly staré období, dokud nepřišla další živá událost; při rychlém klikání stará animace přepsala novou hodnotu. Čísla se teď přepočítají v tom samém snímku a do 240 ms dojedou, starší animace se při novém cíli zastaví. Platí pro všechna animovaná čísla v aplikaci.
- Přepínače (období ve Statistikách, filtry Upozornění a projektu, řazení Dovedností) se při změně neskládají znovu, jen se jim přepne stav – kliknutí nikdy nedopadne na tlačítko, které mezitím zmizelo. `qa:desktop` měří odezvu všech období (do 500 ms) a 6 kol rychlého přepínání v Chromiu i WebKitu.

## 0.34.0 – 2026-10-04 · útrata za API po modelech

- **Rozpad Admin API po modelech.** Náklady i spotřeba tokenů se stahují seskupené (OpenAI `group_by=line_item` a `group_by=model`, Anthropic `group_by[]=description` a `group_by[]=model`; ověřeno proti referenci API). Denní součet se počítá ze stejných seskupených řádků, takže rozpad a útrata se nerozejdou – hlídá regresní test. Stránkování, stropy stránek i chování při chybě zůstávají: selhání spotřeby = tokeny „nezjištěno“ (null), selhání nákladů vymaže i rozpad.
- **Útrata:** řádek skupiny „Automaticky z Admin API“ jde rozbalit tlačítkem **Modely** (klávesnice, `aria-expanded`, stálá šířka, rozbalení přežije živou aktualizaci). Ukáže model, tokeny z Admin API (vstup, výstup, mezipaměť) a částku v původní měně i přepočtenou; náklady bez modelu mají vlastní řádek. Na telefonu jako karta pod řádkem.
- **Statistiky:** pod grafem tokenů z konverzací samostatný řádek „Organizace přes API“ s tokeny z Admin API za 7/14/30 UTC dnů. Do grafu ani KPI se nepřičítá (různé metriky). Po obnově Admin API se Nastavení i Statistiky hned aktualizují (nově přichází i událost `integrations`).
- **Mac jen pro Apple Silicon (M1 a novější).** Vydání už nestaví aplikaci pro Mac s Intelem (úloha `mac-intel` odstraněna z `release.yml`, popis vydání ji nezná) a kontrola aktualizací na Macu s Intelem nic nestahuje. Windows x64 beze změny.

## 0.33.1 – 2026-10-03 · nadpisy na telefonu celé

- Na telefonu se nadpis obrazovky zkracoval na „Stat…“ nebo „Ag…“, protože lišta ukazovala i pilulku „Připojeno“, která při funkčním spojení nic neříká. Teď se pilulka na úzké obrazovce ukáže jen tehdy, když se něco děje (obnovování, bez spojení). `qa:desktop` hlídá všech 8 nadpisů česky i anglicky na 375 i 360 px v Chromiu i WebKitu.

## 0.33.0 – 2026-10-03 · plynulé živé seznamy

- **Živá data už seznam nepřekreslují celý.** Agenti, Přehled a Statistiky slučují novou podobu se stávající: mění se jen to, co se opravdu změnilo. Na seznamu 140 agentů vymění živá událost ve WebKitu 12 uzlů místo 826 a zmizely snímky delší než 50 ms (dřív jeden na každou událost). Kurzor neztrácí najetí a karty nepřehrávají nástup znovu.
- **Obsah pod čtenářem stojí.** Když se seznam nad odrolovaným místem přeskládá, řádek, který čteš, zůstane na místě (dřív ve WebKitu poskočil o řádek). Rozjetý dojezd kolečka se přitom nepřeruší.
- **Změna pořadí je vidět.** Agent, který se přesune nahoru, do nového místa dojede a ostatní se rozestoupí; bez pohybu při omezení animací i během posouvání.
- **Rychlejší otevření Agentů:** nejdřív první obrazovka řádků, zbytek po dávkách po nástupu. Ve WebKitu nejdelší snímek 75 → 32 ms.
- **Únik paměti:** každá návštěva Projektů nechávala v paměti celou starou mřížku (+11 posluchačů a ~500 uzlů). Opraveno i v detailu projektu a agenta.
- **Jeden pohybový systém:** všechny přechody berou délky a křivku z tokenů, žádné `transition: all`, jezdec průběhu jede transformací, nástup obrazovky začíná v prvním snímku po kliknutí, motiv se přepne naráz bez rozpadu na dvě barevnosti a na dotykové obrazovce nezůstává viset zvednutí karty.
- `qa:desktop` měří plynulost v Chromiu i WebKitu (mutace na živou událost, kotva posouvání, dlouhé úlohy při přepínání obrazovek, CLS při načtení, úniky); `test/plynulost.test.mjs` hlídá zdroj.

## 0.32.2 – 2026-10-03 · klidnější nástupy a přesnější tokeny

- Landing page odkrývá obsah až po vstupu do čitelné části okna. Karty a výřezy mají sladěný rytmus; při omezeném pohybu nebo bez JavaScriptu zůstává obsah dostupný.
- Načítání aplikace má novou scénu značky s postupně rozsvěcovanými body a přístupným stavovým textem.
- Codex bere denní přírůstky primárně ze spotřeby jednotlivých požadavků. Reset kumulativního čítače ani opakovaný snapshot nevytvoří falešný skok; audit používá nezávislý součet požadavků.

## 0.32.1 – 2026-10-03 · čísla v Přehledu hned ve správné velikosti

- Čísla v pásu Přehledu (potřebuje tebe, selhalo, čeká na zadání) při nástupu obrazovky vyjela drobná (12 px) a na správnou velikost naskočila až po animaci. Číslice počítadla teď mají vždy písmo svého čísla na všech obrazovkách; `qa:desktop` to měří během animace v Chromiu i WebKitu.

## 0.32.0 – 2026-10-03 · zachycení agentů v činnosti

- **Agenteeq pozná, co na počítači právě běží, i bez nastavování.** Když poprvé spustíš AI nástroj,
  o kterém zatím nic neví (Warp, Windsurf, Google AI Studio jako aplikace z Chromu…), ukáže kartu
  „Zachytil jsem agenta“: co to je, kde pracuje, od kdy běží a co z něj Agenteeq uvidí. Jedním
  klikem ho přidáš do Mých nástrojů, nebo zvolíš „Nesledovat“ a už se neozve. Se zavřeným oknem
  přijde jedno souhrnné oznámení systému, v jazyce z Nastavení a nikdy během nočního ticha.
- **Katalog rozpoznaných nástrojů má 45 položek** (dřív 14): editory s agenty, agenti v terminálu,
  prohlížeče s AI, lokální modely a webové aplikace nainstalované z Chromu. Nepotvrzené na skutečném
  stroji jsou v docs/CONNECTORS.md označené 🧪. Rozšíření pro Chrome se už nevydává za zdroj
  konverzací desktopových aplikací ChatGPT, Claude, Copilot, Perplexity a Grok.
- **Moje nástroje** v Nastavení → Propojení: u každého je vidět, jestli právě běží, předplatné
  zapíšeš jedním klikem do Útraty a rozhodnutí jde vzít zpět. Přepínač „Nově zachycený agent“
  v Upozorněních se ukládá jako ostatní.
- **Přehled ukazuje jen nástroje, které opravdu používáš** – co běží, co sis přidal a co tu už
  někdy běželo. Přehled limitů ukáže i nástroje bez dat s poznámkou, že limity ani tokeny z nich
  zatím nečte. Pravidlo z 0.29.3 (živý přehled jen s měřeními mladšími 30 minut) platí dál.
- **Gemini CLI a Qwen Code se čtou ze skutečného formátu.** Obě aplikace dnes ukládají JSONL
  (`~/.gemini/tmp/…/chats/*.jsonl`, `~/.qwen/projects/…/chats/*.jsonl`); Agenteeq četl jen starý
  jednosouborový formát, takže moderní verze neukázaly nic. Tokeny: vstup bez mezipaměti + nástroje,
  výstup + přemýšlení; větev relace v Qwen Code nepočítá práci rodiče podruhé.
- Okno rozhraní hlásí serveru, že je vidět, s `keepalive`. Bez něj WebKit při přechodu mezi
  stránkami rušil požadavek a zapisoval do konzole chybu přístupu (`qa:desktop` ve WebKitu: 11 chyb).
  Přerušený požadavek se na serveru už nezapisuje jako chyba 500.
- Nový test ověřuje každý pojmenovaný import v kódu rozhraní: chybějící export dřív prošel všemi
  kontrolami a ukázal se až jako prázdná aplikace v prohlížeči.
- `npm run release:mac -- --install` nechá na Macu jen aktuální verzi: předchozí přesune do Koše
  místo do `~/.agenteeq/zalohy` (na macOS bez příkazu `trash` se odkládá jako dřív).

### Také v tomto vydání

- **Instalace jedním příkazem na Macu.** `curl -fsSL https://agentree-fawn.vercel.app/install.sh | bash` stáhne poslední vydání pro procesor Macu, ověří velikost a otisk SHA-256 proti GitHubu i podpis aplikace, starou verzi přesune do Koše a novou otevře. Soubor stažený v Terminálu nedostane příznak karantény, takže odpadá potvrzení v Nastavení systému; bez otisku od GitHubu nebo při neshodě se nic nenainstaluje. Web ji nabízí v sekci Stažení vedle stažení v prohlížeči. Distribuci a prodej to nenahrazuje – na to je dál potřeba Developer ID a notarizace.
- **Útrata jde složit z viditelných řádků.** Součet měsíce obsahoval i náklady z Admin API, tabulka Výdaje ale ukazovala jen ruční zápisy. Teď má tabulka druhou skupinu „Automaticky z Admin API · OpenAI / Anthropic“ (jen ke čtení, jeden řádek za službu a měsíc, převod do hlavní měny pod částkou) a nad tabulkou rozpad „Tento měsíc = zapsáno ručně + automaticky z Admin API“. Rozpočty a prognóza počítají stejně jako dřív.
- **Kurz říká, odkud je.** Pod Výdaji je zdroj kurzu (ČNB s datem lístku, vlastní z Rozpočtů) a že se minulé měsíce přepočítávají stejným kurzem. Výchozí kurz 23 Kč / 25 Kč je výrazně označený jako orientační.
- **OpenAI Admin API: nejnovější den už nechybí.** Náklady i spotřeba tokenů se dočítají po stránkách (`has_more` / `next_page`, strop 12 stránek). Jeden dotaz s limitem 180 vynechal dnešek a dotaz na spotřebu byl s tímto limitem mimo specifikaci OpenAI (max 31).
- **Nezjištěná spotřeba tokenů se netváří jako nulová.** Když náklady projdou a spotřeba selže, Nastavení u klíče řekne proč; data mají `tokens: null` a `tokensError` místo prázdného objektu.
- **Kalendářní dny jsou všude místní.** Rozpočet tokenů projektu počítá místní měsíc (dřív UTC, takže 1. 11. po půlnoci ještě říjen). „Průměr 7 dní“, mapa aktivity, „včera“ a aktivita projektu se počítají po kalendářních dnech, ne po násobcích 24 h, takže kolem změny času nepřeskočí den. Synchronizace do účtu posílá tokeny po místních dnech Macu a web účtu je už nepřepočítává do UTC.
- **Oprava útraty z Anthropic Admin API:** `cost_report` posílá částky v centech (podle dokumentace „123.45“ = 1,23 $), aplikace je ale četla jako dolary, takže API útrata Anthropicu vycházela stokrát vyšší v Útratě, rozpočtech i prognóze. OpenAI posílá dolary a zůstává beze změny.
- **Živé spojení se po chybě serveru obnoví samo.** Když server na živý proud jednou odpověděl chybou (přetížení, restart, výpadek proxy), prohlížeč spojení zavřel natrvalo a okno pak donekonečna ukazovalo „Agenteeq neběží“ bez živých změn, i když server dávno běžel (ověřeno v Chromiu i WebKitu). Aplikace se teď připojí znovu sama, s prodlevou 2, 5, 10 a pak 30 s, a po návratu do okna nebo obnovení sítě hned.
- **Rozšíření z Chrome Web Store se spáruje samo hned po schválení.** Aplikace důvěřuje ID položky v obchodě nezávisle na příznaku zveřejnění, takže tahle verze nebude po schválení Googlem potřebovat další vydání kvůli párování. Nabídka obchodu v aplikaci a na webu dál čeká na ověření veřejné stránky.
- **Aktualizace ověřuje otisk balíčku.** Stažený balíček se porovná s otiskem SHA-256, který GitHub u přílohy vydání zveřejňuje; dřív se kontrolovala jen velikost. Na pomalé síti má stažení 15 minut místo 90 s, které na 38 MB často nestačily.
- Nastavení → Aktualizace říká pravdu i ve stavech „vydání bez balíčku pro tento Mac“ a „kontrola vypnutá“; dřív obojí trvale hlásilo „Kontroluji aktualizace“. Na mobilu se volba Ručně / Automaticky skládá pod sebe a tlačítka se zalomí, místo aby přetékala z karty.
- Chrome Web Store: po zamítnutí výčtu značek byl anglický popis zjednodušen a znovu odeslán. Zdroj pravdy obsahuje Store ID; veřejný web a aplikace se na instalaci z obchodu přepnou až po ověření schválení.
- Free projekt Supabase udržuje denní dotaz do databáze z GitHub Actions (`public.udrzet_aktivitu()`, tedy `select 1`). Dřívější požadavek na nastavení Auth databázi nečetl, takže by uspání podle pravidel Supabase nezabránil. Dotaz nečte ani nezapisuje žádnou tabulku a nepoužívá uživatelský token. Dokud migrace v databázi není, běh v Actions viditelně selže.

## 0.31.4 – 2026-10-02 · stabilní čtení dlouhých relací Codexu

- Dlouhé JSONL relace Codexu se čtou po blocích místo jednoho velkého řetězce. Aplikace se tak nezastaví na limitu paměti Node a denní tokenový součet neztratí právě běžící relaci.
- Stejný proudový parser používá i historie kreditů a audit skutečných dat. Regrese pokrývá soubor přes hranici bloku i rozepsaný poslední řádek.

## 0.31.3 – 2026-10-02 · přesný denní součet Codexu

- Kumulativní tokenové čítače Codexu se agregují po jednotlivých složkách. Když se při kompakci vynuluje jen cache čítač, nevznikne falešný skok ve vstupu ani ve výstupu.
- Datový audit používá stejný referenční výpočet jako živý konektor a regresní test pokrývá samostatný reset cache.

## 0.31.2 – 2026-10-02 · automaticky ověřené plány

- **Plány bez ručního opisování:** změna přihlášeného plánu Claude Code se propíše do Útraty ihned ze sledovaného účtového souboru. Nový `plan_type` Codexu se promítne přes živou událost a údaj starší než 24 hodin se přestane vydávat za aktuální.
- Rozpoznaný plán už nenabádá k doplnění částky a nezobrazuje zavádějící „cenu nezjištěnou“. Ruční položka zůstává jen jako vedlejší evidence dalších licencí, jejichž skutečnou platbu poskytovatel přes podporované rozhraní neposkytuje.
- Průvodce a dokumentace rozlišují spotřebitelský plán od firemní API útraty. Aplikace používá ověřené náklady z Admin API a nikdy je nevydává za cenu ChatGPT nebo Claude předplatného.

## 0.31.1 – 2026-10-02 · úplná angličtina výstupů

- Anglické rozhraní exportuje anglické hlavičky a stavy v CSV útraty i projektů. Český export, bezpečnost proti tabulkovým vzorcům a účetní součty zůstávají beze změny.
- Kalendář formátuje zobrazené datum podle jazyka aplikace. Návrat z přihlášení přes Google je v angličtině kompletní i v chybové větvi a už nevytváří požadavek na chybějící faviconu.
- Karta účtu odkazuje přímo na českou nebo anglickou verzi zásad ochrany soukromí.

## 0.31.0 – 2026-10-02 · více licencí na jednom místě

- **Více licencí na jednom místě:** Útrata seskupuje všechny aktivní licence podle služby. Každá může mít vlastní název účtu, částku a datum; další licenci lze přidat přímo z karty poskytovatele a jednotlivě ji ukončit. Rozpoznaný plán tohoto Macu zůstává oddělený od ručních plateb, takže Agenteeq nikdy nepředstírá, ke kterému účtu platba patří.

## 0.30.1 – 2026-10-01 · pravdivé plány a srozumitelné tokeny

- Útrata už nepřebírá veřejný ceník jako skutečnou cenu předplatného. Claude Code a Codex dál potvrzují název plánu, ale částka se ukáže a započítá jen z ověřeného billing zdroje nebo z platby zapsané uživatelem.
- Souhrn v postranním panelu výslovně označuje tokeny z lokálních přepisů, aby se technický počet vstupu a výstupu nedal zaměnit za finanční útratu.

## 0.30.0 – 2026-10-01 · bezpečné aktualizace aplikace

- Aplikace při spuštění a pak pravidelně ověří poslední veřejný release Agenteeq. Když je pro tento Mac dostupná nová verze, objeví se v horní liště výrazná akce **Stáhnout**; po stažení vede přímo na balíček ve Finderu.
- V Nastavení → Aplikace na tomto Macu je volba **Ručně / Automaticky**. Automatický režim stáhne jen přesně odpovídající balíček z oficiálního releasu, ale běžící aplikaci nikdy potichu nenahradí.
- Selhání sítě, neplatný release nebo chybějící balíček se nevydávají za aktuální verzi. Kontrola přijímá jen nedraftový release a balíček s přesnou verzí, systémem, architekturou a důvěryhodnou GitHub adresou.

## 0.29.9 – 2026-09-30 · čerstvý stav bez přeskoku stránky

- Návrat okna do popředí, obnovení sítě a pojistná kontrola živého proudu teď načtou nový snímek stavu přímo do otevřené obrazovky. Ruční obnova také nepřenačítá celou aplikaci, takže neztratí rozepsaný formulář, aktuální stránku ani polohu posunu.
- Prázdný stav „Nikdo teď nečeká na tvé rozhodnutí“ je opticky vycentrovaný. Odznaky upozornění v postranní nabídce mají stejné odsazení od pravého kraje podbarvení jako ostatní prvky.
- Napojení Anthropic Admin API načítá všechny stránky denního reportu po povolených 31 dnech, používá přesné ISO časové hranice a ověřené údaje obnovuje každých deset minut. Když další ověření selže, předchozí náklady a tokeny se okamžitě vyřadí místo toho, aby vypadaly jako aktuální data.

## 0.29.8 – 2026-09-30 · ověřené procesy bez přepisu

- Proces Claude Code, Codexu a dalších podporovaných CLI bez dostupného přepisu má vlastní stav „Detekovaný proces“. Už se nevydává za konverzaci, která čeká na zadání, ani nepoužívá název pracovní složky jako název úlohy.
- Detail zobrazuje jen ověřené údaje procesu: PID, čas spuštění a pracovní složku. Výslovně rozlišuje, že bez přepisu nelze určit hlavního ani pomocného agenta; po nalezení přepisu se položka nahradí ověřenou konverzací.
- Dočasnému procesu se nenabízí neplatné otevření v Claude ani přiřazení k projektu. Pokud skončí dřív, než se přepis objeví, API i aplikace vrátí přesný stav místo chybné hlášky „Konverzace nenalezena“.

## 0.29.7 – 2026-09-30 · Nastavení bez překrývajícího pásu

- Na širokém okně zůstává při posouvání Nastavení ukotvený nadpis a podmenu. Pravé horní akce se skryjí a průhledný zbytek řádku neblokuje karty; po návratu nahoru jsou akce znovu dostupné.
- Všechny popisky, odznaky, časové osy a štítky v aplikaci, na webu i v rozšíření mají nejméně 12 px. Automatická kontrola odmítne jakýkoli menší text při dalším vývoji.
- QA v Chromiu a WebKitu ověřuje polohu nadpisu a menu, odstranění pásu, průchod kliknutí a obnovení klávesového fokusu.

## 0.29.6 – 2026-09-30 · stabilnější posun a loga při živých změnách

- Malé kroky trackpadu používají ve WebKitu stejný okamžitý posun jako přepnutí obrazovky. Před posunem se přepočítá režim `scroll-behavior`, aby gesto nezůstalo viset mezi nativním a plynulým posouváním.
- Živá aktualizace karty ponechá již dekódovaná loga jako stejné DOM prvky. Nový obsah se může změnit bez prázdného snímku mezi odstraněním a opětovným načtením značky; odlišné logo se správně nahradí.
- Desktopové QA ověřuje tento přechod v Chromiu i WebKitu a znovu měří kolečko, trackpad, zamčené překryvy a ukotvení Nastavení.

## 0.29.5 – 2026-09-30 · správné rozpoznání Codexu v ChatGPT pro Mac

- ChatGPT pro Mac nyní zpřístupní přibalený Codex CLI i aplikaci Agenteeq spuštěné z Finderu. Stav „Napojené modely“ ho proto správně ověří i bez PATH a nabídne režimy Codexu na pozadí a v Terminálu. Když příkazový program skutečně chybí, karta to výslovně odliší od dostupných přepisů.

## 0.29.4 – 2026-09-29 · přesný prázdný stav rozhodnutí

- Prázdná sekce rozhodnutí už netvrdí, že všichni agenti běží nebo že se v ní zobrazí vyčerpaný limit. Zobrazuje jen ověřený stav čekajících dotazů.

## 0.29.3 – 2026-09-28 · čitelnější stav agentů a měřených dat

- Nadpis Nastavení zůstává při posouvání společně s podnabídkou na místě i na úzké obrazovce.
- Selhaný agent zůstává v hlavním přehledu a má vlastní filtr v Agentech; do „Potřebuje tvé rozhodnutí“ patří jen skutečný dotaz agenta. Limit má samostatný filtr.
- Přehled limitů používá jen měření mladší 30 minut. Neznámý čas obnovy nedopočítává a historické vzorky Claude Desktopu nevydává za aktuální procento předplatného. Nezdokumentovaná hodnota `xu` se nevydává za procento útraty.
- Hlavní tokenová metrika je výslovně označená jako zaznamenané tokeny z místních přepisů. Z Přehledu, Statistik a Projektů zmizely dlouhé vysvětlivky, které překrývaly účel karet.
- Desktopové QA kontroluje ukotvení nadpisu a podnabídky v Chromiu i WebKitu a oddělení selhání od rozhodnutí.

## 0.29.2 – 2026-09-28 · stabilní podnabídka Nastavení

- Levá podnabídka Nastavení zůstává při posunu dlouhé skupiny v původní výšce vedle obsahu; už nesjíždí k horní hraně okna. Vodorovná podnabídka na menších oknech si zachovává své chování.
- Regresní desktopové QA měří počáteční i koncovou polohu podnabídky na třech šířkách v Chromiu i WebKitu a ověřuje, že skupiny lze přepnout i po posunutí stránky.

## 0.29.1 – 2026-09-28 · plynulé posouvání, noční ticho a opravy z QA

Obsah konceptu 0.29.0 (přihlášení bez Terminálu, pravdivé časy obnovy limitů, párování rozšíření
bez kódu, jednotná tlačítka) vychází až v tomto vydání; 0.29.0 samostatně publikovaná nebyla.
Rozšíření čeká na schválení v Chrome Web Store.

### Dodatečné opravy před vydáním

- Krátká gesta trackpadu v nativní aplikaci teď reagují přímo na setrvačnost macOS; plynulý dojezd zůstává pro větší kroky kolečka. Tlačítko obnovy v horní liště znovu načte konektory, stav a právě otevřenou stránku.
- Drobné zdánlivé svislé přetečení ve vodorovně rolovacích prvcích už nemůže zadržet kolečko celé stránky.
- Dovednosti se nově načítají také ze sdílené složky `~/.agents/skills`. Skupina filtrů zmizí, pokud není co filtrovat; vybrané kapsle se v rolovacích filtrech neořezávají.
- Opraven kontrast červeného počítadla v tmavém režimu. Cache log používá značku obsahu z tohoto vydání a nový build ji ověřuje v desktopovém QA.
- Okno rozšíření má vlastní tlačítko obnovy, které si vyžádá nové hlášení z otevřených podporovaných karet a teprve potom překreslí stav. Obnova projde i nezměněnou konverzaci bez čekání na minutový udržovací signál.

### Postranní panel nezávisí na tom, jak prohlížeč měří písmo

- Profil v postranním panelu si podobu vybírá podle místa, které mu v panelu skutečně zbylo
  (`@container`), ne podle výšky okna. Když je něco vyšší, než se čekalo (jiné metriky písma ve
  WebKitu, patička s výpadkem spojení), zvolí menší podobu, nebo se na nejnižším okně schová celý
  – nikdy se neořízne. Hranice stupňů mají aspoň 20 px volného místa. Profil má pevnou výšku,
  takže jeho načtení už nabídkou nepohne.
- `qa:desktop` měří panel až v ustáleném stavu po změně velikosti okna (hned po ní má i Chromium
  profil ještě ve staré podobě) a přidává zátěžový případ s patičkou o 48 px vyšší.
- Test přerušení dojezdu posouvání čeká, až dojezd prokazatelně běží. Playwright ve WebKitu vrací
  kolečko dřív, než ho stránka zpracuje; kolečko pak dorazilo až po skoku aplikace a správně
  rozjelo nový dojezd. Chyba byla v testu, ne v aplikaci.

### Angličtina bez zbytků češtiny a Windows bez Macu

- Texty ze serveru (režimy a poznámky spouštění, stavy zdrojů, činnost agentů, chybové hlášky,
  útrata, titulky upozornění) se v angličtině překládají na klientu. Server je dál píše česky
  a označuje `ui('…')` (`src/texty.js`), klient je při příjmu přeloží podle
  `public/js/i18n/en-server.js` – i složené věty s čísly, daty a částkami. Tvar dat se nemění,
  přeloží se i dřív uložená upozornění.
- Oznámení systému odcházejí v jazyce z Nastavení: server je před odesláním přeloží stejným
  slovníkem, uložené upozornění zůstává česky. V anglickém souhrnu nočního ticha jsou anglicky
  i názvy limitů a rozpočtů.
- „Co je nového“ má anglické znění všech vydání.
- Na Windows (a Linuxu) rozhraní píše „tento počítač“ místo „tento Mac“ a zkratky Ctrl+K, Ctrl+↵,
  Ctrl+V místo ⌘; zkratky poslouchají na Macu jen ⌘, jinde jen Ctrl. Systém posílá server
  (`<html data-system>`, `host.system`).
- Testy: úplnost překladů hlídá i texty ze `src/` (česká věta mimo `ui()` neprojde),
  `test/texty-serveru.test.mjs` překládá skutečné výstupy serveru i oznámení systému,
  `test/system.test.mjs` obě varianty systému.

### Vždy aktuální verze po aktualizaci

- Oprava: loga služeb, brand, ikony a písma se posílala s `immutable` na rok pod adresou bez verze,
  takže okno aplikace pro Mac (WKWebView), Windows (WebView2) i prohlížeč po aktualizaci dál
  ukazovaly stará loga. Natrvalo se teď ukládá jen adresa se značkou obsahu (`?v=`), vše ostatní
  se před použitím ověří (`no-cache` + ETag, odpověď „nic nového“ má pár bajtů). Loga při
  překreslení neproblikávají (`src/verze-souboru.js`, `test/cerstvost.test.mjs`).
- Service worker má jméno mezipaměti podle verze a obsahu místo ručního „v6“: po vydání se
  nainstaluje nový a staré mezipaměti smaže; odpovědi s `no-store` neukládá.
- Web: loga, brand, ikony a písma na Vercelu se před použitím ověří (`no-cache`) místo roční
  neměnné mezipaměti, takže nové logo se po nasazení ukáže hned.

### Plynulé posouvání po přerušení

- Opravené kolečko a trackpad: po posunu klávesnicí, posuvníkem nebo přepnutí obrazovky nový dojezd
  začíná na skutečné poloze. Starý kód událost převzal, ale před prvním snímkem ji zahodil. Přerušení
  ruší i čekající snímek; omezení pohybu dojezd ukončí a kolečko posouvá přímo bez animace i ve WebKitu.
- Regresní `qa:desktop` v Chromiu a WebKitu ověřuje první posun z nenulové polohy, opakované kroky
  po přerušení, návrat z jiné obrazovky, vnitřní seznam, klávesnici, dialog i omezení pohybu.

### Noční ticho a souhrn místo série upozornění

- Nastavení → Upozornění → **Noční ticho**: v nastavený čas (výchozí 22:00–7:00 podle hodin
  počítače, může jít přes půlnoc) nepřijde žádné oznámení ani zvuk – v aplikaci pro Mac, ve Windows,
  v macOS z příkazové řádky ani v prohlížeči. Seznam upozornění, zvoneček, stav agentů a odznak
  v Docku, v řádku nabídek i v hlavním panelu Windows se mění dál: to je stav, ne vyrušení. Výchozí
  stav je vypnuto, starší nastavení se nemění.
- Na konci ticha přijde jedno souhrnné oznámení, třeba „Během nočního ticha: 2× čeká na rozhodnutí,
  1× limit“. Počítá jen to, co pořád platí: rozhodnutí, které mezitím padlo, obnovený limit ani
  přečtené upozornění v něm nejsou. Klik vede rovnou do konverzace, u víc agentů na Agenty
  s filtrem „Potřebuje tebe“. Souhrn přežije restart aplikace i uspaný Mac; po probuzení počká 15 s,
  než zdroje doženou, co se v noci vyřešilo.
- Když přijde víc než tři upozornění za minutu, další se spojí do jednoho souhrnu („Další
  upozornění: 3× dokončeno“). Za minutu tak přijdou nejvýš tři oznámení i se souhrnem; souhrn
  dorazí, jakmile je zase místo, nejpozději minutu po prvním odloženém.
- Zkušební upozornění ticho dodrží a řekne to, jinak by klik vypadal, že nic neudělal.
- Oprava: s vypnutým „Dokončený úkol“ se stránka Nastavení zasekla (ověřeno v Chromiu). Zakázaný
  výběr z nabídky rozjel nekonečnou smyčku mezi pozorovatelem změn a vlastním tlačítkem
  (`public/js/selects.js`).
- Oprava: přepínač nebo výběr v Nastavení po uložení ztratil fokus a klávesnice začínala znovu od
  začátku stránky. Překreslení teď fokus vrátí (`public/js/ui.js#fill`).

### Detekce běžících agentů

- Oprava: jako agent Claude Code se počítal i shell, který ho jen spouští nebo o něm mluví
  (`/bin/sh -c … /opt/claude-code/bin/claude …`), a tak se jeden agent ukázal dvakrát. Agentem je
  teď jen běžící program – spustitelný soubor, nebo skript pod node/sh/python; `sh -c`, `sudo`,
  editor ani `ln` s cestou ke claude ne. Platí i pro Codex, Gemini, Qwen, Copilot a lokální modely.
- Nový agent v kořeni přepisů, který ještě neexistoval (Claude Code zakládá `projects/` až s první
  zprávou), se ukáže hned místo za 1–5 s: sledování rodiče pozná vznik složky. Naměřeno 5–6 ms
  místo 1,1–4,7 s; v klidu stejně pokusů o sledování i CPU jako dřív.
- Oprava: přehled běžících aplikací se ptal Ollamy natvrdo na `127.0.0.1:11434` a přehlížel
  `AGENTEEQ_OLLAMA_URL`. Teď jde stejnou cestou jako chat s Ollamou (`src/ollama.js`).

### Opravy rozvržení a tvarů

- Postranní panel už neschová Nastavení. Nabídka se na okně od 881 px šířky a do 1070 px výšky
  potichu rolovala a poslední položku uřízla nebo schovala celou (1440 × 950: 87 px). Teď se nabídka nikdy nezmenší ani neroluje a místo uvolňuje profil: podle výšky okna je vysoký,
  střední (menší avatar, bez pozdravu), v řádku, nebo na jednom řádku bez rozpisu zdrojů. Jméno,
  zdroje i jméno Macu mají vždy jeden řádek a zdrojů se vypíšou nejvýš dva, takže výška profilu
  nezávisí na obsahu. `qa:desktop` hlídá okna 620–1200 px na 881, 1180 a 1440 px, česky
  i anglicky, i s patičkou při výpadku spojení.
- Mosazný pruh u aktivní stránky je vidět i na okně do 1180 px – ležel celý mimo kartu panelu.
- Výběr nemění řez písma: položky hlavní nabídky mají Onest 400 a položky nabídky Nastavení
  Onest 500 ve všech stavech, vybranou stránku ukazuje plocha, barva a pruh.
- Výšky jen ze stupnice 32 / 40 / 48 px: položky nabídky (dřív 44,5 px, na monitoru na výšku až
  68 px), čipy agentů a menu Nastavení na telefonu (36 → 40 px), volba jazyka v Nastavení (karta
  54 px → kapsle 40 px), pole pro správcovský klíč (36 → 32 px jako tlačítko vedle), položky palety
  příkazů (42,5 → 40 px) a přepínač jazyka na webu (26 → 28 px v rámu 32 px jako `.seg--sm`).
- Karta „Přidat vlastního agenta“ nemá nad jediným sbaleným řádkem prázdné místo a linku.
- `qa:tvary` nově měří, že se řez písma při výběru nemění a že jednořádkové ovládací prvky mají
  výšku ze stupnice.

### Vydání a testy

- Oprava: build pro Windows četl verzi pláště z `Agenteeq.exe` až po smazání složky buildu
  a chybu tiše nahradil verzí z `package.json`, takže CI hlásilo zjištěnou verzi u souboru,
  který neexistoval. Verze se teď čte z hotového `.exe` před archivem a build skončí, když ji
  nejde přečíst nebo nesedí (`scripts/exe-version.mjs`).
- Oprava: build a QA pro Windows vkládaly cesty do `powershell -Command` v apostrofech, takže
  složka jako `C:\Users\O'Brien\…` (i dočasná pod %TEMP%) příkaz rozbila. Cesty teď jdou jen
  proměnnými prostředí přes `scripts/powershell.mjs`; hlídá to `test/windows-regression.test.mjs`.
- Přeskočené testy vždy říkají proč: tři z nich (pod rootem, mimo Windows) vypisovaly jen
  „# SKIP“. Důvod u každého `skip`/`todo` hlídá `test/dokumentace.test.mjs`.
- Testy se zapnutými procesy vidí jen své procesy (`test/helpers.mjs#jenProcesy`): dřív si
  přidaly `CLAUDE_CONFIG_DIR` každého procesu na počítači a četly cizí přepisy. Bez omezení
  `startTestServer` odmítne start.
- Test živého procesu ověřuje i to, co sliboval v názvu: nespárovaný proces po skončení zmizí
  (dřív poslední krok prošel vždy, protože spárovaný proces zmizel už spárováním). Sdílený výpis
  procesů není starší než jeden průchod, takže `AGENTEEQ_PROCESS_MS` pod 4 s opravdu platí.
- Test živého procesu `claude` (`test/detekce-agentu.test.mjs`) padal při souběžných bězích:
  server vidí procesy celého počítače, přidal si CLAUDE_CONFIG_DIR cizího běhu a jeho přepis
  s tímtéž pevným ID obsadil konverzaci. Každý běh má teď vlastní ID, průchod spustí test sám
  místo čekání na 5s časovač a převzetí nově vzniklého kořene hlídá samostatný test.
- Popis vydání na GitHubu má čistou osnovu nadpisů: název vydání je `##` s velkým počátečním
  písmenem, skupiny změn pod ním `###`, „Ke stažení“ a další sekce zase `##`. Dřív byl název
  `###` a začínal malým písmenem. Zveřejnění popis přegeneruje, takže se to projeví i u 0.29.0.

## 0.29.0 – 2026-09-27 · nové okno rozšíření, párování bez kódu a jednotná tlačítka

### Rozšíření se spáruje samo a má nové okno

- Žádné opisování kódu: rozšíření z Chrome Web Store i ze složky, kterou připraví aplikace, se
  s Agenteeq spáruje samo hned po instalaci. Aplikace ho pozná podle ID, které mu přidělí Chrome
  (`src/app.js#pozadatOSparovani`). Jednorázový kód zůstává jen jako záloha pro jiná rozšíření.
- Nové okno rozšíření: nahoře kolik agentů právě pracuje, pod tím všechny otevřené konverzace
  s AI. Každý řádek řekne, co agent dělá („odpovídá · 0:42“, „narazil na limit“, „dokončil před
  3 min“), a kliknutím se přepneš do té karty. Aktuální karta ukazuje počty zpráv. Sledované
  služby a ověření stránky jsou vlastní pohledy se zpátečním tlačítkem. Nové snímky do Chrome
  Web Store.
- Rozšíření mluví anglicky: okno, název i popis v Chromu se řídí jazykem prohlížeče (český Chrome
  dostane češtinu, ostatní angličtinu). Anglická karta Chrome Web Store s vlastními snímky.
  Úplnost překladu hlídá `test/extension-i18n.test.mjs`, `qa:extension` projde okno i anglicky.
- Oprava: složka rozšíření, kterou připravuje aplikace (`~/.agenteeq/extension`), se kopírovala
  podle pevného seznamu a chyběla v ní písma a loga služeb, takže okno bylo bez nich. Teď se
  kopíruje celá složka, stejně jako do balíčku pro obchod, a staré soubory z kopie zmizí.

### Jednotný tvar a velikost všech tlačítek

- Všechno, na co se klepe a má jeden řádek, je v aplikaci, na webu, v rozšíření i v podkladech
  obchodu kapsle. Dřív se míchalo šest různých zaoblení (6 až 20 px), pole měla jiné rohy než
  tlačítko vedle nich a obrys zaostření z klávesnice měnil tvar prvku.
- Výšky ovládacích prvků mají jen tři stupně (32, 40 a 48 px, na webu k tomu 56 px pro hlavní
  výzvu). Pole, výběry a segmentové volby mají stejnou výšku jako tlačítko vedle nich.
- Popisek tlačítka má vždy stejný řez písma. Vybraná volba už neztuční, takže text při výběru
  neposkočí.
- Pravidla jsou v `docs/DESIGN.md` a nová kontrola `npm run qa:tvary` změří v CI tvar každého
  ovládacího prvku na vykreslené ploše.

### Texty, které dávají smysl

- Přepsáno přes 40 nelogických nebo nepravdivých textů v aplikaci, na webu a v rozšíření. Pryč jsou
  výzvy k Terminálu, vývojářské poznámky v rozhraní, špatný rod („Agenteeq se připojí samo“)
  a dvě nepravdivá tvrzení, že rozšíření přenáší „přepis“ webových chatů (přenáší jen stav a počty).
- Oprava: „3 procesů“ v přehledu aplikací; jednopísmenné předložky už v okně rozšíření nekončí řádek.

### Méně práce na pozadí

- V klidu Agenteeq nesouhrnuje nezměněné přepisy, staré soubory kontroluje jednou za minutu, `ps`
  spouští jednou pro oba konektory procesů a neposílá do okna tikající dobu běhu. Změřeno na 2 400
  přepisech: CPU 4,6 % → 2,7 %, data do okna 45 kB → 12 kB za 30 s.

### Napojení Claude Code a Codexu rovnou v prohlížeči, bez Terminálu

- „Napojit“ dřív otevřelo Terminál s výpisem a otázkami a teprve pak prohlížeč. Přihlášení teď běží
  na pozadí (`src/prihlaseni.js`): `claude auth login --claudeai` a `codex login` hned otevřou
  autorizační stránku, Agenteeq jen čeká a napojení potvrdí.
- „Prohlížeč se neotevřel?“ otevře záložní odkaz z přihlášení a kód ze stránky se vloží do okna
  Agenteeq. Přihlášení, které skončí bez napojení, okno ohlásí hned. Selhaný úkol s vypršeným
  přihlášením má tlačítko „Přihlásit znovu“ místo příkazu do Terminálu.

### Okna limitů vždy ukazují, kdy se obnoví

- U každého okna je řádek s obnovou: přesný čas s odpočtem, po obnově kdy proběhla, horní mez
  z historie Claude Desktopu („obnova nejpozději …“), nebo výslovně „čas obnovy zdroj neuvádí“.
- Přesné časy obnovy Claude i bez běžící konverzace z uložené stránky Usage v Claude Desktopu
  (Beta). Každé okno Claude má jeden řádek složený z nejnovějšího měření.
- Oprava: hláška „resets Oct 2, 5pm“ ukazovala obnovu týdenního limitu dnes nebo zítra.

### Rozšíření připravené pro Chrome Web Store

- Balíček, snímky, texty karty a zásady ochrany soukromí (`/soukromi`, `/en/privacy`) jsou hotové
  (`docs/CHROME-WEB-STORE.md`). Po schválení stačí adresa v `public/js/obchod.js` a aplikace
  i web přepnou na „Přidat do Chromu“ – obchod se na Macu otevře rovnou v Chromu.

### Web: pohyb jako v aplikaci

- Řádky nadpisů vyjíždějí zpoza masky, výřez aplikace v úvodu se odkryje jako měřidlo, dlaždice
  v řadě vyjedou s odstupem a obraz v nich se rozsvítí, loga naskočí jedno po druhém a čísla kroků
  vyjedou v okénku jako počítadlo. Mimo úvod řídí pohyb posouvání, nic neběží podle hodin;
  „omezit pohyb“ ukáže všechno rovnou.

## 0.28.1 – 2026-09-26 · vzdálený Claude se neztratí z přehledu

- Opravená chybějící detekce Claude Code spuštěného vzdáleně z Claude Desktopu.
  Původní konektor četl jen `~/.claude/projects`, kam vzdálená relace nezapisuje.
  Nový místní konektor čte uložený seznam relací a dostupnou část přepisu v IndexedDB.
- Existující relace se načtou zpětně po startu; změny cache sleduje watcher a záložní průchod.
  Nový agent i změna stavu mají regresní HTTP/SSE test do 2 sekund.
- Nepředstírá úplnou historii ani spotřebu: v detailu je rozsah dostupného přepisu a upozornění
  na neúplné tokeny. Osa z metadata ukazuje jednotlivou hlášenou změnu, ne nepřetržitou práci.
  Zastaralý běžící stav se nevydává za aktuální, obnova jiných dat cache jej neoživí.
- Claude databáze se čte bez zámku a bez zápisu, žádné přihlašovací údaje se nepoužívají.
  Neúplný zápis, neznámý formát nebo poškozená cache zachová poslední načtené relace
  a zobrazí chybu zdroje; další změna načtení obnoví. Interní formát zůstává označený Beta.

## 0.28.0 – 2026-09-26 · spolehlivé napojení, klidné Nastavení a angličtina

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
