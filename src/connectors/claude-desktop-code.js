import path from 'node:path';
import { appSupportDir, prihlaseniClaudeCode } from '../platform.js';
import { statSafe, toTs, clip, DAY, MIN } from '../util.js';
import { createSession, touch } from '../model.js';
import { watchTree, createFileQueue } from '../watch.js';
import { readClaudeDesktopCache } from '../claude-desktop-cache.js';
import { applyClaudeLine, newFileState, STATUS_WINDOWS } from './claude-code.js';
import { ui } from '../texty.js';
import { kartaZWebu, webIdClaudeCode } from './web.js';

const SESSION = /^session_[A-Za-z0-9]{8,80}$/;
export const remoteId = (value) => typeof value === 'string' && SESSION.test(value) ? value : '';

// Desktop's persisted query cache contains server-reported remote-session metadata.
// Its separate code conversation cache may hold only an older portion of the transcript.
// Never infer missing turns/tokens, an elapsed working period, or a fresh process from mtime.
//
// Ověřený zdroj je dotaz `sessions_api_list_sessions` (stránky seznamu). Relace se ale hledá podle
// tvaru ve všech uložených dotazech: když Desktop drží i dotaz na jednu otevřenou relaci (název klíče
// neznáme, na disku neověřené 🧪), bývá čerstvější než seznam a stav vzdáleného agenta pak neleží
// minuty. Za relaci se považuje jen objekt s `id: "session_…"`, platným `updated_at` a polem stavu;
// z každé se nechá záznam s nejnovějším `updated_at`, při shodě ten s pozdějším načtením.
const LIST = 'sessions_api_list_sessions';
const jeRelace = (s) => Boolean(s && typeof s === 'object' && !Array.isArray(s)
  && (s.type === undefined || s.type === 'session') && remoteId(s.id) && Number.isFinite(Date.parse(s.updated_at))
  && ('session_status' in s || 'status_bucket' in s));
function relaceVDatech(d) {
  if (!d || typeof d !== 'object') return [];
  if (jeRelace(d)) return [d];
  const out = [];
  const projdi = (list) => { if (Array.isArray(list)) for (const x of list) if (jeRelace(x)) out.push(x); };
  projdi(d);
  projdi(d.data);
  if (Array.isArray(d.pages)) for (const page of d.pages) { if (jeRelace(page)) out.push(page); else projdi(page?.data); }
  return out;
}
export function remoteSessions(records) {
  const cache = records.find((x) => x.key === 'react-query-cache')?.value;
  const queries = cache?.clientState?.queries;
  if (!Array.isArray(queries)) return null;
  const sessions = new Map();
  let seznam = false, observedAt = 0;
  for (const q of queries) {
    const list = Array.isArray(q?.queryKey) && q.queryKey[0] === LIST;
    const found = relaceVDatech(q?.state?.data);
    if (!list && !found.length) continue;
    seznam ||= list;
    const at = Number(q.state?.dataUpdatedAt) || 0;
    observedAt = Math.max(observedAt, at);
    for (const s of found) {
      const old = sessions.get(s.id);
      const novejsi = !old || Date.parse(s.updated_at) > Date.parse(old.updated_at)
        || (Date.parse(s.updated_at) === Date.parse(old.updated_at) && at > old._observedAt);
      if (novejsi) sessions.set(s.id, { ...s, _observedAt: at });
    }
  }
  if (!seznam && !sessions.size) return null;
  return { sessions: [...sessions.values()], observedAt };
}
// Stránka Usage na claude.ai (i v Claude Desktopu) načítá vytížení plánu: `five_hour` a `seven_day`
// s `utilization` (procenta) a `resets_at` (ISO čas obnovy od serveru) – stejná dvojice, jakou hlásí
// stavový řádek Claude Code. Když ji Desktop uloží do trvalé cache dotazů, máme přesný čas obnovy
// i bez běžící konverzace. Dotaz se hledá podle tvaru odpovědi, ne podle jména klíče (to není
// zdokumentované) a platí k `state.dataUpdatedAt`. Nic jiného z odpovědi se nečte. 🧪 Beta:
// tvar pochází z odpovědi claude.ai, v cache na skutečném Macu ověřený není (docs/CONNECTORS.md).
const OKNO_USAGE = (w) => w && typeof w === 'object' && typeof w.utilization === 'number' && Number.isFinite(w.utilization)
  && (w.resets_at === null || w.resets_at === undefined || Number.isFinite(Date.parse(w.resets_at)));

