import { tr, tentoPocitac } from './i18n.js';
// Které aplikace umí Agenteeq číst a které ne – na jednom místě, ať se nikdy nestane, že nějaká
// běží a aplikace o ní mlčí. Test `test/runtimes-coverage.test.mjs` hlídá, že každá aplikace ze
// seznamu v `src/connectors/processes.js` je zařazená právě do jedné z těchto dvou skupin.

// Konverzace se čtou z přepisů na disku.
export const MA_PREPIS = new Set([
  'claude-code',
  'codex',
  'codex-app',
  'copilot-cli',
  'vscode',
  'cursor',
  'gemini-cli',
  'qwen-code',
  'ollama',
  'lmstudio',
]);

// Nástroje, jejichž konverzace Agenteeq zatím nečte. Tvrdí se jen to, co platí jistě – o tom, jak
// si který nástroj ukládá data, tu nic nestojí, dokud to někdo neověří na skutečném stroji.
const NECTE_ZATIM = tr('Agenteeq zatím neumí číst konverzace tohoto nástroje. Vidí jen, že běží a jak dlouho.');
const WEB_OKNO = tr('Běží jako samostatné okno webové aplikace. Stav webových chatů hlásí rozšíření Agenteeq jen z běžné záložky Chromu, takže tady je vidět jen, že je okno otevřené a jak dlouho.');
const MOJE_RADA = tr('Přidej ho do Mých nástrojů a uvidíš, kdy běží.');
const MOJE_ODKAZ = { href: '#/nastaveni', text: tr('Moje nástroje') };

// Aplikace, které na tento Mac konverzace neukládají. U každé je důvod – ověřený, ne odhadnutý –
// a co s tím jde udělat. Tohle je text, který uživatel uvidí místo prázdna.
export const BEZ_PREPISU = {
  chatgpt: {
    duvod: tr('Aplikace ChatGPT si konverzace na {0} neukládá, ani ty, ve kterých pracuje agent. Agenteeq je proto nemá odkud přečíst.', tentoPocitac()),
    rada: tr('Kdy chat pracuje a kdy čeká, uvidíš, když ChatGPT otevřeš v Chromu se zapnutým rozšířením Agenteeq. Kódovací vlákna spuštěná jako samostatný Codex se sledují normálně.'),
    odkaz: { href: '#/nastaveni', text: tr('Nastavit rozšíření') },
  },
  'claude-desktop': {
    duvod: tr('Agenteeq sleduje místní Claude Code z přepisů a vzdálený Code z místní cache Claude Desktopu. Běžné chaty v této desktopové aplikaci zatím nesleduje.'),
    rada: tr('Kdy chat pracuje a kdy čeká, uvidíš přes rozšíření Agenteeq, když Claude otevřeš v Chromu na claude.ai.'),
    odkaz: { href: '#/nastaveni', text: tr('Nastavit rozšíření') },
  },
  'ms-copilot': {
    duvod: tr('Aplikace Microsoft Copilot si konverzace neukládá v podobě, kterou by šlo přečíst.'),
    rada: tr('Webovou verzi v Chromu Agenteeq uvidí přes rozšíření: kdy pracuje a kdy čeká.'),
    odkaz: { href: '#/nastaveni', text: tr('Nastavit rozšíření') },
  },
  perplexity: {
    duvod: tr('Aplikace Perplexity konverzace na disk neukládá.'),
    rada: tr('Webovou verzi v Chromu Agenteeq uvidí přes rozšíření: kdy pracuje a kdy čeká.'),
    odkaz: { href: '#/nastaveni', text: tr('Nastavit rozšíření') },
  },
  grok: {
    duvod: tr('Aplikace Grok konverzace na disk neukládá.'),
    rada: tr('Webovou verzi v Chromu Agenteeq uvidí přes rozšíření: kdy pracuje a kdy čeká.'),
    odkaz: { href: '#/nastaveni', text: tr('Nastavit rozšíření') },
  },
  warp: {
    duvod: tr('Warp si dotazy na agenta ukládá do vlastní databáze, ale bez počtu tokenů, a Agenteeq je zatím nečte. Vidí jen, že Warp běží a jak dlouho.'),
    rada: MOJE_RADA,
    odkaz: MOJE_ODKAZ,
  },
  ...Object.fromEntries(['cursor-agent', 'windsurf', 'antigravity', 'kiro', 'trae', 'zed', 'aider', 'goose', 'opencode', 'amp', 'crush', 'droid', 'auggie']
    .map((id) => [id, { duvod: NECTE_ZATIM, rada: MOJE_RADA, odkaz: MOJE_ODKAZ }])),
  ...Object.fromEntries(['comet', 'chatgpt-atlas', 'dia']
    .map((id) => [id, { duvod: tr('Agenteeq zatím neumí číst konverzace v tomto prohlížeči. Vidí jen, že běží a jak dlouho.'), rada: MOJE_RADA, odkaz: MOJE_ODKAZ }])),
  // Webové aplikace spuštěné jako samostatné okno prohlížeče. Rozšíření Agenteeq pracuje v běžných
  // záložkách Chromu, ne v těchto oknech – proto u služeb, které rozšíření umí, radíme záložku.
  ...Object.fromEntries(['pwa-chatgpt', 'pwa-claude', 'pwa-gemini', 'pwa-perplexity', 'pwa-grok', 'pwa-copilot']
    .map((id) => [id, { duvod: WEB_OKNO, rada: tr('Otevři službu v běžné záložce Chromu se zapnutým rozšířením Agenteeq. Tam uvidíš, kdy pracuje a kdy čeká.'), odkaz: { href: '#/nastaveni', text: tr('Nastavit rozšíření') } }])),
  ...Object.fromEntries(['pwa-google-ai-studio', 'pwa-notebooklm', 'pwa-stitch', 'pwa-deepseek', 'pwa-replit', 'pwa-lovable', 'pwa-v0', 'pwa-bolt']
    .map((id) => [id, { duvod: WEB_OKNO, rada: MOJE_RADA, odkaz: MOJE_ODKAZ }])),
};

export const bezPrepisu = (id, sessions = []) => Boolean(BEZ_PREPISU[id]) && !(id === 'claude-desktop' && sessions.some((s) => s.connector === 'claude-desktop-code' || (s.connector === 'claude-code' && s.app?.includes('Claude Desktop'))));
