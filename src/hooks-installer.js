import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './util.js';
import { JE_WINDOWS } from './platform.js';
import { ui } from './texty.js';

// Claude Code hooky posílají události do Agenteeq okamžitě (start, zadání, žádost o povolení, konec tahu).
export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'];
export const HOOK_PATH = '/api/hooks/claude-code';

export const claudeSettingsPath = (sourceHome) => path.join(sourceHome, '.claude', 'settings.json');

// Token hooků v příkazu nestojí: příkaz vidí každý místní uživatel v `ps` a settings.json mívá
// práva 0644 a čtou (i synchronizují) ho jiné nástroje. Hlavičky proto leží v souboru 0600
// v datové složce Agenteeq a curl je čte přes `-H @soubor` (curl 7.55+; macOS 14+ má curl 8,
// curl.exe ve Windows 10 1803+ má 7.55.1+). Chybějící nebo nečitelný soubor = curl skončí chybou
// ještě před odesláním, tedy stejně potichu jako u neběžícího Agenteeq.
export const HOOK_HEADERS_FILE = 'claude-hooky-hlavicky';
export const hookHeadersPath = (dataDir) => path.join(path.resolve(dataDir), HOOK_HEADERS_FILE);

const HLAVICKY = (token) => [
  ['Content-Type', 'application/json'],
  ['X-Agenteeq-Token', token],
];

function overToken(token) {
  if (!/^[a-f0-9]{32,}$/.test(token)) throw new Error('Neplatný token');
}

// Cesta jde do příkazu, který Claude Code pouští přes shell, a ten ji nesmí rozebrat podruhé:
// „Design & Web“, apostrof, $ i diakritika jsou běžná jména složek.
const shQuote = (s) => `'${s.split("'").join("'\\''")}'`;
// PowerShell bere za apostrof i typografické ‘ ’ ‚ ‛ – zdvojují se stejně jako obyčejný, jinak by řetězec ukončily.
const psQuote = (s) => `'${s.replace(/[\x27\u2018\u2019\u201A\u201B]/g, '$&$&')}'`;

function overCestu(headersFile, windows) {
  const p = windows ? path.win32 : path.posix;
  if (typeof headersFile !== 'string' || !p.isAbsolute(headersFile) || /[\0\r\n]/.test(headersFile)) {
    throw new Error('Neplatná cesta k hlavičkám hooku');
  }
}

// Jak příkaz na soubor s hlavičkami odkazuje. Windows: curl.exe nemusí umět Unicode v argumentech,
// proto PowerShell nejdřív vejde do složky (Set-Location je plně Unicode) a curl dostane jen
// krátké ASCII jméno souboru. Spuštěný program dědí složku, ve které PowerShell právě stojí.
const odkazPosix = (headersFile) => `-H @${shQuote(headersFile)}`;
const odkazWindows = (headersFile) => `Set-Location -LiteralPath ${psQuote(path.win32.dirname(headersFile))}; `;
const odkazujeNaHlavicky = (text, headersFile) => text.includes(odkazPosix(headersFile))
  || (text.includes(odkazWindows(headersFile)) && text.includes(`-H '@${path.win32.basename(headersFile)}'`));

// Claude Code používá na Windows Git Bash nebo PowerShell, ne nutně cmd.exe.
// Explicitní PowerShell s -EncodedCommand funguje z obou shellů a nepustí jejich
// expanzi do skriptu. UTF-16LE je kontrakt PowerShellu, nikoli šifrování.
function windowsCommand(url, headersFile, statusline) {
  const output = statusline
    ? "if ($LASTEXITCODE -ne 0) { Write-Output 'Agenteeq nebezi' } else { $reply }"
    : '';
  const fallback = statusline ? "Write-Output 'Agenteeq nebezi'" : '';
  const script = `$ErrorActionPreference = 'Stop'; $OutputEncoding = [Console]::InputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; try { $body = [Console]::In.ReadToEnd(); ${odkazWindows(headersFile)}$reply = $body | & curl.exe -s -m ${statusline ? 1 : 2} -X POST -H '@${path.win32.basename(headersFile)}' --data-binary '@-' '${url}' 2>$null; ${output} } catch { ${fallback} }; exit 0`;
  return `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`;
}

