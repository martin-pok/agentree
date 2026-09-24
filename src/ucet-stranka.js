// Stránka, na kterou se prohlížeč vrátí z přihlášení přes Google (src/ucet.js). Otevírá se v běžném
// prohlížeči, ne v okně aplikace, takže nemá styly ani skripty aplikace – všechno potřebné nese sama.
// Skript smí být jen ze stejné adresy (CSP), proto žije na /ucet/navrat.js, ne uvnitř stránky.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STYL = `
  :root { color-scheme: light dark; --bg: #f4f2ee; --karta: #fff; --text: #16161a; --tlumeny: #5c5c66; --ok: #1b7a5a; --chyba: #a3294a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111114; --karta: #1b1b20; --text: #f1efea; --tlumeny: #a9a9b3; --ok: #5fd0a7; --chyba: #f08aa6; } .znak { color: #111114 !important; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: var(--bg); color: var(--text);
    font: 400 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { width: 100%; max-width: 440px; background: var(--karta); border-radius: 24px; padding: 40px 32px; text-align: center;
    box-shadow: 0 1px 2px rgb(0 0 0 / .06), 0 16px 48px rgb(0 0 0 / .08); }
  .znak { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 24px; font-size: 26px; color: #fff; }
  .znak--ok { background: var(--ok); } .znak--chyba { background: var(--chyba); } .znak--ceka { background: var(--tlumeny); }
  h1 { font-size: 24px; font-weight: 500; letter-spacing: -.01em; margin: 0 0 8px; }
  p { margin: 0; color: var(--tlumeny); }
  @media (prefers-reduced-motion: no-preference) { main { animation: nastup .5s cubic-bezier(.25, 1, .5, 1) both; } }
  @keyframes nastup { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
`;

export function strankaNavratu({ ok = false, ceka = false, jmeno = '', zprava = '' } = {}) {
  const [znak, trida, nadpis, text] = ceka
    ? ['…', 'ceka', 'Dokončuji přihlášení', 'Chvilku strpení.']
    : ok
      ? ['✓', 'ok', jmeno ? `Vítej, ${jmeno}` : 'Přihlášení proběhlo', 'Přihlášení do Agenteeq proběhlo. Tohle okno můžeš zavřít a vrátit se do aplikace.']
      : ['!', 'chyba', 'Přihlášení se nepovedlo', zprava || 'Zkus to prosím znovu z Agenteeq.'];
  return `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Agenteeq · přihlášení</title><style>${STYL}</style>
${ceka ? '<script src="/ucet/navrat.js" defer></script>' : ''}</head>
<body><main><div class="znak znak--${trida}" aria-hidden="true">${znak}</div><h1>${esc(nadpis)}</h1><p id="zprava">${esc(text)}</p></main></body></html>`;
}

// Supabase posílá chybu přihlášení v části adresy za #, kterou server nevidí. Skript ji předá
// serveru jako ?chyba=…, aby se aplikace dozvěděla, že přihlášení skončilo, a ne až po vypršení.
export const SKRIPT_NAVRATU = `(() => {
  const h = new URLSearchParams(location.hash.slice(1));
  const q = new URLSearchParams(location.search);
  const chyba = h.get('error_description') || h.get('error') || q.get('error_description') || q.get('error');
  if (chyba) { location.replace(location.pathname + '?chyba=' + encodeURIComponent(chyba.slice(0, 200))); return; }
  document.querySelector('h1').textContent = 'Přihlášení se nepovedlo';
  document.getElementById('zprava').textContent = 'Z přihlášení se nevrátil žádný výsledek. Zkus to prosím znovu z Agenteeq.';
})();
`;
