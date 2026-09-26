import { hourKey, minuteKey, spansFromMinutes, clip, lastSegment, MIN, HOUR, DAY } from './util.js';

export const TRANSCRIPT_MAX = 400;
// Jednotný model session pro všechny konektory. Konektor plní pole, stav se odvozuje centrálně.
export function createSession({ connector, localId, provider, app, source = 'local' }) {
  return {
    id: `${connector}:${localId}`,
    localId,
    connector,
    provider,
    app,
    source,
    title: '',
    firstPrompt: '',
    lastPrompt: '',
    cwd: '',
    model: '',
    branch: '',
    startedAt: 0,
    lastAt: 0,
    turns: 0,
    tokens: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
    hourly: {},
    minutes: new Set(),
    running: false,
    runningAt: 0,
    stopAt: 0,
    toolWaitSince: 0,
    staleMs: 5 * MIN,
    turnStartedAt: 0,
    turnSteps: 0,
    activity: '',
    progress: null,
    pending: null,
    limit: null,
    ended: false,
    hookAt: 0,
    failure: null,
    context: null,
    effort: '',
    repo: '',
    worktree: '',
    pr: null,
    costUsd: null,
    resume: null,
    url: null,
    transcript: [],
    seq: 0,
    dirty: [],
    resetTranscript: false,
  };
}

export function touch(s, ts) {
  if (!ts || !Number.isFinite(ts)) return;
  // Razítko z budoucnosti (posunuté hodiny u zdroje) by konverzaci navždy drželo „čerstvou“.
  ts = Math.min(ts, Date.now());
  if (!s.startedAt || ts < s.startedAt) s.startedAt = ts;
  if (ts > s.lastAt) s.lastAt = ts;
  s.minutes.add(minuteKey(ts));
}

const TOKEN_KEYS = ['input', 'output', 'cacheWrite', 'cacheRead'];

export function addTokens(s, ts, delta, sign = 1) {
  for (const k of TOKEN_KEYS) s.tokens[k] += sign * (delta[k] || 0);
  // Hlavní metrika je jen vstup + výstup – to je spotřeba, kterou uživatel pozná i ve svém
  // účtu u dodavatele. Zápis do cache je technická režie (stejný kontext se zapisuje znovu
  // s každým tahem) a dokázal hlavní číslo nadsadit skoro devítinásobně; drží se dál v
  // `s.tokens.cacheWrite` a zobrazuje se odděleně ve složení tokenů.
  const amount = sign * ((delta.input || 0) + (delta.output || 0));
  if (!ts || !amount) return;
  const k = hourKey(ts);
  const next = (s.hourly[k] || 0) + amount;
  if (next > 0) s.hourly[k] = next;
  else delete s.hourly[k];
}

export function pushEntry(s, { at, role, text = '', tool, status }) {
  const entry = { seq: ++s.seq, at: at || Date.now(), role, text };
  if (tool) entry.tool = tool;
  if (status) entry.status = status;
  s.transcript.push(entry);
  if (s.transcript.length > TRANSCRIPT_MAX) s.transcript.splice(0, s.transcript.length - TRANSCRIPT_MAX);
  s.dirty.push(entry);
  return entry;
}

export function updateEntry(s, entry, patch) {
  Object.assign(entry, patch);
  if (!s.dirty.includes(entry)) s.dirty.push(entry);
}

export function resetTranscript(s) {
  s.transcript = [];
  s.dirty = [];
  s.resetTranscript = true;
}

export function takeDirty(s) {
  const out = { entries: s.dirty, reset: s.resetTranscript };
  s.dirty = [];
  s.resetTranscript = false;
  return out;
}

