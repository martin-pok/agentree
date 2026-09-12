# Changelog

## Vyladěné detaily rozhraní — 2026-09-12

- Na telefonu se u karty „Spustit agenta" schovává text tlačítka pro obnovení nabídky, takže na kliknutí zbývala plocha 14×22 px. WCAG 2.2 žádá aspoň 24×24; teď má 32×32 a díky zápornému okraji se vzhled nezměnil.
- **Historie dokoupených kreditů sahá tam, kam sahají data** — ne jen 30 dní zpět. Agentree jednorázově projde i starší konverzace Codexu a vytáhne z nich výhradně řádky se zůstatkem kreditů (žádné přepisy, žádné tokeny); na tomto Macu tím přibylo pět dřívějších dokoupení od 12. 7.
- **Částky u dokoupení odpovídají skutečnosti.** Codex hlásí zůstatek z každé konverzace zvlášť a starší konverzace posílá zastaralé hodnoty, takže řada skáče nahoru a dolů — Agentree z toho dřív dopočítal i nákupy, které se nestaly, a u skutečných ukazoval nižší částky (třeba +19,6 místo +108,5). Nákup se teď pozná podle toho, že se nárůst udrží: medián následujících odečtů musí zůstat nad původní úrovní. Detekce běží na serveru nad všemi odečty, ne nad zkrácenou uloženou historií, a má vlastní testy.
- **U jednoho limitu svítila dvě různá čísla.** Jakmile dorazila přesná data ze stavového řádku Claude Code, měřáky ve Statistikách a v detailu agenta kreslily vedle sebe i záložní hodnotu z historie plánu — tedy „5 h 42 %" a hned pod tím „5 h 13 %". Měřáky teď respektují stejnou přednost zdrojů jako zbytek aplikace: přesná data vyhrávají, záloha se skryje. Hlídá to test.
- Aktivní záložka v Nastavení hlásí `aria-current="true"` místo prázdné hodnoty, která podle specifikace znamená opak — odečítače obrazovky teď řeknou, ve které sekci uživatel je. Vzhled se nemění, styl se váže na přítomnost atributu.
- **Práce pomocných agentů se už neztrácí.** Claude Code píše jejich přepisy do `<projekt>/<konverzace>/subagents/agent-*.jsonl`, tedy o dvě úrovně hlouběji, než konektor četl — dnešních 1 133 552 tokenů (23 % práce Claude) tak v Agentree vůbec nebylo. Teď se načtou jako samostatné konverzace navázané na rodiče: v seznamu agentů zůstávají skryté pod ním, ale mají vlastní přepis, stav i tokeny. Jméno dostanou z popisu úlohy v rodičovském přepisu (párování přes `agentId`), takže v detailu rodiče je vidět „Pomocní agenti: 6 · 1,13 M" a proklik na to, co každý dělal.
- **Soukromí a bezpečnost** (Nastavení → Aplikace na tomto Macu): karta říká narovinu, co kde leží — konverzace se jen čtou z disku a drží v paměti, trvale se ukládá jen nastavení, projekty, rozpočty a historie upozornění, klíče k API patří do Klíčenky a ven z Macu nejde nic kromě volitelného dotazu na náklady tvým vlastním klíčem. Texty upozornění jsou jediná trvale ukládaná data odvozená z obsahu konverzací a teď je jde jedním tlačítkem smazat (i s klíči proti opakování). Datová složka se nově zakládá s právy 0700 a při startu se na ně srovná; soubor měl 0600 už dřív.
- **Vlastní agenti** (Nastavení → Propojení): lokální služby bez vlastního konektoru — ComfyUI, Ollama a servery s rozhraním OpenAI (LM Studio, vLLM, llama.cpp). Agentree se jich ptá jen na stav a ukazuje je i mezi běžícími aplikacemi na Přehledu. Bezpečnost na prvním místě: adresa smí mířit výhradně na tento Mac nebo do místní sítě (loopback, 10.x, 172.16–31.x, 192.168.x, .local), cloudová metadata na 169.254.x jsou zakázaná natvrdo, z adresy zůstane jen origin (cesta ani dotaz se nepřenesou), dotaz je vždy GET, nenásleduje přesměrování, má časový limit 1,5 s a strop 64 kB na odpověď. Přihlašovací údaje se neukládají, agentů je nejvýš osm a zápis vyžaduje stejnou ochranu proti CSRF jako ostatní změny.
- **Historie vytížení plánu Claude** ve Statistikách: 30 dní skutečných vzorků z historie, kterou si zapisuje aplikace Claude Desktop — graf 5hodinového okna, týdenního okna a extra usage. Čte se na vyžádání (`GET /api/usage/claude`), nikam se neukládá a identifikátor organizace ze vzorků se ven nedostane. U extra usage zůstává poznámka, že zdroj neuvádí jednotku.
- Karta **Limity a kredity** říká pravdu o pokrytí: každá aplikace má vlastní limit (Codex odděleně od chatu v ChatGPT) a pod měřáky se vypíše, které aplikace limity hlásí a která běžící aplikace svůj limit na disk nezapisuje, takže ho Agentree nemá odkud přečíst. Seznam se odvozuje ze skutečného stavu, nic se nedoplňuje odhadem.
- Instalace pro další lidi v nainstalované aplikaci: složka `dist/` existuje jen ve vývojovém repu, takže běžný uživatel dřív viděl vývojářský příkaz `npm run build:mac`, se kterým nic nezmůže. Karta teď ukáže samotnou aplikaci s tlačítky Ukázat ve Finderu a Kopírovat cestu a poradí, že ji stačí ve Finderu zabalit (Komprimovat) — Node.js je uvnitř, příjemce nic doinstalovávat nemusí.
- Nová sekce **Dovednosti**: na jednom místě všechny soubory `SKILL.md`, které máš na Macu — u Claude, v jeho pluginech a plánovaných úlohách i u Codexu. Každá položka ukazuje název a popis z hlavičky souboru, zdroj, velikost, kdy byla naposledy upravena a cestu (stejné názvy z různých pluginů tak jdou rozlišit). Obsah se dá jedním klikem zkopírovat a použít u jiné služby nebo agenta, nebo stáhnout jako `.md`. Filtr podle zdroje a hledání v názvu i popisu. Agentree soubory jen čte a nikam je neodesílá; obsah vydává výhradně podle id z čerstvě projitého seznamu, takže přes tuto cestu nejde přečíst jiný soubor na disku.

