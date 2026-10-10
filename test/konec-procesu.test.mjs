import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createSession, deriveStatus } from '../src/model.js';
import { createKonecProcesu, POTVRZENI } from '../src/konec-procesu.js';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { AlertEngine } from '../src/alerts.js';
import { startTestServer, api, tempDir, waitFor, writeJsonl, fakeDatastore, jenProcesy } from './helpers.mjs';

// Proces, který konverzaci vedl, skončil uprostřed tahu (Ctrl+C, zavřený Terminál, kill, pád). Přepis
// pak už nic nezapíše a bez výpisu procesů by konverzace „pracovala“ až 30 minut. Když to jde poznat
// SPOLEHLIVĚ, má do dvou výpisů přestat pracovat – s pravdivým důvodem, nikdy jako „Hotovo“. Když to
// spolehlivě poznat nejde, nesmí se změnit nic.

const SLOZKA = path.resolve('/Users/eva/Design & Web');
const DUVOD = 'Agent skončil uprostřed práce';

test('model: tah, jehož proces skončil, nepracuje, není „hotovo“ a nový zápis ho vrátí do práce', () => {
  const now = Date.now();
  const s = createSession({ connector: 'claude-code', localId: 'a', provider: 'anthropic', app: 'Claude Code' });
  Object.assign(s, { lastAt: now - 60e3, turns: 1, running: true, runningAt: now - 60e3, staleMs: 30 * 60e3, activity: 'Upravuje app.js' });
  assert.equal(deriveStatus(s, now).status, 'working');
  s.procesSkoncil = now - 5e3;
  assert.deepEqual(deriveStatus(s, now), { status: 'waiting', reason: DUVOD, stale: true, done: false });
  // Bez hooků by úprava souboru po 20 s hlásila „nejspíš čeká na povolení“ – bez procesu se nikdo neptá.
  Object.assign(s, { toolWaitSince: now - 50e3, toolWaitKind: 'uprava' });
  assert.equal(deriveStatus(s, now).status, 'waiting');
  // Agent znovu zapsal (nový proces, `claude --resume`): platí přepis.
  s.runningAt = now - 1e3;
  assert.equal(deriveStatus(s, now).status, 'needs_input');
  Object.assign(s, { toolWaitSince: 0, toolWaitKind: '' });
  assert.equal(deriveStatus(s, now).status, 'working');
  // Řádný konec tahu z přepisu nebo hooku Stop má přednost: příznak se pak neuplatní.
  s.running = false;
  assert.deepEqual(deriveStatus(s, now), { status: 'waiting', reason: 'Hotovo, čeká na další zadání', stale: false, done: true });
});

function prostredi({ behy = () => [], obnov } = {}) {
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: '/tmp/nic', AGENTEEQ_HOME: '/tmp/nic' });
  const store = new Store({ config, datastore: fakeDatastore() });
  const konec = createKonecProcesu({ store, behy, obnov });
  const now = Date.now();
  const tah = (localId, { connector = 'claude-code', app = 'Claude Code', cwd = SLOZKA } = {}) => {
    const s = store.ensure({ connector, localId, provider: connector === 'codex' ? 'openai' : 'anthropic', app: connector === 'codex' ? 'Codex' : 'Claude Code' });
    Object.assign(s, { app, cwd, turns: 1, lastAt: now - 30e3, startedAt: now - 60e3, running: true, runningAt: now - 30e3, staleMs: 30 * 60e3, activity: 'Spouští příkaz: npm test' });
    store.commit(s);
    return s;
  };
  const stav = (s) => store.summary(s.id);
  return { store, konec, tah, stav };
}

const P = (pid, cwd = SLOZKA, runtime = 'claude-code') => ({ pid, runtime, cwd, od: Date.now() - 600e3 });

test('proces skončil uprostřed tahu: do dvou výpisů už „nepracuje“, s pravdivým důvodem', async () => {
  const { konec, tah, stav } = prostredi();
  const s = tah('a');
  await konec.upravit([P(100), P(200, path.resolve('/jinde'))]);
  assert.equal(stav(s).status, 'working');
  await konec.upravit([P(200, path.resolve('/jinde'))]);
  assert.equal(stav(s).status, 'working', 'jeden výpis bez procesu ještě nestačí');
  assert.equal(POTVRZENI, 2);
  await konec.upravit([P(200, path.resolve('/jinde'))]);
  const v = stav(s);
  assert.equal(v.status, 'waiting');
  assert.equal(v.reason, DUVOD);
  assert.equal(v.done, false, 'agent nedoběhl – nikdy „Hotovo“');
  assert.equal(v.activity, '');
});

