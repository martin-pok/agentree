import fs from 'node:fs';
import { run as execRun } from './util.js';

// Vzdálený přístup mimo domácí síť — postavený na tunelu, který si uživatel spustí sám.
// Tenhle modul nic neinstaluje ani nespouští na pozadí: jen zjišťuje stav (je nástroj
// nainstalovaný? běží zrovna tunel? jaká je jeho adresa?) a radí, který tunel použít.
// Spuštění samotného tunelu (nebo přihlášení) je vždy ruční krok uživatele v Terminálu.
//
// Tři cesty, v pořadí doporučení:
//   tailscale    — privátní síť (VPN) jen mezi vlastními zařízeními, adresa nikde veřejně neexistuje.
//   cloudflared  — veřejná (dočasná) adresa přes Cloudflare, bez nutnosti účtu.
//   ngrok        — veřejná adresa přes ngrok, s webovým přehledem provozu.
//
// Detekce je čistě informativní a musí bez pádu přežít nenainstalovaný nástroj, chybějící
// binárku, nedostupné API i vypršený timeout — proto jde `run` (spouštění příkazů) i
// `fileExists` (existence souboru) injektovat, aby šel celý modul otestovat bez systému,
// na kterém běží.

const TAILSCALE_APP_BIN = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
const NGROK_API = 'http://127.0.0.1:4040/api/tunnels';

