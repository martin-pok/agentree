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

// Build pro Windows dřív četl verzi z Agenteeq.exe až po smazání složky buildu a chybu tiše
// nahradil verzí z package.json. CI pak vypsalo „Cannot find path …\Agenteeq.exe“ a hned pod
// tím „Verze pláště: 0.29.0“ (běh 36351816717). Rozhodování je čistá funkce, takže se ověří
// na Linuxu s podvrženým výstupem PowerShellu.
test('Windows build: verze pláště, kterou se nepodařilo zjistit, se nehlásí jako zjištěná', async () => {
  const { overitVerziPlaste, zjistitVerziPlaste, prikazVerzePlaste } = await import('../scripts/exe-version.mjs');

  // Přesně stav z CI: soubor neexistuje, PowerShell skončí chybou a nic nevypíše.
  const ci = {
    status: 1, stdout: '',
    stderr: "Get-Item : Cannot find path 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\agenteeq-win-build-x\\Agenteeq\\Agenteeq.exe' because it does not exist.\r\nAt line:1 char:1\r\n",
  };
  assert.throws(() => overitVerziPlaste(ci, '0.29.0'), (e) => /nepodařilo zjistit/.test(e.message) && /Cannot find path/.test(e.message));

  assert.throws(() => overitVerziPlaste({ status: 0, stdout: '\r\n', stderr: '' }, '0.29.0'), /nepodařilo zjistit: Agenteeq\.exe nevrátil FileVersion/, 'prázdný výstup není verze');
  assert.throws(() => overitVerziPlaste({ error: Object.assign(new Error('spawnSync powershell.exe ENOENT'), { code: 'ENOENT' }), status: null, stdout: null, stderr: null }, '0.29.0'), /nepodařilo zjistit: PowerShell nešel spustit/);
  assert.throws(() => overitVerziPlaste({ status: null, stdout: '', stderr: '' }, '0.29.0'), /nepodařilo zjistit: PowerShell skončil bez kódu/);
  assert.throws(() => overitVerziPlaste(undefined, '0.29.0'), /nepodařilo zjistit/);

  // Přečtená, ale jiná verze je nesoulad, ne „nepodařilo se zjistit“ – a build taky zastaví.
  assert.throws(() => overitVerziPlaste({ status: 0, stdout: '0.28.0\r\n', stderr: '' }, '0.29.0'),
    (e) => /verzi 0\.28\.0, package\.json 0\.29\.0/.test(e.message) && !/nepodařilo zjistit/.test(e.message));
  assert.throws(() => overitVerziPlaste({ status: 0, stdout: '0.29.0.0', stderr: '' }, '0.29.0'), /0\.29\.0\.0/, 'razítko nese přesně verzi z package.json');

  assert.equal(overitVerziPlaste({ status: 0, stdout: '0.29.0\r\n', stderr: '' }, '0.29.0'), '0.29.0');

  // Cesta jde do PowerShellu proměnnou prostředí, ne vepsaná do příkazu, který by ji rozebral podruhé.
  const exe = "C:\\Users\\O'Brien\\Design & Web\\Agenteeq\\Agenteeq.exe";
  const { prikaz, argumenty, prostredi } = prikazVerzePlaste(exe);
  assert.equal(prikaz, 'powershell.exe');
  assert.ok(argumenty.every((a) => !a.includes('Design & Web')), 'cesta nesmí být součástí textu příkazu');
  assert.match(argumenty.at(-1), /\$ErrorActionPreference = 'Stop'/, 'chybějící soubor musí skončit chybou, ne prázdnou verzí');
  assert.match(argumenty.at(-1), /Get-Item -LiteralPath \$env:AGENTEEQ_PLAST_EXE/);
  assert.deepEqual(prostredi, { AGENTEEQ_PLAST_EXE: exe });

  // Složení: spustí se příkaz s cestou v prostředí a výsledek jde přes stejné rozhodnutí.
  const volani = [];
  const spust = (p, a, o) => { volani.push({ p, a, env: o.env }); return ci; };
  assert.throws(() => zjistitVerziPlaste(exe, '0.29.0', { spust }), /nepodařilo zjistit/);
  assert.equal(volani.length, 1);
  assert.equal(volani[0].env.AGENTEEQ_PLAST_EXE, exe);
  assert.equal(zjistitVerziPlaste(exe, '0.29.0', { spust: () => ({ status: 0, stdout: '0.29.0\r\n', stderr: '' }) }), '0.29.0');

  // A samotný build: verze se ověří dřív, než vznikne archiv a než se smaže složka buildu,
  // a žádná tichá záloha na verzi z package.json.
  const build = await (await import('node:fs/promises')).readFile(new URL('../scripts/build-windows.mjs', import.meta.url), 'utf8');
  const overeni = build.indexOf('zjistitVerziPlaste(path.join(balik, \'Agenteeq.exe\'), version)');
  assert.ok(overeni > 0, 'build musí verzi pláště ověřit');
  assert.ok(overeni < build.indexOf('Compress-Archive'), 'ověřit před archivem');
  assert.ok(overeni < build.indexOf('fs.rm(build'), 'ověřit dřív, než se složka buildu smaže');
  assert.doesNotMatch(build, /\|\|\s*version\s*\}/, 'selhání čtení se nesmí nahradit verzí z package.json');
  assert.match(build, /catch \(chyba\) \{[\s\S]{0,300}process\.exit\(1\)/, 'při chybě build končí');
});