- Nastavení → Instalace pro další lidi (desktopová aplikace): karta dřív jen napsala „předej instalační ZIP“ a nedala žádný způsob, jak ho získat. Server teď sám zjistí, jestli `dist/Agentree-<verze>-macOS-<architektura>.zip` z posledního `npm run build:mac` existuje (velikost, datum), a karta podle toho ukáže buď název souboru s tlačítky **Ukázat ve Finderu** a Kopírovat cestu, nebo návod, jak balíček vytvořit. Nový endpoint `/api/install/reveal` odvozuje cestu vždy sám ze složky `dist/` na serveru (nikdy z požadavku), má stejnou ochranu proti CSRF jako ostatní mutace a v režimu `AGENTREE_OPEN=dry` jen vrátí plán.
- V Nastavení nefungovalo žádné tlačítko: klik spolkla hned první podmínka obsluhy, protože `[data-appearance]` nese i kořenové `<html>` a `closest()` k němu dolezl. „Jak propojit“, „Načíst znovu“, „Poslat zkušební“ ani odebrání licence a klíčů tak nic nedělaly — a v tmavém režimu klik navíc potichu přepnul vzhled na světlý. Podmínka teď míří jen na tlačítka volby vzhledu.
- „Jak propojit“ u webových zdrojů skutečně vede k cíli: odroluje na kartu rozšíření, krátce ji zvýrazní a přesune fokus na první krok. Místo odkazu bez obrysu je z něj plnohodnotné tlačítko.
- Router při přepnutí obrazovky vyměňuje uzel `#view` za čistou kopii, takže posluchače předchozího pohledu zmizí. Dosud se hromadily a po N návštěvách se jedna akce provedla N× — stejná příčina jako u nezavíratelných dialogů na Útratě, teď vyřešená pro všechny obrazovky naráz.

