# Notion bug report — ověřený stav 15. 10. 2026

Původní znění celého reportu: [BUG-REPORT-2026-10-14.md](BUG-REPORT-2026-10-14.md).

Zdroj: [uživatelský report v Notion](https://www.notion.so/3f90d7aa7efb80d5844df27263072276), [pracovní issue #255](https://github.com/martin-pok/agentree/issues/255). Původní kontrola proti `main` na `6afb409` (15. 10.); aktualizace zdrojového stavu 16. 10. na `cabf2bc`. „V kódu“ neznamená „v nainstalované aplikaci“; veřejné Preview je stále 0.46.12, Stable 0.46.0. Přílohy se screenshoty z Notion nebyly dostupné jako vykreslitelné obrazové soubory, takže nelze potvrdit pixelovou shodu s originálem.

| Podnět | Aktuální stav | Zbývající důkaz/práce |
| --- | --- | --- |
| První spuštění a prázdné stavy | Komponenta `emptyState()` a texty v Agentech, Projektech, Dovednostech, Upozorněních a Útratě existují; obrazové zachycení všech šesti čistých stavů chybí. | Screenshoty z čistého dočasného profilu v obou tématech, desktop/mobil; kontrola skutečné další akce. |
| Přetékání scrollu z upozornění | Oprava v `main` přes #256; `public/js/scroll-containment.js` a CSS omezují scroll chaining. | WebKit trackpad, dotyk a skutečné okno aplikace. |
| Pomocník v aplikaci | `public/js/assistant-guide.js` dává deterministické odpovědi z kontextu aplikace; základní regresní testy existují. | Rozšířit na 20 častých úloh, neznámý dotaz a uživatelské ověření odpovědí. |
| Párování telefonu QR kódem | `public/js/views/settings.js#parovaciKod` kreslí QR z párovací adresy, číselný kód zůstává záloha. | Reálný telefon na stejné síti/Tailscale, expirace kódu, odpojení a VoiceOver. |
| Poměr hlavy robota vůči názvu | Schválená geometrie značky se nemění; požadovaná optická velikost hlavy není vizuálně odsouhlasena. | Porovnat skutečnou hlavičku, malé velikosti, Dock/Explorer a Store s Notion screenshotem. |
| Aktualizace: černá obrazovka, Quit, pomalý průběh a rollback | Opravy #254 a #262 jsou v `main` pro kandidáta 0.46.14; postmerge `qa:update` zjistil problém běžného Quit, řešený samostatným PR #266. | Po 8/8 main CI a novém Draftu fyzický Mac 0.46.12 → přesný kandidát, přerušené stažení, Quit, opětovné spuštění a rollback. Staré veřejné 0.46.12 opravu neobsahuje. |
| Zarovnání vyhledávání Dovedností | Oprava #259 v `main`. | Malé nativní okno, 375 px, klávesnice a screenshot proti Notion. |
| Úprava vzhledu konkrétního agenta | PR #261 je sloučené do `main` pro kandidáta 0.46.14, **není součástí staršího Draftu 0.46.13**. | Doplnit nativní screenshot, VoiceOver QA a UAT zachování existujícího vzhledu; až potom další vydání. |
| Výběry a doplňky robota | Stejný PR #261 obsahuje ovládací tlačítka a pět vektorových variant. | Malé okno, přístupnost, původní uložený vzhled a pixelová kontrola. |
| Příliš vysoký dialog projektu | Kompaktnější editor a akce v dostupné patičce z #259 jsou v `main`. | Malé nativní okno, 320–375 px, klávesnice, ořez obrázku a screenshot. |
| Malý symbol cloudové synchronizace | Zvětšení glyphu ve 40px dlaždici je připravené v PR #265 (8/8 zelené CI + CodeQL), dokud není merge, není na `main`. | Porovnat v reálném UI a upravit jen optický glyph bez změny rozvržení. |
| Potvrzení odhlášení a smazání účtu | #256 přidal potvrzení odhlášení; smazání mělo potvrzení již dříve. | Nativní klávesnice/VoiceOver a jasné rozlišení účtu vs. místních dat. |
| Vyčerpaný limit Codexu označený jako čekání | Oprava #258 v `main`: limit a pozornost se odvozují z potvrzených signálů. | Reálný vyčerpaný účet, reset limitu a správný původ čísla. |
| Nadměrná animace obnovení | Minimalistický jednorádkový stav #260 je v `main`. | Nativní screenshot a reduced motion na skutečném zařízení. |
| Příliš mnoho vysvětlujícího textu | Část mikrocopy byla zkrácena v #260 a souvisejících úpravách; plošná CZ/EN revize hotová není. | Ověřit každou dotčenou obrazovku bez odstranění důležitých bezpečnostních sdělení. |
| Windows web a instalační cesta (nová zpětná vazba 15. 10.) | Nová webová implementace vybírá Mac/Windows podle zařízení, nabízí ruční přepnutí, odpovídající stažení a postup v CZ/EN. | CI přesného PR, produkční nasazení a fyzické otevření webu na Windows. Kolega udělal jen rychlý check Windows aplikace bez úplného protokolu. |

## Aktuální pořadí

1. Uzavřít browser QA této větve, PR a CI; ověřit pak skutečnou produkční odpověď a odkazy na binárky.
2. Dokončit PR #266 (macOS Quit), pak optický cloud #265 a vizuální/přístupnostní kontroly reportu.
3. Pro kandidáta 0.46.14 provést po zeleném postmerge CI a ověřeném Draftu fyzické UAT Mac update/rollback, Windows instalace a telefonního párování; teprve potom rozhodnout o publikaci.
4. Samostatně zaktualizovat Chrome Web Store, který podle aktuální roadmapy stále nabízí 0.31.4.
