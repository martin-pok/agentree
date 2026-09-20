import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSafe, readJson, toTs, clip, clipBlock, isInjectedPrompt, MIN, DAY } from '../util.js';
import { touch, addTokens, pushEntry, resetTranscript } from '../model.js';
import { todosProgress } from './claude-code.js';
import { appSupportDir, JE_WINDOWS } from '../platform.js';
import { noDataState } from './install-state.js';

// Cesta k datům Cursoru se liší jen základem složky; zbytek struktury je všude stejný.
// Windows varianta zatím není ověřená na skutečném stroji – proto je v docs/CONNECTORS.md
// vedená jako Beta.
const CURSOR_ZDROJ = JE_WINDOWS
  ? '%APPDATA%\\Cursor\\User\\…\\state.vscdb'
  : '~/Library/Application Support/Cursor/…/state.vscdb';

const BUBBLES_MAX = 120;

const parse = (v) => {
  if (typeof v !== 'string') return null;
  try { return JSON.parse(v); } catch { return null; }
};

// Cursor ukládá agenty (Composer) do SQLite: composerHeaders + cursorDiskKV (composerData:*, bubbleId:*).
export function applyCursorComposer(s, { header, head, data, bubbles, folder, now = Date.now(), dbChangedAt = now }) {
  resetTranscript(s);
  s.turns = 0;
  s.tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  s.hourly = {};
  s.startedAt = 0;
  s.lastAt = 0;
  s.minutes = new Set();
  touch(s, toTs(header.createdAt || data?.createdAt));
  for (const b of bubbles) {
    if (!b) continue;
    const at = toTs(b.createdAt) || toTs(header.lastUpdatedAt);
    touch(s, at);
    const text = clipBlock(typeof b.text === 'string' ? b.text : '', 4000);
    if (b.type === 1) {
      if (text && !isInjectedPrompt(text)) {
        s.turns++;
        s.lastPrompt = text;
        if (!s.firstPrompt) s.firstPrompt = text;
        pushEntry(s, { at, role: 'user', text });
      }
    } else {
      if (text) pushEntry(s, { at, role: 'assistant', text });
      const tool = b.toolFormerData?.name;
      if (tool) pushEntry(s, { at, role: 'tool', tool: clip(tool.replace(/_v\d+$/, '').replace(/_/g, ' '), 60), text: '', status: b.toolFormerData?.status === 'error' ? 'error' : undefined });
    }
    const t = b.tokenCount;
    if (t && (t.inputTokens || t.outputTokens)) addTokens(s, at, { input: t.inputTokens || 0, output: t.outputTokens || 0 });
  }
  touch(s, toTs(header.lastUpdatedAt || data?.lastUpdatedAt));
  if (typeof data?.name === 'string' && data.name) s.title = data.name;
  if (folder) s.cwd = folder;
  if (typeof data?.modelConfig?.modelName === 'string' && data.modelConfig.modelName !== 'default') s.model = data.modelConfig.modelName;
  s.progress = todosProgress(data?.todos);
  const generating = (Array.isArray(data?.generatingBubbleIds) && data.generatingBubbleIds.length > 0) || data?.status === 'generating';
  s.staleMs = 10 * MIN;
  s.running = generating && now - Math.max(s.lastAt, dbChangedAt) < 10 * MIN;
  s.runningAt = s.running ? now : s.lastAt;
  s.activity = s.running ? 'Pracuje v editoru' : '';
  s.pending = head?.hasBlockingPendingActions ? { kind: 'permission', text: 'Cursor čeká na schválení akce', at: s.pending?.at || toTs(header.lastUpdatedAt) || now, source: 'cursor' } : null;
}