- Dlaždice výběru vzhledu (Světlý / Tmavý / Podle systému) mají stejný vnitřní okraj nahoře i dole; pevná minimální výška je pryč, obsah se svisle vystředí.
- Dialog projektu: „Barva“ už nezasahuje do pole Popis. Skupina barev je místo `fieldset` s `legend` (kde prohlížeč ignoruje horní okraj) běžný podnadpis a `role="radiogroup"` s popiskem, takže odstup odpovídá zbytku formuláře.
- Limity Claude (5 h a týden) zůstávají aktuální, i když zrovna neběží žádná konverzace. Agentree je bere ze záložního zdroje — historie vytížení plánu, kterou si sama zapisuje aplikace Claude Desktop. Přesná data ze stavového řádku Claude Code mají dál přednost a záloha se skryje, jakmile dorazí. Formát souboru je interní a nezdokumentovaný, proto 🧪 Beta.
- Extra usage z téhož zdroje se zobrazí jen jako číslo a s poznámkou, že zdroj neuvádí jednotku — Agentree z něj nedělá procenta ani koruny.
- Útrata: dialogy „Přidat výdaj“ a „Měsíční rozpočty“ jde zavřít křížkem, kliknutím mimo i Escapem. Posluchač kliknutí se přidával na trvalý uzel `#view` při každém vstupu na stránku a nikdy se neodebíral, takže jeden klik otevřel tolik dialogů, kolik bylo návštěv — zavřený jen odhalil identický pod sebou.
- Nastavení: skok na sekci je plynulý. Lišta záložek se posouvá vlastním `scrollLeft` místo `scrollIntoView`, které rozhýbalo i rolování stránky, a po dobu rolování nepřepisuje aktivní záložku sledovač viditelnosti. Respektuje omezení pohybu v systému.
- Ikony a fonty už neproblikávají: loga, fonty a brand se servírují s trvalou cache (dosud `no-cache`, tedy revalidace u každého překreslení) a obrázky se dekódují synchronně.
- Agenti: zdroj je nadřazený filtr nad projekty — po přepnutí na Cloud ukazují nulu i počty u projektů, ne jen seznam.
- Sledování procesů: vnitřní `codex app-server`, který si spouští aplikace ChatGPT, se už nepočítá jako samostatný Codex CLI. ChatGPT je detekovaný samostatně.
- Kolekce profilových obrázků má 29 variant: přepracované #1, #2, #5 a #6 (u #6 se kvůli neplatnému oblouku dosud nevykreslil srpek vůbec) a pět nových — kompas, mozaika, rytmus, planeta s prstencem a papírový drak.

## Přehlednější seznam agentů a pravdivá útrata — 2026-09-11

- Seznam agentů u každé konverzace ukazuje, kde běží: ikona notebooku pro tento Mac, ikona mraku pro webové aplikace. Stejné ikony má filtr zdroje; podrobnosti o službě zůstávají na stránce agenta.
- Automatické kontroly Codexu (`guardian_review`) a pomocní agenti se už nezobrazují jako samostatní agenti s názvem složky (dříve např. 9× „POKORNY DESIGN“). Patří k rodičovské konverzaci podle `parent_thread_id`, její detail ukazuje jejich počet a tokeny; ve statistikách a útratě se tokeny dál počítají a vlastní upozornění neposílají.
- Plánovaná úloha je v seznamu agentů jedním řádkem s počtem spuštění (dříve 47× „martinpokorny“). Název „Plánovaná úloha · <název>“ pochází ze značky `<scheduled-task>`; jednotlivá spuštění se dál započítávají do tokenů a statistik.
- Přepis na detailu agenta nekrade kolečko myši: posouvá se celá stránka, přepis až po kliknutí nebo tabulátoru; Esc nebo kliknutí mimo ho uvolní.
- Tmavý režim: monochromatická loga (OpenAI, GitHub Copilot, Grok, Cursor, Ollama, LM Studio) mají podle brand manuálů bílou variantu, kontrast 1,29 : 1 → 16,23 : 1. Barevná loga beze změny.
- Útrata: čerpání dokoupeného extra usage Claude ze stavového řádku (`rate_limits.spend_limit`). Dokoupení kreditů Codexu se slučuje, takže jedno dokoupení se už nepočítá několikrát (na reálných datech 22 → 10), a zobrazí se seznam s datem a částkou.

## Stabilita ovládání — 2026-09-11

- Nastavení se na širokých desktopových oknech vycentruje podle skutečné osy aplikace, zatímco navigace zůstává čitelně po ruce.
- Modal „Měsíční rozpočty“ se spolehlivě zavře křížkem, kliknutím mimo dialog i klávesou Esc; click už nemůže propadnout do stránky pod overlayem a fokus se vrací na prvek, který dialog otevřel, i ve WebKitu.
- Rychlé hledání při hoveru už nepřekresluje celý seznam a volba modelu ve spouštěči nepřestavuje celý ovládací pás — obě interakce zůstávají plynulé bez blikání a ztráty fokusu.

## Vzhled a vývojový standard — 2026-09-11

