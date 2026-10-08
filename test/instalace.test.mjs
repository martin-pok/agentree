import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';
import { buildSite } from '../scripts/build-site.mjs';

// Instalace jedním příkazem (site/install.sh, `curl … | bash`) obchází krok v Nastavení jen proto,
// že soubor stažený curlem nedostane příznak karantény. Razítko Applu tak nahrazuje otisk SHA-256
// z GitHubu – a přesně to musí testy hlídat: bez otisku nic, nesedící otisk nesmí sáhnout na
// nainstalovanou aplikaci, a skript nikdy nemaže uživatelovu aplikaci ani nežádá o sudo.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKRIPT = path.join(ROOT, 'site', 'install.sh');
const API = 'https://api.github.com/repos/martin-pok/agentree/releases/latest';
const STAZENI = 'https://github.com/martin-pok/agentree/releases/download/';
const JEN_MAC = process.platform !== 'darwin' && 'jen macOS: instalace volá ditto, codesign, plutil a osascript';

const kod = (text) => text.split('\n').filter((r) => !/^\s*#/.test(r)).join('\n');

test('instalace: skript je bezpečný už podle textu', async () => {
  const text = await fs.readFile(SKRIPT, 'utf8');
  const radky = kod(text);
  assert.match(text, /^#!\/bin\/bash\n/);
  assert.match(radky, /^set -euo pipefail$/m);
  // `curl | bash` spouští skript, zatímco se ještě stahuje. Všechno je proto ve funkci a volá
  // se až posledním řádkem – přerušené stažení nespustí půlku instalace.
  assert.equal(text.trimEnd().split('\n').at(-1), 'main "$@"');
  assert.doesNotMatch(radky, /\bsudo\b/, 'instalace nesmí žádat o heslo správce');
  assert.doesNotMatch(radky, /spctl|xattr -c|--master-disable/, 'Gatekeeper se nevypíná');
  // Mazat smí jen vlastní dočasné složky. Aplikace se nikdy nemaže, jde do Koše nebo vedle.
  for (const m of radky.matchAll(/rm\s+-[a-z]*r[a-z]*\s+("[^"]*"|\S+)/g)) {
    assert.ok(['"$WORK"', '"$STAGE"'].includes(m[1]), `rm -r míří na ${m[1]}`);
  }
  assert.doesNotMatch(radky, /rm[^\n]*Applications/);
  // Otisk je povinný (stejné pravidlo jako src/updates.js) a stažený soubor se s ním porovná.
  assert.match(radky, /\^sha256:\(\[0-9a-f\]\{64\}\)\$/);
  assert.match(radky, /return "error\\tdigest\\t"/);
  assert.match(radky, /shasum -a 256 "\$zip"/);
  assert.match(radky, /codesign --verify --deep --strict "\$fresh"/);
  assert.match(radky, /--proto '=https' --proto-redir '=https'/);
  // Jediní protějšci jsou API GitHubu a stažení z GitHubu. Žádná telemetrie.
  const hosty = new Set([...radky.matchAll(/https?:\/\/([^/"'\s$]+)/g)].map((m) => m[1]));
  assert.deepEqual([...hosty].sort(), ['api.github.com', 'github.com']);
  assert.doesNotMatch(radky, /\bwget\b|\bnc\b|\bpython3?\b|\bjq\b/);
  // Aktuální verze na disku, ale stará ještě běží (výměna ve Finderu bez ⌘Q): `open` by probudil
  // starou. I cesta „nic se nestahuje“ proto běžící aplikaci nejdřív ukončí.
  const stejna = radky.slice(radky.indexOf('nothing to download'), radky.indexOf('return 0', radky.indexOf('nothing to download')));
  assert.ok(stejna.indexOf('quit_running') > -1 && stejna.indexOf('quit_running') < stejna.indexOf('open "$current"'), 'stejná verze: nejdřív ukončit běžící, pak otevřít');
  // Jiné kopie se jen vypíšou, nikdy nepřesouvají ani nemažou.
  const kopie = radky.slice(radky.indexOf('report_other_copies() {'), radky.indexOf('\n}', radky.indexOf('report_other_copies() {')));
  assert.doesNotMatch(kopie, /\b(mv|rm|trash|ditto)\b/);
});

test('instalace: bash skript přijme bez syntaktické chyby', { skip: spawnSync('bash', ['--version']).error && 'bash na tomto systému není' }, () => {
  const r = spawnSync('bash', ['-n', SKRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('instalace: web skript servíruje jako text a sestavení ho přibalí', async () => {
  const vercel = JSON.parse(await fs.readFile(path.join(ROOT, 'vercel.json'), 'utf8'));
  const pravidlo = vercel.headers.find((h) => h.source === '/install.sh');
  assert.ok(pravidlo, 'vercel.json nemá hlavičky pro /install.sh');
  const hlavicky = Object.fromEntries(pravidlo.headers.map((h) => [h.key, h.value]));
  assert.equal(hlavicky['Content-Type'], 'text/plain; charset=utf-8');
  assert.equal(hlavicky['X-Content-Type-Options'], 'nosniff');
  const out = await tempDir('agenteeq-web-');
  try {
    const { files } = await buildSite({ out });
    assert.ok(files.includes('install.sh'));
    assert.equal(await fs.readFile(path.join(out, 'install.sh'), 'utf8'), await fs.readFile(SKRIPT, 'utf8'));
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
  // Příkaz na webu je v obou jazycích stejný a míří na tenhle soubor.
  for (const html of ['site/index.html', 'site/en/index.html']) {
    const text = await fs.readFile(path.join(ROOT, html), 'utf8');
    assert.ok(text.includes('data-kopirovat="curl -fsSL https://agentree-fawn.vercel.app/install.sh | bash"'), `${html}: chybí příkaz k instalaci`);
  }
});

// ---------- celý průběh s podvrženým curl ----------
// curl na PATH je náhrada, která místo sítě vrací připravené soubory a zapisuje, kam se ptal.
// uname podvrhne architekturu. Všechno ostatní (osascript, ditto, codesign, plutil, shasum) je
// skutečné macOS. AGENTEEQ_INSTALL_DIR přesměruje instalaci a vypne ukončení i otevření aplikace.

async function aplikace(dir, { verze, znacka }) {
  const app = path.join(dir, 'Agenteeq.app');
  await fs.mkdir(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  await fs.mkdir(path.join(app, 'Contents', 'Resources'), { recursive: true });
  await fs.writeFile(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>cz.agenteeq.desktop</string>
<key>CFBundleName</key><string>Agenteeq</string>
<key>CFBundleExecutable</key><string>Agenteeq</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${verze}</string>
</dict></plist>
`);
  await fs.writeFile(path.join(app, 'Contents', 'MacOS', 'Agenteeq'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await fs.writeFile(path.join(app, 'Contents', 'Resources', 'znacka.txt'), znacka);
  const r = spawnSync('codesign', ['--force', '--sign', '-', app], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return app;
}

async function vydani(root, { verze = '9.9.9', digest = (sha) => `sha256:${sha}`, velikost = (n) => n } = {}) {
  const prilohy = [];
  for (const arch of ['arm64']) {
    const src = path.join(root, `src-${arch}`);
    await fs.mkdir(src, { recursive: true });
    const app = await aplikace(src, { verze, znacka: arch });
    const name = `Agenteeq-${verze}-macOS-${arch}.zip`;
    const zip = path.join(root, 'net', name);
    await fs.mkdir(path.dirname(zip), { recursive: true });
    const r = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const body = await fs.readFile(zip);
    const sha = crypto.createHash('sha256').update(body).digest('hex');
    prilohy.push({ name, size: velikost(body.length), digest: digest(sha), browser_download_url: `${STAZENI}v${verze}/${name}` });
  }
  await fs.writeFile(path.join(root, 'net', 'release.json'), JSON.stringify({ tag_name: `v${verze}`, draft: false, prerelease: false, assets: prilohy }));
}

async function prostredi() {
  const root = await tempDir('agenteeq-instalace-');
  const bin = path.join(root, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'curl'), `#!/bin/bash
out=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -H|--proto|--proto-redir|--connect-timeout|--max-time|--retry) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
printf '%s\\n' "$url" >> "$FAKE_NET/log"
if [ "$url" = "${API}" ]; then cp "$FAKE_NET/release.json" "$out"; exit 0; fi
case "$url" in
  ${STAZENI}*) f="$FAKE_NET/\${url##*/}"; [ -f "$f" ] || exit 22; cp "$f" "$out"; [ -z "\${FAKE_CORRUPT:-}" ] || printf x >> "$out"; exit 0 ;;
esac
exit 22
`, { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'uname'), `#!/bin/bash
case "$1" in -s) echo "\${FAKE_OS:-Darwin}" ;; -m) echo "\${FAKE_ARCH:-arm64}" ;; *) /usr/bin/uname "$@" ;; esac
`, { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'sysctl'), `#!/bin/bash
case "$*" in *proc_translated*) echo "\${FAKE_TRANSLATED:-0}" ;; *) /usr/sbin/sysctl "$@" ;; esac
`, { mode: 0o755 });
  for (const d of ['apps', 'kos', 'home', 'tmp']) await fs.mkdir(path.join(root, d));
  const spust = (env = {}) => spawnSync('bash', [SKRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HOME: path.join(root, 'home'),
      TMPDIR: `${path.join(root, 'tmp')}/`,
      AGENTEEQ_SOURCE_HOME: path.join(root, 'home'),
      AGENTEEQ_INSTALL_DIR: path.join(root, 'apps'),
      AGENTEEQ_TRASH_DIR: path.join(root, 'kos'),
      FAKE_NET: path.join(root, 'net'),
      ...env,
    },
  });
  const log = async () => (await fs.readFile(path.join(root, 'net', 'log'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean);
  const znacka = () => fs.readFile(path.join(root, 'apps', 'Agenteeq.app', 'Contents', 'Resources', 'znacka.txt'), 'utf8');
  const obsah = async (d) => (await fs.readdir(path.join(root, d))).sort();
  return { root, spust, log, znacka, obsah };
}

test('instalace: vybere balíček podle procesoru, ověří ho a nainstaluje', { skip: JEN_MAC }, async (t) => {
  const p = await prostredi();
  t.after(() => fs.rm(p.root, { recursive: true, force: true }));
  await vydani(path.join(p.root));

  const arm = p.spust();
  assert.equal(arm.status, 0, arm.stderr + arm.stdout);
  assert.equal(await p.znacka(), 'arm64');
  assert.match(arm.stdout, /otisk SHA-256 sedí/);
  assert.match(arm.stdout, /Hotovo: Agenteeq 9\.9\.9 je nainstalovaný/);
  assert.match(arm.stdout, /Done: Agenteeq 9\.9\.9 is installed/);
  assert.deepEqual(await p.log(), [API, `${STAZENI}v9.9.9/Agenteeq-9.9.9-macOS-arm64.zip`]);
  assert.deepEqual(await p.obsah('apps'), ['Agenteeq.app'], 'po instalaci nezůstala žádná pomocná složka');
  assert.deepEqual(await p.obsah('tmp'), [], 'dočasné soubory se uklidily');
  const podpis = spawnSync('codesign', ['--verify', '--deep', '--strict', path.join(p.root, 'apps', 'Agenteeq.app')]);
  assert.equal(podpis.status, 0);

  // Opakované spuštění stejnou verzi nestahuje ani nepřesouvá.
  const znovu = p.spust();
  assert.equal(znovu.status, 0, znovu.stderr);
  assert.match(znovu.stdout, /už v .* je – nejnovější verze/);
  assert.equal((await p.log()).length, 3, 'druhé spuštění se zeptalo jen na vydání');
  assert.deepEqual(await p.obsah('kos'), []);

  // Přeložený Terminál (Rosetta) hlásí x86_64 na čipu Apple – správný je arm64 balíček. Stará verze
  // (jiná, ale platná) jde do Koše, ne do smazání.
  await fs.rm(path.join(p.root, 'apps', 'Agenteeq.app'), { recursive: true });
  await aplikace(path.join(p.root, 'apps'), { verze: '1.0.0', znacka: 'stara' });
  const rosetta = p.spust({ FAKE_ARCH: 'x86_64', FAKE_TRANSLATED: '1' });
  assert.equal(rosetta.status, 0, rosetta.stderr + rosetta.stdout);
  assert.equal(await p.znacka(), 'arm64');
  assert.equal((await p.log()).at(-1), `${STAZENI}v9.9.9/Agenteeq-9.9.9-macOS-arm64.zip`);
  const kos = await p.obsah('kos');
  assert.equal(kos.length, 1);
  assert.match(kos[0], /^Agenteeq 1\.0\.0 .*\.app$/);
  assert.equal(await fs.readFile(path.join(p.root, 'kos', kos[0], 'Contents', 'Resources', 'znacka.txt'), 'utf8'), 'stara');
  assert.deepEqual(await p.obsah('apps'), ['Agenteeq.app']);
});

test('instalace: nesedící otisk nebo velikost zastaví instalaci a nainstalovanou aplikaci nechá být', { skip: JEN_MAC }, async (t) => {
  const p = await prostredi();
  t.after(() => fs.rm(p.root, { recursive: true, force: true }));
  await vydani(p.root);
  await aplikace(path.join(p.root, 'apps'), { verze: '1.0.0', znacka: 'puvodni' });

  const poskozeny = p.spust({ FAKE_CORRUPT: '1' });
  assert.notEqual(poskozeny.status, 0);
  assert.match(poskozeny.stderr, /Chyba: Stažený balíček má/);
  assert.match(poskozeny.stderr, /Error: The downloaded package is/);

  await vydani(p.root, { digest: () => `sha256:${'0'.repeat(64)}` });
  const otisk = p.spust();
  assert.notEqual(otisk.status, 0);
  assert.match(otisk.stderr, /Chyba: Otisk SHA-256 staženého balíčku nesedí/);
  assert.match(otisk.stderr, /nic se nezměnilo/);

  assert.equal(await p.znacka(), 'puvodni', 'nainstalovaná aplikace zůstala beze změny');
  assert.deepEqual(await p.obsah('apps'), ['Agenteeq.app']);
  assert.deepEqual(await p.obsah('kos'), []);
  assert.deepEqual(await p.obsah('tmp'), []);
});

test('instalace: bez otisku od GitHubu se balíček ani nestáhne', { skip: JEN_MAC }, async (t) => {
  const p = await prostredi();
  t.after(() => fs.rm(p.root, { recursive: true, force: true }));
  await vydani(p.root, { digest: () => undefined });
  const r = p.spust();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /neuvádí otisk SHA-256/);
  assert.match(r.stderr, /lists no SHA-256 digest/);
  assert.deepEqual(await p.log(), [API], 'bez otisku se nic nestahuje');
  assert.deepEqual(await p.obsah('apps'), []);
});

test('instalace: mimo Mac skončí srozumitelnou hláškou a nic nestáhne', { skip: JEN_MAC }, async (t) => {
  const p = await prostredi();
  t.after(() => fs.rm(p.root, { recursive: true, force: true }));
  const r = p.spust({ FAKE_OS: 'Linux' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Chyba: Agenteeq se tímto příkazem instaluje jen na Mac/);
  assert.match(r.stderr, /Error: This command installs Agenteeq on a Mac only/);
  assert.deepEqual(await p.log(), []);
});

test('instalace: Mac s procesorem Intel dostane srozumitelnou zprávu a nic se nestáhne ani nezmění', { skip: JEN_MAC }, async () => {
  const p = await prostredi();
  await aplikace(path.join(p.root, 'apps'), { verze: '1.0.0', znacka: 'stara' });
  const intel = p.spust({ FAKE_ARCH: 'x86_64' });
  assert.notEqual(intel.status, 0);
  assert.match(intel.stderr + intel.stdout, /Apple \(M1 a novější\)/);
  assert.match(intel.stderr + intel.stdout, /Apple silicon \(M1 or later\)/);
  assert.deepEqual(await p.log(), [], 'bez čipu Apple se nic nestahuje');
  assert.equal(await p.znacka(), 'stara', 'nainstalovaná aplikace zůstala');
  assert.deepEqual(await p.obsah('kos'), []);
});
