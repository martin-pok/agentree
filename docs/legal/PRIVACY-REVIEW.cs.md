# Agenteeq — ochrana osobních údajů a GDPR (návrh + audit)

**DRAFT PRO PRÁVNÍ A TECHNICKOU REVIZI — NEPUBLIKOVAT.** Stav 13. 10. 2026. Tento text doplňuje, **nenahrazuje zatím**, aktuální `site/soukromi/index.html` a `site/en/privacy/index.html`. Žádné osobní údaje ani reálné kontakty nejsou v šabloně vložené.

## A. Identita a kontakty — povinně doplnit
Správce: **[PRÁVNÍ JMÉNO / FIRMA A IČO, POKUD JE]**.
Sídlo / adresa pro doručování: **[DOPLNIT]**.
Kontakt pro práva subjektů: **[NEVEŘEJNÝ DEDIKOVANÝ E-MAIL]**.
Pověřenec pro ochranu osobních údajů: **[VYPLNIT POUZE POKUD JE URČEN/Povinný]**.
Zástupce v EU / vedoucí dozorový orgán: **[OVĚŘIT PODLE ORGANIZACE]**.

**Kritická mezera současného webu:** „provozuje autor“ a odkaz na veřejné GitHub issues neplní dostatečně identifikaci a důvěrný kanál pro žádosti podle GDPR. Nenuťte uživatele psát žádost o výmaz, dokument totožnosti či e-mail veřejně.

## B. Skutečné operace — technické důkazy a navržený právní rámec

| Kategorie | Účel | Základ ke schválení | Doba / příjemce (prověřit) |
|---|---|---|---|
| Lokální přepisy, názvy a cesty, metadata agentů | Přehled aktivit; čtení oprávněných lokálních zdrojů | Pokud zpracovává jen uživatel na svém zařízení, vyhodnotit roli dodavatele; nepředstírat, že všechna lokální data jsou automaticky cloudem spravovaná | Úložiště na zařízení, mazání v aplikaci/OS; zkontrolovat skutečný životní cyklus |
| Párování Chrome rozšíření, ID aktuální karty/konverzace a limity | Propojení otevřené webové AI služby se stavem lokálního dashboardu | Plnění výslovně aktivované funkce; ověřit § GDPR roli | Chrome local storage + místní loopback 127.0.0.1; aktuální TTL podle implementace |
| Volitelný účet: Google e-mail, jméno, identita účtu, avatar (jen lokálně dle dokumentace) | Přihlášení a správa účtu | Typicky čl. 6 odst. 1 písm. b) GDPR (nezbytnost pro volitelnou účtovou službu), vyžaduje ověření | Supabase region Frankfurt; retention **[DOPLNIT ZE SKUTEČNÉ KONFIGURACE]**; Google dle poskytovatele |
| Souhrny zařízení, denní počty/limity a výdaje | Uživatelova volitelná synchronizace | Smlouva pro zapnutou synchronizaci, případně souhlas pouze pokud je skutečně použit a volný | EU cloud Supabase; vymazání a zálohy/retention prověřit |
| Zákaznická podpora/bezpečnostní hlášení | Řešení požadavků a ochrana služby | Plnění smlouvy / oprávněný zájem po vyvážení, eventuálně zákonná povinnost | **[DOPLNIT nástroj, retenční politiku, příjemce]** |
| HTTP web požadavky, IP, user agent, logy | Bezpečnost serveru, dostupnost | Oprávněný zájem v bezpečnosti podle testu nezbytnosti/vyvážení; u cookies ověřit ePrivacy | Vercel, aktuální retention, možné přenosy mimo EHP **[OVĚŘIT DPA/SCC]** |
| Kontrola aktualizací | Vyhledání veřejných GitHub Releases a ověření SHA-256 instalačního souboru | Nezbytné k poskytnutí bezpečné funkce / legitimní zájem, dle implementace | GitHub jako příjemce síťových metadat; IP/čas požadavku podle jeho podmínek |
| Směnné kurzy | Přepočet CZK/EUR a dalších měn | Nezbytné pro přepočet, pokud je tato funkce aktivní | ČNB, technické síťové metadata |
| Vlastní API klíče poskytovatelů AI, OAuth prostředí | Vyžádaný dotaz na spotřebu či přihlášení do jejich nástroje | Funkce provedená na výslovnou akci uživatele; roli správce/poskytovatele vyhodnotit jednotlivě | Dodavatelé Anthropic/OpenAI/Google apod., vlastní DPA/terms; klíč v macOS Keychain, nikoliv zákaznická analytika Agenteeq |
| Platby, faktury a daně — teprve po spuštění prodeje | Úhrada a účetnictví | Smlouva a zákonná povinnost, podle konkrétního prodejního procesu | Budoucí platební poskytovatel **[NENÍ AKTIVOVÁN]**, fakturační a zákonné retenční doby |

