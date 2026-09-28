// Systém počítače, na kterém Agenteeq běží. Server ho vepíše do <html data-system> už při vydání
// stránky (src/http.js podle src/platform.js#SYSTEM), takže rozhraní od prvního vykreslení ví,
// jestli psát „tento Mac“ a ⌘, nebo „tento počítač“ a Ctrl. Stejnou hodnotu nese i snímek stavu
// (`host.system`).
//
// Jde o počítač se serverem, ne o zařízení, na kterém se rozhraní zrovna prohlíží: spárovaný telefon
// ukazuje data z Macu, a proto o něm mluví jako o Macu. Klávesnici má v praxi jen okno aplikace na
// témže počítači, takže zkratky se řídí stejným údajem.
//
// Bez údaje (statická kopie rozhraní na webu, testy v Node) platí macOS – pro něj je Agenteeq dělaný
// a ukázka na webu pochází z Macu.

const SYSTEMY = ['macos', 'windows', 'linux'];
const zeStranky = globalThis.document?.documentElement?.dataset?.system;

export const SYSTEM = SYSTEMY.includes(zeStranky) ? zeStranky : 'macos';
export const JE_MAC = SYSTEM === 'macos';

/** Stisknutá klávesa pro zkratky: na Macu ⌘ (metaKey), jinde Ctrl (ctrlKey). */
export const modifikator = (e) => Boolean(JE_MAC ? e?.metaKey : e?.ctrlKey);

/** Značka modifikátoru na klávese (<kbd>): ⌘, nebo Ctrl. */
export const MOD = JE_MAC ? '⌘' : 'Ctrl';

/** Zkratka tak, jak ji uživatel na svém systému zná: ⌘K, nebo Ctrl+K. */
export const zkratka = (klavesa) => (JE_MAC ? `⌘${klavesa}` : `Ctrl+${klavesa}`);

/** Zkratka pro aria-keyshortcuts (WAI-ARIA): Meta+K, nebo Control+K. */
export const ariaZkratka = (klavesa) => `${JE_MAC ? 'Meta' : 'Control'}+${klavesa}`;
