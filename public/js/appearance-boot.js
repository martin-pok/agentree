// Musí běžet před CSS: lokální kopie preference zabrání záblesku světlého vzhledu.
(() => {
  const key = 'agenteeq.appearance';
  const valid = new Set(['light', 'dark', 'system']);
  let preference = 'light';
  try {
    const stored = localStorage.getItem(key);
    if (valid.has(stored)) preference = stored;
  } catch { /* soukromé okno nebo zakázané úložiště – výchozí je světlý vzhled */ }
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.appearance = preference;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
