import path from 'node:path';
import { JsonlTail, statSafe, toTs, textOf, isInjectedPrompt, clip, clipBlock, lastSegment, shellQuote, MIN, DAY } from '../util.js';
import { touch, addTokens, pushEntry } from '../model.js';
import { watchTree, createFileQueue, listFiles, depthOf } from '../watch.js';

export const LIMIT_RE = /(hit your .{0,40}limit|usage limit reached|limit reached|spend limit)/i;

// Okna limitů předplatného, která Claude Code předává stavovému řádku (`rate_limits`).
export const STATUS_WINDOWS = {
  five_hour: { id: 'claude:five_hour', label: 'Limit 5 h', minutes: 300 },
  seven_day: { id: 'claude:seven_day', label: 'Týdenní limit', minutes: 10080 },
};

const TOOL_LABELS = {
  Bash: 'Spouští příkaz',
  Read: 'Čte soubor',
  Edit: 'Upravuje soubor',
  MultiEdit: 'Upravuje soubor',
  Write: 'Zapisuje soubor',
  NotebookEdit: 'Upravuje notebook',
  Glob: 'Hledá soubory',
  Grep: 'Prohledává kód',
  WebFetch: 'Načítá web',
  WebSearch: 'Hledá na webu',
  Task: 'Spustil subagenta',
  Agent: 'Spustil subagenta',
  TodoWrite: 'Aktualizuje plán',
  AskUserQuestion: 'Ptá se tě',
  ExitPlanMode: 'Předkládá plán',
  ToolSearch: 'Hledá nástroje',
  Skill: 'Načítá dovednost',
};

