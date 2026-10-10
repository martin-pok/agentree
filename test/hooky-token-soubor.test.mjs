import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  installHooks, uninstallHooks, hooksStatus, hookCommand, statuslineCommand, hookHeadersPath, claudeSettingsPath,
  HOOK_EVENTS, HOOK_PATH, STATUSLINE_PATH,
} from '../src/hooks-installer.js';
import { startTestServer, tempDir, waitFor, api } from './helpers.mjs';

// Token hooků nesmí stát v příkazu (vidí ho každý místní uživatel v `ps`) ani v ~/.claude/settings.json
// (mívá 0644 a čtou ho jiné nástroje). Leží v souboru s hlavičkami 0600 v datové složce Agenteeq.

const TOKEN = 'e'.repeat(48);
const plain = (command) => (command.includes(' -EncodedCommand ')
  ? Buffer.from(command.split(' -EncodedCommand ')[1], 'base64').toString('utf16le') : command);
const nasePrikazy = (json) => [
  ...HOOK_EVENTS.flatMap((ev) => json.hooks[ev].flatMap((g) => g.hooks)).map((h) => h.command).filter((c) => plain(c).includes(HOOK_PATH)),
  json.statusLine.command,
];

// Přesně tak, jak příkazy zapisovaly verze do 0.46 (token přímo v hlavičce).
const staryPosix = (url, statusline) => (statusline
  ? `curl -s -m 1 -X POST -H 'Content-Type: application/json' -H 'X-Agenteeq-Token: ${TOKEN}' --data-binary @- ${url} 2>/dev/null || printf 'Agenteeq neběží'`
  : `curl -s -m 2 -X POST -H 'Content-Type: application/json' -H 'X-Agenteeq-Token: ${TOKEN}' --data-binary @- ${url} >/dev/null 2>&1 || true`);
const staryWindows = (url) => {
  const script = `$ErrorActionPreference = 'Stop'; $OutputEncoding = [Console]::InputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; try { $body = [Console]::In.ReadToEnd(); $reply = $body | & curl.exe -s -m 2 -X POST -H 'Content-Type: application/json' -H 'X-Agenteeq-Token: ${TOKEN}' --data-binary '@-' '${url}' 2>$null;  } catch {  }; exit 0`;
  return `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`;
};
const stareNastaveni = (windows) => ({
  model: 'opus',
  hooks: Object.fromEntries(HOOK_EVENTS.map((ev) => [ev, [
    { hooks: [{ type: 'command', command: windows ? staryWindows(`http://127.0.0.1:4620${HOOK_PATH}`) : staryPosix(`http://127.0.0.1:4620${HOOK_PATH}`), timeout: 5 }] },
    ...(ev === 'Stop' ? [{ hooks: [{ type: 'command', command: 'say hotovo' }] }] : []),
  ]])),
  statusLine: { type: 'command', command: staryPosix(`http://127.0.0.1:4620${STATUSLINE_PATH}`, true), padding: 0 },
});

