// Adaptéry webových AI aplikací. Selektory se mění s redesignem služeb – generické zálohy drží základní funkci.
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

  // Pole pro zprávu. Nejdřív přesný selektor služby, pak obecná záloha – redesign služby tak
  // vkládání nerozbije úplně. Skryté a zakázané prvky se přeskočí.
  const GENERIC_COMPOSER = 'textarea:not([readonly]):not([disabled]), [contenteditable="true"][role="textbox"], div[contenteditable="true"]';
  const visible = (el) => {
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return !r || (r.width > 0 && r.height > 0);
  };
  const pouzitelne = (doc, selector) => all(doc, selector).find((el) => !el.disabled && visible(el)) || null;
  const composerFrom = (selector) => (doc) => pouzitelne(doc, selector) || pouzitelne(doc, GENERIC_COMPOSER);

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

  const LIMIT_PRVKY = '[role="alert"], [data-testid*="limit" i], [class*="limit" i]';
  const LIMIT_SLOVA = /limit|reached|dosažen|vyčerpán|upgrade/i;
  function limitNotice(doc) {
    const el = all(doc, LIMIT_PRVKY).find((e) => LIMIT_SLOVA.test(text(e)));
    return el ? text(el).slice(0, 200) : null;
  }

  // ── Ověření na živé stránce ────────────────────────────────────────────────
  // Služby mění stránky bez ohlášení a z vývojového stroje se na ně nedostaneme. Proto si
  // adaptér umí sám říct, co na stránce našel a čím – přesným selektorem služby, nebo jen
  // obecnou zálohou. Okno rozšíření to ukáže uživateli. Nevrací se žádný text ze stránky,
  // jen ano/ne a počty, stejně jako v tom, co rozšíření posílá do aplikace.
  function diagnose(adapter, doc, loc) {
    const zpravy = adapter.messages(doc);
    const id = String(adapter.conversationId(loc));
    const presnePole = adapter.composerSelector ? pouzitelne(doc, adapter.composerSelector) : null;
    return {
      site: adapter.id,
      konverzace: id.startsWith('tab-') ? 'karta' : 'adresa',
      pole: presnePole ? 'presne' : adapter.composer(doc) ? 'obecne' : 'zadne',
      zpravy: {
        user: zpravy.filter((m) => m.role === 'user').length,
        assistant: zpravy.filter((m) => m.role === 'assistant').length,
        zdroj: adapter.vlastniZpravy ? 'presne' : 'obecne',
      },
      generuje: Boolean(adapter.generating(doc)),
      limit: Boolean(adapter.limit(doc)),
    };
  }

  // Diagnostika pro člověka: tón (ok / warn / err / none) a věta. Stav nese vždy text.
  function radkyOvereni(d) {
    const r = [];
    r.push(d.konverzace === 'adresa' ? ['ok', 'Konverzace podle adresy stránky'] : ['none', 'Nová konverzace, zatím bez adresy']);
    r.push(d.pole === 'presne' ? ['ok', 'Pole pro zadání nalezeno'] : d.pole === 'obecne' ? ['warn', 'Pole pro zadání jen přes obecnou zálohu'] : ['err', 'Pole pro zadání nenalezeno']);
    const { user, assistant, zdroj } = d.zpravy;
    if (!user && !assistant) r.push(['none', 'Zatím žádné zprávy – pošli jednu']);
    else r.push([zdroj === 'presne' ? 'ok' : 'warn', `Tvoje zprávy ${user} · odpovědi ${assistant}${zdroj === 'presne' ? '' : ' (obecná záloha)'}`]);
    if (d.videl?.konec) r.push(['ok', 'Pracuje → hotovo zachyceno']);
    else if (d.generuje || d.videl?.generovani) r.push(['none', 'Právě pracuje – počkej na konec odpovědi']);
    else r.push(['none', 'Pracuje → hotovo: pošli zprávu a počkej']);
    if (d.limit) r.push(['warn', 'Na stránce je hláška o limitu']);
    return r;
  }

  // Anonymizovaný vzorek stránky pro opravu adaptéru a pro test (test/fixtures/web/): stavba
  // prvků bez obsahu. Zůstanou názvy prvků a atributy, podle kterých adaptéry hledají. Text
  // se nahradí jen příznakem „tady byl text“; odkazy, obrázky, titulky, hodnoty polí a všechno
  // ostatní se zahodí. Z popisků tlačítek zůstane jen slovo, podle kterého se pozná Stop.
  const VZOREK_ATRIBUTY = ['role', 'data-testid', 'data-message-author-role', 'data-is-streaming', 'data-role', 'data-author', 'contenteditable', 'name', 'type', 'disabled', 'readonly'];
  const VZOREK_POPISEK = /cancel generating|stop|zastavit|přestat|send|odeslat|submit/i;
  const VZOREK_VYNECH = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'IFRAME', 'IMG', 'PICTURE', 'SOURCE', 'VIDEO', 'AUDIO', 'CANVAS']);
  // Čísla a hashe v identifikátorech (ID zpráv, konverzací) nic neříkají o stavbě stránky.
  // Hodnota s mezerou může být název nebo jméno, ne stavba stránky: zůstane jen to, že atribut je.
  const bezId = (v) => {
    const out = String(v).replace(/[0-9a-f]{8}-[0-9a-f-]{4,}/gi, 'x-id').replace(/\d{6,}/g, '0');
    return /^[\w:.\/=-]{0,80}$/.test(out) ? out : '';
  };
  // Z adresy zůstanou jen krátká slova stavby (c, chat, app, search, …). Slug s dotazem
  // (Perplexity) nebo ID konverzace se nahradí zástupcem, který adaptéry pořád přečtou jako ID.
  const cestaBezId = (cesta) => String(cesta).split('/').map((c) => (!c || /^[a-z]{1,12}$/.test(c) ? c : 'x-id')).join('/');

  function vzorek(doc, loc, { limit = 20000 } = {}) {
    let pocet = 0;
    let zkraceno = false;
    const prvek = (el) => {
      pocet++;
      const uzel = { t: el.tagName.toLowerCase() };
      const a = {};
      for (const jmeno of VZOREK_ATRIBUTY) {
        const v = el.getAttribute(jmeno);
        if (v !== null) a[jmeno] = bezId(v);
      }
      const id = el.getAttribute('id');
      if (id && /^[A-Za-z][\w-]{0,60}$/.test(id) && !/\d{4,}/.test(id)) a.id = id;
      const trida = el.getAttribute('class');
      if (trida) {
        // Tailwind umí do třídy vložit i adresu (bg-[url(…)]) – taková třída stavbu nepopisuje.
        const tridy = trida.split(/\s+/).filter((c) => c && c.length <= 60 && !/\d{6,}/.test(c) && !/url\(|https?:|["'@]/.test(c)).slice(0, 30);
        if (tridy.length) a.class = tridy.join(' ');
      }
      const popisek = (el.getAttribute('aria-label') || '').match(VZOREK_POPISEK);
      if (popisek) a['aria-label'] = popisek[0];
      if (Object.keys(a).length) uzel.a = a;
      if (Array.from(el.childNodes || []).some((n) => n.nodeType === 3 && n.nodeValue.trim())) uzel.x = 1;
      // Dvě věci, které adaptéry potřebují a ze stavby nejsou vidět: skryté pole zprávy (skrývá
      // ho CSS, ne atribut) a hláška o limitu. Z hlášky zůstane jen klíčové slovo, podle
      // kterého ji adaptér pozná – a jen u prvků, které hláškou o limitu být můžou.
      if (el.matches?.('textarea, [contenteditable]') && !visible(el)) uzel.h = 1;
      const slovoLimitu = el.matches?.(LIMIT_PRVKY) ? text(el).match(LIMIT_SLOVA) : null;
      if (slovoLimitu) uzel.l = slovoLimitu[0].toLowerCase();
      if (uzel.t === 'svg') return uzel;
      const deti = [];
      for (const dite of Array.from(el.children || [])) {
        if (VZOREK_VYNECH.has(dite.tagName)) continue;
        if (pocet >= limit) { zkraceno = true; break; }
        deti.push(prvek(dite));
      }
      if (deti.length) uzel.c = deti;
      return uzel;
    };
    const strom = prvek(doc.body || doc.documentElement);
    const adapter = window.AgenteeqSites.detect(loc);
    return {
      format: 'agenteeq-vzorek',
      verze: 1,
      site: adapter ? adapter.id : null,
      adresa: { host: loc.hostname, cesta: cestaBezId(loc.pathname) },
      prvku: pocet,
      zkraceno,
      strom,
    };
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
      composerSelector: '#prompt-textarea, textarea[name="prompt-textarea"]',
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
      composerSelector: '#prompt-textarea, textarea[name="prompt-textarea"]',
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
      composerSelector: 'div.ProseMirror[contenteditable="true"], [data-testid="chat-input"] [contenteditable="true"]',
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
      composerSelector: 'rich-textarea .ql-editor[contenteditable="true"], .ql-editor[contenteditable="true"]',
    },
    { id: 'mscopilot', hosts: ['copilot.microsoft.com'], conversationId: (loc) => idFrom(loc, /\/chats\/([\w-]+)/) || tabId() },
    { id: 'perplexity', hosts: ['www.perplexity.ai', 'perplexity.ai'], conversationId: (loc) => idFrom(loc, /\/search\/([\w.-]+)/) || tabId(), composerSelector: '#ask-input, textarea' },
    { id: 'grok', hosts: ['grok.com'], conversationId: (loc) => idFrom(loc, /\/(?:c|chat)\/([\w-]+)/) || tabId() },
    { id: 'qwen', hosts: ['chat.qwen.ai'], conversationId: (loc) => idFrom(loc, /\/c\/([\w-]+)/) || tabId() },
    { id: 'github-copilot', hosts: ['github.com'], path: /^\/copilot/, conversationId: (loc) => idFrom(loc, /\/copilot\/c\/([\w-]+)/) || tabId() },
  ].map((s) => ({
    messages: genericMessages,
    generating: (doc) => Boolean(stopButton(doc)),
    title: (doc) => String(doc.title || '').trim(),
    model: () => '',
    limit: limitNotice,
    // Vlastní čtení zpráv má jen služba, jejíž stránku jsme viděli; ostatní jedou přes obecnou
    // zálohu. Diagnostika to uživateli říká, aby „3 zprávy“ z odhadu nevypadaly jako jistota.
    vlastniZpravy: typeof s.messages === 'function',
    composer: composerFrom(s.composerSelector || GENERIC_COMPOSER),
    ...s,
  }));

  window.AgenteeqSites = {
    SITES,
    insertPrompt,
    composerText,
    diagnose,
    radkyOvereni,
    vzorek,
    detect(loc) {
      return SITES.find((s) => s.hosts.includes(loc.hostname) && (!s.path || s.path.test(loc.pathname))) || null;
    },
  };
})();
