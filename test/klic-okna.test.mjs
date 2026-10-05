import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tempDir, waitFor } from './helpers.mjs';
import { novyKlic, adresaSKlicem, ulozKlic, nactiKlic, smazKlic } from '../src/klic-okna.js';

// Klíč okna mimo desktopovou aplikaci na Macu: spuštění z Terminálu (bin/agenteeq.mjs) a plášť pro
// Windows. Bez klíče server jinému programu na počítači nevydá rozhraní ani data (docs/SECURITY.md).

const root = path.resolve(import.meta.dirname, '..');

test('klíč okna: náhodný, v souboru jen pro vlastníka, smaže se jen vlastní', async () => {
  const a = novyKlic();
  assert.match(a, /^[\w-]{43}$/);
  assert.notEqual(a, novyKlic());
  assert.equal(adresaSKlicem('http://127.0.0.1:4620', a), `http://127.0.0.1:4620/?k=${a}`);
  assert.equal(adresaSKlicem('http://127.0.0.1:4620', ''), 'http://127.0.0.1:4620');
  const dir = await tempDir('agenteeq-klic-');
  const soubor = await ulozKlic(dir, a);
  if (process.platform !== 'win32') assert.equal((await fs.stat(soubor)).mode & 0o777, 0o600);
  assert.equal(await nactiKlic(dir), a);
  await smazKlic(dir, 'jiny-klic-jineho-behu-0123456789abcdef');
  assert.equal(await nactiKlic(dir), a, 'cizí běh soubor nesmaže');
  await smazKlic(dir, a);
  assert.equal(await nactiKlic(dir), '');
  assert.equal(await ulozKlic(dir, 'kratky'), null);
});

test('CLI: bez klíče nic, odkaz s klíčem nastaví cookie HttpOnly; SameSite=Strict, hooky dál bez klíče', async (t) => {
  const dir = await tempDir('agenteeq-cli-klic-');
  const env = { ...process.env, PORT: '0', AGENTEEQ_SOURCE_HOME: dir, AGENTEEQ_HOME: dir, AGENTEEQ_PROCESSES: '0', AGENTEEQ_CLOUD: '0', AGENTEEQ_NATIVE_NOTIFY: '0', AGENTEEQ_KEYCHAIN: '0', AGENTEEQ_UCET_URL: '0', AGENTEEQ_OPEN: 'dry', AGENTEEQ_OLLAMA_URL: 'http://127.0.0.1:9' };
  delete env.AGENTEEQ_LOCAL_KEY;
  const child = spawn(process.execPath, [path.join(root, 'bin/agenteeq.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const konec = new Promise((r) => child.once('exit', r));
  t.after(async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await konec; } });
  const url = await waitFor(() => out.match(/běží na (http:\/\/127\.0\.0\.1:\d+)/)?.[1], 15000);
  const klic = await waitFor(() => nactiKlic(dir), 5000);
  assert.match(klic, /^[\w-]{43}$/);
  assert.equal(out.includes(klic), false, 'mimo terminál (log LaunchAgentu) se klíč nevypisuje');

  assert.equal((await fetch(`${url}/api/state`)).status, 403);
  assert.equal((await fetch(`${url}/`)).status, 403);
  const zdravi = await (await fetch(`${url}/api/health`)).json();
  assert.equal(zdravi.keyed, true);
  const vstup = await fetch(`${url}/?k=${klic}`, { redirect: 'manual' });
  assert.equal(vstup.status, 302);
  assert.equal(vstup.headers.get('location'), '/');
  const cookie = vstup.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal((await fetch(`${url}/api/state`, { headers: { Cookie: cookie.split(';')[0] } })).status, 200);
  // Hooky a rozšíření mají vlastní tajemství – klíč okna se jich netýká (dostanou 401 za token, ne 403 za klíč).
  assert.equal((await fetch(`${url}/api/hooks/claude-code`, { method: 'POST', body: '{}' })).status, 401);

  // Ukončení klíč z disku uklidí.
  child.kill('SIGTERM');
  await konec;
  assert.equal(await nactiKlic(dir), '');
});

test('plášť pro Windows: vlastní klíč okna, předaný serveru i oknu, nikdy do hlášení QA', async () => {
  const cpp = await fs.readFile(path.join(root, 'desktop/windows/Agenteeq.cpp'), 'utf8');
  assert.match(cpp, /CoCreateGuid\(&g\)/);
  assert.match(cpp, /L"AGENTEEQ_LOCAL_KEY="\};/, 'zděděná proměnná se přepíše');
  assert.match(cpp, /prostredi \+= std::wstring\(L"AGENTEEQ_LOCAL_KEY="\) \+ klicOkna_;/);
  assert.match(cpp, /web_->Navigate\(\(adresa_ \+ L"\/\?k=" \+ klicOkna_\)\.c_str\(\)\);/);
  assert.match(cpp, /jsonText\(bezKlice\(adresa\)\.substr\(0, 80\)\)/);
  assert.match(cpp, /if \(klicOkna_\.empty\(\)\) \{/, 'bez klíče se server nespustí');
  // Swift verze dělá totéž (desktop/Agenteeq.swift).
  const swift = await fs.readFile(path.join(root, 'desktop/Agenteeq.swift'), 'utf8');
  assert.match(swift, /env\["AGENTEEQ_LOCAL_KEY"\] = localKey/);
});
