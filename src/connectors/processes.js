import { processList, detailyProcesu, radkyProcesu, etimeToSec, JE_WINDOWS, POCITAC } from '../platform.js';
import { ui } from '../texty.js';

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

// Interprety, pod kterými program běží jako skript: npm balíček přes shebang („node /…/bin/claude“),
// obalový skript instalátoru („/bin/sh /…/bin/claude“), Python u lokálních modelů.
const INTERPRET = /^(node|nodejs|bun|deno|sh|bash|zsh|dash|ksh|fish|python[\d.]*)(\.exe)?$/i;
// Přepínač, za kterým interpret nečte skript, ale text příkazu: `sh -c`, `bash -lc`, `node -e`/`-p`,
// `python -c`/`-m`. Cesta k programu v takovém textu je jen zmínka – program, pokud se spustí,
// bude ve výpisu jako vlastní proces.
const PRIKAZ_TEXTEM = /^-(?:[a-z]*c[a-z]*|e|p|m)$|^--(?:eval|print|command)(?:=|$)/i;
// Začátek cesty: „/“, „~/“, „./“, „../“, „C:\“, „\\server“. Podle něj se pozná, kde cesta
// s mezerou („Application Support“, „Jana Nováková“) začíná.
const ZACATEK_CESTY = /^(\/|~(\/|$)|\.\.?[\\/]|[A-Za-z]:[\\/]|\\\\)/;

/**
 * Běží v procesu opravdu program `jmeno`? Ano, když je to samotný spustitelný soubor, nebo skript
 * pod interpretem (se spouštěcími přepínači). Ne, když jde jen o argument jiného programu
 * (`sudo …`, `vim …`, `ln -sf …`) nebo o text příkazu shellu (`sh -c "… /bin/claude …"`).
 */
function spusteny(args, vzor) {
  const text = String(args || '');
  const m = vzor.exec(text);
  if (!m) return false;
  // Kde začíná cesta, ve které jméno programu stojí: nejbližší slovo před ním, které začíná jako
  // cesta; slova mezi tím patří téže cestě s mezerou. Bez takového slova je cesta relativní
  // a začíná posledním slovem.
  const slova = text.slice(0, m.index + m[1].length).split(' ');
  let i = slova.length - 1;
  for (let j = slova.length - 1; j >= 0; j--) if (ZACATEK_CESTY.test(slova[j])) { i = j; break; }
  const pred = slova.slice(0, i).filter(Boolean);
  if (!pred.length) return true;
  // Před cestou smí stát jen interpret a jeho přepínače – nic, co by znamenalo text příkazu.
  let k = pred.length;
  while (k > 0 && pred[k - 1].startsWith('-')) k--;
  if (!k || pred.slice(k).some((x) => PRIKAZ_TEXTEM.test(x))) return false;
  return INTERPRET.test(pred.slice(0, k).join(' ').split(/[\\/]/).pop());
}

/**
 * Program spuštěný z příkazové řádky – pozná se podle jména bez ohledu na to, jestli
 * je cesta psaná lomítkem nebo zpětným lomítkem a jestli má příponu `.exe`.
 * `program('claude')` sedne na `/usr/local/bin/claude`, `C:\…\claude.exe`, `claude --help`
 * i `node /usr/local/bin/claude`, ale ne na shell nebo příkaz, který ho jen zmiňuje (viz `spusteny`).
 *
 * Na velikosti písmen ZÁLEŽÍ, a je to schválně: `claude` je nástroj příkazové řádky,
 * `Claude` je desktopová aplikace. Na macOS se tím ty dva odlišují spolehlivě a stejná
 * zvyklost platí i pro `claude.exe` vs `Claude.exe`.
 */
export const program = (...jmena) => {
  const vzor = new RegExp(`(^|[\\\\/])(${jmena.map(utec).join('|')})${EXE}(\\s|$)`);
  return { test: (args) => spusteny(args, vzor) };
};

