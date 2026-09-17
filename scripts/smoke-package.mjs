#!/usr/bin/env node
// Ověří balíček pro zákazníky: npm pack → instalace do dočasného prefixu → spuštění nainstalovaného `agenteeq`
// s dočasnými složkami (nikdy nesahá na skutečné ~/.claude, ~/.codex ani ~/.agenteeq) → kontrola API a UI.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agenteeq-smoke-'));
const step = (msg) => console.log(`• ${msg}`);
let child = null;

async function fail(msg) {
  console.error(`✗ ${msg}`);
  await cleanup();
  process.exit(1);
}

// Úklid musí počkat, až server opravdu skončí. Dokud běží, drží soubory v dočasném prefixu
// otevřené a smazání složky spadne na ENOTEMPTY – z pohledu volajícího jako by celý smoke test
// selhal, přestože kontrola prošla. Proto: SIGTERM, počkat, po dvou vteřinách SIGKILL, a teprve
// pak mazat (s několika pokusy, než systém uvolní poslední popisovače).
async function cleanup() {
  if (child && child.exitCode === null) {
    const konec = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    const kill = setTimeout(() => child.kill('SIGKILL'), 2000);
    await Promise.race([konec, new Promise((r) => setTimeout(r, 5000))]);
    clearTimeout(kill);
  }
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

try {
  step('npm pack');
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', tmp], { cwd: root, encoding: 'utf8' }))[0];
  const files = packed.files.map((f) => f.path);
  const forbidden = files.filter((f) => /^(test|scripts)\/|\.pem$|agenteeq-vendor|^\.claude|^dist\//.test(f));
  if (forbidden.length) await fail(`Balíček obsahuje soubory, které k zákazníkovi nepatří: ${forbidden.join(', ')}`);
  for (const must of ['bin/agenteeq.mjs', 'src/license-public-key.js', 'public/index.html', 'extension/manifest.json', 'docs/INSTALL.md']) {
    if (!files.includes(must)) await fail(`V balíčku chybí ${must}`);
  }
  step(`${packed.filename}: ${files.length} souborů, ${(packed.size / 1024).toFixed(0)} kB`);

  step('instalace do dočasného prefixu');
  const prefix = path.join(tmp, 'prefix');
  execFileSync('npm', ['install', '-g', '--prefix', prefix, path.join(tmp, packed.filename)], { stdio: 'ignore' });
  const bin = path.join(prefix, 'bin', 'agenteeq');
  const version = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  if (version !== pkg.version) await fail(`agenteeq --version vrací ${version}, očekáváno ${pkg.version}`);

  step('spuštění nainstalované aplikace');
  const port = await freePort();
  const env = {
    ...process.env,
    PORT: String(port),
    AGENTEEQ_HOME: path.join(tmp, 'data'),
    AGENTEEQ_SOURCE_HOME: path.join(tmp, 'home'),
    AGENTEEQ_OPEN: 'dry',
    AGENTEEQ_PROCESSES: '0',
    AGENTEEQ_NATIVE_NOTIFY: '0',
    AGENTEEQ_KEYCHAIN: '0',
    AGENTEEQ_CLOUD: '0',
    AGENTEEQ_OLLAMA_URL: 'http://127.0.0.1:9',
  };
  fs.mkdirSync(env.AGENTEEQ_SOURCE_HOME, { recursive: true });
  child = spawn(bin, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  let health = null;
  while (Date.now() < deadline && !health) {
    health = await fetch(`${url}/api/health`).then((r) => r.json()).catch(() => null);
    if (!health) await new Promise((r) => setTimeout(r, 200));
  }
  if (!health?.ok) await fail(`Server nenaběhl.\n${output}`);
  const html = await fetch(url).then((r) => r.text());
  if (!html.includes('Agenteeq')) await fail('Dashboard nevrací HTML Agenteeq.');
  const st = await fetch(`${url}/api/state`).then((r) => r.json());
  if (!Array.isArray(st.projects?.items) || !st.launch || st.license?.plan !== 'free') await fail('Stav neobsahuje projekty, spouštění nebo licenci.');
  const proj = await fetch(`${url}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agenteeq': '1' }, body: JSON.stringify({ name: 'Smoke test' }) });
  if (proj.status !== 201) await fail(`Vytvoření projektu vrátilo ${proj.status}`);
  for (const asset of ['/js/views/projects.js', '/js/launcher-ui.js', '/styles.css', '/brand/agenteeq-mark-dark.svg']) {
    const r = await fetch(url + asset);
    if (r.status !== 200) await fail(`${asset} vrací ${r.status}`);
  }
  console.log(`✓ Balíček ${packed.filename} se nainstaluje a běží (verze ${health.version}).`);
  await cleanup();
  process.exit(0);
} catch (err) {
  await fail(err.stack || err.message);
}
