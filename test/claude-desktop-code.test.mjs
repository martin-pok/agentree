import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import v8 from 'node:v8';
import { maskedCrc, unsnappy, logRecords, tableEntries, readLevelSnapshot, readClaudeDesktopCache, decodeClone } from '../src/claude-desktop-cache.js';
import { remoteSessions, applyRemoteSession, desktopUsage, applyDesktopUsage, hlasenyStav, cachedRemoteId } from '../src/connectors/claude-desktop-code.js';
import { createSession, deriveStatus } from '../src/model.js';
import { applyKarta } from '../src/connectors/web.js';
import { appSupportDir } from '../src/platform.js';
import { tempDir, startTestServer, api, waitFor, openStream } from './helpers.mjs';

const id = 'session_01FixtureRemoteAgent123';
const vi = (n) => { const a = []; do { const c = n % 128; n = Math.floor(n / 128); a.push(c | (n ? 128 : 0)); } while (n); return Buffer.from(a); };
const clone = (d) => Buffer.concat([Buffer.from([255, 21]), v8.serialize(d)]);
const key = (name, index = 1) => Buffer.concat([Buffer.from([0, 1, 1, index, 1]), vi(name.length), Buffer.from(name, 'utf16le').swap16()]);
const record = (payload, type = 1) => { const b = Buffer.alloc(7); b.writeUInt32LE(maskedCrc(Buffer.concat([Buffer.from([type]), payload]))); b.writeUInt16LE(payload.length, 4); b[6] = type; return Buffer.concat([b, payload]); };
const batch = (sequence, rows) => { const b = Buffer.alloc(12); b.writeBigUInt64LE(BigInt(sequence)); b.writeUInt32LE(rows.length, 8); return Buffer.concat([b, ...rows.map(([key, value]) => Buffer.concat([Buffer.from([value === null ? 0 : 1]), vi(key.length), key, ...(value === null ? [] : [vi(value.length), value])]))]); };
const metadata = (now = Date.now()) => ({ type: 'session', id, title: 'Ranní práce na repozitáři', session_status: 'idle', status_bucket: 'failed', created_at: new Date(now - 86400000).toISOString(), updated_at: new Date(now - 60000).toISOString(), post_turn_summary: { status_category: 'failed' }, session_context: { model: 'claude-opus-fixture', sources: [{ type: 'git_repository', url: 'https://github.com/example/project', revision: 'main' }] } });
const cache = (sessions, at = Date.now()) => ({ timestamp: at, clientState: { queries: [{ queryKey: ['sessions_api_list_sessions', 'fixture-account'], state: { dataUpdatedAt: at, data: { pages: [{ data: sessions }] } } }, { queryKey: ['account_profile'], state: { data: { secret: 'private fixture' } } }] } });
async function fixture(home, sessions = [metadata()]) {
  const dir = path.join(appSupportDir(home), 'Claude', 'IndexedDB', 'https_claude.ai_0.indexeddb.leveldb');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'CURRENT'), 'MANIFEST-000001\n');
  await fs.writeFile(path.join(dir, 'MANIFEST-000001'), record(Buffer.from([2, 2])));
  const write = async (sessions, sequence = 1) => fs.writeFile(path.join(dir, '000002.log'), record(batch(sequence, [[key('react-query-cache'), Buffer.concat([vi(sequence), clone(cache(sessions))])]])));
  await write(sessions);
  return { dir, write };
}
const newSession = () => createSession({ connector: 'claude-desktop-code', localId: id, provider: 'anthropic', app: 'Claude' });

