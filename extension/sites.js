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

  // Pole pro zprávu. Nejdřív přesný selektor služby, pak obecná záloha — redesign služby tak
  // vkládání nerozbije úplně. Skryté a zakázané prvky se přeskočí.
  const GENERIC_COMPOSER = 'textarea:not([readonly]):not([disabled]), [contenteditable="true"][role="textbox"], div[contenteditable="true"]';
  const visible = (el) => {
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return !r || (r.width > 0 && r.height > 0);
  };
  const composerFrom = (selector) => (doc) =>
    all(doc, selector).find((el) => !el.disabled && visible(el)) || all(doc, GENERIC_COMPOSER).find((el) => !el.disabled && visible(el)) || null;

  const isEditable = (el) => Boolean(el.isContentEditable || el.getAttribute?.('contenteditable') === 'true');
  const composerText = (el) => (isEditable(el) ? text(el) : String(el.value || ''));

  // Vloží zadání tak, jak by ho napsal člověk: editor služby (ProseMirror, Quill, React) se o změně
  // musí dozvědět, jinak zůstane tlačítko Odeslat neaktivní. Nic se neodesílá.
  function insertPrompt(el, value) {
    const doc = el.ownerDocument;
    const view = doc?.defaultView || globalThis;
    if (el.focus) el.focus();
    if (isEditable(el)) {
      let ok = false;
      try {
        const sel = view.getSelection ? view.getSelection() : null;
        if (sel && doc.createRange) {
          const range = doc.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        ok = Boolean(doc.execCommand && doc.execCommand('insertText', false, value));
      } catch {
        ok = false;
      }
      if (!ok || !text(el).trim()) {
        el.textContent = value;
        el.dispatchEvent(new view.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      }
    } else {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      el.dispatchEvent(new view.Event('input', { bubbles: true }));
    }
    return composerText(el).trim().length > 0;
  }

  function limitNotice(doc) {
    const el = all(doc, '[role="alert"], [data-testid*="limit" i], [class*="limit" i]').find((e) => /(limit|reached|dosažen|vyčerpán|upgrade)/i.test(text(e)));
    return el ? text(el).slice(0, 200) : null;
  }

  const SITES = [
    // Codex na webu běží na stejné doméně jako ChatGPT, ale je to jiný nástroj a patří do
    // Agenteeq zvlášť. Musí být v seznamu před ChatGPT, jinak by ho pohltil obecnější záznam.
    {
      id: 'codex-web',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      path: /^\/codex(\/|$)/,
      conversationId: (loc) => idFrom(loc, /\/codex\/(?:tasks|task|c)\/([\w-]+)/) || idFrom(loc, /\/codex\/([\w-]+)/) || tabId(),
      messages: (doc) => all(doc, '[data-message-author-role]')
        .map((el) => ({ role: el.getAttribute('data-message-author-role'), text: text(el) }))
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text),
      generating: (doc) => Boolean(doc.querySelector('[data-testid="stop-button"]')) || Boolean(stopButton(doc)),
      title: (doc) => cleanTitle(doc.title, [/^Codex\s*[-–|]\s*/i, /\s*[-–|]\s*Codex$/i, /\s*[-–|]\s*ChatGPT$/i]),
      composer: composerFrom('#prompt-textarea, textarea[name="prompt-textarea"]'),
    },
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
      composer: composerFrom('#prompt-textarea, textarea[name="prompt-textarea"]'),
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
      composer: composerFrom('div.ProseMirror[contenteditable="true"], [data-testid="chat-input"] [contenteditable="true"]'),
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
      composer: composerFrom('rich-textarea .ql-editor[contenteditable="true"], .ql-editor[contenteditable="true"]'),
    },
    { id: 'mscopilot', hosts: ['copilot.microsoft.com'], conversationId: (loc) => idFrom(loc, /\/chats\/([\w-]+)/) || tabId() },
    { id: 'perplexity', hosts: ['www.perplexity.ai', 'perplexity.ai'], conversationId: (loc) => idFrom(loc, /\/search\/([\w.-]+)/) || tabId(), composer: composerFrom('#ask-input, textarea') },
    { id: 'grok', hosts: ['grok.com'], conversationId: (loc) => idFrom(loc, /\/(?:c|chat)\/([\w-]+)/) || tabId() },
    { id: 'qwen', hosts: ['chat.qwen.ai'], conversationId: (loc) => idFrom(loc, /\/c\/([\w-]+)/) || tabId() },
    { id: 'github-copilot', hosts: ['github.com'], path: /^\/copilot/, conversationId: (loc) => idFrom(loc, /\/copilot\/c\/([\w-]+)/) || tabId() },
  ].map((s) => ({
    messages: genericMessages,
    generating: (doc) => Boolean(stopButton(doc)),
    title: (doc) => String(doc.title || '').trim(),
    model: () => '',
    limit: limitNotice,
    composer: composerFrom(GENERIC_COMPOSER),
    ...s,
  }));

  window.AgenteeqSites = {
    SITES,
    insertPrompt,
    composerText,
    detect(loc) {
      return SITES.find((s) => s.hosts.includes(loc.hostname) && (!s.path || s.path.test(loc.pathname))) || null;
    },
  };
})();
