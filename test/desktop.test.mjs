import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { startTestServer, api, tempDir, waitFor } from './helpers.mjs';
import { normalizeData } from '../src/datastore.js';

test('welcome a vzhled: bezpečné výchozí hodnoty, API persistence; desktop blocks competing LaunchAgent', async () => {
  assert.equal(normalizeData({ settings: { welcomeCompleted: 'yes' } }).settings.welcomeCompleted, false);
  assert.equal(normalizeData({ settings: { appearance: 'night' } }).settings.appearance, 'light');
  const s = await startTestServer({ AGENTEEQ_DESKTOP: '1' });
  try {
    const client = api(s.url);
    assert.equal((await client.get('/api/state')).body.settings.welcomeCompleted, false);
    assert.equal((await client.get('/api/state')).body.settings.appearance, 'light');
    assert.equal((await client.send('PUT', '/api/settings', { welcomeCompleted: true })).body.settings.welcomeCompleted, true);
    assert.equal((await client.send('PUT', '/api/settings', { appearance: 'dark' })).body.settings.appearance, 'dark');
    assert.equal((await client.send('PUT', '/api/settings', { appearance: 'system' })).body.settings.appearance, 'system');
    assert.equal((await client.send('PUT', '/api/settings', { appearance: 'night' })).status, 422);
    await s.app.datastore.flush();
    assert.equal(JSON.parse(await fs.readFile(s.app.datastore.file, 'utf8')).settings.welcomeCompleted, true);
    assert.equal(JSON.parse(await fs.readFile(s.app.datastore.file, 'utf8')).settings.appearance, 'system');
    const snapshot = (await client.get('/api/state')).body;
    assert.equal(snapshot.integrations.desktop, true);
    assert.equal(snapshot.integrations.autostart.supported, false);
    assert.equal((await s.app.autostart('install')).status, 422);
    const css = await fetch(s.url + '/fonts/fonts.css');
    assert.equal(css.status, 200);
    const font = await fetch(s.url + '/fonts/onest-400.ttf');
    assert.equal(font.headers.get('content-type'), 'font/ttf');
    assert.equal(font.headers.get('content-security-policy').includes("font-src 'self'"), true);
  } finally { await s.close(); }
});

test('desktop: owns its server, closes on parent EOF, rejects occupied ports', async () => {
  const dir = await tempDir('agenteeq-desktop-');
  const env = { ...process.env, PORT: '0', AGENTEEQ_SOURCE_HOME: dir, AGENTEEQ_HOME: dir, AGENTEEQ_PROCESSES: '0', AGENTEEQ_CLOUD: '0', AGENTEEQ_NATIVE_NOTIFY: '0', AGENTEEQ_KEYCHAIN: '0', AGENTEEQ_UCET_URL: '0', AGENTEEQ_OPEN: 'dry', AGENTEEQ_QUIET: '1', AGENTEEQ_OLLAMA_URL: 'http://127.0.0.1:9' };
  const child = spawn(process.execPath, ['desktop/server.mjs'], { env, stdio: ['pipe','pipe','pipe'] });
  let output = '';
  child.stdout.on('data', (s) => { output += s; });
  const exited = new Promise((r) => child.once('exit', r));
  try {
    const ready = await waitFor(() => output.split('\n').filter((x) => x.startsWith('AGENTEEQ_DESKTOP ')).map((x) => JSON.parse(x.slice(17))).find((x) => x.ready), 15000);
    assert.equal((await fetch(`http://127.0.0.1:${ready.port}/api/health`).then((r) => r.json())).ready, true);
    const occupiedDir = await tempDir('agenteeq-occupied-');
    const second = spawn(process.execPath, ['desktop/server.mjs'], { env: { ...env, PORT: String(ready.port), AGENTEEQ_HOME: occupiedDir }, stdio: ['pipe','pipe','pipe'] });
    let secondOutput = '';
    second.stdout.on('data', (s) => { secondOutput += s; });
    assert.equal(await new Promise((r) => second.once('exit', r)), 1);
    assert.match(secondOutput, /používá jiná aplikace/);
    child.stdin.end();
    assert.equal(await exited, 0);
    await assert.rejects(fetch(`http://127.0.0.1:${ready.port}/api/health`));
  } finally { if (child.exitCode === null) child.kill(); }
});

test('Info.plist dostane verzi z package.json – v aplikaci nikdy nesvítí stará', async () => {
  const { stampVersion } = await import('../scripts/plist-version.mjs');
  const zdroj = await fs.readFile(new URL('../desktop/Info.plist', import.meta.url), 'utf8');
  const balicek = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const out = stampVersion(zdroj, balicek.version);
  assert.match(out, new RegExp(`<key>CFBundleShortVersionString</key><string>${balicek.version.replace(/\./g, '\\.')}</string>`));
  assert.match(out, new RegExp(`<key>CFBundleVersion</key><string>${balicek.version.replace(/\./g, '\\.')}</string>`));
  // Zbytek souboru zůstane nedotčený.
  assert.ok(out.includes('<string>cz.agenteeq.desktop</string>'));
  assert.throws(() => stampVersion(zdroj, 'nesmysl'), /nemá tvar/);
});