test('nepovedený výpis procesů nic nemění a přeruší potvrzování', async () => {
  const { konec, tah, stav } = prostredi();
  const s = tah('a');
  await konec.upravit([P(100)]);
  for (let i = 0; i < 4; i++) await konec.upravit(null);
  assert.equal(stav(s).status, 'working', 'nevím ≠ neběží');
  await konec.upravit([]);
  await konec.upravit(null);
  await konec.upravit([]);
  assert.equal(stav(s).status, 'working', 'mezi dvěma výpisy bez procesu byl nepovedený – nejdou po sobě');
  await konec.upravit([]);
  assert.equal(stav(s).reason, DUVOD);
});

test('dva procesy v jedné složce nebo proces bez zjištěné složky: beze změny', async () => {
  const dva = prostredi();
  const a = dva.tah('a');
  await dva.konec.upravit([P(100), P(101)]);
  for (let i = 0; i < 4; i++) await dva.konec.upravit([P(101)]);
  assert.equal(dva.stav(a).status, 'working', 've složce pořád běží Claude Code – může vést právě tuhle konverzaci');

  const bezSlozky = prostredi();
  const b = bezSlozky.tah('b');
  await bezSlozky.konec.upravit([P(100)]);
  for (let i = 0; i < 4; i++) await bezSlozky.konec.upravit([P(300, '')]);
  assert.equal(bezSlozky.stav(b).status, 'working', 'proces bez složky (lsof selhal, Windows) může vést tuhle konverzaci');

  // Proces se v její složce nikdy neukázal (jiná složka, start Agenteeq až po pádu): žádná vazba, nic.
  const nikdy = prostredi();
  const c = nikdy.tah('c');
  for (let i = 0; i < 4; i++) await nikdy.konec.upravit([P(100, path.resolve('/jinde'))]);
  for (let i = 0; i < 4; i++) await nikdy.konec.upravit([]);
  assert.equal(nikdy.stav(c).status, 'working');
});

test('jeden výpadek výpisu (proces na jeden průchod chybí) není konec', async () => {
  const { konec, tah, stav } = prostredi();
  const s = tah('a');
  for (const vypis of [[P(100)], [], [P(100)], [], [P(100)]]) await konec.upravit(vypis);
  assert.equal(stav(s).status, 'working');
});

test('běh spuštěný z Agenteeq (src/runs.js) má vlastní evidenci – jeho proces se neváže', async () => {
  const behy = [{ id: 'r1', pid: 777, status: 'running', sessionId: 'claude-code:a' }];
  const { konec, tah, stav } = prostredi({ behy: () => behy });
  const s = tah('a');
  await konec.upravit([P(777)]);
  behy[0].status = 'stopped';
  for (let i = 0; i < 4; i++) await konec.upravit([]);
  assert.equal(stav(s).status, 'working', 'konec běhu hlásí běh sám (failure), ne výpis procesů');
  assert.equal(s.procesSkoncil, 0);
});

test('řádný konec tahu v přepisu má přednost: před rozhodnutím se přepis přečte znovu', async () => {
  let s;
  const obnovene = [];
  const p = prostredi({
    obnov: async (ids) => {
      obnovene.push(...ids);
      // `claude -p` dopsal end_turn a skončil; sledování souborů to doručilo až teď.
      s.running = false;
      p.store.commit(s);
    },
  });
  const { konec, tah, stav } = p;
  s = tah('a');
  for (const vypis of [[P(100)], [], []]) await konec.upravit(vypis);
  assert.deepEqual(obnovene, ['claude-code']);
  assert.equal(s.procesSkoncil, 0);
  assert.equal(stav(s).reason, 'Hotovo, čeká na další zadání');
});

test('nový tah po konci procesu zase pracuje a sleduje se znovu', async () => {
  const { store, konec, tah, stav } = prostredi();
  const s = tah('a');
  for (const vypis of [[P(100)], [], []]) await konec.upravit(vypis);
  assert.equal(stav(s).reason, DUVOD);
  // `claude --continue` v nové instanci: nový zápis do přepisu.
  s.runningAt = s.procesSkoncil + 1000;
  store.commit(s);
  assert.equal(stav(s).status, 'working');
  for (const vypis of [[P(101)], [], []]) await konec.upravit(vypis);
  assert.equal(stav(s).reason, DUVOD);
});