// Rozpoznává i staré příkazy: instalace je nahradí a odinstalace je odstraní.
const commandText = (command) => {
  if (typeof command !== 'string') return '';
  const encoded = command.match(/^powershell\.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ([A-Za-z0-9+/=]+)$/);
  return encoded ? Buffer.from(encoded[1], 'base64').toString('utf16le') : command;
};

// Příkazy z dřívějších verzí nesly token přímo v hlavičce (`-H 'X-Agenteeq-Token: …'`). Fungují
// dál, jen se hlásí jako zastaralé – přepíše je až „Obnovit propojení“, ne Agenteeq sám od sebe.
const tokenVPrikazu = (command) => /X-Agent(?:eeq|ree)-Token:/i.test(commandText(command));

export function hookCommand(port, headersFile, { windows = JE_WINDOWS } = {}) {
  overCestu(headersFile, windows);
  const url = `http://127.0.0.1:${Number(port)}${HOOK_PATH}`;
  if (windows) {
    return windowsCommand(url, headersFile, false);
  }
  return `curl -s -m 2 -X POST ${odkazPosix(headersFile)} --data-binary @- ${url} >/dev/null 2>&1 || true`;
}

const isOurs = (h) => commandText(h?.command).includes(HOOK_PATH);

// Stavový řádek: Claude Code mu posílá limity předplatného (5 h, týden). Agenteeq vrátí krátký text k zobrazení.
export const STATUSLINE_PATH = '/api/hooks/claude-statusline';

export function statuslineCommand(port, headersFile, { windows = JE_WINDOWS } = {}) {
  overCestu(headersFile, windows);
  const url = `http://127.0.0.1:${Number(port)}${STATUSLINE_PATH}`;
  if (windows) {
    return windowsCommand(url, headersFile, true);
  }
  return `curl -s -m 1 -X POST ${odkazPosix(headersFile)} --data-binary @- ${url} 2>/dev/null || printf 'Agenteeq neběží'`;
}

const isOurStatusLine = (sl) => commandText(sl?.command).includes(STATUSLINE_PATH);

// Atomicky a jen pro vlastníka (na Windows platí ACL uživatelského profilu, mode nic nezhorší).
async function zapisHlavicky(headersFile, token) {
  overToken(token);
  await writeFileAtomic(headersFile, HLAVICKY(token).map(([k, v]) => `${k}: ${v}\n`).join(''), 0o600);
}

async function hlavickyPlati(headersFile, token) {
  if (!headersFile || !token) return false;
  try {
    return (await fs.readFile(headersFile, 'utf8')).split(/\r?\n/).includes(`X-Agenteeq-Token: ${token}`);
  } catch {
    return false;
  }
}

async function readSettings(file) {
  let raw = null;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (raw === null || !raw.trim()) return { raw, json: {} };
  try {
    const json = JSON.parse(raw);
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('not object');
    return { raw, json };
  } catch {
    const err = new Error(ui('Soubor ~/.claude/settings.json není platný JSON. Oprav ho a zkus to znovu.'));
    err.code = 'INVALID_SETTINGS';
    throw err;
  }
}

export async function hooksStatus(file, token, headersFile) {
  let json;
  try {
    ({ json } = await readSettings(file));
  } catch (err) {
    return { installed: false, partial: false, current: false, inlineToken: false, events: [], path: file, error: err.message };
  }
  const has = (ev, pred) => (Array.isArray(json.hooks?.[ev]) ? json.hooks[ev] : []).some((g) => (g?.hooks || []).some(pred));
  const events = HOOK_EVENTS.filter((ev) => has(ev, isOurs));
  // Aktuální příkaz odkazuje na soubor s hlavičkami této datové složky a ten nese platný token.
  const hlavicky = await hlavickyPlati(headersFile, token);
  const current = (command) => hlavicky && !tokenVPrikazu(command) && odkazujeNaHlavicky(commandText(command), headersFile) && !command.includes('>NUL');
  const hooksCurrent = HOOK_EVENTS.every((ev) => has(ev, (h) => isOurs(h) && current(h.command)));
  const statusLine = !json.statusLine ? 'none' : isOurStatusLine(json.statusLine) ? 'ours' : 'foreign';
  const statusLineCurrent = statusLine === 'ours' && current(json.statusLine.command);
  return {
    installed: events.length === HOOK_EVENTS.length,
    partial: events.length > 0 && events.length < HOOK_EVENTS.length,
    // Aktuální = hooky s platným tokenem a stavový řádek Agenteeq (cizí stavový řádek nepřepisujeme).
    current: hooksCurrent && (statusLine === 'foreign' || statusLineCurrent),
    // Některý náš příkaz má token přímo v sobě (zápis z dřívější verze) – Nastavení nabídne obnovu.
    inlineToken: HOOK_EVENTS.some((ev) => has(ev, (h) => isOurs(h) && tokenVPrikazu(h.command)))
      || (statusLine === 'ours' && tokenVPrikazu(json.statusLine.command)),
    events,
    statusLine,
    path: file,
  };
}

