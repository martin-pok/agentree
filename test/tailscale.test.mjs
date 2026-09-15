import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanAccess, tailscaleAddresses, lanAddresses } from '../src/lan.js';
import { loadConfig } from '../src/config.js';
import { detectTunnels } from '../src/tunnel.js';
import { startTestServer, api } from './helpers.mjs';

// Tailscale jako plnohodnotná cesta k Agenteeq z telefonu: server smí naslouchat i na adrese,
// kterou tomuto Macu přidělil tailnet. Adresa 100.x není veřejná — dostane se na ni jen zařízení
// přihlášené do stejného tailnetu — ale i tak platí párování kódem a token (test/lan.test.mjs).

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
  assert.deepEqual(tailscaleAddresses(ROZHRANI), ['100.101.102.103'], 'IPv6 se nebere — pracujeme jen s IPv4');
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

  // Bez MagicDNS (tailnet ho nemá zapnutý) se nic nedomýšlí — spadne se na adresu 100.x.
  const bezDns = createLanAccess({ datastore, config: config(), tailscaleName: () => '', interfaces: () => ROZHRANI });
  const s = bezDns.status();
  assert.equal(s.tailscale.name, '');
  assert.deepEqual(s.tailscale.addresses, ['100.101.102.103']);
  assert.equal(s.tailscale.url, `http://100.101.102.103:${s.port}`);
  assert.equal(s.tailscale.available, true);
});

test('tailnet: hlavička Host projde jen se zapnutým přepínačem — a s ním i jméno v MagicDNS', () => {
  const datastore = fakeDatastore();
  const lan = createLanAccess({ datastore, config: config(), tailscaleName: () => 'Mac-Mini.Tailabcd.ts.net', interfaces: () => ROZHRANI });

  assert.deepEqual(lan.hosts(), [], 'vypnuto = neprojde vůbec nic mimo 127.0.0.1');

  datastore.data.settings.tailscaleAccess = true;
  const hosts = lan.hosts();
  assert.ok(hosts.includes('mac-mini.tailabcd.ts.net'), 'jméno v MagicDNS se porovnává malými písmeny');
  assert.ok(hosts.includes('100.101.102.103'), 'adresa v tailnetu projde taky');
  assert.equal(hosts.includes('192.168.1.20'), false, 'zapnutý Tailscale sám o sobě neotvírá domácí síť');
});

test('tailnet: adresa, kterou Mac nemá, skončí poctivou chybou — nikdy tichým „zapnuto“', async (t) => {
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

  // Vypnutí přepínače chybu uklidí — nezůstane viset u vypnuté cesty.
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
  assert.equal(r.status, 422, 'bez tailnetu není co zapnout');
  assert.match(r.body.error, /Tailscale/);

  const po = await api(s.url).get('/api/state');
  assert.equal(po.body.settings.tailscaleAccess, false, 'neúspěšné zapnutí nesmí nic přepnout');
  assert.equal(po.body.lan.tailscale.listening, false);

  // Vypnout jde vždy, i když zapnuté nebylo — je to idempotentní a nic neshodí.
  assert.equal((await api(s.url).send('POST', '/api/tailscale/disable', {})).status, 200);
});

test('detekce: Tailscale vrátí jméno, adresy i tailnet; HTTPS přes "serve" se pozná podle portu', async () => {
  const fileExists = (p) => p.includes('Tailscale.app');
  const run = async (cmd, args) => {
    if (String(cmd).includes('Tailscale') && args[0] === 'status') {
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
    if (String(cmd).includes('Tailscale') && args[0] === 'serve') {
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
  const fileExists = (p) => p.includes('Tailscale.app');
  let serveStdout = JSON.stringify({ Web: { 'mac.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:8080' } } } } });
  const run = async (cmd, args) => {
    if (args[0] === 'status') return { ok: true, code: 0, stderr: '', stdout: JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'mac.ts.net.', TailscaleIPs: ['100.64.0.5'] } }) };
    if (args[0] === 'serve') return { ok: true, code: 0, stderr: '', stdout: serveStdout };
    return { ok: false, stdout: '', stderr: '', code: 1 };
  };
  let [ts] = await detectTunnels({ run, fileExists, fetchJson: async () => null, port: 4620 });
  assert.deepEqual(ts.serve, { running: false, unknown: false }, 'proxy na cizí port není naše HTTPS');

  serveStdout = 'command not supported';
  [ts] = await detectTunnels({ run, fileExists, fetchJson: async () => null, port: 4620 });
  assert.equal(ts.serve.running, false);
  assert.equal(ts.serve.unknown, true, 'čemu nerozumíme, hlásíme jako neznámé — nikdy jako zapnuté');
});

test('detekce: odhlášený Tailscale se na HTTPS vůbec neptá a nic si nedomýšlí', async () => {
  const volani = [];
  const run = async (cmd, args) => {
    volani.push(args.join(' '));
    if (args[0] === 'status') return { ok: true, code: 0, stderr: '', stdout: JSON.stringify({ BackendState: 'NeedsLogin' }) };
    return { ok: false, stdout: '', stderr: '', code: 1 };
  };
  const [ts] = await detectTunnels({ run, fileExists: (p) => p.includes('Tailscale.app'), fetchJson: async () => null, port: 4620 });
  assert.equal(ts.running, false);
  assert.equal(ts.dnsName, '');
  assert.deepEqual(ts.ips, []);
  assert.equal(ts.serve.unknown, true);
  assert.equal(volani.some((x) => x.startsWith('serve')), false, 'bez přihlášení nemá smysl se ptát na serve');
});
