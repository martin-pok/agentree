import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { startTestServer } from './helpers.mjs';
import { hookCommand, statuslineCommand } from '../src/hooks-installer.js';

test('Windows capabilities retain web opening and launching without native application launch', async t => {
  const s = await startTestServer(); t.after(() => s.close());
  Object.assign(s.app.config, { openApps: false, launchAgents: false });
  const web = s.app.store.ensure({ connector: 'web', localId: 'regression', provider: 'openai', app: 'ChatGPT' });
  web.url = 'https://chatgpt.com/c/fixture'; web.source = 'web';
  web.lastAt = Date.now(); s.app.store.commit(web);
  assert.equal((await s.app.openSession(web.id, 'app')).ok, true);
  assert.equal((await s.app.launch({ agent: 'chatgpt', mode: 'web', prompt: 'Test' })).ok, true);
  s.app.config.openMode = 'off';
  assert.equal((await s.app.openSession(web.id, 'app')).status, 422);
  assert.equal((await s.app.launch({ agent: 'chatgpt', mode: 'web', prompt: 'Test' })).status, 422);
});

test('Windows encoded hook delivers UTF-8 and succeeds when server is offline', { skip: process.platform !== 'win32' }, async t => {
  const received = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk.toString('utf8');
    received.push({ path: req.url, body, token: req.headers['x-agenteeq-token'] });
    res.end('Připojeno');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const port = server.address().port;
  const token = 'd'.repeat(40);
  const payload = JSON.stringify({ text: 'Příliš žluťoučký kůň 🐎' });
  const run = command => new Promise((resolve, reject) => {
    const [exe, ...args] = command.split(' ');
    const child = spawn(exe, args, { windowsHide: true });
    let output = ''; child.stdout.on('data', b => { output += b.toString('utf8'); });
    child.on('error', reject); child.on('close', code => resolve({ code, output }));
    child.stdin.end(payload);
  });
  assert.equal((await run(hookCommand(port, token, { windows: true }))).code, 0);
  const status = await run(statuslineCommand(port, token, { windows: true }));
  assert.equal(status.code, 0); assert.match(status.output, /Připojeno/);
  assert.equal(received.length, 2);
  for (const req of received) { assert.deepEqual(JSON.parse(req.body), JSON.parse(payload)); assert.equal(req.token, token); }
  await new Promise(r => server.close(r));
  const offline = await run(statuslineCommand(port, token, { windows: true }));
  assert.equal(offline.code, 0); assert.match(offline.output, /Agenteeq nebezi/);
  assert.equal((await run(hookCommand(port, token, { windows: true }))).code, 0);
});

// Most pláště pro Windows (desktop/windows/Agenteeq.cpp) běží přes AddScriptToExecuteOnDocumentCreated,
// tedy dřív, než parser vytvoří <html>. Kdyby na document.documentElement sáhl hned, spadne na prvním
// řádku: rozhraní pak neví, že běží v aplikaci, a plášť od něj nedostane jedinou zprávu (ready,
// vzhled). Test ho pustí přesně v téhle situaci.
function skriptMostu(zdroj) {
  const blok = zdroj.slice(zdroj.indexOf('SKRIPT_MOSTU ='));
  const konec = blok.search(/";\s*\n/);
  return [...blok.slice(0, konec + 2).matchAll(/L"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join('');
}

function prostredi({ sKorenem }) {
  const tridy = new Set();
  const koren = { classList: { add: (...t) => t.forEach((x) => tridy.add(x)), contains: (t) => tridy.has(t) } };
  const pozorovatele = [];
  class MutationObserver {
    constructor(fn) { this.fn = fn; this.odpojeny = false; pozorovatele.push(this); }
    observe(cil, volby) { this.cil = cil; this.volby = volby; }
    disconnect() { this.odpojeny = true; }
  }
  const zpravy = [];
  const document = { documentElement: sKorenem ? koren : null };
  const g = { document, MutationObserver, chrome: { webview: { postMessage: (m) => zpravy.push(m) } } };
  g.window = g;
  return { g, document, koren, tridy, pozorovatele, zpravy };
}

test('Windows: most pláště přežije start dokumentu bez <html> a třídy doplní, jakmile vznikne', async () => {
  const vm = await import('node:vm');
  const fs = await import('node:fs/promises');
  const skript = skriptMostu(await fs.readFile(new URL('../desktop/windows/Agenteeq.cpp', import.meta.url), 'utf8'));
  assert.match(skript, /agenteeqDesktop/, 'skript mostu se z Agenteeq.cpp nepodařilo vyčíst');

  const p = prostredi({ sKorenem: false });
  assert.doesNotThrow(() => vm.runInNewContext(skript, p.g), 'most nesmí spadnout, když document.documentElement ještě neexistuje');
  assert.equal(p.g.agenteeqDesktop, true, 'rozhraní musí hned při startu vědět, že běží v aplikaci');
  p.g.webkit.messageHandlers.agenteeq.postMessage({ type: 'ready' });
  assert.deepEqual(p.zpravy, [{ type: 'ready' }], 'zpráva z rozhraní musí dojít do chrome.webview');
  assert.equal(p.tridy.size, 0);
  assert.equal(p.pozorovatele.length, 1, 'na <html> se čeká přes MutationObserver');
  assert.equal(p.pozorovatele[0].cil, p.document);
  assert.equal(p.pozorovatele[0].volby.childList, true);

  p.document.documentElement = p.koren;
  p.pozorovatele[0].fn([], p.pozorovatele[0]);
  assert.ok(p.tridy.has('is-desktop') && p.tridy.has('is-windows'), 'po vzniku <html> dostane třídy pláště');
  assert.equal(p.pozorovatele[0].odpojeny, true, 'pozorovatel se po označení odpojí');

  // Dokument, který <html> už má (stránka pláště z NavigateToString, pozdější navigace).
  const hned = prostredi({ sKorenem: true });
  vm.runInNewContext(skript, hned.g);
  assert.ok(hned.tridy.has('is-desktop') && hned.tridy.has('is-windows'));
  assert.equal(hned.pozorovatele.length, 0);
});
