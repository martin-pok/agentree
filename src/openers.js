import fs from 'node:fs';
import { run, shellQuote } from './util.js';
import { openCommand, JE_MAC, jeAbsolutniCesta } from './platform.js';

// Otevření session přímo v aplikaci, kde běží. Plán se skládá jen ze serverových dat – nikdy z textu od klienta.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Identifikátor konverzace se vkládá do příkazu (`claude --resume <id>`). Nesmí začínat pomlčkou,
// jinak by ho cílový program přečetl jako přepínač: session s ID „--dangerously-skip-permissions“
// dala příkaz, který spustil Claude Code bez ptaní na povolení (ověřeno bezpečnostním auditem).
const SAFE_ID = /^[A-Za-z0-9_][\w.-]{0,119}$/;

// Složka se otevírá jen jako složka. `open x.app` by program spustil a složka s podvrženým balíčkem
// (naklonovaný repozitář, rozbalený archiv) nemá karanténu, takže by Gatekeeper přeskočil.
const BALICEK = /\.(app|command|tool|terminal|workflow|action|scpt|scptd|pkg|mpkg|saver|prefPane|bundle|framework|xpc|appex|plugin|kext)$/i;
export function bezpecnaSlozka(cesta, { stat = fs.statSync, real = fs.realpathSync } = {}) {
  try {
    const skutecna = real(cesta);
    return stat(skutecna).isDirectory() && !BALICEK.test(String(skutecna).replace(/[\\/]+$/, ''));
  } catch {
    return false;
  }
}

export const APPS = {
  codex: { name: 'ChatGPT', path: '/Applications/ChatGPT.app', label: 'Otevřít v Codexu' },
  claude: { name: 'Claude', path: '/Applications/Claude.app', label: 'Otevřít Claude' },
  cursor: { name: 'Cursor', path: '/Applications/Cursor.app', label: 'Otevřít v Cursoru' },
  vscode: { name: 'Visual Studio Code', path: '/Applications/Visual Studio Code.app', label: 'Otevřít ve VS Code' },
};

export const ALL_APPS = { codex: true, claude: true, cursor: true, vscode: true, cli: { claude: true, codex: true, copilot: true } };

// Přepnutí do okna běžící aplikace jedním klikem – hlavní důvod, proč uživatel Agenteeq drží
// otevřený: nemusí mezi desítkami oken hledat, které patří kterému agentovi.
// Název aplikace se nikdy nebere z požadavku, jen z tohoto pevného seznamu.
export const RUNTIME_APPS = {
  'claude-desktop': { app: 'Claude', label: 'Claude' },
  chatgpt: { app: 'ChatGPT', label: 'ChatGPT' },
  cursor: { app: 'Cursor', label: 'Cursor' },
  vscode: { app: 'Visual Studio Code', label: 'VS Code' },
  'ms-copilot': { app: 'Microsoft Copilot', label: 'Microsoft Copilot' },
  perplexity: { app: 'Perplexity', label: 'Perplexity' },
  grok: { app: 'Grok', label: 'Grok' },
  lmstudio: { app: 'LM Studio', label: 'LM Studio' },
  ollama: { app: 'Ollama', label: 'Ollama' },
};

export function planRuntimeFocus(id) {
  const r = RUNTIME_APPS[id];
  if (!r) return null;
  return { kind: 'open', args: ['-a', r.app], label: r.label, title: `Přepnout do ${r.label}` };
}

export async function detectApps() {
  const apps = Object.fromEntries(Object.entries(APPS).map(([k, a]) => [k, fs.existsSync(a.path)]));
  const r = await run('/bin/zsh', ['-lc', 'for c in claude codex copilot; do command -v "$c" >/dev/null 2>&1 && echo "$c"; done'], { timeout: 5000 });
  const found = new Set(r.stdout.split('\n').map((x) => x.trim()).filter(Boolean));
  apps.cli = { claude: found.has('claude'), codex: found.has('codex'), copilot: found.has('copilot') };
  return apps;
}

