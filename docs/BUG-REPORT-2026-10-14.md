# Bug report majitele – originální znění (Notion, 14.–17. 10. 2026)

Doslovný zápis reportu z [Notion](https://www.notion.so/3f90d7aa7efb80d5844df27263072276), vložený majitelem do relace 17. 10. 2026. Nic se v něm neupravuje ani nezkracuje; číslování je původní (je v něm zdvojené 1 i 10.5).

Stav jednotlivých bodů vede [NOTION-BUG-REPORT-AUDIT-2026-10-15.md](NOTION-BUG-REPORT-AUDIT-2026-10-15.md) a [issue #255](https://github.com/martin-pok/agentree/issues/255). Hotovo je bod, který prošel CI **a** majitel ho potvrdil na svém Macu.

---

## 1. Prázdné stavy

Ukaž mi někde, jak máme navržené stavy pro případ, kdy uživatel například nemá vytvořený žádný projekt. Co se mu tam zobrazí? Ukaž mi nějakou vizualizaci přímo z aplikace. Ukažte mi více míst, kde zobrazujeme nějaká data, a chci vidět ty stavy, jak to tam vypadá. To znamená, pokud tam uživatel otevře tu aplikaci například poprvé a nemá tam žádná data, která si může zobrazit, tak co se tam zobrazí? Je tam nějaká náhradní grafika nebo něco? Ukaž mi to.

## 2. Scroll v upozornění

Když kliknu na to upozornění a vylistují se mi tam poslední notifikace, tak v momentě, kdy v tom popupu, v tom modálním okně, doskroluju dolů, začne mi to scrollovat celou aplikací dolů a nahoru.
Tohle je bug, který jsme řešili už na nějakých jiných místech předtím. Tohle se nesmí stávat. V momentě, kdy mám kurzor v modálním okně, které ti posílám, případně v kterémkoliv jiném, a scrolluju, tak se scrolling aplikuje pouze na obsah toho okna. To znamená, že jsem omezený stropem a podlahou obsahu, ve kterém můžu scrollovat. Nemůže se stát, že pak začneš scrollovat celou stránkou nebo celou aplikací. To je špatně a musíš tu logiku pochopit a opravit.

## 3. Pomocník a párování telefonu

1. Zprovozni toho pomocníka agenta pořádně. Když už ho tam máme, tak chceme, aby fungoval. To znamená, že ten agent, který je vpravo dole v té kulaté ikoně, v tlačítku, které má být pomocníkem v aplikaci, má reálně fungovat.
Udělej prosím tě, ať funguje na precizní úrovni a opravdu kvalitně. Musí to být logické a musí odpovídat na naše otázky pravdivě. Jeho znalosti se budou týkat pouze té aplikace. Nemá to být nějaká otevřená umělá inteligence v aplikaci, kterou musíš složitě napojovat na modely. Na to se vykašleme. Nechci platit za nějaké API, za to, že tam budou uživatelé promptovat.
Musí to být prostě agent, který zná jenom tu aplikaci a má načtené v hlavě spíš nějaké svoje dokumenty, aby se v ní prostě orientoval a uživatele směřoval, pokud mají nějaký problém.
2. To napojení telefonu už se nesmí dělat přes tu zkurvenou adresu, to je nejvíce UX unfriendly!! Už jsme tam měli napojení přes sken QR kódu, tak minimálně tak! Nebudu jak kokot někde opisovat adresu, přemýšlej nad tím jako user, co chce maximální komfort. Ale to sledování na telefonu má teď nižší prioritu – to ale neznamená, že to nemáš opravit!!! Hnedkaa to fixuj, ať je tam lepší řešení.

## 4. Logo

1. Nelíbí se mi jaký je nepoměr v logu mezi tím textem a ikonou. Ta hlava robota by měla být trošičku větší, takhle působí moc nezřetelně, skoro jako bychom se styděli. Uprav prosimtě její size, ať to poměrově splňuje špičkové standardy designu.

## 5. Aktualizace a restart

1. Dal jsem že aktualizovat a restartovat, možná nějaký pre-release, ale černý screen a nefunguje!!! Kurva teď jsem stuckntý v appce, tohle se nesmí stávat!!! Chceme to vždycky top, funkční a vyladěné. Můžeš to prosimtě zprovoznit a hlavně – v produkční verzi se tohle nikdy nesmí dít!!!! Budeme chtít od lidí peníze za funkční SaaS, tak to zajisti, ať je to vždy ready a aktualizace z appky fungují vždy bez problémů. Pak to nejde ani ukončit z docku, když se to takhle zasekne! Musím to killnout přes task manager, to se nikdy nesmí dít. Edit: Codex agent mi to nějak sám aktualizoval, to nic nemění na tom, že to musí fungovat pro jakékoliv budoucí případy.

### 8.5 Pomalá aktualizace

Teď po resetu se to aktualizuje, ale trvá to dlouho jako svině, můžeš to fixnout? A v případě aktualizace tam přidej i nějaký sleeky progress bar pod ten text, který bude značit progres. Edit: Tak zase je to zaseklé v této fázi a nejde s tím nic dělat!! Nejde to ukončit, můžeš to prosimtě opravit, ať se nedostáváme nikdy do situace, že by app zasekla počítač nebo se nějak zasekla sama. Vždy musí jít bez problému ukončit a nezpůsobovat trable uživatelům. Pokud uživatel chce ukončit app, tak ji ukonči ještě třeba s nějakým upozorňovacím popupem na běžící agenty apod. Edit: Codex agent mi to nějak sám aktualizoval, to nic nemění na tom, že to musí fungovat pro jakékoliv budoucí případy.

## 6. Dovednosti

1. V dovednostech ten search bar zarovnej doleva, ať tam není ta prázdná díra a uděláme lepší vizuální balanc. Tahle sekce je vizuálně dost přehlcená a potřebujeme, ať se v ní users snadno a hravě vyznají. Nezapomeň, že perfektní UX je pro naši app klíčové. A designově to bude taky krásně vyladěné a vybalancované.

## 7. Úprava vzhledu agenta

1. Proč je tlačítko upravit vzhled agentů tady? To je nelogická kokotina, musíš to dát přece ten button až na detail toho agenta, ať je jasné ke komu upravuji vzhled, ne? Tohle řešení je strašné a vůbec nefunguje. Uprav to, ať si vzhled upravím na úrovni detailu rozkliklého agenta.

### 10.5 Dropdowny a oblečení

Pozor – v tom popupu, kde nastavuju vzhled, je systémový dropdown, tohle se nikde nesmí stávat! I ten dropdown a všechny další prvky vždy musí být on brand a využívat brandové UI a ne systémové prvky. Děje se to tam u všech dropdownů. Ten obrovský přeplněný dropdown je přesně ukázkou toho blbého řešení, přece nebudu tímto způsobem vybírat agenta k úpravě, proto to musí jít vybrat v detailu agenta. Taky tam umožni přidat nějaké oblečení, nebo doplňky v krásně stejném ladícím vizuálním stylu. Nějaké čepice, brýle, tričko atd. Musí jít i nějaké full body funny obleček na toho agenta. Ať to trochu odlehčíme, hlavně to zpracování musí být pečlivé a maximálně fungující, ať to nevypadá na hovno.

## 8. Dialog projektu

1. Udělej víc kompaktní ten modal u projektu – to nastavení projektu. Třeba to nastavení loga a bg můžeš dát vedle sebe, nemusí to být pod sebou, stačí ti očistit ty sračkové texty jako „Důležité drž uprostřed" a podobně. Pak se ti to hezky vejde. Snaž se vždycky, ať se nemusí v popupu nebo modálu scrollovat, to je na hovno!!! Pak třeba nescrollnu a neuvidím dole button, co dělá nějakou akci, jako v tomto případě.

## 9. Synchronizace

1. V té synchronizaci dej o trochu větší tu ikonu mraku v tom zeleném čtverci!! Má ji zbytečně malou, poznám, že je o trošičku menší než jiné ikony, co používáme třeba na té stránce.

## 10. Odhlášení a smazání účtu

1. To smazání i odhlášení je doufám podmíněno nějakým popupem, co tam vyskočí a ještě to musím potvrdit. Taky button na smazání by měl být výraznější. Taky popřemýšlej, zda ty buttony nedat na spodek té podstránky „Účet a vzhled", což bývá běžný SaaS standard to dát na spodek stránky Účet v nastavení. Víš, co myslím, ne?

## 11. Limit agenta a domovská stránka

1. Teď se mi stala situace, kdy Codex agent nedokázal dokončit úlohu, protože se vyčerpal limit. Mám aktuální aplikaci a její homepage aktuálně vypadá takhle. Přitom máme ale nějakou kritickou situaci k řešení, ne? Vidíš snad, že bys to někde komunikoval, nebo že by někde bylo vidět, že Codex agentu došly kredity? My to nemáme viditelné ani v tom notifikačním centru, ale chtěl bych to někde vidět. Ty vole, vždyť tam na to je i widget, ne? Na té pravé straně, jak je stav agentů a jsou tam ty boxíky, tak tam můžeš ukázat buď ten limit, anebo že to selhalo. Stejně tak je ten levý panel „Potřebuje tvé rozhodnutí" nyní úplně k hovnu. Využití panelu „Potřebuje tvé rozhodnutí" je nevyužité a akorát to tam kurví dojem. Spíš to využívej jako takový rychlý infopanel. Takže třeba zrovna i tu informaci o tom, že kodexu došel limit, bych chtěl vidět v tom panelu. Tím pádem nám vlastně ani nefunguje dobře ta indikace těch stavů. Podívej se na to, že ten Codex agent má teďka oranžový badge, který říká: „čeká na zadání." To je ale přece nesmysl, protože on narazil na limit. V takovém případě nemá smysl, aby mi ta aplikace říkala, že čeká na zadání, když to zadání tam nemůžu zadat, protože nemůžeme pokračovat kvůli limitu, ne? Trochu nad tím přemýšlej, taky ať ta aplikace hlavně funguje. To je to hlavní, o co nám jde.

## 12. Obnovení a texty

1. Tady když kliknu na tuhle ikonu toho refreshe. Tak ta animace, kterou jsem po tobě chtěl vytvořit, má být mnohem minimalističtější a měla by působit prémiově a minimalisticky. Ty vole, vždyť jsi tam dal dva řádky textu a ještě toho agenta s těmi šikmýma očima. Aktuální řešení není vůbec minimalistické a chceme ho předělat. To znamená, předtím jsem ti zamítl, abys tam nepoužíval ten systémový loader. Poté jsi přišel s totálně hloupým a nevkusným řešením, které nyní musíme vyřešit a otočit v přemýšlivý minimalistický styl.

2. O těchto sračkových textech jsme si už něco říkali. Nechceme tam cpát tuny textu, které zbytečně prodlužují celé okno dolů a uživatel tam musí zbytečně scrollovat. Tyhle přebytečné hovna komunikujme někde jinde. Ale rozhodně ne takhle viditelně. Jako uživatel chci přijít a vidět funkční aplikaci, jejíž uživatelské prostředí mě příjemně a elegantně provede tím, k čemu ji chci používat a k čemu je určená. Nebudu tam číst tuny nějakého balastního textu, nějaké ospravedlňovačky a disclaimery, které tam vůbec nemají být. Když se vžiju do role platícího klienta a zákazníka, chci dostat maximálně funkční servis a stoprocentně hotovou aplikaci a nekoukat na nějaké sračkové texty. Takže to taky zkontroluješ, odstraníš a opravíš ty věci tak, abys tam nemusel komunikovat takovéhle nesmysly.
