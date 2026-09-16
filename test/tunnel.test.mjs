import test from 'node:test';
import assert from 'node:assert/strict';
import { TUNNELS, detectTunnels, remoteAdvice, remoteUrl } from '../src/tunnel.js';
import { tailscalePaths } from '../src/platform.js';

// Cesta k Tailscale se liší systém od systému; test proto předstírá tu, kterou
// pro tenhle systém hlásí platformový šev, ne jednu konkrétní z macOS.
const NAINSTALOVANY_TAILSCALE = tailscalePaths()[0];

const noRun = async () => ({ ok: false, stdout: '', stderr: '', code: 1 });
const noFetch = async () => null;

test('katalog TUNNELS má tři nástroje se všemi povinnými poli', () => {
  assert.equal(TUNNELS.length, 3);
  assert.deepEqual(TUNNELS.map((t) => t.id), ['tailscale', 'cloudflared', 'ngrok']);
  for (const t of TUNNELS) {
    assert.ok(t.id && t.name && t.description && t.security, `chybí pole u ${t.id}`);
    assert.ok(['privatni-sit', 'verejny-tunel'].includes(t.kind), `neplatný kind u ${t.id}`);
  }
  assert.equal(TUNNELS.find((t) => t.id === 'tailscale').kind, 'privatni-sit');
  assert.equal(TUNNELS.find((t) => t.id === 'cloudflared').kind, 'verejny-tunel');
  assert.equal(TUNNELS.find((t) => t.id === 'ngrok').kind, 'verejny-tunel');
});

test('detekce: Tailscale nainstalovaný a přihlášený vrátí adresu z JSON bez tečky na konci', async () => {
  const fileExists = (p) => p === NAINSTALOVANY_TAILSCALE;
  const run = async (cmd, args) => {
    if (String(cmd).toLowerCase().includes('tailscale') && args[0] === 'status') {
      return {
        ok: true,
        stdout: JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'mac-mini.tailabcd.ts.net.', TailscaleIPs: ['100.101.102.103'] } }),
        stderr: '',
        code: 0,
      };
    }
    return { ok: false, stdout: '', stderr: '', code: 1 };
  };
  const tunnels = await detectTunnels({ run, fileExists, fetchJson: noFetch });
  const ts = tunnels.find((t) => t.id === 'tailscale');
  assert.equal(ts.installed, true);
  assert.equal(ts.running, true);
  assert.equal(ts.url, 'mac-mini.tailabcd.ts.net', 'tečka na konci DNSName se odstraní');
  assert.equal(ts.kind, 'privatni-sit');
});

test('detekce: Tailscale nainstalovaný, ale bez TailscaleIPs, spadne na DNSName; bez DNSName na IP', async () => {
  const fileExists = () => true;
  let payload;
  const run = async (cmd, args) => (args[0] === 'status' ? { ok: true, stdout: JSON.stringify(payload), stderr: '', code: 0 } : { ok: false, stdout: '', stderr: '', code: 1 });

  payload = { BackendState: 'Running', Self: { DNSName: '', TailscaleIPs: ['100.64.0.5'] } };
  let tunnels = await detectTunnels({ run, fileExists, fetchJson: noFetch });
  assert.equal(tunnels.find((t) => t.id === 'tailscale').url, '100.64.0.5', 'bez DNSName se použije IP');
});

test('detekce: Tailscale nainstalovaný, ale odhlášený (NeedsLogin) → running false a česká rada', async () => {
  const fileExists = () => true; // appka je na disku
  const run = async (cmd, args) => (args[0] === 'status' ? { ok: true, stdout: JSON.stringify({ BackendState: 'NeedsLogin' }), stderr: '', code: 0 } : { ok: false, stdout: '', stderr: '', code: 1 });
  const tunnels = await detectTunnels({ run, fileExists, fetchJson: noFetch });
  const ts = tunnels.find((t) => t.id === 'tailscale');
  assert.equal(ts.installed, true);
  assert.equal(ts.running, false);
  assert.equal(ts.url, '');
  assert.ok(ts.hint && ts.hint.length > 0, 'odhlášený stav má radu, co udělat');
  assert.match(ts.hint, /přihl/i);
});

