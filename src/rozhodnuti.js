// Rozhodnutí agenta přímo v Agenteeq (Claude Code, hook PermissionRequest).
//
// Claude Code se chystá zeptat na povolení nástroje a nejdřív pustí hook. Ten pošle žádost sem
// a čeká na odpověď: tady se objeví karta „Povolit / Zamítnout“. Rozhodnutí se vrátí hooku jako
// `hookSpecificOutput.decision` a Claude Code ho použije. Pravidlo deny v nastavení Claude Code
// platí dál – „allow“ z hooku ho nepřebije (dokumentace hooků).
//
// Bezpečná záloha: když tu nikdo nerozhodne (okno není vidět, funkce je vypnutá, čas vypršel,
// Agenteeq neběží), hook nevrátí nic a Claude Code se zeptá v terminálu jako vždycky. Agenteeq
// nikdy nic nezamítne sám od sebe a nic nepovolí bez kliknutí.
import crypto from 'node:crypto';
import { describeTool } from './connectors/claude-code.js';
import { clip } from './util.js';
import { ui } from './texty.js';

export const CEKAT_MS = 45_000;
const SESSION = /^[A-Za-z0-9_][\w-]{7,79}$/;

// Co přesně agent chce udělat – celý příkaz, ne zkratka. Schvaluje se to, co je tu vidět.
export function podrobnost(nastroj, vstup) {
  const i = vstup && typeof vstup === 'object' ? vstup : {};
  if (nastroj === 'Bash') return clip(i.command, 600);
  if (['Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(nastroj)) return clip(i.file_path || i.notebook_path, 300);
  if (nastroj === 'WebFetch') return clip(i.url, 300);
  if (nastroj === 'WebSearch') return clip(i.query, 300);
  return '';
}

// Zpráva pro model (ne pro rozhraní), proto anglicky jako ostatní texty, které Claude Code čte.
export function vystupRozhodnuti(akce) {
  const decision = akce === 'povolit'
    ? { behavior: 'allow' }
    : { behavior: 'deny', message: 'The user denied this action in Agenteeq.' };
  return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } };
}

// `zapnuto()` = nastavení, `videt()` = okno Agenteeq je teď vidět (src/detekce.js#videt).
export function createRozhodnuti({ emit = () => {}, zapnuto = () => true, videt = () => false, cekatMs = CEKAT_MS, now = Date.now } = {}) {
  const cekajici = new Map(); // id → { zaznam, resolve, casovac }

  const seznam = () => [...cekajici.values()].map((c) => c.zaznam).sort((a, b) => a.od - b.od);
  const oznam = () => emit(seznam());

  function uzavri(id, vysledek) {
    const c = cekajici.get(id);
    if (!c) return false;
    clearTimeout(c.casovac);
    cekajici.delete(id);
    c.resolve(vysledek);
    oznam();
    return true;
  }

  // Vrací Promise s výstupem pro hook, nebo null = bez rozhodnutí (Claude Code se zeptá v terminálu).
  function zadost(p) {
    if (!p || typeof p.session_id !== 'string' || !SESSION.test(p.session_id)) return Promise.resolve(null);
    if (p.hook_event_name !== 'PermissionRequest' || typeof p.tool_name !== 'string') return Promise.resolve(null);
    if (!zapnuto() || !videt()) return Promise.resolve(null);
    const id = crypto.randomBytes(9).toString('base64url');
    const zaznam = {
      id,
      sessionId: p.session_id,
      nastroj: clip(p.tool_name, 80),
      popis: describeTool(p.tool_name, p.tool_input),
      podrobnost: podrobnost(p.tool_name, p.tool_input),
      cwd: typeof p.cwd === 'string' ? clip(p.cwd, 300) : '',
      od: now(),
      do: now() + cekatMs,
    };
    return new Promise((resolve) => {
      const casovac = setTimeout(() => uzavri(id, null), cekatMs);
      cekajici.set(id, { zaznam, resolve, casovac });
      oznam();
    });
  }

  function rozhodni(id, akce) {
    if (!['povolit', 'zamitnout'].includes(akce)) return { status: 400, error: ui('Neznámé rozhodnutí.') };
    if (!uzavri(id, vystupRozhodnuti(akce))) {
      return { status: 410, error: ui('Na tuhle žádost už se čekat přestalo. Agent se zeptá v terminálu.') };
    }
    return { ok: true };
  }

  // Agent pokračoval (další nástroj, konec tahu): na žádost už se nečeká a karta zmizí.
  function vyrizeno(sessionId) {
    for (const [id, c] of cekajici) if (c.zaznam.sessionId === sessionId) uzavri(id, null);
  }

  function stop() {
    for (const id of [...cekajici.keys()]) uzavri(id, null);
  }

  return { zadost, rozhodni, vyrizeno, seznam, stop };
}
