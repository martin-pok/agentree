import { clip, MIN, DAY } from '../util.js';
import { touch } from '../model.js';
import { ui } from '../texty.js';

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

const MAX_POCET = 100000;
// Dočasné ID karty, pod kterým rozšíření hlásí novou konverzaci, dokud jí služba nedá vlastní adresu
// (extension/sites.js#tabId). Přejmenovat se smí jen takové – nikdy jiná, skutečná konverzace.
const DOCASNE_ID = /^tab-[\w.:-]{1,196}$/;
const pocet = (n) => (Number.isInteger(n) && n >= 0 ? Math.min(n, MAX_POCET) : 0);

export function validateWebPayload(p) {
  if (!p || typeof p !== 'object') return { ok: false, error: ui('Chybí data.') };
  if (!WEB_SITES[p.site]) return { ok: false, error: ui('Neznámá služba.') };
  if (typeof p.conversationId !== 'string' || !/^[\w.:-]{1,200}$/.test(p.conversationId)) return { ok: false, error: ui('Neplatné ID konverzace.') };
  if (typeof p.url !== 'string' || !/^https:\/\//.test(p.url) || p.url.length > 2000) return { ok: false, error: ui('Neplatná adresa.') };
  // Z webových chatů bere Agenteeq jen stav a počty zpráv. Starší rozšíření (do 0.24) posílá ještě
  // text a název konverzace – z toho se tu spočítají role a text se zahodí, nikam se neuloží.
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
      url: p.url,
      generating: p.generating === true,
      counts,
      model: clip(typeof p.model === 'string' ? p.model : '', 60),
      needsInput: typeof p.needsInput === 'string' ? clip(p.needsInput, 200) : null,
      limit: typeof p.limit === 'string' ? clip(p.limit, 200) : null,
      // Nová konverzace dostala skutečné ID: `predchozi` je dočasné ID karty, pod kterým se hlásila
      // dosud. Cokoli jiného se ignoruje (starší rozšíření pole neposílá).
      predchozi: typeof p.predchozi === 'string' && DOCASNE_ID.test(p.predchozi) && p.predchozi !== p.conversationId ? p.predchozi : null,
    },
  };
}

export function applyWebPayload(s, v, now = Date.now()) {
  const st = s.web || (s.web = { counts: { user: 0, assistant: 0 } });
  s.source = 'web';
  s.url = v.url;
  // Název konverzace vzniká z jejího obsahu, a tak se nebere. Rozliší ji konec jejího ID.
  s.title = ui('{0} · konverzace {1}', WEB_SITES[v.site]?.name || ui('Webový chat'), v.conversationId.replace(/[^A-Za-z0-9]/g, '').slice(-4) || v.conversationId.slice(-4));
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
    description: ui('ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat a GitHub Copilot v prohlížeči.'),
    async start() {},
    async scan() {},
    stop() {},
    idle: async () => {},
    ingest(payload, now = Date.now()) {
      const res = validateWebPayload(payload);
      if (!res.ok) return res;
      const v = res.value;
      const site = WEB_SITES[v.site];
      const localId = `${v.site}:${v.conversationId}`;
      // Nová konverzace se hlásí pod dočasným ID karty, dokud jí služba nedá adresu. Pak je to pořád
      // tatáž konverzace: stav se přesune pod skutečné ID a dočasný záznam zmizí – jinak by po první
      // odpovědi byly v přehledu dvě.
      const stara = v.predchozi ? store.get(`web:${v.site}:${v.predchozi}`) : null;
      if (stara && !store.get(`web:${localId}`)) {
        const nova = store.ensure({ connector: 'web', localId, provider: site.provider, app: site.name, source: 'web' });
        Object.assign(nova, { ...stara, id: nova.id, localId: nova.localId });
      }
      if (stara) store.remove(stara.id);
      const s = store.ensure({ connector: 'web', localId, provider: site.provider, app: site.name, source: 'web' });
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
