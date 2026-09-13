import { clip, clipBlock, MIN, DAY } from '../util.js';
import { touch, pushEntry, updateEntry, resetTranscript } from '../model.js';

// Webové AI aplikace posílá rozšíření prohlížeče (extension/). Server data validuje a normalizuje.
export const WEB_SITES = {
  chatgpt: { name: 'ChatGPT', provider: 'openai' },
  'codex-web': { name: 'Codex · web', provider: 'openai' },
  claude: { name: 'Claude.ai', provider: 'anthropic' },
  gemini: { name: 'Gemini', provider: 'google' },
  mscopilot: { name: 'Microsoft Copilot', provider: 'microsoft' },
  perplexity: { name: 'Perplexity', provider: 'perplexity' },
  grok: { name: 'Grok', provider: 'xai' },
  qwen: { name: 'Qwen Chat', provider: 'alibaba' },
  'github-copilot': { name: 'GitHub Copilot', provider: 'github' },
};

const MAX_MESSAGES = 80;

export function validateWebPayload(p) {
  if (!p || typeof p !== 'object') return { ok: false, error: 'Chybí data.' };
  if (!WEB_SITES[p.site]) return { ok: false, error: 'Neznámá služba.' };
  if (typeof p.conversationId !== 'string' || !/^[\w.:-]{1,200}$/.test(p.conversationId)) return { ok: false, error: 'Neplatné ID konverzace.' };
  if (typeof p.url !== 'string' || !/^https:\/\//.test(p.url) || p.url.length > 2000) return { ok: false, error: 'Neplatná adresa.' };
  const messages = Array.isArray(p.messages) ? p.messages.slice(-MAX_MESSAGES) : [];
  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string') continue;
    const text = clipBlock(m.text, 8000);
    if (text) clean.push({ role: m.role, text });
  }
  return {
    ok: true,
    value: {
      site: p.site,
      conversationId: p.conversationId,
      url: p.url,
      title: clip(typeof p.title === 'string' ? p.title : '', 120),
      generating: p.generating === true,
      messages: clean,
      model: clip(typeof p.model === 'string' ? p.model : '', 60),
      needsInput: typeof p.needsInput === 'string' ? clip(p.needsInput, 200) : null,
      limit: typeof p.limit === 'string' ? clip(p.limit, 200) : null,
    },
  };
}

export function applyWebPayload(s, v, now = Date.now()) {
  const st = s.web || (s.web = { hashes: [] });
  s.source = 'web';
  s.url = v.url;
  if (v.title) s.title = v.title;
  if (v.model) s.model = v.model;
  s.staleMs = 45e3;

  // Synchronizace přepisu: shodný prefix se ponechá, rozepsaná poslední zpráva se aktualizuje na místě.
  const firstChanged = st.hashes.length && v.messages.length && st.hashes[0].text !== v.messages[0].text;
  if (firstChanged || v.messages.length < st.hashes.length - 1) {
    resetTranscript(s);
    st.hashes = [];
  }
  let changed = false;
  v.messages.forEach((m, i) => {
    const known = st.hashes[i];
    if (!known) {
      const entry = pushEntry(s, { at: now, role: m.role, text: m.text });
      st.hashes[i] = { role: m.role, text: m.text, entry };
      changed = true;
    } else if (known.text !== m.text || known.role !== m.role) {
      if (known.entry && s.transcript.includes(known.entry)) updateEntry(s, known.entry, { role: m.role, text: m.text });
      else known.entry = pushEntry(s, { at: now, role: m.role, text: m.text });
      known.text = m.text;
      known.role = m.role;
      changed = true;
    }
  });

  const users = v.messages.filter((m) => m.role === 'user');
  s.turns = users.length;
  if (users.length) {
    s.lastPrompt = users[users.length - 1].text;
    if (!s.firstPrompt) s.firstPrompt = users[0].text;
  }

  if (v.generating && !s.running) {
    s.turnStartedAt = now;
    s.turnSteps = 0;
  }
  s.running = v.generating;
  s.runningAt = now;
  s.activity = v.generating ? 'Generuje odpověď…' : '';
  if (changed || v.generating || !s.lastAt) touch(s, now);

  s.pending = v.needsInput ? { kind: 'question', text: v.needsInput, at: s.pending?.at || now, source: 'web' } : null;
  s.limit = v.limit ? { reached: true, text: v.limit, at: s.limit?.at || now, resetsAt: null } : null;
}

export function createWebConnector(ctx) {
  const { store } = ctx;
  const lastSeen = new Map();

  return {
    id: 'web',
    name: 'Webové aplikace (rozšíření prohlížeče)',
    provider: 'other',
    kind: 'web',
    verified: false,
    source: 'Rozšíření Agenteeq pro Chrome',
    description: 'ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat a GitHub Copilot v prohlížeči.',
    async start() {},
    async scan() {},
    stop() {},
    idle: async () => {},
    ingest(payload, now = Date.now()) {
      const res = validateWebPayload(payload);
      if (!res.ok) return res;
      const v = res.value;
      const site = WEB_SITES[v.site];
      const s = store.ensure({ connector: 'web', localId: `${v.site}:${v.conversationId}`, provider: site.provider, app: site.name, source: 'web' });
      applyWebPayload(s, v, now);
      lastSeen.set(v.site, now);
      store.commit(s, now);
      return { ok: true, id: s.id };
    },
    status() {
      const now = Date.now();
      const active = [...lastSeen.entries()].filter(([, at]) => now - at < 10 * MIN).map(([k]) => WEB_SITES[k].name);
      const recent = [...lastSeen.values()].some((at) => now - at < DAY);
      return {
        state: active.length ? 'connected' : recent ? 'idle' : 'missing',
        detail: active.length ? `Aktivní: ${active.join(', ')}.` : recent ? 'Rozšíření posílalo data během dne.' : 'Rozšíření zatím neposlalo žádná data. Nainstaluj ho v Nastavení.',
        count: lastSeen.size,
        watching: true,
        lastEventAt: Math.max(0, ...lastSeen.values()),
        sites: Object.fromEntries([...lastSeen.entries()]),
      };
    },
  };
}
