import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanAccess, tailscaleAddresses, lanAddresses, magicDnsName } from '../src/lan.js';
import { loadConfig } from '../src/config.js';
import http from 'node:http';
import { detectTunnels } from '../src/tunnel.js';
import { startTestServer, api } from './helpers.mjs';
import { tailscalePaths } from '../src/platform.js';

// Kde Tailscale bydlí, se liší systém od systému (balíček .app, Program Files, /usr/bin).
// Testy proto nepředstírají jednu konkrétní cestu, ale tu, kterou pro tenhle systém
// hlásí platformový šev – jinak by ověřovaly macOS, ne naši logiku.
const NAINSTALOVANY_TAILSCALE = tailscalePaths()[0];

// Tailscale jako plnohodnotná cesta k Agenteeq z telefonu: server smí naslouchat i na adrese,
// kterou tomuto Macu přidělil tailnet. Adresa 100.x není veřejná – dostane se na ni jen zařízení
// přihlášené do stejného tailnetu – ale i tak platí párování kódem a token (test/lan.test.mjs).

const config = () => loadConfig({ PORT: '0', AGENTEEQ_HOME: '/tmp/x', AGENTEEQ_SOURCE_HOME: '/tmp/x' });
const fakeDatastore = (settings = {}) => {
  const data = { settings: { lanAccess: false, tailscaleAccess: false, ...settings }, lanDevices: [] };
  return { data, save() {}, async flush() {} };
};

// Rozhraní se zapnutým Tailscale: utun3 nese adresu z rozsahu 100.64.0.0/10.
const ROZHRANI = {
  lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  en0: [{ family: 'IPv4', address: '192.168.1.20', internal: false }],
  utun3: [
    { family: 'IPv4', address: '100.101.102.103', internal: false },
    { family: 'IPv6', address: 'fd7a:115c:a1e0::1', internal: false },
  ],
};

test('tailnet: poznají se jen adresy z rozsahu 100.64.0.0/10, nic jiného', () => {
  assert.deepEqual(tailscaleAddresses(ROZHRANI), ['100.101.102.103'], 'IPv6 se nebere – pracujeme jen s IPv4');
  assert.deepEqual(lanAddresses(ROZHRANI), ['192.168.1.20'], 'adresa z tailnetu není adresa domácí sítě');

  // Hranice rozsahu: 100.63.x a 100.128.x jsou veřejné adresy a do tailnetu nepatří.
  const hranice = (adresa) => tailscaleAddresses({ x: [{ family: 'IPv4', address: adresa, internal: false }] });
  for (const a of ['100.64.0.1', '100.100.100.100', '100.127.255.254']) assert.deepEqual(hranice(a), [a], a);
  for (const a of ['100.63.255.255', '100.128.0.1', '100.5.0.1', '10.0.0.1']) assert.deepEqual(hranice(a), [], a);
});

test('tailnet: stav a adresa se skládají z MagicDNS jména, teprve pak z adresy 100.x', () => {
  const datastore = fakeDatastore();
  const lan = createLanAccess({
    datastore,
    config: config(),
    tailscaleName: () => 'mac-mini.tailabcd.ts.net.',
    interfaces: () => ROZHRANI,
  });
  const vypnuto = lan.status().tailscale;
  assert.equal(vypnuto.enabled, false);
  assert.equal(vypnuto.listening, false);
  assert.equal(vypnuto.error, '', 'vypnutá cesta nehlásí chybu');
  assert.equal(vypnuto.name, 'mac-mini.tailabcd.ts.net', 'tečka na konci DNS jména se ořízne');
  assert.match(vypnuto.url, /^http:\/\/mac-mini\.tailabcd\.ts\.net:\d+$/);

  // Bez MagicDNS (tailnet ho nemá zapnutý) se nic nedomýšlí – spadne se na adresu 100.x.
  const bezDns = createLanAccess({ datastore, config: config(), tailscaleName: () => '', interfaces: () => ROZHRANI });
  const s = bezDns.status();
  assert.equal(s.tailscale.name, '');
  assert.deepEqual(s.tailscale.addresses, ['100.101.102.103']);
  assert.equal(s.tailscale.url, `http://100.101.102.103:${s.port}`);
  assert.equal(s.tailscale.available, true);
});