export function toolDetail(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  if (name === 'Bash') return clip(i.description || i.command, 140);
  if (['Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(name)) return lastSegment(i.file_path || i.notebook_path);
  if (name === 'Grep' || name === 'Glob') return clip(i.pattern, 80);
  if (name === 'WebFetch') return clip(i.url, 120);
  if (name === 'WebSearch') return clip(i.query, 120);
  if (name === 'Task' || name === 'Agent') return clip(i.description, 120);
  if (name === 'Skill') return clip(i.skill, 80);
  if (typeof name === 'string' && name.startsWith('mcp__')) return name.split('__').slice(1).join(' · ').replace(/_/g, ' ');
  return '';
}

export function describeTool(name, input) {
  const label = TOOL_LABELS[name] || (String(name).startsWith('mcp__') ? 'Používá nástroj' : name);
  const detail = toolDetail(name, input);
  return clip(detail ? `${label}: ${detail}` : label, 160);
}

function toolInputText(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  if (name === 'Bash') return clipBlock(i.command || '', 600);
  if (['Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(name)) return clip(i.file_path || i.notebook_path || '', 300);
  if (name === 'Grep' || name === 'Glob') return clip(`${i.pattern || ''}${i.path ? ` · ${i.path}` : ''}`, 300);
  if (name === 'Task' || name === 'Agent') return clipBlock(`${i.description || ''}\n${i.prompt || ''}`, 600);
  if (name === 'AskUserQuestion') return clipBlock((i.questions || []).map((q) => q?.question).filter(Boolean).join('\n'), 600);
  if (name === 'TodoWrite') return clipBlock((i.todos || []).map((t) => `${t?.status === 'completed' ? '✓' : t?.status === 'in_progress' ? '→' : '·'} ${t?.content || ''}`).join('\n'), 800);
  const s = JSON.stringify(i);
  return clip(s === '{}' ? '' : s, 300);
}

export function todosProgress(todos) {
  if (!Array.isArray(todos) || !todos.length) return null;
  const done = todos.filter((t) => t?.status === 'completed').length;
  const current = todos.find((t) => t?.status === 'in_progress');
  return { done, total: todos.length, current: clip(current?.activeForm || current?.content || '', 140) };
}

// "resets 1am (Europe/Prague)" → nejbližší budoucí výskyt daného času v místní zóně.
export function parseResets(text, ts) {
  const m = /resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(text || '');
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  const d = new Date(ts);
  d.setHours(h, Number(m[2] || 0), 0, 0);
  if (d.getTime() <= ts) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function limitKind(text) {
  if (/monthly spend|spend limit/i.test(text)) return { id: 'claude:spend', label: 'Měsíční limit útraty' };
  if (/weekly/i.test(text)) return { id: 'claude:weekly', label: 'Týdenní limit' };
  if (/session/i.test(text)) return { id: 'claude:session', label: 'Limit relace' };
  return { id: 'claude:usage', label: 'Limit využití' };
}

export const newFileState = () => ({ msgs: new Map(), pendingTools: new Map(), customTitle: false });

function meta(s, o) {
  // Projekt = složka, ve které session začala. Agent během práce dělá `cd`, to projekt nemění.
  if (o.cwd && !s.cwd) s.cwd = o.cwd;
  if (o.gitBranch && o.gitBranch !== 'HEAD') s.branch = o.gitBranch;
  if (o.entrypoint === 'claude-desktop') s.app = 'Claude Desktop · Code';
}

function markRunning(s, ts) {
  if (ts < (s.stopAt || 0)) return;
  s.running = true;
  s.ended = false;
  if (ts > s.runningAt) s.runningAt = ts;
}

function onUser(st, s, o, ts) {
  if (o.isMeta) return;
  meta(s, o);
  touch(s, ts);
  if (o.isSidechain) {
    markRunning(s, ts);
    return;
  }
  const c = o.message?.content;
  if (Array.isArray(c) && c.some((p) => p?.type === 'tool_result')) {
    for (const part of c) {
      if (part?.type !== 'tool_result') continue;
      const pending = st.pendingTools.get(part.tool_use_id);
      st.pendingTools.delete(part.tool_use_id);
      const raw = typeof part.content === 'string' ? part.content : textOf(part.content);
      const rejected = /doesn't want to proceed|User rejected/i.test(raw);
      pushEntry(s, {
        at: ts,
        role: 'result',
        tool: pending?.name,
        text: rejected ? 'Uživatel akci zamítl.' : clipBlock(raw, 800),
        status: part.is_error || rejected ? 'error' : 'ok',
      });
      if (s.pending?.toolUseId && s.pending.toolUseId === part.tool_use_id) s.pending = null;
    }
    if (!st.pendingTools.size) s.toolWaitSince = 0;
    if (s.pending?.kind === 'permission' && ts >= s.pending.at) s.pending = null;
    markRunning(s, ts);
    return;
  }
  const text = (typeof c === 'string' ? c : textOf(Array.isArray(c) ? c.filter((p) => p?.type === 'text') : c)).trim();
  if (!text) return;
  if (/^\[Request interrupted/.test(text)) {
    s.running = false;
    s.activity = '';
    s.pending = null;
    s.toolWaitSince = 0;
    st.pendingTools.clear();
    pushEntry(s, { at: ts, role: 'system', text: 'Přerušeno uživatelem' });
    return;
  }
  if (isInjectedPrompt(text)) return;
  s.turns++;
  s.lastPrompt = text;
  if (!s.firstPrompt) s.firstPrompt = text;
  pushEntry(s, { at: ts, role: 'user', text: clipBlock(text, 4000) });
  s.pending = null;
  s.turnStartedAt = ts;
  s.turnSteps = 0;
  s.activity = 'Přemýšlí…';
  markRunning(s, ts);
}

function onAssistant(st, s, o, ts, { onLimit, onSuccess }) {
  const m = o.message;
  if (!m) return;
  meta(s, o);
  touch(s, ts);

  if (o.isApiErrorMessage) {
    const text = clip(textOf(m.content), 240) || 'Chyba API';
    pushEntry(s, { at: ts, role: 'error', text });
    s.running = false;
    s.activity = '';
    if (LIMIT_RE.test(text)) {
      const kind = limitKind(text);
      const resetsAt = parseResets(text, ts);
      s.limit = { reached: true, text, at: ts, resetsAt };
      onLimit?.({ id: kind.id, provider: 'anthropic', app: 'Claude', label: kind.label, usedPercent: null, windowMinutes: null, resetsAt, reached: true, plan: null, text, at: ts });
    }
    return;
  }

  if (s.limit && ts > s.limit.at) s.limit = null;
  onSuccess?.(ts);
  if (m.model && !String(m.model).startsWith('<')) s.model = m.model;

  const parts = Array.isArray(m.content) ? m.content : [];
  if (!o.isSidechain) {
    for (const part of parts) {
      if (part?.type === 'text' && part.text?.trim()) {
        pushEntry(s, { at: ts, role: 'assistant', text: clipBlock(part.text, 4000) });
      } else if (part?.type === 'tool_use') {
        st.pendingTools.set(part.id, { name: part.name, at: ts });
        if (!s.toolWaitSince) s.toolWaitSince = ts;
        s.turnSteps++;
        s.activity = describeTool(part.name, part.input);
        pushEntry(s, { at: ts, role: 'tool', tool: part.name, text: toolInputText(part.name, part.input) });
        if (part.name === 'AskUserQuestion') {
          s.pending = { kind: 'question', text: clip(part.input?.questions?.[0]?.question || 'Má pro tebe otázku', 200), at: ts, toolUseId: part.id, source: 'transcript' };
        } else if (part.name === 'ExitPlanMode') {
          s.pending = { kind: 'plan', text: 'Čeká na schválení plánu', at: ts, toolUseId: part.id, source: 'transcript' };
        } else if (part.name === 'TodoWrite') {
          s.progress = todosProgress(part.input?.todos) || s.progress;
        }
      }
    }
  }

  if (o.isSidechain) markRunning(s, ts);
  else if (m.stop_reason === 'end_turn' || m.stop_reason === 'stop_sequence') {
    s.running = false;
    s.activity = '';
    s.toolWaitSince = 0;
    st.pendingTools.clear();
  } else markRunning(s, ts);

  const u = m.usage;
  const id = m.id || o.uuid;
  if (u && id) {
    const cur = {
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheWrite: typeof u.cache_creation_input_tokens === 'number' ? u.cache_creation_input_tokens : 0,
      cacheRead: u.cache_read_input_tokens || 0,
      ts,
    };
    // Streamované zprávy se v přepisu opakují se stejným id — platí poslední záznam.
    const prev = st.msgs.get(id);
    if (prev) addTokens(s, prev.ts, prev, -1);
    addTokens(s, ts, cur);
    st.msgs.set(id, cur);
  }
}

export function applyClaudeLine(st, s, o, hooks = {}) {
  const ts = toTs(o.timestamp);
  switch (o.type) {
    case 'custom-title':
      if (o.customTitle) {
        s.title = o.customTitle;
        st.customTitle = true;
      }
      return;
    case 'ai-title':
      if (o.aiTitle && !st.customTitle) s.title = o.aiTitle;
      return;
    case 'summary':
      if (o.summary && !s.title) s.title = o.summary;
      return;
    case 'user':
      onUser(st, s, o, ts);
      return;
    case 'assistant':
      onAssistant(st, s, o, ts, hooks);
      return;
    default:
  }
}

export function createClaudeCodeConnector(ctx) {
  const { store, config } = ctx;
  const root = path.join(config.sourceHome, '.claude', 'projects');
  const windowMs = config.windowDays * DAY;
  const files = new Map();
  let watcher = null;
  let exists = false;
  let lastEventAt = 0;
  let lastHookAt = 0;
  const queue = createFileQueue(sync, 40);

  const hooks = {
    onLimit: (limit) => store.setLimit(limit),
    onSuccess: (ts) => {
      for (const l of store.limits.values()) {
        if (l.provider === 'anthropic' && l.reached && l.at < ts) store.setLimit({ ...l, reached: false, text: '', at: ts });
      }
    },
  };

  function setResume(s, localId) {
    if (s.cwd) s.resume = `cd ${shellQuote(s.cwd)} && claude --resume ${localId}`;
  }

  async function sync(file) {
    if (!file.endsWith('.jsonl') || depthOf(root, file) !== 1) return;
    const stat = await statSafe(file);
    if (!stat?.isFile()) return;
    let f = files.get(file);
    if (!f && Date.now() - stat.mtimeMs > windowMs) return;
    if (f && stat.size < f.tail.offset) {
      store.remove(`claude-code:${f.localId}`);
      files.delete(file);
      f = null;
    }
    if (!f) {
      f = { tail: new JsonlTail(file), st: newFileState(), localId: path.basename(file, '.jsonl') };
      files.set(file, f);
    }
    const s = store.ensure({ connector: 'claude-code', localId: f.localId, provider: 'anthropic', app: 'Claude Code' });
    const lines = await f.tail.read(stat.size);
    for (const o of lines) applyClaudeLine(f.st, s, o, hooks);
    setResume(s, f.localId);
    // Konec tahu je v přepisu explicitní (end_turn, přerušení, chyba API, hook Stop). Dlouhé přemýšlení
    // modelu nezapisuje nic, proto „pracuje“ drží až 30 min a teprve pak přejde do stavu bez aktivity.
    s.staleMs = 30 * MIN;
    if (lines.length) lastEventAt = Date.now();
    store.commit(s);
  }

  async function scan() {
    exists = Boolean(await statSafe(root));
    for (const f of await listFiles(root, 1, (x) => x.endsWith('.jsonl'))) await queue.run(f);
  }

  // Okamžité události z Claude Code hooků (viz src/hooks-installer.js).
  async function ingestHook(p, now = Date.now()) {
    if (!p || typeof p.session_id !== 'string' || !/^[\w-]{8,80}$/.test(p.session_id)) return { ok: false, error: 'Neplatné session_id.' };
    const event = String(p.hook_event_name || '');
    if (!['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'].includes(event)) return { ok: false, error: 'Neznámá událost.' };
    if (typeof p.transcript_path === 'string') {
      const tp = path.resolve(p.transcript_path);
      if (depthOf(root, tp) === 1) await queue.run(tp);
    }
    const s = store.ensure({ connector: 'claude-code', localId: p.session_id, provider: 'anthropic', app: 'Claude Code' });
    s.hookAt = now;
    lastHookAt = now;
    s.staleMs = 30 * MIN;
    if (event !== 'Notification') s.toolWaitSince = 0;
    if (typeof p.cwd === 'string' && p.cwd && !s.cwd) {
      s.cwd = p.cwd;
      setResume(s, p.session_id);
    }
    switch (event) {
      case 'SessionStart':
        s.ended = false;
        break;
      case 'UserPromptSubmit':
        s.stopAt = 0;
        s.ended = false;
        s.running = true;
        s.runningAt = now;
        s.turnStartedAt = now;
        s.turnSteps = 0;
        s.pending = null;
        s.activity = 'Přemýšlí…';
        if (typeof p.prompt === 'string' && p.prompt.trim() && !isInjectedPrompt(p.prompt)) {
          s.lastPrompt = p.prompt;
          if (!s.firstPrompt) s.firstPrompt = p.prompt;
        }
        break;
      case 'Notification': {
        const type = p.notification_type;
        const msg = clip(p.message || '', 200);
        if (type === 'permission_prompt' || (!type && /permission/i.test(msg))) {
          s.pending = { kind: 'permission', text: msg || 'Potřebuje povolení k akci', at: now, source: 'hook' };
        } else if (type === 'elicitation_dialog') {
          s.pending = { kind: 'question', text: msg || 'Potřebuje doplnit údaje', at: now, source: 'hook' };
        } else if (type === 'idle_prompt') {
          s.running = false;
          s.activity = '';
        }
        break;
      }
      case 'Stop':
        s.running = false;
        s.stopAt = now;
        s.activity = '';
        if (s.pending?.kind === 'permission') s.pending = null;
        break;
      case 'SessionEnd':
        s.running = false;
        s.stopAt = now;
        s.ended = true;
        s.pending = null;
        s.activity = '';
        break;
      default:
    }
    touch(s, now);
    store.commit(s, now);
    return { ok: true, id: s.id };
  }

  // Stavový řádek Claude Code (src/hooks-installer.js): oficiální limity 5 h a týden, kontext, repozitář, PR.
  // Neposouvá „poslední aktivitu“ — stavový řádek se překresluje i bez práce agenta.
  const statusCache = new Map();

  function statusLimit(key, w, now) {
    if (!w || typeof w.used_percentage !== 'number' || !Number.isFinite(w.used_percentage)) return null;
    const def = STATUS_WINDOWS[key];
    const used = Math.max(0, Math.min(100, w.used_percentage));
    const resetsAt = Number(w.resets_at) > 0 ? Math.round(Number(w.resets_at) * 1000) : null;
    const prev = store.limits.get(def.id);
    if (!prev || prev.usedPercent !== used || prev.resetsAt !== resetsAt || now - prev.at > MIN) {
      store.setLimit({ id: def.id, provider: 'anthropic', app: 'Claude', label: def.label, usedPercent: used, windowMinutes: def.minutes, resetsAt, reached: used >= 100, plan: null, text: '', at: now, source: 'statusline' });
    }
    return { used, resetsAt };
  }

  function ingestStatusline(p, now = Date.now()) {
    if (!p || typeof p.session_id !== 'string' || !/^[\w-]{8,80}$/.test(p.session_id)) return { ok: false, error: 'Neplatné session_id.' };
    const rl = p.rate_limits && typeof p.rate_limits === 'object' ? p.rate_limits : {};
    const five = statusLimit('five_hour', rl.five_hour, now);
    const week = statusLimit('seven_day', rl.seven_day, now);
    const cw = p.context_window && typeof p.context_window === 'object' ? p.context_window : {};
    const ctxPct = typeof cw.used_percentage === 'number' && Number.isFinite(cw.used_percentage) ? Math.round(Math.max(0, Math.min(100, cw.used_percentage))) : null;
    const s = store.get(`claude-code:${p.session_id}`);
    if (s) {
      const repo = p.workspace?.repo;
      const next = {
        context: ctxPct === null ? null : { usedPercent: ctxPct, size: Number(cw.context_window_size) || null },
        effort: typeof p.effort?.level === 'string' ? clip(p.effort.level, 12) : '',
        repo: typeof repo?.owner === 'string' && typeof repo?.name === 'string' ? clip(`${repo.owner}/${repo.name}`, 120) : '',
        worktree: clip(typeof p.worktree?.name === 'string' ? p.worktree.name : typeof p.workspace?.git_worktree === 'string' ? p.workspace.git_worktree : '', 120),
        pr: Number.isInteger(p.pr?.number) ? { number: p.pr.number, url: /^https:\/\//.test(p.pr.url || '') ? clip(p.pr.url, 300) : '', state: clip(typeof p.pr.review_state === 'string' ? p.pr.review_state : '', 24) } : null,
        costUsd: typeof p.cost?.total_cost_usd === 'number' && Number.isFinite(p.cost.total_cost_usd) ? Math.round(p.cost.total_cost_usd * 100) / 100 : null,
      };
      if (typeof p.worktree?.branch === 'string' && !s.branch) s.branch = clip(p.worktree.branch, 120);
      const json = JSON.stringify(next);
      if (statusCache.get(s.id) !== json) {
        statusCache.set(s.id, json);
        Object.assign(s, next);
        if (s.lastAt) store.commit(s, now);
      }
    }
    const hm = (ts) => new Date(ts).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    const parts = ['Agentree'];
    if (typeof p.model?.display_name === 'string') parts.push(clip(p.model.display_name, 40));
    if (five) parts.push(`5 h ${Math.round(five.used)} %${five.resetsAt ? ` do ${hm(five.resetsAt)}` : ''}`);
    if (week) parts.push(`týden ${Math.round(week.used)} %`);
    if (ctxPct !== null) parts.push(`kontext ${ctxPct} %`);
    return { ok: true, text: parts.join(' · ').replace(/[ -]/g, '') };
  }

  return {
    id: 'claude-code',
    name: 'Claude Code · CLI a Claude Desktop',
    provider: 'anthropic',
    kind: 'local',
    verified: true,
    source: '~/.claude/projects',
    description: 'Přepis v reálném čase, nástroje, plán úkolů, dotazy na tebe, limity a tokeny.',
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
    ingestHook,
    ingestStatusline,
    status() {
      const count = files.size;
      return {
        state: count ? 'connected' : exists ? 'idle' : 'missing',
        detail: count
          ? `Sleduji ${count} sessions za ${config.windowDays} dní.${lastHookAt ? ' Okamžité události jsou aktivní.' : ''}`
          : exists
            ? 'Složka existuje, zatím bez sessions.'
            : 'Claude Code na tomto počítači není.',
        count,
        watching: Boolean(watcher?.active),
        lastEventAt: Math.max(lastEventAt, lastHookAt),
        hooksActive: Boolean(lastHookAt),
      };
    },
  };
}
