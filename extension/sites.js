// Adaptéry webových AI aplikací. Selektory se mění s redesignem služeb — generické zálohy drží základní funkci.
(() => {
  const text = (el) => (el ? (el.innerText || el.textContent || '').replace(/\n{3,}/g, '\n\n').trim() : '');
  const all = (doc, sel) => Array.from(doc.querySelectorAll(sel));
  const idFrom = (loc, re) => (loc.pathname.match(re) || [])[1] || null;

  function tabId() {
    try {
      let id = sessionStorage.getItem('agenteeq-tab');
      if (!id) {
        id = `tab-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem('agenteeq-tab', id);
      }
      return id;
    } catch {
      return 'tab-unknown';
    }
  }

  const stopButton = (doc) =>
    doc.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop" i], button[aria-label*="Zastavit" i], button[aria-label*="Přestat" i], button[aria-label*="Cancel generating" i]');

  const cleanTitle = (t, patterns) => patterns.reduce((s, re) => s.replace(re, ''), String(t || '')).trim();

  // Zpráva = nejhlubší prvek, jehož atributy nebo třída prozrazují roli.
  function genericMessages(doc) {
    const candidates = all(doc, '[data-message-author-role], [data-role], [data-author], [data-testid*="message" i], [class*="message" i], [class*="query" i], [class*="answer" i]');
    const out = [];
    for (const el of candidates) {
      if (candidates.some((other) => other !== el && el.contains(other))) continue;
      const sig = `${el.getAttribute('data-message-author-role') || ''} ${el.getAttribute('data-role') || ''} ${el.getAttribute('data-author') || ''} ${el.getAttribute('data-testid') || ''} ${el.className || ''}`.toLowerCase();
      const role = /user|human|query|question|prompt/.test(sig) ? 'user' : /assistant|bot|\bai\b|answer|response|model/.test(sig) ? 'assistant' : null;
      const t = text(el);
      if (role && t) out.push({ role, text: t });
    }
    return out;
  }

  function limitNotice(doc) {
    const el = all(doc, '[role="alert"], [data-testid*="limit" i], [class*="limit" i]').find((e) => /(limit|reached|dosažen|vyčerpán|upgrade)/i.test(text(e)));
    return el ? text(el).slice(0, 200) : null;
  }

  const SITES = [
    {
      id: 'chatgpt',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      conversationId: (loc) => idFrom(loc, /\/c\/([\w-]+)/) || tabId(),
      messages: (doc) => all(doc, '[data-message-author-role]')
        .map((el) => ({ role: el.getAttribute('data-message-author-role'), text: text(el) }))
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text),
      generating: (doc) => Boolean(doc.querySelector('[data-testid="stop-button"]')) || Boolean(stopButton(doc)),
      title: (doc) => cleanTitle(doc.title, [/^ChatGPT\s*[-–|]\s*/i, /\s*[-–|]\s*ChatGPT$/i]),
      model: (doc) => text(doc.querySelector('[data-testid="model-switcher-dropdown-button"]')).slice(0, 60),
    },
    {
      id: 'claude',
      hosts: ['claude.ai'],
      conversationId: (loc) => idFrom(loc, /\/chat\/([\w-]+)/) || tabId(),
      messages: (doc) => all(doc, '[data-testid="user-message"], [data-is-streaming]')
        .map((el) => ({ role: el.matches('[data-testid="user-message"]') ? 'user' : 'assistant', text: text(el) }))
        .filter((m) => m.text),
      generating: (doc) => Boolean(doc.querySelector('[data-is-streaming="true"]')) || Boolean(stopButton(doc)),
      title: (doc) => cleanTitle(doc.title, [/\s*[-–|]\s*Claude$/i]),
    },
    {
      id: 'gemini',
      hosts: ['gemini.google.com'],
      conversationId: (loc) => idFrom(loc, /\/app\/([\w-]+)/) || tabId(),
      messages: (doc) => all(doc, 'user-query, model-response')
        .map((el) => ({ role: el.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant', text: text(el.querySelector('.query-text, message-content') || el) }))
        .filter((m) => m.text),
      generating: (doc) => Boolean(stopButton(doc)),
      title: (doc) => cleanTitle(doc.title, [/^Gemini\s*[-–|]?\s*/i]),
    },
    { id: 'mscopilot', hosts: ['copilot.microsoft.com'], conversationId: (loc) => idFrom(loc, /\/chats\/([\w-]+)/) || tabId() },
    { id: 'perplexity', hosts: ['www.perplexity.ai', 'perplexity.ai'], conversationId: (loc) => idFrom(loc, /\/search\/([\w.-]+)/) || tabId() },
    { id: 'grok', hosts: ['grok.com'], conversationId: (loc) => idFrom(loc, /\/(?:c|chat)\/([\w-]+)/) || tabId() },
    { id: 'qwen', hosts: ['chat.qwen.ai'], conversationId: (loc) => idFrom(loc, /\/c\/([\w-]+)/) || tabId() },
    { id: 'github-copilot', hosts: ['github.com'], path: /^\/copilot/, conversationId: (loc) => idFrom(loc, /\/copilot\/c\/([\w-]+)/) || tabId() },
  ].map((s) => ({
    messages: genericMessages,
    generating: (doc) => Boolean(stopButton(doc)),
    title: (doc) => String(doc.title || '').trim(),
    model: () => '',
    limit: limitNotice,
    ...s,
  }));

  window.AgenteeqSites = {
    SITES,
    detect(loc) {
      return SITES.find((s) => s.hosts.includes(loc.hostname) && (!s.path || s.path.test(loc.pathname))) || null;
    },
  };
})();
