// Optional real-provider canary. A dedicated preauthenticated QA profile is required;
// never copy/symlink the developer's auth.json or consume a personal refresh token.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startTestServer, api } from '../test/helpers.mjs';

const profile = process.env.AGENTEEQ_LIVE_CODEX_HOME;
if (process.env.AGENTEEQ_LIVE_CODEX !== '1' || !profile || !path.isAbsolute(profile)) {
  console.log(JSON.stringify({ state: 'blocked', reason: 'Enable AGENTEEQ_LIVE_CODEX=1 and select a dedicated authenticated QA profile with AGENTEEQ_LIVE_CODEX_HOME. No live provider was contacted.' }));
  process.exitCode = 2;
} else {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-live-canary-'));
  const cwd = path.join(temporary, 'work');
  await fs.mkdir(cwd);
  const server = await startTestServer({
    AGENTEEQ_SOURCE_HOME: path.join(temporary, 'source'),
    AGENTEEQ_CODEX_HOME: profile,
    AGENTEEQ_HOME: path.join(temporary, 'data'),
    AGENTEEQ_SCAN_MS: '500',
  });
  const a = api(server.url);
  let output = '';
  let exitCode = null;
  let spawnError = false;
  const timeline = [];
  const started = Date.now();
  const child = spawn(process.env.AGENTEEQ_LIVE_CODEX_BIN || 'codex', [
    '-a', 'never', 'exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', cwd,
    'Synthetic Agenteeq QA. Use the shell only to sleep 3 seconds, then reply exactly AGENTEEQ_AUDIT_OK. Do not read or modify files or call network tools.',
  ], { env: { ...process.env, CODEX_HOME: profile }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { output += chunk; if (output.length > 1000000) child.kill(); });
  child.stderr.on('data', () => {}); // Never publish credential/debug output.
  child.on('error', () => { spawnError = true; exitCode = -1; });
  child.on('exit', code => { exitCode = code ?? -1; });
  let result;
  let exitedAt = null;
  try {
    while (Date.now() - started < 90000) {
      const rows = output.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
      const id = rows.find(row => row.type === 'thread.started')?.thread_id;
      const state = (await a.get('/api/state')).body;
      const session = id ? state.sessions.find(s => s.id === `codex:${id}`) : null;
      if (session && timeline.at(-1)?.status !== session.status) timeline.push({ ms: Date.now() - started, status: session.status });
      if (exitCode !== null) {
        exitedAt ??= Date.now();
        if (spawnError || (session && session.status !== 'working') || Date.now() - exitedAt > 4000) break;
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    const answered = output.split('\n').some(line => { try { const row = JSON.parse(line); return row.type === 'item.completed' && row.item?.type === 'agent_message' && row.item.text?.trim() === 'AGENTEEQ_AUDIT_OK'; } catch { return false; } });
    const complete = exitCode === 0 && answered && timeline.some(s => s.status === 'working') && timeline.at(-1)?.status === 'waiting';
    const authentication = /access token|refresh.token|signed out|logged out|sign in again|unauthorized/i.test(output);
    result = {
      kind: 'real_codex_cli_canary', syntheticPrompt: true, exitCode,
      state: complete ? 'passed' : authentication ? 'blocked_authentication' : 'failed',
      liveAnswerVerified: complete, timeline,
    };
    process.exitCode = complete ? 0 : authentication ? 2 : 1;
  } finally {
    if (exitCode === null) {
      child.kill('SIGTERM');
      const kill = setTimeout(() => child.kill('SIGKILL'), 3000); kill.unref();
    }
    await server.close();
    await fs.rm(temporary, { recursive: true, force: true });
  }
  await fs.mkdir('dist/qa-detection', { recursive: true });
  await fs.writeFile('dist/qa-detection/live-codex.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