// Jméno z MagicDNS chodí z výstupu cizího programu a míří do ochrany proti DNS rebindingu.
// Proto musí projít jen tvar běžného DNS jména – nic s portem, cestou ani prázdnou částí.
test('tailnet: do seznamu povolených jmen se dostane jen pořádné DNS jméno', () => {
  for (const [vstup, cekano] of [
    ['mac-mini.tailabcd.ts.net.', 'mac-mini.tailabcd.ts.net'],
    ['Mac-Mini.Tailabcd.TS.NET', 'mac-mini.tailabcd.ts.net'],
    ['  mac.ts.net  ', 'mac.ts.net'],
  ]) assert.equal(magicDnsName(vstup), cekano, vstup);

  for (const zle of [
    '', 'mac', 'mac.ts.net:4620', 'http://mac.ts.net', 'mac.ts.net/cesta', 'mac..ts.net',
    '.mac.ts.net', '-mac.ts.net', 'mac-.ts.net', 'mac ts.net', 'mac.ts.net evil.com',
    'utocnik@mac.ts.net', '100.64.0.5:80', `${'a'.repeat(250)}.ts.net`, null, undefined, 42,
  ]) assert.equal(magicDnsName(zle), '', JSON.stringify(zle));
});

test('tailnet: nesmyslné jméno z „tailscale status“ se do allowlistu nedostane', () => {
  const datastore = fakeDatastore({ tailscaleAccess: true });
  const lan = createLanAccess({
    datastore,
    config: config(),
    tailscaleName: () => 'mac.ts.net:4620 utocnik.example.com',
    interfaces: () => ROZHRANI,
  });
  assert.deepEqual(lan.hosts(), ['100.101.102.103'], 'projde jen adresa, jméno se zahodí');
  assert.equal(lan.status().tailscale.name, '');
  assert.equal(lan.status().tailscale.url, `http://100.101.102.103:${lan.status().port}`);
});

test('tailnet: hlavička Host projde jen se zapnutým přepínačem – a s ním i jméno v MagicDNS', () => {
  const datastore = fakeDatastore();
  const lan = createLanAccess({ datastore, config: config(), tailscaleName: () => 'Mac-Mini.Tailabcd.ts.net', interfaces: () => ROZHRANI });

  assert.deepEqual(lan.hosts(), [], 'vypnuto = neprojde vůbec nic mimo 127.0.0.1');

  datastore.data.settings.tailscaleAccess = true;
  const hosts = lan.hosts();
  assert.ok(hosts.includes('mac-mini.tailabcd.ts.net'), 'jméno v MagicDNS se porovnává malými písmeny');
  assert.ok(hosts.includes('100.101.102.103'), 'adresa v tailnetu projde taky');
  assert.equal(hosts.includes('192.168.1.20'), false, 'zapnutý Tailscale sám o sobě neotvírá domácí síť');
});

test('tailnet: adresa, kterou Mac nemá, skončí poctivou chybou – nikdy tichým „zapnuto“', async (t) => {
  // Testovací stroj tailnet nemá, takže pokus o naslouchání na adrese 100.x musí selhat. Právě to
  // je tu k ověření: chyba se zapíše, `listening` zůstane false a nic se nevyhodí ven. Rozhraní
  // tak nemůže ohlásit zapnutý přístup, který ve skutečnosti neposlouchá.
  const datastore = fakeDatastore({ tailscaleAccess: true });
  const lan = createLanAccess({
    datastore,
    config: config(),
    tailscaleName: () => '',
    interfaces: () => ({ utun3: [{ family: 'IPv4', address: '100.64.0.5', internal: false }] }),
  });
  t.after(() => lan.stop());

  const stav = await lan.start((req, res) => { res.writeHead(200).end('ok'); }, 0);
  assert.equal(stav.tailscale.available, true, 'adresa v seznamu je');
  assert.equal(stav.tailscale.listening, false, 'ale naslouchat na ní nejde');
  assert.match(stav.tailscale.error, /\S/, 'a proč, to se řekne');
  assert.equal(lan.listening, false);

  // Vypnutí přepínače chybu uklidí – nezůstane viset u vypnuté cesty.
  datastore.data.settings.tailscaleAccess = false;
  const po = await lan.start(null, 0);
  assert.equal(po.tailscale.error, '');
  assert.equal(po.tailscale.listening, false);
});

