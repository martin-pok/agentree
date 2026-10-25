// Pořadí skupin v „Právě teď“ na Přehledu (docs/DESIGN.md → Pořadí agentů, závazné).
// Bez DOM, kvůli testu test/prave-ted-poradi.test.mjs.
export function poradiPraveTed({ working = [], needs = [], failed = [], limited = [], hotovo = [], pripraveni = [], zacatek = (s) => s.startedAt || 0 }) {
  const podleCasu = (a, b) => (b.lastAt || 0) - (a.lastAt || 0);
  return [
    ...[...working].sort((a, b) => zacatek(b) - zacatek(a)),
    ...needs,
    ...[...failed].sort(podleCasu),
    ...[...limited].sort(podleCasu),
    ...hotovo,
    ...pripraveni,
  ];
}
