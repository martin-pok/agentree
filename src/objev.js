// Objevování nástrojů: co z katalogu AI nástrojů (src/connectors/processes.js#RUNTIMES) na tomhle
// počítači je. Z toho staví rozhraní okno „Našli jsme na tvém Macu“ (public/js/objev-ui.js), kde
// člověk každé napojení nejdřív potvrdí na obrazovce s tím, co Agenteeq uvidí a co ne.
//
// Nalezeno znamená jen ověřený fakt: proces právě běží, aplikace leží ve složce Aplikace, program
// je v PATH, nebo tu nástroj někdy běžel (src/detekce.js). Neověřené hledání (jiný systém, programy
// se ještě nehledaly) nic nenajde – a okno to řekne, místo aby tvrdilo, že tu nic není.
import { RUNTIMES } from './connectors/processes.js';
import { AGENTI, WEBY } from './napojeni.js';

// Název balíčku v /Applications podle stejných jmen, podle kterých se nástroj pozná ve výpisu procesů.
export const APLIKACE = {
  'claude-desktop': ['Claude'],
  chatgpt: ['ChatGPT'],
  'codex-app': ['Codex'],
  vscode: ['Visual Studio Code', 'Visual Studio Code - Insiders'],
  cursor: ['Cursor'],
  windsurf: ['Windsurf'],
  antigravity: ['Antigravity'],
  kiro: ['Kiro'],
  trae: ['Trae'],
  zed: ['Zed'],
  warp: ['Warp'],
  'ms-copilot': ['Copilot', 'Microsoft Copilot'],
  perplexity: ['Perplexity'],
  comet: ['Comet'],
  'chatgpt-atlas': ['ChatGPT Atlas'],
  dia: ['Dia'],
  grok: ['Grok'],
  ollama: ['Ollama'],
  lmstudio: ['LM Studio'],
};

// Příkaz v PATH (src/launcher.js#PROGRAMY). Jen jména, která jiný běžný program nenosí.
export const PROGRAMY = {
  'claude-code': 'claude',
  codex: 'codex',
  'gemini-cli': 'gemini',
  'qwen-code': 'qwen',
  'copilot-cli': 'copilot',
  'cursor-agent': 'cursor-agent',
  aider: 'aider',
  opencode: 'opencode',
  auggie: 'auggie',
};

// Webové aplikace Chromu (`pwa-chatgpt`…) čte rozšíření z téže služby v záložce.
const WEB_PRO = { 'pwa-chatgpt': 'chatgpt', 'pwa-claude': 'claude', 'pwa-gemini': 'gemini', 'pwa-google-ai-studio': 'google-ai-studio', 'pwa-perplexity': 'perplexity', 'pwa-grok': 'grok', 'pwa-copilot': 'mscopilot', perplexity: 'perplexity', grok: 'grok', 'ms-copilot': 'mscopilot', comet: 'perplexity' };

// Jak se nástroj napojí: přihlášením u dodavatele (CLI agent s napojením tlačítkem), sledováním
// jeho záznamů na tomto počítači, přes rozšíření pro Chrome, nebo jen sledováním, kdy běží.
export function cestaNapojeni(k) {
  if (AGENTI[k.id]) return 'prihlaseni';
  if ((k.konektory || []).length) return 'zaznamy';
  if (WEB_PRO[k.id]) return 'rozsireni';
  return 'beh';
}

// `bins()` = mapa nalezených programů, nebo null (nehledalo se). `app(jmena)` = true/false, nebo
// null (na tomhle systému se aplikace nehledají). `zaznamy` = datastore.data.nastroje.
export function nalezeneNastroje({ runtimes = [], zaznamy = {}, bins = () => null, app = () => null, napojeni = [], pripojene = new Set(), webStav = 'missing' } = {}) {
  const nalezene = bins();
  const podleNapojeni = new Map(napojeni.map((n) => [n.id, n]));
  let hledano = nalezene !== null;
  const out = [];
  for (const k of RUNTIMES) {
    const r = runtimes.find((x) => x.id === k.id);
    const z = zaznamy[k.id];
    const jmena = APLIKACE[k.id];
    const naDisku = jmena ? app(jmena) : null;
    if (jmena && naDisku !== null) hledano = true;
    const program = PROGRAMY[k.id] && nalezene ? Boolean(nalezene[PROGRAMY[k.id]]) : false;
    const kde = r?.running ? 'bezi' : naDisku === true ? 'aplikace' : program ? 'program' : z ? 'drive' : null;
    if (!kde) continue;
    const cesta = cestaNapojeni(k);
    const n = podleNapojeni.get(k.id);
    const sledovano = (k.konektory || []).some((id) => pripojene.has(id));
    // Napojeno = ověřené: přihlášení CLI potvrzené nástrojem, konektor s daty, rozhodnutí
    // „sledovat“ v Mých nástrojích, nebo spárované rozšíření pro webovou službu (`webStav` z app.extensionStatus: missing = nespárované).
    const napojeno = cesta === 'prihlaseni' ? n?.napojeno ?? null
      : cesta === 'rozsireni' ? webStav !== 'missing'
        : sledovano || z?.stav === 'pridany';
    out.push({
      id: k.id, name: k.name, provider: k.provider, druh: k.druh, popis: k.popis || '', vidim: k.vidim || '',
      overeno: Boolean(k.overeno), kde, cesta, napojeno, sledovano,
      ignorovano: z?.stav === 'ignorovany',
      ...(cesta === 'prihlaseni' ? { napojeniId: k.id, nainstalovano: n?.nainstalovano ?? null } : {}),
      ...(cesta === 'rozsireni' ? { web: WEB_PRO[k.id], webLabel: WEBY[WEB_PRO[k.id]]?.label || '' } : {}),
    });
  }
  // Běžící a ověřené napřed; pořadí katalogu jinak zůstává (hlavní nástroje jsou v něm vpředu).
  const vaha = { bezi: 0, aplikace: 1, program: 1, drive: 2 };
  out.sort((a, b) => vaha[a.kde] - vaha[b.kde] || Number(b.overeno) - Number(a.overeno));
  // Webové chaty v Chromu se nabízejí vždy: nejsou to nainstalované programy, ale služby v prohlížeči.
  return { nastroje: out, hledano, web: { sparovano: webStav !== 'missing', sluzby: Object.values(WEBY).map((w) => w.label) } };
}
