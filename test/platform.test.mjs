// Platformový šev a cesty v rozhraní.
//
// Většina těchhle testů běží na každém systému stejně, protože ověřuje čisté funkce nad
// řetězci. Tam, kde výsledek na systému skutečně závisí (appSupportDir), se testuje to,
// co platí vždycky: že se vychází ze zadaného domova a že se nikdy nesáhne jinam.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { appSupportDir, openCommand, tailscalePaths, JE_MAC, JE_WINDOWS } from '../src/platform.js';
import { originOf } from '../src/skills.js';
import { RUNTIMES } from '../src/connectors/processes.js';
import { detectLocalAgents } from '../src/connectors/local-agents.js';
import { jeAbsolutniCesta, castiCesty, shortPath } from '../public/js/format.js';

test('appSupportDir vychází ze zadaného domova a nikdy nesáhne mimo něj', () => {
  const domov = path.join(path.sep, 'tmp', 'falesny-domov');
  const dir = appSupportDir(domov);
  assert.ok(dir.startsWith(domov), `${dir} musí ležet pod ${domov}`);
  assert.notEqual(dir, domov, 'podsložka, ne samotný domov');

  // Testy podstrkávají falešný domov přes AGENTEEQ_SOURCE_HOME. Kdyby se tahle funkce
  // opřela o proměnnou prostředí (APPDATA), sáhla by při testech na skutečný profil.
  const jiny = appSupportDir(path.join(path.sep, 'tmp', 'jiny'));
  assert.notEqual(jiny, dir, 'jiný domov musí dát jinou cestu');

  if (JE_MAC) assert.equal(dir, path.join(domov, 'Library', 'Application Support'));
  else if (JE_WINDOWS) assert.equal(dir, path.join(domov, 'AppData', 'Roaming'));
  else assert.equal(dir, path.join(domov, '.config'));
});

test('openCommand vrací příkaz pro tento systém, nebo poctivě nic', () => {
  const p = openCommand('http://127.0.0.1:4620');
  if (JE_MAC) assert.deepEqual(p, { cmd: 'open', args: ['http://127.0.0.1:4620'] });
  else if (JE_WINDOWS) assert.deepEqual(p, { cmd: 'explorer.exe', args: ['http://127.0.0.1:4620'] });
  else assert.equal(p, null, 'co neumíme, nehádáme');
});

test('otevírání nikdy neposílá cíl přes shell, který by ho znovu rozebral', () => {
  // Složka „Design & Web“ je běžné jméno. Kdyby cíl procházel cmd.exe, byl by
  // ampersand oddělovačem příkazů – a otevření složky by spustilo cizí program.
  const zakerna = JE_WINDOWS ? 'C:\\Users\\jana\\Design & Web' : '/Users/jana/Design & Web';
  const p = openCommand(zakerna);
  if (!p) return;
  assert.equal(p.args.at(-1), zakerna, 'cíl jde jako jeden celý argument');
  assert.ok(!/^(cmd|powershell|sh|bash)/i.test(p.cmd), `${p.cmd} by cíl znovu rozebral`);
});

test('tailscalePaths vrací jen absolutní cesty pro tento systém', () => {
  const cesty = tailscalePaths();
  assert.ok(cesty.length > 0);
  for (const c of cesty) assert.ok(path.isAbsolute(c), `${c} musí být absolutní`);
  if (JE_WINDOWS) assert.ok(cesty.every((c) => c.endsWith('.exe')), 'na Windows jsou to .exe');
});

test('původ dovednosti se pozná i z cesty psané zpětným lomítkem', () => {
  const pripady = [
    ['/Users/x/.claude/plugins/cache/claude-plugins-official/a', 'anthropic'],
    ['C:\\Users\\x\\.claude\\plugins\\cache\\claude-plugins-official\\a', 'anthropic'],
    ['/Users/x/.codex/skills/.system/a', 'openai'],
    ['C:\\Users\\x\\.codex\\skills\\.system\\a', 'openai'],
    ['/Users/x/.claude/plugins/marketplaces/cizi/a', 'plugin'],
    ['C:\\Users\\x\\.claude\\plugins\\cache\\cizi\\a', 'plugin'],
    ['C:\\Users\\x\\.claude\\skills\\moje', 'own'],
  ];
  for (const [cesta, cekany] of pripady) assert.equal(originOf(cesta), cekany, cesta);
});

// Rozhraní dostává cesty tak, jak je napsal systém, na kterém běží server. Telefon
// s Androidem se dívá na Mac, prohlížeč na Macu se přes Tailscale dívá na Windows.
// Proto nesmí nic v rozhraní předpokládat jeden konkrétní tvar cesty.
test('rozhraní pozná absolutní cestu na Macu, Linuxu i Windows', () => {
  for (const ano of ['/Users/jana/web', '/home/jana/web', 'C:\\Users\\jana\\web', 'D:/projekt', '\\\\server\\sdileni']) {
    assert.equal(jeAbsolutniCesta(ano), true, ano);
  }
  for (const ne of ['relativni/cesta', '', null, undefined, '~/web', 'web']) {
    assert.equal(jeAbsolutniCesta(ne), false, String(ne));
  }
});

