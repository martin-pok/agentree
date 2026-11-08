import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { clip, DAY } from '../util.js';
import { touch } from '../model.js';
import { codexAppName, readableCodexTitle } from './codex.js';
import { ui } from '../texty.js';
import { JE_MAC } from '../platform.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nativeCodexBinary(home) {
  if (!JE_MAC) return null;
  for (const app of ['/Applications/Codex.app', path.join(home, 'Applications/Codex.app')]) {
    const bin = path.join(app, 'Contents/Resources/codex');
    try { fs.accessSync(bin, fs.constants.X_OK); return bin; } catch { /* try next */ }
  }
  return null;
}

// Codex.app maintains thread metadata in its state DB even when it has not
// written a local rollout. Ask the public app-server protocol for that index.
export function readCodexAppThreads(bin, home, { spawnFn = spawn, timeoutMs = 10000 } = {}) {
  if (!bin) return Promise.resolve(null);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(bin, ['app-server', '--stdio'], {
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, CODEX_HOME: home },
      });
    } catch { resolve(null); return; }
    let settled = false;
    let buffer = '';
    const threads = [];
    const cursors = new Set();
    let requestId = 1;
    let pages = 0;
    let stateDbOnly = true;
    let cursor = null;
    const requestPage = () => {
      requestId++;
      child.stdin.write(`${JSON.stringify({ id: requestId, method: 'thread/list', params: {
        limit: 100, sortKey: 'updated_at', sortDirection: 'desc',
        ...(stateDbOnly ? { useStateDbOnly: true } : {}), ...(cursor ? { cursor } : {}),
      } })}\n`);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    child.on('error', () => finish(null));
    child.on('exit', () => finish(null));
    child.stdin.on('error', () => finish(null));
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 4_000_000) return finish(null);
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && message.result) {
          child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
          requestPage();
        } else if (message.id === 1 && message.error) finish(null);
        else if (message.id === requestId) {
          if (message.error) {
            // Older binaries may reject useStateDbOnly. Retry only the first page,
            // then retain that compatible parameter set for every following page.
            if (stateDbOnly && pages === 0) { stateDbOnly = false; requestPage(); }
            else finish(null);
            continue;
          }
          if (!Array.isArray(message.result?.data)) { finish(null); continue; }
          threads.push(...message.result.data);
          pages++;
          const next = message.result.nextCursor;
          if (next == null || next === '') { finish(threads); continue; }
          // A repeated cursor, malformed page or exceeded bound is an incomplete
          // index, never a successful truncated list that silently hides agents.
          if (typeof next !== 'string' || next.length > 4096 || cursors.has(next) || pages >= 100 || threads.length >= 10000) {
            finish(null); continue;
          }
          cursors.add(next); cursor = next; requestPage();
        }
      }
    });
    child.stdin.write(`${JSON.stringify({ id: 1, method: 'initialize', params: {
      clientInfo: { name: 'agenteeq', title: 'Agenteeq', version: '0.1.0' },
    } })}\n`);
  });
}

export function normalizeCodexAppThread(thread, now = Date.now()) {
  if (!UUID.test(thread?.id) || thread.ephemeral || thread.parentThreadId) return null;
  if (thread.source !== 'appServer' && !/desktop/i.test(thread.originator || '')) return null;
  const updatedAt = Number(thread.updatedAt) * 1000;
  if (!Number.isFinite(updatedAt) || updatedAt <= 0 || updatedAt > now + 60_000) return null;
  const createdAt = Number(thread.createdAt) * 1000;
  return {
    id: thread.id,
    title: readableCodexTitle(thread.name) || readableCodexTitle(thread.preview),
    cwd: typeof thread.cwd === 'string' ? clip(thread.cwd, 1000) : '',
    model: typeof thread.model === 'string' ? clip(thread.model, 100) : '',
    app: codexAppName(thread.originator || 'Codex Desktop'),
    updatedAt,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : updatedAt,
    // Another app-server process cannot prove that Codex.app currently runs a
    // turn. Only an explicit active state is allowed to become "working".
    active: thread.status?.type === 'active',
  };
}

export function createCodexAppThreadsConnector({ store, config, codexCloudBin, codexCloudHome,
  readThreads = readCodexAppThreads }) {
  let lastEventAt = 0;
  let lastError = '';
  let count = 0;
  let pending = null;
  const scan = () => {
    if (pending) return pending;
    pending = (async () => {
      // The bundled binary speaks the same app-server version as the running
      // desktop app; a separately installed CLI may lag behind its state DB.
      const nativeBin = nativeCodexBinary(config.sourceHome);
      const cliBin = codexCloudBin();
      if (!nativeBin && !cliBin) { lastError = ui('Spustitelný Codex není dostupný.'); return; }
      const now = Date.now();
      const defaultHome = path.join(config.sourceHome, '.codex');
      const cliHome = codexCloudHome() || defaultHome;
      const sources = [];
      if (nativeBin) sources.push([nativeBin, defaultHome]);
      if (cliBin && (!nativeBin || cliHome !== defaultHome)) sources.push([cliBin, cliHome]);
      const pages = await Promise.all(sources.map(([bin, home]) => readThreads(bin, home)));
      if (pages.every((page) => !page)) { lastError = ui('Seznam vláken aplikace Codex není dostupný.'); return; }
      const threads = [...new Map(pages.flatMap((page) => page || []).map((thread) => [thread.id, thread])).values()];
      lastError = '';
      lastEventAt = now;
      count = 0;
      for (const raw of threads) {
        const t = normalizeCodexAppThread(raw, now);
        if (!t || now - t.updatedAt > config.windowDays * DAY) continue;
        count++;
        const existing = store.get(`codex:${t.id}`);
        // A local rollout carries stronger evidence, including exact turn
        // status and transcript. Never overwrite it with index metadata.
        if (existing && !existing.metadataOnly) continue;
        const s = existing || store.ensure({ connector: 'codex', localId: t.id,
          provider: 'openai', app: t.app, source: 'app-server' });
        s.metadataOnly = true;
        s.app = t.app;
        if (t.title) s.title = t.title;
        if (t.cwd) s.cwd = t.cwd;
        if (t.model) s.model = t.model;
        s.resume = `codex resume ${t.id}`;
        s.staleMs = 45_000;
        s.running = t.active;
        s.runningAt = t.active ? now : 0;
        s.activity = t.active ? ui('Pracuje · podle aplikace Codex') : '';
        touch(s, t.createdAt);
        touch(s, t.updatedAt);
        store.commit(s, now);
      }
    })().finally(() => { pending = null; });
    return pending;
  };
  return {
    id: 'codex-app-threads', name: ui('Vlákna aplikace Codex'), provider: 'openai',
    kind: 'local', verified: true, source: 'Codex app-server thread/list',
    description: ui('Názvy a stav vláken aplikace Codex bez místního přepisu.'),
    start: scan, scan, stop() {},
    status: () => ({ state: lastError ? 'error' : lastEventAt ? 'connected' : 'idle',
      detail: lastError || ui('Nalezeno {0} vláken aplikace Codex.', count), count, lastEventAt }),
  };
}
