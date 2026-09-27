import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import v8 from 'node:v8';
import { maskedCrc, unsnappy, logRecords, tableEntries, readLevelSnapshot, readClaudeDesktopCache, decodeClone } from '../src/claude-desktop-cache.js';
import { remoteSessions, applyRemoteSession, desktopUsage, applyDesktopUsage } from '../src/connectors/claude-desktop-code.js';
import { createSession, deriveStatus } from '../src/model.js';
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
  assert.equal(s.open.find((x) => x.id === 'app')?.label, 'Otevřít konverzaci');
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
  assert.notEqual(deriveStatus(s, now).status, 'working');
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