// Skript npm balíčku spuštěný přímo pod Node: tak běží nástroj, když ho nespustí obal z `bin/`
// pod svým jménem – na Windows ho npm volá přes `<jméno>.cmd` vždy takhle („node.exe C:\…\npm\
// node_modules\@openai\codex\bin\codex.js“), jinde přes `npx` nebo přímou cestu. Cesty v balíčcích
// jsou z pole `bin` v package.json (npm registry, ověřeno 5. 10. 2026): @openai/codex `bin/codex.js`,
// @google/gemini-cli `bundle/gemini.js` (dřív `dist/index.js`), @qwen-code/qwen-code `cli-entry.js`
// (dřív `dist/index.js`; na Windows cli-entry.js spouští `cli.js` jako dceřiný proces),
// @anthropic-ai/claude-code `cli.js` (verze 1.x; 2.x má nativní `bin/claude.exe`).
const S = '[\\\\/]';
const NPM_SKRIPTY = {
  'claude-code': [`@anthropic-ai${S}claude-code${S}cli\\.js`],
  codex: [`@openai${S}codex${S}bin${S}codex\\.js`],
  'gemini-cli': [`@google${S}gemini-cli${S}(?:bundle${S}gemini|dist${S}index)\\.js`],
  'qwen-code': [`@qwen-code${S}qwen-code${S}(?:cli-entry|cli|dist${S}index)\\.js`],
};
const npmSkript = (runtime) => {
  const vzor = new RegExp(`(${S})(?:${NPM_SKRIPTY[runtime].join('|')})(\\s|$)`);
  return { test: (args) => spusteny(args, vzor) };
};

/**
 * Desktopová aplikace – na macOS balíček `.app`, na Windows spustitelný soubor.
 * Windows jména jsou zvyklost, ne ověřený údaj: viz docs/CONNECTORS.md, kde jsou
 * vedená jako 🧪 Beta, dokud je někdo nepotvrdí na skutečném stroji.
 */
export const aplikace = (bundle, exe = bundle) =>
  new RegExp(`[\\\\/]${utec(bundle)}\\.app[\\\\/]Contents[\\\\/]MacOS[\\\\/]|[\\\\/]${utec(exe)}${EXE.replace('?', '')}(\\s|$)`);

// Webové aplikace Chromu (a Edge, Brave) nainstalované jako samostatné okno: na macOS běží jako
// `…/Chrome Apps.localized/<Název>.app/Contents/MacOS/app_mode_loader` – název je přímo v cestě.
// Ověřeno na skutečném Macu (Google AI Studio, Replit, Stitch). Musí být v seznamu PŘED desktopovými
// aplikacemi: webová aplikace „ChatGPT“ má v cestě `ChatGPT.app/Contents/MacOS/` stejně jako
// desktopová a první shoda vyhrává.
// Desktopová aplikace Codex: viz záznam `codex-app` v RUNTIMES.
const APLIKACE_CODEX = /[\\/]Codex\.app[\\/]Contents[\\/]|[\\/]WindowsApps[\\/]OpenAI\.Codex_[^\\/]*[\\/]/;
const webovaAplikace = (nazev) => new RegExp(`[\\\\/](Chrome|Microsoft Edge|Brave Browser) Apps\\.localized[\\\\/]${utec(nazev)}\\.app[\\\\/]`);
const WEBOVE_AI = [
  ['pwa-google-ai-studio', 'Google AI Studio', 'google', true, ui('Vývojářské prostředí Googlu pro modely Gemini')],
  ['pwa-gemini', 'Gemini', 'google', false, ui('Chat s Gemini od Googlu')],
  ['pwa-notebooklm', 'NotebookLM', 'google', false, ui('Poznámky a zdroje s AI od Googlu')],
  ['pwa-stitch', 'Stitch', 'google', true, ui('Návrhy rozhraní s AI od Googlu')],
  ['pwa-chatgpt', 'ChatGPT', 'openai', false, ui('Chat s AI od OpenAI')],
  ['pwa-claude', 'Claude', 'anthropic', false, ui('Chat s Claude od Anthropicu')],
  ['pwa-perplexity', 'Perplexity', 'perplexity', false, ui('Vyhledávání s odpověďmi od AI')],
  ['pwa-grok', 'Grok', 'xai', false, ui('Chat s AI od xAI')],
  ['pwa-copilot', 'Microsoft Copilot', 'microsoft', false, ui('Chat s AI od Microsoftu')],
  ['pwa-deepseek', 'DeepSeek', 'deepseek', false, ui('Chat s modely DeepSeek')],
  ['pwa-replit', 'Replit', 'replit', true, ui('Vývoj a nasazení aplikací s AI agentem')],
  ['pwa-lovable', 'Lovable', 'lovable', false, ui('Tvorba webových aplikací s AI')],
  ['pwa-v0', 'v0', 'vercel', false, ui('Tvorba rozhraní a aplikací s AI od Vercelu')],
  ['pwa-bolt', 'Bolt', 'stackblitz', false, ui('Tvorba webových aplikací s AI od StackBlitz')],
].map(([id, name, provider, overeno, popis]) => ({
  id, name: `${name} (web)`, provider, druh: 'webova-aplikace', overeno, popis,
  test: (a) => webovaAplikace(name).test(a),
}));

