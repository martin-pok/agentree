import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const file = (name) => new URL('../' + name, import.meta.url);

test('native updater has bounded Quit, prevents permanent loading overlay and shows real stage state', async () => {
  const swift = await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8');
  const quit = swift.slice(swift.indexOf('func applicationShouldTerminate('));
  assert.match(quit, /DispatchQueue\.global\(\)\.asyncAfter\(deadline: \.now\(\) \+ 8\)/);
  assert.match(quit, /kill\(process\.processIdentifier, SIGKILL\)/);
  assert.match(quit, /DispatchQueue\.main\.asyncAfter\(deadline: \.now\(\) \+ 12, execute: finish\)/,
    'native Quit must always be acknowledged even when child wait never returns');
  assert.match(quit, /guard let self, self\.terminateReplyPending else \{ return \}/,
    'respond to AppKit exactly once even when watchdog races child completion');
  assert.match(swift, /if baseURL != nil \{ hideLoading\(\) \}\s*else \{ setLoading\(message, retry: true\) \}/,
    'a failed pre-swap installer must return to usable existing app instead of blank loader');
  assert.match(swift, /showLoading\(\)\s*setLoading\(target\.relocated \? "Instalujeme Agenteeq \\\(version\) do složky Aplikace…" : "Připravujeme Agenteeq \\\(version\)…", progress: true, value: 0\.05\)/,
    'stage indication must start before ZIP extraction');
  for (const stage of [
    'Rozbalujeme Agenteeq', 'Kontrolujeme podpis aplikace',
    'Ukládáme data a restartujeme', 'Spouštíme Agenteeq',
  ]) assert.ok(swift.includes(stage), stage);
  assert.match(swift, /if type == "ukoncit", installing \{ NSApp\.terminate\(nil\) \}/,
    'the native loader must expose an actual Quit action, not a dead button');
});

