# Účty Agenteeq

Stav k 4. 10. 2026: přihlášení přes Google je v produkci zapnuté pro aplikaci na Macu i web,
databáze v cloudu má RLS, synchronizaci souhrnů zapíná přihlášení (vypnout jde jedním přepínačem)
a přehled souhrnů je na webu (`/app?ucet`).

## Rozhodnutí vlastníka produktu (23. 9. 2026)

- **Do cloudu smí jen účet a souhrny.** Tokeny po dnech, útrata po měsících, limity a počty agentů
  podle stavu. Text konverzací, jejich názvy, cesty ke složkám, poznámky k výdajům a kód Mac
  **nikdy** neopustí.
- **Databáze:** Supabase, projekt `agenteeq` (`quxfenxxdcafcuptucnn`), region `eu-central-1`
  (Frankfurt). Postgres s řádkovým zabezpečením (RLS).
- **Účet nic nezamyká.** Bez přihlášení funguje Agenteeq celý, stejně jako dřív.

## Rozhodnutí vlastníka produktu (4. 10. 2026)

- **Přihlášení zapíná synchronizaci souhrnů.** Kdo se přihlásí přes Google, chce mít data pod
  svým účtem. Tlačítko přihlášení proto předem říká, že se synchronizace zapne a co posílá;
  vypnout ji jde kdykoli jedním přepínačem (vypnutím se souhrny z účtu smažou). Kdo ji vypne, má
  ji vypnutou až do dalšího přihlášení. Nahrazuje opt-in z 23. 9.
- **Profilová fotka z Googlu** se ukazuje v kartě účtu i v profilu v postranním panelu. Mac si
  ji stáhne a uloží jen k sobě; do cloudu se neposílá a rozhraní nic nenačítá z cizího serveru.

## Jak přihlášení funguje

```
Agenteeq (Mac)                       prohlížeč                  Supabase Auth → Google
  │ POST /api/ucet/prihlaseni           │                              │
  │ ── PKCE: ověřovač zůstává v paměti ─┤                              │
  │ open https://…/auth/v1/authorize ──►│ provider=google,             │
  │                                     │ redirect_to=http://127.0.0.1:<port>/ucet/navrat/<pokus>
  │                                     │ code_challenge (S256) ──────►│ přihlášení u Googlu
  │ GET /ucet/navrat/<pokus>?code=… ◄───┤◄─────────────── návrat ──────┤
  │ POST /auth/v1/token?grant_type=pkce (kód + ověřovač) ─────────────►│
  │ ◄──────────── access_token (paměť), refresh_token (Klíčenka), user ┤
  │ SSE „ucet“ → okno „Přihlášení proběhlo v pořádku“, okno Agenteeq do popředí
```

- **PKCE (S256):** kód z návratu jde vyměnit jen s ověřovačem, který zná jedině server na Macu.
  Kód zachycený cestou ani podstrčený z cizího přihlášení se nevymění.
- **Jednorázový pokus:** adresa návratu nese náhodný identifikátor (32 bajtů). Platí 10 minut
  a jen jednou. Souběžně nejvýš tři pokusy.
- **Návrat přijme jen tento Mac** (`zTohotoMacu()` v `src/http.js`: smyčka, `Host` 127.0.0.1,
  žádné hlavičky proxy). Obsluhuje se před kontrolou klíče okna aplikace, protože přichází
  z běžného prohlížeče. Před kontrolou `Sec-Fetch-Site` je obsloužený také proto, že
  přesměrování ze Supabase je přirozeně cross-site.
- **Chyba z Googlu** (zrušení, zamítnutí) přijde v části adresy za `#`. Stránka návratu ji
  skriptem `/ucet/navrat.js` předá serveru jako `?chyba=…`, aby aplikace hned věděla, že
  přihlášení skončilo.
- **Tokeny:** přístupový token (1 h) jen v paměti serveru, obnovovací token v Klíčence macOS
  (`cz.agenteeq.ucet`, pomocník `desktop/Keychain.swift`). Obnovovací token je jednorázový, takže se
  po každé obnově ukládá nový. Souběžné obnovy se slévají do jedné. Bez Klíčenky (Terminál,
  Linux, Windows) přihlášení vydrží do konce běhu a karta účtu to řekne.
