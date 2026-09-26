import path from 'node:path';
import { appSupportDir } from '../platform.js';
import { statSafe, toTs, clip, DAY, MIN } from '../util.js';
import { createSession, touch } from '../model.js';
import { watchTree, createFileQueue } from '../watch.js';
import { readClaudeDesktopCache } from '../claude-desktop-cache.js';
import { applyClaudeLine, newFileState } from './claude-code.js';

const SESSION = /^session_[A-Za-z0-9]{8,80}$/;
export const remoteId = (value) => typeof value === 'string' && SESSION.test(value) ? value : '';

// Desktop's persisted query cache contains server-reported remote-session metadata.
// Its separate code conversation cache may hold only an older portion of the transcript.
// Never infer missing turns/tokens, an elapsed working period, or a fresh process from mtime.
export function remoteSessions(records) {
  const cache = records.find((x) => x.key === 'react-query-cache')?.value;
  const queries = cache?.clientState?.queries;
  if (!Array.isArray(queries)) return null;
  const matching = queries.filter((q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'sessions_api_list_sessions');
  if (!matching.length) return null;
  const sessions = new Map();
  for (const q of matching) {
    for (const page of q.state?.data?.pages || []) {
      for (const s of Array.isArray(page?.data) ? page.data : []) {
        if (s?.type !== 'session' || !remoteId(s.id) || !Number.isFinite(Date.parse(s.updated_at))) continue;
        const old = sessions.get(s.id);
        if (!old || Date.parse(s.updated_at) > Date.parse(old.updated_at)) sessions.set(s.id, { ...s, _observedAt: Number(q.state?.dataUpdatedAt) || 0 });
      }
    }
  }
  return { sessions: [...sessions.values()], observedAt: Math.max(0, ...matching.map((q) => Number(q.state?.dataUpdatedAt) || 0)) };
}
export function applyRemoteSession(s, metadata, cached, observedAt, now = Date.now()) {
  const st = newFileState(), seen = new Set();
  const messages = cached?.tree?.kind === 'code_session' && Array.isArray(cached.tree.messages) ? cached.tree.messages : [];
  const ordered = messages.filter((m) => m && ['user', 'assistant', 'result'].includes(m.type))
    .sort((a, b) => toTs(a.created_at || a.timestamp) - toTs(b.created_at || b.timestamp));
  for (const m of ordered) {
    // SDK subagent output does not belong to the parent's token counts.
    if (m.parent_tool_use_id) continue;
    const id = m.uuid || m.event_uuid;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const ts = toTs(m.created_at || m.timestamp);
    if (!ts || ts > now) continue;
    if (m.type === 'result') { s.running = false; s.toolWaitSince = 0; continue; }
    applyClaudeLine(st, s, { ...m, timestamp: new Date(ts).toISOString() });
  }
  const updated = Math.min(Date.parse(metadata.updated_at), now);
  const created = Date.parse(metadata.created_at);
  if (Number.isFinite(created) && created > 0 && created <= updated) s.startedAt = created;
  // One point = reported source update, not a continuous multi-day work span.
  touch(s, updated);
  s.title = clip(typeof metadata.title === 'string' ? metadata.title : '', 100);
  s.source = 'desktop-cache';
  s.app = 'Claude Desktop · vzdálený Code';
  s.url = `https://claude.ai/code/${metadata.id}`;
  s.resume = null; s.cwd = ''; // Remote VM paths are never local folders/resume commands.
  s.model = clip(typeof metadata.session_context?.model === 'string' ? metadata.session_context.model : s.model, 80);
  const repo = metadata.session_context?.sources?.find((x) => x?.type === 'git_repository');
  if (repo && typeof repo.url === 'string') {
    const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)(?:\.git)?$/.exec(repo.url);
    if (match) s.repo = match[1].replace(/\.git$/, '');
    if (typeof repo.revision === 'string') s.branch = clip(repo.revision, 100);
  }
  applyReportedStatus(s, metadata, observedAt, now);
  s.observation = {
    at: observedAt, transcriptThrough: messages.reduce((at, m) => Math.max(at, toTs(m.created_at || m.timestamp) || 0), 0),
    partial: true, // Cache is never an authoritative complete transcript.
  };
  return s;
}
function applyReportedStatus(s, metadata, observedAt, now) {
  const updated = Math.min(Date.parse(metadata.updated_at), now);
  const fresh = observedAt > 0 && observedAt <= now + 1000 && now - observedAt < 2 * MIN;
  s.running = fresh && ['running', 'working', 'busy'].includes(metadata.session_status);
  s.runningAt = Math.min(observedAt || updated, now);
  s.staleMs = 2 * MIN;
  s.toolWaitSince = 0;
  s.activity = s.running ? 'Pracuje podle stavu v Claude Desktopu' : '';
  s.pending = null; s.limit = null; s.failure = null;
  const category = metadata.post_turn_summary?.status_category;
  if (['failed', 'error'].includes(metadata.status_bucket) || category === 'failed') {
    s.running = false;
    s.failure = { at: updated, text: 'Vzdálený agent skončil chybou. Podrobnosti otevři v Claude.' };
  } else if (fresh && (metadata.session_status === 'needs_input' || category === 'needs_action')) {
    s.pending = { kind: 'question', at: s.runningAt, text: 'Vzdálený agent potřebuje rozhodnutí. Otevři Claude.', source: 'desktop-cache' };
  }
}
export function createClaudeDesktopCodeConnector({ config, store }) {
  const root = path.join(appSupportDir(config.sourceHome), 'Claude', 'IndexedDB');
  const dir = path.join(root, 'https_claude.ai_0.indexeddb.leveldb');
  let watcher, exists = false, lastEventAt = 0, error = '', stopped = false;
  const known = new Set(), fingerprints = new Map();
  const queue = createFileQueue(sync, 60);
  async function sync() {
    if (stopped) return;
    exists = Boolean(await statSafe(dir));
    if (!exists) return;
    try {
      const records = await readClaudeDesktopCache(dir), data = remoteSessions(records);
      if (!data) { error = 'Cache neobsahuje seznam vzdálených agentů. Otevři v Claude kartu Code.'; return; }
      const cache = new Map();
      for (const { value } of records) {
        if (value?.product !== 'code' || value.tree?.kind !== 'code_session') continue;
        const id = remoteId(String(value.conversationUuid || '').replace(/^code:cse_/, 'session_'));
        if (id && (!cache.has(id) || (value.writtenAt || 0) > (cache.get(id).writtenAt || 0))) cache.set(id, value);
      }
      for (const metadata of data.sessions) {
        if (Date.now() - Date.parse(metadata.updated_at) > config.windowDays * DAY) continue;
        const id = `claude-desktop-code:${metadata.id}`;
        const { _observedAt, ...facts } = metadata;
        const fingerprint = JSON.stringify([facts, cache.get(metadata.id)?.writtenAt]);
        known.add(id);
        if (fingerprints.get(id) === fingerprint) {
          const existing = store.get(id);
          if (existing && existing.observation.at !== _observedAt) {
            applyReportedStatus(existing, metadata, _observedAt, Date.now());
            existing.observation.at = _observedAt;
            store.commit(existing); // Refresh reported status, preserve transcript and open UI.
          }
          continue;
        }
        const s = createSession({ connector: 'claude-desktop-code', localId: metadata.id, provider: 'anthropic', app: 'Claude Desktop · vzdálený Code' });
        const previous = store.get(id);
        if (previous) s.seq = previous.seq; // A shorter cache must not look like an older SSE snapshot.
        applyRemoteSession(s, metadata, cache.get(metadata.id), metadata._observedAt);
        s.resetTranscript = Boolean(previous);
        store.sessions.set(id, s);
        store.commit(s);
        fingerprints.set(id, fingerprint);
        lastEventAt = Date.now();
      }
      // The list is paginated: absence from its first page is not proof of deletion.
      error = '';
    } catch {
      error = 'Cache Claude se právě zapisuje nebo má neznámý formát. Poslední záznamy zůstávají zachované; načtení se zopakuje.';
    }
  }
  return {
    id: 'claude-desktop-code', name: 'Claude Desktop · vzdálený Code', provider: 'anthropic', kind: 'local', verified: false,
    source: 'Claude/IndexedDB (místní cache vzdálených relací)',
    description: 'Vzdálení agenti, poslední hlášený stav a dostupná část přepisu. Interní formát Claude Desktopu; tokeny mohou být neúplné.',
    async start() { await queue.run(dir); watcher = watchTree(root, () => queue.schedule(dir), { retryMs: 500 }); },
    scan: () => queue.run(dir),
    stop() { stopped = true; watcher?.close(); queue.clear(); }, idle: () => queue.idle(),
    status: () => ({ state: error ? 'error' : !exists ? 'missing' : known.size ? 'connected' : exists ? 'idle' : 'missing', detail: error || (known.size ? `Sleduji ${known.size} vzdálených relací z místní cache Claude Desktopu.` : 'Zatím bez místní cache vzdálených agentů.'), count: known.size, watching: Boolean(watcher?.active), lastEventAt }),
  };
}
