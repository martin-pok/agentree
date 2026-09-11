#!/usr/bin/env node
// Ověří balíček pro zákazníky: npm pack → instalace do dočasného prefixu → spuštění nainstalovaného `agentree`
// s dočasnými složkami (nikdy nesahá na skutečné ~/.claude, ~/.codex ani ~/.agentree) → kontrola API a UI.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentree-smoke-'));
const step = (msg) => console.log(`• ${msg}`);
let child = null;

function fail(msg) {
  console.error(`✗ ${msg}`);
  cleanup();
  process.exit(1);
}
function cleanup() {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  fs.rmSync(tmp, { recursive: true, force: true });
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
  const forbidden = files.filter((f) => /^(test|scripts)\/|\.pem$|agentree-vendor|^\.claude|^dist\//.test(f));
  if (forbidden.length) fail(`Balíček obsahuje soubory, které k zákazníkovi nepatří: ${forbidden.join(', ')}`);
  for (const must of ['bin/agentree.mjs', 'src/license-public-key.js', 'public/index.html', 'extension/manifest.json', 'docs/INSTALL.md']) {
    if (!files.includes(must)) fail(`V balíčku chybí ${must}`);
  }
  step(`${packed.filename}: ${files.length} souborů, ${(packed.size / 1024).toFixed(0)} kB`);

  step('instalace do dočasného prefixu');
  const prefix = path.join(tmp, 'prefix');
  execFileSync('npm', ['install', '-g', '--prefix', prefix, path.join(tmp, packed.filename)], { stdio: 'ignore' });
  const bin = path.join(prefix, 'bin', 'agentree');
  const version = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  if (version !== pkg.version) fail(`agentree --version vrací ${version}, očekáváno ${pkg.version}`);

  step('spuštění nainstalované aplikace');
  const port = await freePort();
  const env = {
    ...process.env,
    PORT: String(port),
    AGENTREE_HOME: path.join(tmp, 'data'),
    AGENTREE_SOURCE_HOME: path.join(tmp, 'home'),
    AGENTREE_OPEN: 'dry',
    AGENTREE_PROCESSES: '0',
    AGENTREE_NATIVE_NOTIFY: '0',
    AGENTREE_KEYCHAIN: '0',
    AGENTREE_CLOUD: '0',
    AGENTREE_OLLAMA_URL: 'http://127.0.0.1:9',
  };
  fs.mkdirSync(env.AGENTREE_SOURCE_HOME, { recursive: true });
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
  if (!health?.ok) fail(`Server nenaběhl.\n${output}`);
  const html = await fetch(url).then((r) => r.text());
  if (!html.includes('Agentree')) fail('Dashboard nevrací HTML Agentree.');
  const st = await fetch(`${url}/api/state`).then((r) => r.json());
  if (!Array.isArray(st.projects?.items) || !st.launch || st.license?.plan !== 'free') fail('Stav neobsahuje projekty, spouštění nebo licenci.');
  const proj = await fetch(`${url}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agentree': '1' }, body: JSON.stringify({ name: 'Smoke test' }) });
  if (proj.status !== 201) fail(`Vytvoření projektu vrátilo ${proj.status}`);
  for (const asset of ['/js/views/projects.js', '/js/launcher-ui.js', '/styles.css', '/brand/agentree-mark-dark.svg']) {
    const r = await fetch(url + asset);
    if (r.status !== 200) fail(`${asset} vrací ${r.status}`);
  }
  console.log(`✓ Balíček ${packed.filename} se nainstaluje a běží (verze ${health.version}).`);
  cleanup();
  process.exit(0);
} catch (err) {
  fail(err.stack || err.message);
}
