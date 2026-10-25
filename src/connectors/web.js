import { clip, MIN, DAY } from '../util.js';
import { touch, pushEntry, updateEntry, resetTranscript } from '../model.js';
import { ui } from '../texty.js';

// Webové AI aplikace posílá rozšíření prohlížeče (extension/). Server data validuje a normalizuje.
export const WEB_SITES = {
  chatgpt: { name: 'ChatGPT', provider: 'openai' },
  'codex-web': { name: 'Codex · web', provider: 'openai' },
  'claude-code-web': { name: 'Claude Code · web', provider: 'anthropic' },
  claude: { name: 'Claude.ai', provider: 'anthropic' },
  gemini: { name: 'Gemini', provider: 'google' },
  'google-ai-studio': { name: 'Google AI Studio', provider: 'google' },
  mscopilot: { name: 'Microsoft Copilot', provider: 'microsoft' },
  perplexity: { name: 'Perplexity', provider: 'perplexity' },
  grok: { name: 'Grok', provider: 'xai' },
  qwen: { name: 'Qwen Chat', provider: 'alibaba' },
  'github-copilot': { name: 'GitHub Copilot', provider: 'github' },
};

// Independent server-side allowlist. A paired extension cannot turn an arbitrary
// phishing URL into a trusted conversation link by choosing a supported site ID.
const WEB_ORIGINS = {
  chatgpt: ['chatgpt.com', 'chat.openai.com'],
  'codex-web': ['chatgpt.com', 'chat.openai.com'],
  'claude-code-web': ['claude.ai'],
  claude: ['claude.ai'],
  gemini: ['gemini.google.com'],
  'google-ai-studio': ['aistudio.google.com'],
  mscopilot: ['copilot.microsoft.com'],
  perplexity: ['perplexity.ai', 'www.perplexity.ai'],
  grok: ['grok.com'],
  qwen: ['chat.qwen.ai'],
  'github-copilot': ['github.com'],
};

export function normalizedWebUrl(site, raw) {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !WEB_ORIGINS[site]?.includes(url.hostname)) return null;
    if (site === 'codex-web' && !/^\/codex(?:\/|$)/.test(url.pathname)) return null;
    if (site === 'claude-code-web' && !/^\/code(?:\/|$)/.test(url.pathname)) return null;
    if (site === 'github-copilot' && !/^\/copilot(?:\/|$)/.test(url.pathname)) return null;
    if (site === 'google-ai-studio' && !/^\/(?:(?:app\/)?prompts|apps)(?:\/|$)/.test(url.pathname)) return null;
    // URLs may carry temporary tokens or user queries; only the route is needed.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch { return null; }
}

const ZASTUPNE_ID = /^tab-[a-z0-9]{1,16}$|^tab-unknown$/;
const MAX_POCET = 100000;
const pocet = (n) => (Number.isInteger(n) && n >= 0 ? Math.min(n, MAX_POCET) : 0);
const cleanWebTitle = (raw) => {
  if (typeof raw !== 'string') return '';
  const title = clip(raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(), 400);
  if (/^(?:chatgpt|codex|claude(?: code)?|gemini|new chat|nový chat|untitled)$/i.test(title) ||
      /^(?:session_[\w-]+|[0-9a-f-]{16,})$/i.test(title)) return '';
  return title;
};

export function validateWebPayload(p) {
  if (!p || typeof p !== 'object') return { ok: false, error: ui('Chybí data.') };
  if (!WEB_SITES[p.site]) return { ok: false, error: ui('Neznámá služba.') };
  if (typeof p.conversationId !== 'string' || !/^[\w.:-]{1,200}$/.test(p.conversationId)) return { ok: false, error: ui('Neplatné ID konverzace.') };
  const safeUrl = normalizedWebUrl(p.site, p.url);
  if (!safeUrl) return { ok: false, error: ui('Neplatná adresa.') };
  // The paired extension sends only messages currently visible in the tab. Keep the
  // payload bounded; older extensions that send no messages still provide counts.
  let counts = { user: 0, assistant: 0 };
  if (p.counts && typeof p.counts === 'object') counts = { user: pocet(p.counts.user), assistant: pocet(p.counts.assistant) };
  else if (Array.isArray(p.messages)) {
    for (const m of p.messages) if (m && (m.role === 'user' || m.role === 'assistant')) counts[m.role] += 1;
  }
  return {
    ok: true,
    value: {
      site: p.site,
      conversationId: p.conversationId,
      url: safeUrl,
      generating: p.generating === true,
      counts,
      title: cleanWebTitle(p.title),
      messages: Array.isArray(p.messages) ? p.messages.slice(-60).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
        .map((m) => ({ role: m.role, text: clip(m.text, 8000) })) : [],
      model: clip(typeof p.model === 'string' ? p.model : '', 60),
      needsInput: typeof p.needsInput === 'string' ? clip(p.needsInput, 200) : null,
      limit: typeof p.limit === 'string' ? clip(p.limit, 200) : null,
      // Zástupné ID karty (extension/sites.js#tabId), pod kterým rozšíření posílalo tutéž konverzaci,
      // dokud jí služba nepřidělila ID. Jiné hodnoty se ignorují – nesmí jít smazat cizí konverzaci.
      nahrazuje: typeof p.nahrazuje === 'string' && ZASTUPNE_ID.test(p.nahrazuje) && p.nahrazuje !== p.conversationId ? p.nahrazuje : null,
    },
  };
}

