// Jeden výběr agentů pro dashboard i souhrn Chrome extension.
// Podřízený agent je v seznamu zastoupen rodičem, pokud rodič existuje.
// Z opakované plánované úlohy je vidět jen poslední běh. Bez tohoto filtru
// rozšíření započítávalo tutéž práci víckrát než nativní aplikace.
export const taskKey = (s) => (s.taskName ? `${s.connector}:${s.taskName}` : '');

export function selectAgents(sessions) {
  const all = [...sessions];
  const ids = new Set(all.map((s) => s.id));
  const latest = new Map();
  for (const s of all) {
    const key = taskKey(s);
    if (key && (latest.get(key)?.lastAt ?? -1) < s.lastAt) latest.set(key, s);
  }
  return all.filter((s) => (!s.parentId || !ids.has(s.parentId))
    && (!taskKey(s) || latest.get(taskKey(s)) === s));
}