test('HTTP: bez běžícího Tailscale se přístup nezapne a nastavení zůstane vypnuté', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());

  const pred = await api(s.url).get('/api/state');
  assert.equal(pred.body.lan.tailscale.enabled, false);
  assert.equal(pred.body.lan.tailscale.available, false, 'testovací stroj tailnet nemá');

  const r = await api(s.url).send('POST', '/api/tailscale/enable', {});
  assert.equal(r.status, 422, 'bez běžícího Tailscale není co zapnout');
  assert.match(r.body.error, /Tailscale/);

  // Adresa z rozsahu 100.64.0.0/10 sama nestačí: je to rozsah pro CGNAT (RFC 6598) a Mac ji
  // může dostat i od operátora. Kdyby o ni šlo, otevřeli bychom naslouchání do sítě operátora.
  const puvodni = s.app.lan.status;
  s.app.lan.status = () => ({ ...puvodni.call(s.app.lan), tailscale: { enabled: false, available: true, listening: false, error: '', addresses: ['100.64.0.5'], name: '', url: '' } });
  t.after(() => { s.app.lan.status = puvodni; });
  const sAdresou = await api(s.url).send('POST', '/api/tailscale/enable', {});
  assert.equal(sAdresou.status, 422, 'samotná adresa z rozsahu CGNAT přepínač neodemkne');

  const po = await api(s.url).get('/api/state');
  assert.equal(po.body.settings.tailscaleAccess, false, 'neúspěšné zapnutí nesmí nic přepnout');
  assert.equal(po.body.lan.tailscale.listening, false);

  // Vypnout jde vždy, i když zapnuté nebylo – je to idempotentní a nic neshodí.
  assert.equal((await api(s.url).send('POST', '/api/tailscale/disable', {})).status, 200);
});

// Ochrana proti DNS rebindingu je jediné, co stojí mezi škodlivou stránkou a daty na tomhle Macu:
// server smí odpovědět jen na hlavičku Host, kterou sám zná. Tailscale ten seznam rozšiřuje
// o adresu v tailnetu a o jméno v MagicDNS, takže tady se ověřuje, že rozšíření prochází přes
// lan.hosts() – tedy že je opravdu vázané na zapnutý přepínač, a ne natvrdo povolené.
test('HTTP: na cizí hlavičku Host server neodpoví, na vlastní jméno v MagicDNS ano', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const port = Number(new URL(s.url).port);
  const JMENO = 'mac-mini.tailabcd.ts.net';

  const zeptejSe = (host, cesta = '/api/health') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: cesta, headers: { Host: host } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });

  // Výchozí stav: obě cesty vypnuté, takže projde jen tenhle Mac.
  assert.equal((await zeptejSe(`127.0.0.1:${port}`)).status, 200);
  assert.equal((await zeptejSe(`localhost:${port}`)).status, 200);
  assert.equal((await zeptejSe(`${JMENO}:${port}`)).status, 403, 'jméno v MagicDNS bez zapnutého přepínače neprojde');
  assert.equal((await zeptejSe('utocnik.example.com')).status, 403);
  assert.equal((await zeptejSe('100.64.0.5')).status, 403, 'ani holá adresa z rozsahu tailnetu');

  // Se zapnutým přístupem přes Tailscale se seznam rozšíří přesně o to, co vrátí lan.hosts().
  s.app.datastore.data.settings.tailscaleAccess = true;
  const puvodni = s.app.lan.hosts;
  s.app.lan.hosts = () => [JMENO, '100.64.0.5'];
  t.after(() => { s.app.lan.hosts = puvodni; s.app.datastore.data.settings.tailscaleAccess = false; });

  assert.equal((await zeptejSe(`${JMENO}:${port}`)).status, 200, 'vlastní jméno v MagicDNS projde');
  assert.equal((await zeptejSe(`${JMENO.toUpperCase()}:${port}`)).status, 200, 'velikost písmen nerozhoduje');
  assert.equal((await zeptejSe('100.64.0.5')).status, 200, 'adresa v tailnetu projde');
  assert.equal((await zeptejSe('utocnik.example.com')).status, 403, 'cizí jméno neprojde ani pak');
  assert.equal((await zeptejSe('zly.mac-mini.tailabcd.ts.net')).status, 403, 'ani podvržená předpona');
});