function applyWebTranscript(s, messages, now) {
  if (!messages.length) return;
  const current = s.transcript.filter((e) => e.role === 'user' || e.role === 'assistant');
  // The browser may virtualize earlier turns. Do not discard a longer local
  // transcript when only a suffix of visible messages remains on screen.
  if (current.length > messages.length && messages.every((m, i) => {
    const old = current[current.length - messages.length + i];
    return old.role === m.role && old.text === m.text;
  })) return;
  let prefix = 0;
  while (prefix < Math.min(current.length, messages.length) && current[prefix].role === messages[prefix].role && current[prefix].text === messages[prefix].text) prefix++;
  // Streaming can update the last response without resetting the whole conversation.
  if (prefix === current.length - 1 && current.length === messages.length && current.at(-1).role === messages.at(-1).role) {
    updateEntry(s, current.at(-1), { text: messages.at(-1).text, at: now });
    return;
  }
  if (prefix < current.length) resetTranscript(s);
  for (const m of messages.slice(prefix < current.length ? 0 : prefix)) pushEntry(s, { at: now, role: m.role, text: m.text });
}

export function applyWebPayload(s, v, now = Date.now()) {
  const st = s.web || (s.web = { counts: { user: 0, assistant: 0 } });
  s.source = 'web';
  s.url = v.url;
  // Never display an identifier as a conversation name. Preserve the last real
  // title if an SPA briefly reports only its generic document.title.
  if (v.title) s.title = v.title;
  else if (!s.title) s.title = ui('Název konverzace zatím nedostupný');
  applyWebTranscript(s, v.messages, now);
  if (v.messages.length) {
    const last = v.messages.findLast((m) => m.role === 'user');
    if (last) s.lastPrompt = last.text;
  }
  if (v.model) s.model = v.model;
  // Chrome v kartě na pozadí (skryté déle než 5 minut) pouští časovače nejvýš jednou za minutu.
  // Při 45 s by dlouho běžící úloha – Codex na webu, hloubkový výzkum – uprostřed práce spadla
  // na „bez aktivity“. 150 s pokryje minutový takt s rezervou na zpožděné doručení.
  s.staleMs = 150e3;

  const changed = st.counts.user !== v.counts.user || st.counts.assistant !== v.counts.assistant;
  st.counts = { ...v.counts };
  s.turns = v.counts.user;

  if (v.generating && !s.running) {
    s.turnStartedAt = now;
    s.turnSteps = 0;
  }
  s.running = v.generating;
  s.runningAt = now;
  s.activity = v.generating ? ui('Generuje odpověď…') : '';
  if (changed || v.generating || !s.lastAt) touch(s, now);

  s.pending = v.needsInput ? { kind: 'question', text: v.needsInput, at: s.pending?.at || now, source: 'web' } : null;
  s.limit = v.limit ? { reached: true, text: v.limit, at: s.limit?.at || now, resetsAt: null } : null;
}

// Claude Code na webu (claude.ai/code/session_…) je vzdálený agent, kterého často zná i cache
// Claude Desktopu (src/connectors/claude-desktop-code.js) pod stejným `session_…`. Agent má být
// v přehledu jeden: když cache relaci zná, otevřená karta k ní přidá jen živý důkaz `karta`
// a o stavu rozhoduje model.js#deriveStatus (čerstvá karta přebije starší cache, zavřená karta
// po `staleMs` přestane platit a stav se vrátí k cache). Bez Claude Desktopu zůstává karta
// samostatnou webovou konverzací jako u ostatních služeb.
export const KARTA_STALE_MS = 150e3;
export const dvojceClaudeCode = (site, conversationId) =>
  site === 'claude-code-web' && /^session_[A-Za-z0-9]{8,80}$/.test(conversationId) ? `claude-desktop-code:${conversationId}` : null;
export const webIdClaudeCode = (remoteId) => `web:claude-code-web:${remoteId}`;

export function applyKarta(s, v, now = Date.now()) {
  const k = s.karta;
  const changed = !k || k.counts?.user !== v.counts.user || k.counts?.assistant !== v.counts.assistant;
  s.karta = {
    url: v.url,
    running: v.generating,
    at: now,
    since: v.generating ? (k?.running ? k.since : now) : k?.since || 0,
    lastAt: v.generating || changed ? now : k.lastAt,
    counts: { ...v.counts },
    staleMs: KARTA_STALE_MS,
  };
  if (v.generating || changed) touch(s, now);
}

