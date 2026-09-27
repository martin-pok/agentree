import { processList, detailyProcesu, JE_WINDOWS } from '../platform.js';

// ── Jak se pozná program v příkazové řádce ───────────────────────────────────
//
// Výpis procesů vypadá na každém systému jinak:
//
//   macOS    /Applications/Cursor.app/Contents/MacOS/Cursor
//   Windows  C:\Users\jana\AppData\Local\Programs\cursor\Cursor.exe
//
// Dřív tu stály regulární výrazy psané jen pro macOS – s lomítkem a bez přípony –
// takže na Windows nesedl ani jeden a konektor hlásil nulu, i když výpis procesů
// fungoval. Místo osmnácti platformových výjimek jsou tu dva pomocníci.

const utec = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Přípona .exe se píše různě, jméno programu ale ne.
const EXE = '(\\.[eE][xX][eE])?';

/**
 * Program spuštěný z příkazové řádky – pozná se podle jména bez ohledu na to, jestli
 * je cesta psaná lomítkem nebo zpětným lomítkem a jestli má příponu `.exe`.
 * `program('claude')` sedne na `/usr/local/bin/claude`, `C:\…\claude.exe` i `claude --help`.
 *
 * Na velikosti písmen ZÁLEŽÍ, a je to schválně: `claude` je nástroj příkazové řádky,
 * `Claude` je desktopová aplikace. Na macOS se tím ty dva odlišují spolehlivě a stejná
 * zvyklost platí i pro `claude.exe` vs `Claude.exe`.
 */
export const program = (...jmena) =>
  new RegExp(`(^|[\\\\/])(${jmena.map(utec).join('|')})${EXE}(\\s|$)`);

/**
 * Desktopová aplikace – na macOS balíček `.app`, na Windows spustitelný soubor.
 * Windows jména jsou zvyklost, ne ověřený údaj: viz docs/CONNECTORS.md, kde jsou
 * vedená jako 🧪 Beta, dokud je někdo nepotvrdí na skutečném stroji.
 */
export const aplikace = (bundle, exe = bundle) =>
  new RegExp(`[\\\\/]${utec(bundle)}\\.app[\\\\/]Contents[\\\\/]MacOS[\\\\/]|[\\\\/]${utec(exe)}${EXE.replace('?', '')}(\\s|$)`);

export const RUNTIMES = [
  { id: 'claude-desktop', name: 'Claude Desktop', provider: 'anthropic', test: (a) => aplikace('Claude').test(a) },
  { id: 'claude-code', name: 'Claude Code', provider: 'anthropic', test: (a) => program('claude').test(a) && !/disclaimer|chrome-native-host/.test(a) },
  { id: 'chatgpt', name: 'ChatGPT', provider: 'openai', test: (a) => aplikace('ChatGPT').test(a) },
  // Aplikace ChatGPT si spouští vlastní vnitřní `codex app-server`; jako samostatný Codex CLI se počítat nesmí.
  { id: 'codex', name: 'Codex', provider: 'openai', test: (a) => program('codex').test(a) && !/[\\/]ChatGPT\.app[\\/]/.test(a) },
  { id: 'copilot-cli', name: 'Copilot CLI', provider: 'github', test: (a) => program('copilot').test(a) && !/\.app[\\/]/.test(a) },
  { id: 'vscode', name: 'VS Code', provider: 'github', test: (a) => aplikace('Visual Studio Code', 'Code').test(a) || aplikace('Visual Studio Code - Insiders', 'Code - Insiders').test(a) },
  { id: 'cursor', name: 'Cursor', provider: 'cursor', test: (a) => aplikace('Cursor').test(a) },
  { id: 'ms-copilot', name: 'Microsoft Copilot', provider: 'microsoft', test: (a) => aplikace('Copilot').test(a) || aplikace('Microsoft Copilot', 'Microsoft.Copilot').test(a) },
  { id: 'gemini-cli', name: 'Gemini CLI', provider: 'google', test: (a) => program('gemini').test(a) },
  { id: 'qwen-code', name: 'Qwen Code', provider: 'alibaba', test: (a) => program('qwen').test(a) },
  { id: 'perplexity', name: 'Perplexity', provider: 'perplexity', test: (a) => aplikace('Perplexity').test(a) },
  { id: 'grok', name: 'Grok', provider: 'xai', test: (a) => aplikace('Grok').test(a) },
  { id: 'ollama', name: 'Ollama', provider: 'local', test: (a) => program('ollama').test(a) || aplikace('Ollama').test(a) },
  { id: 'lmstudio', name: 'LM Studio', provider: 'local', test: (a) => aplikace('LM Studio').test(a) || program('lms').test(a) },
];

