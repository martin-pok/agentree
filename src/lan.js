import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';

// Přístup z telefonu. Výchozí stav je vypnuto — dokud ho uživatel sám nezapne, server poslouchá
// jen na 127.0.0.1 jako dřív. Zapnout jde dvě nezávislé cesty a obě přidají další listener:
//
//   settings.lanAccess        adresy tohoto Macu v domácí síti (10.x, 192.168.x, 172.16–31.x)
//   settings.tailscaleAccess  adresa tohoto Macu v jeho privátní síti Tailscale (100.64.0.0/10)
//
// Data z nich nedostane nikdo bez spárovaného zařízení:
//
//   1. Na Macu se ukáže šestimístný PIN s platností 5 minut a na jedno použití.
//   2. Telefon ho jednou zadá a dostane token do cookie (HttpOnly, SameSite=Strict).
//   3. V souboru aplikace leží jen SHA-256 hash tokenu — ze zálohy dat se přihlásit nedá.
//
// Zápisy navíc dál procházejí ochranou proti CSVF/CSRF (hlavička X-Agenteeq + kontrola Origin).

const PIN_TTL_MS = 5 * 60 * 1000;
const PIN_TRIES_MAX = 5;
const DEVICES_MAX = 10;
const TOKEN_TTL_MS = 90 * 24 * 3600 * 1000;
export const COOKIE = 'agenteeq_device';

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const sixDigits = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export const stripTrailingDot = (s) => String(s || '').replace(/\.$/, '');

// Jméno Macu v MagicDNS přichází z výstupu cizího programu (`tailscale status --json`) a míří
// rovnou do seznamu povolených hodnot hlavičky Host. Proto se napřed ověří jeho tvar: běžné DNS
// jméno malými písmeny, aspoň dvě části, nic jiného. Cokoli s portem, lomítkem, mezerou nebo
// prázdnou částí se zahodí — do ochrany proti DNS rebindingu se nesmí dostat nic neočekávaného.
const DNS_JMENO = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
export function magicDnsName(raw) {
  const jmeno = stripTrailingDot(raw).trim().toLowerCase();
  return jmeno.length <= 253 && DNS_JMENO.test(jmeno) ? jmeno : '';
}

// Adresy, na kterých je Agenteeq z místní sítě vidět. Veřejné adresy sem nepatří — vybíráme
// jen privátní rozsahy, aby se odkaz nedal omylem otevřít z internetu.
export function lanAddresses(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const list of Object.values(interfaces)) {
    for (const ni of list || []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      if (/^10\./.test(ni.address) || /^192\.168\./.test(ni.address) || /^172\.(1[6-9]|2\d|3[01])\./.test(ni.address)) out.push(ni.address);
    }
  }
  return out;
}

// Adresa tohoto Macu v jeho vlastní privátní síti Tailscale. Tailscale přiděluje zařízením IPv4
// z rozsahu 100.64.0.0/10 (CGNAT) — není to veřejná adresa: připojí se na ni jen zařízení
// přihlášená do stejného tailnetu. Bereme výhradně IPv4: Tailscale ji přiděluje vždy a odpadá
// s ní hranatá závorka v adrese i v hlavičce Host.
export function tailscaleAddresses(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const list of Object.values(interfaces)) {
    for (const ni of list || []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ni.address)) out.push(ni.address);
    }
  }
  return out;
}

// Je požadavek z tohoto Macu? Jen takový smí dál bez tokenu (desktopová aplikace a prohlížeč na Macu).
export function isLoopback(address) {
  const a = String(address || '').replace(/^::ffff:/, '');
  return a === '127.0.0.1' || a === '::1' || /^127\./.test(a);
}

