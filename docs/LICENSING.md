# Licence a prodej (pro vydavatele)

Tento dokument je pro vlastníka produktu. Zákaznický návod je v [INSTALL.md](INSTALL.md).

## Jak licence fungují

- Klíč má tvar `AGT1.<data>.<podpis>`: data jsou JSON (`v`, `id`, `name`, `email`, `plan`, `seats`, `issuedAt`, `expiresAt`), podpis je Ed25519.
- Aplikace ověřuje klíč **offline** veřejným klíčem v `src/license-public-key.js`. Žádný licenční server, žádné odesílání dat.
- Soukromý podpisový klíč leží **mimo repozitář**: `~/.agentree-vendor/license-signing-key.pem` (práva 0600). `.gitignore` navíc blokuje `*.pem`. Balíček pro zákazníky ho neobsahuje (hlídá `npm run smoke`).
- Klientovi se nikdy nevrací celý klíč — jen maskovaný (`AGT1.eyJ2…abc123`).

> **Záloha:** bez souboru `license-signing-key.pem` nepůjde vydávat další licence a nový klíč by zneplatnil všechny vydané. Ulož ho do správce hesel nebo na šifrované médium.

## Příkazy

```bash
node scripts/license.mjs keygen                                   # jednou; už provedeno 11. 9. 2026
node scripts/license.mjs issue --name "Studio Nováková" --email jana@studio.cz --plan pro --seats 3 --days 365
node scripts/license.mjs verify AGT1.…
```

Bez `--days` je licence bez časového omezení. `--plan team` je připravený pro týmový tarif.

## Tarify a placené funkce

Tarify jsou v `src/plans.js`. Co je placené, určuje mapa `PAID_FEATURES` — **dnes je prázdná, všechno je odemčené**. Zapnutí je jeden řádek, server i UI jsou připravené (odpověď `402` s `upgrade: true`, zamčené funkce se vypíšou v Nastavení → Licence):

| Klíč | Co zamyká | Kde se kontroluje |
| --- | --- | --- |
| `launchBackground` | Spouštění agentů na pozadí | `app.launch` |
| `localChat` | Chat s lokálním modelem v Ollamě | `app.launch` |
| `projectsUnlimited` | Víc než 3 aktivní projekty (archivované se nepočítají) | `app.createProject` |
| `projectExport` | Export projektu do CSV | `app.exportProject` |

Příklad: `export const PAID_FEATURES = { projectsUnlimited: 'pro', projectExport: 'pro' };`

Doporučení (hypotéza k ověření, viz [PRODUCT.md](PRODUCT.md)): zdarma nechat vše, co buduje návyk (přehled, upozornění, projekty do 3, spouštění v Terminálu a na webu); placené jsou funkce pro práci s klienty a automatizaci (neomezené projekty, export k vyúčtování, běhy na pozadí).

## Distribuce

```bash
npm test && npm run check   # musí projít
npm run smoke               # zabalí, nainstaluje do dočasné složky, spustí a ověří API
npm run pack                # dist/agentree-<verze>.tgz → poslat zákazníkovi
```

## Co offline licence neumí (poctivě)

- Je to **ochrana proti náhodnému sdílení, ne DRM.** Aplikace je čitelný JavaScript; technicky zdatný uživatel může kontrolu odstranit. Pro obchodní použití to stačí, pokud máš smluvní podmínky.
- Počet míst (`seats`) se zatím **nevynucuje** — je to údaj pro zákazníka a fakturaci.
- Zneplatnění vydaného klíče není možné bez aktualizace aplikace (seznam zakázaných `id` by musel být v nové verzi).

## Před prvním prodejem (TODO mimo kód)

- Licenční podmínky (EULA) a zásady ochrany osobních údajů — nechat zkontrolovat právníkem.
- Platební brána a automatické vydání klíče po zaplacení (např. Stripe Checkout → webhook → `issue`).
- Značka a doména; ověřit dostupnost názvu Agentree.
- Podepsaná a notarizovaná macOS aplikace (dnes instalace přes Node.js a npm).