export const TUNNELS = [
  {
    id: 'tailscale',
    name: 'Tailscale',
    description: 'Vytvoří privátní síť (VPN) jen mezi tvými vlastními zařízeními — telefon se k Macu připojí, jako by byl doma.',
    kind: 'privatni-sit',
    security: 'Provoz jde šifrovaným tunelem jen mezi tvými zařízeními a adresa nikde veřejně neexistuje — nejbezpečnější a doporučená volba.',
    detectedBy: `binárka ${TAILSCALE_APP_BIN} nebo "tailscale" v PATH; stav a adresa z "tailscale status --json" (pole Self.DNSName a TailscaleIPs)`,
    startedBy: 'uživatel spustí "tailscale up" na Macu a nainstaluje appku Tailscale na telefonu se stejným účtem',
  },
  {
    id: 'cloudflared',
    name: 'Cloudflare Tunnel',
    description: 'Vytvoří dočasnou veřejnou adresu k tvému Macu bez nutnosti účtu u Cloudflare.',
    kind: 'verejny-tunel',
    security: 'Adresa je veřejná a provoz jde přes Cloudflarovu infrastrukturu — kdokoli, kdo adresu zná, se na ni teoreticky může připojit.',
    detectedBy: '"cloudflared" v PATH; běžící tunel se pozná podle procesu, veřejnou adresu ale vypisuje jen sám příkaz do terminálu',
    startedBy: 'uživatel spustí "cloudflared tunnel --url http://127.0.0.1:PORT" v Terminálu',
  },
  {
    id: 'ngrok',
    name: 'ngrok',
    description: 'Vytvoří veřejnou adresu k tvému Macu přes ngrok, i s webovým přehledem provozu.',
    kind: 'verejny-tunel',
    security: 'Adresa je veřejná a provoz jde přes ngrokovu infrastrukturu — kdokoli, kdo adresu zná, se na ni teoreticky může připojit.',
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

async function detectTailscale({ run, fileExists }) {
  const m = meta('tailscale');
  try {
    const appPresent = Boolean(fileExists(TAILSCALE_APP_BIN));
    const bin = appPresent ? TAILSCALE_APP_BIN : ((await run('which', ['tailscale'], { timeout: 1000 }))?.ok ? 'tailscale' : null);
    if (!bin) {
      return { id: m.id, name: m.name, installed: false, running: false, url: '', kind: m.kind, security: m.security, hint: 'Nainstaluj Tailscale (tailscale.com) a přihlas se stejným účtem i na telefonu.' };
    }
    const res = await run(bin, ['status', '--json'], { timeout: 1500 });
    let data = null;
    if (res?.ok) {
      try { data = JSON.parse(res.stdout); } catch { data = null; }
    }
    const running = data?.BackendState === 'Running';
    let url = '';
    if (running) {
      const dns = stripTrailingDot(data?.Self?.DNSName);
      const ip = Array.isArray(data?.Self?.TailscaleIPs) ? data.Self.TailscaleIPs[0] : '';
      url = dns || ip || '';
    }
    const hint = running ? '' : 'Přihlas se v Tailscale — na Macu "tailscale up", v appce na telefonu stejným účtem.';
    return { id: m.id, name: m.name, installed: true, running, url, kind: m.kind, security: m.security, hint };
  } catch {
    return { id: m.id, name: m.name, installed: false, running: false, url: '', kind: m.kind, security: m.security, hint: 'Stav Tailscale se nepodařilo zjistit.' };
  }
}

async function detectCloudflared({ run }) {
  const m = meta('cloudflared');
  try {
    const which = await run('which', ['cloudflared'], { timeout: 1000 });
    const installed = Boolean(which?.ok);
    if (!installed) {
      return { id: m.id, name: m.name, installed: false, running: false, url: '', kind: m.kind, security: m.security, hint: 'Nainstaluj cloudflared (brew install cloudflared).' };
    }
    // Quick tunnel nemá lokální API — adresu vypisuje jen do stdout ve chvíli spuštění.
    // Poctivě proto zjišťujeme jen to, jestli proces běží, adresu si nevymýšlíme.
    const proc = await run('pgrep', ['-f', 'cloudflared tunnel'], { timeout: 800 });
    const running = Boolean(proc?.ok && String(proc.stdout || '').trim());
    const hint = running
      ? 'Tunel běží — veřejnou adresu najdeš ve výstupu příkazu v Terminálu (řádek končící na trycloudflare.com).'
      : 'Spusť "cloudflared tunnel --url http://127.0.0.1:PORT" v Terminálu a nech okno otevřené.';
    return { id: m.id, name: m.name, installed: true, running, url: '', kind: m.kind, security: m.security, hint };
  } catch {
    return { id: m.id, name: m.name, installed: false, running: false, url: '', kind: m.kind, security: m.security, hint: 'Stav cloudflared se nepodařilo zjistit.' };
  }
}

async function detectNgrok({ run, fetchJson }) {
  const m = meta('ngrok');
  try {
    const which = await run('which', ['ngrok'], { timeout: 1000 });
    const installed = Boolean(which?.ok);
    const data = await fetchJson(NGROK_API, { timeoutMs: 600 });
    const tunnels = Array.isArray(data?.tunnels) ? data.tunnels : [];
    const pick = tunnels.find((t) => String(t?.public_url || '').startsWith('https://')) || tunnels[0] || null;
    const running = Boolean(pick?.public_url);
    const url = pick?.public_url || '';
    const hint = !installed
      ? 'Nainstaluj ngrok (ngrok.com) a přihlas se účtem (ngrok config add-authtoken …).'
      : running ? '' : 'Spusť "ngrok http PORT" v Terminálu a nech okno otevřené.';
    return { id: m.id, name: m.name, installed, running, url, kind: m.kind, security: m.security, hint };
  } catch {
    return { id: m.id, name: m.name, installed: false, running: false, url: '', kind: m.kind, security: m.security, hint: 'Stav ngrok se nepodařilo zjistit.' };
  }
}

// Zjistí stav podporovaných tunelů. Nic nespouští ani neinstaluje — jen se ptá na to, co už
// na počítači běží nebo je nainstalované. Chyba jednoho nástroje (chybějící binárka, timeout,
// nesmyslná odpověď) se nikdy nepropaguje ven jako výjimka a nesmí ovlivnit ostatní nástroje.
export async function detectTunnels({ run = execRun, fileExists = fs.existsSync, fetchJson = defaultFetchJson } = {}) {
  const [tailscale, cloudflared, ngrok] = await Promise.all([
    detectTailscale({ run, fileExists }),
    detectCloudflared({ run }),
    detectNgrok({ run, fetchJson }),
  ]);
  return [tailscale, cloudflared, ngrok];
}

// Doporučení: Tailscale > Cloudflare Tunnel > (nic nenainstalováno) doporuč instalaci Tailscale.
// ngrok se aktivně nedoporučuje — je v katalogu a v přehledu, ale radu dostane jen tehdy,
// když nic lepšího není k dispozici u prvních dvou cest.
export function remoteAdvice(tunnels) {
  const byId = Object.fromEntries((Array.isArray(tunnels) ? tunnels : []).map((t) => [t.id, t]));
  const tailscale = byId.tailscale;
  const cloudflared = byId.cloudflared;

  if (tailscale?.installed) {
    return {
      doporuceni: 'tailscale',
      text: 'Tailscale má nejlepší poměr bezpečnosti a pohodlí: vytvoří privátní síť jen mezi tvými zařízeními, žádná veřejná adresa nikde nevzniká.',
      kroky: tailscale.running
        ? ['Na telefonu nainstaluj appku Tailscale a přihlas se stejným účtem jako na Macu.', 'V appce Tailscale na telefonu otevři adresu Agentree.']
        : ['Na Macu se přihlas do Tailscale ("tailscale up").', 'Na telefonu nainstaluj appku Tailscale a přihlas se stejným účtem.', 'V appce Tailscale na telefonu otevři adresu Agentree.'],
    };
  }
  if (cloudflared?.installed) {
    return {
      doporuceni: 'cloudflared',
      text: 'Cloudflare Tunnel je rychlá cesta bez účtu, ale vytváří veřejnou adresu — provoz jde přes cizí infrastrukturu a adresu teoreticky může použít kdokoli, kdo ji zná.',
      kroky: ['V Terminálu spusť "cloudflared tunnel --url http://127.0.0.1:PORT".', 'Zkopíruj adresu, kterou příkaz vypíše.', 'Nech okno Terminálu otevřené, dokud vzdálený přístup potřebuješ.'],
    };
  }
  return {
    doporuceni: 'zadny',
    text: 'Žádný nástroj pro vzdálený přístup není nainstalovaný. Nejdřív zkus Tailscale — je zdarma pro osobní použití a nevytváří veřejnou adresu.',
    kroky: ['Nainstaluj Tailscale (tailscale.com nebo "brew install --cask tailscale").', 'Přihlas se stejným účtem na Macu i na telefonu.', 'Spusť detekci znovu.'],
  };
}

// Sestaví celou adresu, na kterou se uživatel z telefonu připojí. U privátní sítě (Tailscale)
// je zjištěná adresa jen jméno/IP zařízení bez portu — port Agentree se připojuje až tady.
// U veřejných tunelů (Cloudflare, ngrok) je adresa od tunelu už kompletní veřejná URL.
export function remoteUrl(tunnel, port) {
  if (!tunnel || !tunnel.url) return '';
  if (tunnel.kind === 'privatni-sit') return `http://${stripTrailingDot(tunnel.url)}:${port}`;
  return tunnel.url;
}