export function etimeToSec(t) {
  const [d, rest] = t.includes('-') ? t.split('-') : ['0', t];
  const parts = rest.split(':').map(Number);
  while (parts.length < 3) parts.unshift(0);
  return Number(d) * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Řádek výpisu procesů v jednotném tvaru (src/platform.js#processList).
function radkyPs(out) {
  const radky = [];
  for (const line of String(out || '').split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);
    if (m) radky.push({ pid: Number(m[1]), uptimeSec: etimeToSec(m[2]), cpu: Number(m[3]), rssKB: Number(m[4]), args: m[5] });
  }
  return radky;
}

export function parsePs(out) {
  const runtimes = RUNTIMES.map((r) => ({ id: r.id, name: r.name, provider: r.provider, running: false, processes: 0, cpu: 0, memMB: 0, uptimeSec: 0, detail: '' }));
  for (const p of radkyPs(out)) {
    const idx = RUNTIMES.findIndex((r) => r.test(p.args));
    if (idx === -1) continue;
    const r = runtimes[idx];
    r.running = true;
    r.processes++;
    r.cpu += p.cpu;
    r.memMB += p.rssKB / 1024;
    r.uptimeSec = Math.max(r.uptimeSec, p.uptimeSec);
  }
  for (const r of runtimes) {
    r.cpu = Math.round(r.cpu * 10) / 10;
    r.memMB = Math.round(r.memMB);
  }
  return runtimes;
}

// ── Jednotliví agenti v příkazové řádce ──────────────────────────────────────
//
// Pro pojistku proti přehlédnutému agentovi (src/bezici-agenti.js) nestačí vědět, že „Claude Code
// běží“ – potřebujeme každý proces zvlášť. Nepočítají se pomocné procesy nástroje a příkazy, které
// žádnou konverzaci nevedou (přihlášení, MCP server, aktualizace…): z nich by vznikli falešní agenti.
// Seznamy podpříkazů a přepínačů Claude Code jsou ze zdroje verze 2.1.283 (26. 9. 2026).
const BEZ_KONVERZACE = {
  'claude-code': {
    podprikazy: ['auth', 'mcp', 'doctor', 'update', 'upgrade', 'install', 'setup-token', 'plugin', 'plugins', 'agents', 'attach', 'logs', 'rm', 'stop', 'kill', 'respawn', 'import', 'project', 'auto-mode', 'gateway', 'ultrareview', 'daemon', 'config'],
    prepinace: ['--bg-pty-host', '--bg-spare', '--preload', '--version', '-v', '--help', '-h'],
  },
  codex: {
    podprikazy: ['login', 'logout', 'mcp', 'mcp-server', 'app-server', 'completion', 'help', 'debug', 'apply'],
    prepinace: ['--version', '-V', '--help', '-h'],
  },
  'gemini-cli': { podprikazy: ['mcp', 'extensions'], prepinace: ['--version', '-v', '--help', '-h'] },
  'qwen-code': { podprikazy: ['mcp', 'extensions'], prepinace: ['--version', '-v', '--help', '-h'] },
  'copilot-cli': { podprikazy: ['help', 'login', 'logout'], prepinace: ['--version', '-v', '--help', '-h'] },
};

// Argumenty za jménem programu. Program z npm běží jako „node /…/bin/claude …“ – to „node“ se přeskočí.
function argumentyProgramu(args, runtime) {
  const jmeno = { 'claude-code': 'claude', codex: 'codex', 'gemini-cli': 'gemini', 'qwen-code': 'qwen', 'copilot-cli': 'copilot' }[runtime];
  const slova = args.split(/\s+/);
  const i = slova.findIndex((w) => program(jmeno).test(w));
  return i === -1 ? [] : slova.slice(i + 1);
}

export function vedeKonverzaci(args, runtime) {
  const pravidla = BEZ_KONVERZACE[runtime];
  if (!pravidla) return false;
  const argv = argumentyProgramu(args, runtime);
  if (argv.some((a) => pravidla.prepinace.includes(a))) return false;
  // Podpříkaz je první slovo bez pomlčky. Za „-p“/„--print“ jde zadání, ne podpříkaz.
  const i = argv.findIndex((a) => !a.startsWith('-'));
  if (i === -1 || argv.slice(0, i).some((a) => a === '-p' || a === '--print')) return true;
  return !pravidla.podprikazy.includes(argv[i]);
}

/** Procesy agentů v příkazové řádce, každý zvlášť: { pid, runtime, uptimeSec }. */
export function agentniProcesy(out) {
  const cli = Object.keys(BEZ_KONVERZACE);
  const procesy = [];
  for (const p of radkyPs(out)) {
    const r = RUNTIMES.find((x) => x.test(p.args));
    if (!r || !cli.includes(r.id) || !vedeKonverzaci(p.args, r.id)) continue;
    procesy.push({ pid: p.pid, runtime: r.id, uptimeSec: p.uptimeSec });
  }
  return procesy;
}

export function createProcessesConnector(ctx) {
  const { store, config, onAgenti = () => {}, promenne = [], procesy = processList, detaily = detailyProcesu } = ctx;
  let timer = null;
  let ollama = { ok: false, models: [] };
  let lastOk = 0;
  // Složka a prostředí se u procesu nemění – zjišťují se jednou za jeho život (klíč pid + start).
  const znamy = new Map();

  // Jednotliví agenti v příkazové řádce se složkou, startem a proměnnými domova (CLAUDE_CONFIG_DIR…).
  async function agenti(stdout, now = Date.now()) {
    const seznam = agentniProcesy(stdout).map((p) => ({ ...p, od: Math.round((now - p.uptimeSec * 1000) / 1000) * 1000 }));
    const klic = (p) => `${p.pid}:${Math.round(p.od / 5000)}`;
    const nove = seznam.filter((p) => !znamy.has(klic(p)));
    if (nove.length) {
      const d = await detaily(nove.map((p) => p.pid), promenne);
      // Start se drží z prvního průchodu: doba běhu má vteřinovou přesnost a dopočet by jinak kolísal.
      for (const p of nove) znamy.set(klic(p), { cwd: '', env: {}, ...d.get(p.pid), od: p.od });
    }
    const zive = new Set(seznam.map(klic));
    for (const k of znamy.keys()) if (!zive.has(k)) znamy.delete(k);
    return seznam.map((p) => ({ ...p, ...znamy.get(klic(p)) }));
  }

  async function poll() {
    const res = await procesy();
    const runtimes = res.ok ? parsePs(res.stdout) : store.runtimes;
    // Nepovedený výpis = nevíme. Pojistka pak nic nepřidá ani neubere (null).
    onAgenti(res.ok ? await agenti(res.stdout).catch(() => null) : null);
    try {
      const r = await fetch('http://127.0.0.1:11434/api/ps', { signal: AbortSignal.timeout(600) });
      const json = r.ok ? await r.json() : null;
      ollama = { ok: Boolean(json), models: (json?.models || []).map((m) => m.name) };
    } catch {
      ollama = { ok: false, models: [] };
    }
    const o = runtimes.find((r) => r.id === 'ollama');
    if (o && ollama.ok) {
      o.running = true;
      o.detail = ollama.models.length ? `Načteno: ${ollama.models.join(', ')}` : 'Žádný model v paměti';
    }
    if (res.ok) lastOk = Date.now();
    store.setRuntimes(runtimes);
  }

  return {
    id: 'processes',
    name: JE_WINDOWS ? 'Aplikace na tomto počítači' : 'Aplikace na tomto Macu',
    provider: 'other',
    kind: 'local',
    verified: true,
    source: JE_WINDOWS ? 'Win32_Process · localhost:11434' : 'ps · localhost:11434',
    description: 'Pozná, které AI aplikace a CLI právě běží, jejich zátěž a modely načtené v Ollamě.',
    async start() {
      await poll();
      timer = setInterval(() => poll().catch(() => {}), config.processIntervalMs);
      timer.unref?.();
    },
    scan: poll,
    stop() {
      clearInterval(timer);
    },
    idle: async () => {},
    status() {
      const running = store.runtimes.filter((r) => r.running).length;
      // Dokud se výpis procesů ani jednou nepovedl, nevíme nic – a „0 aplikací běží“
      // by byla lež, ne údaj. Ollamu poznáme i tak, ta jde přes HTTP.
      return {
        state: lastOk ? 'connected' : 'error',
        detail: lastOk
          ? `${running} AI aplikací běží${ollama.ok ? ` · Ollama: ${ollama.models.length} modelů` : ''}.`
          : `Seznam běžících aplikací se na tomto systému nepodařilo získat${ollama.ok ? `, Ollama ale odpovídá: ${ollama.models.length} modelů` : ''}.`,
        count: running,
        watching: Boolean(timer),
        lastEventAt: lastOk,
      };
    },
  };
}