- **Výpadek sítě není odhlášení.** Když server účtů neodpovídá, stav je „nedostupné“, token
  zůstává a obnova se zkouší každých 5 minut. Odhlášení je jen odmítnutý token nebo akce
  uživatele.
- **Výběr účtu:** adresa přihlášení nese `prompt=select_account`, takže Google vždy nabídne
  výběr účtu a člověk s více účty se nepřihlásí omylem tím, který je v prohlížeči zrovna aktivní.
- **Do rozhraní** jdou jen `stav`, `jmeno`, `email`, `foto` (otisk), `chyba`, `ceka`, `trvale` –
  nikdy tokeny. Spárovaný telefon vidí jen `stav`.
- **Profilová fotka:** adresu bere z `user_metadata.avatar_url` (nebo `picture`), ale jen https na
  `*.googleusercontent.com` – metadata jsou nedůvěryhodná a server na Macu nic odjinud nestáhne.
  Žádá 192 px (Retina). Přijme jen skutečný obrázek (JPEG, PNG, WebP podle prvních bajtů) do
  300 kB a uloží ho do složky dat (`ucet-foto`, práva 0600). Rozhraní ho čte z `/api/ucet/foto`
  jen z tohoto Macu. Odhlášení a smazání účtu fotku i profil z disku smažou.
- **Profil na disku:** jméno, e-mail a adresa fotky (bez tokenů) jsou v `ucet-profil.json`, aby
  karta účtu po startu bez sítě neukazovala prázdné místo.

## Spolehlivost přihlášení

Odhlásit smí jen skutečně odmítnutý token nebo člověk. Všechno ostatní je „nepodařilo se ověřit“
(`nedostupne`): přihlášení i uložený token zůstanou a ověření se zopakuje samo.

| Situace | Co se stane |
|---|---|
| Výpadek sítě, server účtů 5xx, přetížení 429, timeout 408 | `nedostupne`, další pokus za 30 s, pak 1, 2, 4 a nejvýš 5 minut |
| Zamčená Klíčenka po startu (LaunchAgent běží dřív, než se odemkne), dotaz systému na heslo | `nedostupne`, ne „nepřihlášeno“; čtení čeká až 30 s a zopakuje se. `secrets.get(id, { prisne: true })` rozliší chybějící položku (pomocník 2, `security` 44) od chyby |
| Server odmítne obnovovací token jako použitý, ale v Klíčence je novější (ztracená odpověď při obnově, druhá instance Agenteeq) | zkusí se ten novější; teprve když i ten neprojde, je to odhlášení |
| Neúplná odpověď serveru | přechodná chyba, ne odhlášení |
| Posunuté hodiny Macu | platnost tokenu se počítá z `expires_in` od místních hodin, ne z `expires_at` serveru |
| Synchronizace dostane 401 dřív, než token podle Macu vyprší | token se jednou obnoví a odeslání se zopakuje (upsert je idempotentní) |
| Přihlášení jiným účtem Google | jméno ani fotka předchozího účtu se u nového neukážou |
- Obnovovací token nejde zapsat ani smazat přes `PUT/DELETE /api/secrets/:id`. Ta cesta je jen
  pro ručně zadávané API klíče.

## Databáze (`supabase/migrations`)

| Tabulka | Co obsahuje | Klíč |
|---|---|---|
| `profiles` | jméno z Googlu, tarif (mění jen server), `sync_enabled` (opt-in) | `id` = uživatel |
| `devices` | název zařízení, systém, verze aplikace | `id` |
| `connections` | které služby jsou napojené a v jakém stavu – bez klíčů | zařízení + poskytovatel |
| `usage_daily` | tokeny (vstup + výstup; rozpad jen když ho zdroj dává, jinak `null`) a počet konverzací po dnech | zařízení + den + poskytovatel |
| `spend_monthly` | součty útraty po službě, druhu a měně | zařízení + měsíc + služba + druh + měna |
| `limits` | procento a obnova oken limitů | zařízení + poskytovatel + okno |
| `agent_status` | počty agentů: pracuje, potřebuje tě, čeká, selhal | zařízení |

