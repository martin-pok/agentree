// Hromadné akce se vztahují jen na skutečné konverzace s checkboxem. Detekované procesy jsou
// kontextové záznamy bez session ID určeného k zařazení do projektu.
export function selectableSessions(sessions) {
  return sessions.filter((session) => !session.proces);
}

export function pruneSelection(selected, sessions) {
  const selectableIds = new Set(selectableSessions(sessions).map((session) => session.id));
  for (const id of selected) if (!selectableIds.has(id)) selected.delete(id);
}

export function selectionOutsideVisible(selected, visible) {
  const visibleIds = new Set(selectableSessions(visible).map((session) => session.id));
  return [...selected].filter((id) => !visibleIds.has(id)).length;
}