// `druh` říká, kde nástroj pracuje (pro rychlou informaci v oznámení), `popis` co to je,
// `konektory` odkud Agenteeq čte data právě tohohle nástroje – když některý z nich má data, nástroj
// už sledujeme a oznámení o „novém agentovi“ by byl šum. Rozšíření pro Chrome (`web`) sem nepatří:
// čte webovou verzi služby v záložce, ne konverzace z desktopové aplikace téže služby. `vidim` je
// přesná věta, co Agenteeq o sledovaném nástroji vidí, když obecná („konverzace a tokeny“) neplatí. `overeno: false` = rozpoznávání podle názvu
// balíčku nebo příkazu, které zatím nikdo nepotvrdil na skutečném stroji (docs/CONNECTORS.md, 🧪).
export const RUNTIMES = [
  ...WEBOVE_AI,
  { id: 'claude-desktop', name: 'Claude Desktop', provider: 'anthropic', druh: 'aplikace', overeno: true, konektory: ['claude-code', 'claude-desktop-usage'], vidim: ui('Práci v záložce Code a limity předplatného už čtu. Běžné chaty z aplikace ne.'), popis: ui('Claude od Anthropicu – chat a Claude Code v záložce Code'), test: (a) => aplikace('Claude').test(a) },
  { id: 'claude-code', name: 'Claude Code', provider: 'anthropic', druh: 'terminal', overeno: true, konektory: ['claude-code'], popis: ui('Programovací agent od Anthropicu'), test: (a) => (program('claude').test(a) || npmSkript('claude-code').test(a)) && !/disclaimer|chrome-native-host/.test(a) },
  { id: 'chatgpt', name: 'ChatGPT', provider: 'openai', druh: 'aplikace', overeno: true, konektory: ['codex'], vidim: ui('Práci Codexu a limity tvého plánu už čtu. Běžné chaty z aplikace ne.'), popis: ui('ChatGPT od OpenAI – chat, agent a Codex'), test: (a) => aplikace('ChatGPT').test(a) },
  // Desktopová aplikace Codex (bundle `com.openai.codex`). Podle zdrojového kódu `codex app`
  // (openai/codex, codex-rs/cli/src/desktop_app/mac.rs a windows.rs, 5. 10. 2026) se na macOS instaluje
  // jako `Codex.app` – stejný bundle může nést i jméno `ChatGPT.app`, ten pak poznáme jako ChatGPT – a na
  // Windows jako balíček Microsoft Store `OpenAI.Codex_…`. Patří k ní každý proces z balíčku, i vnitřní
  // `codex app-server` v `Contents/Resources`. Jméno spustitelného souboru zdroj neuvádí, proto se
  // nerozpoznává podle něj. Na skutečném stroji zatím neověřeno (🧪, docs/CONNECTORS.md).
  { id: 'codex-app', name: 'Codex app', provider: 'openai', druh: 'aplikace', overeno: false, konektory: ['codex'], vidim: ui('Práci Codexu a limity tvého plánu čtu z přepisů, které aplikace ukládá na {0}.', POCITAC.tento), popis: ui('Desktopová aplikace Codex od OpenAI'), test: (a) => APLIKACE_CODEX.test(a) },
  // Aplikace ChatGPT a Codex si spouští vlastní vnitřní `codex app-server`; jako samostatný Codex CLI se počítat nesmí.
  { id: 'codex', name: 'Codex', provider: 'openai', druh: 'terminal', overeno: true, konektory: ['codex'], popis: ui('Programovací agent od OpenAI'), test: (a) => (program('codex').test(a) || npmSkript('codex').test(a)) && !/[\\/](ChatGPT|Codex)\.app[\\/]/.test(a) && !APLIKACE_CODEX.test(a) },
  { id: 'copilot-cli', name: 'Copilot CLI', provider: 'github', druh: 'terminal', overeno: false, konektory: ['copilot-cli'], popis: ui('Programovací agent GitHub Copilot'), test: (a) => program('copilot').test(a) && !/\.app[\\/]/.test(a) },
  { id: 'vscode', name: 'VS Code', provider: 'github', druh: 'editor', overeno: false, konektory: ['vscode-copilot'], popis: ui('Editor od Microsoftu s GitHub Copilotem'), test: (a) => aplikace('Visual Studio Code', 'Code').test(a) || aplikace('Visual Studio Code - Insiders', 'Code - Insiders').test(a) },
  { id: 'cursor', name: 'Cursor', provider: 'cursor', druh: 'editor', overeno: true, konektory: ['cursor'], popis: ui('Editor s vestavěným programovacím agentem'), test: (a) => aplikace('Cursor').test(a) },
  { id: 'cursor-agent', name: 'Cursor Agent', provider: 'cursor', druh: 'terminal', overeno: false, popis: ui('Programovací agent Cursoru'), test: (a) => program('cursor-agent').test(a) },
  { id: 'windsurf', name: 'Windsurf', provider: 'windsurf', druh: 'editor', overeno: false, popis: ui('Editor s agentem Cascade'), test: (a) => aplikace('Windsurf').test(a) },
  { id: 'antigravity', name: 'Antigravity', provider: 'google', druh: 'editor', overeno: false, popis: ui('Agentní vývojové prostředí od Googlu'), test: (a) => aplikace('Antigravity').test(a) },
  { id: 'kiro', name: 'Kiro', provider: 'amazon', druh: 'editor', overeno: false, popis: ui('Agentní editor od Amazonu'), test: (a) => aplikace('Kiro').test(a) },
  { id: 'trae', name: 'Trae', provider: 'bytedance', druh: 'editor', overeno: false, popis: ui('Editor s AI agentem od ByteDance'), test: (a) => aplikace('Trae').test(a) },
  { id: 'zed', name: 'Zed', provider: 'zed', druh: 'editor', overeno: false, popis: ui('Editor s AI asistentem'), test: (a) => aplikace('Zed').test(a) },
  { id: 'warp', name: 'Warp', provider: 'warp', druh: 'terminal-aplikace', overeno: true, popis: ui('Terminál Warp s vestavěným agentem pro příkazy a kód'), test: (a) => aplikace('Warp').test(a) },
  { id: 'ms-copilot', name: 'Microsoft Copilot', provider: 'microsoft', druh: 'aplikace', overeno: false, popis: ui('Chat s AI od Microsoftu'), test: (a) => aplikace('Copilot').test(a) || aplikace('Microsoft Copilot', 'Microsoft.Copilot').test(a) },
  { id: 'gemini-cli', name: 'Gemini CLI', provider: 'google', druh: 'terminal', overeno: false, konektory: ['gemini-cli'], popis: ui('Programovací agent od Googlu'), test: (a) => program('gemini').test(a) || npmSkript('gemini-cli').test(a) },
  { id: 'qwen-code', name: 'Qwen Code', provider: 'alibaba', druh: 'terminal', overeno: false, konektory: ['qwen-code'], popis: ui('Programovací agent od Alibaby'), test: (a) => program('qwen').test(a) || npmSkript('qwen-code').test(a) },
  { id: 'aider', name: 'Aider', provider: 'other', druh: 'terminal', overeno: false, popis: ui('Otevřený programovací agent pro práci s gitem'), test: (a) => program('aider').test(a) || /(^|\s)-m\s+aider(\s|$)/.test(a) },
  { id: 'goose', name: 'Goose', provider: 'other', druh: 'terminal', overeno: false, popis: ui('Otevřený agent od Blocku'), test: (a) => program('goose').test(a) },
  { id: 'opencode', name: 'OpenCode', provider: 'other', druh: 'terminal', overeno: false, popis: ui('Otevřený programovací agent'), test: (a) => program('opencode').test(a) },
  { id: 'amp', name: 'Amp', provider: 'other', druh: 'terminal', overeno: false, popis: ui('Programovací agent od Sourcegraphu'), test: (a) => program('amp').test(a) },
  { id: 'crush', name: 'Crush', provider: 'other', druh: 'terminal', overeno: false, popis: ui('Programovací agent od Charmu'), test: (a) => program('crush').test(a) },
  { id: 'droid', name: 'Droid', provider: 'other', druh: 'terminal', overeno: false, popis: ui('Programovací agent od Factory'), test: (a) => program('droid').test(a) },
  { id: 'auggie', name: 'Auggie', provider: 'other', druh: 'terminal', overeno: false, popis: ui('Programovací agent Augment Code'), test: (a) => program('auggie').test(a) },
  { id: 'perplexity', name: 'Perplexity', provider: 'perplexity', druh: 'aplikace', overeno: false, popis: ui('Vyhledávání s odpověďmi od AI'), test: (a) => aplikace('Perplexity').test(a) },
  { id: 'comet', name: 'Comet', provider: 'perplexity', druh: 'prohlizec', overeno: false, popis: ui('Prohlížeč Comet od Perplexity'), test: (a) => aplikace('Comet').test(a) },
  { id: 'chatgpt-atlas', name: 'ChatGPT Atlas', provider: 'openai', druh: 'prohlizec', overeno: false, popis: ui('Prohlížeč ChatGPT Atlas od OpenAI'), test: (a) => aplikace('ChatGPT Atlas').test(a) },
  { id: 'dia', name: 'Dia', provider: 'other', druh: 'prohlizec', overeno: false, popis: ui('Prohlížeč Dia od The Browser Company'), test: (a) => aplikace('Dia').test(a) },
  { id: 'grok', name: 'Grok', provider: 'xai', druh: 'aplikace', overeno: false, popis: ui('Chat s AI od xAI'), test: (a) => aplikace('Grok').test(a) },
  { id: 'ollama', name: 'Ollama', provider: 'local', druh: 'lokalni-model', overeno: true, popis: ui('Spouští jazykové modely přímo na {0}', POCITAC.tomto), test: (a) => program('ollama').test(a) || aplikace('Ollama').test(a) },
  { id: 'lmstudio', name: 'LM Studio', provider: 'local', druh: 'lokalni-model', overeno: false, popis: ui('Aplikace pro jazykové modely na {0}', POCITAC.tomto), test: (a) => aplikace('LM Studio').test(a) || program('lms').test(a) },
];

