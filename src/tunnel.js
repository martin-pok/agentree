import fs from 'node:fs';
import { tailscalePaths, whichCommand, nalezenoVPath, prikazInstalace, bezziProces, POCITAC } from './platform.js';
import { run as execRun } from './util.js';
import { ui } from './texty.js';

// Vzdálený přístup mimo domácí síť – postavený na tunelu, který si uživatel spustí sám.
// Tenhle modul nic neinstaluje ani nespouští na pozadí: jen zjišťuje stav (je nástroj
// nainstalovaný? běží zrovna tunel? jaká je jeho adresa?) a radí, který tunel použít.
// Spuštění samotného tunelu (nebo přihlášení) je vždy ruční krok uživatele v Terminálu.
//
// Tři cesty, v pořadí doporučení:
//   tailscale    – privátní síť (VPN) jen mezi vlastními zařízeními, adresa nikde veřejně neexistuje.
//   cloudflared  – veřejná (dočasná) adresa přes Cloudflare, bez nutnosti účtu.
//   ngrok        – veřejná adresa přes ngrok, s webovým přehledem provozu.
//
// Detekce je čistě informativní a musí bez pádu přežít nenainstalovaný nástroj, chybějící
// binárku, nedostupné API i vypršený timeout – proto jde `run` (spouštění příkazů) i
// `fileExists` (existence souboru) injektovat, aby šel celý modul otestovat bez systému,
// na kterém běží.

// Kde Tailscale bydlí, ví src/platform.js – na macOS je to balíček .app, na Windows
// program v Program Files. Tady se jen zkusí jedna cesta po druhé a pak PATH.
const TAILSCALE_BINARKY = tailscalePaths();
const NGROK_API = 'http://127.0.0.1:4040/api/tunnels';

export const TUNNELS = [
  {
    id: 'tailscale',
    name: 'Tailscale',
    description: ui('Vytvoří privátní síť (VPN) jen mezi tvými vlastními zařízeními – telefon se k {0} připojí, jako by byl doma.', POCITAC.tvemu),
    kind: 'privatni-sit',
    security: ui('Provoz jde šifrovaným tunelem jen mezi tvými zařízeními a adresa nikde veřejně neexistuje – nejbezpečnější a doporučená volba.'),
    detectedBy: `binárka (${TAILSCALE_BINARKY.join(', ')}) nebo "tailscale" v PATH; stav a adresa z "tailscale status --json" (pole Self.DNSName a TailscaleIPs), HTTPS z "tailscale serve status --json"`,
    startedBy: 'uživatel spustí "tailscale up" na Macu a nainstaluje appku Tailscale na telefonu se stejným účtem',
  },
  {
    id: 'cloudflared',
    name: 'Cloudflare Tunnel',
    description: ui('Vytvoří dočasnou veřejnou adresu k {0} bez nutnosti účtu u Cloudflare.', POCITAC.tvemu),
    kind: 'verejny-tunel',
    security: ui('Adresa je veřejná a provoz jde přes Cloudflarovu infrastrukturu – kdokoli, kdo adresu zná, se na ni teoreticky může připojit.'),
    detectedBy: '"cloudflared" v PATH; běžící tunel se pozná podle procesu, veřejnou adresu ale vypisuje jen sám příkaz do terminálu',
    startedBy: 'uživatel spustí "cloudflared tunnel --url http://127.0.0.1:PORT" v Terminálu',
  },
  {
    id: 'ngrok',
    name: 'ngrok',
    description: ui('Vytvoří veřejnou adresu k {0} přes ngrok, i s webovým přehledem provozu.', POCITAC.tvemu),
    kind: 'verejny-tunel',
    security: ui('Adresa je veřejná a provoz jde přes ngrokovu infrastrukturu – kdokoli, kdo adresu zná, se na ni teoreticky může připojit.'),
    detectedBy: `"ngrok" v PATH; běžící tunel a jeho adresa se zjistí z lokálního API ${NGROK_API}`,
    startedBy: 'uživatel spustí "ngrok http PORT" v Terminálu',
  },
];

const meta = (id) => TUNNELS.find((t) => t.id === id);
const stripTrailingDot = (s) => String(s || '').replace(/\.$/, '');