test('Codex CLI ano; Claude Desktop, aplikace Codex, hotový tah ani hook Stop se nemění', async () => {
  const { konec, tah, stav } = prostredi();
  const codex = tah('c', { connector: 'codex', app: 'Codex CLI' });
  const codexApp = tah('d', { connector: 'codex', app: 'Codex · aplikace' });
  const desktop = tah('e', { app: 'Claude Desktop · Code' });
  const hotovy = tah('f');
  hotovy.running = false; // end_turn nebo hook Stop / SessionEnd
  for (const vypis of [[P(100, SLOZKA, 'codex'), P(101)], [], []]) await konec.upravit(vypis);
  assert.equal(stav(codex).reason, DUVOD);
  assert.equal(stav(codexApp).status, 'working');
  assert.equal(stav(desktop).status, 'working');
  assert.equal(hotovy.procesSkoncil, 0);
});

test('konec procesu uprostřed tahu nevyvolá upozornění „dokončil úlohu“', async () => {
  const { store, konec, tah } = prostredi();
  const s = tah('a');
  s.turnStartedAt = Date.now() - 10 * 60e3;
  store.commit(s);
  const datastore = fakeDatastore();
  const alerts = new AlertEngine({ store, datastore, notifier: { native: async () => true } });
  store.ready = true;
  alerts.start();
  for (const vypis of [[P(100)], [], []]) await konec.upravit(vypis);
  assert.equal(store.summary(s.id).status, 'waiting');
  assert.deepEqual(datastore.data.alerts.filter((a) => a.kind === 'done'), []);
});

test('živý proces claude ukončený uprostřed tahu: konverzace do dvou výpisů nepracuje', async (t) => {
  if (process.platform !== 'linux') return t.skip('složka procesu se tu ověřuje na Linuxu (/proc); macOS jde přes lsof');
  const dir = await tempDir('agenteeq-konec-');
  const slozka = path.join(dir, 'Design & Web');
  const bin = path.join(dir, 'bin');
  await fs.mkdir(slozka, { recursive: true });
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(path.join(bin, 'claude'), '#!/bin/sh\nsleep 60\n', { mode: 0o755 });
  const agent = spawn(path.join(bin, 'claude'), [], { cwd: slozka, stdio: 'ignore' });
  const bezi = () => fs.readFile(`/proc/${agent.pid}/cmdline`, 'utf8').catch(() => '').then((c) => c.includes(path.join(bin, 'claude')));
  await waitFor(bezi, 8000);
  const pidy = new Set([agent.pid]);
  const srv = await startTestServer({ AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '200' }, { vypisProcesu: jenProcesy(pidy) });
  try {
    const id = crypto.randomUUID();
    await writeJsonl(path.join(srv.sourceHome, '.claude', 'projects', '-Design---Web', `${id}.jsonl`), [
      { type: 'user', sessionId: id, cwd: slozka, timestamp: new Date().toISOString(), message: { role: 'user', content: 'Oprav testy' } },
    ]);
    await srv.app.connectors['claude-code'].scan();
    const klient = api(srv.url);
    const konverzace = async () => (await klient.get('/api/state')).body.sessions.find((s) => s.id === `claude-code:${id}`);
    await waitFor(async () => (await konverzace())?.status === 'working', 8000);
    // Pár výpisů s živým procesem: vazba procesu na konverzaci.
    await new Promise((r) => setTimeout(r, 800));
    assert.equal((await konverzace()).status, 'working', 'proces běží – konverzace pracuje dál');
    const konec = new Promise((r) => agent.once('exit', r));
    const zabito = Date.now();
    agent.kill('SIGKILL');
    await konec;
    const v = await waitFor(async () => { const x = await konverzace(); return x?.status !== 'working' && x; }, 8000);
    assert.equal(v.status, 'waiting');
    assert.equal(v.reason, DUVOD);
    assert.equal(v.done, false);
    // Výpis po 200 ms, potvrzení dvěma výpisy a nové čtení přepisu; rezerva na zatížený stroj.
    assert.ok(Date.now() - zabito < 3000, `konec procesu se projevil až za ${Date.now() - zabito} ms`);
  } finally {
    agent.kill();
    await srv.close();
  }
});
