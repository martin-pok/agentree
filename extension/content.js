// Sleduje stránku AI aplikace a posílá změny (generuje / hotovo / nová zpráva) do background workeru.
(() => {
  const adapter = window.AgentreeSites?.detect(location);
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
      chrome.runtime.sendMessage({ type: 'agentree:update', payload }).catch(() => {});
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

  function geminiPromptBox() {
    return document.querySelector('textarea[aria-label], rich-textarea [contenteditable="true"], div[contenteditable="true"][aria-label]');
  }

  function setPrompt(prompt) {
    if (adapter.id !== 'gemini' || typeof prompt !== 'string' || !prompt.trim()) return false;
    const box = geminiPromptBox();
    if (!box) return false;
    box.focus();
    if (box instanceof HTMLTextAreaElement || box instanceof HTMLInputElement) {
      const prototype = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(box, prompt);
    } else {
      box.textContent = prompt;
    }
    box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'agentree:inject-prompt') return;
    sendResponse({ ok: setPrompt(msg.prompt) });
  });

  // Žádný polling ani data z webu: ozveme se pouze při načtení Gemini, aby si
  // background mohl vyzvednout jeden krátce platný prompt z localhostu.
  if (adapter.id === 'gemini') {
    const handoffId = new URL(location.href).hash.match(/^#agentree-handoff=([0-9a-f-]{36})$/i)?.[1];
    if (handoffId) chrome.runtime.sendMessage({ type: 'agentree:ready', site: 'gemini', handoffId }).catch(() => {});
  }
})();
