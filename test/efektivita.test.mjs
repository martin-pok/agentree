import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sdilenyVypis, createStabilniStart } from '../src/connectors/processes.js';
import { Store } from '../src/store.js';
import { loadConfig } from '../src/config.js';
import { spawn } from 'node:child_process';
import { startTestServer, writeJsonl, fakeDatastore, jenProcesy, tempDir, waitFor } from './helpers.mjs';

// Agenteeq běží celý den na pozadí. Tyhle testy hlídají, že v klidu nedělá zbytečnou práci
// (nesouhrnuje nezměněné konverzace, nespouští `ps` dvakrát, neposílá do okna tikající čísla) –
// a přitom nic nepřehlédne: nový soubor, změnu starého ani smazání.

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const radek = (sessionId, at, text = 'Oprav testy') => ({
  type: 'user', sessionId, cwd: '/tmp/e', timestamp: new Date(at).toISOString(), message: { role: 'user', content: text },
});

function pocitadloCommitu(store) {
  let n = 0;
  const puvodni = store.commit.bind(store);
  store.commit = (...a) => { n++; return puvodni(...a); };
  return () => n;
}

test('efektivita: nezměněný přepis se při pravidelném průchodu znovu nesouhrnuje', async () => {
  const srv = await startTestServer();
  try {
    const koren = path.join(srv.sourceHome, '.claude', 'projects', '-tmp-e');
    for (let i = 0; i < 5; i++) await writeJsonl(path.join(koren, `aaaa000${i}-0000-4000-8000-000000000000.jsonl`), [radek(`aaaa000${i}-0000-4000-8000-000000000000`, Date.now() - i * 1000)]);
    const cc = srv.app.connectors['claude-code'];
    await cc.scan();
    const commity = pocitadloCommitu(srv.app.store);
    await cc.scan();
    await cc.scan();
    assert.equal(commity(), 0, 'nic se nezměnilo, nic se nepřepočítává');
    // Připsaný řádek se ale projeví i bez události sledování.
    await writeJsonl(path.join(koren, 'aaaa0000-0000-4000-8000-000000000000.jsonl'), [radek('aaaa0000-0000-4000-8000-000000000000', Date.now(), 'Druhé zadání')], { append: true });
    await cc.scan();
    assert.equal(commity(), 1);
    assert.equal(srv.app.store.summary('claude-code:aaaa0000-0000-4000-8000-000000000000').lastPrompt, 'Druhé zadání');
  } finally {
    await srv.close();
  }
});

test('efektivita: starý soubor se kontroluje jednou za šest průchodů, nový a smazaný hned', async () => {
  const srv = await startTestServer();
  try {
    const koren = path.join(srv.sourceHome, '.claude', 'projects', '-tmp-e');
    const stary = path.join(koren, 'bbbb0000-0000-4000-8000-000000000000.jsonl');
    await writeJsonl(stary, [radek('bbbb0000-0000-4000-8000-000000000000', Date.now() - 3 * HOUR)]);
    const pred3h = new Date(Date.now() - 3 * HOUR);
    await fs.utimes(stary, pred3h, pred3h);
    const cc = srv.app.connectors['claude-code'];
    // Start aplikace už udělal plný průchod; následujících pět je zkrácených.
    // Nový soubor se najde v každém průchodu.
    const novy = path.join(koren, 'bbbb0001-0000-4000-8000-000000000000.jsonl');
    await writeJsonl(novy, [radek('bbbb0001-0000-4000-8000-000000000000', Date.now())]);
    await cc.scan(); // plný (první volání scan)
    assert.ok(srv.app.store.summary('claude-code:bbbb0001-0000-4000-8000-000000000000'));
    // Změna starého souboru, kterou sledování nezachytilo (mtime zůstává staré): projeví se nejpozději po šesti průchodech.
    await writeJsonl(stary, [radek('bbbb0000-0000-4000-8000-000000000000', Date.now() - 3 * HOUR + 1000, 'Pozdní změna')], { append: true });
    await fs.utimes(stary, pred3h, pred3h);
    let pruchodu = 0;
    while (srv.app.store.summary('claude-code:bbbb0000-0000-4000-8000-000000000000').lastPrompt !== 'Pozdní změna') {
      await cc.scan();
      pruchodu++;
      assert.ok(pruchodu <= 6, 'změna ve starém souboru se najde nejpozději při plném průchodu');
    }
    // Smazaný soubor zmizí z přehledu hned při dalším průchodu.
    await fs.rm(novy);
    await cc.scan();
    assert.equal(srv.app.store.summary('claude-code:bbbb0001-0000-4000-8000-000000000000'), null);
  } finally {
    await srv.close();
  }
});