const localIdOf = (s) => String(s.id || '').slice(String(s.connector || '').length + 1);
const hasFolder = (s) => typeof s.cwd === 'string' && jeAbsolutniCesta(s.cwd) && !s.cwd.includes('\n');

function terminalCommand(s, apps) {
  const id = localIdOf(s);
  if (!SAFE_ID.test(id)) return null;
  const cd = hasFolder(s) ? `cd ${shellQuote(s.cwd)} && ` : '';
  if (s.connector === 'claude-code' && apps.cli?.claude) return `${cd}claude --resume ${id}`;
  if (s.connector === 'codex' && apps.cli?.codex) return `${cd}codex resume ${id}`;
  if (s.connector === 'copilot-cli' && apps.cli?.copilot) return `${cd}copilot --resume ${id}`;
  return null;
}

function appPlan(s, apps) {
  const id = localIdOf(s);
  switch (s.connector) {
    case 'codex':
      return apps.codex && UUID.test(id) ? { kind: 'open', args: [`codex://threads/${id}`], label: 'Codex', title: 'Otevřít v Codexu' } : null;
    case 'claude-code':
      return apps.claude ? { kind: 'open', args: ['-a', APPS.claude.name], label: 'Claude', title: 'Otevřít Claude' } : null;
    case 'cursor':
      return apps.cursor && hasFolder(s) ? { kind: 'open', args: ['-a', APPS.cursor.name, s.cwd], label: 'Cursor', title: 'Otevřít v Cursoru' } : null;
    case 'vscode-copilot':
      return apps.vscode && hasFolder(s) ? { kind: 'open', args: ['-a', APPS.vscode.name, s.cwd], label: 'VS Code', title: 'Otevřít ve VS Code' } : null;
    case 'claude-desktop-code': {
      if (!/^session_[A-Za-z0-9]{8,80}$/.test(id)) return null;
      return { kind: 'open', args: [`https://claude.ai/code/${id}`], label: 'Claude', title: 'Otevřít konverzaci' };
    }
    case 'web': {
      let url;
      try { url = new URL(s.url); } catch { return null; }
      return url.protocol === 'https:' ? { kind: 'open', args: [url.href], label: 'prohlížeč', title: 'Otevřít konverzaci' } : null;
    }
    default:
      return null;
  }
}

// `aplikace` říká, jestli systém umí otevřít session v konkrétní aplikaci a Terminálu.
// Mimo macOS to neumí, ale složku a odkaz otevřít umí – a právě o ty by uživatel
// na Windows zbytečně přišel, kdyby o všem rozhodoval jeden vypínač.
//
// Výchozí je „umí“: tahle funkce jen skládá plán a o schopnostech systému rozhoduje
// volající (src/app.js podle config.openApps). Kdyby si to funkce zjišťovala sama,
// nešla by otestovat pro jiný systém, než na kterém zrovna běží test.
export function planOpen(s, target, apps = {}, { aplikace = true } = {}) {
  if (!s) return null;
  if (target === 'app') {
    // Odkaz na webovou konverzaci otevře prohlížeč, a ten je všude – na rozdíl od `open -a`.
    const plan = appPlan(s, apps);
    if (!plan) return null;
    return aplikace || (['web', 'desktop-cache'].includes(s.source) && plan.args.length === 1) ? plan : null;
  }
  if (target === 'terminal') {
    if (!aplikace) return null;
    const command = terminalCommand(s, apps);
    return command ? { kind: 'terminal', command, label: 'Terminál', title: 'Pokračovat v Terminálu' } : null;
  }
  if (target === 'folder') {
    if (!hasFolder(s) || s.source === 'web') return null;
    return { kind: 'open', args: [s.cwd], folderOnly: true, label: aplikace ? 'Finder' : 'Správce souborů', title: 'Otevřít složku' };
  }
  return null;
}

