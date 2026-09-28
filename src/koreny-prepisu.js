// Složky, ze kterých jeden konektor čte přepisy.
//
// Nástroj je nemusí mít jen na výchozím místě: Claude Code poslechne CLAUDE_CONFIG_DIR, Codex
// CODEX_HOME. Aplikace spuštěná z Finderu ty proměnné nevidí (má je jen shell uživatele), prozradí
// je až běžící proces agenta nebo hook. Kořen se proto dá přidat i za běhu – hned se začne sledovat
// a projde se. Přehlédnutý kořen by znamenal přehlédnutého agenta, a to je pro Agenteeq nejhorší chyba.
import path from 'node:path';
import { watchTree, depthOf } from './watch.js';
import { statSafe } from './util.js';

/**
 * `zmena(koren, soubor)` dostane změněný soubor, nebo `soubor = null`, když je potřeba projít
 * celý kořen (sledování právě začalo nebo se obnovilo).
 */
// Kořeny přidává i hook (cesta k přepisu) a běžící proces. Každý znamená další sledování složky,
// proto má jejich počet strop – ani nesmyslné nebo podvržené cesty nevyčerpají sledování souborů.
export const MAX_KORENU = 24;

export function createKorenyPrepisu(vychozi, { zmena, max = MAX_KORENU, domov = '' }) {
  const koreny = new Map(); // absolutní cesta → watcher | null
  let sleduje = false;
  // Kořen, který ještě neexistuje, převezme sledování hned po vzniku (strážce nad rodičem, src/watch.js).
  const sleduj = (koren) => watchTree(koren, (soubor) => zmena(koren, soubor), { hlidatVznik: true, bezStrazce: [domov] });

  function pridej(cesta) {
    if (typeof cesta !== 'string' || !cesta) return false;
    const koren = path.resolve(cesta);
    if (koreny.has(koren) || koreny.size >= max) return false;
    koreny.set(koren, sleduje ? sleduj(koren) : null);
    return true;
  }
  for (const k of vychozi) pridej(k);

  return {
    pridej,
    seznam: () => [...koreny.keys()],
    /** Kořen, pod kterým soubor leží, a jeho hloubka v něm; `null`, když pod žádným. */
    najdi(soubor) {
      for (const koren of koreny.keys()) {
        const hloubka = depthOf(koren, soubor);
        if (hloubka >= 0) return { koren, hloubka };
      }
      return null;
    },
    async existujici() {
      const out = [];
      for (const koren of koreny.keys()) if ((await statSafe(koren))?.isDirectory()) out.push(koren);
      return out;
    },
    start() {
      sleduje = true;
      for (const [koren, w] of koreny) if (!w) koreny.set(koren, sleduj(koren));
    },
    stop() {
      sleduje = false;
      for (const [koren, w] of koreny) {
        w?.close();
        koreny.set(koren, null);
      }
    },
    sleduje: () => sleduje && [...koreny.values()].some((w) => w?.active),
  };
}

// „~/…“ v proměnné prostředí rozbalí shell, ale proměnná vyčtená z procesu nebo nastavená v launchd
// může přijít i doslova. Relativní cestu Agenteeq nehádá – bez znalosti složky procesu nic neznamená.
export function rozbalCestu(cesta, home) {
  if (typeof cesta !== 'string' || !cesta.trim()) return '';
  const c = cesta.trim();
  if (c === '~') return home;
  if (c.startsWith('~/')) return path.join(home, c.slice(2));
  return path.isAbsolute(c) ? path.normalize(c) : '';
}
