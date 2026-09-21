import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { run } from '../src/util.js';

// Otisk CLI, které smí být převzato. Mění se s obsahem bin/agenteeq.mjs – naposledy při
// otevírání prohlížeče mimo macOS (0.12.0), předtím při přejmenování Agentree → Agenteeq (0.8.0).
// Nikdy nepovolujeme převzetí jen podle názvu procesu.
//
// Ta konstanta je pojistka, ne administrativa: test v test/lifecycle.test.mjs spadne pokaždé,
// když se vstupní bod změní, a vynutí si tím, aby se znovu přečetl. Přepsat ji bez přečtení
// toho, co se v bin/agenteeq.mjs opravdu změnilo, znamená tu pojistku zahodit.
const LEGACY_CLI_SHA = 'c7a5a28e2d2085a9ffed82f06628b0269e615788b209de1dc270648f5c2b1358';
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
  // Server s klíčem okna /api/state cizímu procesu nevydá; údaje pro převzetí proto nese i /api/health.
  const snapshot = (await get('/api/state')) || (health.install?.root ? { integrations: { install: health.install }, runs: Array.from({ length: health.runsActive || 0 }, () => ({ status: 'running' })) } : null);
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
    if (manifest.name !== 'agenteeq' || !actual.startsWith(root + path.sep) || digest(await fs.readFile(actual)) !== expectedHash) return null;
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
    // The PID still owns this exact listening socket. SIGTERM invokes Agenteeq's flush.
    if (await listenerPid(config.port) === retired.pid) process.kill(retired.pid, 'SIGTERM');
    for (let n = 0; n < 40; n++) {
      await sleep(150);
      try { await bind(server, config); return; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
    }
  }
  throw Object.assign(new Error('Port je obsazený; žádný cizí proces nebyl ukončen.'), { code: 'EADDRINUSE' });
}
