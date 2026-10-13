# Agenteeq — zásady ochrany osobních údajů (pracovní verze pro web, CZ)

**PRÁVNÍ NÁVRH, ZATÍM NEPLATÍ · NENAHRAZUJE SOUČASNÝ VEŘEJNÝ TEXT.**
Datum přípravy: 13. 10. 2026. Datum účinnosti: **[DOPLNIT PO PRÁVNÍM SCHVÁLENÍ]**.

## 1. Kdo je správce a jak nás kontaktovat
Správce osobních údajů zpracovávaných v rámci účtu, podpory a provozu webu je **[DOPLNIT OVĚŘENÉ JMÉNO/FIRMU, IČO, ÚPLNOU ADRESU]** („Agenteeq“). Kontaktní e-mail pro všechny žádosti dle GDPR: **[DOPLNIT NEVEŘEJNÝ GDPR E-MAIL]**; bezpečnostní hlášení: **[DOPLNIT]**. Je-li ustanoven pověřenec, jeho kontakt **[DOPLNIT NEBO UVÉST, ŽE NENÍ USTANOVEN]**. **Nevkládejte žádosti o přístup či výmaz do veřejných GitHub Issues.**

Při používání programu výhradně místně na počítači bez zapnutého účtu se obsah konverzací, projekty a soubory zpracovávají na zařízení uživatele. Rozsah právní role dodavatele u čistě místního zpracování se musí posoudit podle skutečného účelu a rozhodování o zpracování; neslibujeme, že „žádné osobní údaje nezpracováváme“, protože technické síťové požadavky a volitelný účet existují.

## 2. Jaké údaje zpracováváme, proč a z jakého titulu

**Místní přehled agentů.** App může na uživatelem spravovaném zařízení číst podporované lokální přepisy/metadata nástrojů, názvy a cesty projektů, procesové stavy, nastavení a historii. Tyto obsahové údaje aplikace pro svou základní funkci nemusí odesílat na naše servery. Doba místního uchování závisí na nastavení aplikace a mazání uživatelem; přesné cesty a datové typy viz dokumentace. U právní role a datových operací čistě v zařízení se řídíme povahou služby.

**Volitelný účet přes Google.** Při zapnutí účtu přijímáme identifikátor účtu, e-mail a profilové údaje předané v rozsahu zvolených oprávnění, informace o autentizaci a synchronizované souhrny. Účelem je zřízení účtu, přihlášení a poskytování uživatelem zvolené synchronizace; typickým právním titulem je čl. 6 odst. 1 písm. b) GDPR (plnění smlouvy na volitelnou účtovou funkci). Profilový obrázek má být dle implementace stažen pouze místně; aktuální technické chování je třeba před zveřejněním ověřit. Bez účtu je dostupné lokální jádro aplikace; cloud sync účet vyžaduje.

**Číselné souhrny pro synchronizaci.** Typicky zahrnují systém a jméno zařízení, verzi aplikace, datum poslední aktivity, počty agentů, tokenů a konverzací v čase, přehled limitů a výdajů a stav napojení poskytovatelů. Slouží výhradně uživatelem aktivované synchronizaci. Obsah konverzací, názvy, soukromé cesty, API klíče a kód se do této cloudové synchronizace podle současného návrhu nepřenášejí. Konkrétní pole a transport musí být ověřeny v `docs/DATA-CONTRACT.md` a skutečném provozu. Titul: plnění volitelné smlouvy podle čl. 6 odst. 1 písm. b).

**Web, aktualizace a bezpečnost.** Hosting webu (Vercel), kontrola veřejného seznamu aktualizací (GitHub) a stahování směnných kurzů (ČNB) mohou zpracovat technické síťové údaje, například IP adresu, čas a hlavičky požadavku. Účel: funkce webu, distribuce bezpečných aktualizací, dostupnost a prevence zneužití. U našich nezbytných bezpečnostních/provozních logů navrhovaný titul čl. 6 odst. 1 písm. f) GDPR (oprávněný zájem na bezpečném provozu) po testu nezbytnosti a vyvážení; pro funkce objednané uživatelem písm. b) podle skutečného vztahu. ČNB/GitHub zpracovávají své požadavky samostatně podle vlastních pravidel.

**Externí AI služby a klíče.** Při výslovném připojení poskytovatele (např. Anthropic/OpenAI/Google) může uživatel povolit přihlášení či dotaz na API využití; síťová komunikace probíhá k příslušnému poskytovateli a podléhá jeho podmínkám. API klíče se mají na podporovaném Macu ukládat do Klíčenky; před právním tvrzením nutný test implementace. Pokud uživatel dá pokyn poslat zadání do externího AI chatu, může obsah následně zpracovat daná služba podle svých pravidel; nejde o běžnou cloudovou synchronizaci Agenteeq.