test('detekce: Tailscale vůbec nenainstalovaný (žádná appka, "which" neuspěje)', async () => {
  const tunnels = await detectTunnels({ run: noRun, fileExists: () => false, fetchJson: noFetch });
  const ts = tunnels.find((t) => t.id === 'tailscale');
  assert.equal(ts.installed, false);
  assert.equal(ts.running, false);
  assert.equal(ts.url, '');
  assert.ok(ts.hint.length > 0);
});

test('detekce: cloudflared nainstalovaný, ale neběžící', async () => {
  const run = async (cmd, args) => {
    if (String(cmd).startsWith('which') || String(cmd).startsWith('where')) {
      return args[0] === 'cloudflared' ? { ok: true, stdout: '/usr/local/bin/cloudflared\n', stderr: '', code: 0 } : { ok: false, stdout: '', stderr: '', code: 1 };
    }
    if (cmd === 'pgrep') return { ok: false, stdout: '', stderr: '', code: 1 };
    return { ok: false, stdout: '', stderr: '', code: 1 };
  };
  const tunnels = await detectTunnels({ run, fileExists: () => false, fetchJson: noFetch });
  const cf = tunnels.find((t) => t.id === 'cloudflared');
  assert.equal(cf.installed, true);
  assert.equal(cf.running, false);
  assert.equal(cf.url, '', 'quick tunnel nemá lokální API, adresa se nevymýšlí');
});

test('detekce: cloudflared nainstalovaný a proces běží', async () => {
  const run = async (cmd, args) => {
    if (String(cmd).startsWith('which') || String(cmd).startsWith('where')) {
      return args[0] === 'cloudflared' ? { ok: true, stdout: '/usr/local/bin/cloudflared\n', stderr: '', code: 0 } : { ok: false, stdout: '', stderr: '', code: 1 };
    }
    // Běžící tunel se hledá ve výpisu procesů (stejně na všech systémech), ne přes pgrep:
    // převádět regulární výraz na vzor pro pgrep je křehké a obě cesty by se rozešly.
    if (String(cmd) === 'ps' || String(cmd).includes('powershell')) {
      return { ok: true, stdout: '4242 00:10 0.5 2048 /usr/local/bin/cloudflared tunnel --url http://127.0.0.1:4620\n', stderr: '', code: 0 };
    }
    return { ok: false, stdout: '', stderr: '', code: 1 };
  };
  const tunnels = await detectTunnels({ run, fileExists: () => false, fetchJson: noFetch });
  const cf = tunnels.find((t) => t.id === 'cloudflared');
  assert.equal(cf.installed, true);
  assert.equal(cf.running, true);
  assert.match(cf.hint, /trycloudflare/);
});

test('detekce: cloudflared vůbec nenainstalovaný', async () => {
  const tunnels = await detectTunnels({ run: noRun, fileExists: () => false, fetchJson: noFetch });
  const cf = tunnels.find((t) => t.id === 'cloudflared');
  assert.equal(cf.installed, false);
  assert.equal(cf.running, false);
});

test('detekce: ngrok běžící vrátí adresu z jeho lokálního API', async () => {
  const run = async (cmd, args) => (cmd === 'which' && args[0] === 'ngrok' ? { ok: true, stdout: '/opt/homebrew/bin/ngrok\n', stderr: '', code: 0 } : { ok: false, stdout: '', stderr: '', code: 1 });
  const fetchJson = async (url) => (url.includes('4040') ? { tunnels: [{ public_url: 'http://abc123.ngrok-free.app', proto: 'http' }, { public_url: 'https://abc123.ngrok-free.app', proto: 'https' }] } : null);
  const tunnels = await detectTunnels({ run, fileExists: () => false, fetchJson });
  const ng = tunnels.find((t) => t.id === 'ngrok');
  assert.equal(ng.installed, true);
  assert.equal(ng.running, true);
  assert.equal(ng.url, 'https://abc123.ngrok-free.app', 'preferuje se https varianta');
});

