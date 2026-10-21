import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRozhodnuti, vystupRozhodnuti, podrobnost, pravidloZNavrhu } from '../src/rozhodnuti.js';
import { claudeSettingsPath, rozhodnutiCommand } from '../src/hooks-installer.js';
import { startTestServer, api, openStream, waitFor } from './helpers.mjs';

// Rozhodnutí agenta v Agenteeq (src/rozhodnuti.js). Pravidlo: bez kliknutí se nic nepovolí ani
// nezamítne – každá jiná cesta (okno není vidět, vypnuto, vypršelo, Agenteeq neběží) vrátí hooku
// prázdný výstup a Claude Code se zeptá v terminálu.

const SID = 'aaaaaaaa-1111-4111-8111-000000000001';
const zadost = (extra = {}) => ({ session_id: SID, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf node_modules && npm ci', description: 'Přeinstalovat balíčky' }, cwd: '/Users/jan/Design & Web', ...extra });

test('rozhodnutí: povolit a zamítnout dají přesný výstup hooku, jen jednou', async () => {
  const udalosti = [];
  const r = createRozhodnuti({ videt: () => true, emit: (l) => udalosti.push(l) });
  const p = r.zadost(zadost());
  const [z] = r.seznam();
  assert.equal(z.podrobnost, 'rm -rf node_modules && npm ci', 'schvaluje se celý příkaz');
  assert.equal(z.cwd, '/Users/jan/Design & Web');
  assert.deepEqual(r.rozhodni(z.id, 'povolit'), { ok: true });
  assert.deepEqual(await p, { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
  assert.equal(r.rozhodni(z.id, 'zamitnout').status, 410, 'druhé rozhodnutí už nic nezmění');
  assert.deepEqual(r.seznam(), []);
  assert.ok(udalosti.length >= 2);

  const q = r.zadost(zadost());
  assert.equal(r.rozhodni(r.seznam()[0].id, 'smazat').status, 400);
  r.rozhodni(r.seznam()[0].id, 'zamitnout');
  const d = (await q).hookSpecificOutput.decision;
  assert.equal(d.behavior, 'deny');
  assert.ok(d.message && !d.interrupt, 'zamítnutí agenta nezastaví, jen mu řekne proč');
  assert.deepEqual(vystupRozhodnuti('povolit').hookSpecificOutput.decision, { behavior: 'allow' });
});

test('rozhodnutí: bez okna, vypnuté, vypršelé nebo vyřízené = žádné rozhodnutí (terminál)', async () => {
  assert.equal(await createRozhodnuti({ videt: () => false }).zadost(zadost()), null, 'okno není vidět → hned terminál');
  assert.equal(await createRozhodnuti({ videt: () => true, zapnuto: () => false }).zadost(zadost()), null);
  assert.equal(await createRozhodnuti({ videt: () => true }).zadost(zadost({ session_id: '../x' })), null);
  assert.equal(await createRozhodnuti({ videt: () => true }).zadost(zadost({ hook_event_name: 'PreToolUse' })), null);
  const kratke = createRozhodnuti({ videt: () => true, cekatMs: 30 });
  assert.equal(await kratke.zadost(zadost()), null, 'po vypršení nic, Claude Code se zeptá sám');
  assert.deepEqual(kratke.seznam(), []);
  const r = createRozhodnuti({ videt: () => true });
  const p = r.zadost(zadost());
  r.vyrizeno(SID);
  assert.equal(await p, null);
  const s = r.zadost(zadost());
  r.stop();
  assert.equal(await s, null);
});

test('rozhodnutí: podrobnost je celá akce, ne zkratka', () => {
  assert.equal(podrobnost('Edit', { file_path: '/a/b/c.js' }), '/a/b/c.js');
  assert.equal(podrobnost('WebFetch', { url: 'https://example.com/x' }), 'https://example.com/x');
  assert.equal(podrobnost('mcp__x__y', { a: 1 }), '');
});

const NAVRH = [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm run build:*' }], behavior: 'allow', destination: 'localSettings' }];

test('rozhodnutí: „Povolit a příště se neptat“ vrátí přesně pravidlo, které navrhl Claude Code', async () => {
  const r = createRozhodnuti({ videt: () => true });
  const p = r.zadost(zadost({ permission_suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }, ...NAVRH] }));
  const [z] = r.seznam();
  assert.deepEqual(z.pravidlo, { text: 'Bash(npm run build:*)', kde: 'localSettings' });
  assert.deepEqual(r.rozhodni(z.id, 'povolit-vzdy'), { ok: true });
  assert.deepEqual((await p).hookSpecificOutput.decision, { behavior: 'allow', updatedPermissions: NAVRH });

  // Bez návrhu žádné trvalé pravidlo – Agenteeq si ho nevymýšlí.
  const q = r.zadost(zadost());
  const [bez] = r.seznam();
  assert.equal(bez.pravidlo, null);
  assert.equal(r.rozhodni(bez.id, 'povolit-vzdy').status, 400);
  r.rozhodni(bez.id, 'povolit');
  assert.deepEqual((await q).hookSpecificOutput.decision, { behavior: 'allow' });
});

test('rozhodnutí: z návrhů se bere jen povolení s pravidly a známým místem, nic se nepřidá', () => {
  assert.equal(pravidloZNavrhu(null), null);
  assert.equal(pravidloZNavrhu([{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'deny', destination: 'session' }]), null);
  assert.equal(pravidloZNavrhu([{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: '/etc' }]), null);
  assert.equal(pravidloZNavrhu([{ type: 'addRules', rules: [], behavior: 'allow', destination: 'session' }]), null);
  assert.deepEqual(pravidloZNavrhu([{ type: 'addRules', rules: [{ toolName: 'Read', extra: 'x' }], behavior: 'allow', destination: 'session', navic: 1 }]),
    { type: 'addRules', rules: [{ toolName: 'Read' }], behavior: 'allow', destination: 'session' });
});

test('rozhodnutí: karta zmizí, jakmile se rozhodlo jinde nebo hook skončil', async () => {
  const r = createRozhodnuti({ videt: () => true });
  // Doběhl nástroj, o který šlo (odpověď v terminálu).
  const a = r.zadost(zadost(), { toolUseId: 'toolu_1' });
  r.pokracoval(SID, 'PostToolUse', 'toolu_jiny');
  assert.equal(r.seznam().length, 1, 'souběžný nástroj žádost neruší');
  r.pokracoval(SID, 'PostToolUse', 'toolu_1');
  assert.equal(await a, null);
  // Začal jiný nástroj (zamítnuto v terminálu).
  let t = 1000;
  const r2 = createRozhodnuti({ videt: () => true, now: () => t });
  const b = r2.zadost(zadost(), { toolUseId: 'toolu_1' });
  t += 10;
  r2.pokracoval(SID, 'PreToolUse', 'toolu_2');
  assert.equal(await b, null);
  // Claude Code hook ukončil.
  const ac = new AbortController();
  const c = r.zadost(zadost(), { signal: ac.signal });
  ac.abort();
  assert.equal(await c, null);
  assert.deepEqual(r.seznam(), []);
  assert.equal(await r.zadost(zadost(), { signal: ac.signal }), null, 'už ukončený hook se neukáže');
  // Konec tahu.
  const d = r.zadost(zadost());
  r.pokracoval(SID, 'Stop');
  assert.equal(await d, null);
});

const sh = (command, stdin) => new Promise((resolve, reject) => {
  const child = spawn('sh', ['-c', command]);
  let stdout = '';
  child.stdout.on('data', (b) => { stdout += b.toString('utf8'); });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, stdout }));
  child.stdin.end(stdin);
});