**Důležité rozlišení:** síťové metadata technických požadavků (IP, User-Agent, čas) nejsou totéž jako odesílání obsahu AI konverzací. Veřejná privacy věta „automaticky jen ČNB, nic nikam jinam“ je příliš absolutní: aplikace kontroluje veřejné aktualizace u GitHubu; účet, vzdálená zařízení a provider integrace používají další síť podle povolených funkcí. **Každé tvrzení na webu musí projít testem skutečných síťových cest**, ne jen přečtením README.

## C. Zásady k dopracování dle GDPR čl. 13
1. **Účel a právní titul** pro každou skutečně zpracovávanou kategorii, včetně oprávněného zájmu a jeho popisu. Neskládat automaticky všechny titulky pod „souhlas“.
2. **Příjemci a zpracovatelé**, role správce vs. zpracovatele, umístění dat, DPA, případně SCC / úroveň ochrany u přenosů mimo EHP; Supabase region EU sám o sobě nedokazuje absenci všech přenosů.
3. **Doba uchování konkrétního druhu dat a záloh**; pokud není pevná, veřejně sdělit věcná kritéria. Neslibovat okamžité smazání všech technických logů/záloh bez důkazu.
4. **Práva subjektu údajů**: přístup, oprava, výmaz, omezení, námitka, přenositelnost, odvolání souhlasu (jen tam, kde je skutečně právním titulem), podání stížnosti k ÚOOÚ či místnímu orgánu, informace o automatizovaném rozhodování, pokud relevantní.
5. **Důsledek neposkytnutí údajů a dobrovolnost**; bez účtu přístupné lokální core, bez potřebných údajů nepůjde volitelná synchronizace, ne však automaticky celá aplikace.
6. **Zabezpečení**: Klíčenka pro skutečně podporované Mac integrace, bezpečné párování, nepřenášení textu přepisů do cloudové synchronizace, oddělená podpora, rozsah incidentního procesu. Nevyhlašovat bezpečnostní certifikaci na základě vlastních testů.
7. **Cookies a lokální úložiště**: audit skutečných cookies webu, extension `chrome.storage`, lokální server cookie a uložených preferencí, rozlišení nutné vs. volitelné; pokud se někdy zapne analytika, samostatný ePrivacy souhlas dle práva.
8. **Politika změn, účinnost a dostupné jazyky**. Uživatel musí vědět, co se změní, zvlášť při prvním zapnutí cloudové synchronizace.

## D. P0 rozdíly proti současné veřejné stránce
- [ ] **P0:** [DOPLNIT] identita správce, sídlo/adresa a přímý neveřejný GDPR kontakt (ne veřejný Issue).
- [ ] **P0:** doložit právní tituly a rozdílné účely účet/web/support/extension.
- [ ] **P0:** doplnit retenční lhůty, procesorů/DPA, přenos mimo EHP a pravidla pro technické logy/zálohy.
- [ ] **P0:** upravit absolutní větu „jen ČNB“ o GitHub release check a všechny další síťové požadavky.
- [ ] **P1:** posoudit věcnou správnost „všechno funguje bez účtu“ u konkrétního vydání; lokal-first core ano, volitelný sync ne.
- [ ] **P1:** oba jazyky a propojení s podmínkami; otestovat jasný link ve webové i nativní aplikaci.
- [ ] **P1:** evidence důsledků vypnutí účtu, RLS test cizího uživatele, smazání z cloudu a záloh po reálném e2e testu.

## E. Před publikací
**NENAHRAZOVAT veřejnou privacy tímto návrhem, dokud nejsou ověřeny [DOPLNIT] a provozní skutečnosti.** V rámci aktuálního repo lze bez publikace připravit CI kontrolu přítomnosti identifikace/sítě/odkazů; nepřidávat falešný kontakt nebo nepravdivý údaj o umístění či mazání.

Oficiální text práva: GDPR https://eur-lex.europa.eu/legal-content/CS/TXT/?uri=CELEX%3A32016R0679 ; EU Commission https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en ; ÚOOÚ https://uoou.gov.cz/ .
