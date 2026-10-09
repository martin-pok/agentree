import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createSession, hookHealth, summarize, HOOK_GRACE } from '../src/model.js';
import { Store } from '../src/store.js';
import { claudeSettingsPath, installHooks } from '../src/hooks-installer.js';
import { DAY } from '../src/util.js';
import { startTestServer, api, writeJsonl, waitFor, tempDir } from './helpers.mjs';

// Zdraví propojení s Claude Code (src/model.js#hookHealth). Claude Code načítá hooky při startu:
// konverzace spuštěná před zapnutím propojení události neposílá a její „čeká na povolení“ je jen
// odhad. Aplikace musí poznat, která konverzace je propojená, která běží od doby před zapnutím
// a ze které by události chodit měly, ale nechodí – a když neví, kdy se propojení zapnulo, nesmí to předstírat.

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);
const OD = NOW - 3600e3;              // propojení zapnuto před hodinou
const START = NOW - 2 * 3600e3;       // Agenteeq běží od doby před zapnutím
const hooky = { od: OD, presne: true, start: START };

function relace({ startedAt = OD + 60e3, turnStartedAt = startedAt, ...pole } = {}) {
  const s = createSession({ connector: 'claude-code', localId: 'zdravi-1', provider: 'anthropic', app: 'Claude Code' });
  Object.assign(s, { startedAt, lastAt: NOW - 1000, turnStartedAt, running: true, runningAt: NOW - 1000, staleMs: 30 * 60e3, turns: 1 }, pole);
  return s;
}
const zdravi = (s, h = hooky, now = NOW) => hookHealth(s, 'working', h, now);

test('zdraví propojení: událost z hooku = propojeno, bez ohledu na čas začátku', () => {
  assert.equal(zdravi(relace({ startedAt: OD - DAY, hookAt: NOW - 5000 })), 'linked');
  assert.equal(zdravi(relace({ hookAt: NOW - 5000 }), { od: OD, presne: false, start: START }), 'linked');
});

test('zdraví propojení: začala před zapnutím = odhad do nového spuštění (hranice času)', () => {
  assert.equal(zdravi(relace({ startedAt: OD - 1 })), 'before');
  assert.equal(zdravi(relace({ startedAt: OD - DAY, turnStartedAt: NOW - 5 * 60e3 })), 'before', 'ani nové zadání v téže relaci propojení nenačte');
  // Přesně v okamžiku zapnutí už Claude Code nastavení s hooky přečetl.
  assert.notEqual(zdravi(relace({ startedAt: OD, turnStartedAt: OD })), 'before');
});

test('zdraví propojení: zadání po zapnutí bez události = nejspíš nefunguje, až po rezervě', () => {
  const zadani = NOW - HOOK_GRACE;
  assert.equal(zdravi(relace({ turnStartedAt: zadani })), 'silent', 'na hranici rezervy už je ticho podezřelé');
  assert.equal(zdravi(relace({ turnStartedAt: zadani + 1 })), 'pending', 'v rezervě se hook může teprve doručovat');
  assert.equal(zdravi(relace({ startedAt: OD, turnStartedAt: OD }), hooky, OD + HOOK_GRACE), 'silent');
});

test('zdraví propojení: po restartu Agenteeq se ticho posuzuje jen podle zadání, která slyšel', () => {
  // `hookAt` se neukládá: konverzace propojená před restartem Agenteeq ho nemá, dokud nepřijde další událost.
  const poRestartu = { od: OD, presne: true, start: NOW - 60e3 };
  assert.equal(zdravi(relace({ turnStartedAt: NOW - 10 * 60e3 }), poRestartu), 'pending', 'zadání z doby, kdy Agenteeq neběžel, nic nedokazuje');
  assert.equal(zdravi(relace({ turnStartedAt: NOW - 40e3 }), poRestartu), 'silent');
});

