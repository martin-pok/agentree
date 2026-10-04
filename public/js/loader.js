import { tr, tvehoPocitace } from './i18n.js';
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
export function loaderHtml(text = tr('Načítám data z {0}…', tvehoPocitace())) {
  const safe = escapeHtml(text);
  return (
    '<div class="loader-wrap" role="status" aria-live="polite">' +
      '<div class="loader-scene" aria-hidden="true">' +
        '<span class="loader-orbit loader-orbit--left"></span><span class="loader-orbit loader-orbit--right"></span>' +
        '<div class="loader-mark">' +
          '<div class="loader-halo"></div>' +
          '<svg class="loader-svg" viewBox="0 0 40 40" fill="none" focusable="false">' +
          '<circle class="lm-root" cx="20" cy="8.5" r="4.2"></circle>' +
          // Kmen a dvě větve jsou samostatné tahy: větve vyrůstají souměrně z místa, kde je kmen
          // právě míjí, a každý uzel naskočí přesně ve chvíli, kdy k němu jeho tah doroste.
          '<path class="lm-stroke lm-stem" d="M20 13V29" pathLength="100"></path>' +
          '<path class="lm-stroke lm-branch" d="M20 18.5C20 23.5 10.5 22.5 10.5 29" pathLength="100"></path>' +
          '<path class="lm-stroke lm-branch" d="M20 18.5C20 23.5 29.5 22.5 29.5 29" pathLength="100"></path>' +
          '<circle class="lm-node lm-node-a" cx="10.5" cy="31" r="3.4"></circle>' +
          '<circle class="lm-node lm-node-b" cx="20" cy="31" r="3.4"></circle>' +
          '<circle class="lm-node lm-node-c" cx="29.5" cy="31" r="3.4"></circle>' +
          '</svg>' +
        '</div>' +
        '<span class="loader-stage-line"></span>' +
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