// Nástroj, ke kterému patří řádek výpisu procesů – jedno místo pro všechny detektory.
export const rozpoznejNastroj = (args) => RUNTIMES.find((r) => r.test(args)) || null;

export { etimeToSec };

// Řádek výpisu procesů v jednotném tvaru (src/platform.js#processList, #radkyProcesu).
const radkyPs = radkyProcesu;

export function parsePs(out) {
  const runtimes = RUNTIMES.map((r) => ({ id: r.id, name: r.name, provider: r.provider, druh: r.druh, popis: r.popis, konektory: r.konektory || [], overeno: Boolean(r.overeno), running: false, processes: 0, cpu: 0, memMB: 0, uptimeSec: 0, detail: '' }));
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

// Argumenty za jménem programu. Program z npm běží jako „node /…/bin/claude …“ nebo „node /…/@openai/
// codex/bin/codex.js …“ – to „node“ i cesta ke skriptu se přeskočí.
const JMENA_CLI = { 'claude-code': 'claude', codex: 'codex', 'gemini-cli': 'gemini', 'qwen-code': 'qwen', 'copilot-cli': 'copilot' };
function argumentyProgramu(args, runtime) {
  const slova = args.split(/\s+/);
  const jmeno = program(JMENA_CLI[runtime]);
  const skript = NPM_SKRIPTY[runtime] ? npmSkript(runtime) : null;
  const i = slova.findIndex((w) => jmeno.test(w) || Boolean(skript?.test(w)));
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

/**
 * Procesy agentů v příkazové řádce, jeden záznam za jeden běh: { pid, runtime, uptimeSec }.
 *
 * Jeden běh nástroje může být víc procesů se stejnými argumenty. npm balíček Codexu spouští pod
 * obalem v Node nativní program jako dceřiný proces (`bin/codex.js` → `vendor/<cíl>/bin/codex`),
 * Gemini CLI se po startu spustí znovu jako vlastní dítě s větší pamětí (`GEMINI_CLI_NO_RELAUNCH`),
 * Qwen Code na Windows spouští `cli.js` z `cli-entry.js` (zdroj balíčků z npm, 5. 10. 2026). Proces,
 * jehož přímý rodič je agentní proces téhož nástroje, je proto součástí rodičova běhu a vlastní
 * záznam nedostane – jinak by v přehledu jeden agent visel dvakrát. Proces spuštěný agentem přes
 * shell (rodič je `sh`, ne nástroj) zůstává samostatným agentem.
 */
export function agentniProcesy(out) {
  const cli = Object.keys(BEZ_KONVERZACE);
  const kandidati = [];
  for (const p of radkyPs(out)) {
    const r = RUNTIMES.find((x) => x.test(p.args));
    if (!r || !cli.includes(r.id) || !vedeKonverzaci(p.args, r.id)) continue;
    kandidati.push({ pid: p.pid, ppid: p.ppid, runtime: r.id, uptimeSec: p.uptimeSec });
  }
  const podlePid = new Map(kandidati.map((p) => [p.pid, p]));
  return kandidati
    .filter((p) => !(p.ppid && p.ppid !== p.pid && podlePid.get(p.ppid)?.runtime === p.runtime))
    .map(({ ppid, ...p }) => p);
}

// Výpis procesů sdílený konektory (tento a src/connectors/local-agents.js). Kdo se zeptá do pár
// vteřin po jiném, dostane tentýž výsledek – `ps` se nespouští dvakrát pro totéž.
export function sdilenyVypis(vypis = processList, platnostMs = 4000) {
  let posledni = null;
  return () => {
    const ted = Date.now();
    if (!posledni || ted - posledni.at > platnostMs) posledni = { at: ted, vysledek: vypis() };
    return posledni.vysledek;
  };
}

// Start procesu dopočtený z doby běhu kolísá o vteřinu mezi průchody. Drží se první hodnota, ať
// se přehled neposílá znovu jen kvůli tomu (doba běhu se dopočítá v rozhraní z času startu).
export function createStabilniStart(tolerance = 3000) {
  const starty = new Map();
  return {
    od(klic, uptimeSec, now = Date.now()) {
      const od = now - uptimeSec * 1000;
      const drive = starty.get(klic);
      if (drive && Math.abs(drive - od) < tolerance) return drive;
      starty.set(klic, od);
      return od;
    },
    ponech(klice) {
      for (const k of starty.keys()) if (!klice.has(k)) starty.delete(k);
    },
  };
}

// Kolik AI aplikací běží, s tvarem podle počtu. Každý tvar je celý text rozhraní (src/texty.js),
// aby šel přeložit i s číslem uprostřed; `modelu` = počet modelů v Ollamě, null = Ollama neodpovídá.
function aplikaciBezi(n, modelu) {
  if (modelu === null) return n === 1 ? ui('1 AI aplikace běží.') : n >= 2 && n <= 4 ? ui('{0} AI aplikace běží.', n) : ui('{0} AI aplikací běží.', n);
  return n === 1 ? ui('1 AI aplikace běží · Ollama: {0} modelů.', modelu) : n >= 2 && n <= 4 ? ui('{0} AI aplikace běží · Ollama: {1} modelů.', n, modelu) : ui('{0} AI aplikací běží · Ollama: {1} modelů.', n, modelu);
}

const adresaOllamy = (klient) => {
  try { return new URL(klient?.baseUrl).host; } catch { return ui('Ollama nenastavená'); }
};

export function createProcessesConnector(ctx) {
  // Ollama jde přes sdíleného klienta z src/ollama.js, tedy na adresu z AGENTEEQ_OLLAMA_URL. Bez klienta
  // se na Ollamu neptá vůbec – nikdy natvrdo na 127.0.0.1:11434.
  const { store, config, onAgenti = () => {}, onStav = () => {}, promenne = [], procesy = processList, detaily = detailyProcesu, ollama: ollamaKlient = null } = ctx;
  let timer = null;
  let ollama = { ok: false, models: [] };
  let lastOk = 0;
  // Povedl se poslední výpis? Selhání (chyba, časový limit) po dřívějším úspěchu neznamená, že nic
  // neběží – údaje o běžících aplikacích jsou pak jen poslední známé a rozhraní to musí říct.
  let posledniOk = null;
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

  const starty = createStabilniStart();

  async function poll() {
    let res;
    try {
      res = await procesy();
    } catch {
      res = { ok: false };
    }
    if (!res?.ok) res = { ok: false };
    const runtimes = res.ok ? parsePs(res.stdout).map(({ uptimeSec, ...r }) => ({ ...r, od: r.running ? starty.od(r.id, uptimeSec) : 0 })) : store.runtimes;
    if (res.ok) starty.ponech(new Set(runtimes.filter((r) => r.running).map((r) => r.id)));
    // Nepovedený výpis = nevíme. Pojistka pak nic nepřidá ani neubere (null).
    onAgenti(res.ok ? await agenti(res.stdout).catch(() => null) : null);
    ollama = ollamaKlient ? await ollamaKlient.loaded() : { ok: false, models: [] };
    const o = runtimes.find((r) => r.id === 'ollama');
    if (o && ollama.ok) {
      o.running = true;
      o.detail = ollama.models.length ? ui('Načteno: {0}', ollama.models.join(', ')) : ui('Žádný model v paměti');
    }
    if (res.ok) lastOk = Date.now();
    const zmena = posledniOk !== res.ok;
    posledniOk = res.ok;
    store.setRuntimes(runtimes);
    // Přechod mezi „zjištěno“ a „nepodařilo se zjistit“ musí být v rozhraní hned, ne až při dalším
    // pravidelném porovnání seznamu zdrojů (5 s).
    if (zmena) onStav(res.ok);
  }

  return {
    id: 'processes',
    name: ui('Aplikace na {0}', POCITAC.tomto),
    provider: 'other',
    kind: 'local',
    verified: true,
    source: `${JE_WINDOWS ? 'Win32_Process' : 'ps'} · ${adresaOllamy(ollamaKlient)}`,
    description: ui('Pozná, které AI aplikace a CLI právě běží, jejich zátěž a modely načtené v Ollamě.'),
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
      if (lastOk && posledniOk === false) {
        return {
          state: 'error',
          detail: ui('Seznam běžících aplikací se teď nepodařilo zjistit. Údaje jsou z posledního úspěšného zjištění.'),
          count: running,
          watching: Boolean(timer),
          lastEventAt: Math.floor(lastOk / 60e3) * 60e3,
        };
      }
      return {
        state: lastOk ? 'connected' : 'error',
        detail: lastOk
          ? aplikaciBezi(running, ollama.ok ? ollama.models.length : null)
          : ollama.ok
            ? ui('Seznam běžících aplikací se na tomto systému nepodařilo získat, Ollama ale odpovídá: {0} modelů.', ollama.models.length)
            : ui('Seznam běžících aplikací se na tomto systému nepodařilo získat.'),
        count: running,
        watching: Boolean(timer),
        // Výpis běží každých pár vteřin; na minuty zaokrouhlený čas nerozhýbe seznam zdrojů při každém průchodu.
        lastEventAt: lastOk ? Math.floor(lastOk / 60e3) * 60e3 : 0,
      };
    },
  };
}