// Regrese k bezpečnostní chybě z revize 0.12.0. `tailscale serve` je reverzní proxy běžící
// na tomhle Macu: cizí zařízení z tailnetu se připojí na HTTPS, proxy zakončí TLS a na server
// se obrátí z 127.0.0.1. Kdyby se „je to z Macu“ posuzovalo jen podle adresy protistrany,
// dostal by takový požadavek výjimku pro desktopovou aplikaci – tedy PIN, seznam zařízení,
// spouštění agentů a všechna data bez jediného tokenu. Rozhoduje proto i hlavička Host.
test('HTTP: požadavek přeposlaný proxy z tohoto Macu nedostane práva desktopové aplikace', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const port = Number(new URL(s.url).port);
  const JMENO = 'mac-mini.tailabcd.ts.net';

  s.app.datastore.data.settings.tailscaleAccess = true;
  const puvodni = s.app.lan.hosts;
  s.app.lan.hosts = () => [JMENO];
  t.after(() => { s.app.lan.hosts = puvodni; s.app.datastore.data.settings.tailscaleAccess = false; });

  // Přesně to, co vidí server za `tailscale serve`: spojení po smyčce, ale cizí Host.
  const jakoProxy = (cesta, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: cesta, method, headers: { Host: JMENO, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });

  // 1. Data bez tokenu nedostane.
  for (const cesta of ['/api/state', '/api/skills']) {
    assert.equal((await jakoProxy(cesta)).status, 401, `${cesta} musí bez spárování vrátit 401`);
  }

  // 2. Jednorázový PIN ani seznam zařízení se za proxy nevydá – jinak by si útočník počkal
  //    na kód, který si vyrobí sám vlastník, a spároval se natrvalo.
  const lan = await jakoProxy('/api/lan');
  assert.equal(lan.status, 401, 'stav přístupu je za proxy bez tokenu nedostupný');
  assert.equal(lan.body.includes('"pin"'), false);

  // 3. Nic se nedá přepnout ani spustit.
  for (const [cesta, metoda] of [['/api/lan/pin', 'POST'], ['/api/tailscale/enable', 'POST'], ['/api/lan/enable', 'POST'], ['/api/launch', 'POST']]) {
    const r = await jakoProxy(cesta, { method: metoda, headers: { 'X-Agenteeq': '1' } });
    assert.equal(r.status, 401, `${metoda} ${cesta} musí skončit na 401`);
  }

  // 4. Hlavička od proxy sama o sobě výjimku ruší, i když se požadavek hlásí na 127.0.0.1.
  const sProxyHlavickou = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/lan', headers: { Host: `127.0.0.1:${port}`, 'X-Forwarded-For': '100.64.0.9' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(sProxyHlavickou.body.includes('"pin"'), false, 'stopa po proxy znamená, že PIN se nevydá');
});

// Cookie s tokenem má mít příznak Secure, když spojení jelo po HTTPS. Server sám TLS nezakončuje,
// takže to pozná jedině podle proxy před ním. Dřív se odvozovalo z `url.protocol`, jenže `url` se
// staví nad pevným http://127.0.0.1 – příznak se tedy nenastavil nikdy.
test('párování: cookie dostane Secure, když proxy hlásí HTTPS', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const port = Number(new URL(s.url).port);

  // Testovací stroj nemá adresu z domácí sítě, takže přepínač zapneme rovnou v datech – tenhle
  // test je o cookie, ne o otevírání naslouchání (to má vlastní testy výš).
  s.app.datastore.data.settings.lanAccess = true;
  t.after(() => { s.app.datastore.data.settings.lanAccess = false; });

  let pin = '';
  const sparuj = (hlavicky) => new Promise((resolve, reject) => {
    const telo = JSON.stringify({ pin, label: 'iPhone' });
    const req = http.request({
      host: '127.0.0.1', port, path: '/api/lan/pair', method: 'POST',
      headers: { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-Agenteeq': '1', 'Content-Length': Buffer.byteLength(telo), ...hlavicky },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, cookie: String(res.headers['set-cookie'] || '') }));
    });
    req.on('error', reject);
    req.write(telo);
    req.end();
  });

  pin = (await api(s.url).send('POST', '/api/lan/pin', {})).body.pin.code;
  const poHttp = await sparuj({});
  assert.equal(poHttp.status, 200, 'párování po http projde');
  assert.equal(/Secure/i.test(poHttp.cookie), false, 'po http se Secure nenastaví – jinak by cookie nešla poslat zpátky');
  assert.match(poHttp.cookie, /HttpOnly/);

  pin = (await api(s.url).send('POST', '/api/lan/pin', {})).body.pin.code;
  s.app.datastore.data.settings.tailscaleAccess = true;
  const poHttps = await sparuj({ 'X-Forwarded-Proto': 'https' });
  assert.equal(poHttps.status, 200, 'párování za proxy s HTTPS projde');
  assert.match(poHttps.cookie, /Secure/, 'za HTTPS proxy cookie dostane Secure');
});

