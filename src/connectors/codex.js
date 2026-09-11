import path from 'node:path';
import { JsonlTail, statSafe, toTs, textOf, isInjectedPrompt, clip, clipBlock, lastSegment, hourKey, MIN, DAY } from '../util.js';
import { touch, pushEntry, resetTranscript } from '../model.js';
import { watchTree, createFileQueue, listFiles, depthOf } from '../watch.js';

const UUID_TAIL = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TASK_TAG = /^\s*<scheduled-task\s+name="([^"<>]{1,80})"/;

// Plánované spuštění vkládá zadání do značky <scheduled-task name="…">; její název je jediný lidský popis vlákna.
export const scheduledTaskName = (text) => TASK_TAG.exec(text || '')?.[1]?.trim() || '';

// Pomocné vlákno (automatická kontrola příkazů, spuštěný pomocný agent) nese ID rodičovské konverzace.
export function subagentOf(meta) {
  if (typeof meta?.parent_thread_id !== 'string' || !UUID.test(meta.parent_thread_id)) return null;
  const parentId = `codex:${meta.parent_thread_id}`;
  const sub = meta.source?.subagent;
  if (sub?.thread_spawn) {
    const nick = typeof sub.thread_spawn.agent_nickname === 'string' ? sub.thread_spawn.agent_nickname.trim() : '';
    return { parentId, kind: 'agent', label: nick ? `Pomocný agent ${clip(nick, 40)}` : 'Pomocný agent' };
  }
  if (meta.thread_source === 'guardian_review' || sub?.other === 'guardian') return { parentId, kind: 'review', label: 'Automatická kontrola Codexu' };
  return { parentId, kind: 'other', label: 'Pomocné vlákno Codexu' };
}

export function codexAppName(originator = '') {
  if (/desktop/i.test(originator)) return 'Codex · ChatGPT app';
  if (/vscode/i.test(originator)) return 'Codex · VS Code';
  if (/exec/i.test(originator)) return 'Codex · na pozadí';
  return 'Codex CLI';
}

export function windowLabel(minutes) {
  if (minutes === 300) return 'Limit 5 h';
  if (minutes === 10080) return 'Týdenní limit';
  if (minutes >= 1440 && minutes % 1440 === 0) return `Limit ${minutes / 1440} d`;
  return minutes ? `Limit ${Math.round(minutes / 60)} h` : 'Limit';
}

const parseJson = (v) => {
  if (typeof v !== 'string') return v && typeof v === 'object' ? v : null;
  try { return JSON.parse(v); } catch { return null; }
};

export function planProgress(plan) {
  if (!Array.isArray(plan) || !plan.length) return null;
  const done = plan.filter((p) => p?.status === 'completed').length;
  const current = plan.find((p) => p?.status === 'in_progress');
  return { done, total: plan.length, current: clip(current?.step || '', 140) };
}

export function mapCodexItem(item) {
  switch (item?.type) {
    case 'UserMessage': {
      const text = textOf(item.content).trim();
      return text && !isInjectedPrompt(text) ? { role: 'user', text: clipBlock(text, 4000) } : null;
    }
    case 'AgentMessage': {
      const text = textOf(item.content).trim();
      return text ? { role: 'assistant', text: clipBlock(text, 4000) } : null;
    }
    case 'CommandExecution': {
      const cmd = Array.isArray(item.command) ? item.command.join(' ') : item.command || item.commandLine || '';
      const failed = item.status === 'failed' || (typeof item.exitCode === 'number' && item.exitCode !== 0);
      return { role: 'tool', tool: 'Shell', text: clipBlock(String(cmd), 600), status: failed ? 'error' : undefined };
    }
    case 'McpToolCall':
      return {
        role: 'tool',
        tool: clip(item.appName || item.server || 'MCP', 40),
        text: clip(item.actionName || item.tool || '', 200),
        status: item.status === 'failed' ? 'error' : undefined,
      };
    case 'FileChange': {
      const changes = item.changes || item.files;
      let names = [];
      if (Array.isArray(changes)) names = changes.map((c) => lastSegment(typeof c === 'string' ? c : c?.path || c?.file || ''));
      else if (changes && typeof changes === 'object') names = Object.keys(changes).map(lastSegment);
      return { role: 'tool', tool: 'Úprava souborů', text: names.filter(Boolean).slice(0, 6).join(', ') };
    }
    case 'WebSearch':
      return { role: 'tool', tool: 'Web', text: clip(item.query || item.action?.query || '', 200) };
    case 'ContextCompaction':
      return { role: 'system', text: 'Starší část konverzace byla shrnuta' };
    default:
      return null;
  }
}

