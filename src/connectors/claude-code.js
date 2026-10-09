import path from 'node:path';
import { JsonlTail, statSafe, toTs, textOf, isInjectedPrompt, clip, clipBlock, lastSegment, MIN, HOUR, DAY } from '../util.js';
import { touch, addTokens, pushEntry } from '../model.js';
import { createFileQueue, listFiles } from '../watch.js';
import { createKorenyPrepisu, rozbalCestu } from '../koreny-prepisu.js';
import { ui } from '../texty.js';
import { POCITAC, prikazVeSlozce } from '../platform.js';

export const LIMIT_RE = /(hit your .{0,40}limit|usage limit reached|limit reached|spend limit)/i;

// Okna limitů předplatného, která Claude Code předává stavovému řádku (`rate_limits`).
// `spend_limit` není okno předplatného, ale vyčerpání dokoupeného extra usage – proto vlastní druh.
export const STATUS_WINDOWS = {
  five_hour: { id: 'claude:five_hour', label: ui('Limit 5 h'), minutes: 300 },
  seven_day: { id: 'claude:seven_day', label: ui('Týdenní limit'), minutes: 10080 },
  spend_limit: { id: 'claude:spend_limit', label: ui('Extra usage'), minutes: null, kind: 'spend' },
};

const TOOL_LABELS = {
  Bash: ui('Spouští příkaz'),
  Read: ui('Čte soubor'),
  Edit: ui('Upravuje soubor'),
  MultiEdit: ui('Upravuje soubor'),
  Write: ui('Zapisuje soubor'),
  NotebookEdit: ui('Upravuje notebook'),
  Glob: ui('Hledá soubory'),
  Grep: ui('Prohledává kód'),
  WebFetch: ui('Načítá web'),
  WebSearch: ui('Hledá na webu'),
  Task: ui('Spustil subagenta'),
  Agent: ui('Spustil subagenta'),
  TodoWrite: ui('Aktualizuje plán'),
  AskUserQuestion: ui('Ptá se tě'),
  ExitPlanMode: ui('Předkládá plán'),
  ToolSearch: ui('Hledá nástroje'),
  Skill: ui('Načítá dovednost'),
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
  const label = TOOL_LABELS[name] || (String(name).startsWith('mcp__') ? ui('Používá nástroj') : name);
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
// Čas obnovy z hlášky o limitu. Claude Code píše u blízké obnovy jen hodinu („resets 3pm“),
// u vzdálenější i den („resets Oct 9, 5pm“ / „resets Oct 9 at 5pm“) a starší verze epoch za svislítkem
// („Claude AI usage limit reached|1759327200“). Dřív se četla jen hodina, takže týdenní limit
// s datem za šest dní ukazoval obnovu dnes nebo zítra – nepravda. Nerozpoznaný tvar = null.
const MESICE = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseResets(text, ts) {
  const t = String(text || '');
  const epoch = /limit reached\|(\d{10})\b/i.exec(t);
  if (epoch) return Number(epoch[1]) * 1000;
  const m = /resets\s+(?:([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,|\s+at)?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(t);
  if (!m) return null;
  let h = Number(m[3]) % 12;
  if (m[5].toLowerCase() === 'pm') h += 12;
  const d = new Date(ts);
  if (m[1]) {
    const mesic = MESICE.indexOf(m[1].toLowerCase());
    if (mesic < 0) return null;
    d.setMonth(mesic, Number(m[2]));
    d.setHours(h, Number(m[4] || 0), 0, 0);
    // Hláška z prosince o obnově v lednu míří do dalšího roku.
    if (d.getTime() < ts - DAY) d.setFullYear(d.getFullYear() + 1);
    return d.getTime();
  }
  d.setHours(h, Number(m[4] || 0), 0, 0);
  if (d.getTime() <= ts) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function limitKind(text) {
  if (/monthly spend|spend limit/i.test(text)) return { id: 'claude:spend', label: ui('Měsíční limit útraty') };
  if (/weekly/i.test(text)) return { id: 'claude:weekly', label: ui('Týdenní limit') };
  if (/session/i.test(text)) return { id: 'claude:session', label: ui('Limit relace') };
  return { id: 'claude:usage', label: ui('Limit využití') };
}

// Strukturovaná hláška o vyčerpaném limitu (`quotaLimits`), kterou Claude Code zapisuje k chybě API 429
// do přepisu – v Terminálu i v Claude Desktopu → Code, kde stavový řádek nikdy neběží. Na rozdíl od
// textu hlášky nese přesný čas obnovy od serveru (epoch v sekundách) a druh okna. Ověřeno na skutečných
// přepisech (2026-10-04): `five_hour` se `status: "rejected"`. Ostatní druhy jsou pojmenované podle
// typu `rateLimitType` v Claude Agent SDK; na skutečném účtu zatím neviděné. Neznámý druh se nehádá.
export const QUOTA_WINDOWS = {
  five_hour: { id: 'claude:five_hour', label: ui('Limit 5 h'), minutes: 300 },
  seven_day: { id: 'claude:seven_day', label: ui('Týdenní limit'), minutes: 10080 },
  seven_day_opus: { id: 'claude:seven_day_opus', label: ui('Týdenní limit · Opus'), minutes: 10080 },
  seven_day_sonnet: { id: 'claude:seven_day_sonnet', label: ui('Týdenní limit · Sonnet'), minutes: 10080 },
  overage: { id: 'claude:overage', label: ui('Extra usage'), minutes: null, kind: 'spend' },
};

// Jen to, co pole výslovně říkají: běží dokupované využití → zapnuté; je uveden důvod vypnutí → vypnuté.
// Cokoli jiného (chybějící pole, neznámá hodnota) = nevíme, a proto žádná poznámka.
export function quotaOverage(q) {
  if (q?.isUsingOverage === true) return 'on';
  if (q?.isUsingOverage === false && typeof q.overageDisabledReason === 'string' && q.overageDisabledReason) return 'off';
  return null;
}

export function quotaLimit(o, ts) {
  const q = o?.quotaLimits;
  if (!o?.isApiErrorMessage || !q || typeof q !== 'object' || Array.isArray(q)) return null;
  // Vyčerpané je jen okno, které server odmítl. Varování („allowed_warning“) není vyčerpání.
  if (q.status !== 'rejected') return null;
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const typ = typeof q.rateLimitType === 'string' && /^[a-z0-9_]{1,40}$/.test(q.rateLimitType) ? q.rateLimitType : '';
  const def = Object.hasOwn(QUOTA_WINDOWS, typ) ? QUOTA_WINDOWS[typ] : null;
  // Epoch v sekundách (ověřený tvar). Jiný tvar = čas obnovy neznámý, nic se nepřepočítává.
  const r = Number(q.resetsAt);
  const resetsAt = typeof q.resetsAt === 'number' && Number.isInteger(r) && r > 1e9 && r < 1e11 ? r * 1000 : null;
  return {
    id: `${def ? def.id : typ ? `claude:quota:${typ}` : 'claude:quota'}:quota`,
    provider: 'anthropic',
    app: 'Claude',
    label: def ? def.label : ui('Limit využití'),
    usedPercent: 100,
    windowMinutes: def ? def.minutes : null,
    resetsAt,
    reached: true,
    plan: null,
    text: clip(textOf(o.message?.content), 240),
    at: ts,
    model: null,
    source: 'transcript-quota',
    kind: def?.kind || 'window',
    overage: quotaOverage(q),
  };
}

export const newFileState = (subagentFile = false) => ({
  msgs: new Map(),
  pendingTools: new Map(),
  customTitle: false,
  subagentFile,
  taskDesc: new Map(), // id volání nástroje Task → krátký popis úlohy
  subagentTitles: new Map(), // agentId → popis úlohy (z rodičovského přepisu)
});

// „agentId: a0315452530126137" z výsledku nástroje Task – jediné pojítko mezi rodičem a přepisem pomocníka.
export const agentIdFrom = (text) => /agentId:\s*([a-z0-9]{6,40})/i.exec(text || '')?.[1] || '';

function meta(s, o) {
  // Projekt = složka, ve které session začala. Agent během práce dělá `cd`, to projekt nemění.
  if (o.cwd && !s.cwd) s.cwd = o.cwd;
  if (o.gitBranch && o.gitBranch !== 'HEAD') s.branch = o.gitBranch;
  if (o.entrypoint === 'claude-desktop') s.app = 'Claude Desktop · Code';
  // Režim oprávnění, když ho přepis nese (bypassPermissions = bez ptaní, acceptEdits = úpravy bez ptaní).
  if (typeof o.permissionMode === 'string' && /^[A-Za-z]{1,32}$/.test(o.permissionMode)) s.permissionMode = o.permissionMode;
}

// Na co čeká nástroj, kterému chybí výsledek – bez hooků jediná stopa po žádosti o povolení.
// 'cteni' se na povolení v Claude Code nikdy neptá (jen čte), 'uprava' proběhne po schválení
// během vteřin (dlouhé čekání = skoro jistě žádost o povolení), ostatní ('dlouhy') umí běžet
// dlouho i bez ptaní (Bash, MCP, stažení stránky).
const NASTROJE_CTENI = new Set(['Read', 'Glob', 'Grep', 'LS', 'TodoWrite', 'Task', 'Agent', 'NotebookRead', 'BashOutput']);
const NASTROJE_UPRAVY = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
export function druhCekani(nazvy) {
  const list = [...nazvy];
  if (!list.length) return '';
  if (list.some((n) => NASTROJE_UPRAVY.has(n))) return 'uprava';
  if (list.every((n) => NASTROJE_CTENI.has(n))) return 'cteni';
  return 'dlouhy';
}
const aktualizujCekani = (st, s) => { s.toolWaitKind = druhCekani([...st.pendingTools.values()].map((t) => t.name)); };

function markRunning(s, ts) {
  // Časové razítko z budoucnosti (posunuté hodiny) by drželo „pracuje“ navždy – ořízne se na teď.
  ts = Math.min(ts, Date.now());
  if (ts < (s.stopAt || 0)) return;
  s.running = true;
  s.ended = false;
  if (ts > s.runningAt) s.runningAt = ts;
}

function onUser(st, s, o, ts) {
  if (o.isMeta) return;
  meta(s, o);
  touch(s, ts);
  if (o.isSidechain && !st.subagentFile) {
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
      const popis = st.taskDesc.get(part.tool_use_id);
      if (popis) {
        const agentId = agentIdFrom(raw);
        if (agentId) st.subagentTitles.set(agentId, popis);
      }
      pushEntry(s, {
        at: ts,
        role: 'result',
        tool: pending?.name,
        text: rejected ? ui('Uživatel akci zamítl.') : clipBlock(raw, 800),
        status: part.is_error || rejected ? 'error' : 'ok',
      });
      if (s.pending?.toolUseId && s.pending.toolUseId === part.tool_use_id) s.pending = null;
    }
    if (!st.pendingTools.size) s.toolWaitSince = 0;
    aktualizujCekani(st, s);
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
    s.toolWaitKind = '';
    pushEntry(s, { at: ts, role: 'system', text: ui('Přerušeno uživatelem') });
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
  s.activity = ui('Přemýšlí…');
  markRunning(s, ts);
}

function onAssistant(st, s, o, ts, { onLimit, onSuccess, onQuota }) {
  const m = o.message;
  if (!m) return;
  meta(s, o);
  touch(s, ts);

  if (o.isApiErrorMessage) {
    const text = clip(textOf(m.content), 240) || ui('Chyba API');
    pushEntry(s, { at: ts, role: 'error', text });
    s.running = false;
    s.activity = '';
    const quota = quotaLimit(o, ts);
    if (quota) {
      // Přesný záznam od serveru má přednost před čtením textu: stejná hláška by jinak v přehledu
      // svítila dvakrát („Limit relace · model“ odhadem z textu a „Limit 5 h“ s přesnou obnovou).
      s.limit = { reached: true, text, at: ts, resetsAt: quota.resetsAt ?? parseResets(text, ts), model: null };
      onQuota?.(quota);
      return;
    }
    if (LIMIT_RE.test(text)) {
      const kind = limitKind(text);
      const resetsAt = parseResets(text, ts);
      // Limit relace i týdne umí platit jen pro jeden model: po přepnutí modelu se dá pracovat dál,
      // i když ten první je zablokovaný do obnovy. Který model narazil, prozradí poslední úspěšná
      // odpověď (chybová hláška sama nese model „<synthetic>“). Útrata je za celý účet, ne za model.
      const model = kind.id === 'claude:spend' ? null : s.model || null;
      s.limit = { reached: true, text, at: ts, resetsAt, model };
      onLimit?.({
        id: model ? `${kind.id}:${model}` : kind.id,
        provider: 'anthropic', app: 'Claude', label: model ? `${kind.label} · ${model}` : kind.label,
        usedPercent: null, windowMinutes: null, resetsAt, reached: true, plan: null, text, at: ts, model,
      });
    }
    return;
  }

  if (s.limit && ts > s.limit.at) s.limit = null;
  onSuccess?.(ts, m.model && !String(m.model).startsWith('<') ? m.model : null);
  if (m.model && !String(m.model).startsWith('<')) s.model = m.model;

  const parts = Array.isArray(m.content) ? m.content : [];
  if (!o.isSidechain || st.subagentFile) {
    for (const part of parts) {
      if (part?.type === 'text' && part.text?.trim()) {
        pushEntry(s, { at: ts, role: 'assistant', text: clipBlock(part.text, 4000) });
      } else if (part?.type === 'tool_use') {
        st.pendingTools.set(part.id, { name: part.name, at: ts });
        // Nástroj pro spuštění pomocníka se podle verze Claude Code jmenuje Task nebo Agent.
        if ((part.name === 'Task' || part.name === 'Agent') && part.input?.description) st.taskDesc.set(part.id, String(part.input.description));
        if (!s.toolWaitSince) s.toolWaitSince = ts;
        aktualizujCekani(st, s);
        s.turnSteps++;
        s.activity = describeTool(part.name, part.input);
        pushEntry(s, { at: ts, role: 'tool', tool: part.name, text: toolInputText(part.name, part.input) });
        if (part.name === 'AskUserQuestion') {
          s.pending = { kind: 'question', text: clip(part.input?.questions?.[0]?.question || ui('Má pro tebe otázku'), 200), at: ts, toolUseId: part.id, source: 'transcript' };
        } else if (part.name === 'ExitPlanMode') {
          s.pending = { kind: 'plan', text: ui('Čeká na schválení plánu'), at: ts, toolUseId: part.id, source: 'transcript' };
        } else if (part.name === 'TodoWrite') {
          s.progress = todosProgress(part.input?.todos) || s.progress;
        }
      }
    }
  }

  if (o.isSidechain && !st.subagentFile) markRunning(s, ts);
  else if (m.stop_reason === 'end_turn' || m.stop_reason === 'stop_sequence') {
    s.running = false;
    s.activity = '';
    s.toolWaitSince = 0;
    st.pendingTools.clear();
    s.toolWaitKind = '';
  } else markRunning(s, ts);

  const u = m.usage;
  const id = m.id || o.uuid;
  // Odbočka relace si do nového souboru kopíruje celou historii rodiče – i s jeho identifikátorem
  // relace. Počítat ty řádky znamenalo tytéž tokeny dvakrát: za 30 dní o 59 % víc, než kolik se
  // jich skutečně spotřebovalo, některé dny dvojnásobek. Tokeny proto patří jen řádkům relace
  // svého souboru (u pomocného agenta je to relace rodiče – jeho řádky nesou její identifikátor).
  // Pořadí načítání souborů na tom nezáleží, takže výsledek je vždy stejný.
  if (st.ownSessionId && o.sessionId && o.sessionId !== st.ownSessionId) return;
  if (u && id) {
    const cur = {
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheWrite: typeof u.cache_creation_input_tokens === 'number' ? u.cache_creation_input_tokens : 0,
      cacheRead: u.cache_read_input_tokens || 0,
      ts,
    };
    // Streamované zprávy se v přepisu opakují se stejným id – platí poslední záznam.
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

// Kde Claude Code ukládá přepisy. Ověřeno ve zdroji Claude Code 2.1.283 (26. 9. 2026):
// `CLAUDE_CONFIG_DIR/projects`, a bez té proměnné `~/.claude/projects`. Verze 1.0.x ukládaly
// podle nástroje ccusage i do `~/.config/claude/projects`; ta se čte, jen když existuje.
// Další kořeny přidá za běhu hook (transcript_path) nebo prostředí běžícího procesu.
export function korenyClaudeCode({ home, configDir = '' }) {
  const vlastni = rozbalCestu(configDir, home);
  return [...new Set([
    vlastni && path.join(vlastni, 'projects'),
    path.join(home, '.claude', 'projects'),
    path.join(home, '.config', 'claude', 'projects'),
  ].filter(Boolean))];
}

// Přepis hlavní konverzace: <kořen>/<projekt>/<id>.jsonl, kořen se jmenuje `projects`.
export function korenZPrepisu(cesta, sessionId) {
  if (typeof cesta !== 'string' || !path.isAbsolute(cesta)) return '';
  const soubor = path.resolve(cesta);
  if (path.basename(soubor) !== `${sessionId}.jsonl`) return '';
  const koren = path.dirname(path.dirname(soubor));
  return path.basename(koren) === 'projects' ? koren : '';
}

export function createClaudeCodeConnector(ctx) {
  const { store, config } = ctx;
  const windowMs = config.windowDays * DAY;
  const files = new Map();
  // Tatáž konverzace může být vidět ze dvou kořenů (~/.config/claude jako symlink na ~/.claude,
  // zkopírovaná složka). Čte se jen z prvního souboru, jinak by se tokeny i přepis započítaly dvakrát.
  const drzitele = new Map(); // localId → soubor
  let lastEventAt = 0;
  let lastHookAt = 0;
  let exists = false;
  const queue = createFileQueue(sync, 40);
  const koreny = createKorenyPrepisu(korenyClaudeCode({ home: config.sourceHome, configDir: config.claudeConfigDir }), {
    zmena: (koren, soubor) => (soubor ? queue.schedule(soubor) : scanKoren(koren)),
    domov: config.sourceHome,
  });

  // Poslední úspěšná odpověď každého modelu ('' = model neznámý). Soubory se načítají souběžně,
  // takže úspěch téhož modelu se může načíst dřív než starší hláška o limitu – a ten by pak zůstal
  // viset jako vyčerpaný, i když model mezitím zase odpovídal.
  const posledniUspech = new Map();
  const hooks = {
    onLimit: (limit) => {
      const uspech = limit.model
        ? Math.max(posledniUspech.get(limit.model) || 0, posledniUspech.get('') || 0)
        : Math.max(0, ...posledniUspech.values());
      store.setLimit(uspech > limit.at ? { ...limit, reached: false, text: '', at: uspech } : limit);
    },
    // Odmítnutí od serveru platí do přesného času obnovy; po něm ho živý přehled sám skryje
    // (public/js/ui.js#currentLimits). Úspěšná odpověď před obnovou ho nesmaže: může přijít
    // z jiného účtu nebo z dokupovaného využití – okno předplatného je pořád vyčerpané.
    onQuota: (limit) => store.setLimit(limit),
    onSuccess: (ts, model) => {
      const klic = model || '';
      if ((posledniUspech.get(klic) || 0) < ts) posledniUspech.set(klic, ts);
      for (const l of store.limits.values()) {
        if (l.provider !== 'anthropic' || !l.reached || l.at >= ts) continue;
        if (l.source === 'transcript-quota') continue;
        // Úspěch jiného modelu nic neříká o limitu toho, který narazil. Dřív ho shodil kdokoli:
        // Opus zablokovaný do 23:20 svítil jako volný 84 sekund po vyčerpání, jen proto, že
        // v téže relaci odpověděl jiný model.
        if (l.model && model && l.model !== model) continue;
        store.setLimit({ ...l, reached: false, text: '', at: ts });
      }
    },
  };

  // Tvar příkazu (POSIX shell, nebo PowerShell na Windows) určuje src/platform.js. ID vzniká
  // ze jména souboru; s pomlčkou na začátku by se z něj stal přepínač (stejně jako src/openers.js).
  function setResume(s, localId) {
    if (s.cwd && /^[A-Za-z0-9_][\w.-]*$/.test(String(localId || ''))) s.resume = prikazVeSlozce(s.cwd, 'claude', ['--resume', localId]);
  }

  // Přepisy pomocných agentů (Task) leží o dvě úrovně hlouběji:
  // <projekt>/<id rodičovské konverzace>/subagents/agent-<id>.jsonl. Bez nich by v Agenteeq
  // chyběla veškerá jejich práce i tokeny, které skutečně spotřebovaly.
  function subagentParent(file) {
    if (path.basename(path.dirname(file)) !== 'subagents') return '';
    return path.basename(path.dirname(path.dirname(file)));
  }

  // agentId → popis úlohy; plní se z rodičovských přepisů, používá se pro název pomocníka.
  const subagentTitles = new Map();

  async function sync(file) {
    if (!file.endsWith('.jsonl')) return;
    const depth = koreny.najdi(file)?.hloubka ?? -1;
    const parentLocalId = depth === 3 ? subagentParent(file) : '';
    if (depth !== 1 && !parentLocalId) return;
    const stat = await statSafe(file);
    if (!stat?.isFile()) {
      // Přepis zmizel (uživatel konverzaci smazal): nesmí v přehledu viset jako duch až do restartu.
      mimoObdobi.delete(file);
      const gone = files.get(file);
      if (gone) {
        store.remove(`claude-code:${gone.localId}`);
        files.delete(file);
        drzitele.delete(gone.localId);
      }
      return;
    }
    let f = files.get(file);
    if (!f && Date.now() - stat.mtimeMs > windowMs) {
      mimoObdobi.set(file, stat.mtimeMs);
      return;
    }
    mimoObdobi.delete(file);
    if (!f) {
      const drzi = drzitele.get(path.basename(file, '.jsonl'));
      if (drzi && drzi !== file && files.has(drzi)) return;
    }
    if (f && stat.size < f.tail.offset) {
      store.remove(`claude-code:${f.localId}`);
      files.delete(file);
      f = null;
    }
    // Nezměněný soubor nemá co přinést. Pravidelný průchod (pojistka za sledování souborů) by jinak
    // každých pár vteřin znovu souhrnoval všechny konverzace ve sledovaném období.
    if (f && f.size === stat.size && f.mtimeMs === stat.mtimeMs) return;
    if (!f) {
      f = { tail: new JsonlTail(file), st: newFileState(Boolean(parentLocalId)), localId: path.basename(file, '.jsonl'), parentLocalId };
      f.st.ownSessionId = parentLocalId || f.localId;
      files.set(file, f);
      drzitele.set(f.localId, file);
    }
    const s = store.ensure({ connector: 'claude-code', localId: f.localId, provider: 'anthropic', app: 'Claude Code' });
    if (f.parentLocalId) {
      s.parentId = `claude-code:${f.parentLocalId}`;
      s.subagent = { kind: 'agent', label: ui('Pomocný agent') };
    }
    const lines = await f.tail.read(stat.size);
    for (const o of lines) applyClaudeLine(f.st, s, o, hooks);
    for (const [agentId, popis] of f.st.subagentTitles) {
      if (subagentTitles.get(agentId) === popis) continue;
      subagentTitles.set(agentId, popis);
      // Rodič se mohl načíst až po pomocníkovi – dotitulkuj, co už je v paměti.
      const hotovy = store.get(`claude-code:agent-${agentId}`);
      if (hotovy && hotovy.title !== popis) {
        hotovy.title = popis;
        store.commit(hotovy);
      }
    }
    if (f.parentLocalId) {
      const popis = subagentTitles.get(f.localId.replace(/^agent-/, ''));
      if (popis) s.title = popis;
    }
    // Pomocného agenta nelze samostatně obnovit – příkaz `claude --resume` platí jen pro rodiče.
    if (!f.parentLocalId) setResume(s, f.localId);
    // Konec tahu je v přepisu explicitní (end_turn, přerušení, chyba API, hook Stop). Dlouhé přemýšlení
    // modelu nezapisuje nic, proto „pracuje“ drží až 30 min a teprve pak přejde do stavu bez aktivity.
    s.staleMs = 30 * MIN;
    if (lines.length) lastEventAt = Date.now();
    f.size = stat.size;
    f.mtimeMs = stat.mtimeMs;
    store.commit(s);
  }

  // Pravidelný průchod je pojistka za sledování souborů. Soubor, do kterého se hodinu nezapsalo,
  // stačí zkontrolovat při každém šestém průchodu (jednou za minutu) – změnu v něm stejně okamžitě
  // ohlásí sledování. Nové soubory a ty, do kterých se nedávno psalo, se kontrolují pokaždé.
  let pruchod = 0;
  const mimoObdobi = new Map(); // soubory starší než sledované období: cesta → mtime
  const klidny = (f) => {
    const m = files.get(f)?.mtimeMs ?? mimoObdobi.get(f);
    return m !== undefined && Date.now() - m > HOUR;
  };

  async function scanKoren(koren, plny = true) {
    const jsonl = (x) => x.endsWith('.jsonl');
    const soubory = [
      ...await listFiles(koren, 1, jsonl),
      ...await listFiles(koren, 3, (x) => jsonl(x) && path.basename(path.dirname(x)) === 'subagents'),
    ];
    for (const f of soubory) if (plny || !klidny(f)) await queue.run(f);
    return soubory;
  }

  async function scan() {
    exists = (await koreny.existujici()).length > 0;
    const plny = pruchod++ % 6 === 0;
    const videne = new Set();
    for (const koren of koreny.seznam()) for (const f of await scanKoren(koren, plny)) videne.add(f);
    // Soubory, které mezitím zmizely, projdou synchronizací ještě jednou – ta je z přehledu odebere.
    for (const known of [...files.keys()]) if (!videne.has(known)) await queue.run(known);
  }

  // Kořen, který prozradil běžící proces nebo hook. Nový se hned projde a začne sledovat.
  async function pridejKoren(koren) {
    if (!koreny.pridej(koren)) return false;
    await scanKoren(path.resolve(koren));
    return true;
  }

  // Okamžité události z Claude Code hooků (viz src/hooks-installer.js).
  async function ingestHook(p, now = Date.now()) {
    if (!p || typeof p.session_id !== 'string' || !/^[A-Za-z0-9_][\w-]{7,79}$/.test(p.session_id)) return { ok: false, error: ui('Neplatné session_id.') };
    const event = String(p.hook_event_name || '');
    if (!['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'].includes(event)) return { ok: false, error: ui('Neznámá událost.') };
    // Hook zná přesnou cestu k přepisu. Leží-li mimo známé kořeny (CLAUDE_CONFIG_DIR, který aplikace
    // z Finderu nevidí), přidá se jeho kořen – jinak by agent s hooky byl vidět bez přepisu a tokenů.
    const koren = korenZPrepisu(p.transcript_path, p.session_id);
    if (koren) {
      await pridejKoren(koren);
      await queue.run(path.resolve(p.transcript_path));
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
        s.activity = ui('Přemýšlí…');
        if (typeof p.prompt === 'string' && p.prompt.trim() && !isInjectedPrompt(p.prompt)) {
          s.lastPrompt = p.prompt;
          if (!s.firstPrompt) s.firstPrompt = p.prompt;
        }
        break;
      case 'Notification': {
        const type = p.notification_type;
        const msg = clip(p.message || '', 200);
        if (type === 'permission_prompt' || (!type && /permission/i.test(msg))) {
          s.pending = { kind: 'permission', text: msg || ui('Potřebuje povolení k akci'), at: now, source: 'hook' };
        } else if (type === 'elicitation_dialog') {
          s.pending = { kind: 'question', text: msg || ui('Potřebuje doplnit údaje'), at: now, source: 'hook' };
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
  // Neposouvá „poslední aktivitu“ – stavový řádek se překresluje i bez práce agenta.
  const statusCache = new Map();

  function statusLimit(key, w, now) {
    if (!w || typeof w.used_percentage !== 'number' || !Number.isFinite(w.used_percentage)) return null;
    const def = STATUS_WINDOWS[key];
    const used = Math.max(0, Math.min(100, w.used_percentage));
    const resetsAt = Number(w.resets_at) > 0 ? Math.round(Number(w.resets_at) * 1000) : null;
    const prev = store.limits.get(def.id);
    if (!prev || prev.usedPercent !== used || prev.resetsAt !== resetsAt || now - prev.at > MIN) {
      store.setLimit({ id: def.id, provider: 'anthropic', app: 'Claude', label: def.label, usedPercent: used, windowMinutes: def.minutes, resetsAt, reached: used >= 100, plan: null, text: '', at: now, source: 'statusline', kind: def.kind || 'window' });
    }
    return { used, resetsAt };
  }

  function ingestStatusline(p, now = Date.now()) {
    if (!p || typeof p.session_id !== 'string' || !/^[A-Za-z0-9_][\w-]{7,79}$/.test(p.session_id)) return { ok: false, error: ui('Neplatné session_id.') };
    const rl = p.rate_limits && typeof p.rate_limits === 'object' ? p.rate_limits : {};
    const five = statusLimit('five_hour', rl.five_hour, now);
    const week = statusLimit('seven_day', rl.seven_day, now);
    statusLimit('spend_limit', rl.spend_limit, now);
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
    const parts = ['Agenteeq'];
    if (typeof p.model?.display_name === 'string') parts.push(clip(p.model.display_name, 40));
    if (five) parts.push(`5 h ${Math.round(five.used)} %${five.resetsAt ? ` do ${hm(five.resetsAt)}` : ''}`);
    if (week) parts.push(`týden ${Math.round(week.used)} %`);
    if (ctxPct !== null) parts.push(`kontext ${ctxPct} %`);
    return { ok: true, text: parts.join(' · ').replace(/[\x00-\x1f\x7f]/g, '') };
  }

  return {
    id: 'claude-code',
    name: ui('Claude Code · CLI a Claude Desktop'),
    provider: 'anthropic',
    kind: 'local',
    verified: true,
    source: '~/.claude/projects (a CLAUDE_CONFIG_DIR)',
    description: ui('Přepis v reálném čase, nástroje, plán úkolů, dotazy na tebe, limity a tokeny.'),
    async start() {
      await scan();
      koreny.start();
    },
    scan,
    pridejKoren,
    koreny: () => koreny.seznam(),
    zkusKoreny: () => koreny.zkusChybejici(),
    stop() {
      koreny.stop();
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
          ? (lastHookAt ? ui('Sleduji {0} sessions za {1} dní. Okamžité události jsou aktivní.', count, config.windowDays) : ui('Sleduji {0} sessions za {1} dní.', count, config.windowDays))
          : exists
            ? ui('Složka existuje, zatím bez sessions.')
            : ui('Claude Code na {0} není.', POCITAC.tomto),
        count,
        watching: koreny.sleduje(),
        lastEventAt: Math.max(lastEventAt, lastHookAt),
        hooksActive: Boolean(lastHookAt),
      };
    },
  };
}
