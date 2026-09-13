# Vzdálený přístup mimo domácí síť

Agenteeq z principu poslouchá jen v domácí síti (`docs/SECURITY.md#přístup-z-telefonu`). To
stačí, dokud jsi doma. Mimo domov (mobilní data, cizí Wi-Fi) se k Macu bez dalšího kroku
nedostaneš — a to je záměr, ne chyba: server nikdy sám neotvírá cestu ven.

Řešení není vlastní server Agenteeq v cloudu. Je to **tunel, který si spustíš sám** —
Agenteeq jen zjistí, jestli ho máš, a poradí, který z nich použít (`src/tunnel.js`).

## Tři cesty

| Cesta | Dopad na soukromí | Náročnost pro uživatele | Co tím získáš |
|---|---|---|---|
| **Tailscale** (doporučeno) | Privátní síť (VPN) jen mezi tvými vlastními zařízeními. Žádná veřejná adresa nikde nevzniká; provoz jde šifrovaným tunelem (WireGuard) přímo mezi Makem a telefonem. | Jedna instalace a přihlášení na obou zařízeních; pak už funguje samo, i po restartu. | Adresu vidí jen tvá vlastní zařízení. Nejbližší náhrada za „jako bys byl doma". |
| **Cloudflare Tunnel** (`cloudflared`) | Veřejná adresa. Provoz jde přes Cloudflarovu infrastrukturu; adresu teoreticky získá kdokoli, kdo ji uvidí nebo uhodne. | Jeden příkaz v Terminálu (`cloudflared tunnel --url http://127.0.0.1:PORT`), bez účtu — ale musí zůstat spuštěný v otevřeném okně a po každém spuštění je adresa jiná. | Rychlé vyzkoušení bez registrace. Adresa je automaticky HTTPS. |
| **ngrok** | Veřejná adresa, stejně jako u Cloudflare, navíc s ngrokovým webovým přehledem provozu (a jejich vlastním logováním požadavků). | Účet, přihlašovací token, pak jeden příkaz (`ngrok http PORT`). | Totéž co Cloudflare Tunnel, plus dashboard a stabilnější adresa na placeném plánu. |

Agenteeq tyto tři cesty jen **detekuje** (`detectTunnels()`) a **doporučí** (`remoteAdvice()`) —
v tomto pořadí: Tailscale, pokud je nainstalovaný; jinak Cloudflare Tunnel s výslovným
upozorněním na veřejnou adresu; jinak radu nainstalovat Tailscale. Spuštění samotného tunelu
(příkaz v Terminálu, přihlášení) je vždy ruční krok uživatele — modul nic neinstaluje ani
nespouští na pozadí.

## Proč Agenteeq nemá vlastní server v cloudu

Agenteeq čte přepisy práce s AI agenty — kód, klientská data, prompty (`docs/SECURITY.md`).
Poslat je na server, který nevlastníš a nekontroluješ, je přesně to riziko, kterému se má
produkt vyhnout. Proto je **local-first**: veškerá data zůstávají na Macu, žádná telemetrie,
žádná analytika, žádný účet u Agenteeq. Tunel podle této stránky nic nemění — pořád jde jen o
to, jak se **tvůj vlastní telefon** dostane na **tvůj vlastní Mac**. Cloudflare/ngrok vidí
zašifrovaný HTTPS provoz procházet jejich sítí (ne jeho obsah, pokud HTTPS funguje správně —
ale vidí, že provoz existuje a kdy), Tailscale nevidí ani to.

## Co chybí do instalovatelné PWA venku

I s tunelem funguje aplikace v prohlížeči normálně. Instalace jako PWA (ikona na ploše,
offline schránka, service worker) ale vyžaduje **zabezpečený kontext** — tedy HTTPS s platným
certifikátem, ne jen `http://`:

- **Tailscale**: adresa je tvar `http://<jméno-zařízení>.<tailnet>.ts.net:<port>` — bez
  certifikátu. Tailscale nabízí `tailscale cert` (vydá certifikát od Let's Encrypt pro tvou
  `*.ts.net` adresu) a `tailscale serve`/`funnel` (proxy s HTTPS před tvým portem). Potřeba je
  zapnout HTTPS v nastavení tailnetu a buď vydat certifikát ručně, nebo prohnat provoz přes
  `tailscale serve`.
- **cloudflared**: HTTPS má automaticky — `*.trycloudflare.com` adresa už je `https://` s
  platným certifikátem od chvíle, kdy tunel vznikne. Nic navíc není potřeba.
- **ngrok**: stejně jako u cloudflared — `https://` adresa s platným certifikátem hned po
  spuštění.

Až bude k dispozici stabilní HTTPS adresa (kterákoli z výše uvedených), zbývá už jen manifest
a service worker na straně Agenteeq — to je samostatná položka mimo tento modul.

## Veřejný tunel neznamená důvěryhodnou adresu

**Cloudflare Tunnel i ngrok vytvářejí adresu, na kterou se teoreticky může dostat kdokoli, kdo
ji zná** — je to skutečná veřejná URL na internetu, ne jen adresa viditelná v domácí síti.
Proto (a jen proto) v Agenteeq **zůstává povinné párování PINem a token** i po zapnutí
veřejného tunelu:

- adresu samotnou znát nestačí — bez spárovaného zařízení (šestimístný PIN, platnost 5 minut,
  na jedno použití) se dál nedá přečíst nic (`docs/SECURITY.md#přístup-z-telefonu`);
- token zůstává v `HttpOnly` cookie a v datech Agenteeq je jen jeho hash;
- ochrana proti CSRF (`X-Agenteeq` + kontrola `Origin`) platí bez ohledu na to, jestli je
  adresa privátní (Tailscale) nebo veřejná (Cloudflare/ngrok).

Tailscale toto riziko prakticky odstraňuje (adresa není veřejně dohledatelná ani
připojitelná bez členství v tailnetu) — proto je doporučenou výchozí volbou. U Cloudflare
Tunnel a ngrok je párování a token jediná věc, která stojí mezi náhodným nálezcem adresy a
tvými daty, a vypnout je proto nejde.
