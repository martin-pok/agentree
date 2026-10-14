// Hodně agentů najednou pro QA skripty (qa-contrast, qa-tvary). S jednou konverzací se nikdy
// nevykreslí místa, která vznikají až při větším počtu: odkaz pod časovou osou (víc než 7 řádků)
// a kapsle „Dalších … agentů“ pod kartami Právě teď (víc než 12 živých agentů). Tam se pravidla
// tvarů porušila, aniž by si toho CI všimlo.
import { touch, addTokens, pushEntry } from '../src/model.js';

export const MNOHO_AGENTU = 16;

// Dlouhý název ověří i zkrácení na hranici slova (src/util.js#clipSlova) v kartách a na ose.
const DLOUHY = 'Kompletní redesign klientského portálu včetně navigace, mobilního menu, přístupnosti a všech formulářů pro objednávky a reklamace';

/** Přidá do storu `pocet` konverzací, které čekají na zadání a za posledních 12 h pracovaly. */
export function pridejMnohoAgentu(store, pocet = MNOHO_AGENTU, now = Date.now()) {
  for (let i = 0; i < pocet; i++) {
    const s = store.ensure({ connector: 'codex', localId: `qa-mnoho-${i}`, provider: 'openai', app: 'Codex' });
    s.title = i === 0 ? DLOUHY : `Úprava webu č. ${i + 1}`;
    s.turns = 1;
    const posledni = now - (i + 1) * 4 * 60e3;
    for (let h = 0; h < 3; h++) touch(s, posledni - h * 3600e3);
    addTokens(s, posledni, { input: 1200, output: 300 });
    pushEntry(s, { at: posledni, role: 'assistant', text: 'Hotovo.' });
    store.commit(s);
  }
}
