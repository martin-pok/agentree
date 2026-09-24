import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSION } from '../src/config.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { tempDir, waitFor, api } from './helpers.mjs';
import { identifyRetiredServer } from '../desktop/lifecycle.mjs';

const root = path.resolve(import.meta.dirname, '..');
async function fixture() {
  const dir = await tempDir('agenteeq-lifecycle-');
  const env = { ...process.env, PORT: '0', AGENTEEQ_SOURCE_HOME: dir, AGENTEEQ_HOME: dir, AGENTEEQ_PROCESSES: '0', AGENTEEQ_CLOUD: '0', AGENTEEQ_NATIVE_NOTIFY: '0', AGENTEEQ_KEYCHAIN: '0', AGENTEEQ_UCET_URL: '0', AGENTEEQ_OPEN: 'dry', AGENTEEQ_QUIET: '1', AGENTEEQ_OLLAMA_URL: 'http://127.0.0.1:9' };
  return { dir, env };
}
// Windows signály nedoručuje: kill('SIGTERM') proces rovnou zabije, takže by se netestovalo
// korektní ukončení, ale zabití. Hostitelská aplikace tam server ukončuje zavřením stdin –
// cestu, kterou desktop/server.mjs hlídá stejně pečlivě jako SIGTERM. Test jede tou z nich,
// kterou na dané platformě aplikace opravdu používá.
const ukoncit = (child) => (process.platform === 'win32' ? child.stdin.end() : child.kill('SIGTERM'));

function start(env, script = path.join(root, 'desktop/server.mjs')) {
  const child = spawn(process.execPath, [script], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (s) => { output += s; });
  child.stderr.on('data', () => {});
  const exit = new Promise((r) => child.once('exit', r));
  return { child, exit, ready: () => waitFor(() => output.split('\n').filter((s) => s.startsWith('AGENTEEQ_DESKTOP ')).map((s) => JSON.parse(s.slice(17))).find((s) => s.ready), 15000) };
}

test('lifecycle: 6 immediate restarts release the port; a simultaneous second start cannot steal it', async () => {
  const { env } = await fixture();
  let port = 0;
  for (let n = 0; n < 6; n++) {
    const current = start({ ...env, PORT: String(port) });
    try {
      port = (await current.ready()).port;
      if (n === 0) {
        const duplicate = start({ ...env, PORT: String(port) });
        assert.equal(await duplicate.exit, 1);
        assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json())).lifecycle.pid, current.child.pid);
      }
      ukoncit(current.child);
      assert.equal(await current.exit, 0);
      await assert.rejects(fetch(`http://127.0.0.1:${port}/api/health`));
    } finally { if (current.child.exitCode === null) current.child.kill(); }
  }
});

test('lifecycle: crash of GUI parent reaps server even without a graceful quit', async () => {
  const { dir, env } = await fixture();
  const wrapper = path.join(dir, 'parent.mjs');
  await fs.writeFile(wrapper, `import {spawn} from 'node:child_process'; const child=spawn(process.execPath,[${JSON.stringify(path.join(root, 'desktop/server.mjs'))}],{stdio:['pipe','pipe','ignore']}); child.stdout.pipe(process.stdout); setInterval(()=>{},1000);`);
  const parent = start(env, wrapper);
  const ready = await parent.ready();
  const url = `http://127.0.0.1:${ready.port}/api/health`;
  parent.child.kill('SIGKILL');
  await parent.exit;
  await waitFor(async () => fetch(url).then(() => false, () => true), 5000);
});

test('lifecycle: spoofed health from another server never authorizes termination or modifies data', async () => {
  const { dir, env } = await fixture();
  const foreign = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/api/health' ? { ok: true, ready: true, version: '0.5.0' } : { runs: [], integrations: { install: { root, bin: path.join(root, 'bin/agenteeq.mjs'), dataDir: dir } } }));
  });
  await new Promise((r) => foreign.listen(0, '127.0.0.1', r));
  const port = foreign.address().port;
  try {
    assert.equal(await identifyRetiredServer({ port, dataDir: dir }), null);
    const contender = start({ ...env, PORT: String(port) });
    assert.equal(await contender.exit, 1);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
    assert.equal(await fs.access(path.join(dir, 'data.json')).then(() => true, () => false), false);
  } finally { foreign.closeAllConnections(); await new Promise((r) => foreign.close(r)); }
});

// Převzetí portu po starší verzi se opírá o `lsof` a je záměrně jen pro macOS
// (desktop/lifecycle.mjs vrací mimo darwin null) – jinde není co ověřovat.
test('lifecycle: verified 0.5 CLI is gracefully upgraded, project survives takeover', { skip: process.platform !== 'darwin' && 'jen macOS: převzetí portu se opírá o lsof' }, async (t) => {
  const { dir, env } = await fixture();
  const legacyRoot = path.join(dir, 'legacy');
  // Kopie má tvar skutečné instalace: src/ načítá i sdílené soubory z public/js (adresa účtů).
  for (const sub of ['src', 'bin', 'public']) await fs.cp(path.join(root, sub), path.join(legacyRoot, sub), { recursive: true });
  await fs.writeFile(path.join(legacyRoot, 'package.json'), '{"name":"agenteeq","version":"0.5.0","type":"module"}');
  const old = start(env, path.join(legacyRoot, 'bin/agenteeq.mjs'));
  t.after(() => { if (old.child.exitCode === null) old.child.kill(); });
  let oldOutput = '';
  old.child.stdout.on('data', (s) => { oldOutput += s; });
  const port = await waitFor(() => Number(oldOutput.match(/běží na http:\/\/127\.0\.0\.1:(\d+)/)?.[1]), 15000);
  const response = await api(`http://127.0.0.1:${port}`).send('POST', '/api/projects', { name: 'Zachovaný projekt' });
  assert.equal(response.status, 201);
  const found = await identifyRetiredServer({ port, dataDir: dir });
  assert.equal(found?.pid, old.child.pid);
  const next = start({ ...env, PORT: String(port) });
  try {
    await next.ready();
    assert.equal(await old.exit, 0);
    const state = await api(`http://127.0.0.1:${port}`).get('/api/state');
    assert.equal(state.body.projects.items[0].name, 'Zachovaný projekt');
    // Verze se bere ze skutečného package.json – jinak by test padal po každém vydání.
    assert.equal(state.body.version, VERSION);
  } finally { next.child.stdin.end(); await next.exit; if (old.child.exitCode === null) old.child.kill(); }
});
