#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { loadConfig, VERSION } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createHttpServer } from '../src/http.js';
import { installLaunchAgent, uninstallLaunchAgent } from '../src/launch-agent.js';

const HELP = `Agentree ${VERSION} — všichni AI agenti na jednom místě

Použití:
  agentree                 spustí server a dashboard na http://127.0.0.1:4620
  agentree install-agent   spouštět automaticky po přihlášení (macOS LaunchAgent)
  agentree uninstall-agent zrušit automatické spouštění
  agentree --version       vypíše verzi

Proměnné prostředí: PORT, AGENTREE_HOME, OPENAI_ADMIN_KEY, ANTHROPIC_ADMIN_KEY (viz README.md)`;

const cmd = process.argv[2];

if (cmd === '--version' || cmd === '-v') {
  console.log(VERSION);
  process.exit(0);
}
if (cmd === '--help' || cmd === '-h') {
  console.log(HELP);
  process.exit(0);
}
if (cmd === 'install-agent') {
  const r = await installLaunchAgent({ script: fileURLToPath(import.meta.url) });
  console.log(`Hotovo. Agentree se spouští po přihlášení.\nKonfigurace: ${r.file}\nLogy: ${r.logDir}`);
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
const app = await createApp(config);
await app.start();
const server = createHttpServer(app);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${config.port} je obsazený. Agentree už nejspíš běží: http://127.0.0.1:${config.port}`);
  else console.error('Agentree: server se nepodařilo spustit:', err.message);
  app.stop().finally(() => process.exit(1));
});

server.listen(config.port, config.host, () => {
  console.log(`Agentree ${VERSION} běží na http://127.0.0.1:${server.address().port}`);
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections?.();
  server.close();
  await app.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
