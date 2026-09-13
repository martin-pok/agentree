// Které aplikace umí Agenteeq číst a které ne — na jednom místě, ať se nikdy nestane, že nějaká
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

// Aplikace, které na tento Mac konverzace neukládají. U každé je důvod — ověřený, ne odhadnutý —
// a co s tím jde udělat. Tohle je text, který uživatel uvidí místo prázdna.
export const BEZ_PREPISU = {
  chatgpt: {
    duvod: 'Aplikace ChatGPT konverzace na tento Mac neukládá — ani ty, kde agent pracuje s postupem a zdroji. Ověřeno 13. 9. 2026 za běhu takové úlohy: složka aplikace nezapsala za 40 minut jediný soubor, v datech Codexu se změnily jen cookies a mezipaměť sítě a text konverzace není nikde na disku.',
    rada: 'Chceš je vidět? Otevři ChatGPT v prohlížeči a zapni rozšíření Agenteeq. Kódovací vlákna spuštěná jako samostatný Codex se sledují normálně.',
    odkaz: { href: '#/nastaveni', text: 'Nastavit rozšíření' },
  },
  'claude-desktop': {
    duvod: 'Aplikace Claude si chaty drží na serveru, ne na disku. Sezení Claude Code spuštěná z ní se ale čtou úplně normálně — ověřeno: 82 z 83 sezení desktopové aplikace má přepis na tomto Macu.',
    rada: 'Chaty z aplikace Claude uvidíš přes rozšíření Agenteeq v prohlížeči na claude.ai.',
    odkaz: { href: '#/nastaveni', text: 'Nastavit rozšíření' },
  },
  'ms-copilot': {
    duvod: 'Desktopová aplikace Microsoft Copilot nemá konverzace v čitelném formátu na disku.',
    rada: 'V prohlížeči s rozšířením Agenteeq se sleduje.',
    odkaz: { href: '#/nastaveni', text: 'Nastavit rozšíření' },
  },
  perplexity: {
    duvod: 'Aplikace Perplexity konverzace na disk neukládá.',
    rada: 'V prohlížeči s rozšířením Agenteeq se sleduje.',
    odkaz: { href: '#/nastaveni', text: 'Nastavit rozšíření' },
  },
  grok: {
    duvod: 'Aplikace Grok konverzace na disk neukládá.',
    rada: 'V prohlížeči s rozšířením Agenteeq se sleduje.',
    odkaz: { href: '#/nastaveni', text: 'Nastavit rozšíření' },
  },
};

export const bezPrepisu = (id) => Boolean(BEZ_PREPISU[id]);