function sh(command, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => { stdout += b.toString('utf8'); });
    child.stderr.on('data', (b) => { stderr += b.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

test('příkazy hooků ani stavového řádku token nenesou – v settings.json není, je jen v souboru 0600', async () => {
  const dir = await tempDir('agenteeq-hooky-');
  const file = path.join(dir, '.claude', 'settings.json');
  const headersFile = hookHeadersPath(path.join(dir, 'data'));
  await installHooks(file, { port: 4620, token: TOKEN, headersFile, now: 1 });

  const raw = await fs.readFile(file, 'utf8');
  assert.ok(!raw.includes(TOKEN), 'token není v settings.json');
  const prikazy = nasePrikazy(JSON.parse(raw));
  assert.equal(prikazy.length, HOOK_EVENTS.length + 1);
  for (const c of prikazy) {
    assert.ok(!plain(c).includes(TOKEN) && !/X-Agenteeq-Token/i.test(plain(c)), 'ani v dekódovaném příkazu');
    assert.ok(plain(c).includes(path.basename(headersFile)), 'příkaz odkazuje na soubor s hlavičkami');
  }
  // Obě podoby příkazu, bez ohledu na systém, na kterém test běží.
  // Každá podoba dostane cestu svého systému (POSIX příkaz s cestou „D:\…“ se právem odmítne).
  for (const [windows, cesta] of [[false, '/Users/eva/.agenteeq/claude-hooky-hlavicky'], [true, 'C:\\Users\\eva\\.agenteeq\\claude-hooky-hlavicky']]) {
    for (const c of [hookCommand(4620, cesta, { windows }), statuslineCommand(4620, cesta, { windows })]) {
      assert.ok(!plain(c).includes(TOKEN) && !/X-Agenteeq-Token/i.test(plain(c)));
    }
  }

  assert.equal(await fs.readFile(headersFile, 'utf8'), `Content-Type: application/json\nX-Agenteeq-Token: ${TOKEN}\n`);
  if (process.platform !== 'win32') {
    // Na Windows Node práva 0600 nenastaví (platí ACL uživatelského profilu), proto jen mimo Windows.
    assert.equal((await fs.stat(headersFile)).mode & 0o777, 0o600, 'soubor s tokenem je jen pro vlastníka');
  }
  const st = await hooksStatus(file, TOKEN, headersFile);
  assert.deepEqual([st.installed, st.current, st.inlineToken], [true, true, false]);
});

test('Windows: cesta k hlavičkám projde PowerShellem neporušená, curl.exe dostane jen ASCII jméno souboru', () => {
  const headersFile = "C:\\Users\\Jan Novák\\O'Brien’s Design & Web $env:USERNAME\\.agenteeq\\claude-hooky-hlavicky";
  for (const c of [hookCommand(4620, headersFile, { windows: true }), statuslineCommand(4620, headersFile, { windows: true })]) {
    assert.match(c, /^powershell\.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand [A-Za-z0-9+/=]+$/, 'vnější shell nemá co rozebrat');
    const script = plain(c);
    // Apostrof i typografický ’ (PowerShell ho bere za apostrof) se zdvojí; $ a & v jednoduchých uvozovkách nic nedělají.
    assert.ok(script.includes("Set-Location -LiteralPath 'C:\\Users\\Jan Novák\\O''Brien’’s Design & Web $env:USERNAME\\.agenteeq'; "));
    assert.ok(script.includes("-H '@claude-hooky-hlavicky'"));
    assert.ok(script.indexOf('ReadToEnd()') < script.indexOf('Set-Location'), 'chybějící složka skončí v catch, ne chybou');
    assert.match(script, /try \{.*Set-Location.*\} catch \{/);
  }
});

test('POSIX: hook přes sh -c s divokou cestou k datům doručí událost s platným tokenem, bez souboru mlčí', { skip: process.platform === 'win32' && 'jen POSIX: spouští příkaz přes sh -c' }, async (t) => {
  const base = await tempDir('agenteeq-hooky-');
  // Mezera, diakritika, &, apostrof, $, zpětné uvozovky, uvozovky, středník, roura i hvězdička.
  const dataHome = path.join(base, 'Jan Novák', 'Design & Web', "it's $HOME `id` \"q\" ;|*", '.agenteeq');
  await fs.mkdir(dataHome, { recursive: true });
  const srv = await startTestServer({ AGENTEEQ_HOME: dataHome });
  t.after(() => srv.close());
  const a = api(srv.url);
  assert.equal((await a.send('POST', '/api/integrations/claude-hooks/install')).body.claudeHooks.current, true);
  const headersFile = hookHeadersPath(dataHome);
  const json = JSON.parse(await fs.readFile(claudeSettingsPath(srv.sourceHome), 'utf8'));
  const hook = json.hooks.SessionStart[0].hooks[0].command;
  const radek = json.statusLine.command;
  assert.ok(hook.startsWith('curl ') && !hook.includes(srv.app.datastore.data.ingestToken));

  const sid = 'cccccccc-1111-4111-8111-000000000003';
  const r = await sh(hook, JSON.stringify({ session_id: sid, hook_event_name: 'SessionStart', cwd: '/tmp/x' }));
  assert.deepEqual(r, { code: 0, stdout: '', stderr: '' }, 'hook nic nevypíše');
  await waitFor(() => srv.app.store.summary(`claude-code:${sid}`), 4000);

  const s = await sh(radek, JSON.stringify({ session_id: sid, rate_limits: { five_hour: { used_percentage: 7, resets_at: Math.floor(Date.now() / 1000) + 3600 } } }));
  assert.equal(s.code, 0);
  assert.match(s.stdout, /^Agenteeq · .*5 h 7 %/, 'stavový řádek dostal odpověď, tedy token prošel');

  // Chybějící soubor s hlavičkami: hook mlčí jako u neběžícího Agenteeq, stavový řádek to řekne.
  await fs.rm(headersFile);
  assert.deepEqual(await sh(hook, JSON.stringify({ session_id: 'dddddddd-1111-4111-8111-000000000004', hook_event_name: 'SessionStart' })), { code: 0, stdout: '', stderr: '' });
  assert.equal(srv.app.store.summary('claude-code:dddddddd-1111-4111-8111-000000000004'), null, 'bez tokenu se nic nedoručilo');
  assert.equal((await sh(radek, '{}')).stdout, 'Agenteeq neběží');
  const st = (await a.send('POST', '/api/integrations/claude-hooks/check')).body.claudeHooks;
  assert.deepEqual([st.installed, st.current], [true, false], 'bez souboru s hlavičkami je potřeba propojení obnovit');

  // Obnova soubor zapíše znovu; odinstalace ho smaže.
  assert.equal((await a.send('POST', '/api/integrations/claude-hooks/install')).body.claudeHooks.current, true);
  assert.ok((await fs.readFile(headersFile, 'utf8')).includes(srv.app.datastore.data.ingestToken));
  await a.send('POST', '/api/integrations/claude-hooks/uninstall');
  await assert.rejects(fs.stat(headersFile), { code: 'ENOENT' }, 'odinstalace soubor s tokenem smaže');

  await srv.close();
  await fs.mkdir(dataHome, { recursive: true });
  await fs.writeFile(headersFile, `X-Agenteeq-Token: ${TOKEN}\n`);
  assert.equal((await sh(radek, '{}')).stdout, 'Agenteeq neběží', 'neběžící Agenteeq beze změny');
});

test('staré příkazy s tokenem: pořád „naše“, hlásí se k obnově, instalace je nahradí a odinstalace odebere', async () => {
  for (const windows of [false, true]) {
    const dir = await tempDir('agenteeq-hooky-');
    const file = path.join(dir, 'settings.json');
    const headersFile = hookHeadersPath(path.join(dir, 'data'));
    await fs.writeFile(file, JSON.stringify(stareNastaveni(windows), null, 2));

    const st = await hooksStatus(file, TOKEN, headersFile);
    assert.deepEqual([st.installed, st.partial, st.current, st.inlineToken, st.statusLine], [true, false, false, true, 'ours'], windows ? 'Windows' : 'POSIX');
    // Starý zápis s platným tokenem funguje: Přehled ani limity nesmí tvrdit, že propojení chybí.
    assert.equal(st.funguje, true, 'starý zápis s platným tokenem funguje');
    assert.equal((await hooksStatus(file, 'f'.repeat(48), headersFile)).funguje, false, 'starý zápis s jiným tokenem nefunguje');

    await installHooks(file, { port: 4620, token: TOKEN, headersFile, now: 1 });
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    for (const ev of HOOK_EVENTS) {
      assert.equal(json.hooks[ev].flatMap((g) => g.hooks).filter((h) => plain(h.command).includes(HOOK_PATH)).length, 1, `${ev}: starý hook nahrazen`);
    }
    assert.ok(!JSON.stringify(json).includes(TOKEN) && json.hooks.Stop.some((g) => g.hooks.some((h) => h.command === 'say hotovo')));
    const po = await hooksStatus(file, TOKEN, headersFile);
    assert.deepEqual([po.current, po.funguje, po.inlineToken], [true, true, false]);

    await fs.writeFile(file, JSON.stringify(stareNastaveni(windows), null, 2));
    await uninstallHooks(file, { headersFile, now: 2 });
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say hotovo' }] }] } });
  }
});

test('staré příkazy: Agenteeq je sám nepřepíše, zdraví propojení je bere jako zapnuté', async (t) => {
  const sourceHome = await tempDir('agenteeq-src-');
  const file = claudeSettingsPath(sourceHome);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const raw = JSON.stringify(stareNastaveni(false), null, 2);
  await fs.writeFile(file, raw);
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: sourceHome });
  t.after(() => srv.close());
  const h = (await api(srv.url).get('/api/state')).body.integrations.claudeHooks;
  // Token v starém zápisu není token tohoto serveru – takové propojení opravdu nefunguje.
  assert.deepEqual([h.installed, h.current, h.funguje, h.inlineToken], [true, false, false, true]);
  assert.ok(h.since > 0, 'propojení se počítá jako zapnuté (src/app.js#claudeHooks)');
  const check = (await api(srv.url).send('POST', '/api/integrations/claude-hooks/check')).body.claudeHooks;
  assert.equal(check.installed, true);
  assert.equal(await fs.readFile(file, 'utf8'), raw, 'settings.json beze změny – obnova jen na výslovnou akci');
  await assert.rejects(fs.stat(hookHeadersPath(srv.dataHome)), { code: 'ENOENT' });
});

test('nová instalace po změně tokenu přepíše soubor s hlavičkami', async () => {
  const dir = await tempDir('agenteeq-hooky-');
  const file = path.join(dir, 'settings.json');
  const headersFile = hookHeadersPath(path.join(dir, 'data'));
  const novy = 'f'.repeat(48);
  await installHooks(file, { port: 4620, token: TOKEN, headersFile, now: 1 });
  await fs.chmod(headersFile, 0o644);
  assert.equal((await hooksStatus(file, novy, headersFile)).current, false, 'jiný token v souboru = potřeba obnovit');

  await installHooks(file, { port: 4621, token: novy, headersFile, now: 2 });
  const obsah = await fs.readFile(headersFile, 'utf8');
  assert.ok(obsah.includes(novy) && !obsah.includes(TOKEN));
  if (process.platform !== 'win32') assert.equal((await fs.stat(headersFile)).mode & 0o777, 0o600, 'přepsaný soubor je zase jen pro vlastníka');
  assert.ok(nasePrikazy(JSON.parse(await fs.readFile(file, 'utf8'))).every((c) => plain(c).includes('127.0.0.1:4621')), 'nový port');
  assert.equal((await hooksStatus(file, novy, headersFile)).current, true);
  assert.equal((await hooksStatus(file, TOKEN, headersFile)).current, false);
});
