// Dedicated child process owned by the Mac app. Never attach to an unknown server.
import { loadConfig, VERSION } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createHttpServer } from '../src/http.js';
import http from 'node:http';
import { bindDesktop, alive } from './lifecycle.mjs';

let app, server, stopping = false;
const report = (data) => process.stdout.write(`AGENTEEQ_DESKTOP ${JSON.stringify(data)}\n`);
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  app?.runs.stopAll();
  server?.closeAllConnections?.();
  server?.close();
  const deadline = setTimeout(() => process.exit(code), 8000);
  deadline.unref();
  await app?.stop();
  // RunManager escalates stubborn child process groups after 5 s. Keep the
  // owner alive until that cleanup has happened, including on parent EOF.
  const until = Date.now() + 6500;
  while (app?.runs.children.size && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  process.exit(code);
}
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop());
// EOF means the owner crashed/quit: no orphan server and no orphan paid runs.
process.stdin.resume();
process.stdin.on('end', () => stop());
const ownerPid = Number(process.env.AGENTEEQ_PARENT_PID) || process.ppid;
// A second independent guard covers a leaked/inherited stdin write handle.
const ownerWatch = setInterval(() => { if (process.ppid !== ownerPid || !alive(ownerPid)) stop(); }, 500);
ownerWatch.unref();
process.on('uncaughtException', () => { report({ error: 'Služba narazila na neočekávanou chybu.' }); stop(1); });
process.on('unhandledRejection', () => { report({ error: 'Nepodařilo se dokončit operaci služby.' }); stop(1); });
try {
  const config = loadConfig();
  config.lifecycle = { pid: process.pid, ownerPid };
  // Acquire the port BEFORE loading/flushing shared data or starting watchers.
  server = http.createServer();
  const starting = (_req, res) => { res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '1' }); res.end('{"error":"Agenteeq se připravuje."}'); };
  server.on('request', starting);
  await bindDesktop(server, config);
  app = await createApp(config);
  server.removeListener('request', starting);
  createHttpServer(app, server);
  await app.start();
  const badge = () => report({ type: 'badge', count: app.store.list().filter((s) => ['needs_input', 'limited', 'failed'].includes(s.status)).length });
  let badgeTimer;
  const scheduleBadge = () => { clearTimeout(badgeTimer); badgeTimer = setTimeout(badge, 100); badgeTimer.unref(); };
  app.store.on('session', scheduleBadge);
  app.store.on('session:remove', scheduleBadge);
  app.store.on('alert', (alert) => {
    if (app.datastore.data.settings.notifications.native) report({ type: 'notification', title: alert.title, body: alert.body || '', id: alert.id, route: alert.sessionId ? `#/agent/${encodeURIComponent(alert.sessionId)}` : '#/upozorneni' });
  });
  report({ ready: true, port: server.address().port, version: VERSION });
  badge();
} catch (err) {
  report({ error: err.code === 'EADDRINUSE' ? 'Port 4620 používá jiná aplikace nebo starší Agenteeq. Ukonči původní server a zkus to znovu.' : 'Lokální službu se nepodařilo spustit. Zkus aplikaci otevřít znovu.' });
  await stop(1);
}