test('Claude remote: recovers missing morning agent and reported failure without a local CLI transcript', async (t) => {
  const home = await tempDir(); await fixture(home);
  const server = await startTestServer({ AGENTEEQ_SOURCE_HOME: home }); t.after(() => server.close());
  const state = (await api(server.url).get('/api/state')).body;
  const s = state.sessions.find((s) => s.connector === 'claude-desktop-code');
  assert.equal(s.title, 'Ranní práce na repozitáři'); assert.equal(s.status, 'failed');
  assert.equal(s.repo, 'example/project'); assert.equal(s.cwd, ''); assert.equal(s.resume, null);
  assert.equal(s.tokens.input, 0); assert.equal(s.tokens.output, 0); assert.equal(s.observation.partial, true);
  assert.equal(s.spans.length, 1, 'one reported update, no invented whole-day working interval');
  // Samotná cache nemá adresu ověřené karty a aktivace Claude by ukázala poslední cizí chat.
  assert.equal(s.exactUrl, undefined);
  assert.equal(s.open.some((x) => x.id === 'app'), false);
  assert.equal(JSON.stringify(s).includes('private fixture'), false);
});

test('Claude remote: new agent / live update reaches HTTP and SSE within 2s; corruption preserves last state and recovers', async (t) => {
  const home = await tempDir(), f = await fixture(home, []);
  const server = await startTestServer({ AGENTEEQ_SOURCE_HOME: home }); t.after(() => server.close());
  const stream = await openStream(server.url); t.after(() => stream.close());
  const started = Date.now(); await f.write([metadata()], 2);
  await waitFor(() => server.app.store.summary(`claude-desktop-code:${id}`), 1900);
  assert.ok(Date.now() - started < 2000); await waitFor(() => stream.events.some((e) => e.event === 'session' && e.data.id.endsWith(id)), 1900);
  assert.ok(stream.events.find((e) => e.event === 'session').at - started < 2000);
  const before = server.app.store.summary(`claude-desktop-code:${id}`);
  await fs.writeFile(path.join(f.dir, '000002.log'), Buffer.from('broken cache'));
  await waitFor(() => server.app.connectors['claude-desktop-code'].status().state === 'error');
  assert.deepEqual(server.app.store.summary(before.id), before);
  const running = { ...metadata(), session_status: 'running', status_bucket: 'running', post_turn_summary: {}, updated_at: new Date().toISOString() };
  await f.write([running], 3);
  await waitFor(() => server.app.store.summary(before.id)?.status === 'working', 1900);
  assert.equal(server.app.connectors['claude-desktop-code'].status().state, 'connected');
  const state = (await api(server.url).get('/api/state')).body;
  assert.equal(state.sessions.filter((s) => s.id === before.id).length, 1, 'no duplicate after rewritten cache');
  const existing = server.app.store.get(before.id); existing.seq = 200; server.app.store.commit(existing);
  await f.write([{ ...metadata(), title: 'Přejmenovaná relace po kratší cache' }], 4);
  await waitFor(() => server.app.store.summary(before.id)?.title === 'Přejmenovaná relace po kratší cache');
  assert.ok(server.app.store.summary(before.id).transcriptSeq >= 200, 'shorter cached transcript cannot be discarded as stale by the client');
});

test('Claude remote: old running cache cannot become live from unrelated cache timestamps; partial transcript deduplicates exact usage', () => {
  const now = Date.now(), meta = { ...metadata(now), session_status: 'running', status_bucket: 'running', post_turn_summary: {} };
  const stale = cache([meta], now); stale.clientState.queries[0].state.dataUpdatedAt = now - 600000;
  const data = remoteSessions([{ key: 'react-query-cache', value: stale }]);
  const message = { type: 'assistant', uuid: 'event1', created_at: new Date(now - 3600000).toISOString(), message: { id: 'message1', content: [{ type: 'text', text: 'Hotovo.' }], stop_reason: 'end_turn', usage: { input_tokens: 12, output_tokens: 4 } } };
  const s = applyRemoteSession(newSession(), meta, { tree: { kind: 'code_session', messages: [message, message, { ...message, uuid: 'subagent', parent_tool_use_id: 'task1' }] } }, data.observedAt, now);
  const d = deriveStatus(s, now);
  assert.notEqual(d.status, 'working');
  // Naposledy hlášené „pracuje“ není „hotovo“: dřív tu stálo „Hotovo, čeká na další zadání“.
  assert.equal(d.done, false); assert.equal(d.stale, true);
  assert.match(d.reason, /Při posledním načtení pracoval/);
  assert.equal(s.tokens.input, 12); assert.equal(s.tokens.output, 4); assert.equal(s.transcript.length, 1);
  assert.equal(Object.values(s.hourly).reduce((a, n) => a + n, 0), 16);
});