export function createCursorConnector(ctx) {
  const { store, config } = ctx;
  const base = path.join(appSupportDir(config.sourceHome), 'Cursor', 'User');
  const dbPath = path.join(base, 'globalStorage', 'state.vscdb');
  const windowMs = config.windowDays * DAY;
  const seen = new Map();
  const folders = new Map();
  let timer = null;
  let signature = '';
  let exists = false;
  let error = '';
  let lastEventAt = 0;
  let dbChangedAt = 0;
  let Database = null;

  async function folderFor(workspaceId) {
    if (!workspaceId) return '';
    if (folders.has(workspaceId)) return folders.get(workspaceId);
    const ws = await readJson(path.join(base, 'workspaceStorage', String(workspaceId), 'workspace.json'), null);
    let folder = '';
    if (typeof ws?.folder === 'string' && ws.folder.startsWith('file://')) {
      try { folder = fileURLToPath(ws.folder); } catch { folder = ''; }
    }
    folders.set(workspaceId, folder);
    return folder;
  }

  async function poll() {
    const stat = await statSafe(dbPath);
    exists = Boolean(stat);
    if (!stat) return;
    const wal = await statSafe(`${dbPath}-wal`);
    const sig = `${stat.mtimeMs}:${stat.size}:${wal?.mtimeMs || 0}:${wal?.size || 0}`;
    const now = Date.now();
    if (sig === signature) {
      // Beze změny v databázi: jen přepočítat zastaralé "generuje".
      for (const s of store.sessions.values()) if (s.connector === 'cursor' && s.running && now - dbChangedAt > 10 * MIN) { s.running = false; store.commit(s, now); }
      return;
    }
    signature = sig;
    dbChangedAt = now;
    if (!Database) {
      try {
        ({ DatabaseSync: Database } = await import('node:sqlite'));
      } catch {
        error = 'Tato verze Node.js neumí číst SQLite (potřeba Node 22.13+).';
        return;
      }
    }
    let db;
    try {
      db = new Database(dbPath, { readOnly: true });
      const since = now - windowMs;
      let headers;
      try {
        headers = db.prepare('SELECT composerId, workspaceId, createdAt, lastUpdatedAt, isArchived, isSubagent, value FROM composerHeaders WHERE isSubagent = 0 AND lastUpdatedAt >= ? ORDER BY lastUpdatedAt DESC LIMIT 150').all(since);
      } catch {
        headers = [];
      }
      const getKv = db.prepare('SELECT value FROM cursorDiskKV WHERE key = ?');
      for (const header of headers) {
        if (seen.get(header.composerId) === header.lastUpdatedAt && !store.get(`cursor:${header.composerId}`)?.running) continue;
        const data = parse(getKv.get(`composerData:${header.composerId}`)?.value);
        const list = Array.isArray(data?.fullConversationHeadersOnly) ? data.fullConversationHeadersOnly.slice(-BUBBLES_MAX) : [];
        if (!list.length) {
          seen.set(header.composerId, header.lastUpdatedAt);
          continue;
        }
        const bubbles = list.map((h) => parse(getKv.get(`bubbleId:${header.composerId}:${h.bubbleId}`)?.value));
        const s = store.ensure({ connector: 'cursor', localId: header.composerId, provider: 'cursor', app: 'Cursor' });
        applyCursorComposer(s, { header, head: parse(header.value), data, bubbles, folder: await folderFor(header.workspaceId), now, dbChangedAt });
        seen.set(header.composerId, header.lastUpdatedAt);
        lastEventAt = now;
        store.commit(s, now);
      }
      error = '';
    } catch (err) {
      error = `Databázi Cursoru se nepodařilo přečíst: ${clip(err.message, 120)}`;
    } finally {
      try { db?.close(); } catch { /* už zavřeno */ }
    }
  }

  return {
    id: 'cursor',
    name: 'Cursor · agenti',
    provider: 'cursor',
    kind: 'local',
    verified: true,
    source: CURSOR_ZDROJ,
    description: 'Agenti v Cursoru: přepis, nástroje, plán úkolů, generování a čekání na schválení.',
    async start() {
      await poll();
      timer = setInterval(() => poll().catch(() => {}), 3000);
      timer.unref?.();
    },
    scan: poll,
    stop() {
      clearInterval(timer);
    },
    idle: async () => {},
    status() {
      const count = [...store.sessions.values()].filter((s) => s.connector === 'cursor').length;
      const bezDat = noDataState({ installed: ctx.installed?.app('Cursor') ?? null, trace: exists, name: 'Cursor', traceLabel: 'databáze Cursoru', whatMissing: `za posledních ${config.windowDays} dní nemá žádné agenty` });
      return {
        state: error ? 'error' : count ? 'connected' : bezDat.state,
        detail: error || (count ? `Sleduji ${count} agentů za ${config.windowDays} dní.` : bezDat.detail),
        count,
        watching: Boolean(timer),
        lastEventAt,
      };
    },
  };
}
