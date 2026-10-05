import { tr, tentoPocitac } from './i18n.js';
// Které aplikace umí Agenteeq číst a které ne – na jednom místě, ať se nikdy nestane, že nějaká
// běží a aplikace o ní mlčí. Test `test/runtimes-coverage.test.mjs` hlídá, že každá aplikace ze
// seznamu v `src/connectors/processes.js` je zařazená právě do jedné z těchto dvou skupin.

// Konverzace se čtou z přepisů na disku.
export const MA_PREPIS = new Set([
  'claude-code',
  'codex',
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
const NECTE_ZATIM = tr('Konverzace tohoto nástroje se nečtou. Sleduje se, že běží a jak dlouho.');
const WEB_OKNO = tr('Samostatné okno webové aplikace. Sleduje se, že je otevřené a jak dlouho.');
const MOJE_RADA = tr('V Mých nástrojích uvidíš, kdy běží.');
const MOJE_ODKAZ = { href: '#/nastaveni', karta: 'moje', text: tr('Moje nástroje') };
const ROZSIRENI_ODKAZ = { href: '#/nastaveni', karta: 'extension', text: tr('Nastavit rozšíření') };
const WEB_RADA = tr('Webovou verzi v Chromu sleduje rozšíření Agenteeq.');

// Aplikace, které na tento Mac konverzace neukládají. U každé je důvod – ověřený, ne odhadnutý –
// a co s tím jde udělat. Tohle je text, který uživatel uvidí místo prázdna.
export const BEZ_PREPISU = {
  chatgpt: {
    duvod: tr('Aplikace ChatGPT si konverzace na {0} neukládá.', tentoPocitac()),
    rada: tr('ChatGPT v Chromu sleduje rozšíření Agenteeq. Vlákna Codexu se sledují samostatně.'),
    odkaz: ROZSIRENI_ODKAZ,
  },
  'claude-desktop': {
    duvod: tr('Z Claude Desktopu se sleduje záložka Code. Běžné chaty se nečtou.'),
    rada: tr('Chaty na claude.ai v Chromu sleduje rozšíření Agenteeq.'),
    odkaz: ROZSIRENI_ODKAZ,
  },
  'ms-copilot': {
    duvod: tr('Aplikace Microsoft Copilot si konverzace neukládá v čitelné podobě.'),
    rada: WEB_RADA,
    odkaz: ROZSIRENI_ODKAZ,
  },
  perplexity: {
    duvod: tr('Aplikace Perplexity konverzace na disk neukládá.'),
    rada: WEB_RADA,
    odkaz: ROZSIRENI_ODKAZ,
  },
  grok: {
    duvod: tr('Aplikace Grok konverzace na disk neukládá.'),
    rada: WEB_RADA,
    odkaz: ROZSIRENI_ODKAZ,
  },
  warp: {
    duvod: tr('Dotazy na agenta ve Warpu se nečtou. Sleduje se, že běží a jak dlouho.'),
    rada: MOJE_RADA,
    odkaz: MOJE_ODKAZ,
  },
  ...Object.fromEntries(['cursor-agent', 'windsurf', 'antigravity', 'kiro', 'trae', 'zed', 'aider', 'goose', 'opencode', 'amp', 'crush', 'droid', 'auggie']
    .map((id) => [id, { duvod: NECTE_ZATIM, rada: MOJE_RADA, odkaz: MOJE_ODKAZ }])),
  ...Object.fromEntries(['comet', 'chatgpt-atlas', 'dia']
    .map((id) => [id, { duvod: tr('Konverzace v tomto prohlížeči se nečtou. Sleduje se, že běží a jak dlouho.'), rada: MOJE_RADA, odkaz: MOJE_ODKAZ }])),
  // Webové aplikace spuštěné jako samostatné okno prohlížeče. Rozšíření Agenteeq pracuje v běžných
  // záložkách Chromu, ne v těchto oknech – proto u služeb, které rozšíření umí, radíme záložku.
  ...Object.fromEntries(['pwa-chatgpt', 'pwa-claude', 'pwa-gemini', 'pwa-perplexity', 'pwa-grok', 'pwa-copilot']
    .map((id) => [id, { duvod: WEB_OKNO, rada: tr('V běžné záložce Chromu službu sleduje rozšíření Agenteeq.'), odkaz: ROZSIRENI_ODKAZ }])),
  ...Object.fromEntries(['pwa-google-ai-studio', 'pwa-notebooklm', 'pwa-stitch', 'pwa-deepseek', 'pwa-replit', 'pwa-lovable', 'pwa-v0', 'pwa-bolt']
    .map((id) => [id, { duvod: WEB_OKNO, rada: MOJE_RADA, odkaz: MOJE_ODKAZ }])),
};

export const bezPrepisu = (id, sessions = []) => Boolean(BEZ_PREPISU[id]) && !(id === 'claude-desktop' && sessions.some((s) => s.connector === 'claude-desktop-code' || (s.connector === 'claude-code' && s.app?.includes('Claude Desktop'))));
