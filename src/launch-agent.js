import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from './util.js';

export const LABEL = 'cz.agenteeq.agent';

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// LaunchAgent spustí Agenteeq po přihlášení a restartuje ho po pádu — notifikace tak chodí i bez otevřeného prohlížeče.
export function plistXml({ node, script, logDir, pathEnv }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(script)}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key><false/>
  </dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xml(path.join(logDir, 'agenteeq.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logDir, 'agenteeq.error.log'))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(pathEnv)}</string>
  </dict>
</dict>
</plist>
`;
}

export const plistPath = (home = os.homedir()) => path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);

export async function isLaunchAgentInstalled(home = os.homedir()) {
  try {
    await fs.access(plistPath(home));
    return true;
  } catch {
    return false;
  }
}

// LaunchAgent je mechanismus macOS. Stráž stojí schválně před prvním zápisem, ne až u
// process.getuid(): bez ní se na Windows nejdřív založí ~/Library/LaunchAgents a zapíše se
// tam plist, a teprve pak to spadne na tom, že getuid() na Windows neexistuje. Zůstala by
// po tom složka, která tam nepatří, a chyba, které uživatel nerozumí.
function jenNaMacu() {
  if (process.platform === 'darwin') return;
  throw new Error('Automatické spouštění po přihlášení umí Agenteeq zatím jen na macOS (přes LaunchAgent).');
}

export async function installLaunchAgent({ script, home = os.homedir(), node = process.execPath }) {
  jenNaMacu();
  const file = plistPath(home);
  const logDir = path.join(home, '.agenteeq', 'logs');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.mkdir(logDir, { recursive: true });
  const pathEnv = [path.dirname(node), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  await fs.writeFile(file, plistXml({ node, script, logDir, pathEnv }));
  const domain = `gui/${process.getuid()}`;
  await run('launchctl', ['bootout', domain, file]);
  const r = await run('launchctl', ['bootstrap', domain, file], { timeout: 10000 });
  if (!r.ok) throw new Error(`launchctl bootstrap selhal: ${r.stderr.trim() || r.code}`);
  return { file, logDir };
}

export async function uninstallLaunchAgent({ home = os.homedir() } = {}) {
  jenNaMacu();
  const file = plistPath(home);
  await run('launchctl', ['bootout', `gui/${process.getuid()}`, file]);
  await fs.rm(file, { force: true });
  return { file };
}
