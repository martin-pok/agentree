# Účty Agenteeq

Stav k 24. 9. 2026: přihlášení přes Google v aplikaci na Macu, databáze v cloudu s RLS. Synchronizace
souhrnů, napojování modelů tlačítkem a přehled na webu přijdou v dalších krocích a tenhle dokument
se s nimi rozšíří.

## Rozhodnutí vlastníka produktu (23. 9. 2026)

- **Do cloudu smí jen účet a souhrny.** Tokeny po dnech, útrata po měsících, limity a počty agentů
  podle stavu. Text konverzací, jejich názvy, cesty ke složkám, poznámky k výdajům a kód Mac
  **nikdy** neopustí.
- **Databáze:** Supabase, projekt `agenteeq` (`quxfenxxdcafcuptucnn`), region `eu-central-1`
  (Frankfurt). Postgres s řádkovým zabezpečením (RLS).
- **Účet nic nezamyká.** Bez přihlášení funguje Agenteeq celý, stejně jako dřív.

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
- **Do rozhraní** jdou jen `stav`, `jmeno`, `email`, `chyba`, `ceka`, `trvale` – nikdy tokeny.
  Spárovaný telefon vidí jen `stav`.
- Obnovovací token nejde zapsat ani smazat přes `PUT/DELETE /api/secrets/:id`. Ta cesta je jen
  pro ručně zadávané API klíče.

## Databáze (`supabase/migrations`)

| Tabulka | Co obsahuje | Klíč |
|---|---|---|
| `profiles` | jméno z Googlu, tarif (mění jen server), `sync_enabled` (opt-in) | `id` = uživatel |
| `devices` | název zařízení, systém, verze aplikace | `id` |
| `connections` | které služby jsou napojené a v jakém stavu – bez klíčů | zařízení + poskytovatel |
| `usage_daily` | tokeny (vstup, výstup, cache) a počet konverzací po dnech | zařízení + den + poskytovatel |
| `spend_monthly` | součty útraty po službě, druhu a měně | zařízení + měsíc + služba + druh + měna |
| `limits` | procento a obnova oken limitů | zařízení + poskytovatel + okno |
| `agent_status` | počty agentů: pracuje, potřebuje tě, čeká, selhal | zařízení |

- **RLS:** každý řádek čte a mění jen jeho vlastník. Souhrn jde zapsat jen k vlastnímu zařízení.
  Anonymní klíč nepřečte nic, tarif si uživatel nezmění. E-mail zůstává jen v `auth.users`.
- **Kontrola:** `supabase/tests/rls.sql` projde 15 případů a vše vrátí zpět (výsledek je ve
  výjimce na konci). Naposledy spuštěno 24. 9. 2026: všech 15 `true`.
- **Smazání účtu:** `public.smazat_muj_ucet()` smaže uživatele z `auth.users` a kaskádou všechno
  jeho. Poradce Supabase na tuhle funkci hlásí varování „security definer spustitelná
  přihlášeným“ – je to záměr: funkce maže jen `auth.uid()`, nepřihlášený ji spustit nemůže.
- Veřejná adresa projektu a publikovatelný klíč jsou v `src/config.js` (`UCET_VYCHOZI`). Jsou
  veřejné z principu, přístup hlídá RLS. Tajný klíč (`service_role`) v repozitáři ani
  v aplikaci není a nikdy nebude.

## Co musí nastavit vlastník projektu (jednorázově)

Bez těchto kroků karta účtu po klepnutí na „Přihlásit se přes Google“ poctivě odpoví, že se
přihlášení ještě nastavuje (`GET /auth/v1/settings` → `external.google: false`).

1. **Google Cloud Console → APIs & Services**
   - *OAuth consent screen:* typ External, název Agenteeq, e-mail podpory, autorizovaná doména
     `supabase.co`, rozsahy `openid`, `email`, `profile`.
   - *Credentials → Create OAuth client ID:* typ Web application, *Authorized redirect URI*
     `https://quxfenxxdcafcuptucnn.supabase.co/auth/v1/callback`.
2. **Supabase → Authentication → Sign In / Providers → Google:** zapnout a vložit Client ID a
   Client Secret z kroku 1.
3. **Supabase → Authentication → URL Configuration**
   - *Site URL:* `https://agentree-fawn.vercel.app`
   - *Redirect URLs:* `http://127.0.0.1:*/ucet/navrat/*` (aplikace na Macu, libovolný port).

## Testy

`test/ucet.test.mjs` běží proti atrapě Supabase Auth (PKCE, jednorázové obnovovací tokeny, apikey).
Skutečný server účtů testy nikdy nevolají: `test/helpers.mjs` nastavuje `AGENTEEQ_UCET_URL=0`.