test('okno O aplikaci si verzi bere z balíčku, ne z natvrdo psaného čísla', async () => {
  const swift = await fs.readFile(new URL('../desktop/Agenteeq.swift', import.meta.url), 'utf8');
  assert.ok(swift.includes('CFBundleShortVersionString'), 'verze se čte z Info.plist');
  assert.doesNotMatch(swift, /applicationVersion:\s*"\d/, 'žádná verze natvrdo ve zdrojáku');
});

test('plášť pro Mac ukazuje od spuštění značkovou načítací scénu, ne prostý text', async () => {
  const swift = await fs.readFile(new URL('../desktop/Agenteeq.swift', import.meta.url), 'utf8');
  const stranka = await fs.readFile(new URL('../public/nacitani.html', import.meta.url), 'utf8');
  const skript = await fs.readFile(new URL('../public/js/nacitani.js', import.meta.url), 'utf8');
  const { loaderHtml } = await import('../public/js/loader.js');

  // Okno načte scénu ze souboru v balíčku hned při stavbě, ještě před startem serveru.
  assert.match(swift, /appendingPathComponent\("app\/public\/nacitani\.html"\)/);
  assert.match(swift, /loaderWeb\.loadFileURL\(page, allowingReadAccessTo:/);
  // Scéna zmizí až s hotovým rozhraním (zpráva ready), pohled scény nesmí jinam než na svůj soubor.
  assert.match(swift, /type == "ready" \{ hideLoading\(\)/);
  assert.match(swift, /if webView === loaderWeb \{\s*decisionHandler\(action\.request\.url\?\.standardizedFileURL == loaderURL\?\.standardizedFileURL \? \.allow : \.cancel\)/);
  // Texty stavu jdou jen přes setLoading, aby stránka i záloha říkaly totéž.
  assert.doesNotMatch(swift, /statusLabel\.stringValue = (?!text)/);

  // Animace je stejná jako v rozhraní: scéna ve stránce se shoduje s loaderHtml().
  const scena = (html) => html.match(/<div class="loader-scene"[\s\S]*?<span class="loader-stage-line"><\/span>/)[0].replace(/\s+</g, '<').replace(/>\s+/g, '>');
  assert.equal(scena(stranka), scena(loaderHtml('x')));
  // Stránka ze souboru nic nenačítá ze sítě a hlášku vkládá jako text.
  assert.doesNotMatch(stranka, /(src|href)="(https?:)?\/\//);
  assert.match(skript, /text\.textContent = stav\.text/);
  assert.doesNotMatch(skript, /innerHTML/);
});

test('plášť pro Windows ukazuje stejnou načítací scénu jako Mac', async () => {
  const cpp = await fs.readFile(new URL('../desktop/windows/Agenteeq.cpp', import.meta.url), 'utf8');
  const skript = await fs.readFile(new URL('../public/js/nacitani.js', import.meta.url), 'utf8');
  // Scéna ze souboru v balíčku; adresu skládá UrlCreateFromPathW, aby prošla i „Design & Web“.
  assert.match(cpp, /slozkaAplikace\(\) \+ L"\\\\app\\\\public\\\\nacitani\.html"/);
  assert.match(cpp, /UrlCreateFromPathW\(scena\.c_str\(\)/);
  // Okno smí otevřít jen tenhle soubor, zprávy z něj přijímá a „Zkusit znovu“ spustí server.
  assert.match(cpp, /if \(!nacitani_\.empty\(\) && jeNacitaciScena\(adresa\)\) return S_OK;/);
  assert.match(cpp, /\|\| jeNacitaciScena\(odkud\);/);
  assert.match(cpp, /druh == L"retry" \|\| druh == L"znovu"/);
  // Text jde do stránky jako řetězec JS (escapovaný), stránka ho vloží jako textContent.
  assert.match(cpp, /window\.agenteeqNacitani\(\{text:'" \+ escapujProJs\(stavText_\)/);
  assert.match(skript, /messageHandlers\?\.nacitani \|\| window\.webkit\?\.messageHandlers\?\.agenteeq/);
  // Záložní prostá stránka má tlačítko jako kapsli, ne s natvrdo zaoblenými rohy.
  assert.match(cpp, /border-radius: 9999px;/);
  assert.doesNotMatch(cpp, /border-radius: 8px;/);
});
