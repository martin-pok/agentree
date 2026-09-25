import { tr } from './i18n.js';
// Barvy poskytovatelů (grafy) a oficiální loga služeb.
// Loga: @lobehub/icons-static-svg 1.95.0 (MIT), uložená v public/logos/. Slouží jen k označení napojených služeb.
export const PROVIDERS = {
  anthropic: { label: 'Anthropic', color: '#D97757', ink: '#A6522F', on: '#FFFFFF' },
  openai: { label: 'OpenAI', color: '#16141D', ink: '#16141D', on: '#FFFFFF' },
  google: { label: 'Google', color: '#4285F4', ink: '#2A64C8', on: '#FFFFFF' },
  github: { label: 'GitHub', color: '#8250DF', ink: '#6A3CC2', on: '#FFFFFF' },
  microsoft: { label: 'Microsoft', color: '#0F6CBD', ink: '#0F6CBD', on: '#FFFFFF' },
  cursor: { label: 'Cursor', color: '#4A4855', ink: '#3A3843', on: '#FFFFFF' },
  perplexity: { label: 'Perplexity', color: '#1F8A96', ink: '#176873', on: '#FFFFFF' },
  xai: { label: 'xAI', color: '#8C8896', ink: '#5E5A66', on: '#FFFFFF' },
  alibaba: { label: 'Alibaba', color: '#615CED', ink: '#4B45D1', on: '#FFFFFF' },
  local: { label: tr('Lokální'), color: '#6F8F5E', ink: '#4F6E40', on: '#FFFFFF' },
  other: { label: tr('Ostatní'), color: '#B3AEBA', ink: '#686472', on: '#16141D' },
};

export const pkey = (p) => (PROVIDERS[p] ? p : 'other');

const LOGOS = {
  claude: { label: 'Claude' },
  codex: { label: 'Codex' },
  openai: { label: 'ChatGPT', mono: true },
  gemini: { label: 'Gemini' },
  githubcopilot: { label: 'GitHub Copilot', mono: true },
  copilot: { label: 'Microsoft Copilot' },
  perplexity: { label: 'Perplexity' },
  grok: { label: 'Grok', mono: true },
  qwen: { label: 'Qwen' },
  cursor: { label: 'Cursor', mono: true },
  ollama: { label: 'Ollama', mono: true },
  lmstudio: { label: 'LM Studio', mono: true },
};

const PROVIDER_LOGO = { anthropic: 'claude', openai: 'openai', google: 'gemini', github: 'githubcopilot', microsoft: 'copilot', cursor: 'cursor', perplexity: 'perplexity', xai: 'grok', alibaba: 'qwen', local: 'ollama' };
const CONNECTOR_LOGO = { 'claude-code': 'claude', codex: 'codex', cursor: 'cursor', 'copilot-cli': 'githubcopilot', 'vscode-copilot': 'githubcopilot', 'gemini-cli': 'gemini', 'qwen-code': 'qwen' };
const RUNTIME_LOGO = { 'claude-desktop': 'claude', 'claude-code': 'claude', chatgpt: 'openai', codex: 'codex', 'copilot-cli': 'githubcopilot', vscode: 'githubcopilot', cursor: 'cursor', 'ms-copilot': 'copilot', 'gemini-cli': 'gemini', 'qwen-code': 'qwen', perplexity: 'perplexity', grok: 'grok', ollama: 'ollama', lmstudio: 'lmstudio' };
const WEB_APP_LOGO = [[/chatgpt/i, 'openai'], [/claude/i, 'claude'], [/gemini/i, 'gemini'], [/microsoft copilot/i, 'copilot'], [/copilot/i, 'githubcopilot'], [/perplexity/i, 'perplexity'], [/grok/i, 'grok'], [/qwen/i, 'qwen']];

// Přijímá klíč poskytovatele ("openai"), session ({connector, app}), konektor ({id}) nebo běhové prostředí ({runtime}).
export function logoKey(x) {
  if (!x) return null;
  if (typeof x === 'string') return PROVIDER_LOGO[x] || (LOGOS[x] ? x : null);
  if (x.connector === 'web' && x.app) {
    const hit = WEB_APP_LOGO.find(([re]) => re.test(x.app));
    if (hit) return hit[1];
  }
  if (x.connector && CONNECTOR_LOGO[x.connector]) return CONNECTOR_LOGO[x.connector];
  if (x.runtime && RUNTIME_LOGO[x.runtime]) return RUNTIME_LOGO[x.runtime];
  if (x.id && CONNECTOR_LOGO[x.id]) return CONNECTOR_LOGO[x.id];
  if (x.logo && LOGOS[x.logo]) return x.logo;
  return PROVIDER_LOGO[x.provider] || null;
}

