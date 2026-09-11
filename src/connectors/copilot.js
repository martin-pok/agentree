import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonlTail, statSafe, readJson, readdirSafe, toTs, textOf, isInjectedPrompt, clip, clipBlock, MIN, DAY } from '../util.js';
import { touch, pushEntry, resetTranscript, addTokens } from '../model.js';
import { watchTree, createFileQueue } from '../watch.js';

/* ---------- GitHub Copilot v VS Code (chatSessions/*.json) ---------- */

export function applyVsCodeChat(s, j, mtimeMs, now = Date.now()) {
  resetTranscript(s);
  s.turns = 0;
  s.startedAt = 0;
  s.lastAt = 0;
  s.minutes = new Set();
  touch(s, toTs(j.creationDate));
  const requests = Array.isArray(j.requests) ? j.requests : [];
  let lastComplete = true;
  for (const r of requests) {
    const at = toTs(r.timestamp) || toTs(j.lastMessageDate) || mtimeMs;
    touch(s, at);
    const prompt = clipBlock(r.message?.text || textOf(r.message?.parts) || '', 4000);
    if (prompt && !isInjectedPrompt(prompt)) {
      s.turns++;
      s.lastPrompt = prompt;
      if (!s.firstPrompt) s.firstPrompt = prompt;
      pushEntry(s, { at, role: 'user', text: prompt });
    }
    let answer = '';
    for (const part of Array.isArray(r.response) ? r.response : []) {
      if (typeof part?.value === 'string' && !part.kind) answer += part.value;
      else if (part?.kind === 'markdownContent') answer += part.content?.value || '';
      else if (part?.kind === 'toolInvocationSerialized' || part?.kind === 'toolInvocation') {
        if (answer.trim()) { pushEntry(s, { at, role: 'assistant', text: clipBlock(answer, 4000) }); answer = ''; }
        pushEntry(s, {
          at,
          role: 'tool',
          tool: clip(part.toolId || 'Nástroj', 60),
          text: clip(part.pastTenseMessage?.value || part.invocationMessage?.value || '', 300),
        });
      }
    }
    if (answer.trim()) pushEntry(s, { at, role: 'assistant', text: clipBlock(answer, 4000) });
    if (r.result?.errorDetails?.message) pushEntry(s, { at, role: 'error', text: clip(r.result.errorDetails.message, 400) });
    if (typeof r.modelId === 'string') s.model = r.modelId.replace(/^copilot\//, '');
    lastComplete = Boolean(r.result);
  }
  touch(s, toTs(j.lastMessageDate));
  if (typeof j.customTitle === 'string' && j.customTitle) s.title = j.customTitle;
  s.staleMs = 2 * MIN;
  s.running = requests.length > 0 && !lastComplete && now - mtimeMs < 2 * MIN;
  s.runningAt = mtimeMs;
}

async function workspaceFolder(chatFile) {
  const ws = await readJson(path.join(path.dirname(path.dirname(chatFile)), 'workspace.json'), null);
  const uri = ws?.folder || ws?.workspace;
  if (typeof uri !== 'string' || !uri.startsWith('file://')) return '';
  try { return fileURLToPath(uri); } catch { return ''; }
}

export function createVsCodeCopilotConnector(ctx) {
  const { store, config } = ctx;
  const base = path.join(config.sourceHome, 'Library', 'Application Support');
  const editions = ['Code', 'Code - Insiders'];
  const windowMs = config.windowDays * DAY;
  const seen = new Map();
  const watchers = [];
  let lastEventAt = 0;
  let exists = false;
  const queue = createFileQueue(sync, 200);

  async function sync(file) {
    if (!file.endsWith('.json')) return;
    const parent = path.basename(path.dirname(file));
    if (parent !== 'chatSessions' && parent !== 'emptyWindowChatSessions') return;
    const stat = await statSafe(file);
    if (!stat?.isFile() || Date.now() - stat.mtimeMs > windowMs || seen.get(file) === stat.mtimeMs) return;
    const j = await readJson(file, null);
    seen.set(file, stat.mtimeMs);
    if (!j || !Array.isArray(j.requests) || !j.requests.length) return;
    const s = store.ensure({ connector: 'vscode-copilot', localId: String(j.sessionId || path.basename(file, '.json')), provider: 'github', app: 'Copilot · VS Code' });
    applyVsCodeChat(s, j, stat.mtimeMs);
    if (parent === 'chatSessions') s.cwd = await workspaceFolder(file);
    lastEventAt = Date.now();
    store.commit(s);
  }

  async function scan() {
    exists = false;
    for (const ed of editions) {
      const user = path.join(base, ed, 'User');
      if (!(await statSafe(user))) continue;
      exists = true;
      for (const ws of await readdirSafe(path.join(user, 'workspaceStorage'))) {
        if (!ws.isDirectory()) continue;
        const dir = path.join(user, 'workspaceStorage', ws.name, 'chatSessions');
        for (const f of await readdirSafe(dir)) if (f.isFile()) await queue.run(path.join(dir, f.name));
      }
      const empty = path.join(user, 'globalStorage', 'emptyWindowChatSessions');
      for (const f of await readdirSafe(empty)) if (f.isFile()) await queue.run(path.join(empty, f.name));
    }
  }

  return {
    id: 'vscode-copilot',
    name: 'GitHub Copilot · VS Code',
    provider: 'github',
    kind: 'local',
    verified: false,
    source: '~/Library/Application Support/Code/User/…/chatSessions',
    description: 'Chaty a agentní režim Copilotu ve VS Code: přepis, nástroje a model.',
    async start() {
      await scan();
      for (const ed of editions) {
        const user = path.join(base, ed, 'User');
        watchers.push(watchTree(path.join(user, 'workspaceStorage'), (f) => (f ? queue.schedule(f) : null)));
        watchers.push(watchTree(path.join(user, 'globalStorage', 'emptyWindowChatSessions'), (f) => (f ? queue.schedule(f) : null)));
      }
    },
    scan,
    stop() {
      for (const w of watchers) w.close();
      queue.clear();
    },
    idle: () => queue.idle(),
    status() {
      const count = [...store.sessions.values()].filter((x) => x.connector === 'vscode-copilot').length;
      return {
        state: count ? 'connected' : exists ? 'idle' : 'missing',
        detail: count ? `Sleduji ${count} chatů Copilotu.` : exists ? 'VS Code je nainstalovaný, ale nemá uložené chaty Copilotu.' : 'VS Code na tomto počítači není.',
        count,
        watching: watchers.some((w) => w.active),
        lastEventAt,
      };
    },
  };
}

/* ---------- GitHub Copilot CLI (~/.copilot/session-state) ---------- */

export function applyCopilotEvent(s, o) {
  const ts = toTs(o.timestamp || o.time || o.createdAt) || Date.now();
  const type = String(o.type || o.kind || '');
  const d = o.data && typeof o.data === 'object' ? o.data : o;
  touch(s, ts);
  if (/session\.start/.test(type)) {
    const cwd = d.context?.cwd || d.cwd;
    if (typeof cwd === 'string') s.cwd = cwd;
    if (typeof d.selectedModel === 'string') s.model = d.selectedModel;
    return;
  }
  if (/model_change|model\.change/.test(type) && typeof d.newModel === 'string') { s.model = d.newModel; return; }
  if (/user\.message/.test(type)) {
    const text = clipBlock(textOf(d.content) || d.content || d.message || '', 4000);
    if (typeof text === 'string' && text && !isInjectedPrompt(text)) {
      s.turns++;
      s.lastPrompt = text;
      if (!s.firstPrompt) s.firstPrompt = text;
      pushEntry(s, { at: ts, role: 'user', text });
      s.running = true;
      s.runningAt = ts;
      s.turnStartedAt = ts;
      s.turnSteps = 0;
      s.activity = 'Přemýšlí…';
    }
    return;
  }
  if (/assistant\.message/.test(type)) {
    const text = clipBlock(textOf(d.content) || d.content || '', 4000);
    if (typeof text === 'string' && text) pushEntry(s, { at: ts, role: 'assistant', text });
    s.runningAt = ts;
    return;
  }
  if (/tool\.execution_start|tool\.start/.test(type)) {
    const tool = clip(d.toolName || d.name || 'Nástroj', 60);
    const detail = clip(d.arguments?.command || d.arguments?.description || d.arguments?.path || '', 300);
    pushEntry(s, { at: ts, role: 'tool', tool, text: detail });
    s.turnSteps++;
    s.activity = clip(`${tool}${detail ? `: ${detail}` : ''}`, 160);
    s.running = true;
    s.runningAt = ts;
    return;
  }
  if (/assistant\.turn_end|session\.idle|turn\.end/.test(type)) {
    s.running = false;
    s.activity = '';
    return;
  }
  if (/usage/.test(type)) {
    addTokens(s, ts, { input: d.inputTokens || d.input_tokens || 0, output: d.outputTokens || d.output_tokens || 0, cacheRead: d.cacheReadTokens || 0 });
    return;
  }
  if (/error/.test(type)) {
    pushEntry(s, { at: ts, role: 'error', text: clip(d.message || JSON.stringify(d), 300) });
  }
}

export function createCopilotCliConnector(ctx) {
  const { store, config } = ctx;
  const root = path.join(config.sourceHome, '.copilot');
  const windowMs = config.windowDays * DAY;
  const tails = new Map();
  let watcher = null;
  let exists = false;
  let lastEventAt = 0;
  const queue = createFileQueue(sync, 80);

  async function sync(file) {
    if (!file.endsWith('.jsonl') || !file.includes(`${path.sep}session-state${path.sep}`)) return;
    const stat = await statSafe(file);
    if (!stat?.isFile()) return;
    let tail = tails.get(file);
    if (!tail) {
      if (Date.now() - stat.mtimeMs > windowMs) return;
      tail = new JsonlTail(file);
      tails.set(file, tail);
    }
    const rel = path.relative(path.join(root, 'session-state'), file).split(path.sep);
    const localId = rel.length > 1 ? rel[0] : path.basename(file, '.jsonl');
    const s = store.ensure({ connector: 'copilot-cli', localId, provider: 'github', app: 'Copilot CLI' });
    s.staleMs = 3 * MIN;
    s.resume = `copilot --resume ${localId}`;
    const lines = await tail.read(stat.size);
    for (const o of lines) applyCopilotEvent(s, o);
    if (lines.length) lastEventAt = Date.now();
    store.commit(s);
  }

  async function scan() {
    exists = Boolean(await statSafe(root));
    const dir = path.join(root, 'session-state');
    for (const e of await readdirSafe(dir)) {
      const full = path.join(dir, e.name);
      if (e.isFile()) await queue.run(full);
      else if (e.isDirectory()) for (const f of await readdirSafe(full)) if (f.isFile()) await queue.run(path.join(full, f.name));
    }
  }

  return {
    id: 'copilot-cli',
    name: 'GitHub Copilot CLI',
    provider: 'github',
    kind: 'local',
    verified: false,
    source: '~/.copilot/session-state',
    description: 'Konverzace Copilotu v Terminálu: zadání, odpovědi, použité nástroje a průběh práce.',
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
      const count = tails.size;
      return {
        state: count ? 'connected' : exists ? 'idle' : 'missing',
        detail: count ? `Sleduji ${count} konverzací.` : exists ? 'Copilot CLI je nainstalovaný, ale nemá uložené konverzace.' : 'Copilot CLI na tomto počítači není.',
        count,
        watching: Boolean(watcher?.active),
        lastEventAt,
      };
    },
  };
}