**Podpora a reklamace.** E-mail a údaje, které nám uživatel dobrovolně sdělí při komunikaci, slouží k odpovědi, řešení vady a ochraně služby. Titul: plnění smlouvy, případně oprávněný zájem, u fakturace též právní povinnost. Nezasílejte nám hesla, kompletní přepisy ani zdravotní údaje, pokud to není nutné; pro bezpečnostní hlášení použijte soukromý kanál.

**Platby** nejsou v současné verzi potvrzené jako spuštěný produktový tok. Pokud dojde k placenému plnění, budou před zahájením popsány platby, fakturační údaje, zpracovatel platby, zákonné doby uchování a příslušné právní tituly.

## 3. Kdo údaje přijímá
Při volitelném účtu používáme platformu **Supabase** v uvedeném EU regionu (podle konfigurace Frankfurt); hosting webu zajišťuje **Vercel** a přihlášení může používat **Google**. Kontrola verzí využívá veřejný GitHub a kurzy ČNB. Při propojení se službou AI může data obdržet příslušný externí poskytovatel **na pokyn uživatele**. Zda jsou tito aktéři v konkrétní operaci našimi zpracovateli, samostatnými správci nebo dalšími příjemci, určuje smlouva a skutečný tok dat. **[DOPLNIT DPA, SEZNAM SUBZPRACOVATELŮ A PŘÍJEMCŮ]**.

**Přenosy mimo EHP:** region datacentra v EU nevylučuje přístup jiné entity či technické přenosy. **[DOPLNIT ZDA DOCHÁZÍ K PŘENOSŮM, DO KTERÝCH ZEMÍ, PRÁVNÍ MECHANISMUS, PŘÍPADNÁ ADEKVÁTNOST/SCC A JAK ZÍSKAT KOPII ZÁRUK]**. Nic o tom bez evidence neprohlašovat.

## 4. Uchování a výmaz
- Lokální data zůstávají na zařízení a podléhají možnostem mazání v aplikaci / v OS; odinstalace nemusí smazat pracovní složky jiných AI nástrojů.
- Účtové údaje a cloudové souhrny: **[DOPLNIT PRAVDIVÉ TRVÁNÍ OD ÚČTU K VÝMAZU, ZÁLOHY A TECHNICKÁ ZPOŽDĚNÍ]**. V aplikaci může být funkce smazání účtu; rozsah a fyzické provedení ověřit.
- Bezpečnostní web logy a podpůrná komunikace: **[DOPLNIT Z RETENČNÍ POLITIKY VERCEL/SUPABASE/PODPORY]**.
- Zákonné účetní povinnosti: **[DOPLNIT AŽ PRO SKUTEČNÝ PLACENÝ PROVOZ]**.
Bez těchto doplnění stránku nepovažovat za finální GDPR informační povinnost.

## 5. Práva a možnost stížnosti
Dle příslušných podmínek GDPR lze požádat o přístup, opravu, výmaz, omezení zpracování, přenositelnost či vznést námitku; při právním titulu souhlasu jej lze odvolat bez vlivu na předchozí zákonnost. Žádosti se posuzují podle zákonných výjimek, případné nemožnosti realizace a lhůt; obvykle odpovídáme do jednoho měsíce podle GDPR. Máte právo podat stížnost k Úřadu pro ochranu osobních údajů (https://uoou.gov.cz) nebo jinému příslušnému dozorovému úřadu. Předáváním dokumentů za účelem identifikace postupujeme přiměřeně a neveřejně.

## 6. Cookies a místní úložiště
Web podle současného návrhu nepoužívá reklamní, analytické nebo profilovací cookies. Místní webové a desktopové funkce, včetně párování a preferencí, mohou pracovat s nezbytným lokálním uložením či cookies. **[OVĚŘIT SKUTEČNOU SADA COOKIE/STORAGE, DOBU A ÚČEL, KONKRÉTNÍ JURISDIKCI A PRAVIDLA SOUHLASU]**. Nezavádět cookie lištu jen naoko, ale zajistit zákonný souhlas, pokud by přibyla volitelná analytika.

## 7. Změny
Při podstatné změně zveřejníme upravené znění s novým datem účinnosti a případně potřebným oznámením. **[DOPLNIT DATUM, HISTORII ZMĚN A KONTAKT]**.

### Povinná kontrola
Tento text není připraven k publikaci, dokud zůstávají [DOPLNIT]/[OVĚŘIT] a dokud právní a technický audit nepotvrdí každé relevantní tvrzení. Detailní matrice: [PRIVACY-REVIEW.cs.md](PRIVACY-REVIEW.cs.md). Právní základ: GDPR články 6, 12–14, 15–22, 28, 44–49; oficiální text https://eur-lex.europa.eu/legal-content/CS/TXT/?uri=CELEX%3A32016R0679 .