- Přidaný plnohodnotný tmavý režim se třemi volbami v Nastavení: výchozí Světlý, Tmavý a Podle systému. Volba se trvale ukládá na tomto Macu, před prvním vykreslením neblikne opačný režim a synchronizuje i nativní chrome macOS.
- Dark mode používá vlastní kontrastní tokeny namísto inverze; automatická browser QA měří AA kontrast textových a stavových kombinací v Chromiu i WebKitu.
- Kolekce lokálních abstraktních SVG profilových obrázků má 24 variant (dvojnásobek), bez externích požadavků a bez změny existujících indexů.
- Přidaný `docs/PRODUCT-AND-ARCHITECTURE.md`: produktový kompas, systém pravdivosti dat, UX/UI a theme contract, architektura, vývojový protokol a releasová brána.

## Vylepšení desktopu — 2026-09-11

- Nastavení ukazuje samostatný stav všech osmi webových zdrojů rozšíření, včetně Perplexity a Groku; žádný z nich se neoznačuje za připojený před prvními skutečnými daty.
- Paleta vyhledávání reaguje na ukazatel myši, zkratka pro spuštění agenta má čitelný kontrast a posuvníky používají jemný vzhled Agentree.

## 0.6.0 — 2026-09-11

- Samostatná macOS aplikace: Swift/AppKit, WKWebView, přibalený Node, Retina ikona s původním logem na bílé ploše, menu a klávesové zkratky, Dock/menubar, nativní export a oznámení s návratem do konverzace.
- Čtyřkrokový první průvodce, trvalé dokončení, opakování v Nastavení/Nápovědě, animace respektující omezení pohybu.
- Vlastní rozbalovací nabídky v designu Agentree, klávesnice, fokus, formulářové hodnoty a chybové stavy. Lokální fonty včetně českých sad a licencí; CSP povoluje písma jen z vlastního originu.
- Lifecycle: atomický single-instance zámek, vlastnictví serveru, úklid při EOF/SIGTERM/SIGINT i pádu rodiče, omezená obnova po pádu, čekání při rychlém restartu, bezpečné převzetí ověřené starší CLI instance, cizí proces se neukončuje. Port se získá před přístupem ke sdíleným datům.
- Desktop nespouští druhý CLI LaunchAgent ani service worker. Upozornění přicházejí přímo ze služby i při zavřeném okně.

## 0.5.0 — 2026-09-11

### Přidáno
- **Projekty:** konverzace ze všech služeb seřazené podle klientů a zakázek. Automatické zařazení podle složky (nejdelší shoda, i podsložky), ruční zařazení libovolné konverzace včetně webových chatů, „mimo projekty“, přetažení řádku na projekt, hromadný výběr v Agentech, filtr podle projektu. Detail projektu: KPI, stav a tokeny, brief s automatickým ukládáním, složky, tokeny podle služby, archiv, export do CSV (Excel/Numbers, ochrana proti vzorcům). Konverzace zůstávají v projektu i po vypadnutí z 30denního okna (snímky). Návrhy projektů ze složek, kde agenti pracují.
- **Spustit agenta** v Přehledu: Claude Code (Terminál s ID session, pozadí s oprávněním), Codex (aplikace s předvyplněným zadáním, Terminál, pozadí se sandboxem), Gemini CLI a Qwen Code (Terminál), webové služby (zadání v odkazu i ve schránce), lokální modely v Ollamě s odpovědí přímo v Agentree. Volba projektu a složky (vestavěný prohlížeč složek), připojení briefu, přehled běhů na pozadí s logem a zastavením. Zadání nikdy není součástí příkazu (soubor 0600 / argv).
- **Licence:** offline Ed25519 klíče (`scripts/license.mjs`), tarify Zdarma / Pro / Team, připravené zamykání funkcí (`PAID_FEATURES`, dnes vše odemčené), sekce Licence v Nastavení.
- **Sdílení a instalace pro další uživatele:** `npm run pack`, `npm run smoke` (ověří nainstalovaný balíček), `agentree --open`, návod `docs/INSTALL.md`, sekce v Nastavení.
- Průvodce prvním nastavením v Přehledu, automatické spouštění po přihlášení zapínatelné z Nastavení, ⌘K: projekty, „Spustit agenta“, „Nový projekt“.

