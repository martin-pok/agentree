// Jediné místo, kde Agenteeq ví, na jakém systému běží.
//
// Bez něj by se předpoklady o macOS rozlezly po konektorech: jeden by skládal cestu
// přes „Library/Application Support“, druhý by volal `ps`, třetí by hledal `.app`.
// Přidat Windows by pak znamenalo hledat je po celém repozitáři a na jeden zapomenout.
//
// Pravidlo: nikde jinde v src/ nestojí `process.platform` u něčeho, co se dá vyřešit tady.
// Výjimkou zůstává src/config.js, kde se podle systému jen zapínají a vypínají celé funkce.
//
// Co tu není a nebude: domněnky. Když pro nějaký systém mechanismus neznáme, funkce vrátí
// prázdno a volající se podle toho zachová. Nikdy nevrátí vymyšlenou cestu.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './util.js';

export const JE_MAC = process.platform === 'darwin';
export const JE_WINDOWS = process.platform === 'win32';

/**
 * Složka, kde desktopové aplikace (VS Code, Cursor, Claude Desktop) drží svá data.
 *
 * Vychází se z `sourceHome`, ne z proměnných prostředí, aby testy mohly podstrčit
 * falešný domov přes AGENTEEQ_SOURCE_HOME a nikdy nesáhly na skutečný profil.
 *
 *   macOS    ~/Library/Application Support
 *   Windows  %USERPROFILE%\AppData\Roaming
 *   Linux    ~/.config
 */
export function appSupportDir(sourceHome) {
  if (JE_MAC) return path.join(sourceHome, 'Library', 'Application Support');
  if (JE_WINDOWS) return path.join(sourceHome, 'AppData', 'Roaming');
  return path.join(sourceHome, '.config');
}

// ── Běžící procesy ───────────────────────────────────────────────────────────
//
// Sjednocený tvar řádku, ať přijde odkudkoli:
//
//   <pid> <běží[dd-]hh:mm:ss> <%cpu> <rss v kB> <celý příkaz s argumenty>
//
// `ps -axo %cpu` na macOS udává průměr za celý život procesu, ne okamžitou zátěž.
// Windowsový výpočet níž dělá totéž (součet času v jádře i v uživatelském režimu
// děleno dobou běhu), takže obě čísla znamenají opravdu tutéž veličinu.

const PS_ARGS = ['-axo', 'pid=,etime=,%cpu=,rss=,args='];

// PowerShell je na Windows 10 i 11 součástí systému, takže nepřibývá závislost.
// Win32_Process je jediný zdroj, který dá zároveň PID, celou příkazovou řádku,
// spotřebovaný čas i paměť; `tasklist` příkazovou řádku vůbec nevypisuje.
const PS_WINDOWS = `
$ErrorActionPreference = 'Stop'
$ted = Get-Date
Get-CimInstance Win32_Process | ForEach-Object {
  $start = $_.CreationDate
  if (-not $start) { return }
  $bezi = ($ted - $start).TotalSeconds
  if ($bezi -lt 1) { $bezi = 1 }
  # KernelModeTime a UserModeTime jsou ve stonanosekundách.
  $cpu = [math]::Round(((($_.KernelModeTime + $_.UserModeTime) / 1e7) / $bezi) * 100, 1)
  $t = [TimeSpan]::FromSeconds([math]::Floor($bezi))
  $doba = if ($t.Days -gt 0) { '{0}-{1:00}:{2:00}:{3:00}' -f $t.Days, $t.Hours, $t.Minutes, $t.Seconds }
          else { '{0:00}:{1:00}:{2:00}' -f $t.Hours, $t.Minutes, $t.Seconds }
  $rss = [math]::Round($_.WorkingSetSize / 1024)
  $radek = $_.CommandLine
  if (-not $radek) { $radek = $_.ExecutablePath }
  if (-not $radek) { $radek = $_.Name }
  '{0} {1} {2} {3} {4}' -f $_.ProcessId, $doba, $cpu, $rss, ($radek -replace '[\\r\\n]+', ' ')
}
`.trim();

/**
 * Seznam běžících procesů v jednotném tvaru. Když ho systém neumí dát, vrátí
 * `{ ok: false }` – volající pak drží poslední známý stav a nic si nedomýšlí.
 */
export async function processList(runImpl = run) {
  if (JE_WINDOWS) {
    return runImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_WINDOWS], { timeout: 8000 });
  }
  return runImpl('ps', PS_ARGS);
}

/**
 * Otevře cestu nebo adresu v tom, co je pro ni v systému nastavené.
 * Vrací `null`, když to systém neumí – nikdy nehádá jiný příkaz.
 */
export function openCommand(cil) {
  if (JE_MAC) return { cmd: 'open', args: [cil] };
  // Nabízí se `cmd.exe /c start "" <cíl>`, ale cmd.exe si argumenty znovu rozebere:
  // ve složce pojmenované „Design & Web“ by se z ampersandu stal oddělovač příkazů
  // a spustilo by se to, co za ním následuje. Tudy se otevírají i cesty od uživatele,
  // takže to nesmí být bezpečné jen náhodou.
  //
  // explorer.exe je obyčejný program: argumenty dostane přímo, žádný shell je nečte.
  // Zvládne adresu i složku. Vrací nenulový kód i při úspěchu – volající se proto
  // nesmí řídit návratovým kódem, jen tím, že se okno otevře.
  if (JE_WINDOWS) return { cmd: 'explorer.exe', args: [cil] };
  return null;
}

/** Jak se tenhle systém jmenuje v účtu Agenteeq (tabulka `devices`, src/cloud-sync.js). */
export const SYSTEM_UCTU = JE_MAC ? 'macos' : JE_WINDOWS ? 'windows' : 'linux';

