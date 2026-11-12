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
  let look = 'obloha';
  try {
    if (localStorage.getItem('agenteeq.look') === 'koncert') look = 'koncert';
  } catch { /* výchozí rodina je Obloha */ }
  document.documentElement.dataset.look = look;
  document.documentElement.dataset.appearance = preference;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // Ruční obnova přenačítá stránku: závoj musí svítit už od prvního vykreslení, jinak by aplikace
  // mezi starou a novou stránkou probleskla (public/js/app.js#navazNaObnovu).
  try {
    if (sessionStorage.getItem('agenteeq.obnova')) document.documentElement.dataset.obnova = '1';
  } catch { /* bez úložiště bez závoje při startu */ }
})();