### Změněno
- **Mobilní navigace:** spodní lišta má 5 cílů (Přehled, Agenti, Spustit agenta, Projekty, Více) místo 7; Statistiky, Útrata, Upozornění a Nastavení jsou v panelu Více (s počtem nepřečtených upozornění). Větší dotykové plochy a respektování bezpečné zóny iPhonu.
- Mobil: opraveno přetékání návodu v Nastavení, lámání nadpisů karet, cesty ke složce a řádků konverzací v detailu projektu.
- LaunchAgent restartuje Agentree jen po pádu; když už Agentree běží, druhá instance se v klidu ukončí.
- Příkaz pro automatické spouštění se v Nastavení skládá podle skutečné instalace (dřív pevná cesta `~/agentree`).

## 0.4.0 — 2026-09-10

### Změněno
- **Nový název Agentree** v celém projektu: aplikace, rozšíření, CLI (`bin/agentree.mjs`), balíček, proměnné prostředí (`AGENTREE_*`), hlavičky API (`X-Agentree`, `X-Agentree-Token`), LaunchAgent `cz.agentree.agent`, Klíčenka `cz.agentree.*`, složka projektu a repozitář.
- **Nové logo:** mosazný kořen (ty) a tři uzly agentů spojené větvemi; favicon a značka v rozšíření.
- Ze scény v hlavičce odstraněny linky a zlatá křivka; body aktivních agentů zůstávají.

### Migrace
- Data aplikace se ukládají do `~/.agentree`. Při prvním spuštění se `~/.dirigent/data.json` jednou zkopíruje (upozornění, výdaje, rozpočty, nastavení, token); původní soubor zůstane beze změny.

## 0.3.0 — 2026-09-10

### Přidáno
- **Otevřít v aplikaci:** vlákno Codexu přímo v aplikaci ChatGPT (`codex://threads/<id>`), aplikace Claude, projekt v Cursoru a VS Code, webová konverzace v prohlížeči. **Pokračovat v Terminálu** otevře Terminál s `claude --resume <id>` (resp. `codex resume`, `copilot --resume`, pokud je CLI v PATH). **Otevřít složku** ve Finderu. Nabídku akcí počítá server podle nainstalovaných aplikací.
- Oficiální loga služeb (Claude, Codex, ChatGPT, Gemini, GitHub Copilot, Microsoft Copilot, Perplexity, Grok, Qwen, Cursor, Ollama, LM Studio) z `@lobehub/icons-static-svg` 1.95.0 (MIT).
- Vlastní vizuální identita „koncertní sál“: ebenová scéna s notovou osnovou (každý aktivní agent je nota — smaragdová pracuje, sametová potřebuje tebe), tmavá hlavní karta, mosazné akcenty, jemná zrnitost.

### Změněno
- Paleta: samet `#C2335A`, smaragd `#22A38C`, mosaz `#C99A3E`, eben `#121019`, mlžná slonovina `#F4F3F7`; barvy poskytovatelů podle jejich značek.
- Kopírování příkazu je jen doplňková ikona; hlavní akcí je otevření.

## 0.2.0 — 2026-09-10

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
- Projekt session se měnil podle `cd` během práce agenta — nyní platí složka, ve které session začala.
- Počet u konektorů odpovídá viditelným sessions, ne počtu souborů na disku.

### Změněno
- Prototyp v0.1 (jediný `server.mjs` a ukázková data) nahrazen modulární architekturou; ukázková data odstraněna.

## 0.1.0 — 2026-09-10

- Klikatelný prototyp: přehled, seznam agentů, spotřeba, konektory; lokální čtení Claude Code a Codexu; ukázková data.
# Opravy desktopu — 2026-09-11

- Přehled při rychlých živých datech aktualizuje jen dotčené části; časová osa se nepřekresluje pro každý tokenový přírůstek a graf má omezenou obnovovací frekvenci.
- Otevřený výběr projektu drží nad obsahem vlastní vrstvu bez kolidujícího tmavého obrysu zdrojového ovládacího prvku.
- Bílé plochy grafu tokenů, klidového stavu a nezařazených konverzací podle tokenu `--card`.
- Bezpečné odsazení a ořez dlouhých názvů ve vlastních nabídkách; oddělené popisky limitových grafů.
- Nativní ukládání klíčů bez argv, zákaz přesměrování Admin API, omezení SSE a ochrana poškozené databáze.
- Dashboard nyní označuje lokálně zpracované tokeny přesněji; nejde o cenu ani limit předplatného. Rozšíření Chrome se páruje jednorázovým 10minutovým kódem místo vydání tokenu podle obecného původu rozšíření.
- Regresní ověření v Chromiu/WebKitu a nativní Klíčence. Podmínky veřejné distribuce v `docs/SECURITY.md`.