export function desktopUsage(records, now = Date.now()) {
  const queries = records.find((x) => x.key === 'react-query-cache')?.value?.clientState?.queries;
  if (!Array.isArray(queries)) return null;
  let nejlepsi = null;
  for (const q of queries) {
    const d = q?.state?.data;
    const at = Number(q?.state?.dataUpdatedAt);
    if (!d || typeof d !== 'object' || !(at > 0) || at > now + 60e3) continue;
    if (!OKNO_USAGE(d.five_hour) && !OKNO_USAGE(d.seven_day)) continue;
    if (!nejlepsi || at > nejlepsi.at) nejlepsi = { at, five_hour: OKNO_USAGE(d.five_hour) ? d.five_hour : null, seven_day: OKNO_USAGE(d.seven_day) ? d.seven_day : null };
  }
  if (!nejlepsi) return null;
  const okno = (w) => w && { usedPercent: Math.max(0, Math.min(100, w.utilization)), resetsAt: w.resets_at ? Date.parse(w.resets_at) : null };
  return { at: nejlepsi.at, five_hour: okno(nejlepsi.five_hour), seven_day: okno(nejlepsi.seven_day) };
}

export function applyDesktopUsage(store, usage) {
  if (!usage) return false;
  let wrote = false;
  for (const key of ['five_hour', 'seven_day']) {
    const w = usage[key];
    if (!w) continue;
    const def = STATUS_WINDOWS[key];
    store.setLimit({
      id: `${def.id}:desktop`, provider: 'anthropic', app: 'Claude', label: def.label,
      usedPercent: w.usedPercent, windowMinutes: def.minutes, resetsAt: w.resetsAt, reached: w.usedPercent >= 100,
      plan: null, text: '', at: usage.at, source: 'desktop-usage', kind: 'window',
    });
    wrote = true;
  }
  return wrote;
}

