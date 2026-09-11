import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uid, clip } from './util.js';

const MAX_RUNS = 50;
const KILL_GRACE_MS = 5000;

// Agenti spuštění z Agentree na pozadí: proces, log, stav, zastavení.
export class RunManager {
  constructor({ dataDir, onChange = () => {}, spawnImpl = spawn }) {
    this.dir = path.join(dataDir, 'runs');
    this.onChange = onChange;
    this.spawnImpl = spawnImpl;
    this.runs = new Map();
    this.children = new Map();
  }

  list() {
    return [...this.runs.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id) {
    return this.runs.get(id) || null;
  }

  update(id, patch) {
    const run = this.runs.get(id);
    if (!run) return;
    Object.assign(run, patch);
    this.onChange(this.list(), run);
  }

  start({ agent, label, argv, cwd, prompt, sessionId = null, projectId = null, env = process.env }) {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const id = uid();
    const logFile = path.join(this.dir, `${id}.log`);
    const fd = fs.openSync(logFile, 'a', 0o600);
    const run = { id, agent, label, cwd, prompt: clip(prompt, 240), sessionId, projectId, pid: null, status: 'running', exitCode: null, error: '', startedAt: Date.now(), endedAt: null, logFile };
    this.runs.set(id, run);
    let child;
    try {
      child = this.spawnImpl(argv[0], argv.slice(1), { cwd, env, detached: true, stdio: ['ignore', fd, fd] });
    } catch (err) {
      Object.assign(run, { status: 'failed', error: err.message, endedAt: Date.now() });
      this.onChange(this.list(), run);
      return run;
    } finally {
      // Dítě má vlastní kopii popisovače; server ho zavře hned.
      try { fs.closeSync(fd); } catch { /* už zavřeno */ }
    }
    run.pid = child.pid;
    this.children.set(id, child);
    child.on('error', (err) => {
      this.children.delete(id);
      this.update(id, { status: 'failed', error: clip(err.message, 200), endedAt: Date.now() });
    });
    child.on('exit', (code, signal) => {
      this.children.delete(id);
      const cur = this.runs.get(id);
      if (!cur || cur.status !== 'running' && cur.status !== 'stopping') return;
      const stopped = cur.status === 'stopping' || signal === 'SIGTERM' || signal === 'SIGKILL';
      this.update(id, { status: stopped ? 'stopped' : code === 0 ? 'done' : 'failed', exitCode: code, endedAt: Date.now(), error: code && !stopped ? this.tail(id, 400).trim().split('\n').pop() || `Skončilo s kódem ${code}` : '' });
    });
    this.trim();
    this.onChange(this.list(), run);
    return run;
  }

  stop(id) {
    const run = this.runs.get(id);
    const child = this.children.get(id);
    if (!run || !child || run.status !== 'running') return false;
    this.update(id, { status: 'stopping' });
    const kill = (sig) => {
      try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* proces už neexistuje */ } }
    };
    kill('SIGTERM');
    const t = setTimeout(() => { if (this.children.has(id)) kill('SIGKILL'); }, KILL_GRACE_MS);
    t.unref?.();
    return true;
  }

  tail(id, bytes = 4000) {
    const run = this.runs.get(id);
    if (!run) return '';
    try {
      const stat = fs.statSync(run.logFile);
      const len = Math.min(bytes, stat.size);
      const buf = Buffer.alloc(len);
      const fd = fs.openSync(run.logFile, 'r');
      fs.readSync(fd, buf, 0, len, stat.size - len);
      fs.closeSync(fd);
      return buf.toString('utf8');
    } catch {
      return '';
    }
  }

  trim() {
    const done = this.list().filter((r) => r.status !== 'running' && r.status !== 'stopping');
    for (const r of done.slice(MAX_RUNS)) this.runs.delete(r.id);
  }

  // Skryje dokončené běhy ze seznamu (logy na disku zůstanou).
  clearFinished() {
    let removed = 0;
    for (const r of this.list()) {
      if (r.status === 'running' || r.status === 'stopping') continue;
      this.runs.delete(r.id);
      removed++;
    }
    if (removed) this.onChange(this.list(), null);
    return removed;
  }

  stopAll() {
    for (const id of this.children.keys()) this.stop(id);
  }
}
