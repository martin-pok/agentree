// Sleduje stránku AI aplikace a posílá změny (generuje / hotovo / nová zpráva) do background workeru.
(() => {
  const adapter = window.DirigentSites?.detect(location);
  if (!adapter) return;

  let lastSig = '';
  let lastSentAt = 0;
  let timer = null;
  let dead = false;

  function collect() {
    const messages = adapter.messages(document).slice(-60).map((m) => ({ role: m.role, text: m.text.slice(0, 8000) }));
    return {
      site: adapter.id,
      conversationId: String(adapter.conversationId(location)).slice(0, 200).replace(/[^\w.:-]/g, '-'),
      url: location.href,
      title: adapter.title(document).slice(0, 120),
      generating: adapter.generating(document),
      messages,
      model: adapter.model(document) || '',
      limit: adapter.limit(document),
    };
  }

  function tick() {
    timer = null;
    if (dead) return;
    let payload;
    try {
      payload = collect();
    } catch {
      return;
    }
    if (!payload.messages.length && !payload.generating) return;
    const last = payload.messages[payload.messages.length - 1];
    const sig = JSON.stringify([payload.conversationId, payload.generating, payload.messages.length, last?.text.length, payload.limit, payload.title]);
    const now = Date.now();
    // Během generování posílat i heartbeat, aby server věděl, že agent stále pracuje.
    if (sig === lastSig && !(payload.generating && now - lastSentAt > 10000)) return;
    lastSig = sig;
    lastSentAt = now;
    try {
      chrome.runtime.sendMessage({ type: 'dirigent:update', payload }).catch(() => {});
    } catch {
      dead = true; // rozšíření bylo znovu načteno — tento skript už nemá spojení
    }
  }

  const schedule = () => {
    if (!timer) timer = setTimeout(tick, 400);
  };

  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  setInterval(schedule, 5000);
  window.addEventListener('popstate', schedule);
  schedule();
})();