- **RLS:** každý řádek čte a mění jen jeho vlastník. Souhrn jde zapsat jen k vlastnímu zařízení.
  Anonymní klíč nepřečte nic, tarif si uživatel nezmění. E-mail zůstává jen v `auth.users`.
- **Kontrola:** `supabase/tests/rls.sql` projde 16 případů a vše vrátí zpět (výsledek je ve
  výjimce na konci). Naposledy spuštěno 24. 9. 2026: všech 15 `true`.
- **Smazání účtu:** `public.smazat_muj_ucet()` smaže uživatele z `auth.users` a kaskádou všechno
  jeho. Poradce Supabase na tuhle funkci hlásí varování „security definer spustitelná
  přihlášeným“ – je to záměr: funkce maže jen `auth.uid()`, nepřihlášený ji spustit nemůže.
- Veřejná adresa projektu a publikovatelný klíč jsou v `src/config.js` (`UCET_VYCHOZI`). Jsou
  veřejné z principu, přístup hlídá RLS. Tajný klíč (`service_role`) v repozitáři ani
  v aplikaci není a nikdy nebude.

## Produkční konfigurace Google OAuth

1. 10. 2026 je Google provider v projektu Supabase aktivní (`GET /auth/v1/settings` vrací
`external.google: true`). OAuth aplikace **Agenteeq** je v Google Cloud zveřejněná pro externí
uživatele a žádá jen základní rozsahy `openid`, `email` a `profile`.

- *OAuth callback Googlu:* `https://quxfenxxdcafcuptucnn.supabase.co/auth/v1/callback`.
- *Výchozí URL Supabase:* `https://agentree-fawn.vercel.app`.
- *Povolené návraty:* `http://127.0.0.1:*/ucet/navrat/*` pro jednorázový lokální callback Macu a
  přesně `https://agentree-fawn.vercel.app/app?ucet` pro webový účet.
- OAuth client secret je uložený výhradně v Google Cloud a Supabase. Není v repozitáři, balíčku
  aplikace ani v prohlížeči.

Při změně domény nebo OAuth klienta se musí současně změnit callback v Google Cloud a oba návraty
v Supabase; potom ověř `external.google: true` a spusť `test/ucet.test.mjs` i
`test/ucet-web.test.mjs`.

## Dostupnost projektu na Free tarifu

