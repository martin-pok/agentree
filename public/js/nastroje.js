// Nástroje z katalogu detekce (src/connectors/processes.js#RUNTIMES) v rozhraní: jak se jmenuje
// jejich druh, jestli právě běží a které patří na Přehled. Čisté funkce bez DOM – stejný údaj
// počítá jedna funkce pro kartu detekce, Nastavení, Přehled i limity.
import { rel, timeHM } from './format.js';
import { tr, tentoPocitac, tomtoPocitaci } from './i18n.js';

// Kde nástroj pracuje – rychlá informace, kterou uživatel pochopí bez znalosti nástroje.
// Funkce, ne hotové texty: jazyk a jméno počítače se berou až při vykreslení.
const DRUH = {
  aplikace: () => tr('Aplikace na {0}', tomtoPocitaci()),
  terminal: () => tr('Agent v terminálu'),
  'terminal-aplikace': () => tr('Terminál s AI agentem'),
  editor: () => tr('Editor s AI'),
  prohlizec: () => tr('Prohlížeč s AI'),
  'webova-aplikace': () => tr('Webová aplikace v prohlížeči'),
  'lokalni-model': () => tr('Lokální model'),
};

export const druhNazev = (n) => (DRUH[n?.druh] || (() => tr('AI nástroj')))();

// Služba v Útratě, pod kterou se předplatné zapíše. Co v nabídce není, jde pod „Ostatní“ s názvem v poznámce.
const SLUZBA = {
  chatgpt: 'chatgpt', 'pwa-chatgpt': 'chatgpt', 'chatgpt-atlas': 'chatgpt', codex: 'chatgpt',
  'claude-desktop': 'claude', 'claude-code': 'claude', 'pwa-claude': 'claude',
  cursor: 'cursor', 'cursor-agent': 'cursor',
  'pwa-gemini': 'gemini', 'pwa-google-ai-studio': 'gemini', 'gemini-cli': 'gemini',
  perplexity: 'perplexity', 'pwa-perplexity': 'perplexity', comet: 'perplexity',
  grok: 'grok', 'pwa-grok': 'grok',
  'copilot-cli': 'copilot', vscode: 'copilot', 'ms-copilot': 'mscopilot', 'pwa-copilot': 'mscopilot',
  'qwen-code': 'qwen',
};

export const sluzbaUtraty = (id) => SLUZBA[id] || 'other';

export function predplatneHref(n) {
  const q = new URLSearchParams({ pridat: '1', sluzba: sluzbaUtraty(n.id), poznamka: n.name });
  return `#/utrata?${q}`;
}

// Záznam detekce se na serveru mění jen při rozhodnutí nebo novém nálezu. Jestli nástroj právě
// běží, se proto bere z živého seznamu procesů (událost `runtimes`), ne ze zapamatovaného záznamu.
export function zivy(n, runtimes) {
  const r = (runtimes || []).find((x) => x.id === n.id);
  if (!r) return n;
  return { ...n, bezi: Boolean(r.running), beziOd: r.running ? Number(r.od) || 0 : 0 };
}

// Kde a od kdy – jedna věta, pravdivá i pro nástroj, který už neběží.
export function kdeKdy(n, now = Date.now()) {
  const druh = druhNazev(n);
  if (n.bezi && n.beziOd) return `${druh} · ${tr('běží od {0}', timeHM(n.beziOd))}`;
  if (n.bezi) return `${druh} · ${tr('běží')}`;
  if (n.naposledy) return `${druh} · ${tr('naposledy běžel {0}', rel(n.naposledy, now))}`;
  return druh;
}

// Co o něm Agenteeq uvidí – jedna krátká věta. Tvrdí se jen to, co platí o Agenteeq, ne domněnky
// o cizím nástroji. Tři různé situace: čteme, umíme číst (jen tu zatím nic není), neumíme číst.
export function coVidim(n) {
  if (n.sledovano) return n.vidim || tr('Konverzace a tokeny, které zapisuje na {0}, už čtu.', tentoPocitac());
  if (n.umiCist) return tr('Konverzace přečtu, jakmile je uloží na {0}.', tentoPocitac());
  return tr('Uvidím, kdy běží. Konverzace a tokeny číst neumím.');
}

// Které nástroje z katalogu patří na Přehled: co právě běží, co si uživatel přidal do Mých nástrojů
// a co tu Agenteeq někdy viděl běžet. Katalog má přes 40 nástrojů; ukazovat neběžící nástroje,
// které člověk ani nemá, by bylo jen „neběží, neběží, neběží“. Podle zdroje dat se to rozhodnout
// nedá: Claude Code čte i konverzace ze záložky Code v Claude Desktop, ale kdo má jen Claude Code,
// nemá mít na Přehledu „Claude Desktop · neběží“. Co uživatel odmítl sledovat, se neukazuje.
export function pouzivaneNastroje(state) {
  const d = state.detekce || {};
  const znam = new Set([...(d.videne || []), ...(d.moje || []).map((n) => n.id)]);
  const odmitnute = new Set((d.ignorovane || []).map((n) => n.id));
  return (state.runtimes || []).filter((r) => !odmitnute.has(r.id) && (r.running || znam.has(r.id)));
}

// Nástroje z Mých nástrojů a čerstvě zachycené, o jejichž datech Agenteeq nic neví – v přehledu
// limitů musí být vidět taky, s poctivou poznámkou, co o nich víme. `pokryte` = konektory,
// které už mají v přehledu vlastní řádek.
export function nastrojeBezDat(state, pokryte, now = Date.now()) {
  const d = state.detekce || {};
  const byId = new Map((state.runtimes || []).map((r) => [r.id, r]));
  return [...(d.moje || []), ...(d.nove || [])]
    .filter((n) => !(byId.get(n.id)?.konektory || []).some((k) => pokryte.has(k)))
    .map((n) => zivy(n, state.runtimes));
}
