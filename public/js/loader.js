// Agenteeq – HTML pro prémiovou načítací animaci značky a skeleton karet.
// Bez runtime závislostí; jen čisté SVG/DOM řetězce. Styly v public/loader.css.

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

/**
 * Vrátí hotový HTML řetězec s animovanou značkou Agenteeq (rostoucí větve,
 * jemné nadechnutí, doznívající halo) a textem stavu.
 * @param {string} text - oznamovaný stav (výchozí: „Načítám data z tvého Macu…“)
 */
export function loaderHtml(text = 'Načítám data z tvého Macu…') {
  const safe = escapeHtml(text);
  return (
    '<div class="loader-wrap" role="status" aria-live="polite">' +
      '<div class="loader-mark">' +
        '<div class="loader-halo" aria-hidden="true"></div>' +
        '<svg class="loader-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">' +
          '<circle class="lm-root" cx="20" cy="8.5" r="4.2"></circle>' +
          '<path class="lm-branches" d="M20 13V29M20 18.5C20 23.5 10.5 22.5 10.5 29M20 18.5C20 23.5 29.5 22.5 29.5 29" ' +
            'pathLength="100" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>' +
          '<circle class="lm-node lm-node-a" cx="10.5" cy="31" r="3.4"></circle>' +
          '<circle class="lm-node lm-node-b" cx="20" cy="31" r="3.4"></circle>' +
          '<circle class="lm-node lm-node-c" cx="29.5" cy="31" r="3.4"></circle>' +
        '</svg>' +
      '</div>' +
      `<span class="loader-text">${safe}</span>` +
    '</div>'
  );
}

/**
 * Vrátí HTML řetězec se skeleton pruhy (karty, které se dopočítávají).
 * @param {number} rows - počet pruhů (výchozí 3)
 */
export function skeletonHtml(rows = 3) {
  const widths = [100, 88, 64];
  const count = Math.max(1, Math.floor(rows) || 3);
  let out = '<div class="skel-wrap" aria-hidden="true">';
  for (let i = 0; i < count; i++) {
    const w = widths[i % widths.length];
    out += `<div class="skel-row" style="width:${w}%"></div>`;
  }
  out += '</div>';
  return out;
}
