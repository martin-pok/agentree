# Vzdálený přístup mimo domácí síť

## Dostupnost hostitele

Zavření okna červeným tlačítkem na macOS ponechá aplikaci a server běžet. Cmd+Q server ukončí. Uspaný nebo vypnutý Mac data neposkytne; Tailscale ani statický web ho nenahradí. Nepřetržitý přístup vyžaduje zapnutý a bdělý hostitel, případně samostatný trvale běžící server po rozhodnutí o umístění dat. Desktop a CLI LaunchAgent nespouštěj současně na stejném portu.

Po startu a každých 30 sekund aplikace obnovuje povolené listenery a ověřuje identitu Tailscale. IP musí odpovídat systémovému rozhraní i výstupu Tailscale. Odebrání zařízení ukončí jeho aktivní SSE stream; vypnutí Tailscale odmítne i již spuštěnou loopback proxy. Obnova připojení neznamená probuzení počítače.


Agenteeq z principu poslouchá jen v domácí síti (`docs/SECURITY.md#přístup-z-telefonu`). To
stačí, dokud jsi doma. Mimo domov (mobilní data, cizí Wi-Fi) se k Macu bez dalšího kroku
nedostaneš – a to je záměr, ne chyba: server nikdy sám neotvírá cestu ven.

Řešení není vlastní server Agenteeq v cloudu. Je to **tunel, který si spustíš sám** –
Agenteeq jen zjistí, jestli ho máš, a poradí, který z nich použít (`src/tunnel.js`).

## Tři cesty

| Cesta | Dopad na soukromí | Náročnost pro uživatele | Co tím získáš |
|---|---|---|---|
| **Tailscale** (doporučeno) | Privátní síť (VPN) jen mezi tvými vlastními zařízeními. Žádná veřejná adresa nikde nevzniká; provoz jde šifrovaným tunelem (WireGuard) přímo mezi Makem a telefonem. | Jedna instalace a přihlášení na obou zařízeních; pak už funguje samo, i po restartu. | Adresu vidí jen tvá vlastní zařízení. Nejbližší náhrada za „jako bys byl doma“. |
| **Cloudflare Tunnel** (`cloudflared`) | Veřejná adresa. Provoz jde přes Cloudflarovu infrastrukturu; adresu teoreticky získá kdokoli, kdo ji uvidí nebo uhodne. | Jeden příkaz v Terminálu (`cloudflared tunnel --url http://127.0.0.1:PORT`), bez účtu – ale musí zůstat spuštěný v otevřeném okně a po každém spuštění je adresa jiná. | Rychlé vyzkoušení bez registrace. Adresa je automaticky HTTPS. |
| **ngrok** | Veřejná adresa, stejně jako u Cloudflare, navíc s ngrokovým webovým přehledem provozu (a jejich vlastním logováním požadavků). | Účet, přihlašovací token, pak jeden příkaz (`ngrok http PORT`). | Totéž co Cloudflare Tunnel, plus dashboard a stabilnější adresa na placeném plánu. |

U Cloudflare Tunnelu a ngroku Agenteeq jen **detekuje** (`detectTunnels()`) a **doporučí**
(`remoteAdvice()`); spuštění samotného tunelu je vždy ruční krok uživatele v Terminálu – modul nic
neinstaluje ani nespouští na pozadí.

**Tailscale je od 0.12.0 napojený přímo** (`Nastavení → Aplikace na tomto Macu → Přístup přes
Tailscale`). Nezůstává u rady: se zapnutým přepínačem začne Agenteeq naslouchat i na adrese, kterou
tomuto Macu přidělil tailnet, takže telefon otevře aplikaci odkudkoli bez jediného příkazu navíc.

## Jak je Tailscale napojený

