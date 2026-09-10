export const PROVIDERS = {
  anthropic: { label: 'Anthropic', color: '#F2921D', ink: '#A85405', on: '#1E1B22' },
  openai: { label: 'OpenAI', color: '#1E1B22', ink: '#1E1B22', on: '#FFFFFF' },
  google: { label: 'Google', color: '#E8436B', ink: '#C92F57', on: '#FFFFFF' },
  github: { label: 'GitHub', color: '#45BEC3', ink: '#177F85', on: '#1E1B22' },
  microsoft: { label: 'Microsoft', color: '#3C7DD9', ink: '#2A64B8', on: '#FFFFFF' },
  cursor: { label: 'Cursor', color: '#6D5BD0', ink: '#5A48BD', on: '#FFFFFF' },
  perplexity: { label: 'Perplexity', color: '#2E9E8F', ink: '#1F7A6E', on: '#FFFFFF' },
  xai: { label: 'xAI', color: '#8A8594', ink: '#5E5A66', on: '#FFFFFF' },
  alibaba: { label: 'Alibaba', color: '#C9A227', ink: '#7A5E0A', on: '#1E1B22' },
  local: { label: 'Lokální', color: '#5E9E57', ink: '#3F7A39', on: '#FFFFFF' },
  other: { label: 'Ostatní', color: '#B3AEBA', ink: '#6B6770', on: '#1E1B22' },
};

export const pkey = (p) => (PROVIDERS[p] ? p : 'other');

const GLYPHS = {
  anthropic: '<path class="g" d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
  openai: '<path class="g" d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle class="gf" cx="12" cy="12" r="2.4"/>',
  google: '<path class="gf" d="M12 2c.8 5.3 4.7 9.2 10 10-5.3.8-9.2 4.7-10 10-.8-5.3-4.7-9.2-10-10 5.3-.8 9.2-4.7 10-10z"/>',
  github: '<rect class="g" x="4" y="4" width="16" height="16" rx="5"/><circle class="gf" cx="9.5" cy="11.5" r="1.7"/><circle class="gf" cx="14.5" cy="11.5" r="1.7"/>',
  microsoft: '<rect class="gf" x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect class="gf" x="13" y="3.5" width="7.5" height="7.5" rx="1.5" opacity=".5"/><rect class="gf" x="3.5" y="13" width="7.5" height="7.5" rx="1.5" opacity=".5"/><rect class="gf" x="13" y="13" width="7.5" height="7.5" rx="1.5"/>',
  cursor: '<path class="gf" d="M5 3l14 8-6.2 1.6L10 19z"/>',
  perplexity: '<path class="g" d="M12 3v18M5 7l7 5 7-5M5 17l7-5 7 5"/>',
  xai: '<path class="g" d="M5 5l14 14M19 5L5 19"/>',
  alibaba: '<circle class="g" cx="11" cy="11" r="7"/><path class="g" d="M16 16l4 4"/>',
  local: '<circle class="g" cx="12" cy="12" r="8"/><circle class="gf" cx="12" cy="12" r="3"/>',
  other: '<path class="g" d="M12 4l8.5 15h-17z"/>',
};

export function glyph(provider, { color } = {}) {
  const p = pkey(provider);
  return `<svg viewBox="0 0 24 24" class="glyph" style="color:${color || PROVIDERS[p].ink}" aria-hidden="true" focusable="false">${GLYPHS[p]}</svg>`;
}

const svg = (d) => `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" focusable="false">${d}</svg>`;

export const ICON = {
  chev: svg('<path d="M9 5l7 7-7 7"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  bell: svg('<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  terminal: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9l3 3-3 3M13 15h4"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  trash: svg('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  alert: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>'),
  hand: svg('<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 4 15l-1-3a1.5 1.5 0 0 1 2.6-1.3L8 13"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  plug: svg('<path d="M9 3v4M15 3v4M6 7h12v4a6 6 0 0 1-12 0zM12 17v4"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>'),
  sliders: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  refresh: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>'),
  wallet: svg('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h2M3 10h18M7 6V4h10v2"/>'),
  spark: svg('<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>'),
};
