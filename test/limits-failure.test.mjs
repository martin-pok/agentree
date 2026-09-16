import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { installHooks, uninstallHooks, hooksStatus, STATUSLINE_PATH } from '../src/hooks-installer.js';
import { AlertEngine } from '../src/alerts.js';
import { createSession, deriveStatus, pushEntry } from '../src/model.js';
import { startTestServer, writeJsonl, tempDir, waitFor, api, fakeDatastore } from './helpers.mjs';

const TOKEN = 'a'.repeat(48);

test('stavový řádek: instalace vedle hooků, cizí stavový řádek se nepřepíše, odinstalace odebere jen náš', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'settings.json');
  await installHooks(file, { port: 4620, token: TOKEN, now: 1 });
  let json = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(json.statusLine.type, 'command');
  assert.ok(json.statusLine.command.includes(STATUSLINE_PATH) && json.statusLine.command.includes(TOKEN));
  // Záleží na tom, že to stavový řádek poctivě řekne – ne na tom, kterým shellem.
  // Na Windows je tvar pro cmd.exe a bez diakritiky, kterou by jeho kódová stránka rozsypala.
  assert.match(json.statusLine.command, /\|\| (printf 'Agenteeq neběží'|echo Agenteeq nebezi)$/,
    'když Agenteeq neběží, stavový řádek to poctivě řekne');
  let st = await hooksStatus(file, TOKEN);
  assert.equal(st.statusLine, 'ours');
  assert.equal(st.current, true);
  assert.equal((await hooksStatus(file, 'b'.repeat(48))).current, false, 'jiný token = potřeba obnovit');

  await uninstallHooks(file, { now: 2 });
  json = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(json.statusLine, undefined);

  const foreign = { type: 'command', command: '~/.claude/muj-radek.sh' };
  await fs.writeFile(file, JSON.stringify({ statusLine: foreign, model: 'opus' }));
  const r = await installHooks(file, { port: 4620, token: TOKEN, now: 3 });
  assert.equal(r.statusLine, 'foreign');
  json = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(json.statusLine, foreign);
  st = await hooksStatus(file, TOKEN);
  assert.equal(st.statusLine, 'foreign');
  assert.equal(st.current, true, 'hooky jsou aktuální, cizí stavový řádek respektujeme');
  await uninstallHooks(file, { now: 4 });
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).statusLine, foreign);
});

test('stavový řádek přes API: limity 5 h a týden, kontext, repozitář, PR; bez posunu aktivity', async (t) => {
  const srcHome = await tempDir('agenteeq-src-');
  const sid = '77777777-2222-3333-4444-555555555555';
  const lastMsg = Date.now() - 120000;
  await writeJsonl(path.join(srcHome, '.claude', 'projects', '-Users-x-web', `${sid}.jsonl`), [
    { type: 'user', timestamp: new Date(lastMsg - 5000).toISOString(), cwd: '/Users/x/web', message: { content: 'Uprav hlavičku' } },
    { type: 'assistant', timestamp: new Date(lastMsg).toISOString(), message: { id: 'm1', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo' }], usage: { input_tokens: 3, output_tokens: 4 } } },
  ]);
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: srcHome });
  t.after(() => srv.close());
  const token = JSON.parse(await fs.readFile(path.join(srv.dataHome, 'data.json'), 'utf8')).ingestToken;
  const id = `claude-code:${sid}`;
  const before = (await api(srv.url).get(`/api/sessions/${encodeURIComponent(id)}`)).body.session.lastAt;
  const resets = Math.floor(Date.now() / 1000) + 3600;
  const payload = {
    session_id: sid,
    model: { id: 'claude-opus-5', display_name: 'Opus 5' },
    workspace: { current_dir: '/Users/x/web', repo: { host: 'github.com', owner: 'studio', name: 'web' } },
    context_window: { used_percentage: 41.4, context_window_size: 200000 },
    rate_limits: { five_hour: { used_percentage: 34, resets_at: resets }, seven_day: { used_percentage: 12.5, resets_at: resets + 86400 } },
    effort: { level: 'high' },
    pr: { number: 12, url: 'https://github.com/studio/web/pull/12', review_state: 'approved' },
  };
  const post = (headers) => fetch(`${srv.url}/api/hooks/claude-statusline`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });

  assert.equal((await post({})).status, 401);
  const res = await post({ 'X-Agenteeq-Token': token });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/plain/);
  const text = await res.text();
  assert.match(text, /^Agenteeq · Opus 5 · 5 h 34 % do \d{2}:\d{2} · týden 13 % · kontext 41 %$/);

  const st = (await api(srv.url).get('/api/state')).body;
  const five = st.limits.find((l) => l.id === 'claude:five_hour');
  assert.equal(five.usedPercent, 34);
  assert.equal(five.resetsAt, resets * 1000);
  assert.equal(five.windowMinutes, 300);
  assert.equal(st.limits.find((l) => l.id === 'claude:seven_day').windowMinutes, 10080);
  const s = await waitFor(async () => {
    const x = (await api(srv.url).get(`/api/sessions/${encodeURIComponent(id)}`)).body.session;
    return x.context ? x : null;
  });
  assert.deepEqual(s.context, { usedPercent: 41, size: 200000 });
  assert.equal(s.repo, 'studio/web');
  assert.equal(s.effort, 'high');
  assert.deepEqual(s.pr, { number: 12, url: 'https://github.com/studio/web/pull/12', state: 'approved' });
  assert.equal(s.lastAt, before, 'stavový řádek není aktivita agenta');

  const bad = await fetch(`${srv.url}/api/hooks/claude-statusline`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agenteeq-Token': token }, body: JSON.stringify({ session_id: '../x' }) });
  assert.equal(bad.status, 400);
});

