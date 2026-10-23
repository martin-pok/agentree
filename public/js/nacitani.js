// Načítací scéna pláště pro Mac i Windows (public/nacitani.html). Klasický skript, protože stránka se
// otevírá ze souboru a moduly by WebKit ze souboru nenačetl.
//
// Plášť mění jen text stavu a tlačítko: window.agenteeqNacitani({ text, znovu, progress, hodnota }). Text se vkládá
// jako textContent, nikdy jako HTML – chybová hláška přichází ze serveru.
(() => {
  const text = document.getElementById('nacitani-text');
  const znovu = document.getElementById('nacitani-znovu');
  const prubeh = document.getElementById('nacitani-progress');
  const ukoncit = document.getElementById('nacitani-ukoncit');
  const setLanguage = (language) => {
    const english = language === 'en';
    document.documentElement.lang = english ? 'en' : 'cs';
    znovu.textContent = english ? 'Try again' : 'Zkusit znovu';
    ukoncit.textContent = english ? 'Quit Agenteeq' : 'Ukončit Agenteeq';
    prubeh.setAttribute('aria-label', english ? 'Installing Agenteeq update' : 'Instalace aktualizace Agenteeq');
  };
  setLanguage(window.agenteeqLoaderLanguage);
  window.agenteeqNacitani = (stav) => {
    if (!stav || typeof stav !== 'object') return;
    if (typeof stav.language === 'string') setLanguage(stav.language);
    if (typeof stav.text === 'string' && stav.text) text.textContent = stav.text;
    znovu.hidden = stav.znovu !== true;
    prubeh.hidden = stav.progress !== true;
    ukoncit.hidden = stav.progress !== true;
    // Podíl hotové práce (0–1) posílá plášť jen u skutečně dokončených kroků instalace.
    const podil = typeof stav.hodnota === 'number' && Number.isFinite(stav.hodnota) ? Math.min(1, Math.max(0, stav.hodnota)) : null;
    prubeh.classList.toggle('is-urcity', podil !== null);
    if (podil !== null) {
      prubeh.style.setProperty('--podil', String(podil));
      prubeh.setAttribute('aria-valuenow', String(Math.round(podil * 100)));
      prubeh.setAttribute('aria-valuemin', '0');
      prubeh.setAttribute('aria-valuemax', '100');
    } else prubeh.removeAttribute('aria-valuenow');
    if (!prubeh.hidden) prubeh.setAttribute('aria-valuetext', typeof stav.text === 'string' ? stav.text : text.textContent);
    if (!znovu.hidden) znovu.focus();
  };
  ukoncit.addEventListener('click', () => {
    const kanal = window.webkit?.messageHandlers?.nacitani || window.webkit?.messageHandlers?.agenteeq;
    kanal?.postMessage({ type: 'ukoncit' });
  });
  znovu.addEventListener('click', () => {
    znovu.hidden = true;
    // Na macOS má pohled scény vlastní kanál „nacitani“, na Windows vede most pláště přes „agenteeq“.
    const kanal = window.webkit?.messageHandlers?.nacitani || window.webkit?.messageHandlers?.agenteeq;
    kanal?.postMessage({ type: 'znovu' });
  });
})();