export function applyRemoteSession(s, metadata, cached, observedAt, now = Date.now()) {
  const st = newFileState(), seen = new Set();
  const messages = cached?.tree?.kind === 'code_session' && Array.isArray(cached.tree.messages) ? cached.tree.messages : [];
  const ordered = messages.filter((m) => m && ['user', 'assistant', 'result'].includes(m.type))
    .sort((a, b) => toTs(a.created_at || a.timestamp) - toTs(b.created_at || b.timestamp));
  for (const m of ordered) {
    // SDK subagent output does not belong to the parent's token counts.
    if (m.parent_tool_use_id) continue;
    const id = m.uuid || m.event_uuid;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const ts = toTs(m.created_at || m.timestamp);
    if (!ts || ts > now) continue;
    if (m.type === 'result') { s.running = false; s.toolWaitSince = 0; continue; }
    applyClaudeLine(st, s, { ...m, timestamp: new Date(ts).toISOString() });
  }
  // Co o běhu říká uložený přepis: tah bez odpovědi a čas poslední zprávy. Seznam relací ho
  // přebije, jen když je novější (applyReportedStatus).
  s.remotePrepis = { running: Boolean(s.running), at: s.running ? s.runningAt : 0, activity: s.running ? s.activity : '' };
  const updated = Math.min(Date.parse(metadata.updated_at), now);
  const created = Date.parse(metadata.created_at);
  if (Number.isFinite(created) && created > 0 && created <= updated) s.startedAt = created;
  // One point = reported source update, not a continuous multi-day work span.
  touch(s, updated);
  // Jen horní mez; na zobrazení zkracuje model.js#summarize na hranici slova s „…“.
  s.title = clip(typeof metadata.title === 'string' ? metadata.title : '', 400);
  s.source = 'desktop-cache';
  s.app = ui('Claude Desktop · vzdálený Code');
  s.url = `https://claude.ai/code/${metadata.id}`;
  s.resume = null; s.cwd = ''; // Remote VM paths are never local folders/resume commands.
  s.model = clip(typeof metadata.session_context?.model === 'string' ? metadata.session_context.model : s.model, 80);
  // Zdroj je v REST tvaru `{ type: 'git_repository', url }`, ve výčtovém `{ git_repository: { url } }`.
  const zdroje = Array.isArray(metadata.session_context?.sources) ? metadata.session_context.sources : [];
  const repo = zdroje.map((x) => x?.type === 'git_repository' ? x : x?.git_repository).find((x) => x && typeof x === 'object');
  if (repo && typeof repo.url === 'string') {
    const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)(?:\.git)?$/.exec(repo.url);
    if (match) s.repo = match[1].replace(/\.git$/, '');
    if (typeof repo.revision === 'string') s.branch = clip(repo.revision, 100);
  }
  applyReportedStatus(s, metadata, observedAt, now);
  s.observation = {
    at: observedAt, transcriptThrough: messages.reduce((at, m) => Math.max(at, toTs(m.created_at || m.timestamp) || 0), 0),
    partial: true, // Cache is never an authoritative complete transcript.
  };
  return s;
}
// Hodnoty stavu relace. Interní API Claude Code na webu je píše jako výčet: `session_status`
// „SESSION_STATUS_RUNNING“ / „…_IDLE“ / „…_ARCHIVED“, `status_bucket` „SESSION_STATUS_BUCKET_WORKING“ /
// „…_BLOCKED“ / „…_REVIEW_READY“ / „…_COMPLETED“ / „…_FAILED“ a `post_turn_summary.status_category`
// „need_input“ / „review_ready“ / „completed“ / „failed“ (ověřeno 13. 10. 2026 na skutečných relacích
// téhož účtu). Seznam v cache Claude Desktopu má REST tvar (`type: 'session'`, zdroje s `type`) a
// hodnoty v něm se čekají malými písmeny („running“, „requires_action“) – na disku zatím neověřené
// (docs/CONNECTORS.md), proto se čte obojí. Dřív se čekání poznávalo jen podle „needs_input“ /
// „needs_action“, které neposílá ani jedna podoba, takže vzdálený agent čekající na rozhodnutí
// o pozornost nikdy nežádal.
const hodnota = (v, predpona) => typeof v === 'string' ? v.trim().toLowerCase().replace(predpona, '') : '';
const STAV_PRACUJE = new Set(['running', 'working', 'busy']);
const STAV_CEKA = new Set(['requires_action', 'needs_input', 'need_input', 'needs_action', 'blocked']);
const STAV_SELHAL = new Set(['failed', 'error']);
export function hlasenyStav(metadata) {
  const stav = hodnota(metadata?.session_status, /^session_status_/);
  const skupina = hodnota(metadata?.status_bucket, /^session_status_bucket_/);
  const kategorie = hodnota(metadata?.post_turn_summary?.status_category, '');
  // Souhrn po tahu zůstává z minulého tahu i během nového, proto má běh přednost.
  if (STAV_PRACUJE.has(stav) || STAV_PRACUJE.has(skupina)) return 'working';
  if (STAV_CEKA.has(stav) || STAV_CEKA.has(skupina) || STAV_CEKA.has(kategorie)) return 'needs_input';
  if (STAV_SELHAL.has(stav) || STAV_SELHAL.has(skupina) || STAV_SELHAL.has(kategorie)) return 'failed';
  return '';
}