test('zdraví propojení: neznámý čas zapnutí se nevydává za „před zapnutím“', () => {
  // Propojení zapnuté starší verzí nebo ručně: `od` je chvíle, kdy ho Agenteeq poprvé viděl.
  const nevim = { od: OD, presne: false, start: START };
  assert.equal(zdravi(relace({ startedAt: OD - 1 }), nevim), 'unknown');
  assert.equal(zdravi(relace({ startedAt: OD - DAY }), nevim), 'unknown');
  // Co začalo až potom, začalo po zapnutí jistě – tam se ticho poznat dá.
  assert.equal(zdravi(relace({ startedAt: OD + 1000, turnStartedAt: NOW - 60e3 }), nevim), 'silent');
  assert.equal(zdravi(relace({ startedAt: OD + 1000, turnStartedAt: NOW - 1000 }), nevim), 'pending');
});

test('zdraví propojení: netýká se jiných nástrojů, pomocníků, procesů, vypnutého propojení ani neběžících konverzací', () => {
  assert.equal(zdravi(relace(), null), null, 'propojení vypnuté');
  assert.equal(zdravi(relace({ connector: 'codex' })), null);
  assert.equal(zdravi(relace({ parentId: 'claude-code:rodic' })), null, 'pomocný agent hooky sám neposílá');
  assert.equal(zdravi(relace({ proces: { pid: 1, od: NOW, popis: '' } })), null, 'proces bez přepisu není konverzace');
  assert.equal(zdravi(relace({ ended: true })), null);
  assert.equal(hookHealth(relace(), 'idle', hooky, NOW), null);
  assert.equal(hookHealth(relace(), 'archived', hooky, NOW), null);
  assert.equal(hookHealth(relace({ startedAt: OD - 1 }), 'needs_input', hooky, NOW), 'before');
  assert.equal(hookHealth(relace({ startedAt: OD - 1 }), 'waiting', hooky, NOW), 'before');
  // Jestli Claude Desktop → Code hooky spouští, ověřené není: bez události se nic netvrdí, s ní ano.
  assert.equal(zdravi(relace({ app: 'Claude Desktop · Code', turnStartedAt: NOW - 60e3 })), null);
  assert.equal(zdravi(relace({ app: 'Claude Desktop · Code', hookAt: NOW })), 'linked');
});

test('zdraví propojení: souhrn nese příznak a změna propojení ho přepočítá hned', () => {
  const s = relace({ startedAt: OD - 1, lastAt: NOW, runningAt: NOW, turnStartedAt: NOW });
  assert.equal(summarize(s, NOW, 7 * DAY).hookHealth, null);
  assert.equal(summarize(s, NOW, 7 * DAY, hooky).hookHealth, 'before');

  const store = new Store({ config: { windowDays: 7 }, datastore: { data: {} } });
  const zive = store.ensure({ connector: 'claude-code', localId: 'zdravi-2', provider: 'anthropic', app: 'Claude Code' });
  Object.assign(zive, { startedAt: Date.now() - 60e3, lastAt: Date.now(), running: true, runningAt: Date.now(), staleMs: 30 * 60e3 });
  store.ready = true;
  store.commit(zive);
  const zmeny = [];
  store.on('session', (v) => zmeny.push(v.hookHealth));
  store.setHooky({ od: Date.now(), presne: true, start: Date.now() - DAY });
  assert.deepEqual(zmeny, ['before']);
  store.setHooky({ od: zive.startedAt + 0, presne: true, start: Date.now() - DAY });
  store.setHooky({ od: zive.startedAt + 0, presne: true, start: Date.now() - DAY });
  assert.equal(zmeny.length, 2, 'stejné propojení nic znovu neposílá');
  store.setHooky(null);
  assert.equal(zmeny.at(-1), null);
});

