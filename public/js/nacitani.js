// Načítací scéna pláště pro Mac i Windows (public/nacitani.html). Klasický skript, protože stránka se
// otevírá ze souboru a moduly by WebKit ze souboru nenačetl.
//
// Plášť mění jen text stavu a tlačítko: window.agenteeqNacitani({ text, znovu }). Text se vkládá
// jako textContent, nikdy jako HTML – chybová hláška přichází ze serveru.
(() => {
  const text = document.getElementById('nacitani-text');
  const znovu = document.getElementById('nacitani-znovu');
  const prubeh = document.getElementById('nacitani-progress');
  const ukoncit = document.getElementById('nacitani-ukoncit');
  window.agenteeqNacitani = (stav) => {
    if (!stav || typeof stav !== 'object') return;
    if (typeof stav.text === 'string' && stav.text) text.textContent = stav.text;
    znovu.hidden = stav.znovu !== true;
    prubeh.hidden = stav.progress !== true;
    ukoncit.hidden = stav.progress !== true;
    if (!prubeh.hidden) prubeh.setAttribute('aria-valuetext', typeof stav.text === 'string' ? stav.text : 'Probíhá aktualizace');
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