test('efektivita: klidné konverzace se přepočítávají jednou za minutu, aktivní pokaždé', () => {
  const store = new Store({ config: loadConfig({ AGENTEEQ_SOURCE_HOME: '/tmp/nic', AGENTEEQ_HOME: '/tmp/nic' }), datastore: fakeDatastore() });
  store.ready = true;
  const ted = Date.now();
  const stara = store.ensure({ connector: 'claude-code', localId: 'stara', provider: 'anthropic', app: 'Claude Code' });
  stara.lastAt = ted - 3 * DAY;
  const zkracena = store.ensure({ connector: 'claude-code', localId: 'aktivni', provider: 'anthropic', app: 'Claude Code' });
  zkracena.lastAt = ted - 10e3;
  zkracena.running = true;
  zkracena.runningAt = ted - 10e3;
  zkracena.staleMs = 30e3;
  store.commit(stara, ted);
  store.commit(zkracena, ted);
  const commity = pocitadloCommitu(store);
  store.reevaluate(ted);
  assert.equal(commity(), 2, 'první přepočet projde všechno');
  store.reevaluate(ted + 5e3);
  assert.equal(commity(), 3, 'za 5 s jen aktivní');
  // Práce „vyprší“ i bez nových dat – aktivní konverzace to pozná hned.
  store.reevaluate(ted + 25e3);
  assert.equal(store.summary('claude-code:aktivni').status, 'waiting');
  store.reevaluate(ted + 61e3);
  assert.equal(commity(), 6, 'po minutě i ta klidná');
  // Nová data (commit z konektoru) klidnou konverzaci hned zařadí zpět mezi přepočítávané.
  stara.pending = { at: ted + 62e3, text: 'Povolit?' };
  store.commit(stara, ted + 62e3);
  const pred = commity();
  store.reevaluate(ted + 63e3);
  store.reevaluate(ted + 64e3);
  assert.equal(commity() - pred, 4, 'čekající otázka – přepočítává se pokaždé');
});

test('efektivita: výpis procesů se sdílí a start procesu nekolísá', async () => {
  let volani = 0;
  const vypis = sdilenyVypis(async () => { volani++; return { ok: true, stdout: '' }; }, 4000);
  await Promise.all([vypis(), vypis(), vypis()]);
  assert.equal(volani, 1, 'tři konektory, jedno spuštění ps');
  const start = createStabilniStart();
  const t = 1_000_000_000;
  const a = start.od('claude', 100, t);
  assert.equal(start.od('claude', 105, t + 5400), a, 'vteřinová nepřesnost doby běhu start nezmění');
  assert.notEqual(start.od('claude', 2, t + 10e3), a, 'nový proces = nový start');
  start.ponech(new Set());
  assert.equal(start.od('claude', 50, t + 20e3), t + 20e3 - 50e3);
});

test('efektivita: v klidu se do okna neposílá tikající doba běhu ani čas průchodu', async (t) => {
  // Vlastní běžící „claude“, aby měl co tikat; cizí procesy počítače test nevidí (jenProcesy) – jejich
  // start nebo konec mezi průchody by změnil přehled a z CLAUDE_CONFIG_DIR by se četla cizí data.
  const bin = path.join(await tempDir('agenteeq-efekt-'), 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'claude'), '#!/bin/sh\nsleep 60\n', { mode: 0o755 });
  const agent = process.platform === 'win32' ? null : spawn(path.join(bin, 'claude'), [], { env: { PATH: process.env.PATH }, stdio: 'ignore' });
  t.after(() => agent?.kill());
  const vypis = jenProcesy(new Set(agent ? [agent.pid] : []));
  // Až ho výpis ukazuje jako „claude“ (po exec), jinak by se přehled změnil mezi průchody sám.
  if (agent) await waitFor(async () => (await vypis()).stdout.includes(bin), 8000);
  const srv = await startTestServer({ AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '60000' }, { vypisProcesu: vypis });
  try {
    if (agent) assert.ok(srv.app.store.runtimes.find((r) => r.id === 'claude-code')?.running, 'vlastní proces je v přehledu – je co hlídat');
    const conn = srv.app.connectors.processes;
    const udalosti = [];
    for (const ev of ['runtimes', 'connectors']) srv.app.store.on(ev, () => udalosti.push(ev));
    // Výchozí stav vznikne z vlastního průchodu. Jinak může první scan při startu
    // spadnout do předchozí minuty a test by omylem porovnával dvě legitimně odlišná měření.
    await conn.scan();
    const runtimes = JSON.stringify(srv.app.store.runtimes);
    const status = JSON.stringify(conn.status());
    const predDruhymPruchodem = Date.now();
    await new Promise((r) => setTimeout(r, 1100));
    await conn.scan();
    const poDruhemPruchodu = Date.now();
    for (const r of srv.app.store.runtimes) {
      assert.equal(r.uptimeSec, undefined, 'doba běhu se dopočítá v rozhraní z času startu');
      assert.ok(r.running ? r.od > 0 : r.od === 0);
    }
    // Stav zdroje se mezi dvěma průchody v téže minutě nezmění.
    if (Math.floor(predDruhymPruchodem / 60e3) === Math.floor(poDruhemPruchodu / 60e3)) assert.equal(JSON.stringify(conn.status()), status);
    // Procesy s kolísající zátěží se mohou legitimně změnit; doba běhu sama změnu vyvolat nesmí.
    const bezZateze = (j) => JSON.stringify(JSON.parse(j).map(({ cpu, memMB, ...r }) => r));
    assert.equal(bezZateze(JSON.stringify(srv.app.store.runtimes)), bezZateze(runtimes));
  } finally {
    await srv.close();
  }
});