test('Claude cache: supports compressed external IndexedDB blob; never scans orphan blobs or unrelated credentials', async () => {
  const home = await tempDir(), f = await fixture(home);
  const d = clone(cache([metadata()]));
  // Raw Snappy literal, Chromium compressed-clone wrapper.
  const len = d.length - 1, bytes = len < 256 ? 1 : 2;
  const literal = Buffer.alloc(bytes); literal.writeUIntLE(len, 0, bytes);
  const compressed = Buffer.concat([Buffer.from([255, 17, 2]), vi(d.length), Buffer.from([(59 + bytes) << 2]), literal, d]);
  const blobdir = f.dir.replace('.leveldb', '.blob'); await fs.mkdir(path.join(blobdir, '1', '00'), { recursive: true });
  await fs.writeFile(path.join(blobdir, '1', '00', '7'), compressed);
  await fs.writeFile(path.join(blobdir, '1', '00', '8'), 'orphan must not be parsed');
  await fs.writeFile(path.join(f.dir, '000002.log'), record(batch(2, [
    [key('react-query-cache'), Buffer.from([1, 255, 17, 1, 0, 0])], [key('react-query-cache', 3), Buffer.from([0, 7])],
    [key('credentials'), Buffer.from('private non-clone')],
  ])));
  const records = await readClaudeDesktopCache(f.dir);
  assert.equal(records.length, 1); assert.equal(remoteSessions(records).sessions[0].id, id);
  assert.deepEqual(unsnappy(compressed.subarray(3)), d);
  assert.throws(() => unsnappy(Buffer.from([100, 1, 0])));
  assert.throws(() => decodeClone(Buffer.from([255, 22])));
});

test('Claude cache accepts conversation keys with both cse_ and session_ identifiers', async () => {
  const home = await tempDir(), f = await fixture(home);
  const conversation = { product: 'code', conversationUuid: `code:${id}`, tree: { kind: 'code_session', messages: [] } };
  await fs.writeFile(path.join(f.dir, '000002.log'), record(batch(2, [
    [key(`code:${id}`), Buffer.concat([vi(2), clone(conversation)])],
  ])));
  const records = await readClaudeDesktopCache(f.dir);
  assert.equal(records[0].key, `code:${id}`);
  assert.equal(cachedRemoteId(records[0].value.conversationUuid), id);
  assert.equal(cachedRemoteId(`code:cse_${id.slice('session_'.length)}`), id);
});

