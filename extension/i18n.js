// Jazyk okna rozšíření. Zdrojem textů je čeština přímo v kódu (stejně jako v aplikaci,
// public/js/i18n.js); tr() ji v angličtině přeloží podle slovníku níž. Jazyk bere z _locales
// přes chrome.i18n – tatáž volba jako u názvu a popisu v manifestu, takže okno i karta
// rozšíření v Chromu mluví vždy stejně. Čeština pro český Chrome, jinak angličtina.
// Úplnost slovníku a shodu proměnných hlídá test/extension-i18n.test.mjs.
(() => {
  const EN = {
    texty: {
      // Horní lišta a stavy spojení
      'Zjišťuji…': 'Checking…',
      'Připojeno': 'Connected',
      'Neběží': 'Not running',
      'Nespárováno': 'Not paired',
      'Chvilku…': 'One moment…',
      'Hledám Agenteeq na tomto počítači.': 'Looking for Agenteeq on this computer.',
      'Sledované služby': 'Tracked services',
      'Ověření stránky': 'Page check',
      'Zpět': 'Back',
      'Obnovit aktuální stav': 'Refresh current status',
      // Hlavní pohled
      'Otevřené konverzace': 'Open conversations',
      'Žádná otevřená konverzace': 'No open conversations',
      'Otevři chat s AI a objeví se tady i v Agenteeq.': 'Open an AI chat and it shows up here and in Agenteeq.',
      'Poslední hlášení se do Agenteeq nedostalo. Rozšíření to zkusí znovu samo.': 'The last update didn’t reach Agenteeq. The extension will try again on its own.',
      'agentů teď pracuje': 'agents working now',
      'Je k dispozici verze {0}. Chrome ji nainstaluje sám; hned ji získáš na stránce chrome://extensions tlačítkem Aktualizovat.': 'Version {0} is available. Chrome installs it on its own; to get it now, click Update on chrome://extensions.',
      'tato karta': 'this tab',
      'Počty nesedí? Ověřit stránku': 'Counts look off? Check the page',
      'Přepnout na kartu {0}, {1}': 'Switch to the {0} tab, {1}',
      'odpovídá': 'replying',
      'odpovídá · {0}': 'replying · {0}',
      'narazil na limit': 'hit a limit',
      'zatím bez zpráv': 'no messages yet',
      'právě dokončil': 'just finished',
      'dokončil {0}': 'finished {0}',
      'čeká na zadání': 'waiting for a prompt',
      'sledování této služby je vypnuté': 'tracking is off for this service',
      'před {0} min': '{0} min ago',
      'před {0} h': '{0} h ago',
      // Služby
      'Codex na webu': 'Codex on the web',
      '{0} z {1}': '{0} of {1}',
      'naposledy {0}': 'last seen {0}',
      'Sledovat {0}': 'Track {0}',
      'Vypnutou službu rozšíření vůbec nečte.': 'The extension doesn’t read a service you turn off.',
      // Ověření stránky
      'Sedí počty zpráv s tím, co na stránce vidíš?': 'Do the message counts match what you see on the page?',
      'Sedí': 'They match',
      'Nesedí': 'They don’t',
      'Uložit vzorek stránky': 'Save page sample',
      'Vzorek obsahuje jen stavbu stránky, žádný text.': 'The sample contains only the page structure, no text.',
      'Díky. Ulož vzorek – poslouží jako test, že to tak zůstane.': 'Thanks. Save the sample – it becomes a test that keeps it this way.',
      'Díky. Ulož vzorek, podle něj se rozpoznávání opraví.': 'Thanks. Save the sample so recognition can be fixed from it.',
      'Vzorek se nepodařilo získat. Obnov stránku a zkus to znovu.': 'Couldn’t get the sample. Reload the page and try again.',
      'Uloženo do Stažených souborů ({0} prvků{1}).': 'Saved to Downloads ({0} elements{1}).',
      ', zkráceno': ', truncated',
      'Konverzace má vlastní adresu': 'The conversation has its own address',
      'Nová konverzace, zatím bez vlastní adresy': 'New conversation, no address of its own yet',
      'Pole pro zadání nalezeno': 'Message box found',
      'Pole pro zadání nalezeno jen přibližně': 'Message box found only approximately',
      'Pole pro zadání nenalezeno': 'Message box not found',
      'Zatím žádné zprávy – pošli jednu': 'No messages yet – send one',
      'Tvoje zprávy {0} · odpovědi {1}': 'Your messages {0} · replies {1}',
      ' (přibližně)': ' (approximate)',
      'Začátek i konec odpovědi zachycen': 'Start and end of the reply captured',
      'Agent odpovídá – počkej na konec': 'The agent is replying – wait for the end',
      'Pošli zprávu a počkej na celou odpověď': 'Send a message and wait for the full reply',
      'Stránka hlásí vyčerpaný limit': 'The page reports a reached limit',
      // Spárování
      'Spáruj rozšíření kódem': 'Pair the extension with a code',
      'Spáruj rozšíření znovu': 'Pair the extension again',
      'Předchozí spárování už neplatí.': 'The previous pairing no longer works.',
      'Spárování jednorázovým kódem': 'Pairing with a one-time code',
      'V Agenteeq otevři <b>Nastavení → Propojení → Rozšíření pro Chrome</b>.': 'In Agenteeq, open <b>Settings → Connections → Chrome extension</b>.',
      'Klikni na <b>Vytvořit jednorázový kód</b> a vlož ho sem.': 'Click <b>Create one-time code</b> and paste it here.',
      'Jednorázový kód': 'One-time code',
      'Jednorázový kód z Agenteeq': 'One-time code from Agenteeq',
      'Spárovat': 'Pair',
      'Kód platí 10 minut a použít ho jde jen jednou.': 'The code is valid for 10 minutes and works only once.',
      'Kód má 16 znaků – zkopíruj ho z Agenteeq celý.': 'The code has 16 characters – copy all of it from Agenteeq.',
      'Spárování se nepovedlo. Vytvoř v Agenteeq nový kód.': 'Pairing didn’t work. Create a new code in Agenteeq.',
      'Spárováno.': 'Paired.',
      // Aplikace neběží
      'Agenteeq na tomto počítači neběží': 'Agenteeq isn’t running on this computer',
      'Spusť aplikaci, rozšíření se k ní připojí samo.': 'Open the app and the extension connects to it on its own.',
      'Co rozšíření dělá': 'What the extension does',
      'Zkusit znovu': 'Try again',
      'Uvidíš, jestli agent v ChatGPT, Claude.ai nebo Gemini pracuje a kolik má konverzace zpráv.': 'See whether the agent in ChatGPT, Claude.ai or Gemini is working and how many messages the conversation has.',
      'Spustíš službu z Agenteeq a zadání už čeká v poli zprávy. Odešleš ho sám.': 'Start a service from Agenteeq and your prompt is already waiting in the message box. You send it yourself.',
      'Stáhnout Agenteeq': 'Get Agenteeq',
      // Patička
      'Otevřít Agenteeq': 'Open Agenteeq',
    },
    // Tvary podle počtu: klíč jsou tři české tvary, hodnota anglické [jednotné, množné].
    mnozne: {
      'agent právě pracuje|agenti právě pracují|agentů právě pracuje': ['agent working now', 'agents working now'],
      'otevřená konverzace|otevřené konverzace|otevřených konverzací': ['open conversation', 'open conversations'],
      'tvoje zpráva|tvoje zprávy|tvých zpráv': ['your message', 'your messages'],
      'odpověď|odpovědi|odpovědí': ['reply', 'replies'],
    },
  };

  let jazyk = 'cs';
  try {
    if (globalThis.chrome?.i18n?.getMessage?.('jazyk') === 'en') jazyk = 'en';
  } catch { /* mimo rozšíření (testy) zůstává čeština */ }
  const slovnik = jazyk === 'en' ? EN : null;

  function tr(text, ...args) {
    const s = slovnik ? (slovnik.texty[text] ?? text) : text;
    return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i]) : m)) : s;
  }
  // Čeština má tři tvary (1 / 2–4 / 0 a 5+), angličtina dva.
  function mnozne(n, jedna, dve, pet) {
    const a = Math.abs(n);
    const en = slovnik?.mnozne[`${jedna}|${dve}|${pet}`];
    if (en) return a === 1 ? en[0] : en[1];
    return a === 1 ? jedna : a >= 2 && a <= 4 ? dve : pet;
  }

  // Statické texty v HTML: [data-i18n] nahradí text, [data-i18n-html] obsah (jen ze slovníku,
  // nikdy s daty), [data-i18n-attr="placeholder,aria-label"] atributy. Klíčem je původní čeština.
  function prelozStranku(koren = document) {
    if (!slovnik) return;
    document.documentElement.lang = 'en';
    for (const el of koren.querySelectorAll('[data-i18n]')) el.textContent = tr(el.textContent.trim().replace(/ /g, ' '));
    for (const el of koren.querySelectorAll('[data-i18n-html]')) el.innerHTML = tr(el.innerHTML.trim().replace(/&nbsp;/g, ' ').replace(/ /g, ' '));
    for (const el of koren.querySelectorAll('[data-i18n-attr]')) {
      for (const a of el.dataset.i18nAttr.split(',')) if (el.hasAttribute(a)) el.setAttribute(a, tr(el.getAttribute(a).replace(/ /g, ' ')));
    }
  }

  globalThis.AgenteeqI18n = { jazyk: () => jazyk, tr, mnozne, prelozStranku, LOCALE: jazyk === 'en' ? 'en-GB' : 'cs-CZ', EN };
})();