test('rozhraní rozdělí cestu bez ohledu na oddělovač', () => {
  assert.deepEqual(castiCesty('/Users/jana/web'), ['Users', 'jana', 'web']);
  assert.deepEqual(castiCesty('C:\\Users\\jana\\web'), ['C:', 'Users', 'jana', 'web']);
  assert.deepEqual(castiCesty('a//b\\\\c'), ['a', 'b', 'c'], 'zdvojený oddělovač nevyrobí prázdnou část');
  assert.deepEqual(castiCesty(''), []);
});

test('domovská složka se v rozhraní zkrátí na vlnovku na všech systémech', () => {
  assert.equal(shortPath('/Users/jana/web'), '~/web');
  assert.equal(shortPath('/home/jana/web'), '~/web');
  assert.equal(shortPath('C:\\Users\\jana\\web'), '~\\web');
  assert.equal(shortPath('/opt/nastroje'), '/opt/nastroje', 'co není domov, se nezkracuje');
  assert.equal(shortPath('C:\\Program Files\\x'), 'C:\\Program Files\\x');
  assert.equal(shortPath(''), '');
});

// ── Rozpoznání běžících aplikací na obou systémech ───────────────────────────
//
// Výpis procesů vypadá na každém systému jinak: /Applications/Cursor.app/… proti
// C:\…\Cursor.exe. Dřív tu stály výrazy psané jen pro macOS, takže na Windows
// nesedl ani jeden a konektor hlásil nulu, i když výpis procesů fungoval.

test('běžící aplikace se poznají z macOS i windowsového výpisu', () => {
  const pripady = [
    ['/Applications/Cursor.app/Contents/MacOS/Cursor', 'cursor'],
    ['C:\\Users\\jana\\AppData\\Local\\Programs\\cursor\\Cursor.exe', 'cursor'],
    ['/usr/local/bin/claude --session-id x', 'claude-code'],
    ['C:\\Users\\jana\\AppData\\Roaming\\npm\\claude.exe -p', 'claude-code'],
    ['/opt/homebrew/bin/codex exec', 'codex'],
    ['C:\\Users\\jana\\AppData\\Roaming\\npm\\codex.exe exec', 'codex'],
    ['/Applications/Visual Studio Code.app/Contents/MacOS/Electron', 'vscode'],
    ['C:\\Users\\x\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe', 'vscode'],
    ['/Applications/ChatGPT.app/Contents/MacOS/ChatGPT', 'chatgpt'],
    ['C:\\Program Files\\Ollama\\ollama.exe serve', 'ollama'],
  ];
  for (const [radek, cekany] of pripady) {
    assert.equal(RUNTIMES.find((r) => r.test(radek))?.id, cekany, radek);
  }
});

test('Claude Code a Claude Desktop se nespletou — rozhoduje velikost písmene', () => {
  // `claude` je nástroj příkazové řádky, `Claude` desktopová aplikace. Na macOS se tím
  // ty dva odlišují spolehlivě a stejná zvyklost platí i pro claude.exe vs Claude.exe.
  const desktop = ['/Applications/Claude.app/Contents/MacOS/Claude', 'C:\\Users\\x\\AppData\\Local\\AnthropicClaude\\Claude.exe'];
  const cli = ['/usr/local/bin/claude -p', 'C:\\Users\\x\\AppData\\Roaming\\npm\\claude.exe --version'];
  for (const a of desktop) assert.equal(RUNTIMES.find((r) => r.test(a))?.id, 'claude-desktop', a);
  for (const a of cli) assert.equal(RUNTIMES.find((r) => r.test(a))?.id, 'claude-code', a);
});

test('vnitřní codex aplikace ChatGPT se nepočítá jako samostatné Codex CLI', () => {
  assert.equal(RUNTIMES.find((r) => r.test('/Applications/ChatGPT.app/Contents/Resources/codex -c x app-server')), undefined);
});

test('lokální agenti se najdou i ve windowsovém výpisu a systémové procesy ne', () => {
  const vypis = [
    '1234 00:20 10.0 204800 C:\\Program Files\\Ollama\\ollama.exe serve',
    '2345 00:30 15.0 307200 C:\\Python312\\python.exe C:\\Users\\jana\\ComfyUI\\main.py --listen',
    '3456 00:05 2.0 51200 C:\\Users\\jana\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe',
    '5678 00:12 8.0 102400 C:\\tools\\llama-server.exe -m C:\\modely\\qwen2.5-7b.gguf --port 8000',
    // Systémové procesy Windows: ve System32 leží stovky procesů se slovy jako „serve“.
    '4567 00:40 0.5 51200 C:\\Windows\\System32\\svchost.exe -k NetworkService',
    '4568 00:40 0.5 51200 C:\\Windows\\SysWOW64\\rundll32.exe inference.dll',
  ].join('\n');
  const nalezeni = detectLocalAgents(vypis, { ports: [] });
  assert.deepEqual(nalezeni.map((a) => a.id).sort(), ['comfyui', 'llama-cpp', 'lmstudio', 'ollama']);
});