test('zdraví propojení přes API: instalace uloží čas, konverzace před ní je odhad, událost ji propojí', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  const data = async () => JSON.parse(await fs.readFile(path.join(srv.dataHome, 'data.json'), 'utf8'));

  // Konverzace Claude Code, která běží od doby před zapnutím propojení.
  const sid = 'aaaaaaaa-1111-4111-8111-000000000001';
  const pred = new Date(Date.now() - 5 * 60e3).toISOString();
  await writeJsonl(path.join(srv.sourceHome, '.claude', 'projects', '-tmp-zdravi', `${sid}.jsonl`), [
    { type: 'user', timestamp: pred, sessionId: sid, cwd: '/tmp/zdravi', message: { role: 'user', content: 'Uprav README' } },
  ]);
  await srv.app.connectors['claude-code'].scan();
  const id = `claude-code:${sid}`;
  assert.equal(srv.app.store.summary(id)?.hookHealth, null, 'bez propojení se nic netvrdí');
  assert.equal((await a.get('/api/state')).body.integrations.claudeHooks.since, null);

  const pred1 = Date.now();
  const r = await a.send('POST', '/api/integrations/claude-hooks/install');
  assert.equal(r.status, 200);
  assert.equal(r.body.claudeHooks.installed, true);
  assert.equal(r.body.claudeHooks.sinceExact, true);
  assert.ok(r.body.claudeHooks.since >= pred1 && r.body.claudeHooks.since <= Date.now(), 'čas zapnutí = čas instalace');
  await srv.app.datastore.flush();
  assert.deepEqual((await data()).claudeHooks, { od: r.body.claudeHooks.since, presne: true }, 'čas zapnutí přežije restart');
  assert.equal(srv.app.store.summary(id).hookHealth, 'before');

  // Kontrola nic nezapisuje ani nemění čas zapnutí.
  const check = await a.send('POST', '/api/integrations/claude-hooks/check');
  assert.equal(check.status, 200);
  assert.equal(check.body.claudeHooks.since, r.body.claudeHooks.since);

  const token = (await data()).ingestToken;
  const hook = await a.send('POST', '/api/hooks/claude-code', { session_id: sid, hook_event_name: 'UserPromptSubmit', prompt: 'Pokračuj' }, { 'X-Agenteeq-Token': token });
  assert.equal(hook.status, 200);
  await waitFor(() => srv.app.store.summary(id)?.hookHealth === 'linked');

  const off = await a.send('POST', '/api/integrations/claude-hooks/uninstall');
  assert.equal(off.body.claudeHooks.installed, false);
  assert.equal(off.body.claudeHooks.since, null);
  await srv.app.datastore.flush();
  assert.equal((await data()).claudeHooks, null);
  assert.equal(srv.app.store.summary(id).hookHealth, null);
});

test('zdraví propojení přes API: propojení zapnuté mimo Agenteeq má čas „nevím“', async (t) => {
  const sourceHome = await tempDir('agenteeq-src-');
  // Hooky zapsala starší verze (nebo ručně): v datech Agenteeq o nich není záznam.
  await installHooks(claudeSettingsPath(sourceHome), { port: 4620, token: 'a'.repeat(32) });
  const sid = 'bbbbbbbb-2222-4222-8222-000000000002';
  await writeJsonl(path.join(sourceHome, '.claude', 'projects', '-tmp-stare', `${sid}.jsonl`), [
    { type: 'user', timestamp: new Date(Date.now() - 60e3).toISOString(), sessionId: sid, cwd: '/tmp/stare', message: { role: 'user', content: 'Ahoj' } },
  ]);
  const pred = Date.now();
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: sourceHome });
  t.after(() => srv.close());
  const h = (await api(srv.url).get('/api/state')).body.integrations.claudeHooks;
  assert.equal(h.installed, true);
  assert.equal(h.sinceExact, false, 'přesný čas zapnutí neznáme');
  assert.ok(h.since >= pred, 'od = kdy ho Agenteeq poprvé viděl');
  assert.equal(srv.app.store.summary(`claude-code:${sid}`).hookHealth, 'unknown', 'nevíme, jestli začala před zapnutím');
});
