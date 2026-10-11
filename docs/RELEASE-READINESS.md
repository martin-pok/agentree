# Release readiness — Agenteeq

**Aktualizováno 11. 10. 2026.** Tento dokument je kontrolní seznam, nikoliv potvrzení, že konkrétní vydání prošlo.

## Zdroj pravdy

- Aktuální pracovní verze: `package.json` (`0.46.1` k datu revize).
- Nejnovější potvrzené **zveřejněné** vydání: GitHub Releases — `v0.46.0` (9. 10. 2026). Koncepty vydání nejsou veřejně stažitelné.
- Spouštění QA: `.github/workflows/test.yml`; sestavení: `.github/workflows/release.yml`; zveřejnění: `.github/workflows/publish.yml`.
- **Nepřebírat statusy z README ani z tagu:** veřejnou dostupnost musí potvrdit `GET /repos/martin-pok/agentree/releases/tags/v<version>` s `draft=false` a skutečnými assety.

## Povinné brány před zveřejněním

| Brána | Důkaz | Co znamená neúspěch |
|---|---|---|
| Stejný commit | SHA pro testy i tag a pracovní strom bez necommitnutých změn | Nesestavovat z jiného SHA |
| Jazyk a syntaxe | `npm run check`; `npm test`; `test/i18n.test.mjs` | Zastavit release |
| UI a přístupnost | `npm run qa:desktop`, `qa:extension`, `qa:site`, `qa:contrast` v CI | Zastavit release |
| Verze distribuce | tag = `package.json` = extension manifest = metadata sestavení | Zastavit release |
| Branding | `test/brand-robot.test.mjs` a vizuální kontrola PNG/ICO/ICNS i screenshotů | Zastavit publikaci |
| Zdroje dat | kontrola hranice „naměřené / odvozené / neznámé“ a citlivých informací v URL | Zastavit publikaci při regresi |
| Instalace | DMG, ZIP macOS Apple Silicon, Windows beta ZIP, Chrome extension ZIP a jejich checksumy | Zastavit publikaci |
| Ruční QA | Mac, Windows beta, Chrome v CZ i EN podle [TESTING.md](TESTING.md) | Neoznačovat jako ověřené |
| Schválení | vědomé zveřejnění konceptu `publish.yml` nebo GitHub UI | Koncept ponechat neveřejný |

## Jaký je další postup

1. Zvolit jediný SHA, dokončit všechny jeho CI joby a vyřešit případná selhání. Nenahrazovat test tichým vynecháním.
2. Porovnat nativní binární ikony, App bundle a screenshoty Chrome Store proti aktuálnímu značkovému SVG. Automatická kontrola SVG sama nestačí.
3. Na skutečném zařízení ověřit připojení, odpojení, návrat autorizace a upgrade bez ztráty nastavení.
4. Teprve poté vytvořit nebo opravit release tag, sestavit artefakty, ověřit checksumy a publikovat.

## Co zůstává mimo automatickou garanci

- Stav přihlášení u externích poskytovatelů, skutečné browser DOM po změně webu a notifikace na reálných telefonech.
- Developer ID/notarizace macOS, dokud nejsou dostupné přihlašovací údaje a nativní test.
- Právní schválení dokumentů a DPA.
- Automatické testy se nemohou vydávat za ruční QA produktového dojmu nebo viditelnosti loga v binárních ikonách.

**Zásada:** jen veřejné vydání s ověřenými balíčky smí být na webu označené jako dostupné. Nenahradit „neověřeno“ slovem „hotovo“.