// Dřív aplikace po „Aktualizovat a restartovat“ visela na „Instalujeme…“ a nešla ukončit ani z Docku:
// ukončení stálo jen na odpovědi AppKitu (terminateLater). Teď server zastaví plášť sám s časovým
// limitem, proces pojistka ukončí i bez AppKitu a pomocník si poradí i se zaseknutým procesem.
test('update and Quit never depend solely on AppKit termination', async () => {
  const swift = await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8');
  const install = swift.slice(swift.indexOf('func installUpdate('), swift.indexOf('// Status/notifications come from'));
  const stop = install.indexOf('self.stopServerBounded()');
  const terminate = install.indexOf('NSApp.terminate(nil)');
  assert.ok(stop > 0 && terminate > stop, 'server is stopped with a bound BEFORE asking AppKit to quit');
  assert.ok(install.indexOf('helper.run()') < stop, 'helper is running before anything is stopped');
  assert.match(install, /self\.armExitWatchdog\(seconds: 6\)\s*NSApp\.terminate\(nil\)/);
  const watchdog = swift.slice(swift.indexOf('func armExitWatchdog('), swift.indexOf('func installUpdate('));
  assert.match(watchdog, /DispatchQueue\.global\(qos: \.userInitiated\)\.asyncAfter/, 'watchdog must not need the main thread');
  assert.match(watchdog, /_exit\(0\)/);
  const bounded = swift.slice(swift.indexOf('func stopServerBounded('), swift.indexOf('func armExitWatchdog('));
  assert.match(bounded, /kill\(process\.processIdentifier, SIGKILL\)/);
  assert.doesNotMatch(bounded, /waitUntilExit/, 'bounded polling only; never an unbounded wait');
  assert.match(bounded, /let gracefulDeadline = clock\.systemUptime \+ 3\.0/,
    'graceful SIGTERM must use a monotonic three-second deadline');
  assert.match(bounded, /let killDeadline = clock\.systemUptime \+ 2\.0/,
    'SIGKILL reap grace must be monotonic, not a scheduling-dependent loop count');
  assert.doesNotMatch(bounded, /waited\s*</,
    'on busy macOS runners counted sleep cycles can overrun the native Quit watchdog');
  // Regression: 16 Oct main macOS qa:update passed real replacements but a
  // SIGSTOP backend triggered the 15s emergency _exit because main.sync
  // delayed the ordinary SIGTERM/SIGKILL path. This must remain nonblocking.
  assert.doesNotMatch(bounded, /DispatchQueue\.main\.sync/,
    'server termination must not synchronously wait on a stalled AppKit/WKWebView main thread');
  assert.match(bounded, /process\.terminationHandler = nil[\s\S]*?process\.terminate\(\)/,
    'bounded worker begins server termination without requiring AppKit');
  const quit = swift.slice(swift.indexOf('func applicationShouldTerminate('));
  assert.match(quit, /armExitWatchdog\(seconds: 15\)/, 'Dock/⌘Q Quit is guaranteed even with a wedged server');
  // Na Macu v CI se ukázalo, že odpověď na terminateLater se při zaseknutém serveru ztratí
  // (ukončení doběhlo až pojistkou). Uživatelské ukončení proto server zastaví samo a pak
  // ukončí aplikaci znovu – bez terminateLater.
  // 17 Oct: postmerge main QA failed 2/17 after SIGSTOP backend; the bounded
  // shutdown finished, but reentrant NSApp.terminate(nil) saw stale Process.isRunning,
  // returned .terminateCancel again and only the 15s watchdog could end the app.
  // The worker completion flag must be set on main BEFORE retrying Quit.
  assert.match(quit, /if stoppingForQuit \{[\s\S]*?return quitStopFinished \? \.terminateNow : \.terminateCancel\s*\}\s*guard let process = child, process\.isRunning/,
    'reentrant Dock Quit must terminate after the worker completes, despite stale child.isRunning');
  assert.match(quit, /self\.stopServerBounded\(\)[\s\S]*?DispatchQueue\.main\.async \{ \[weak self\] in[\s\S]*?self\.quitStopFinished = true[\s\S]*?NSApp\.terminate\(nil\)/,
    'only the completed bounded-stop callback may approve the second Quit');
  assert.match(quit, /if !quitIsSystemInitiated \{[\s\S]*?self\.stopServerBounded\(\)[\s\S]*?NSApp\.terminate\(nil\)[\s\S]*?return \.terminateCancel/);
  assert.match(quit, /ownedRuns > 0, !quitIsSystemInitiated, !confirmQuitWithRunningAgents\(\)/,
    'Quit asks before stopping agents started from Agenteeq, but never blocks logout/shutdown');
  assert.match(swift, /if type == "owned-runs", let count = data\["count"\] as\? Int \{ ownedRuns = max\(0, count\) \}/);
  const server = await fs.readFile(file('desktop/server.mjs'), 'utf8');
  assert.match(server, /report\(\{ type: 'owned-runs', count \}\)/);
  assert.match(server, /app\.store\.on\('runs', ownedRuns\)/);
  // Rozbalení přímo vedle aplikace: žádná druhá kopie celé aplikace (dřív dvojí ditto).
  assert.equal((install.match(/\/usr\/bin\/ditto/g) || []).length, 1);
  assert.match(install, /dest\.appendingPathComponent\("\.agenteeq-update-/);
});

test('loader shows an honest indeterminate update bar with accessible text and Quit', async () => {
  const html = await fs.readFile(file('public/nacitani.html'), 'utf8');
  const style = await fs.readFile(file('public/loader.css'), 'utf8');
  assert.match(html, /id="nacitani-progress" role="progressbar"[^>]* hidden/);
  assert.match(html, /id="nacitani-ukoncit"[^>]* hidden/);
  assert.match(style, /\.nacitani \.loader-progress\[hidden\] \{ display: none; \}/);
  assert.match(style, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(html, /aria-valuenow=/, 'no fabricated progress percentage');
  const fields = new Map();
  const messages = [];
  for (const id of ['nacitani-text', 'nacitani-znovu', 'nacitani-progress', 'nacitani-ukoncit']) {
    const el = {
      textContent: '', hidden: true,
      attrs: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      removeAttribute(name) { delete this.attrs[name]; },
      classes: new Set(),
      classList: { toggle(name, on) { const c = this.owner.classes; if (on) c.add(name); else c.delete(name); } },
      vars: {},
      style: { setProperty(name, value) { this.owner.vars[name] = value; } },
      addEventListener(event, fn) { this[event] = fn; },
      focus() { this.focused = true; },
    };
    el.classList.owner = el; el.style.owner = el;
    fields.set(id, el);
  }
  const win = { webkit: { messageHandlers: { nacitani: { postMessage(value) { messages.push(value); } } } } };
  vm.runInNewContext(await fs.readFile(file('public/js/nacitani.js'), 'utf8'), {
    document: { getElementById(id) { return fields.get(id); } },
    window: win,
  });
  win.agenteeqNacitani({ text: 'Rozbalujeme aktualizaci…', progress: true, znovu: false });
  assert.equal(fields.get('nacitani-progress').hidden, false);
  assert.equal(fields.get('nacitani-ukoncit').hidden, false);
  assert.equal(fields.get('nacitani-text').textContent, 'Rozbalujeme aktualizaci…');
  assert.equal(fields.get('nacitani-progress').attrs['aria-valuetext'], 'Rozbalujeme aktualizaci…');
  assert.equal(fields.get('nacitani-progress').classes.has('is-urcity'), false, 'no value = indeterminate');
  // Plášť posílá podíl dokončených kroků: pruh se doplní a čtečka dostane hodnotu.
  win.agenteeqNacitani({ text: 'Kontrolujeme podpis aplikace…', progress: true, hodnota: 0.5 });
  assert.equal(fields.get('nacitani-progress').classes.has('is-urcity'), true);
  assert.equal(fields.get('nacitani-progress').vars['--podil'], '0.5');
  assert.equal(fields.get('nacitani-progress').attrs['aria-valuenow'], '50');
  win.agenteeqNacitani({ text: 'Rozbalujeme aktualizaci…', progress: true });
  assert.equal(fields.get('nacitani-progress').attrs['aria-valuenow'], undefined);
  fields.get('nacitani-ukoncit').click();
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: 'ukoncit' }]);
  win.agenteeqNacitani({ text: 'Připravujeme prostor…', progress: false, znovu: true });
  assert.equal(fields.get('nacitani-progress').hidden, true);
  assert.equal(fields.get('nacitani-ukoncit').hidden, true);
  assert.equal(fields.get('nacitani-znovu').hidden, false);
});

const helperScript = (swift) => {
  const match = swift.match(/let script = """\n([\s\S]*?)\n\s*"""/);
  assert.ok(match, 'test the literal helper shipped in the native app');
  return match[1].split('\n').map(line => line.replace(/^ {12}/, '')).join('\n').replaceAll('sleep 0.2', 'sleep 0');
};

test('updater helper swaps the app, cleans the extracted folder and moves the old app to Trash', {
  skip: process.platform === 'win32' && 'POSIX shell required'
}, async () => {
  const script = helperScript(await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-update-ok-'));
  try {
    const current = path.join(root, 'Agenteeq.app');
    const work = path.join(root, '.agenteeq-update-x');
    const stage = path.join(work, 'Agenteeq.app');
    const trash = path.join(root, 'Trash-Agenteeq.app');
    const bin = path.join(root, 'bin');
    await fs.mkdir(current); await fs.mkdir(stage, { recursive: true }); await fs.mkdir(bin);
    await fs.writeFile(path.join(current, 'version'), 'old');
    await fs.writeFile(path.join(stage, 'version'), 'new');
    await fs.writeFile(path.join(bin, 'open'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const log = path.join(root, 'update.log');
    const done = spawnSync('/bin/sh', ['-c', script, 'agenteeq-update', '99999999', current, stage, work, path.join(root, '.backup.app'), trash, log], {
      encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: bin + ':' + process.env.PATH },
    });
    assert.equal(done.status, 0);
    assert.equal(await fs.readFile(path.join(current, 'version'), 'utf8'), 'new');
    assert.equal(await fs.readFile(path.join(trash, 'version'), 'utf8'), 'old');
    await assert.rejects(fs.access(work), { code: 'ENOENT' });
    assert.match(await fs.readFile(log, 'utf8'), /nová verze spuštěna/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('updater helper ends a hung old process instead of leaving the user stuck', {
  skip: process.platform === 'win32' && 'POSIX shell required'
}, async () => {
  const script = helperScript(await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-update-hung-'));
  const { spawn } = await import('node:child_process');
  // Proces, který TERM ignoruje – jako zaseknutá aplikace. Pomusí ho až KILL.
  const current = path.join(root, 'Agenteeq.app');
  // Spustitelný soubor uvnitř balíčku, aby proces byl „náš“ stejně jako skutečná aplikace.
  await fs.mkdir(path.join(current, 'Contents', 'MacOS'), { recursive: true });
  const exe = path.join(current, 'Contents', 'MacOS', 'Agenteeq');
  await fs.writeFile(exe, '#!/bin/sh\ntrap "" TERM\nwhile :; do sleep 1; done\n', { mode: 0o755 });
  const hung = spawn('/bin/sh', [exe], { stdio: 'ignore', detached: true });
  try {
    const work = path.join(root, '.agenteeq-update-y');
    const stage = path.join(work, 'Agenteeq.app');
    const bin = path.join(root, 'bin');
    await fs.mkdir(stage, { recursive: true }); await fs.mkdir(bin);
    await fs.writeFile(path.join(stage, 'version'), 'new');
    await fs.writeFile(path.join(bin, 'open'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const log = path.join(root, 'update.log');
    // Asynchronně: test (rodič zaseknutého procesu) ho musí po KILL uklidit stejně jako launchd
    // na Macu; synchronní běh by z něj nechal zombie, která pro `kill -0` pořád „žije“.
    const helper = spawn('/bin/sh', ['-c', script, 'agenteeq-update', String(hung.pid), current, stage, work, path.join(root, '.backup.app'), '', log], {
      stdio: 'ignore', env: { ...process.env, PATH: bin + ':' + process.env.PATH },
    });
    const status = await new Promise((resolve) => helper.once('exit', resolve));
    assert.equal(status, 0, 'update completes even when the old process ignored TERM');
    assert.equal(await fs.readFile(path.join(current, 'version'), 'utf8'), 'new');
    const text = await fs.readFile(log, 'utf8');
    assert.match(text, /posílám TERM/);
    assert.match(text, /posílám KILL/);
  } finally {
    try { process.kill(hung.pid, 'SIGKILL'); } catch { /* už neběží */ }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('updater helper rolls back the previous app on failed relaunch (no black-screen trap)', {
  skip: process.platform === 'win32' && 'POSIX shell required'
}, async () => {
  const script = helperScript(await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-update-relaunch-'));
  try {
    const current = path.join(root, 'Agenteeq.app');
    const stage = path.join(root, '.agenteeq-update.app');
    const backup = path.join(root, '.agenteeq-backup.app');
    const bin = path.join(root, 'bin');
    await fs.mkdir(current); await fs.mkdir(stage); await fs.mkdir(bin);
    await fs.writeFile(path.join(current, 'version'), 'known-good');
    await fs.writeFile(path.join(stage, 'version'), 'new');
    await fs.writeFile(path.join(bin, 'open'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const done = spawnSync('/bin/sh', ['-c', script, 'agenteeq-update', '99999999', current, stage, path.join(root, 'work'), backup, '', path.join(root, 'update.log')], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PATH: bin + ':' + process.env.PATH },
    });
    assert.equal(done.status, 1, 'launch failure must be a failed update');
    assert.equal(await fs.readFile(path.join(current, 'version'), 'utf8'), 'known-good',
      'old working app must be restored, not moved to Trash');
    await assert.rejects(fs.access(backup), { code: 'ENOENT' });
    await assert.rejects(fs.access(stage), { code: 'ENOENT' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// Majitel 17. 10. 2026: po stažení aktualizace vyskočilo „Do složky …/AppTranslocation/… nejde
// zapisovat“. Aplikace spuštěná rovnou z Downloads nebo z DMG běží z dočasné cesty jen ke čtení,
// takže aktualizace nemohla nikdy projít. Teď se nová verze nainstaluje do Aplikací.
test('native updater: aplikace z AppTranslocation se aktualizuje do složky Aplikace, ne chybou', async () => {
  const swift = await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8');
  const target = swift.slice(swift.indexOf('func updateTarget('), swift.indexOf('func installUpdate('));
  assert.match(target, /running\.path\.contains\("\/AppTranslocation\/"\)/, 'dočasná cesta se pozná');
  assert.match(target, /fm\.isWritableFile\(atPath: folder\.path\)/, 'nezapisovatelná složka (třeba DMG) taky');
  assert.match(target, /URL\(fileURLWithPath: "\/Applications"/);
  assert.match(target, /homeDirectoryForCurrentUser\.appendingPathComponent\("Applications"/, 'bez práv do /Applications zbývá ~/Applications');
  assert.match(target, /dir\.appendingPathComponent\("Agenteeq\.app"\)/);
  assert.match(target, /return \(running, folder, false\)/, 'zapisovatelná složka se vyměňuje na místě jako dřív');
  const install = swift.slice(swift.indexOf('func installUpdate('), swift.indexOf('// Status/notifications come from'));
  assert.match(install, /guard let target = updateTarget\(running: running\) else/);
  assert.match(install, /let current = target\.bundle/);
  // Ve skriptu: na cílovém místě žádná stará aplikace být nemusí a po neúspěchu se otevře ta, ze které se jelo.
  assert.match(install, /if \[ ! -e "\$current" \] \|\| mv "\$current" "\$backup"; then/);
  assert.match(install, /origin="\$8"/);
  assert.match(install, /\[ -e "\$current" \] \|\| current="\$origin"/);
  assert.match(install, /self\.updateLogPath, running\.path\]/, 'původní cesta jde do pomocníka jako osmý argument');
  assert.doesNotMatch(install, /\.app\/Contents\/MacOS\/Agenteeq.*AppTranslocation/s, 'proces se pořád pozná jen podle konce cesty');
});

test('native updater: skript výměny zvládne chybějící aplikaci na cíli a vrátí zálohu, když existovala', async () => {
  const swift = await fs.readFile(file('desktop/Agenteeq.swift'), 'utf8');
  const start = swift.indexOf('let script = """') + 'let script = """'.length;
  const script = swift.slice(start, swift.indexOf('"""', start)).replace(/^ {12}/gm, '');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-update-'));
  try {
    const run = async (hadOld, openOk = false) => {
      const dir = await fs.mkdtemp(path.join(tmp, 'c-'));
      const apps = path.join(dir, 'Applications');
      const current = path.join(apps, 'Agenteeq.app');
      const work = path.join(apps, '.agenteeq-update-x');
      const stage = path.join(work, 'Agenteeq.app');
      const backup = path.join(apps, '.agenteeq-previous-x.app');
      const log = path.join(dir, 'log.txt');
      const origin = path.join(dir, 'Downloads', 'Agenteeq.app');
      await fs.mkdir(path.join(stage, 'Contents'), { recursive: true });
      await fs.writeFile(path.join(stage, 'Contents', 'v'), 'nova');
      if (hadOld) { await fs.mkdir(path.join(current, 'Contents'), { recursive: true }); await fs.writeFile(path.join(current, 'Contents', 'v'), 'stara'); }
      // `open` a `xattr` jsou na Macu; tady je nahradí atrapy v PATH. `open` selže, ať se ověří i návrat zálohy.
      const bin = path.join(dir, 'bin'); await fs.mkdir(bin);
      await fs.writeFile(path.join(bin, 'open'), `#!/bin/sh\nexit ${openOk ? 0 : 1}\n`, { mode: 0o755 });
      await fs.writeFile(path.join(bin, 'xattr'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const r = spawnSync('/bin/sh', ['-c', script, 'x', '999999999', current, stage, work, backup, '', log, origin], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' });
      const exists = async (f) => fs.access(f).then(() => true, () => false);
      return { status: r.status, current: await exists(current), backup: await exists(backup), v: await exists(path.join(current, 'Contents', 'v')) ? await fs.readFile(path.join(current, 'Contents', 'v'), 'utf8') : null, work: await exists(work) };
    };
    // Úspěšné otevření: aplikace z Downloads se nainstalovala do (dosud prázdných) Aplikací.
    const nova = await run(false, true);
    assert.equal(nova.status, 0);
    assert.equal(nova.v, 'nova', 'nová verze je na cílovém místě');
    assert.equal(nova.work, false);
    // Bez staré aplikace: výměna proběhne; `open` v atrapě selže, takže se nová verze zahodí a nic nezůstane napůl.
    const bez = await run(false);
    assert.equal(bez.status, 1);
    assert.equal(bez.current, false, 'nic nevisí napůl, když se nová verze nedá otevřít');
    assert.equal(bez.work, false, 'pracovní složka se uklidí');
    // Se starou aplikací: při neúspěšném otevření se vrátí původní, nikdy nezůstane jen záloha.
    const se = await run(true);
    assert.equal(se.status, 1);
    assert.equal(se.v, 'stara', 'původní aplikace se vrátí');
    assert.equal(se.backup, false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