function block(entries) {
  const rows = entries.map(({ key, value }) => Buffer.concat([vi(0), vi(key.length), vi(value.length), key, value]));
  const restarts = Buffer.alloc(8); restarts.writeUInt32LE(1, 4);
  const b = Buffer.concat([...rows, restarts]), trailer = Buffer.alloc(5);
  trailer.writeUInt32LE(maskedCrc(Buffer.concat([b, Buffer.from([0])])), 1);
  return Buffer.concat([b, trailer]);
}
function table(rows) {
  const data = block(rows), index = block([{ key: Buffer.from('z'), value: Buffer.concat([vi(0), vi(data.length - 5)]) }]);
  const footer = Buffer.alloc(48); Buffer.concat([vi(0), vi(0), vi(data.length), vi(index.length - 5)]).copy(footer);
  footer.writeBigUInt64LE(0xdb4775248b80fb57n, 40);
  return Buffer.concat([data, index, footer]);
}
test('Claude cache: compaction table + WAL latest sequence/deletion win; obsolete tables and incomplete tail do not resurrect agents', async () => {
  const home = await tempDir(), f = await fixture(home), k = key('react-query-cache');
  const internal = Buffer.concat([k, Buffer.alloc(8)]); internal.writeBigUInt64LE((1n << 8n) | 1n, internal.length - 8);
  const tab = table([{ key: internal, value: Buffer.from('old') }]);
  assert.equal(tableEntries(tab).length, 1);
  const corrupt = Buffer.from(tab); corrupt[5] ^= 1; assert.throws(() => tableEntries(corrupt));
  await fs.writeFile(path.join(f.dir, '000003.ldb'), tab); await fs.writeFile(path.join(f.dir, '000004.ldb'), tab);
  await fs.writeFile(path.join(f.dir, 'MANIFEST-000001'), record(Buffer.concat([Buffer.from([2, 2, 7, 0, 3]), vi(tab.length), vi(0), vi(0)])));
  await fs.writeFile(path.join(f.dir, '000002.log'), Buffer.concat([record(batch(2, [[k, null]])), Buffer.from([1, 2, 3])]));
  assert.equal((await readLevelSnapshot(f.dir)).length, 0);
  const full = record(batch(3, [[k, Buffer.from('new')]]));
  const truncated = full.subarray(0, -3); assert.equal(logRecords(truncated).length, 0);
  const bad = Buffer.from(full); bad[8] ^= 1; assert.throws(() => logRecords(bad));
  await fs.writeFile(path.join(f.dir, '000002.log'), full);
  assert.equal((await readLevelSnapshot(f.dir))[0].value.toString(), 'new');
});

// Uložená stránka Usage v Claude Desktopu nese přesný čas obnovy od serveru. Hledá se podle tvaru
// odpovědi, platí k dataUpdatedAt dotazu a nic jiného se z ní nečte. Data jsou umělá.
test('Claude Desktop: vytížení plánu z uložené stránky Usage – přesný čas obnovy, jiné dotazy se ignorují', () => {
  const now = Date.UTC(2026, 8, 26, 12);
  const usage = (at, fh, sd) => ({ queryKey: ['neznamy_klic', 'org'], state: { dataUpdatedAt: at, data: {
    five_hour: { utilization: fh, resets_at: '2026-09-26T14:59:59.662201+00:00' },
    seven_day: { utilization: sd, resets_at: '2026-10-01T06:59:59.662219+00:00' },
    seven_day_opus: { utilization: 0, resets_at: null },
  } } });
  const records = [{ key: 'react-query-cache', value: { clientState: { queries: [
    { queryKey: ['account'], state: { dataUpdatedAt: now, data: { email_address: 'x@example.com', five_hour: 'ne' } } },
    usage(now - 60e3, 40, 70),
    usage(now - 3600e3, 10, 60),
    usage(now + 3600e3, 99, 99), // z budoucnosti = nedůvěryhodný čas, přeskočí se
  ] } } }];
  const u = desktopUsage(records, now);
  assert.deepEqual(u, { at: now - 60e3, five_hour: { usedPercent: 40, resetsAt: Date.parse('2026-09-26T14:59:59.662201+00:00') }, seven_day: { usedPercent: 70, resetsAt: Date.parse('2026-10-01T06:59:59.662219+00:00') } });
  assert.equal(desktopUsage([{ key: 'react-query-cache', value: { clientState: { queries: [{ state: { dataUpdatedAt: now, data: { five_hour: { utilization: 'x' } } } }] } } }], now), null);
  assert.equal(desktopUsage([], now), null);

  const zapsane = [];
  assert.equal(applyDesktopUsage({ setLimit: (l) => zapsane.push(l) }, u), true);
  assert.deepEqual(zapsane.map((l) => [l.id, l.source, l.usedPercent, l.at]), [
    ['claude:five_hour:desktop', 'desktop-usage', 40, now - 60e3],
    ['claude:seven_day:desktop', 'desktop-usage', 70, now - 60e3],
  ]);
  assert.ok(!JSON.stringify(zapsane).includes('example.com'), 'z účtu se nic nečte');
});