// Hlášený stav platí k okamžiku, kdy Claude Desktop seznam načetl (`observedAt`), ne k „teď“.
// „Pracuje“ drží deriveStatus 2 minuty od načtení; starší hlášení je nečerstvé („stale“) se
// vlastním důvodem. Dřív se nečerstvé „pracuje“ zahodilo a relace se ukázala jako „Hotovo, čeká
// na další zadání“ – o agentovi, který podle posledních známých dat pracoval. Čekání na rozhodnutí
// a selhání se samy nezmění: zůstávají vidět od `updated_at` (změna na serveru), ale se starší cache
// je deriveStatus hlásí jako nečerstvé s časem načtení („· stav z 18. 10. 14:05“).
function applyReportedStatus(s, metadata, observedAt, now) {
  const updated = Math.min(Date.parse(metadata.updated_at), now);
  const observed = observedAt > 0 && observedAt <= now + 1000 ? Math.min(observedAt, now) : 0;
  const hlaseno = hlasenyStav(metadata);
  const prepis = s.remotePrepis || { running: false, at: 0, activity: '' };
  const hlasenoAt = observed || updated;
  s.staleMs = 2 * MIN;
  s.toolWaitSince = 0;
  s.pending = null; s.limit = null; s.failure = null;
  s.staleReason = ui('Při posledním načtení pracoval · novější stav Claude Desktop neuložil');
  if (hlaseno === 'working') {
    s.running = true;
    s.runningAt = Math.max(hlasenoAt, prepis.running ? prepis.at : 0);
    s.activity = prepis.running && prepis.at >= hlasenoAt && prepis.activity ? prepis.activity : ui('Pracuje podle stavu v Claude Desktopu');
    return;
  }
  if (prepis.running && prepis.at > hlasenoAt) {
    // Uložený přepis je novější než seznam relací a tah v něm ještě neskončil.
    s.running = true;
    s.runningAt = prepis.at;
    s.activity = prepis.activity || ui('Pracuje podle stavu v Claude Desktopu');
    return;
  }
  s.running = false;
  s.runningAt = hlasenoAt;
  s.activity = '';
  if (hlaseno === 'failed') {
    s.failure = { at: updated, observedAt: hlasenoAt, text: ui('Vzdálený agent skončil chybou. Podrobnosti otevři v Claude.') };
  } else if (hlaseno === 'needs_input') {
    const otazka = metadata.post_turn_summary?.needs_action;
    s.pending = { kind: 'question', at: updated, observedAt: hlasenoAt, text: typeof otazka === 'string' && otazka.trim() ? clip(otazka.trim(), 200) : ui('Vzdálený agent potřebuje rozhodnutí. Otevři Claude.'), source: 'desktop-cache' };
  }
}
// Seznam cloudových relací přímo z účtu – týž dotaz, kterým ho čte Claude Code (`claude --teleport`):
// GET https://api.anthropic.com/v1/code/sessions s přihlášením Claude Code. Vrací `worker_status`
// („running“ / „idle“ / „requires_action“), `status` (archivace), `last_event_at` a `config`
// (zdroje, model). Do tvaru seznamu v cache Claude Desktopu ho převádí stejně jako Claude Code
// (`type: 'session'`, `session_status`), takže stav čte tatáž hlasenyStav. Interní API, 🧪 Beta.
// Id relace přichází jako `session_…`, případně `cse_…` se stejnou příponou.
export const CLOUD_API = 'https://api.anthropic.com/v1/code/sessions';
export function relaceZApi(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = remoteId(typeof raw.id === 'string' ? raw.id.replace(/^cse_/, 'session_') : '');
  const updated = [raw.last_event_at, raw.updated_at, raw.created_at].find((t) => typeof t === 'string' && Number.isFinite(Date.parse(t)));
  if (!id || !updated) return null;
  const stav = raw.status === 'archived' ? 'archived' : raw.status === 'failed' ? 'failed' : typeof raw.worker_status === 'string' ? raw.worker_status : 'idle';
  return {
    type: 'session', id, title: typeof raw.title === 'string' ? raw.title : '',
    created_at: typeof raw.created_at === 'string' ? raw.created_at : updated, updated_at: updated, session_status: stav,
    session_context: { sources: Array.isArray(raw.config?.sources) ? raw.config.sources : [], model: typeof raw.config?.model === 'string' ? raw.config.model : null },
  };
}
// Chyby jsou věty pro Nastavení; nikdy se z nich nestane „nic neběží“.
export async function nactiCloudoveRelace({ prihlaseni, fetchImpl = globalThis.fetch, now = Date.now() }) {
  const p = await prihlaseni();
  if (!p) throw Object.assign(new Error(ui('Přihlášení Claude Code se nepodařilo přečíst (není přihlášený, nebo přístup ke Klíčence nebyl povolen) – stav cloudových agentů z účtu nejde zjistit.')), { prihlaseni: true });
  if (p.expiresAt && p.expiresAt <= now) throw Object.assign(new Error(ui('Přihlášení Claude Code vypršelo. Stačí spustit Claude Code, sám si ho obnoví.')), { prihlaseni: true });
  let res;
  try {
    res = await fetchImpl(CLOUD_API, { headers: { Authorization: `Bearer ${p.accessToken}`, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000) });
  } catch { throw new Error(ui('Účet Claude neodpověděl (síť). Zkusí se to znovu.')); }
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error(ui('Účet Claude odmítl přihlášení Claude Code. Spusť Claude Code a přihlas se znovu.')), { prihlaseni: true });
  if (!res.ok) throw new Error(ui('Účet Claude vrátil chybu {0}. Zkusí se to znovu.', res.status));
  let data;
  try { data = await res.json(); } catch { throw new Error(ui('Účet Claude vrátil nečitelný seznam relací.')); }
  if (!Array.isArray(data?.data)) throw new Error(ui('Účet Claude nevrátil seznam relací.'));
  return { sessions: data.data.map(relaceZApi).filter(Boolean), observedAt: now };
}
// Z cache Claude Desktopu a ze seznamu z účtu platí u každé relace záznam s novějším `updated_at`,
// při shodě ten s pozdějším načtením (stejné pravidlo jako uvnitř remoteSessions).
export function slucRelace(...zdroje) {
  const out = new Map();
  for (const z of zdroje) {
    if (!z) continue;
    for (const x of z.sessions) {
      const s = x._observedAt === undefined ? { ...x, _observedAt: z.observedAt } : x;
      const old = out.get(s.id);
      if (!old || Date.parse(s.updated_at) > Date.parse(old.updated_at)
        || (Date.parse(s.updated_at) === Date.parse(old.updated_at) && s._observedAt > old._observedAt)) out.set(s.id, s);
    }
  }
  return [...out.values()];
}

