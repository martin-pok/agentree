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
 * Vrátí hotový HTML řetězec s načítací scénou (hlava robota s přejíždějícím
 * fialovým odleskem) a textem stavu.
 * @param {string} text - oznamovaný stav (výchozí: „Načítám data z tvého Macu…“)
 */
export function loaderHtml(text = tr('Načítám data z {0}…', tvehoPocitace())) {
  const safe = escapeHtml(text);
  return (
    '<div class="loader-wrap" role="status" aria-live="polite">' +
      // Hlava robota (tvar z public/brand/agenteeq-mark.svg, oči jsou výřezy) ztlumená v klidu;
      // přes ni přejíždí fialový odlesk oříznutý přesně jejím tvarem.
      '<div class="loader-scene" aria-hidden="true">' +
      '<svg class="loader-robot" viewBox="0 0 48 48" focusable="false">' +
      '<defs>' +
      '<clipPath id="lr-tvar"><path d="M20.8 4.5A3.2 3.2 0 0 1 27.2 4.5A3.2 3.2 0 0 1 20.8 4.5ZM22.25 4.5H25.75V13H22.25ZM17 12H31A12 12 0 0 1 43 24V31A12 12 0 0 1 31 43H17A12 12 0 0 1 5 31V24A12 12 0 0 1 17 12ZM17.5 22A2.5 2.5 0 0 0 15 24.5V29.5A2.5 2.5 0 0 0 17.5 32A2.5 2.5 0 0 0 20 29.5V24.5A2.5 2.5 0 0 0 17.5 22ZM30.5 22A2.5 2.5 0 0 0 28 24.5V29.5A2.5 2.5 0 0 0 30.5 32A2.5 2.5 0 0 0 33 29.5V24.5A2.5 2.5 0 0 0 30.5 22Z"></path></clipPath>' +
      '<linearGradient id="lr-lesk" x1="0" x2="1" y1="0" y2="0">' +
      '<stop offset="0" stop-color="#5254d8" stop-opacity="0"></stop>' +
      '<stop offset=".3" stop-color="#5254d8" stop-opacity=".7"></stop>' +
      '<stop offset=".5" stop-color="#b7b8ff"></stop>' +
      '<stop offset=".7" stop-color="#5254d8" stop-opacity=".7"></stop>' +
      '<stop offset="1" stop-color="#5254d8" stop-opacity="0"></stop>' +
      '</linearGradient>' +
      '</defs>' +
      '<path class="lr-zaklad" d="M20.8 4.5A3.2 3.2 0 0 1 27.2 4.5A3.2 3.2 0 0 1 20.8 4.5ZM22.25 4.5H25.75V13H22.25ZM17 12H31A12 12 0 0 1 43 24V31A12 12 0 0 1 31 43H17A12 12 0 0 1 5 31V24A12 12 0 0 1 17 12ZM17.5 22A2.5 2.5 0 0 0 15 24.5V29.5A2.5 2.5 0 0 0 17.5 32A2.5 2.5 0 0 0 20 29.5V24.5A2.5 2.5 0 0 0 17.5 22ZM30.5 22A2.5 2.5 0 0 0 28 24.5V29.5A2.5 2.5 0 0 0 30.5 32A2.5 2.5 0 0 0 33 29.5V24.5A2.5 2.5 0 0 0 30.5 22Z"></path>' +
      '<g clip-path="url(#lr-tvar)"><g class="lr-lesk"><rect x="-30" y="-12" width="30" height="72" fill="url(#lr-lesk)" transform="rotate(16 -15 24)"></rect></g></g>' +
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