// Skutečné hodnoty z API (13. 10. 2026): výčet „SESSION_STATUS_RUNNING“ / „SESSION_STATUS_BUCKET_WORKING“,
// kategorie „need_input“. Malá písmena REST tvaru platí dál. Relace i texty v testu jsou umělé.
test('Claude remote: rozpozná běh, čekání i selhání ve výčtovém i REST tvaru', () => {
  assert.equal(hlasenyStav({ session_status: 'SESSION_STATUS_RUNNING', status_bucket: 'SESSION_STATUS_BUCKET_WORKING' }), 'working');
  assert.equal(hlasenyStav({ session_status: 'running' }), 'working');
  assert.equal(hlasenyStav({ session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_WORKING' }), 'working');
  assert.equal(hlasenyStav({ session_status: 'requires_action' }), 'needs_input');
  assert.equal(hlasenyStav({ session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_BLOCKED', post_turn_summary: { status_category: 'need_input' } }), 'needs_input');
  assert.equal(hlasenyStav({ session_status: 'idle', post_turn_summary: { status_category: 'need_input' } }), 'needs_input');
  assert.equal(hlasenyStav({ session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_FAILED', post_turn_summary: { status_category: 'failed' } }), 'failed');
  assert.equal(hlasenyStav({ session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_REVIEW_READY' }), '');
  assert.equal(hlasenyStav({ session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED' }), '');
  // Souhrn minulého tahu nepřebije nový běh.
  assert.equal(hlasenyStav({ session_status: 'SESSION_STATUS_RUNNING', post_turn_summary: { status_category: 'failed' } }), 'working');
  assert.equal(hlasenyStav({}), '');
  assert.equal(hlasenyStav(null), '');
});

test('Claude remote: běžící relace ve výčtovém tvaru pracuje, čekající žádá rozhodnutí i ze staršího načtení', () => {
  const now = Date.now();
  const enumZdroj = { sources: [{ git_repository: { url: 'https://github.com/example/project' } }], model: 'claude-opus-fixture' };
  const bezi = { id, title: 'Běžící vzdálený agent', session_status: 'SESSION_STATUS_RUNNING', status_bucket: 'SESSION_STATUS_BUCKET_WORKING', created_at: new Date(now - 600e3).toISOString(), updated_at: new Date(now - 5e3).toISOString(), session_context: enumZdroj };
  const data = remoteSessions([{ key: 'react-query-cache', value: cache([bezi], now - 3e3) }]);
  assert.equal(data.sessions.length, 1, 'záznam bez pole type se nezahodí');
  const s = applyRemoteSession(newSession(), data.sessions[0], null, data.observedAt, now);
  assert.equal(deriveStatus(s, now).status, 'working');
  assert.equal(s.repo, 'example/project');
  // Po 2 minutách bez nového načtení je to nečerstvé, ale pořád ne „hotovo“.
  const pozdeji = deriveStatus(s, now + 3 * 60e3);
  assert.equal(pozdeji.status, 'waiting'); assert.equal(pozdeji.done, false);

  const ceka = { ...bezi, session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_BLOCKED', updated_at: new Date(now - 20 * 60e3).toISOString(), post_turn_summary: { status_category: 'need_input', needs_action: 'Mám nasadit na produkci?' } };
  const c = applyRemoteSession(newSession(), ceka, null, now - 15 * 60e3, now);
  const dc = deriveStatus(c, now);
  assert.equal(dc.status, 'needs_input');
  // Cache je 15 min stará: rozhodnutí zůstává vidět, ale poctivě jako stav k času načtení.
  assert.match(dc.reason, /^Mám nasadit na produkci\? · stav z \d{1,2}\. \d{1,2}\. \d{2}:\d{2}$/); assert.equal(dc.stale, true);
  const cerstva = deriveStatus(applyRemoteSession(newSession(), ceka, null, now - 30e3, now), now);
  assert.equal(cerstva.reason, 'Mám nasadit na produkci?'); assert.equal(cerstva.stale, false);
  const selhal = deriveStatus(applyRemoteSession(newSession(), { ...ceka, status_bucket: 'SESSION_STATUS_BUCKET_FAILED', post_turn_summary: null }, null, now - 20 * 60e3, now), now);
  assert.equal(selhal.status, 'failed'); assert.equal(selhal.stale, true); assert.match(selhal.reason, / · stav z /);
  // Čekání staré přes 12 h už do rozhodnutí nepatří (deriveStatus).
  const stara = applyRemoteSession(newSession(), { ...ceka, updated_at: new Date(now - 13 * 3600e3).toISOString() }, null, now - 60e3, now);
  assert.notEqual(deriveStatus(stara, now).status, 'needs_input');
});

test('Claude remote: novější uložený přepis s rozběhnutým tahem pracuje, i když seznam relací je starší', () => {
  const now = Date.now();
  const meta = { ...metadata(now), session_status: 'idle', status_bucket: 'completed', post_turn_summary: { status_category: 'completed' }, updated_at: new Date(now - 10 * 60e3).toISOString() };
  const zadani = { type: 'user', uuid: 'u1', created_at: new Date(now - 40e3).toISOString(), message: { role: 'user', content: 'Oprav test' } };
  const nastroj = { type: 'assistant', uuid: 'a1', created_at: new Date(now - 20e3).toISOString(), message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } } };
  const s = applyRemoteSession(newSession(), meta, { tree: { kind: 'code_session', messages: [zadani, nastroj] } }, now - 9 * 60e3, now);
  const d = deriveStatus(s, now);
  assert.equal(d.status, 'working');
  assert.notEqual(d.reason, 'Pracuje podle stavu v Claude Desktopu', 'činnost z přepisu, ne obecná věta');
  // Seznam načtený po konci tahu má přednost před starším přepisem.
  const po = applyRemoteSession(newSession(), meta, { tree: { kind: 'code_session', messages: [zadani, nastroj] } }, now - 5e3, now);
  assert.notEqual(deriveStatus(po, now).status, 'working');
});

// Relace se hledá podle tvaru ve všech uložených dotazech: dotaz na jednu otevřenou relaci (klíč
// neznáme) bývá čerstvější než seznam. Data i názvy klíčů jsou umělé.
test('Claude remote: čerstvější dotaz na jednu relaci přebije starší seznam; nic jiného se nečte', () => {
  const now = Date.now();
  const vSeznamu = { ...metadata(now), session_status: 'idle', status_bucket: 'completed', post_turn_summary: { status_category: 'completed' }, updated_at: new Date(now - 10 * 60e3).toISOString() };
  const bezi = { id, title: 'Ranní práce na repozitáři', session_status: 'running', updated_at: new Date(now - 5e3).toISOString(), created_at: vSeznamu.created_at };
  const queries = [
    { queryKey: ['sessions_api_list_sessions', 'org'], state: { dataUpdatedAt: now - 9 * 60e3, data: { pages: [{ data: [vSeznamu] }] } } },
    { queryKey: ['neznamy_dotaz_relace', id], state: { dataUpdatedAt: now - 3e3, data: bezi } },
    { queryKey: ['account_profile'], state: { dataUpdatedAt: now, data: { id: 'session_01NotASessionObject', jmeno: 'soukromy profil uctu' } } },
  ];
  const data = remoteSessions([{ key: 'react-query-cache', value: { clientState: { queries } } }]);
  assert.equal(data.sessions.length, 1);
  assert.equal(data.sessions[0]._observedAt, now - 3e3, 'platí čerstvější načtení');
  assert.ok(!JSON.stringify(data).includes('soukromy profil uctu'), 'objekt bez pole stavu není relace');
  const s = applyRemoteSession(newSession(), data.sessions[0], null, data.sessions[0]._observedAt, now);
  assert.equal(deriveStatus(s, now).status, 'working');

  // Shodný `updated_at`: rozhodne pozdější načtení, ne pořadí dotazů v cache.
  const stejne = { ...vSeznamu, session_status: 'running' };
  const shoda = remoteSessions([{ key: 'react-query-cache', value: { clientState: { queries: [
    { queryKey: ['x'], state: { dataUpdatedAt: now - 1e3, data: [stejne] } },
    { queryKey: ['sessions_api_list_sessions'], state: { dataUpdatedAt: now - 5 * 60e3, data: { pages: [{ data: [stejne] }] } } },
  ] } } }]);
  assert.equal(shoda.sessions[0]._observedAt, now - 1e3);

  // Bez seznamu i bez relací konektor dál hlásí, že cache seznam nenese.
  assert.equal(remoteSessions([{ key: 'react-query-cache', value: { clientState: { queries: [queries[2]] } } }]), null);
  // Prázdný seznam je platný stav (žádné relace), ne chyba.
  assert.deepEqual(remoteSessions([{ key: 'react-query-cache', value: { clientState: { queries: [{ queryKey: ['sessions_api_list_sessions'], state: { dataUpdatedAt: now, data: { pages: [] } } }] } } }]).sessions, []);
});

// Relace sledovaná v Chromu na claude.ai/code: rozšíření posílá `claude-code-web` se `session_…` z adresy.
const karta = (generating, conversationId = id) => ({ site: 'claude-code-web', conversationId, url: `https://claude.ai/code/${conversationId}`, generating, counts: { user: 2, assistant: 1 } });
const stejnyAgent = (state) => state.sessions.filter((s) => s.id.endsWith(id));

test('Claude Code na webu: otevřená karta a cache Claude Desktopu jsou jeden agent a živá karta přebije starou cache', async (t) => {
  const home = await tempDir();
  // Cache Claude Desktopu: relace naposledy hlášená jako „pracuje“, ale seznam je 10 minut starý.
  const stara = Date.now() - 600000;
  const meta = { ...metadata(), session_status: 'idle', status_bucket: 'completed', post_turn_summary: { status_category: 'completed' }, updated_at: new Date(stara).toISOString() };
  await fixture(home, [meta]);
  const server = await startTestServer({ AGENTEEQ_SOURCE_HOME: home }); t.after(() => server.close());
  await waitFor(() => server.app.store.summary(`claude-desktop-code:${id}`));
  assert.notEqual(server.app.store.summary(`claude-desktop-code:${id}`).status, 'working');

  const res = server.app.connectors.web.ingest(karta(true));
  assert.equal(res.ok, true);
  assert.equal(res.id, `claude-desktop-code:${id}`, 'karta se připojí k relaci z cache');
  let state = (await api(server.url).get('/api/state')).body;
  assert.deepEqual(stejnyAgent(state).map((s) => s.id), [`claude-desktop-code:${id}`], 'jeden agent, ne dva');
  const s = stejnyAgent(state)[0];
  assert.equal(s.status, 'working');
  assert.equal(s.exactUrl, `https://claude.ai/code/${id}`);
  assert.deepEqual(s.open?.map((x) => x.id), ['app']);
  assert.match(s.reason, /karty/);
  assert.equal(s.title, 'Ranní práce na repozitáři', 'název a repozitář zůstávají z cache');

  // Karta hlásí, že agent dopracoval: už nepracuje, i když by ho cache držela.
  server.app.connectors.web.ingest(karta(false));
  state = (await api(server.url).get('/api/state')).body;
  assert.equal(stejnyAgent(state).length, 1);
  assert.notEqual(stejnyAgent(state)[0].status, 'working');
});

test('Claude Code na webu: karta otevřená dřív, než relaci uloží cache, se do ní převede', async (t) => {
  const home = await tempDir(), f = await fixture(home, []);
  const server = await startTestServer({ AGENTEEQ_SOURCE_HOME: home }); t.after(() => server.close());
  // Bez Claude Desktopu je karta samostatná webová konverzace – aplikace funguje i tak.
  assert.equal(server.app.connectors.web.ingest(karta(true)).id, `web:claude-code-web:${id}`);
  assert.equal(server.app.store.summary(`web:claude-code-web:${id}`).status, 'working');
  await f.write([{ ...metadata(), session_status: 'idle', status_bucket: 'completed', post_turn_summary: {} }], 2);
  await waitFor(() => server.app.store.summary(`claude-desktop-code:${id}`), 1900);
  const state = (await api(server.url).get('/api/state')).body;
  assert.deepEqual(stejnyAgent(state).map((s) => s.id), [`claude-desktop-code:${id}`]);
  assert.equal(stejnyAgent(state)[0].exactUrl, `https://claude.ai/code/${id}`);
  assert.equal(stejnyAgent(state)[0].status, 'working', 'živý stav z karty přežije převod');
});

test('Claude Code na webu: zavřená karta přestane platit a stav se vrátí k cache; čekání z cache karta nepřebije starým tahem', () => {
  const now = Date.now();
  const meta = { ...metadata(now), session_status: 'idle', status_bucket: 'completed', post_turn_summary: { status_category: 'completed' } };
  const s = applyRemoteSession(newSession(), meta, null, now - 1000, now);
  applyKarta(s, { generating: true, counts: { user: 1, assistant: 0 } }, now);
  assert.equal(deriveStatus(s, now + 1000).status, 'working');
  // Karta se 150 s neozvala (zavřená, uspaný Chrome): o stavu zase rozhoduje cache.
  const pozdeji = deriveStatus(s, now + 200e3);
  assert.notEqual(pozdeji.status, 'working');
  assert.equal(pozdeji.reason, deriveStatus({ ...s, karta: null }, now + 200e3).reason);
  // Cache hlásí čekání na rozhodnutí novější, než karta uviděla začátek tahu: čekání platí.
  const ceka = { ...metadata(now), session_status: 'requires_action', status_bucket: 'blocked', post_turn_summary: {}, updated_at: new Date(now).toISOString() };
  const s2 = applyRemoteSession(newSession(), ceka, null, now, now);
  applyKarta(s2, { generating: true, counts: { user: 1, assistant: 0 } }, now - 5000);
  applyKarta(s2, { generating: true, counts: { user: 1, assistant: 0 } }, now);
  assert.equal(deriveStatus(s2, now + 1000).status, 'needs_input');
});

// Vlastník 25. 10. 2026: běžící vzdálená relace na Přehledu chyběla a aplikace mlčela, protože se
// přihlášení Claude Code z Klíčenky nepodařilo přečíst a stav byl jen ze staré cache Claude Desktopu.
// Kdo vzdálené agenty používá (cache je zná), musí vidět, že živý stav z účtu chybí. Bez cache i bez
// přihlášení aplikace mlčí – Claude není podmínkou (test/samostatnost.test.mjs).
test('Claude remote: bez přihlášení k účtu, ale se známými vzdálenými agenty Přehled nemlčí', async (t) => {
  const home = await tempDir(); await fixture(home);
  const server = await startTestServer({ AGENTEEQ_SOURCE_HOME: home }, { claudeCloud: { enabled: true, intervalMs: 60e3, prihlaseni: async () => null } });
  t.after(() => server.close());
  const c = await waitFor(async () => (await api(server.url).get('/api/state')).body.connectors.find((x) => x.id === 'claude-desktop-code' && x.cloudNevim));
  assert.ok(c, 'chybějící živý stav z účtu se hlásí');
  assert.match(c.cloudChyba, /Přihlášení Claude Code se nepodařilo přečíst/);
  const prazdny = await tempDir();
  const bez = await startTestServer({ AGENTEEQ_SOURCE_HOME: prazdny }, { claudeCloud: { enabled: true, intervalMs: 60e3, prihlaseni: async () => null } });
  t.after(() => bez.close());
  await new Promise((r) => setTimeout(r, 300));
  const c2 = (await api(bez.url).get('/api/state')).body.connectors.find((x) => x.id === 'claude-desktop-code');
  assert.equal(c2.cloudNevim, false, 'bez Claude Desktopu i bez přihlášení aplikace nic nehlásí');
});
