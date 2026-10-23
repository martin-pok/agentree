import path from 'node:path';
import { run, toTs, clip, MIN } from '../util.js';
import { touch } from '../model.js';
import { ui } from '../texty.js';

const TASK_ID = /^[A-Za-z0-9_][\w.-]{0,199}$/;
const ACTIVE = new Set(['pending', 'queued', 'running', 'in_progress', 'processing', 'working', 'started']);
const FAILED = new Set(['failed', 'error', 'cancelled', 'canceled', 'timed_out']);

function taskUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com' ||
        !url.pathname.startsWith('/codex/') || url.username || url.password || url.port) return null;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function normalizeCodexCloudTask(raw) {
  if (!raw || typeof raw.id !== 'string' || !TASK_ID.test(raw.id)) return null;
  const url = taskUrl(raw.url);
  if (!url) return null;
  const status = String(typeof raw.status === 'string' ? raw.status : raw.status?.type || '').toLowerCase();
  const title = typeof raw.title === 'string' ? clip(raw.title.trim(), 400) : '';
  const updatedAt = toTs(raw.updated_at);
  const createdAt = toTs(raw.created_at);
  return { id: raw.id, url, status, title, updatedAt, createdAt,
    summary: typeof raw.summary === 'string' ? clip(raw.summary.trim(), 400) : '' };
}

// Cloudové běhy desktopové aplikace nemají místní JSONL přepis. Codex CLI umí jejich
// autorizovaný seznam přečíst přes stejný účet; žádný token se do Agenteeq nekopíruje.
export function createCodexCloudConnector({ store, config, bin = () => null,
  home = () => config.codexHome || path.join(config.sourceHome, '.codex'), runImpl = run }) {
  let lastPollAt = 0;
  let lastSuccessAt = 0;
  let lastError = '';
  let pending = null;
  const seen = new Set();

  async function readPage(program, cursor) {
    const args = ['cloud', 'list', '--json', '--limit', '20'];
    if (cursor) args.push('--cursor', cursor);
    const result = await runImpl(program, args, { timeout: 10000,
      env: { ...process.env, HOME: config.sourceHome, CODEX_HOME: home() } });
    if (!result?.ok) throw new Error(ui('Codex Cloud není dostupný nebo není přihlášený.'));
    let data;
    try { data = JSON.parse(result.stdout); } catch { throw new Error(ui('Codex Cloud vrátil nečitelný seznam úloh.')); }
    if (!Array.isArray(data?.tasks)) throw new Error(ui('Codex Cloud nevrátil seznam úloh.'));
    return data;
  }

  async function refresh() {
    const program = bin();
    if (!program) { lastError = ui('Spustitelný Codex není dostupný.'); return; }
    const now = Date.now();
    const tasks = [];
    let cursor = null;
    const cursors = new Set();
    try {
      for (let page = 0; page < 5; page++) {
        const data = await readPage(program, cursor);
        tasks.push(...data.tasks);
        if (!data.cursor || typeof data.cursor !== 'string' || cursors.has(data.cursor)) break;
        cursors.add(data.cursor);
        cursor = data.cursor;
      }
    } catch (error) { lastError = error.message; return; }
    lastSuccessAt = now;
    lastError = '';
    for (const raw of tasks) {
      const task = normalizeCodexCloudTask(raw);
      if (!task) continue;
      const s = store.ensure({ connector: 'codex-cloud', localId: task.id,
        provider: 'openai', app: 'Codex · cloud', source: 'cloud' });
      seen.add(task.id);
      s.url = task.url;
      if (task.title) s.title = task.title;
      else if (!s.title) s.title = ui('Cloudová úloha Codexu');
      s.startedAt ||= Math.min(task.createdAt || task.updatedAt || now, now);
      s.lastAt = Math.max(s.lastAt, Math.min(task.updatedAt || 0, now));
      const running = ACTIVE.has(task.status);
      s.running = running;
      s.runningAt = running ? now : 0;
      s.staleMs = 45 * 1000;
      s.activity = running ? ui('Cloudová úloha běží · podle Codexu') : '';
      s.failure = FAILED.has(task.status)
        ? { at: task.updatedAt || now, text: ui('Codex Cloud hlásí selhání úlohy.') } : null;
      if (!running && !s.failure && task.summary) s.turns = Math.max(s.turns, 1);
      touch(s, task.updatedAt || task.createdAt || now);
      store.commit(s, now);
    }
  }

  function scan(force = false) {
    if (pending) return pending;
    if (!force && Date.now() - lastPollAt < 20 * 1000) return Promise.resolve();
    lastPollAt = Date.now();
    pending = refresh().finally(() => { pending = null; });
    return pending;
  }

  return {
    id: 'codex-cloud', name: 'Codex Cloud', provider: 'openai', kind: 'local',
    verified: false, source: 'codex cloud list --json',
    description: ui('Vzdálené úlohy z účtu Codex včetně běhů nativní aplikace.'),
    async start() {}, scan, stop() {}, idle: () => pending || Promise.resolve(),
    status() {
      const count = seen.size;
      return {
        state: lastError ? 'error' : lastSuccessAt ? 'connected' : bin() ? 'idle' : 'missing',
        detail: lastError || (lastSuccessAt
          ? ui('Cloudové úlohy Codexu: {0}. Poslední načtení {1}.', count, new Date(lastSuccessAt).toLocaleTimeString('cs-CZ'))
          : ui('Čekám na první načtení cloudových úloh Codexu.')),
        count, watching: Boolean(lastSuccessAt && Date.now() - lastSuccessAt < 2 * MIN),
        lastEventAt: lastSuccessAt,
      };
    },
  };
}