export function createCodexConnector(ctx) {
  const { store, config } = ctx;
  const root = path.join(config.sourceHome, '.codex', 'sessions');
  const windowMs = config.windowDays * DAY;
  const files = new Map();
  let watcher = null;
  let exists = false;
  let lastEventAt = 0;
  const queue = createFileQueue(sync);
  const indexFile = path.join(config.sourceHome, '.codex', 'session_index.jsonl');
  const titles = new Map();
  let indexTail = null;

  // Názvy vláken z aplikace ChatGPT/Codex: append-only index, platí nejnovější updated_at.
  async function syncIndex() {
    const stat = await statSafe(indexFile);
    if (!stat?.isFile()) return;
    if (!indexTail || stat.size < indexTail.offset) {
      indexTail = new JsonlTail(indexFile);
      titles.clear();
    }
    const changed = new Set();
    for (const r of await indexTail.read(stat.size)) {
      if (typeof r?.id !== 'string' || typeof r.thread_name !== 'string' || !r.thread_name.trim()) continue;
      const at = toTs(r.updated_at);
      const prev = titles.get(r.id);
      if (prev && prev.at > at) continue;
      titles.set(r.id, { name: clip(r.thread_name, 100), at });
      changed.add(r.id);
    }
    for (const id of changed) {
      const s = store.get(`codex:${id}`);
      if (s) {
        s.title = titles.get(id).name;
        store.commit(s);
      }
    }
  }

  function addEntry(s, e, ts) {
    pushEntry(s, { ...e, at: ts });
    if (e.role === 'tool') {
      s.turnSteps++;
      s.activity = clip(`${e.tool}${e.text ? `: ${e.text}` : ''}`, 160);
    }
    if (e.role === 'user') {
      s.lastPrompt = e.text;
      if (!s.firstPrompt) s.firstPrompt = e.text;
    }
    if (s.running && ts > s.runningAt) s.runningAt = ts;
  }

  function rateLimits(s, rl, ts) {
    for (const slot of ['primary', 'secondary']) {
      const w = rl[slot];
      if (!w || typeof w.used_percent !== 'number') continue;
      const resetsAt = toTs(w.resets_at) || (typeof w.resets_in_seconds === 'number' ? ts + w.resets_in_seconds * 1000 : null);
      store.setLimit({
        id: `codex:${rl.limit_id || 'codex'}:${slot}`,
        provider: 'openai',
        app: 'Codex',
        label: windowLabel(w.window_minutes),
        usedPercent: w.used_percent,
        windowMinutes: w.window_minutes || null,
        resetsAt,
        reached: w.used_percent >= 100 || Boolean(rl.rate_limit_reached_type),
        plan: rl.plan_type || null,
        text: '',
        at: ts,
      });
    }
    const c = rl.credits;
    if (c && (c.has_credits || Number(c.balance) > 0)) {
      store.setCredits({ id: 'codex', provider: 'openai', app: 'Codex', label: 'Kredity Codex', balance: Number(c.balance), unlimited: Boolean(c.unlimited), at: ts });
    }
    if (rl.rate_limit_reached_type) {
      s.limit = { reached: true, text: `Limit plánu ${rl.plan_type || ''} je vyčerpaný`.replace('  ', ' '), at: ts, resetsAt: toTs(rl.primary?.resets_at) || null };
    } else if (s.limit && ts > s.limit.at) {
      s.limit = null;
    }
  }

  function apply(st, s, o) {
    const ts = toTs(o.timestamp);
    const p = o.payload || {};
    switch (o.type) {
      case 'session_meta': {
        if (p.cwd) s.cwd = p.cwd;
        s.app = codexAppName(p.originator);
        if (p.git?.branch) s.branch = p.git.branch;
        if (p.id) s.resume = `codex resume ${p.id}`;
        const sub = subagentOf(p);
        if (sub) {
          s.parentId = sub.parentId;
          s.subagent = { kind: sub.kind, label: sub.label };
        }
        touch(s, toTs(p.timestamp) || ts);
        return;
      }
      case 'turn_context':
        if (p.model) s.model = p.model;
        if (p.cwd) s.cwd = p.cwd;
        return;
      case 'compacted':
        pushEntry(s, { at: ts, role: 'system', text: 'Starší část konverzace byla shrnuta' });
        return;
      case 'event_msg':
        switch (p.type) {
          case 'task_started':
            s.turns++;
            s.running = true;
            s.runningAt = ts;
            s.turnStartedAt = ts;
            s.turnSteps = 0;
            s.activity = 'Přemýšlí…';
            s.pending = null;
            touch(s, ts);
            return;
          case 'task_complete':
            s.running = false;
            s.activity = '';
            touch(s, ts);
            return;
          case 'token_count': {
            const t = p.info?.total_token_usage;
            if (t) {
              const cached = t.cached_input_tokens || 0;
              const cur = { input: (t.input_tokens || 0) - cached, output: t.output_tokens || 0, cacheWrite: t.cache_write_input_tokens || 0, cacheRead: cached };
              const processed = cur.input + cur.output + cur.cacheWrite;
              // Codex své počítadlo občas vynuluje (např. po zkomprimování kontextu). Spotřeba před vynulováním se nezahazuje.
              if (st.lastTokens && processed < st.prevProcessed) {
                for (const key of Object.keys(st.tokenBase)) st.tokenBase[key] += st.lastTokens[key];
                st.prevProcessed = 0;
              }
              if (processed > st.prevProcessed) {
                const k = hourKey(ts);
                s.hourly[k] = (s.hourly[k] || 0) + (processed - st.prevProcessed);
                st.prevProcessed = processed;
              }
              st.lastTokens = cur;
              s.tokens = {
                input: st.tokenBase.input + cur.input,
                output: st.tokenBase.output + cur.output,
                cacheWrite: st.tokenBase.cacheWrite + cur.cacheWrite,
                cacheRead: st.tokenBase.cacheRead + cur.cacheRead,
              };
            }
            if (p.rate_limits) rateLimits(s, p.rate_limits, ts);
            touch(s, ts);
            return;
          }
          case 'item_completed': {
            if (!st.useItems) {
              // Nový formát přepisu je úplný — položky ze starého formátu (response_item) zahodit i s odvozenými poli.
              st.useItems = true;
              resetTranscript(s);
              s.firstPrompt = '';
              s.lastPrompt = '';
            }
            if (p.item?.type === 'UserMessage' && !s.taskName) s.taskName = scheduledTaskName(textOf(p.item.content));
            const e = mapCodexItem(p.item);
            if (e) addEntry(s, e, ts);
            touch(s, ts);
            return;
          }
          default:
            return;
        }
      case 'response_item': {
        if (p.type === 'function_call' && p.name === 'update_plan') {
          const progress = planProgress(parseJson(p.arguments)?.plan);
          if (progress) s.progress = progress;
        }
        if (st.useItems) return;
        if (p.type === 'message') {
          const text = textOf(p.content).trim();
          if (!text) return;
          if (p.role === 'user' && !s.taskName) s.taskName = scheduledTaskName(text);
          if (p.role === 'user' && !isInjectedPrompt(text)) addEntry(s, { role: 'user', text: clipBlock(text, 4000) }, ts);
          else if (p.role === 'assistant') addEntry(s, { role: 'assistant', text: clipBlock(text, 4000) }, ts);
        } else if (p.type === 'function_call' || p.type === 'custom_tool_call') {
          const args = parseJson(p.arguments);
          const cmd = args?.cmd ?? args?.command;
          const detail = Array.isArray(cmd) ? cmd.join(' ') : typeof cmd === 'string' ? cmd : typeof p.input === 'string' ? p.input : '';
          const tool = ['exec', 'shell', 'exec_command', 'local_shell'].includes(p.name) ? 'Shell' : p.name;
          addEntry(s, { role: 'tool', tool, text: clipBlock(detail, 600) }, ts);
        }
        touch(s, ts);
        return;
      }
      default:
        return;
    }
  }

  async function sync(file) {
    if (!file.endsWith('.jsonl') || depthOf(root, file) !== 3) return;
    const stat = await statSafe(file);
    if (!stat?.isFile()) return;
    let st = files.get(file);
    if (!st && Date.now() - stat.mtimeMs > windowMs) return;
    if (st && stat.size < st.tail.offset) {
      store.remove(`codex:${st.localId}`);
      files.delete(file);
      st = null;
    }
    if (!st) {
      const base = path.basename(file, '.jsonl');
      st = { tail: new JsonlTail(file), localId: base.match(UUID_TAIL)?.[0] || base, useItems: false, prevProcessed: 0, lastTokens: null, tokenBase: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 } };
      files.set(file, st);
    }
    const s = store.ensure({ connector: 'codex', localId: st.localId, provider: 'openai', app: 'Codex' });
    s.staleMs = 15 * MIN;
    const title = titles.get(st.localId);
    if (title) s.title = title.name;
    const lines = await st.tail.read(stat.size);
    for (const o of lines) apply(st, s, o);
    if (lines.length) lastEventAt = Date.now();
    store.commit(s);
  }

  async function scan() {
    exists = Boolean(await statSafe(root));
    await syncIndex();
    const list = await listFiles(root, 3, (f) => f.endsWith('.jsonl'));
    for (const f of list) await queue.run(f);
  }

  return {
    id: 'codex',
    name: 'Codex · ChatGPT app, CLI a VS Code',
    provider: 'openai',
    kind: 'local',
    verified: true,
    source: '~/.codex/sessions',
    description: 'Přepis v reálném čase, stav úlohy, tokeny, limity plánu a zůstatek kreditů.',
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
      const count = files.size;
      return {
        state: count ? 'connected' : exists ? 'idle' : 'missing',
        detail: count ? `Sleduji ${count} konverzací za posledních ${config.windowDays} dní.` : exists ? 'Složka existuje, zatím bez konverzací.' : 'Codex na tomto počítači není.',
        count,
        watching: Boolean(watcher?.active),
        lastEventAt,
      };
    },
  };
}