// Pořadí pravidel je záměrné – viz docs/ARCHITECTURE.md („Stavový model session“).
// `stale` = agent formálně neukončil tah, ale dlouho se nic neděje; takový přechod nesmí hlásit „dokončeno“.
export function deriveStatus(s, now) {
  const age = now - (s.lastAt || 0);
  if (s.limit?.reached) {
    const active = s.limit.resetsAt ? now < s.limit.resetsAt : now - s.limit.at < 5 * HOUR;
    if (active) return { status: 'limited', reason: s.limit.text || 'Vyčerpaný limit', stale: false };
  }
  // Selhání spuštění (proces agenta skončil chybou). Platí, dokud agent znovu nezačne pracovat.
  if (s.failure && now - s.failure.at < DAY && !(s.running && (s.runningAt || 0) > s.failure.at)) {
    return { status: 'failed', reason: s.failure.text || 'Spuštění selhalo', stale: false };
  }
  if (s.pending && now - s.pending.at < 12 * HOUR) return { status: 'needs_input', reason: s.pending.text || 'Potřebuje tvé rozhodnutí', stale: false };
  if (s.running && now - (s.runningAt || s.lastAt) < s.staleMs) {
    // Bez hooků nevidíme žádost o povolení; dlouho čekající nástroj proto poctivě označíme jako možnou.
    const maybePermission = s.toolWaitSince && !s.hookAt && now - s.toolWaitSince > 90e3;
    const activity = s.activity || 'Pracuje';
    return { status: 'working', reason: maybePermission ? `${activity} · možná čeká na tvé povolení` : activity, stale: false };
  }
  const stale = Boolean(s.running);
  if (s.ended) return { status: age < DAY ? 'idle' : 'archived', reason: 'Konverzace ukončena', stale: false };
  // „Hotovo“ jen když agent skutečně něco odpověděl nebo pracoval; jinak poctivě „bez odpovědi“.
  const answered = s.turns > 0 || s.tokens.output > 0 || s.transcript.some((e) => e.role === 'assistant' || e.role === 'tool');
  if (age < 3 * HOUR) return { status: 'waiting', reason: stale ? 'Delší dobu bez aktivity' : answered ? 'Hotovo, čeká na další zadání' : 'Zatím bez odpovědi agenta', stale };
  if (age < DAY) return { status: 'idle', reason: '', stale };
  return { status: 'archived', reason: '', stale };
}

// Bez názvu i skutečného zadání pojmenuj vlákno podle toho, čím je; název složky až jako poslední možnost.
function fallbackTitle(s) {
  if (s.taskName) return `Plánovaná úloha · ${s.taskName}`;
  if (s.subagent?.label) return s.subagent.label;
  return lastSegment(s.cwd).replace(/[-_]+/g, ' ') || 'Konverzace bez názvu';
}

export function summarize(s, now, windowMs) {
  const { status, reason, stale } = deriveStatus(s, now);
  const since = hourKey(now - windowMs);
  const hourly = {};
  for (const [k, v] of Object.entries(s.hourly)) if (k >= since && v > 0) hourly[k] = v;
  const working = status === 'working';
  return {
    id: s.id,
    connector: s.connector,
    provider: s.provider,
    app: s.app,
    source: s.source,
    parentId: s.parentId || null,
    subagent: s.subagent || null,
    taskName: s.taskName || '',
    title: clip(s.title || s.firstPrompt || fallbackTitle(s), 100),
    cwd: s.cwd,
    project: lastSegment(s.cwd),
    model: s.model,
    branch: s.branch,
    status,
    reason: clip(reason, 200),
    stale,
    startedAt: s.startedAt,
    lastAt: s.lastAt,
    turns: s.turns,
    tokens: { ...s.tokens },
    hourly,
    spans: spansFromMinutes(s.minutes, now),
    progress: s.progress,
    activity: working ? clip(s.activity, 160) : '',
    turnStartedAt: working ? s.turnStartedAt : 0,
    turnSteps: working ? s.turnSteps : 0,
    lastPrompt: clip(s.lastPrompt, 280),
    pending: s.pending,
    limit: s.limit,
    resume: s.resume,
    url: s.url,
    hooked: Boolean(s.hookAt),
    failure: s.failure || null,
    context: s.context || null,
    effort: s.effort || '',
    repo: s.repo || '',
    worktree: s.worktree || '',
    pr: s.pr || null,
    costUsd: s.costUsd ?? null,
    ...(s.observation ? { observation: { ...s.observation } } : {}),
    transcriptSeq: s.seq,
  };
}

export function pruneMinutes(s, now) {
  const from = minuteKey(now - 2 * DAY);
  for (const m of s.minutes) if (m < from) s.minutes.delete(m);
}