| Co | Jak |
|---|---|
| Adresa | `tailscaleAddresses()` v `src/lan.js` bere z rozhraní Macu jen IPv4 z rozsahu `100.64.0.0/10` (CGNAT), který Tailscale přiděluje. Veřejná adresa tam být nemůže. |
| Jméno | `tailscale status --json` → `Self.DNSName` (MagicDNS, třeba `mac-mini.tailabcd.ts.net`). Bez zapnutého MagicDNS zůstane prázdné a pracuje se jen s adresou – nic se nedomýšlí. |
| Listener | Vzniká výhradně po zapnutí přepínače (`POST /api/tailscale/enable`, jen z Macu) a jen na té konkrétní adrese, nikdy na `0.0.0.0`. Vypnutí ho zavře. |
| Ochrana | Beze změny: párování šestimístným PINem, token v `HttpOnly` cookie, v datech jen jeho hash, kontrola `Host` a `Origin`, CSRF hlavička. Viz `docs/SECURITY.md`. |
| Nezávislost | Domácí síť a Tailscale jsou dva samostatné přepínače. Vypnutí jednoho nezavře druhý a telefony se odpárují, teprve když se zavírá poslední otevřená cesta. |
| HTTPS | Stav `tailscale serve` se jen **čte** (`tailscale serve status --json`) a hlásí se jako zapnutý jen tehdy, když proxy skutečně míří na port Agenteeq. Čemu modul nerozumí, hlásí jako neznámé. **Beta:** ověřeno proti dokumentaci, ne proti živému tailnetu. |

Co Agenteeq **nedělá**: neinstaluje Tailscale, nespouští `tailscale up` ani `tailscale serve`,
nepřihlašuje se za uživatele a nikam neposílá adresu tailnetu. Zapnutí HTTPS zůstává příkaz,
který uživatel spustí sám.

## Rozhraní na webu (statická kopie)

Samotné rozhraní – `public/` – jsou jen statické soubory a dají se nahrát kamkoli (Vercel,
Netlify, vlastní webhosting). **Server tím nevzniká.**

Na našem vlastním webu leží rozhraní na **`/app`**; v kořeni je landing page (`site/`).
Skládá to `scripts/build-site.mjs` do `dist/web` a při té příležitosti přepíše manifest PWA
i `sw.js`, aby instalace na plochu otevřela rozhraní, ne marketingovou stránku. Taková stránka nemá odkud brát data:
`/api/*` na ní vrací 404 a `127.0.0.1` je na telefonu sám telefon, ne Mac.

Proto se při startu jednou zeptáme na `/api/health` (`jeStatickaKopie()` v
`public/js/connect.js`):

- **Odpoví Agenteeq** → načte se aplikace jako vždycky.
- **Odpoví 404 nebo něco jiného** → místo aplikace se ukáže rozcestník „Kde máš Agenteeq?“:
  zeptá se na adresu Macu, zapamatuje si ji a prohlížeč tam pošle. Od té chvíle běží všechno
  na adrese tvého Macu – párování kódem, cookie i stream (`docs/SECURITY.md`).
- **Spadne samotné spojení** (server neodpovídá) → to je výpadek vlastního Agenteeq, ne cizí
  hosting: zůstává karta „server neběží“ a čekání na návrat.

Adresa se normalizuje podle toho, jak vypadá: IP v domácí síti nebo jméno `.local` po `http`
s doplněným portem 4620, tunel venku po `https` na svém vlastním jménu. Jiné schéma než
`http(s)` a adresa s přihlašovacími údaji se odmítnou – rozcestník nikam jinam neodejde.

Statická kopie tedy nic neukládá ani nepřeposílá; je to jen dveře, za kterými je pořád tvůj Mac.

### Ukázka pro prohlídku na webu (`/app?ukazka`)

Jediná výjimka z rozcestníku: s parametrem `?ukazka` načte statická kopie místo serveru snímek
smyšlených dat `/ukazka/data.json` (`public/js/ukazka.js`) a rozhraní běží nad ním. Tak vzniká
živá prohlídka na landing page – `site/lp.js` ji vkládá do rámu místo statických snímků.

- **Data** sestaví `scripts/ukazka-data.mjs` při každém `npm run build:site` ze stejné ukázkové
  scény jako snímky (`scripts/demo-fixture.mjs`): odpovědi `/api/state` a
  `/api/usage/claude?days=90`, vzhled `system`. Cesty stroje, na kterém se web sestavuje, se
  nahradí cestami ukázkového profilu; kdyby nějaká nahrazení unikla, sestavení spadne. Časy se
  u návštěvníka posunou na „teď“, kalendářní data (měsíc útraty) zůstávají z doby sestavení.
- **Nic se neukládá a nikam se neposílá.** `request()` v `public/js/api.js` odpovídá jen čtením
  ze snímku; zápis vrátí 403, neznámá cesta 404, stream jen jednou ohlásí „připojeno“. Na síť
  se ukázka neptá.