test('detekce: Tailscale vrátí jméno, adresy i tailnet; HTTPS přes "serve" se pozná podle portu', async () => {
  const fileExists = (p) => p === NAINSTALOVANY_TAILSCALE;
  const run = async (cmd, args) => {
    if (String(cmd).toLowerCase().includes('tailscale') && args[0] === 'status') {
      return {
        ok: true,
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          BackendState: 'Running',
          Self: { DNSName: 'mac-mini.tailabcd.ts.net.', TailscaleIPs: ['100.101.102.103', 'fd7a:115c:a1e0::1'] },
          CurrentTailnet: { Name: 'martin@github', MagicDNSSuffix: 'tailabcd.ts.net' },
        }),
      };
    }
    if (String(cmd).toLowerCase().includes('tailscale') && args[0] === 'serve') {
      return {
        ok: true,
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          TCP: { 443: { HTTPS: true } },
          Web: { 'mac-mini.tailabcd.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:4620' } } } },
        }),
      };
    }
    return { ok: false, stdout: '', stderr: '', code: 1 };
  };
  const [ts] = await detectTunnels({ run, fileExists, fetchJson: async () => null, port: 4620 });
  assert.equal(ts.running, true);
  assert.equal(ts.dnsName, 'mac-mini.tailabcd.ts.net');
  assert.equal(ts.tailnet, 'tailabcd.ts.net');
  assert.deepEqual(ts.ips, ['100.101.102.103', 'fd7a:115c:a1e0::1']);
  assert.deepEqual(ts.serve, { running: true, unknown: false, url: 'https://mac-mini.tailabcd.ts.net/' });
});

test('detekce: "serve" pro cizí port nebo nesrozumitelný výstup se nikdy nehlásí jako zapnuté HTTPS', async () => {
  const fileExists = (p) => p === NAINSTALOVANY_TAILSCALE;
  let serveStdout = JSON.stringify({ Web: { 'mac.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:8080' } } } } });
  const run = async (cmd, args) => {
    if (args[0] === 'status') return { ok: true, code: 0, stderr: '', stdout: JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'mac.ts.net.', TailscaleIPs: ['100.64.0.5'] } }) };
    if (args[0] === 'serve') return { ok: true, code: 0, stderr: '', stdout: serveStdout };
    return { ok: false, stdout: '', stderr: '', code: 1 };
  };
  let [ts] = await detectTunnels({ run, fileExists, fetchJson: async () => null, port: 4620 });
  assert.deepEqual(ts.serve, { running: false, unknown: false }, 'proxy na cizí port není naše HTTPS');

  // Podřetězec nestačí: proxy na :46200 není naše HTTPS na :4620.
  serveStdout = JSON.stringify({ Web: { 'mac.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:46200' } } } } });
  [ts] = await detectTunnels({ run, fileExists, fetchJson: async () => null, port: 4620 });
  assert.deepEqual(ts.serve, { running: false, unknown: false }, 'port se porovnává jako port, ne jako kus textu');

  serveStdout = 'command not supported';
  [ts] = await detectTunnels({ run, fileExists, fetchJson: async () => null, port: 4620 });
  assert.equal(ts.serve.running, false);
  assert.equal(ts.serve.unknown, true, 'čemu nerozumíme, hlásíme jako neznámé – nikdy jako zapnuté');
});

test('detekce: odhlášený Tailscale se na HTTPS vůbec neptá a nic si nedomýšlí', async () => {
  const volani = [];
  const run = async (cmd, args) => {
    volani.push(args.join(' '));
    if (args[0] === 'status') return { ok: true, code: 0, stderr: '', stdout: JSON.stringify({ BackendState: 'NeedsLogin' }) };
    return { ok: false, stdout: '', stderr: '', code: 1 };
  };
  const [ts] = await detectTunnels({ run, fileExists: (p) => p === NAINSTALOVANY_TAILSCALE, fetchJson: async () => null, port: 4620 });
  assert.equal(ts.running, false);
  assert.equal(ts.dnsName, '');
  assert.deepEqual(ts.ips, []);
  assert.equal(ts.serve.unknown, true);
  assert.equal(volani.some((x) => x.startsWith('serve')), false, 'bez přihlášení nemá smysl se ptát na serve');
});
