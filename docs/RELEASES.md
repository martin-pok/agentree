# Release ekosystém Agentree

## Zdroj pravdy

`package.json` je jediný zdroj verze. `CHANGELOG.md` musí obsahovat položku pro stejnou verzi a `npm run check` tuto shodu kontroluje. macOS build injektuje verzi do `desktop/Info.plist`; nativní menu ji čte z bundlu, takže se nemůže rozjet proti CLI nebo serveru.

Po publikování je veřejný GitHub Release jediným zdrojem distribučních odkazů:

- stránka: `https://github.com/martin-pok/agentree/releases/latest`
- API pro download stránku: `https://api.github.com/repos/martin-pok/agentree/releases/latest`
- manifest pro desktopový update-check: `https://github.com/martin-pok/agentree/releases/latest/download/agentree-release.json`

Manifest má `schemaVersion: 1`, verzi, tag, URL releasu a pole `assets`. Každý asset obsahuje název, typ, URL a SHA-256; macOS assety navíc uvádějí `platform` a minimální macOS. Desktop může manifest pouze kontrolovat a nabídnout uživateli release stránku — automatická instalace ani tichý update nejsou součástí této změny.

## Jak vzniká release

Workflow `.github/workflows/release.yml` se spouští tagem `vX.Y.Z` nebo ručně pro existující tag. Nejprve ověří verzi, testy a syntaxi, potom sestaví macOS ARM64 a Intel, zabalí CLI i Chrome helper ZIP a vytvoří draft GitHub Release s poznámkami z odpovídající sekce changelogu. Draft gate zůstává záměrná: publikaci provede vlastník repozitáře ručně po kontrole podpisu, notarizace a assetů.

Před publikací musí být ověřeno:

1. oba macOS ZIPy mají správnou architekturu a instalace proběhne na čistém Macu;
2. pokud se vydává zákazníkům, build je Developer ID podepsaný a notarizovaný — výchozí lokální/CI fallback je ad-hoc a není veřejný distribuční důkaz;
3. `agentree-release.json` obsahuje assety a kontrolní součty;
4. po publikaci `/download` ukazuje správnou verzi a všechna dostupná tlačítka vedou na assety stejného release.

## Vlastnictví obsahu

Webová download stránka vlastní pouze strukturu, vysvětlení a fallback. Verzi, datum, poznámky, názvy assetů a jejich URL vlastní GitHub Release. Nehardcodujeme tak do webu číslo posledního vydání, které by mohlo zestárnout.