export const cookieValue = (header, name = COOKIE) => {
  for (const part of String(header || '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return '';
};

// `interfaces` a `tailscaleName` jdou vstřiknout, aby šly cesty ven otestovat bez skutečné sítě
// a bez nainstalovaného Tailscale — stejně jako se injektuje `run` v src/tunnel.js.
export function createLanAccess({ datastore, config, onListen = () => {}, tailscaleName = () => '', interfaces = () => os.networkInterfaces() }) {
  const servers = new Map(); // adresa → naslouchající listener
  const errors = new Map(); // adresa → proč se ji nepodařilo otevřít
  let handler = null;
  let boundPort = 0;
  let pin = null; // { code, expiresAt, tries }
  const devices = () => datastore.data.lanDevices;
  const lanOn = () => Boolean(datastore.data.settings.lanAccess);
  const tailscaleOn = () => Boolean(datastore.data.settings.tailscaleAccess);

  // Adresy, na kterých má Agenteeq naslouchat kromě 127.0.0.1. Vychází výhradně ze zapnutých
  // přepínačů: vypnutý přepínač znamená, že listener na té cestě vůbec nevznikne.
  function bindAddresses() {
    const out = [];
    if (lanOn()) out.push(...lanAddresses(interfaces()));
    if (tailscaleOn()) out.push(...tailscaleAddresses(interfaces()));
    return [...new Set(out)];
  }

  // Hodnoty hlavičky Host, které smí projít (ochrana proti DNS rebindingu). Kromě adres je to
  // u Tailscale i jméno v MagicDNS — bez něj by adresa mac.tailnet.ts.net skončila na 403.
  function hosts() {
    const out = bindAddresses();
    if (tailscaleOn()) {
      const name = magicDnsName(tailscaleName());
      if (name) out.push(name);
    }
    return [...new Set(out)];
  }

  const firstError = (list) => list.map((a) => errors.get(a)).find(Boolean) || '';

  function prune(now = Date.now()) {
    const live = devices().filter((d) => d.at + TOKEN_TTL_MS > now);
    if (live.length !== devices().length) {
      datastore.data.lanDevices = live;
      datastore.save();
    }
  }

  function status(now = Date.now()) {
    prune(now);
    const addresses = lanAddresses(interfaces());
    const tsAddresses = tailscaleAddresses(interfaces());
    const tsName = magicDnsName(tailscaleName());
    // Port bereme z běžícího listeneru — hlavní server mohl dostat jiný než z konfigurace.
    const port = [...servers.values()][0]?.address()?.port || boundPort || config.port;
    // Adresa pro Tailscale: přednost má jméno v MagicDNS (zapamatovatelné a přežije změnu IP),
    // teprve když ho tailnet nemá zapnuté, ukážeme adresu 100.x.
    const tsHost = tsName || tsAddresses[0] || '';
    return {
      enabled: lanOn(),
      listening: addresses.some((a) => servers.has(a)),
      error: lanOn() ? (errors.get('lan') || firstError(addresses)) : '',
      port,
      addresses,
      url: addresses.length ? `http://${addresses[0]}:${port}` : '',
      tailscale: {
        enabled: tailscaleOn(),
        available: tsAddresses.length > 0,
        listening: tsAddresses.some((a) => servers.has(a)),
        error: tailscaleOn() ? (tsAddresses.length ? firstError(tsAddresses) : 'Tailscale na tomto Macu neběží nebo nejsi přihlášený.') : '',
        addresses: tsAddresses,
        name: tsName,
        url: tsHost ? `http://${tsHost}:${port}` : '',
      },
      pin: pin && pin.expiresAt > now ? { code: pin.code, expiresAt: pin.expiresAt } : null,
      devices: devices().map((d) => ({ id: d.id, label: d.label, at: d.at })),
    };
  }

  function newPin(now = Date.now()) {
    pin = { code: sixDigits(), expiresAt: now + PIN_TTL_MS, tries: 0 };
    return { code: pin.code, expiresAt: pin.expiresAt };
  }

  // Spáruje telefon. Vrací token jen jednou — v datech zůstane pouze jeho hash.
  async function pair(code, label, now = Date.now()) {
    if (!lanOn() && !tailscaleOn()) return { status: 403, error: 'Přístup z telefonu je vypnutý.' };
    if (!pin || pin.expiresAt <= now) return { status: 410, error: 'Kód vypršel. Vytvoř na Macu nový.' };
    if (pin.tries >= PIN_TRIES_MAX) {
      pin = null;
      return { status: 429, error: 'Příliš mnoho pokusů. Vytvoř na Macu nový kód.' };
    }
    pin.tries++;
    const given = Buffer.from(String(code || ''));
    const expected = Buffer.from(pin.code);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return { status: 401, error: `Kód nesouhlasí. Zbývají ${PIN_TRIES_MAX - pin.tries} pokusy.` };
    }
    pin = null; // na jedno použití
    const token = crypto.randomBytes(32).toString('base64url');
    const device = { id: crypto.randomUUID().slice(0, 8), label: String(label || 'Telefon').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 40) || 'Telefon', hash: hash(token), at: now };
    devices().push(device);
    if (devices().length > DEVICES_MAX) devices().splice(0, devices().length - DEVICES_MAX);
    await datastore.flush();
    return { token, device: { id: device.id, label: device.label, at: device.at }, maxAgeSec: Math.floor(TOKEN_TTL_MS / 1000) };
  }

  function tokenOk(token, now = Date.now()) {
    if (!token) return false;
    const h = hash(token);
    prune(now);
    return devices().some((d) => d.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(d.hash), Buffer.from(h)));
  }

  async function revoke(id) {
    const i = devices().findIndex((d) => d.id === id);
    if (i === -1) return { status: 404, error: 'Takové zařízení v seznamu není.' };
    devices().splice(i, 1);
    await datastore.flush();
    return { ok: true };
  }

  // Jeden listener na jednu adresu. Poslouchá přímo na síťových adresách tohoto Macu, ne na
  // 0.0.0.0 — ten by kolidoval s už obsazeným portem na 127.0.0.1 (EADDRINUSE) a tiše by se
  // nespustil. Listener na 127.0.0.1 běží nezávisle a nikdy se nevypíná.
  function open(address, port) {
    return new Promise((resolve) => {
      const s = http.createServer(handler);
      const selhalStart = (err) => {
        errors.set(address, err.code === 'EADDRINUSE' ? `Port ${port} už někdo obsadil.` : `Nepodařilo se otevřít přístup: ${err.code || err.message}`);
        servers.delete(address);
        resolve();
      };
      s.once('error', selhalStart);
      s.listen(port, address, () => {
        // Obsluha selhání startu se hned odvěsí. Kdyby zůstala, pozdější chyba na už naslouchajícím
        // socketu (třeba došlé popisovače při přijetí spojení) by ho vyřadila z evidence, ale
        // nezavřela: `stop()` by ho pak neměl jak zavřít a další zapnutí by narazilo na obsazený
        // port. Listener se proto od téhle chvíle uklidí sám a teprve pak zmizí ze seznamu.
        s.off('error', selhalStart);
        s.on('error', (err) => {
          errors.set(address, `Spojení se přerušilo: ${err.code || err.message}`);
          servers.delete(address);
          s.close(() => {});
        });
        errors.delete(address);
        servers.set(address, s);
        resolve();
      });
    });
  }

  // Srovná skutečně otevřené listenery s tím, co mají zapnuté přepínače: zavře, co tam nepatří,
  // a otevře, co chybí. Volá se při startu i po každém přepnutí, takže zapnutí Tailscale nikdy
  // neshodí už fungující přístup z domácí sítě a naopak.
  // Vrací se teprve tehdy, když listenery skutečně naslouchají (nebo selhaly) — rozhraní tak
  // nikdy neohlásí „zapnuto", dokud to není pravda.
  async function start(requestHandler, port = config.port) {
    if (requestHandler) handler = requestHandler;
    boundPort = port;
    const want = handler ? bindAddresses() : [];
    for (const [address, s] of [...servers]) {
      if (want.includes(address)) continue;
      servers.delete(address);
      await new Promise((resolve) => s.close(resolve));
    }
    for (const address of [...errors.keys()]) if (!want.includes(address)) errors.delete(address);
    if (lanOn() && !lanAddresses(interfaces()).length) errors.set('lan', 'Mac není v žádné místní síti.');
    else errors.delete('lan');
    await Promise.all(want.filter((a) => !servers.has(a)).map((a) => open(a, port)));
    const s = status();
    if (servers.size) onListen(s);
    return s;
  }

  async function stop() {
    const list = [...servers.values()];
    servers.clear();
    errors.clear();
    await Promise.all(list.map((s) => new Promise((resolve) => s.close(resolve))));
  }

  return { status, hosts, newPin, pair, tokenOk, revoke, start, stop, get listening() { return servers.size > 0; } };
}
