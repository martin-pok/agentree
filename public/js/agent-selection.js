// Jeden výběr agentů pro dashboard i souhrn Chrome extension.
// Podřízený agent je v seznamu zastoupen rodičem, pokud rodič existuje.
// Z opakované plánované úlohy je vidět jen poslední běh. Bez tohoto filtru
// rozšíření započítávalo tutéž práci víckrát než nativní aplikace.
export const taskKey = (s) => (s.taskName ? `${s.connector}:${s.taskName}` : '');

// Stavy, které po uživateli něco chtějí, od nejnaléhavějšího. Skrytý podřízený agent, který čeká
// na rozhodnutí, selhal nebo narazil na limit, je vidět na svém rodiči: jinak by ho nezapočítal
// přehled, rozšíření ani odznak v Docku. Rodič, který sám pozornost žádá, svůj stav drží.
const POZORNOST = ['needs_input', 'failed', 'limited'];

export function selectAgents(sessions) {
  const all = [...sessions];
  const ids = new Set(all.map((s) => s.id));
  const latest = new Map();
  const odDeti = new Map(); // id rodiče → podřízený s nejnaléhavějším stavem
  for (const s of all) {
    const key = taskKey(s);
    if (key && (latest.get(key)?.lastAt ?? -1) < s.lastAt) latest.set(key, s);
    const rank = POZORNOST.indexOf(s.status);
    if (s.parentId && ids.has(s.parentId) && rank >= 0) {
      const dosud = odDeti.get(s.parentId);
      if (!dosud || rank < POZORNOST.indexOf(dosud.status)) odDeti.set(s.parentId, s);
    }
  }
  return all.filter((s) => (!s.parentId || !ids.has(s.parentId))
    && (!taskKey(s) || latest.get(taskKey(s)) === s))
    .map((s) => {
      const dite = odDeti.get(s.id);
      if (!dite || POZORNOST.includes(s.status)) return s;
      return { ...s, status: dite.status, reason: dite.reason, stale: Boolean(dite.stale), done: false, activity: '', pozornostOd: dite.id };
    });
}

// Číslo na liště macOS. Počítá se z téhož výběru jako přehled a rozšíření (podřízený agent ani
// starší běh plánované úlohy se nepočítá dvakrát). `nejiste` = agenti, kteří podle posledních
// známých dat pracovali, ale čerstvý stav chybí (`stale`) – typicky vzdálený Claude Code, když
// Claude Desktop seznam relací delší dobu nenačetl. Takové agenty nelze vydávat za „0 pracuje“.
export function pocetProListu(sessions) {
  const vybrani = selectAgents(sessions);
  return {
    pracuje: vybrani.filter((s) => s.status === 'working').length,
    nejiste: vybrani.filter((s) => s.status === 'waiting' && s.stale).length,
  };
}
