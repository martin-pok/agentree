#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { loadConfig, VERSION } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createHttpServer } from '../src/http.js';
import { installLaunchAgent, uninstallLaunchAgent } from '../src/launch-agent.js';
import { openCommand } from '../src/platform.js';

const HELP = `Agenteeq ${VERSION} – všichni AI agenti na jednom místě

Použití:
  agenteeq                 spustí server a dashboard na http://127.0.0.1:4620
  agenteeq --open          spustí server a otevře dashboard v prohlížeči
  agenteeq install-agent   spouštět automaticky po přihlášení (macOS LaunchAgent)
  agenteeq uninstall-agent zrušit automatické spouštění
  agenteeq --version       vypíše verzi

Proměnné prostředí: PORT, AGENTEEQ_HOME, OPENAI_ADMIN_KEY, ANTHROPIC_ADMIN_KEY (viz docs/INSTALL.md)`;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('-')));
const cmd = args.find((a) => !a.startsWith('-'));
const openBrowser = flags.has('--open');

if (flags.has('--version') || flags.has('-v')) {
  console.log(VERSION);
  process.exit(0);
}
if (flags.has('--help') || flags.has('-h')) {
  console.log(HELP);
  process.exit(0);
}
const unknownFlag = [...flags].find((f) => f !== '--open');
if (unknownFlag) {
  console.error(`Neznámý přepínač: ${unknownFlag}\n\n${HELP}`);
  process.exit(1);
}
if (cmd === 'install-agent') {
  const r = await installLaunchAgent({ script: fileURLToPath(import.meta.url) });
  console.log(`Hotovo. Agenteeq se spouští po přihlášení.\nKonfigurace: ${r.file}\nLogy: ${r.logDir}`);
  process.exit(0);
}
if (cmd === 'uninstall-agent') {
  const r = await uninstallLaunchAgent();
  console.log(`Automatické spouštění zrušeno (${r.file}).`);
  process.exit(0);
}
if (cmd) {
  console.error(`Neznámý příkaz: ${cmd}\n\n${HELP}`);
  process.exit(1);
}

const config = loadConfig();
const openUrl = (url) => {
  if (!openBrowser) return;
  const p = openCommand(url);
  // Když systém neumíme otevřít, adresa se aspoň vypíše – mlčet by znamenalo nechat
  // uživatele čekat na prohlížeč, který nepřijde.
  if (p) execFile(p.cmd, p.args, () => {});
  else console.log(`Otevři v prohlížeči: ${url}`);
};

const app = await createApp(config);
await app.start();
const server = createHttpServer(app);

server.on('error', async (err) => {
  const url = `http://127.0.0.1:${config.port}`;
  if (err.code === 'EADDRINUSE') {
    // Běží už jiná instance Agenteeq (např. z LaunchAgentu)? Pak skončit v klidu – launchd ji nebude restartovat.
    const running = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json()).catch(() => null);
    await app.stop();
    if (running?.ok) {
      console.log(`Agenteeq ${running.version} už běží: ${url}`);
      openUrl(url);
      process.exit(0);
    }
    console.error(`Port ${config.port} je obsazený jinou aplikací. Spusť Agenteeq s jiným portem: PORT=4621 agenteeq`);
    process.exit(1);
  }
  console.error('Agenteeq: server se nepodařilo spustit:', err.message);
  await app.stop();
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`Agenteeq ${VERSION} běží na ${url}`);
  openUrl(url);
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  app.runs.stopAll();
  server.closeAllConnections?.();
  server.close();
  await app.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
