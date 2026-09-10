import path from 'node:path';
import { statSafe, readJson, toTs, textOf, isInjectedPrompt, clip, clipBlock, MIN, DAY } from '../util.js';
import { touch, addTokens, pushEntry, resetTranscript } from '../model.js';
import { watchTree, createFileQueue, listFiles } from '../watch.js';

export function roleOf(m) {
  const t = String(m?.type || m?.role || '').toLowerCase();
  if (t === 'user') return 'user';
  if (['gemini', 'model', 'assistant', 'qwen'].includes(t)) return 'assistant';
  if (t === 'error') return 'error';
  if (t === 'tool') return 'tool';
  return 'system';
}

// Gemini CLI a Qwen Code (fork Gemini CLI) ukládají chaty jako JSON: ~/.gemini/tmp/<projekt>/chats/*.json.
export function applyGeminiChat(s, j, mtimeMs, now = Date.now()) {
  s.tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  s.hourly = {};
  s.turns = 0;
  s.startedAt = 0;
  s.lastAt = 0;
  s.minutes = new Set();
  resetTranscript(s);
  const messages = Array.isArray(j.messages) ? j.messages : [];
  for (const m of messages) {
    const ts = toTs(m.timestamp) || toTs(j.lastUpdated) || mtimeMs;
    touch(s, ts);
    const role = roleOf(m);
    const raw = typeof m.content === 'string' ? m.content : textOf(m.content?.parts ?? m.content ?? m.parts);
    const text = clipBlock(raw, 4000);
    if (role === 'user') {
      if (text && !isInjectedPrompt(text)) {
        s.turns++;
        s.lastPrompt = text;
        if (!s.firstPrompt) s.firstPrompt = text;
        pushEntry(s, { at: ts, role, text });
      }
    } else if (text) {
      pushEntry(s, { at: ts, role, text });
    }
    for (const call of Array.isArray(m.toolCalls) ? m.toolCalls : []) {
      pushEntry(s, {
        at: ts,
        role: 'tool',
        tool: clip(call?.displayName || call?.name || 'Nástroj', 60),
        text: clip(call?.description || (call?.args ? JSON.stringify(call.args) : ''), 300),
        status: call?.status === 'error' ? 'error' : undefined,
      });
    }
    if (typeof m.model === 'string') s.model = m.model;
    const t = m.tokens;
    if (t && typeof t === 'object') {
      addTokens(s, ts, {
        input: Math.max(0, (t.input || 0) - (t.cached || 0)),
        output: (t.output || 0) + (t.thoughts || 0),
        cacheRead: t.cached || 0,
      });
    }
  }
  touch(s, toTs(j.startTime));
  if (typeof j.projectRoot === 'string') s.cwd = j.projectRoot;
  const last = messages[messages.length - 1];
  s.staleMs = 2 * MIN;
  s.running = Boolean(last) && roleOf(last) === 'user' && now - mtimeMs < 2 * MIN;
  s.runningAt = mtimeMs;
  s.turnStartedAt = s.running ? toTs(last.timestamp) || mtimeMs : 0;
}

export function createGeminiFamilyConnector(ctx, { id, name, dir, provider, app, verified = false }) {
  const { store, config } = ctx;
  const root = path.join(config.sourceHome, dir, 'tmp');
  const windowMs = config.windowDays * DAY;
  const seen = new Map();
  let watcher = null;
  let exists = false;
  let lastEventAt = 0;
  const queue = createFileQueue(sync, 150);

  async function sync(file) {
    if (!file.endsWith('.json') || path.basename(path.dirname(file)) !== 'chats') return;
    const stat = await statSafe(file);
    if (!stat?.isFile() || Date.now() - stat.mtimeMs > windowMs) return;
    if (seen.get(file) === stat.mtimeMs) return;
    const j = await readJson(file, null);
    if (!j || !Array.isArray(j.messages) || !j.messages.length) return;
    seen.set(file, stat.mtimeMs);
    const s = store.ensure({ connector: id, localId: String(j.sessionId || path.basename(file, '.json')), provider, app });
    applyGeminiChat(s, j, stat.mtimeMs);
    lastEventAt = Date.now();
    store.commit(s);
  }

  async function scan() {
    exists = Boolean(await statSafe(path.join(config.sourceHome, dir)));
    for (const f of await listFiles(root, 2, (x) => x.endsWith('.json'))) await queue.run(f);
  }

  return {
    id,
    name,
    provider,
    kind: 'local',
    verified,
    source: `~/${dir}/tmp/*/chats`,
    description: 'Přepis chatů, modely a tokeny z uložených sessions.',
    async start() {
      await scan();
      watcher = watchTree(root, (f) => (f ? queue.schedule(f) : scan()));
    },
    scan,
    stop() {
      watcher?.close();
      queue.clear();
    },
    idle: () => queue.idle(),
    status() {
      const count = seen.size;
      return {
        state: count ? 'connected' : exists ? 'idle' : 'missing',
        detail: count
          ? `Sleduji ${count} chatů.`
          : exists
            ? `${app} je nainstalovaný, ale zatím neuložil žádný chat.`
            : `${app} na tomto počítači není.`,
        count,
        watching: Boolean(watcher?.active),
        lastEventAt,
      };
    },
  };
}