// Nabídka akcí pro UI (pořadí = důležitost).
export function openTargets(s, apps = {}, moznosti = {}) {
  return ['app', 'terminal', 'folder']
    .map((id) => {
      const plan = planOpen(s, id, apps, moznosti);
      return plan ? { id, label: plan.title } : null;
    })
    .filter(Boolean);
}

// Schránku plní server, ne okno. WKWebView v aplikaci ani stránka otevřená z telefonu po síti
// do schránky zapsat nesmí (chybí gesto uživatele nebo zabezpečený kontext) a chyba je tichá.
//
// Kódování: změřeno na macOS 26 – `pbcopy` uloží text správně jen tehdy, když NEMÁ nastavené
// LANG/LC_*. S LANG=…UTF-8 (nebo cs_CZ.UTF-8) přečte vstup jako MacRoman a z „název“ je
// „n�zev“. Proměnné jazyka se proto odstraní, ať je aplikace spuštěná odkudkoli.
const LOCALE_VARS = new Set(['LANG', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', '__CF_USER_TEXT_ENCODING']);
export function clipboardEnv(base = process.env) {
  return Object.fromEntries(Object.entries(base).filter(([k]) => !LOCALE_VARS.has(k)));
}

export async function copyToClipboard(text, { dry = false } = {}) {
  if (dry) return { ok: true, dry: true };
  if (typeof text !== 'string' || !text) return { ok: false };
  const r = await run('pbcopy', [], { input: text, timeout: 4000, env: clipboardEnv() });
  return { ok: r.ok };
}

const TERMINAL_SCRIPT = ['on run argv', 'tell application "Terminal"', 'activate', 'do script (item 1 of argv)', 'end tell', 'end run'];

export async function executeOpen(plan, { dry = false } = {}) {
  if (dry) return { ok: true, dry: true };
  if (plan.kind === 'open') {
    if (plan.folderOnly && !bezpecnaSlozka(plan.args[plan.args.length - 1])) {
      return { ok: false, error: `${plan.label}: tohle není obyčejná složka, a tak ji Agenteeq neotevře (balíček by se mohl spustit jako program).` };
    }
    // Přepínače `open` (-a, -R) zná jen macOS. Jinde je plán vždycky jediný cíl –
    // cesta nebo adresa – a ten se předá tomu, co systém pro otevírání má.
    if (!JE_MAC) {
      const cil = plan.args[plan.args.length - 1];
      const prikaz = openCommand(cil);
      if (!prikaz) return { ok: false, error: `${plan.label}: tenhle systém otevírání neumí` };
      // explorer.exe vrací nenulový kód i při úspěchu, takže se podle něj nedá řídit.
      await run(prikaz.cmd, prikaz.args, { timeout: 8000 });
      return { ok: true };
    }
    const r = await run('open', plan.args, { timeout: 8000 });
    return r.ok ? { ok: true } : { ok: false, error: `${plan.label}: ${r.stderr.trim() || 'aplikaci se nepodařilo otevřít'}` };
  }
  if (plan.kind === 'terminal') {
    // Příkaz jde do AppleScriptu jako argument (argv), ne jako součást skriptu.
    const r = await run('osascript', [...TERMINAL_SCRIPT.flatMap((l) => ['-e', l]), plan.command], { timeout: 10000 });
    if (r.ok) return { ok: true };
    const denied = /not allowed|-1743|not authori/i.test(r.stderr);
    return {
      ok: false,
      error: denied
        ? 'macOS nepovolil ovládání Terminálu. Povol ho v Nastavení systému → Soukromí a zabezpečení → Automatizace.'
        : `Terminál se nepodařilo otevřít: ${r.stderr.trim() || 'neznámá chyba'}`,
    };
  }
  return { ok: false, error: 'Neznámý typ akce.' };
}