Projekt zůstává na tarifu Supabase Free. Ten se uspí, když týden nemá „dostatečnou uživatelskou
aktivitu v databázi“ ([pravidla Supabase](https://supabase.com/docs/guides/platform/free-project-pausing)).
Workflow [`.github/workflows/supabase-keepalive.yml`](../.github/workflows/supabase-keepalive.yml) se proto každý den v 05:17 UTC spustí z GitHub Actions a zavolá
`POST /rest/v1/rpc/udrzet_aktivitu` s publikovatelným klíčem. Funkce z migrace
`20261003100000_udrzeni_aktivity.sql` je `select 1`: skutečný dotaz v Postgresu, který nečte ani
nezapisuje žádnou tabulku. Do 3. 10. 2026 se volal `GET /auth/v1/settings`, ten ale databázi
nečte (nastavení Auth jde z konfigurace), takže projekt před uspáním nechránil.

- Nepoužívá uživatelský token a neposílá ani nevypisuje žádná uživatelská data.
- Úspěch je jen odpověď `1` z databáze. Chybějící funkce (404), výpadek nebo jiná odpověď běh v Actions viditelně shodí.
- **Nasazení migrace:** Supabase → projekt `agenteeq` → SQL Editor → vložit obsah migrace → Run. Potom ručně spustit **Actions → Udržet aktivní Supabase**; má skončit zeleně.
- Jedinou smluvní garanci proti uspání dává placený Pro tarif. Aplikace ale i bez cloudového účtu zůstává plně lokálně funkční.

## Synchronizace souhrnů (`src/cloud-sync.js`)

Nastavení → Účet a vzhled → **Synchronizace souhrnů**. Zapne ji přihlášení přes Google (rozhodnutí
z 4. 10. 2026; tlačítko přihlášení to říká předem), vypnout jde jedním přepínačem. Volba je v účtu
(`profiles.sync_enabled`), takže platí na všech jeho zařízeních. Když účet při přihlášení
neodpovídá, platí zapnutí hned na Macu (`cloud.volbaCeka`) a do účtu se dopíše s příští
synchronizací; do té doby ho načtení volby z účtu nepřepíše.

| Tabulka | Co odchází | Odkud |
|---|---|---|
| `devices` | jméno Macu (hostname), systém, verze aplikace, čas posledního spojení | `os.hostname()` |
| `usage_daily` | tokeny (vstup + výstup) a počet konverzací po **místních kalendářních dnech Macu** a poskytovatelích, 35 dní zpět | hodinové součty konverzací |
| `spend_monthly` | součty útraty po měsících, službách a druzích v měně aplikace | zapsané výdaje a zjištěná předplatná – bez poznámek |
| `limits` | procento, dosažení, obnova a čas měření oken limitů | limity – bez hlášek a popisků |
| `agent_status` | počty agentů: pracuje, potřebuje tě, čeká, selhal | stav konverzací |
| `connections` | které zdroje jsou napojené a kdy naposledy daly data | stav konektorů – bez detailů a cest |

- **Seznam povolených polí (`POVOLENA`)** – každý řádek jím projde těsně před odesláním. Test
  pošle konverzaci s názvem, cestou, zadáním a poznámkou k výdaji a ověří, že nic z toho neodešlo.
- **`usage_daily.day` je místní den zařízení**, stejný „dnes“, jaký ukazuje aplikace. Hodinové přihrádky
  jsou v UTC; každá hodina patří ke dni podle místního času svého začátku (v časových pásmech
  s půlhodinovým posunem tedy celá hodina k jednomu dni). Web účtu staví osu z místních dnů
  prohlížeče a nic nepřepočítává do UTC. Schéma databáze se neměnilo, změnil se jen význam sloupce
  (do 3. 10. 2026 to byl den UTC); řádky posledních 35 dní se při další synchronizaci přepíšou novým
  významem, starší řádky mohou mít den UTC.
- **Rozpad tokenů po dnech na vstup, výstup a cache aplikace nemá**, proto jsou ty sloupce prázdné
  (`null` = nevíme), ne nula. Hlavní číslo je `tokens` – stejné jako v aplikaci.
- **„Co přesně posíláme“** v kartě účtu ukáže přesně ten balík, který by odešel (`GET /api/ucet/nahled`):
  nahoře počet řádků v každé tabulce, pod tím celý JSON.
- **Vypnutí souhrny z účtu smaže** (všechny tabulky souhrnů, jen vlastní řádky – RLS). Zařízení
  zůstanou. Smazání účtu smaže i je.
- Posílá se hned po zapnutí, po přihlášení, po obnově ověřeného přihlášení (síť, Klíčenka), tlačítkem
  „Synchronizovat teď“ a pak každých 5 minut upsertem (`Prefer: resolution=merge-duplicates`). Výpadek
  sítě ukáže chybu, volbu nezmění a zkusí se znovu. „Synchronizovat teď“ hlásí úspěch jen tehdy, když
  souhrny opravdu odešly; jinak řekne proč (vypnuto, nepřihlášeno, chyba serveru).
- **Pořadí (5. 10. 2026):** nejdřív se v účtu založí tento počítač (`devices`), teprve potom se do
  `profiles.sync_enabled` zapíše „zapnuto“. Dřív to bylo obráceně: když založení zařízení selhalo,
  zůstal účet zapnutý s nulou zařízení a web ukazoval „0 zařízení“. Chyba založení se teď ukáže
  v kartě účtu („Tento Mac se nepodařilo přidat do účtu: …“), volba počká (`volbaCeka`, přežije
  restart) a každý další běh registraci dožene. Přepínač v Nastavení bez založeného zařízení
  synchronizaci nezapne vůbec.
- **Úklid:** po každém odeslání tento počítač smaže ze svých řádků v účtu ty, které by už neposlal –
  útratu ve staré měně nebo ze služby bez klíče (v měsících, které aplikace počítá), limity, které
  zdroj přestal hlásit, a zdroje, které už nejsou napojené. Tokeny po dnech zůstávají (historie).
- Ověřeno proti databázi 24. 9. 2026 (transakce vrácená zpět): upsert přepíše řádek, rozpad je
  `null`, druh `extra` projde, vypnutí smaže vlastní souhrny.

## Přehled na webu (`public/js/ucet-web.js`)

`https://agentree-fawn.vercel.app/app?ucet` – totéž rozhraní jako na Macu, jen místo serveru na Macu
čte souhrny z účtu. Rozcestník „Kde máš Agenteeq?“ na něj odkazuje; uložené přihlášení ho otevře
rovnou i z `/app`.

- **Přihlášení:** PKCE v prohlížeči bez knihoven (Web Crypto). Ověřovač je v `sessionStorage` jen
  do návratu, relace (přístupový a obnovovací token, jméno, e-mail) v `localStorage` tohoto
  prohlížeče. Odhlášení ji smaže a zneplatní i na serveru. Chyba z Googlu přijde za `#` a ukáže se.
- **Spolehlivost na webu:** stejná pravidla jako na Macu. Síť, 5xx, 429 ani 408 relaci nesmažou.
  Obnova jednorázového tokenu běží pod zámkem prohlížeče (Web Locks, `agenteeq-ucet-obnova`)
  a po jeho získání se relace přečte znovu, takže dvě záložky se o token nepřetahují; když server
  token odmítne jako použitý a v úložišti už je novější (obnovila ho jiná záložka), použije se ten.
  Odpověď 401 při načítání souhrnů nejdřív jednou vynutí obnovu, teprve pak odhlásí. Platnost se
  počítá z `expires_in` od hodin prohlížeče. Přihlášení nabídne výběr účtu (`prompt=select_account`).
- **Fotka na webu** se načítá přímo od Googlu (stejné ověření adresy jako na Macu, bez
  `Referer`); na Macu se nic z cizího serveru nenačítá.
- **Jen čtení:** GET na `profiles`, `devices`, `agent_status`, `usage_daily` (30 dní),
  `spend_monthly` (tento měsíc), `limits` s tokenem přihlášeného; RLS vydá jen jeho řádky.
  Do souhrnů web nezapisuje (hlídá `test/ucet-web.test.mjs`).
- **Obsah:** agenti teď ze všech Maců dohromady, tokeny za 30 dní po dnech a poskytovatelích,
  útrata tohoto měsíce po službách, limity s obnovou a zařízení s posledním spojením. Obnovuje se
  každou minutu, když je stránka vidět, a hned po návratu do karty a po obnovení sítě. Vypnutá
  synchronizace = vysvětlení, kde ji zapnout; zapnutá bez jediného zařízení = vysvětlení, kde
  v aplikaci hledat chybu.
- **Stáří dat:** nad kartami stojí „Poslední synchronizace před …“ (nejnovější `devices.last_seen_at`).
  Když se žádný počítač neozval přes 15 minut (tři zmeškaná kola), přehled to řekne nahlas („Data
  jsou stará“) a „Agenti teď“ místo čísel vysvětlí, že stav teď neznáme. Agenti z počítače, který
  se neozval přes 15 minut, se do „teď“ nepočítají. Nepovedená obnova nechá poslední data vidět,
  ale s upozorněním, z kdy jsou.
- **Bez dvojího počítání:** útrata na Macu jsou náklady z Admin API – patří organizaci, ne počítači.
  Dva Macy se stejným klíčem (nebo staré zařízení po přeinstalaci) by tentýž náklad poslaly dvakrát,
  proto web pro každou službu, druh a měnu bere jen nejčerstvěji synchronizovaný řádek. Různé měny
  se nesčítají. Stejně se jednou ukáže okno limitu hlášené více počítači (nejnovější měření).
- **Vzhled** podle systému; styly aplikace (`public/styles.css`, „Přehled účtu na webu“).
- Adresa projektu a publikovatelný klíč mají jediný zdroj `public/js/ucet-config.js`, který čte
  i server na Macu (`src/config.js`).

## Napojení modelů tlačítkem (`src/napojeni.js`, `public/js/napojeni-ui.js`)

Nastavení → Propojení → **Napojené modely**. Klik na „Napojit“ spustí přihlášení u dodavatele,
okno Agenteeq čeká a samo pozná, až je hotovo. Pak ukáže „Napojení … proběhlo v pořádku“.

| Model | Co se spustí | Jak Agenteeq pozná, že je hotovo | Ověřeno |
|---|---|---|---|
| Claude Code | `claude auth login --claudeai` na pozadí (sám hned otevře přihlášení Anthropicu v prohlížeči, na nic se neptá) | `claude auth status --json` → `loggedIn: true`; plán z `~/.claude.json` | nápověda CLI a běh bez okna, Claude Code 2.1.283, 26. 9. 2026 |
| Codex | `codex login` na pozadí (Codex otevře přihlášení ChatGPT v prohlížeči) | `codex login status` → „Logged in using …“ | zdroj `codex-rs/cli/src/login.rs`, 24. 9. 2026 |
| ChatGPT, Claude.ai, Gemini, Perplexity na webu | otevře službu v prohlížeči (potřebuje spárované rozšíření) | první stav z té služby od rozšíření | – |

Na macOS se Codex CLI hledá také přímo v `ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex` (a ve starším umístění `Contents/Resources/codex`). Finder nemusí mít stejný PATH jako interaktivní shell; přepisy Codexu lze číst i bez CLI, ale ověření přihlášení a spuštění agenta potřebují jeho spustitelný soubor.

- **Přihlašuje se vždycky u dodavatele.** Anthropic ani OpenAI nenabízejí cizím aplikacím
  přihlášení k předplatnému (Pro, Max, Plus) – `docs/CLOUD-ACCOUNTS.md`. Převzít přihlášení Claude
  Code nebo Codexu by znamenalo vydávat se za jejich aplikaci; to Agenteeq nedělá. Spouští jejich
  vlastní přihlášení a ptá se jejich vlastním příkazem.
- **Hesla ani tokeny dodavatelů Agenteeq nevidí.** Ze stavu bere jen „přihlášen ano / ne“ a plán.
- **Neznámý výstup je „nepodařilo se zjistit“,** ne „nenapojeno“. Hlídání běží nejvýš 10 minut
  po 2 s a skončí zprávou „vypršelo“. Zavřené okno hlídání zruší.
- **Terminál se nikdy neotvírá** (`src/prihlaseni.js`). Přihlášení běží jako podproces aplikace:
  argumenty jdou přímo programu bez shellu (složka „Design & Web“ se nerozpadne), do PATH se
  přidá složka programu (Claude Code z npm potřebuje `node`, který leží vedle něj). Starší Claude
  Code bez přepínače `--claudeai` skončí s „unknown option“ a spustí se jednou bez něj.
- **Když se prohlížeč sám neotevře**, tlačítko „Prohlížeč se neotevřel?“ otevře záložní odkaz,
  který přihlášení vypsalo (projde jen https adresa dodavatele). Claude Code pak na stránce ukáže
  kód; ten se vloží do okna Agenteeq a jde procesu na vstup (jeden řádek tisknutelných znaků,
  nic se neukládá). Codex se vrací na svůj localhost sám.
- **Přihlášení, které skončí bez napojení** (zavřená stránka, chyba), okno ohlásí hned
  („skončilo bez napojení“), ne až po deseti minutách. Zrušení okna proces ukončí.
- Firemní API účty (OpenAI, Anthropic) se dál napojují správcovským klíčem v kartě
  „Skutečné náklady za API“.

## Testy

`test/ucet.test.mjs` běží proti atrapě Supabase Auth (PKCE, jednorázové obnovovací tokeny, apikey).
`test/napojeni.test.mjs` běží proti atrapě `claude` a `codex` (výstupy podle ověřených zdrojů výše).
`test/cloud-sync.test.mjs` běží proti atrapě PostgREST a hlídá seznam povolených polí.
`test/ucet-web.test.mjs` hlídá PKCE v prohlížeči, souhrny na webu a to, že web jen čte.
Skutečný server účtů testy nikdy nevolají: `test/helpers.mjs` nastavuje `AGENTEEQ_UCET_URL=0`.