test('rozhodnutí: skutečný hook přes curl – povolení z okna dojde do Claude Code, jinak prázdný výstup', { skip: process.platform === 'win32' && 'jen POSIX: spouští příkaz přes sh -c' }, async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  assert.equal((await a.send('POST', '/api/integrations/claude-hooks/install')).status, 200);
  const json = JSON.parse(await fs.readFile(claudeSettingsPath(srv.sourceHome), 'utf8'));
  const hook = json.hooks.PermissionRequest[0].hooks[0].command;
  assert.equal(json.hooks.PermissionRequest[0].matcher, '*');
  assert.ok(hook.includes('/api/hooks/claude-code/povoleni') && hook.startsWith('curl -sf '));

  // Okno není vidět: hook hned skončí bez výstupu → dotaz v terminálu.
  const t0 = Date.now();
  assert.deepEqual(await sh(hook, JSON.stringify(zadost())), { code: 0, stdout: '' });
  assert.ok(Date.now() - t0 < 5000, 'bez okna se nečeká');

  // Okno je vidět: žádost se objeví v rozhraní a „Povolit“ ji vrátí hooku.
  assert.equal((await a.send('POST', '/api/ui/pritomnost', { videt: true })).status, 200);
  const proud = await openStream(srv.url);
  t.after(() => proud.close());
  const beh = sh(hook, JSON.stringify(zadost()));
  const ev = await waitFor(() => proud.events.find((e) => e.event === 'rozhodnuti' && e.data.length), 5000);
  const z = ev.data[0];
  assert.equal(z.podrobnost, 'rm -rf node_modules && npm ci');
  assert.equal(srv.app.store.summary(`claude-code:${SID}`)?.pending?.kind, 'permission', 'agent potřebuje tebe hned, ne až po 6 s');
  // Telefon rozhodovat nesmí.
  const zTelefonu = await fetch(`${srv.url}/api/rozhodnuti/${z.id}/povolit`, { method: 'POST', headers: { 'X-Agenteeq': '1', 'X-Forwarded-For': '100.64.0.9' } });
  assert.equal(zTelefonu.status, 403);
  assert.equal((await a.send('POST', `/api/rozhodnuti/${z.id}/povolit`, {})).status, 200);
  const vysledek = await beh;
  assert.equal(vysledek.code, 0);
  assert.deepEqual(JSON.parse(vysledek.stdout).hookSpecificOutput.decision, { behavior: 'allow' });

  // Claude Code hook ukončí i s curl (vyprší mu čas): karta v Agenteeq zmizí, nečeká dál.
  const ukonceny = spawn('sh', ['-c', hook], { detached: true });
  ukonceny.stdin.end(JSON.stringify(zadost({ session_id: 'aaaaaaaa-1111-4111-8111-000000000009' })));
  await waitFor(() => srv.app.rozhodnuti.seznam().length === 1, 5000);
  process.kill(-ukonceny.pid, 'SIGKILL');
  await waitFor(() => srv.app.rozhodnuti.seznam().length === 0, 5000);

  // Vypnuto v Nastavení: zpátky jen terminál.
  await a.send('PUT', '/api/settings', { notifications: { rozhodnuti: false } });
  assert.deepEqual(await sh(hook, JSON.stringify(zadost())), { code: 0, stdout: '' });

  // Neběžící Agenteeq: curl selže, hook mlčí a skončí úspěšně.
  await srv.close();
  assert.deepEqual(await sh(hook, JSON.stringify(zadost())), { code: 0, stdout: '' });
});

test('rozhodnutí: příkaz hooku nese cestu k hlavičkám bezpečně a na Windows jen vypíše odpověď při úspěchu', () => {
  const posix = rozhodnutiCommand(4620, "/Users/Jan Novák/Design & Web/it's/claude-hooky-hlavicky", { windows: false });
  assert.match(posix, /-H @'\/Users\/Jan Novák\/Design & Web\/it'\\''s\/claude-hooky-hlavicky'/);
  const win = rozhodnutiCommand(4620, 'C:\\Users\\Jan\\.agenteeq\\claude-hooky-hlavicky', { windows: true });
  const script = Buffer.from(win.split(' ').pop(), 'base64').toString('utf16le');
  assert.ok(script.includes('curl.exe -sf -m 55'));
  assert.ok(script.includes('if ($LASTEXITCODE -eq 0) { $reply }'));
  assert.ok(script.endsWith('exit 0'));
});