async function defaultFetchJson(url, { timeoutMs = 600 } = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res?.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// HTTPS pro tailnet. Adresa 100.x ani jméno v MagicDNS certifikát nemají, takže aplikace jede
// po http – a bez zabezpečeného kontextu ji telefon neuloží na plochu jako PWA. Tailscale to řeší
// příkazem "tailscale serve", který před port postaví proxy s certifikátem od Let's Encrypt.
//
// Zjišťujeme jen stav, nic nespouštíme. Výstup "tailscale serve status --json" popisuje proxy
// v poli Web (host:port → Handlers → cesta → Proxy). Čteme ho obranně: co nerozeznáme, hlásíme
// jako neznámé, nikdy jako zapnuté. Ověřeno proti dokumentaci, ne proti živému tailnetu –
// v docs/REMOTE.md je proto tahle část vedená jako Beta.
function readServe(stdout, port) {
  let data = null;
  try { data = JSON.parse(stdout); } catch { return { running: false, unknown: true }; }
  if (!data || typeof data !== 'object') return { running: false, unknown: true };
  const web = data.Web && typeof data.Web === 'object' ? data.Web : null;
  if (!web) return { running: false, unknown: false };
  for (const [hostPort, entry] of Object.entries(web)) {
    const handlers = entry?.Handlers && typeof entry.Handlers === 'object' ? entry.Handlers : {};
    for (const handler of Object.values(handlers)) {
      // Port se porovnává jako port, ne jako kus textu: `includes(':4620')` by sedělo
      // i na proxy mířící na :46200 a rozhraní by ohlásilo HTTPS, které nikam nevede.
      let cil = null;
      try { cil = new URL(String(handler?.Proxy || '')); } catch { cil = null; }
      if (!cil || cil.port !== String(port)) continue;
      // Klíč má tvar "jmeno.tailnet.ts.net:443"; port 443 v adrese neopakujeme.
      const host = String(hostPort).replace(/:443$/, '');
      return { running: true, unknown: false, url: `https://${host}/` };
    }
  }
  return { running: false, unknown: false };
}

async function detectTailscale({ run, fileExists, port }) {
  const m = meta('tailscale');
  const zaklad = { id: m.id, name: m.name, kind: m.kind, security: m.security, dnsName: '', ips: [], tailnet: '', serve: { running: false, unknown: true } };
  try {
    const nainstalovana = TAILSCALE_BINARKY.find((cesta) => fileExists(cesta)) || null;
    const vPath = nainstalovana ? true : nalezenoVPath(await run(whichCommand, ['tailscale'], { timeout: 1000 }));
    // Vypršené hledání v PATH není „nenainstalováno“ (CLAUDE.md): installed i running jsou null.
    if (vPath === null) return { ...zaklad, installed: null, running: null, url: '', hint: ui('Stav Tailscale se nepodařilo zjistit.') };
    const bin = nainstalovana || (vPath ? 'tailscale' : null);
    if (!bin) {
      return { ...zaklad, installed: false, running: false, url: '', hint: ui('Nainstaluj Tailscale (tailscale.com) a přihlas se stejným účtem i na telefonu.') };
    }
    const res = await run(bin, ['status', '--json'], { timeout: 1500 });
    let data = null;
    if (res?.ok) {
      try { data = JSON.parse(res.stdout); } catch { data = null; }
    }
    const running = data?.BackendState === 'Running';
    const dns = running ? stripTrailingDot(data?.Self?.DNSName) : '';
    const ips = running && Array.isArray(data?.Self?.TailscaleIPs) ? data.Self.TailscaleIPs.filter((x) => typeof x === 'string') : [];
    const tailnet = running ? stripTrailingDot(data?.CurrentTailnet?.MagicDNSSuffix || '') : '';
    const url = running ? (dns || ips[0] || '') : '';
    // Na HTTPS se ptáme, jen když Tailscale opravdu běží – jinak by příkaz jen zbytečně čekal.
    const serveRes = running ? await run(bin, ['serve', 'status', '--json'], { timeout: 1500 }) : null;
    // Na co jsme se nezeptali (odhlášený Tailscale) nebo čemu jsme nerozuměli, je neznámé –
    // nikdy ne „vypnuté“. Rozhraní o HTTPS mlčí, dokud to neví jistě.
    const serve = serveRes?.ok ? readServe(serveRes.stdout, port) : { running: false, unknown: true };
    const hint = running ? '' : ui('Přihlas se v Tailscale – {0} "tailscale up", v appce na telefonu stejným účtem.', POCITAC.naHostiteli);
    return { ...zaklad, installed: true, running, url, dnsName: dns, ips, tailnet, serve, hint };
  } catch {
    return { ...zaklad, installed: null, running: null, url: '', hint: ui('Stav Tailscale se nepodařilo zjistit.') };
  }
}

async function detectCloudflared({ run }) {
  const m = meta('cloudflared');
  try {
    const installed = nalezenoVPath(await run(whichCommand, ['cloudflared'], { timeout: 1000 }));
    if (installed === null) {
      return { id: m.id, name: m.name, installed: null, running: null, url: '', kind: m.kind, security: m.security, hint: ui('Stav cloudflared se nepodařilo zjistit.') };
    }
    if (!installed) {
      const prikaz = prikazInstalace('cloudflared');
      return { id: m.id, name: m.name, installed: false, running: false, url: '', kind: m.kind, security: m.security, hint: prikaz ? ui('Nainstaluj cloudflared ({0}).', prikaz) : ui('Nainstaluj cloudflared (developers.cloudflare.com).') };
    }
    // Quick tunnel nemá lokální API – adresu vypisuje jen do stdout ve chvíli spuštění.
    // Poctivě proto zjišťujeme jen to, jestli proces běží, adresu si nevymýšlíme. Nepovedený
    // výpis procesů je „nevíme“ (running: null), ne „neběží“ s radou tunel spustit.
    const proc = await bezziProces(/cloudflared[^\n]*tunnel/i, run);
    const running = proc?.ok ? Boolean(proc.bezi) : null;
    const hint = running
      ? ui('Tunel běží – veřejnou adresu najdeš ve výstupu příkazu v Terminálu (řádek končící na trycloudflare.com).')
      : running === null
        ? ui('Stav cloudflared se nepodařilo zjistit.')
        : ui('Spusť "cloudflared tunnel --url http://127.0.0.1:PORT" v Terminálu a nech okno otevřené.');
    return { id: m.id, name: m.name, installed: true, running, url: '', kind: m.kind, security: m.security, hint };
  } catch {
    return { id: m.id, name: m.name, installed: null, running: null, url: '', kind: m.kind, security: m.security, hint: ui('Stav cloudflared se nepodařilo zjistit.') };
  }
}

async function detectNgrok({ run, fetchJson }) {
  const m = meta('ngrok');
  try {
    const installed = nalezenoVPath(await run(whichCommand, ['ngrok'], { timeout: 1000 }));
    const data = await fetchJson(NGROK_API, { timeoutMs: 600 });
    const tunnels = Array.isArray(data?.tunnels) ? data.tunnels : [];
    const pick = tunnels.find((t) => String(t?.public_url || '').startsWith('https://')) || tunnels[0] || null;
    const running = Boolean(pick?.public_url);
    const url = pick?.public_url || '';
    const hint = running ? ''
      : installed === null ? ui('Stav ngrok se nepodařilo zjistit.')
        : !installed ? ui('Nainstaluj ngrok (ngrok.com) a přihlas se účtem (ngrok config add-authtoken …).')
          : ui('Spusť "ngrok http PORT" v Terminálu a nech okno otevřené.');
    return { id: m.id, name: m.name, installed, running, url, kind: m.kind, security: m.security, hint };
  } catch {
    return { id: m.id, name: m.name, installed: null, running: null, url: '', kind: m.kind, security: m.security, hint: ui('Stav ngrok se nepodařilo zjistit.') };
  }
}

// Zjistí stav podporovaných tunelů. Nic nespouští ani neinstaluje – jen se ptá na to, co už
// na počítači běží nebo je nainstalované. Chyba jednoho nástroje (chybějící binárka, timeout,
// nesmyslná odpověď) se nikdy nepropaguje ven jako výjimka a nesmí ovlivnit ostatní nástroje.
export async function detectTunnels({ run = execRun, fileExists = fs.existsSync, fetchJson = defaultFetchJson, port = 4620 } = {}) {
  const [tailscale, cloudflared, ngrok] = await Promise.all([
    detectTailscale({ run, fileExists, port }),
    detectCloudflared({ run }),
    detectNgrok({ run, fetchJson }),
  ]);
  return [tailscale, cloudflared, ngrok];
}

// Doporučení: Tailscale > Cloudflare Tunnel > (nic nenainstalováno) doporuč instalaci Tailscale.
// ngrok se aktivně nedoporučuje – je v katalogu a v přehledu, ale radu dostane jen tehdy,
// když nic lepšího není k dispozici u prvních dvou cest.
export function remoteAdvice(tunnels) {
  const byId = Object.fromEntries((Array.isArray(tunnels) ? tunnels : []).map((t) => [t.id, t]));
  const tailscale = byId.tailscale;
  const cloudflared = byId.cloudflared;

  if (tailscale?.installed) {
    return {
      doporuceni: 'tailscale',
      text: ui('Tailscale má nejlepší poměr bezpečnosti a pohodlí: vytvoří privátní síť jen mezi tvými zařízeními, žádná veřejná adresa nikde nevzniká.'),
      kroky: tailscale.running
        ? [ui('Zapni výš přepínač „Přístup přes Tailscale“ – Agenteeq začne poslouchat i na adrese v tvé privátní síti.'), ui('Na telefonu nainstaluj appku Tailscale a přihlas se stejným účtem jako {0}.', POCITAC.naHostiteli), ui('Vytvoř v Agenteeq jednorázový kód a na telefonu otevři adresu z karty Tailscale.')]
        : [ui('Přihlas se do Tailscale {0} ("tailscale up").', POCITAC.naHostiteli), ui('Na telefonu nainstaluj appku Tailscale a přihlas se stejným účtem.'), ui('Zapni v Agenteeq přepínač „Přístup přes Tailscale“ a spáruj telefon kódem.')],
    };
  }
  // Co se nepodařilo zjistit, nesmí skončit radou „nic není nainstalované“ (CLAUDE.md).
  const nevim = {
    doporuceni: 'nevim',
    text: ui('Které nástroje pro vzdálený přístup jsou nainstalované, se nepodařilo zjistit.'),
    kroky: [ui('Spusť detekci znovu.')],
  };
  if (tailscale?.installed === null) return nevim;
  if (cloudflared?.installed) {
    return {
      doporuceni: 'cloudflared',
      text: ui('Cloudflare Tunnel je rychlá cesta bez účtu, ale vytváří veřejnou adresu – provoz jde přes cizí infrastrukturu a adresu teoreticky může použít kdokoli, kdo ji zná.'),
      kroky: [ui('V Terminálu spusť "cloudflared tunnel --url http://127.0.0.1:PORT".'), ui('Zkopíruj adresu, kterou příkaz vypíše.'), ui('Nech okno Terminálu otevřené, dokud vzdálený přístup potřebuješ.')],
    };
  }
  if (cloudflared?.installed === null) return nevim;
  const prikaz = prikazInstalace('tailscale');
  return {
    doporuceni: 'zadny',
    text: ui('Žádný nástroj pro vzdálený přístup není nainstalovaný. Nejdřív zkus Tailscale – je zdarma pro osobní použití a nevytváří veřejnou adresu.'),
    kroky: [prikaz ? ui('Nainstaluj Tailscale (tailscale.com nebo "{0}").', prikaz) : ui('Nainstaluj Tailscale (tailscale.com).'), ui('Přihlas se stejným účtem {0} i na telefonu.', POCITAC.naHostiteli), ui('Spusť detekci znovu.')],
  };
}

// Sestaví celou adresu, na kterou se uživatel z telefonu připojí. U privátní sítě (Tailscale)
// je zjištěná adresa jen jméno/IP zařízení bez portu – port Agenteeq se připojuje až tady.
// U veřejných tunelů (Cloudflare, ngrok) je adresa od tunelu už kompletní veřejná URL.
export function remoteUrl(tunnel, port) {
  if (!tunnel || !tunnel.url) return '';
  if (tunnel.kind === 'privatni-sit') return `http://${stripTrailingDot(tunnel.url)}:${port}`;
  return tunnel.url;
}