function stripOurs(json) {
  if (!json.hooks || typeof json.hooks !== 'object') return;
  for (const ev of Object.keys(json.hooks)) {
    if (!Array.isArray(json.hooks[ev])) continue;
    const kept = json.hooks[ev]
      .map((g) => (g && Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h) => !isOurs(h)) } : g))
      .filter((g) => !g || !Array.isArray(g.hooks) || g.hooks.length > 0);
    if (kept.length) json.hooks[ev] = kept;
    else delete json.hooks[ev];
  }
  if (!Object.keys(json.hooks).length) delete json.hooks;
}

async function writeSettings(file, json, raw, now) {
  let backup = null;
  let mode = 0o644;
  if (raw !== null) {
    backup = `${file}.agenteeq-backup-${now}`;
    // 0600 jako originál: v nastavení Claude Code bývají proměnné prostředí s klíči.
    await fs.writeFile(backup, raw, { mode: 0o600 });
    // Zálohy z dřívějších verzí vznikaly s právy 0644. Nemažou se, jen se zúží oprávnění.
    const slozka = path.dirname(file);
    const predpona = `${path.basename(file)}.agenteeq-backup-`;
    for (const jmeno of await fs.readdir(slozka).catch(() => [])) {
      if (jmeno.startsWith(predpona)) await fs.chmod(path.join(slozka, jmeno), 0o600).catch(() => {});
    }
    try { mode = (await fs.stat(file)).mode & 0o777; } catch { /* výchozí práva */ }
  }
  await writeFileAtomic(file, `${JSON.stringify(json, null, 2)}\n`, mode);
  return backup;
}

// Každá instalace (i „Obnovit“ a „Přeinstalovat“) zapíše soubor s hlavičkami znovu s aktuálním
// tokenem a příkazy s aktuálním portem. Soubor vzniká dřív než změna settings.json, takže hook
// nikdy neodkazuje na soubor, který ještě neexistuje.
export async function installHooks(file, { port, token, headersFile, now = Date.now() }) {
  const { raw, json } = await readSettings(file);
  stripOurs(json);
  if (!json.hooks || typeof json.hooks !== 'object') json.hooks = {};
  const command = hookCommand(port, headersFile);
  for (const ev of HOOK_EVENTS) {
    if (!Array.isArray(json.hooks[ev])) json.hooks[ev] = [];
    json.hooks[ev].push({ hooks: [{ type: 'command', command, timeout: 5 }] });
  }
  let statusLine = 'foreign';
  if (!json.statusLine || isOurStatusLine(json.statusLine)) {
    json.statusLine = { type: 'command', command: statuslineCommand(port, headersFile), padding: 0 };
    statusLine = 'ours';
  }
  await zapisHlavicky(headersFile, token);
  const backup = await writeSettings(file, json, raw, now);
  return { backup, statusLine };
}

export async function uninstallHooks(file, { headersFile, now = Date.now() } = {}) {
  const { raw, json } = await readSettings(file);
  let backup = null;
  if (raw !== null) {
    stripOurs(json);
    if (isOurStatusLine(json.statusLine)) delete json.statusLine;
    backup = await writeSettings(file, json, raw, now);
  }
  // Až po úspěšném zápisu settings.json: když zápis selže, zůstanou funkční hooky i jejich hlavičky.
  if (headersFile) await fs.rm(headersFile, { force: true });
  return { backup };
}