test('detekce: ngrok API neběží (odmítnuté spojení / timeout) → running false, žádná adresa', async () => {
  const run = async (cmd, args) => (cmd === 'which' && args[0] === 'ngrok' ? { ok: true, stdout: '/opt/homebrew/bin/ngrok\n', stderr: '', code: 0 } : { ok: false, stdout: '', stderr: '', code: 1 });
  const tunnels = await detectTunnels({ run, fileExists: () => false, fetchJson: noFetch });
  const ng = tunnels.find((t) => t.id === 'ngrok');
  assert.equal(ng.installed, true);
  assert.equal(ng.running, false);
  assert.equal(ng.url, '');
});

test('detekce: žádný nástroj nenalezen → vše prázdné/false a doporučení instalovat Tailscale', async () => {
  const tunnels = await detectTunnels({ run: noRun, fileExists: () => false, fetchJson: noFetch });
  for (const t of tunnels) {
    assert.equal(t.installed, false, t.id);
    assert.equal(t.running, false, t.id);
    assert.equal(t.url, '', t.id);
  }
  const advice = remoteAdvice(tunnels);
  assert.equal(advice.doporuceni, 'zadny');
  assert.ok(advice.text.length > 0);
  assert.ok(advice.kroky.length > 0);
  assert.match(advice.kroky.join(' '), /Tailscale/);
});

test('remoteAdvice: Tailscale nainstalovaný má vždy přednost před cloudflared', () => {
  const tunnels = [
    { id: 'tailscale', installed: true, running: false },
    { id: 'cloudflared', installed: true, running: true },
  ];
  const advice = remoteAdvice(tunnels);
  assert.equal(advice.doporuceni, 'tailscale');
  assert.ok(advice.kroky.length > 0);
});

test('remoteAdvice: bez Tailscale, ale s cloudflared → doporučí cloudflared s upozorněním na veřejnou adresu', () => {
  const tunnels = [
    { id: 'tailscale', installed: false, running: false },
    { id: 'cloudflared', installed: true, running: false },
  ];
  const advice = remoteAdvice(tunnels);
  assert.equal(advice.doporuceni, 'cloudflared');
  assert.match(advice.text, /veřejn/i);
});

test('detekce: chybný, padající nebo nesmyslný "run" nikdy nevyhodí výjimku, jen installed: false', async () => {
  const throwingRun = () => { throw new Error('boom'); };
  const rejectingRun = async () => { throw new Error('timeout'); };
  const garbageRun = async () => 'not-an-object';

  await assert.doesNotReject(detectTunnels({ run: throwingRun, fileExists: () => false, fetchJson: async () => { throw new Error('x'); } }));
  const r1 = await detectTunnels({ run: throwingRun, fileExists: () => false, fetchJson: noFetch });
  for (const t of r1) assert.equal(t.installed, false, t.id);

  await assert.doesNotReject(detectTunnels({ run: rejectingRun, fileExists: () => { throw new Error('fs boom'); }, fetchJson: noFetch }));
  const r2 = await detectTunnels({ run: rejectingRun, fileExists: () => { throw new Error('fs boom'); }, fetchJson: noFetch });
  for (const t of r2) assert.equal(t.installed, false, t.id);

  await assert.doesNotReject(detectTunnels({ run: garbageRun, fileExists: () => false, fetchJson: async () => 'garbage' }));
  const r3 = await detectTunnels({ run: garbageRun, fileExists: () => false, fetchJson: async () => 'garbage' });
  for (const t of r3) assert.equal(t.installed, false, t.id);
});

test('remoteUrl: privátní síť dostane port, veřejné tunely už mají celou adresu', () => {
  assert.equal(remoteUrl({ kind: 'privatni-sit', url: 'mac-mini.tailabcd.ts.net' }, 4620), 'http://mac-mini.tailabcd.ts.net:4620');
  assert.equal(remoteUrl({ kind: 'privatni-sit', url: '100.64.0.5' }, 4620), 'http://100.64.0.5:4620');
  assert.equal(remoteUrl({ kind: 'verejny-tunel', url: 'https://random-name.trycloudflare.com' }, 4620), 'https://random-name.trycloudflare.com');
  assert.equal(remoteUrl({ kind: 'verejny-tunel', url: 'https://abc123.ngrok-free.app' }, 4620), 'https://abc123.ngrok-free.app');
  assert.equal(remoteUrl(null, 4620), '');
  assert.equal(remoteUrl({ kind: 'privatni-sit', url: '' }, 4620), '', 'bez adresy se nic nesestaví');
});