test('upozornění na obnovený limit: jen čerpané okno, jednou, do 15 minut, jde vypnout', () => {
  const now = Date.parse('2026-09-11T14:30:00Z');
  const limits = [
    { id: 'claude:five_hour', app: 'Claude', label: 'Limit 5 h', usedPercent: 62, windowMinutes: 300, resetsAt: now - 2 * 60e3, reached: false },
    { id: 'codex:codex:secondary', app: 'Codex', label: 'Týdenní limit', usedPercent: 0, windowMinutes: 10080, resetsAt: now - 60e3, reached: false },
    { id: 'codex:codex:primary', app: 'Codex', label: 'Limit 5 h', usedPercent: 90, windowMinutes: 300, resetsAt: now - 40 * 60e3, reached: false },
    { id: 'claude:seven_day', app: 'Claude', label: 'Týdenní limit', usedPercent: 40, windowMinutes: 10080, resetsAt: now + 3600e3, reached: false },
  ];
  const ds = fakeDatastore({ limitReset: true });
  const engine = new AlertEngine({ store: { limitList: () => limits, emit() {}, on() {} }, datastore: ds, notifier: { native: async () => {} } });
  const first = engine.checkLimitResets(now);
  assert.deepEqual(first.map((a) => [a.kind, a.title]), [['limit_reset', 'Claude: 5hodinový limit je obnovený']]);
  assert.equal(engine.checkLimitResets(now + 30e3).length, 0, 'bez duplicit');
  ds.data.settings.notifications.limitReset = false;
  limits[0].resetsAt = now - 60e3 + 1;
  assert.equal(engine.checkLimitResets(now).length, 0);
});

test('selhání spuštění: stav „Selhalo“ s důvodem, nový tah ho zruší, „Hotovo“ jen po odpovědi', () => {
  const now = Date.now();
  const s = createSession({ connector: 'claude-code', localId: 'x', provider: 'anthropic', app: 'Claude Code' });
  s.lastAt = now - 1000;
  assert.equal(deriveStatus(s, now).reason, 'Zatím bez odpovědi agenta');
  s.failure = { text: 'Failed to authenticate', at: now - 500 };
  assert.deepEqual(deriveStatus(s, now), { status: 'failed', reason: 'Failed to authenticate', stale: false });
  Object.assign(s, { running: true, runningAt: now - 100 });
  assert.equal(deriveStatus(s, now).status, 'working');
  Object.assign(s, { running: false });
  s.failure = null;
  pushEntry(s, { at: now, role: 'assistant', text: 'Hotovo' });
  assert.equal(deriveStatus(s, now).reason, 'Hotovo, čeká na další zadání');
});

test('profilový obrázek: uloží se volba, null = iniciály, neplatná hodnota se odmítne', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const a = api(srv.url);
  assert.equal((await a.get('/api/state')).body.settings.avatar, null, 'výchozí jsou iniciály');
  assert.equal((await a.send('PUT', '/api/settings', { avatar: 3 })).body.settings.avatar, 3);
  assert.equal((await a.send('PUT', '/api/settings', { avatar: 999 })).status, 422);
  assert.equal((await a.send('PUT', '/api/settings', { avatar: 'x' })).status, 422);
  assert.equal((await a.get('/api/state')).body.settings.avatar, 3);
  assert.equal((await a.send('PUT', '/api/settings', { avatar: null })).body.settings.avatar, null);
});

test('běh, který skončí chybou, se v Agenteeq ukáže jako selhaná session s radou', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const cwd = await tempDir();
  const run = srv.app.runs.start({ agent: 'codex', label: 'Codex', argv: [process.execPath, '-e', 'console.error("Failed to authenticate: token expired"); process.exit(1)'], cwd, prompt: 'Oprav testy' });
  const s = await waitFor(() => srv.app.store.summary(`launch:${run.id}`));
  assert.equal(s.status, 'failed');
  assert.equal(s.title, 'Oprav testy');
  assert.match(s.reason, /Failed to authenticate: token expired\. Přihlas se v Terminálu příkazem codex login\./);
  const alerts = (await api(srv.url).get('/api/alerts')).body.items;
  assert.ok(alerts.some((a) => a.kind === 'failed' && a.sessionId === s.id), 'přijde upozornění');
  const tr = (await api(srv.url).get(`/api/sessions/${encodeURIComponent(s.id)}`)).body.transcript;
  assert.equal(tr.at(-1).role, 'error');
});