- **Jen na webu.** Na Macu (`jeStatickaKopie()` je nepravda) se `?ukazka` ignoruje. Když se data
  nenačtou, ukáže se obyčejný rozcestník.
- **Rám je jen na dívání:** `inert`, mimo pořadí Tabu, `aria-hidden` (odečítačka čte popis snímku)
  a zprávy přijímá jen z vlastního původu. Nástup obrazovky v rámu stojí, dokud rám není vidět
  aspoň z třetiny; snímek se za živé rozhraní vymění jen tam, kde se na něj nikdo nedívá, nebo
  při přepnutí obrazovky. S omezeným pohybem se ukáže rovnou konečný stav.

## Proč Agenteeq nemá vlastní server v cloudu

Agenteeq čte přepisy práce s AI agenty – kód, klientská data, prompty (`docs/SECURITY.md`).
Poslat je na server, který nevlastníš a nekontroluješ, je přesně to riziko, kterému se má
produkt vyhnout. Proto je **local-first**: veškerá data zůstávají na Macu, žádná telemetrie,
žádná analytika, žádný účet u Agenteeq. Tunel podle této stránky nic nemění – pořád jde jen o
to, jak se **tvůj vlastní telefon** dostane na **tvůj vlastní Mac**. Cloudflare/ngrok vidí
zašifrovaný HTTPS provoz procházet jejich sítí (ne jeho obsah, pokud HTTPS funguje správně –
ale vidí, že provoz existuje a kdy), Tailscale nevidí ani to.

## Co chybí do instalovatelné PWA venku

I s tunelem funguje aplikace v prohlížeči normálně. Instalace jako PWA (ikona na ploše,
offline schránka, service worker) ale vyžaduje **zabezpečený kontext** – tedy HTTPS s platným
certifikátem, ne jen `http://`:

- **Tailscale**: adresa je tvar `http://<jméno-zařízení>.<tailnet>.ts.net:<port>` – bez
  certifikátu. Tailscale nabízí `tailscale cert` (vydá certifikát od Let's Encrypt pro tvou
  `*.ts.net` adresu) a `tailscale serve`/`funnel` (proxy s HTTPS před tvým portem). Potřeba je
  zapnout HTTPS v nastavení tailnetu a buď vydat certifikát ručně, nebo prohnat provoz přes
  `tailscale serve`. Karta v Nastavení stav téhle proxy ukáže, jakmile ji spustíš – a řekne
  i to, že zapnutá není. Spouštět ji za tebe nebude.
- **cloudflared**: HTTPS má automaticky – `*.trycloudflare.com` adresa už je `https://` s
  platným certifikátem od chvíle, kdy tunel vznikne. Nic navíc není potřeba.
- **ngrok**: stejně jako u cloudflared – `https://` adresa s platným certifikátem hned po
  spuštění.

Až bude k dispozici stabilní HTTPS adresa (kterákoli z výše uvedených), zbývá už jen manifest
a service worker na straně Agenteeq – to je samostatná položka mimo tento modul.

## Veřejný tunel neznamená důvěryhodnou adresu

**Cloudflare Tunnel i ngrok vytvářejí adresu, na kterou se teoreticky může dostat kdokoli, kdo
ji zná** – je to skutečná veřejná URL na internetu, ne jen adresa viditelná v domácí síti.
Proto (a jen proto) v Agenteeq **zůstává povinné párování PINem a token** i po zapnutí
veřejného tunelu:

- adresu samotnou znát nestačí – bez spárovaného zařízení (šestimístný PIN, platnost 5 minut,
  na jedno použití) se dál nedá přečíst nic (`docs/SECURITY.md#přístup-z-telefonu`);
- token zůstává v `HttpOnly` cookie a v datech Agenteeq je jen jeho hash;
- ochrana proti CSRF (`X-Agenteeq` + kontrola `Origin`) platí bez ohledu na to, jestli je
  adresa privátní (Tailscale) nebo veřejná (Cloudflare/ngrok).

Tailscale toto riziko prakticky odstraňuje (adresa není veřejně dohledatelná ani
připojitelná bez členství v tailnetu) – proto je doporučenou výchozí volbou. U Cloudflare
Tunnel a ngrok je párování a token jediná věc, která stojí mezi náhodným nálezcem adresy a
tvými daty, a vypnout je proto nejde.
