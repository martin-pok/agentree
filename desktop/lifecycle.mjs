import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { run } from '../src/util.js';

// Audited 0.5 CLI. Never authorize takeover from a process name or HTTP claim alone.
const LEGACY_CLI_SHA = 'd07a50ddff833176873954dfb6ddf4ebb9348bd9373a9fea04fe7c4133cfc8d1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };

export async function listenerPid(port) {
  const r = await run('/usr/sbin/lsof', ['-nP', '-a', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { timeout: 1500 });
  const pids = [...new Set(r.stdout.trim().split(/\s+/).filter(Boolean).map(Number))];
  return pids.length === 1 && Number.isInteger(pids[0]) ? pids[0] : null;
}

export async function identifyRetiredServer(config) {
  if (process.platform !== 'darwin') return null;
  const pid = await listenerPid(config.port);
  if (!pid || pid === process.pid) return null;
  const base = `http://127.0.0.1:${config.port}`;
  const get = (suffix) => fetch(base + suffix, { signal: AbortSignal.timeout(1200) }).then((r) => r.ok ? r.json() : null).catch(() => null);
  const health = await get('/api/health');
  if (!health?.ok || !health.ready) return null;
  const snapshot = await get('/api/state');
  if (!snapshot?.integrations?.install || !Array.isArray(snapshot.runs) || snapshot.runs.some((r) => ['running', 'stopping'].includes(r.status))) return null;
  const install = snapshot.integrations.install;
  if (path.resolve(install.dataDir || '') !== path.resolve(config.dataDir)) return null;
  let script, expectedHash;
  if (health.lifecycle?.pid === pid) {
    // A live GUI owns its child. Only an orphan is eligible for recovery.
    if (health.lifecycle.ownerPid && alive(health.lifecycle.ownerPid)) return null;
    script = path.join(install.root, 'desktop/server.mjs');
    expectedHash = digest(await fs.readFile(fileURLToPath(new URL('./server.mjs', import.meta.url))));
  } else if (health.version === '0.5.0') {
    script = install.bin;
    expectedHash = LEGACY_CLI_SHA;
  } else return null;
  try {
    const actual = await fs.realpath(script);
    const root = await fs.realpath(install.root);
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    if (manifest.name !== 'agentree' || !actual.startsWith(root + path.sep) || digest(await fs.readFile(actual)) !== expectedHash) return null;
    const info = await run('/bin/ps', ['-ww', '-p', String(pid), '-o', 'uid=,args='], { timeout: 1200 });
    const executableInfo = await run('/bin/ps', ['-ww', '-p', String(pid), '-o', 'comm='], { timeout: 1200 });
    const line = info.stdout.trim();
    const uid = Number(line.match(/^\d+/)?.[0]);
    if (uid !== process.getuid()) return null;
    // Exact executable + exact audited entrypoint, no arbitrary flags/shell wrapper.
    const executable = executableInfo.stdout.trim();
    const command = line.replace(/^\d+\s+/, '');
    if (path.basename(executable) !== 'node' || !command.startsWith(`${executable} `)) return null;
    // macOS aliases /var and /tmp to /private/...; compare real paths, not spelling.
    if (await fs.realpath(command.slice(executable.length + 1)) !== actual) return null;
    if (await listenerPid(config.port) !== pid) return null;
    return { pid, script, executable, legacy: !health.lifecycle };
  } catch { return null; }
}

export function bind(server, config) {
  return new Promise((resolve, reject) => {
    const error = (e) => { server.off('listening', listening); reject(e); };
    const listening = () => { server.off('error', error); resolve(); };
    server.once('error', error); server.once('listening', listening);
    server.listen(config.port, config.host);
  });
}

export async function bindDesktop(server, config) {
  try { await bind(server, config); return; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  // An immediately preceding quit is allowed to finish without being signalled.
  for (let n = 0; n < 4; n++) {
    await sleep(150);
    try { await bind(server, config); return; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  const retired = await identifyRetiredServer(config);
  if (retired) {
    // The PID still owns this exact listening socket. SIGTERM invokes Agentree's flush.
    if (await listenerPid(config.port) === retired.pid) process.kill(retired.pid, 'SIGTERM');
    for (let n = 0; n < 40; n++) {
      await sleep(150);
      try { await bind(server, config); return; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
    }
  }
  throw Object.assign(new Error('Port je obsazený; žádný cizí proces nebyl ukončen.'), { code: 'EADDRINUSE' });
}