// Webová konverzace vzniklá dřív, než relaci uložila cache Claude Desktopu, se převede na důkaz
// u relace z cache (volá claude-desktop-code.js).
export const kartaZWebu = (w) => ({
  url: w.url,
  running: Boolean(w.running), at: w.runningAt || 0, since: w.turnStartedAt || 0, lastAt: w.lastAt || 0,
  counts: { ...(w.web?.counts || { user: 0, assistant: 0 }) }, staleMs: w.staleMs || KARTA_STALE_MS,
});

export function createWebConnector(ctx) {
  const { store, extensionRecord = () => null } = ctx;
  const lastSeen = new Map();

  return {
    id: 'web',
    name: ui('Webové aplikace (rozšíření prohlížeče)'),
    provider: 'other',
    kind: 'web',
    verified: false,
    source: ui('Rozšíření Agenteeq pro Chrome'),
    description: ui('ChatGPT, Claude.ai, Gemini, Google AI Studio, Microsoft Copilot, Perplexity, Grok, Qwen Chat a GitHub Copilot v prohlížeči.'),
    async start() {},
    async scan() {},
    stop() {},
    idle: async () => {},
    ingest(payload, now = Date.now()) {
      const res = validateWebPayload(payload);
      if (!res.ok) return res;
      const v = res.value;
      const site = WEB_SITES[v.site];
      const id = `web:${v.site}:${v.conversationId}`;
      const dvojce = store.get(dvojceClaudeCode(v.site, v.conversationId));
      if (dvojce) {
        for (const stare of [id, v.nahrazuje && `web:${v.site}:${v.nahrazuje}`]) if (stare && store.get(stare)) store.remove(stare);
        applyKarta(dvojce, v, now);
        if (v.title && !dvojce.title) dvojce.title = v.title;
        if (!dvojce.transcript.length) applyWebTranscript(dvojce, v.messages, now);
        lastSeen.set(v.site, now);
        store.commit(dvojce, now);
        return { ok: true, id: dvojce.id };
      }
      // Nová konverzace dostala ID: záznam pod zástupným ID karty se převede na skutečné ID, ať je
      // v přehledu jedna konverzace, ne dvě. Začátek konverzace a probíhající tah zůstanou.
      const predtim = v.nahrazuje ? store.get(`web:${v.site}:${v.nahrazuje}`) : null;
      const nova = !store.get(id);
      const s = store.ensure({ connector: 'web', localId: `${v.site}:${v.conversationId}`, provider: site.provider, app: site.name, source: 'web' });
      if (predtim) {
        if (nova) {
          for (const k of ['startedAt', 'lastAt', 'running', 'runningAt', 'turnStartedAt', 'turnSteps', 'pending', 'limit', 'model', 'title', 'firstPrompt', 'lastPrompt', 'seq']) s[k] = predtim[k];
          s.transcript = [...predtim.transcript];
          s.web = predtim.web ? { counts: { ...predtim.web.counts } } : s.web;
          for (const m of predtim.minutes) s.minutes.add(m);
        }
        store.remove(predtim.id);
      }
      applyWebPayload(s, v, now);
      lastSeen.set(v.site, now);
      store.commit(s, now);
      return { ok: true, id: s.id };
    },
    status() {
      const now = Date.now();
      const active = [...lastSeen.entries()].filter(([, at]) => now - at < 10 * MIN).map(([k]) => WEB_SITES[k].name);
      const recent = [...lastSeen.values()].some((at) => now - at < DAY);
      // Spárované rozšíření bez otevřené konverzace není „nenalezeno“ – jen nemá co poslat.
      const ext = extensionRecord() || {};
      const paired = ext.pairedAt > 0;
      const heard = paired && now - ext.seenAt < 2 * 60 * MIN;
      return {
        state: active.length ? 'connected' : recent || paired ? 'idle' : 'missing',
        detail: active.length
          ? ui('Aktivní: {0}.', active.join(', '))
          : recent
            ? ui('Rozšíření posílalo data během dne.')
            : heard
              ? ui('Rozšíření je připojené. Jakmile otevřeš konverzaci v Chromu, objeví se tady.')
              : paired
                ? ui('Rozšíření je spárované, ale teď se neozývá – Chrome je zavřený nebo je rozšíření vypnuté.')
                : ui('Rozšíření zatím neposlalo žádná data. Nainstaluj ho v Nastavení.'),
        count: lastSeen.size,
        watching: true,
        lastEventAt: Math.max(0, ...lastSeen.values()),
        sites: Object.fromEntries([...lastSeen.entries()]),
      };
    },
  };
}
