// Sleduje stránku AI aplikace a posílá změny (generuje / hotovo / nová zpráva) do background workeru.
// Posílá jen stav a počty – text zpráv ani název konverzace stránku neopustí (docs/ACCOUNTS.md).
(() => {
  const adapter = window.AgenteeqSites?.detect(location);
  if (!adapter) return;

  let lastSig = '';
  let lastSentAt = 0;
  let timer = null;
  let dead = false;

  // Délka poslední zprávy slouží jen tady k poznání, že se odpověď ještě píše. Neodesílá se.
  let posledniDelka = 0;
  // Pro ověření v okně rozšíření: viděli jsme na téhle stránce, že agent pracoval a pak skončil?
  // Jednorázový pohled do stránky to nepozná, přechod ano.
  const videl = { generovani: false, konec: false };
  function collect() {
    const zpravy = adapter.messages(document);
    posledniDelka = zpravy.length ? zpravy[zpravy.length - 1].text.length : 0;
    const generating = adapter.generating(document);
    if (generating) videl.generovani = true;
    else if (videl.generovani) videl.konec = true;
    return {
      site: adapter.id,
      conversationId: String(adapter.conversationId(location)).slice(0, 200).replace(/[^\w.:-]/g, '-'),
      url: location.href,
      generating,
      counts: { user: zpravy.filter((m) => m.role === 'user').length, assistant: zpravy.filter((m) => m.role === 'assistant').length },
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
    if (!payload.counts.user && !payload.counts.assistant && !payload.generating) return;
    const sig = JSON.stringify([payload.conversationId, payload.generating, payload.counts, posledniDelka, payload.limit]);
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

  // Okno rozšíření se ptá, co adaptér na stránce našel (diagnostika), nebo si bere anonymizovaný
  // vzorek stránky. Obojí je bez textu ze stránky – viz AgenteeqSites.diagnose a .vzorek.
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, odpovez) => {
      try {
        if (msg?.type === 'agenteeq:diagnostika') {
          collect();
          odpovez({ ...window.AgenteeqSites.diagnose(adapter, document, location), videl: { ...videl } });
        } else if (msg?.type === 'agenteeq:vzorek') {
          odpovez(window.AgenteeqSites.vzorek(document, location));
        }
      } catch {
        odpovez(null);
      }
    });
  } catch {
    // rozšíření bylo znovu načteno – okno se na tuhle stránku nedoptá, jinak nic nechybí
  }

  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  handoff();
  setInterval(schedule, 5000);
  window.addEventListener('popstate', schedule);
  schedule();
})();
