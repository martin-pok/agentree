# Jméno produktu

Tenhle dokument existuje z jediného důvodu: jméno se ještě bude měnit a ta změna nemá být
archeologie. Je tu seznam všech míst, kde jméno žije, a co každé z nich stojí.

## Kde jsme teď

| | |
|---|---|
| Jméno v produktu | **Agenteeq** – kód, rozhraní, dokumentace i web jedou pod ním beze zbytku |
| Jméno repozitáře | `agentree` – jediné místo, kde zůstalo starší jméno |
| Starší jména | `Dirigent` (do 0.4.0) → `Agentree` (do 0.7.0) → `Agenteeq` (od 0.8.0) |
| Stav rozhodnutí | **otevřené.** `Agentree` koliduje s existujícím produktem, `Agenteeq` je zatím pracovní. |

Dokud jméno není rozhodnuté, nic dalšího nepřejmenováváme. Dvakrát přejmenovat je dražší
než jednou počkat, a každé přejmenování stojí uživatele data nebo přihlášení, pokud se udělá
nedbale.

## Co už je připravené na přejmenování

Na přechodech `Dirigent → Agentree → Agenteeq` je postavená kompatibilita, kterou stačí
zopakovat. Uživatel po ní nepřijde o data ani o napojení:

| Co | Jak to přežívá | Kde |
|---|---|---|
| Datová složka | `~/.agenteeq`; při prvním startu se jednou zkopírují data z `~/.agentree` a `~/.dirigent`, originál zůstává | `src/config.js`, `src/migrate.js` |
| Proměnné prostředí | `AGENTEEQ_*`, jako záloha se čte i `AGENTREE_*` | `src/config.js` |
| Hlavičky API | `X-Agenteeq`, `X-Agenteeq-Token`; server bere i `X-Agentree*`, takže starší hooky a rozšíření fungují dál | `src/http.js` |
| Cookie zařízení | `agenteeq_device`; spárované telefony se starou cookie `agentree_device` zůstávají spárované | `src/lan.js`, `src/http.js` |
| Převzetí portu | Nikdy se nerozhoduje podle názvu procesu, vždy podle podepsaného entrypointu | `desktop/lifecycle.mjs` |

## Co přejmenování bude stát

Seřazeno podle toho, co uživatele bolí nejvíc.

**Bolí uživatele (nutná kompatibilita podle tabulky výš)**

1. Datová složka `~/.agenteeq`.
2. Proměnné prostředí `AGENTEEQ_*`.
3. Hlavičky `X-Agenteeq*` a cookie `agenteeq_device`.
4. Identifikátor aplikace `cz.agenteeq.desktop` a název svazku (`desktop/Info.plist`). **Pozor:**
   změna identifikátoru znamená pro macOS jinou aplikaci – ztratí se udělená oprávnění
   (Automatizace, Oznámení) a uživatel je povolí znovu.
5. Služba v Klíčence `cz.agenteeq.<id>` (`src/secrets.js`) – po změně se uložené API klíče
   nenajdou. Buď se čte i stará služba, nebo se klíče jednorázově přenesou.
6. Štítek LaunchAgentu `cz.agenteeq.agent` (`src/launch-agent.js`) – starý je potřeba odinstalovat,
   jinak zůstane v systému viset.
7. Rozšíření pro Chrome: změna názvu je v pořádku, ale **přeinstalace ztratí spárování**, protože
   token leží v úložišti rozšíření.

**Nebolí, ale je toho hodně**

8. Texty v rozhraní a dokumentaci, `public/brand/`, ikony aplikace i rozšíření.
9. Repozitář na GitHubu a odkazy na něj (`site/index.html`, `scripts/release-mac.mjs`, README).
   GitHub po přejmenování drží přesměrování, takže staré odkazy chvíli fungují – spoléhat se
   na to ale nechceme.
10. Doména a e-maily, až nějaké budou.

## Postup, až jméno padne

1. Ověřit dostupnost: doména, GitHub, Chrome Web Store, ochranná známka v ČR a EU.
2. Přidat kompatibilitu podle tabulky výš (nová jména s odečtem starých) a testy na ni.
3. Přejmenovat texty, značku a ikony.
4. Vydat verzi, která **jen** přejmenovává. Žádná jiná změna v tomtéž vydání – když se něco
   rozbije, musí být jasné čím.
5. Teprve v dalším vydání zrušit to, co je nahrazené, a jen s tím, co se dá zrušit bez ztráty dat.