const GLYPHS = {
  local: '<circle class="g" cx="12" cy="12" r="8"/><circle class="gf" cx="12" cy="12" r="3"/>',
  other: '<path class="g" d="M4 16c3-7 5-9 8-9s5 2 8 9"/><circle class="gf" cx="12" cy="7" r="2.2"/>',
};

export function glyph(x, { onDark = false } = {}) {
  const key = logoKey(x);
  if (key) {
    const l = LOGOS[key];
    return `<img class="logo${l.mono ? ' logo--mono' : ''}${onDark && l.mono ? ' logo--invert' : ''}" src="/logos/${key}.svg" alt="" width="18" height="18" decoding="sync" draggable="false" data-label="${l.label}">`;
  }
  const p = pkey(typeof x === 'string' ? x : x?.provider);
  return `<svg viewBox="0 0 24 24" class="glyph" style="color:${onDark ? '#FFFFFF' : PROVIDERS[p].ink}" aria-hidden="true" focusable="false">${GLYPHS[p] || GLYPHS.other}</svg>`;
}

const svg = (d) => `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" focusable="false">${d}</svg>`;

// Kreslená žárovka pro banner průvodce. Vlastní kresba (žádná externí licence), jedna čára
// v barvě textu – ve světlém i tmavém režimu stejná, bez druhé verze souboru.
export const BULB = `<svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M32 9.5c-8.7 0-15 6.2-15 14 0 4.6 2.2 7.6 4.5 10.2 1.9 2.2 3 3.8 3.3 6.3"/>
  <path d="M32 9.5c8.9 0 15 6.4 15 14.1 0 4.5-2.3 7.5-4.6 10.1-1.9 2.2-2.9 3.9-3.2 6.3"/>
  <path d="M24.6 44.2c4.9 1 9.9 1 14.8 0"/><path d="M25.4 49c4.4.9 8.8.9 13.2 0"/><path d="M28.2 53.6c2.5.5 5.1.5 7.6 0"/>
  <path d="M28 27.5c1.4-2.6 2.6-2.6 4 0 1.4 2.6 2.6 2.6 4 0"/>
  <path d="M32 2.8v3.4M52.6 11.3l-2.4 2.4M11.4 11.3l2.4 2.4M58.5 30.4h-3.4M9 30.4H5.6"/>
</svg>`;

export const ICON = {
  chev: svg('<path d="M9 5l7 7-7 7"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  sun: svg('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>'),
  moon: svg('<path d="M20.4 15.2A8.7 8.7 0 0 1 8.8 3.6 9 9 0 1 0 20.4 15.2z"/>'),
  system: svg('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>'),
  bell: svg('<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  open: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M10 14l2-2 2 2M12 12v5"/>'),
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
  cloud: svg('<path d="M7.5 17.5a3.75 3.75 0 0 1 .42-7.48 5.25 5.25 0 0 1 10.06 1.1 3.4 3.4 0 0 1-1.48 6.38z"/>'),
  mac: svg('<rect x="4.5" y="6" width="15" height="10" rx="2"/><path d="M3.5 19h17"/>'),
  // Štít se zámkem: privátní síť, kam se nedostane nikdo zvenčí (karta Tailscale).
  shield: svg('<path d="M12 3l7 3v5.5c0 4.3-2.9 7.6-7 8.5-4.1-.9-7-4.2-7-8.5V6z"/><path d="M10.5 12.5h3M12 12.5v3"/>'),
};

// Kde agent běží: web = na serverech služby, ostatní konektory = proces na tomto Macu.
export const ENV = {
  cloud: { icon: ICON.cloud, label: tr('Běží v cloudu'), short: tr('Cloud') },
  local: { icon: ICON.mac, label: tr('Běží na tomto Macu'), short: tr('Na tomto Macu') },
};

export const envOf = (s) => (s.source === 'web' ? ENV.cloud : ENV.local);
