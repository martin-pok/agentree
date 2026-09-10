# Produkt

## Vize

Každý, kdo pracuje s více AI agenty najednou, má **jeden velín**: vidí, kdo pracuje, kdo čeká na rozhodnutí a kolik to stojí — bez přepínání mezi deseti okny a bez překvapení na faktuře.

## Problém

- Agenti běží paralelně v různých aplikacích (Claude Code, Codex v ChatGPT, Cursor, webové chaty). Uživatel neví, který z nich stojí, protože čeká na jeho souhlas.
- Limity předplatných a dokupované extra usage se ukazují až ve chvíli, kdy práce spadne.
- Útrata je rozprostřená mezi předplatná, kredity a API; žádný dodavatel neukazuje celek.

## Pro koho (hypotéza k ověření)

1. **Vývojáři a designéři-vývojáři**, kteří denně pouštějí 2+ agentů souběžně (primární).
2. **Malá studia a agentury** (3–15 lidí), kde AI práce běží na více strojích a útratu platí firma.
3. **Tech leadové** menších týmů, kteří potřebují přehled o využití a nákladech AI nástrojů.

## Hodnota

| Úloha uživatele | Jak ji Agentree řeší |
|---|---|
| „Nechci, aby agent 20 minut čekal na moje ano.“ | Okamžité upozornění na rozhodnutí + odkaz rovnou do konverzace |
| „Chci vědět, co se právě děje, bez proklikávání.“ | Dnešní směna, živý přepis, aktivita a průběh na jednom místě |
| „Nechci narazit na limit uprostřed práce.“ | Limity s časem obnovy, varování na 80 % a 95 % |
| „Chci mít AI útratu pod kontrolou.“ | Rozpočty, prognóza, upozornění při 80/100 %, historie kreditů |

## Principy

1. **Pravdivá data.** Raději „neumíme“ než odhad vydávaný za fakt.
2. **Soukromí jako výchozí stav.** Lokálně; cloud jen opt-in a šifrovaně.
3. **Nulové tření.** Instalace jedním příkazem, žádný účet pro lokální verzi.
4. **Klid, dokud není potřeba jednat.** Upozornění jen na to, co vyžaduje člověka.

## Hypotézy monetizace (NEOVĚŘENÉ — návrh pro validaci)

| Plán | Obsah | Hypotéza ceny | Co je potřeba postavit |
|---|---|---|---|
| **Free** | Lokální dashboard, všechny konektory, upozornění na Macu | 0 | hotovo (v0.2) |
| **Pro** | Push notifikace na mobil, historie > 30 dní, více počítačů, export útraty | měsíční předplatné pro jednotlivce | relay pro notifikace, účty, E2E šifrovaná synchronizace, platby |
| **Team** | Sdílený přehled týmu, rozpočty za tým, role, faktury | cena za uživatele | organizace, oprávnění, agregace útraty, SSO |

Validace před stavbou placené verze:

- 10 rozhovorů s cílovými uživateli (problém „agent čeká na mě“ a „útrata“).
- Landing page s čekací listinou a volbou plánu; cíl ≥ 5 % konverze návštěva → registrace.
- Měřit v betě (lokálně, se souhlasem): kolik upozornění „potřebuje rozhodnutí“ denně, reakční doba před/po.

## Metriky úspěchu

- **Aktivace:** do 10 minut od instalace připojené ≥ 2 zdroje a přijaté první upozornění.
- **Hodnota:** medián času od „potřebuje rozhodnutí“ do reakce uživatele (cíl: pokles o 50 %).
- **Retence:** týdenně aktivní uživatelé po 4 týdnech.

## Rizika

| Riziko | Dopad | Zmírnění |
|---|---|---|
| Dodavatelé změní formát přepisů | Konektor přestane fungovat | Tolerantní parsery, testy s fixturami, rychlé verze, telemetrie chyb parseru (opt-in) |
| Selektory webových aplikací se mění | Rozšíření přestane rozpoznávat stav | Generické zálohy, hlášení z rozšíření, fixtury z reálného DOM |
| Podmínky služeb / Chrome Web Store | Nelze distribuovat rozšíření | Právní kontrola před zveřejněním, čtení jen obsahu zobrazeného uživateli |
| Dodavatelé postaví vlastní přehled | Menší hodnota pro jednotlivé služby | Hodnota je v napříč-dodavatelském pohledu a útratě |
| Pouze macOS | Omezený trh | Cesty pro Windows/Linux v konektorech, nativní aplikace v roadmapě |
