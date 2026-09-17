// Sleduje stránku AI aplikace a posílá změny (generuje / hotovo / nová zpráva) do background workeru.
(() => {
  const adapter = window.AgenteeqSites?.detect(location);
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
      chrome.runtime.sendMessage({ type: 'agenteeq:update', payload }).catch(() => {});
    } catch {
      dead = true; // rozšíření bylo znovu načteno – tento skript už nemá spojení
    }
  }

  const schedule = () => {
    if (!timer) timer = setTimeout(tick, 400);
  };

  // Zadání spuštěné z Agenteeq: vyzvednout, počkat, až se objeví pole zprávy, a vložit ho.
  // Neodesílá se – to potvrdí uživatel. Když služba zadání převzala sama z adresy (?q=) nebo
  // stránka už konverzaci má, nic se nevkládá, aby se text nezdvojil.
  function handoff() {
    let asked;
    try {
      asked = chrome.runtime.sendMessage({ type: 'agenteeq:handoff', site: adapter.id });
    } catch {
      return;
    }
    Promise.resolve(asked).then((r) => {
      const prompt = r && typeof r.prompt === 'string' ? r.prompt : '';
      if (!prompt) return;
      const { insertPrompt, composerText } = window.AgenteeqSites;
      const until = Date.now() + 20000;
      const attempt = () => {
        const el = adapter.composer(document);
        if (el) {
          if (composerText(el).trim() || adapter.messages(document).length) return;
          if (insertPrompt(el, prompt)) return;
        }
        if (Date.now() < until) setTimeout(attempt, 250);
      };
      setTimeout(attempt, r.prefilled ? 2000 : 400);
    }).catch(() => {});
  }

  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  handoff();
  setInterval(schedule, 5000);
  window.addEventListener('popstate', schedule);
  schedule();
})();