/**
 * Vrátí do popředí okno desktopové aplikace Agenteeq (po přihlášení v prohlížeči). Umí to macOS
 * přes identifikátor balíčku; jinde `null` – okno se nehledá podle názvu ani jinak odhadem.
 */
export function oknoDoPopredi() {
  if (JE_MAC) return { cmd: 'open', args: ['-b', 'cz.agenteeq.desktop'] };
  return null;
}

// ── Kde který nástroj bydlí ──────────────────────────────────────────────────

/**
 * Cesty, na kterých bývá Tailscale, když není v PATH. Prázdné pole znamená
 * „hledej jen v PATH“, ne „není nainstalovaný“.
 */
export function tailscalePaths() {
  if (JE_MAC) {
    return [
      '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
      '/usr/local/bin/tailscale',
      '/opt/homebrew/bin/tailscale',
    ];
  }
  if (JE_WINDOWS) {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    return [path.join(programFiles, 'Tailscale', 'tailscale.exe')];
  }
  return ['/usr/bin/tailscale', '/usr/local/bin/tailscale'];
}

/**
 * Je to absolutní cesta – v POSIXovém i windowsovém tvaru?
 *
 * `path.isAbsolute` zná jen tvar toho systému, na kterém zrovna běží. To by ale
 * znamenalo, že rozhraní nabídne „Otevřít složku“ a server tutéž cestu odmítne,
 * protože se na ni každý dívá jinak. Obojí proto používá stejné pravidlo
 * (`jeAbsolutniCesta` v public/js/format.js je jeho protějšek pro prohlížeč).
 */
export const jeAbsolutniCesta = (p) => /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(String(p || ''));

/** Příkaz, kterým se v systému hledá program v PATH. */
export const whichCommand = JE_WINDOWS ? 'where.exe' : 'which';

// ── Naslouchající porty ──────────────────────────────────────────────────────

const LSOF_ARGS = ['-nP', '-iTCP', '-sTCP:LISTEN'];

// Get-NetTCPConnection zná port i PID, jméno procesu ne – to se dopáruje z Get-Process.
// Výstup se skládá do téhož tvaru, jaký dává `lsof`, aby ho četl jeden parser.
const PORTY_WINDOWS = `
$ErrorActionPreference = 'SilentlyContinue'
$jmena = @{}
Get-Process | ForEach-Object { $jmena[$_.Id] = $_.ProcessName }
Get-NetTCPConnection -State Listen | ForEach-Object {
  $jmeno = $jmena[[int]$_.OwningProcess]
  if (-not $jmeno) { $jmeno = 'unknown' }
  '{0} {1} x x x x x {2}:{3} (LISTEN)' -f $jmeno, $_.OwningProcess, $_.LocalAddress, $_.LocalPort
}
`.trim();

/**
 * Výpis naslouchajících TCP portů v tvaru, jaký umí `parseListeningPorts`.
 * Když ho systém neumí dát, vrátí `{ ok: false }`.
 */
export async function listeningPorts(runImpl = run) {
  if (JE_WINDOWS) {
    return runImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PORTY_WINDOWS], { timeout: 8000 });
  }
  return runImpl('lsof', LSOF_ARGS);
}

// ── Běží proces, jehož příkazová řádka odpovídá vzoru? ───────────────────────

/**
 * Protějšek `pgrep -f` – hledá ve VŠECH argumentech, ne jen ve jménu programu.
 *
 * Nabízelo by se volat `pgrep` tam, kde je, a výpis procesů jen na Windows. Jenže
 * převádět regulární výraz na vzor pro pgrep je křehké a obě cesty by se pak lišily
 * v tom, co ještě považují za shodu. Výpis procesů je společný, tak se hledá v něm
 * všude stejně – je to o něco dražší, ale volá se při obnově stavu, ne ve smyčce.
 *
 * Vrací `{ ok }`; nikdy nevyhodí výjimku a nikdy si nedomýšlí, že něco běží.
 */
export async function bezziProces(vzor, runImpl = run) {
  const r = await processList(runImpl);
  if (!r?.ok) return { ok: false, stdout: '' };
  const radky = String(r.stdout || '').split('\n').filter((radek) => vzor.test(radek));
  return { ok: radky.length > 0, stdout: radky.join('\n') };
}

// ── Celé jméno uživatele ─────────────────────────────────────────────────────

/**
 * Jméno pro pozdrav v rozhraní. Když ho systém nedá, vrátí prázdno – volající si
 * vystačí s přihlašovacím jménem a nic si nedomýšlí.
 */
export async function fullUserName(runImpl = run) {
  if (JE_MAC) {
    const r = await runImpl('id', ['-F'], { timeout: 2000 });
    return r?.ok ? r.stdout.trim() : '';
  }
  if (JE_WINDOWS) {
    // Get-LocalUser zná celé jméno u místních účtů; u účtů Microsoftu bývá prázdné
    // a to je v pořádku – prázdno je poctivější než přihlašovací jméno vydávané za jméno.
    const r = await runImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '(Get-LocalUser -Name $env:USERNAME -ErrorAction SilentlyContinue).FullName'], { timeout: 4000 });
    return r?.ok ? r.stdout.trim() : '';
  }
  return '';
}

// Je aplikace opravdu nainstalovaná? Hledá se v /Applications a v ~/Applications; `null` = nevím
// (jiný systém než macOS, nebo kontrola vypnutá), nikdy ne „ne“ jen proto, že se nehledalo.
export function appInstalled(names, home, { fileExists = (p) => fs.existsSync(p), enabled = JE_MAC } = {}) {
  if (!enabled) return null;
  return [].concat(names).some((n) => [`/Applications/${n}.app`, `${home}/Applications/${n}.app`].some((p) => fileExists(p)));
}