// Kdy Claude Desktop seznam relací naposledy uložil – stav vzdálených agentů je přesně tak čerstvý.
const kdy = (ts) => {
  const d = new Date(ts);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export function createClaudeDesktopCodeConnector({ config, store, claudeCloud = {} }) {
  const root = path.join(appSupportDir(config.sourceHome), 'Claude', 'IndexedDB');
  const dir = path.join(root, 'https_claude.ai_0.indexeddb.leveldb');
  let watcher, exists = false, lastEventAt = 0, error = '', stopped = false, seznamAt = 0;
  const known = new Set(), fingerprints = new Map();
  // Poslední přečtená cache Desktopu a poslední seznam z účtu; každý zdroj se obnovuje sám.
  let zCache = null, prepisy = new Map();
  // Seznam z účtu (🧪): zapnutý se síťovými funkcemi (config.cloudFetch, v testech vypnuté).
  const api = { zapnuto: claudeCloud.enabled ?? config.cloudFetch, data: null, error: '', at: 0, pokusAt: 0, timer: null, bezi: null };
  // Přihlášení se čte jednou a drží v paměti do vypršení (Klíčenka se nečte každých 15 s). Po chybě
  // přihlášení se 10 minut znovu nečte – kdyby macOS na přístup ke Klíčence ptal, neptá se pořád.
  const cist = claudeCloud.prihlaseni || (() => prihlaseniClaudeCode(config));
  const tok = { p: null, chybaAt: 0 };
  const prihlaseni = async () => {
    if (tok.p && !(tok.p.expiresAt && tok.p.expiresAt <= Date.now())) return tok.p;
    if (tok.chybaAt && Date.now() - tok.chybaAt < 10 * MIN) return null;
    tok.p = await cist();
    if (!tok.p || (tok.p.expiresAt && tok.p.expiresAt <= Date.now())) tok.chybaAt = Date.now();
    return tok.p;
  };
  const queue = createFileQueue(sync, 60);
  async function sync() {
    if (stopped) return;
    exists = Boolean(await statSafe(dir));
    if (!exists) { zCache = null; zpracuj(); return; }
    try {
      const records = await readClaudeDesktopCache(dir), data = remoteSessions(records);
      // Vytížení plánu z uložené stránky Usage – nezávisle na tom, jestli cache nese vzdálené relace.
      if (applyDesktopUsage(store, desktopUsage(records))) lastEventAt = Date.now();
      if (!data) { error = ui('Cache neobsahuje seznam vzdálených agentů. Otevři v Claude kartu Code.'); zCache = null; zpracuj(); return; }
      seznamAt = data.observedAt;
      const cache = new Map();
      for (const { value } of records) {
        if (value?.product !== 'code' || value.tree?.kind !== 'code_session') continue;
        const id = remoteId(String(value.conversationUuid || '').replace(/^code:cse_/, 'session_'));
        if (id && (!cache.has(id) || (value.writtenAt || 0) > (cache.get(id).writtenAt || 0))) cache.set(id, value);
      }
      zCache = data;
      prepisy = cache;
      // The list is paginated: absence from its first page is not proof of deletion.
      error = '';
      zpracuj();
    } catch {
      error = ui('Cache Claude se právě zapisuje nebo má neznámý formát. Poslední záznamy zůstávají zachované; načtení se zopakuje.');
    }
  }
  function zpracuj() {
    const cache = prepisy;
    for (const metadata of slucRelace(zCache, api.data)) {
      if (Date.now() - Date.parse(metadata.updated_at) > config.windowDays * DAY) continue;
      const id = `claude-desktop-code:${metadata.id}`;
      const { _observedAt, ...facts } = metadata;
      const fingerprint = JSON.stringify([facts, cache.get(metadata.id)?.writtenAt]);
      known.add(id);
      if (fingerprints.get(id) === fingerprint) {
        const existing = store.get(id);
        if (existing && existing.observation.at !== _observedAt) {
          applyReportedStatus(existing, metadata, _observedAt, Date.now());
          existing.observation.at = _observedAt;
          store.commit(existing); // Refresh reported status, preserve transcript and open UI.
        }
        continue;
      }
      const s = createSession({ connector: 'claude-desktop-code', localId: metadata.id, provider: 'anthropic', app: ui('Claude Desktop · vzdálený Code') });
      const previous = store.get(id);
      if (previous) s.seq = previous.seq; // A shorter cache must not look like an older SSE snapshot.
      applyRemoteSession(s, metadata, cache.get(metadata.id), _observedAt);
      s.resetTranscript = Boolean(previous);
      // Otevřená karta claude.ai/code s touž relací (rozšíření, web.js): živý důkaz zůstává u relace
      // a webová konverzace, která vznikla dřív než záznam v cache, se do ní převede – agent je jeden.
      const web = store.get(webIdClaudeCode(metadata.id));
      s.karta = web ? kartaZWebu(web) : previous?.karta || null;
      if (s.karta?.lastAt) touch(s, s.karta.lastAt);
      if (web) store.remove(web.id);
      store.sessions.set(id, s);
      store.commit(s);
      fingerprints.set(id, fingerprint);
      lastEventAt = Date.now();
    }
  }
  // Každých 15 s; „pracuje“ drží deriveStatus 2 minuty od načtení, takže jeden výpadek stav nezestárne.
  async function nactiZUctu() {
    if (!api.zapnuto || stopped) return;
    if (api.bezi) return api.bezi;
    api.pokusAt = Date.now();
    api.bezi = (async () => {
      try {
        api.data = await nactiCloudoveRelace({ prihlaseni, fetchImpl: claudeCloud.fetchImpl });
        api.at = api.data.observedAt;
        api.error = '';
        zpracuj();
      } catch (e) {
        api.error = e.message;
        if (e.prihlaseni) { tok.p = null; tok.chybaAt ||= Date.now(); }
      }
    })().finally(() => { api.bezi = null; });
    return api.bezi;
  }
  const popis = () => {
    const casti = [];
    if (api.zapnuto) casti.push(api.error ? ui('Stav z účtu Claude: {0}', api.error) : api.at ? ui('Stav cloudových agentů čtu přímo z účtu Claude (naposledy {0}).', kdy(api.at)) : '');
    if (error) casti.push(error);
    else if (zCache) casti.push(seznamAt ? ui('Cache Claude Desktopu uložila seznam relací {0}.', kdy(seznamAt)) : ui('Čtu i místní cache Claude Desktopu.'));
    return casti.filter(Boolean).join(' ');
  };
  return {
    id: 'claude-desktop-code', name: ui('Claude Desktop · vzdálený Code'), provider: 'anthropic', kind: 'local', verified: false,
    source: ui('Účet Claude (seznam relací jako Claude Code) a Claude/IndexedDB (místní cache)'),
    description: ui('Vzdálení agenti Claude Code: stav přímo z účtu Claude, dostupná část přepisu z cache Claude Desktopu. Interní formáty; tokeny mohou být neúplné.'),
    async start() {
      await queue.run(dir);
      watcher = watchTree(root, () => queue.schedule(dir), { retryMs: 500 });
      if (api.zapnuto) { await nactiZUctu(); api.timer = setInterval(nactiZUctu, claudeCloud.intervalMs || 15000); api.timer.unref?.(); }
    },
    // Pravidelný průchod aplikace seznam z účtu nežádá častěji než jednou za 10 s; ruční obnova (force) hned.
    scan: async (force = false) => { await queue.run(dir); if (force) tok.chybaAt = 0; if (force || Date.now() - api.pokusAt >= 10000) await nactiZUctu(); },
    stop() { stopped = true; watcher?.close(); queue.clear(); clearInterval(api.timer); }, idle: async () => { await queue.idle(); await api.bezi; },
    status: () => {
      const ziveOk = api.zapnuto && !api.error && api.at > 0;
      const stav = ziveOk ? 'connected' : error ? 'error' : api.zapnuto && api.error && !exists ? 'error' : !exists && !ziveOk ? 'missing' : known.size ? 'connected' : 'idle';
      return { state: stav, detail: popis() || (known.size ? ui('Sleduji {0} vzdálených relací.', known.size) : ui('Zatím bez vzdálených agentů.')), count: known.size, seznamAt, zivyAt: api.at, watching: Boolean(watcher?.active), lastEventAt };
    },
  };
}
