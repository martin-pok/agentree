import path from 'node:path';
import fsp from 'node:fs/promises';
import { statSafe, toTs, isInjectedPrompt, clip, clipBlock, MIN, DAY } from '../util.js';
import { touch, addTokens, pushEntry, resetTranscript } from '../model.js';
import { watchTree, createFileQueue, listFiles } from '../watch.js';
import { noDataState } from './install-state.js';
import { ui } from '../texty.js';

// Gemini CLI a Qwen Code mají společný původ, ale jejich záznamy konverzací se rozešly:
//
//   Gemini CLI  ~/.gemini/tmp/<projekt>/chats/session-<čas>-<id>.jsonl   (pomocníci o úroveň níž)
//               řádky: metadata relace, zprávy (stejné id = poslední platí), `$set`, `$rewindTo`.
//               Starší verze psaly jeden .json s polem `messages` – čte se dál.
//   Qwen Code   ~/.qwen/projects/<složka-projektu>/chats/<relace>.jsonl
//               strom záznamů { uuid, parentUuid, sessionId, type, message, usageMetadata } jako Claude Code.
//
// Formát je ověřený ve zdrojovém kódu obou nástrojů (gemini-cli chatRecordingService.ts,
// qwen-code chatRecordingService.ts). Dřív konektor hledal jen starý .json – moderní Gemini CLI
// i Qwen Code tak neukázaly ani jednu konverzaci.

export function roleOf(m) {
  const t = String(m?.type || m?.role || '').toLowerCase();
  if (t === 'user') return 'user';
  if (['gemini', 'model', 'assistant', 'qwen'].includes(t)) return 'assistant';
  if (t === 'error') return 'error';
  if (t === 'tool' || t === 'tool_result') return 'tool';
  return 'system';
}

// Text z obsahu ve tvaru Gemini API: řetězec, jedna část { text }, pole částí nebo Content { parts }.
export function partsText(x) {
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) return x.map(partsText).filter(Boolean).join('\n');
  if (x && typeof x === 'object') {
    if (typeof x.text === 'string') return x.text;
    if (Array.isArray(x.parts)) return partsText(x.parts);
  }
  return '';
}

// Tokeny v Gemini API: `prompt` je celý vstup včetně části z mezipaměti (`cached`), výsledky
// nástrojů se účtují navíc (`tool`), přemýšlení modelu se účtuje jako výstup (`thoughts`).
// Hlavní metrika je stejná jako u ostatních nástrojů: vstup bez mezipaměti + výstup (model.js#addTokens).
export function geminiTokens({ input = 0, output = 0, cached = 0, thoughts = 0, tool = 0 } = {}) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { input: Math.max(0, n(input) - n(cached)) + n(tool), output: n(output) + n(thoughts), cacheRead: n(cached) };
}

export function applyGeminiChat(s, j, mtimeMs, now = Date.now()) {
  s.tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  s.hourly = {};
  s.turns = 0;
  s.startedAt = 0;
  s.lastAt = 0;
  s.minutes = new Set();
  resetTranscript(s);
  const messages = Array.isArray(j.messages) ? j.messages : [];
  for (const m of messages) {
    const ts = toTs(m.timestamp) || toTs(j.lastUpdated) || mtimeMs;
    touch(s, ts);
    const role = roleOf(m);
    // Uživatel vidí `displayContent` (před rozbalením příloh); ten je pravdivější popis zadání.
    const raw = partsText(role === 'user' && m.displayContent ? m.displayContent : m.content ?? m.parts);
    const text = clipBlock(raw, 4000);
    if (role === 'user') {
      if (text && !isInjectedPrompt(text)) {
        s.turns++;
        s.lastPrompt = text;
        if (!s.firstPrompt) s.firstPrompt = text;
        pushEntry(s, { at: ts, role, text });
      }
    } else if (text) {
      pushEntry(s, { at: ts, role, text });
    }
    for (const call of Array.isArray(m.toolCalls) ? m.toolCalls : []) {
      pushEntry(s, {
        at: ts,
        role: 'tool',
        tool: clip(call?.displayName || call?.name || ui('Nástroj'), 60),
        text: clip(call?.description || (call?.args ? JSON.stringify(call.args) : ''), 300),
        status: call?.status === 'error' ? 'error' : undefined,
      });
    }
    if (typeof m.model === 'string') s.model = m.model;
    if (m.tokens && typeof m.tokens === 'object') addTokens(s, ts, geminiTokens(m.tokens));
  }
  touch(s, toTs(j.startTime));
  if (typeof j.projectRoot === 'string') s.cwd = j.projectRoot;
  const last = messages[messages.length - 1];
  s.staleMs = 2 * MIN;
  s.running = Boolean(last) && roleOf(last) === 'user' && now - mtimeMs < 2 * MIN;
  s.runningAt = mtimeMs;
  s.turnStartedAt = s.running ? toTs(last.timestamp) || mtimeMs : 0;
}

// Čte JSONL záznam Gemini CLI přesně tak, jak ho čte samo Gemini CLI: zpráva se stejným id
// nahradí předchozí (tokeny se k odpovědi dopisují dodatečně – sečíst oba řádky by je zdvojilo),
// `$set.messages` přepíše celou historii a `$rewindTo` zahodí vše od dané zprávy dál.
export function parseGeminiJsonl(text) {
  let meta = {};
  const zpravy = new Map();
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r || typeof r !== 'object') continue;
    if (typeof r.$rewindTo === 'string') {
      let nalezeno = false;
      const smazat = [];
      for (const id of zpravy.keys()) {
        if (id === r.$rewindTo) nalezeno = true;
        if (nalezeno) smazat.push(id);
      }
      if (nalezeno) for (const id of smazat) zpravy.delete(id);
      else zpravy.clear();
    } else if (typeof r.id === 'string') {
      zpravy.set(r.id, r);
    } else if (r.$set && typeof r.$set === 'object') {
      const { messages, ...zbytek } = r.$set;
      if (Array.isArray(messages)) {
        zpravy.clear();
        for (const m of messages) if (typeof m?.id === 'string') zpravy.set(m.id, m);
      }
      meta = { ...meta, ...zbytek };
    } else if (typeof r.sessionId === 'string') {
      const { messages, ...zbytek } = r;
      if (Array.isArray(messages)) for (const m of messages) if (typeof m?.id === 'string') zpravy.set(m.id, m);
      meta = { ...meta, ...zbytek };
    }
  }
  return { ...meta, messages: [...zpravy.values()] };
}

// Qwen Code: jeden záznam na řádek. Odpověď s tokeny se zapisuje jednou. Relace rozvětvená
// příkazem /branch si ale kopíruje zprávy rodiče doslova – poznají se podle `forkedFrom`
// a do tokenů se nepočítají (spotřebovala je relace, ze které pocházejí).
export function applyQwenJsonl(s, text, mtimeMs, now = Date.now()) {
  s.tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  s.hourly = {};
  s.turns = 0;
  s.startedAt = 0;
  s.lastAt = 0;
  s.minutes = new Set();
  resetTranscript(s);
  let posledni = null;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r || typeof r !== 'object' || typeof r.type !== 'string') continue;
    const ts = toTs(r.timestamp) || mtimeMs;
    if (typeof r.cwd === 'string' && r.cwd) s.cwd = r.cwd;
    if (typeof r.gitBranch === 'string' && r.gitBranch) s.branch = r.gitBranch;
    if (r.type === 'system') {
      const titulek = r.subtype === 'custom_title' ? r.systemPayload?.customTitle : null;
      if (typeof titulek === 'string' && titulek.trim()) s.title = clip(titulek.trim(), 120);
      continue;
    }
    touch(s, ts);
    posledni = r;
    const parts = Array.isArray(r.message?.parts) ? r.message.parts : [];
    if (r.type === 'user') {
      const t = clipBlock(partsText(parts), 4000);
      if (t && !isInjectedPrompt(t)) {
        s.turns++;
        s.lastPrompt = t;
        if (!s.firstPrompt) s.firstPrompt = t;
        pushEntry(s, { at: ts, role: 'user', text: t });
      }
    } else if (r.type === 'assistant') {
      const t = clipBlock(partsText(parts), 4000);
      if (t) pushEntry(s, { at: ts, role: 'assistant', text: t });
      for (const p of parts) {
        if (p?.functionCall) pushEntry(s, { at: ts, role: 'tool', tool: clip(p.functionCall.name || ui('Nástroj'), 60), text: clip(p.functionCall.args ? JSON.stringify(p.functionCall.args) : '', 300) });
      }
      if (typeof r.model === 'string' && r.model) s.model = r.model;
      const u = r.usageMetadata;
      if (u && typeof u === 'object' && !r.forkedFrom) {
        addTokens(s, ts, geminiTokens({
          input: u.promptTokenCount, output: u.candidatesTokenCount, cached: u.cachedContentTokenCount,
          thoughts: u.thoughtsTokenCount, tool: u.toolUsePromptTokenCount,
        }));
      }
    }
  }
  // Pracuje, když poslední slovo patří uživateli nebo výsledku nástroje, případně když model
  // právě volá nástroj – a soubor se změnil v posledních dvou minutách.
  const volaNastroj = posledni?.type === 'assistant' && (posledni.message?.parts || []).some((p) => p?.functionCall);
  s.staleMs = 2 * MIN;
  s.running = Boolean(posledni) && (posledni.type === 'user' || posledni.type === 'tool_result' || volaNastroj) && now - mtimeMs < 2 * MIN;
  s.runningAt = mtimeMs;
  s.turnStartedAt = s.running ? toTs(posledni.timestamp) || mtimeMs : 0;
}

// `listFiles` hledá soubory v PŘESNĚ dané úrovni pod kořenem, ne „až do“ ní – proto výčet úrovní.
const FORMATY = {
  // Gemini CLI: tmp/<projekt>/chats/*.jsonl|*.json (úroveň 2), pomocníci v chats/<rodič>/*.jsonl (úroveň 3)
  gemini: { sub: 'tmp', urovne: [2, 3], source: (dir) => `~/${dir}/tmp/*/chats` },
  // Qwen Code: projects/<složka>/chats/<relace>.jsonl (vedle leží *.runtime.json – ty nejsou konverzace)
  qwen: { sub: 'projects', urovne: [2], source: (dir) => `~/${dir}/projects/*/chats` },
};

export function createGeminiFamilyConnector(ctx, { id, name, dir, provider, app, bin, format = 'gemini', verified = false }) {
  const { store, config } = ctx;
  const f = FORMATY[format];
  const root = path.join(config.sourceHome, dir, f.sub);
  const windowMs = config.windowDays * DAY;
  const seen = new Map();
  let watcher = null;
  let exists = false;
  let lastEventAt = 0;
  const queue = createFileQueue(sync, 150);

  // Soubor konverzace a případná rodičovská relace (Gemini ukládá pomocníky do složky rodiče).
  function rozbor(file) {
    const slozka = path.basename(path.dirname(file));
    const nadrazena = path.basename(path.dirname(path.dirname(file)));
    if (format === 'qwen') return slozka === 'chats' && file.endsWith('.jsonl') ? { parent: '' } : null;
    if (!file.endsWith('.jsonl') && !file.endsWith('.json')) return null;
    if (slozka === 'chats') return { parent: '' };
    if (nadrazena === 'chats' && file.endsWith('.jsonl')) return { parent: slozka };
    return null;
  }

  async function sync(file) {
    const r = rozbor(file);
    if (!r) return;
    const stat = await statSafe(file);
    if (!stat?.isFile() || Date.now() - stat.mtimeMs > windowMs) return;
    if (seen.get(file) === stat.mtimeMs) return;
    let text;
    try { text = await fsp.readFile(file, 'utf8'); } catch { return; }
    if (format === 'qwen') {
      let sessionId = '';
      for (const line of text.split('\n')) {
        if (!line.includes('"sessionId"')) continue;
        try { sessionId = JSON.parse(line).sessionId || ''; } catch { /* poškozený řádek */ }
        if (sessionId) break;
      }
      if (!text.trim()) return;
      seen.set(file, stat.mtimeMs);
      const s = store.ensure({ connector: id, localId: String(sessionId || path.basename(file, '.jsonl')), provider, app });
      applyQwenJsonl(s, text, stat.mtimeMs);
      if (!s.transcript?.length && !s.turns) return;
      lastEventAt = Date.now();
      store.commit(s);
      return;
    }
    let j;
    if (file.endsWith('.jsonl')) j = parseGeminiJsonl(text);
    else { try { j = JSON.parse(text); } catch { return; } }
    if (!j || !Array.isArray(j.messages) || !j.messages.length) return;
    seen.set(file, stat.mtimeMs);
    const localId = String(j.sessionId || path.basename(file).replace(/\.jsonl?$/, ''));
    const s = store.ensure({ connector: id, localId, provider, app });
    if (r.parent) {
      s.parentId = `${id}:${r.parent}`;
      s.subagent = { kind: 'agent', label: ui('Pomocný agent') };
    }
    applyGeminiChat(s, j, stat.mtimeMs);
    lastEventAt = Date.now();
    store.commit(s);
  }

  async function scan() {
    exists = Boolean(await statSafe(path.join(config.sourceHome, dir)));
    for (const uroven of f.urovne) {
      for (const file of await listFiles(root, uroven, (x) => x.endsWith('.jsonl') || x.endsWith('.json'))) await queue.run(file);
    }
  }

  return {
    id,
    name,
    provider,
    kind: 'local',
    verified,
    source: f.source(dir),
    description: ui('Přepis chatů, modely a tokeny z uložených konverzací.'),
    async start() {
      await scan();
      watcher = watchTree(root, (file) => (file ? queue.schedule(file) : scan()));
    },
    scan,
    stop() {
      watcher?.close();
      queue.clear();
    },
    idle: () => queue.idle(),
    status() {
      const count = seen.size;
      return {
        ...(count
          ? { state: 'connected', detail: ui('Sleduji {0} chatů.', count) }
          : noDataState({ installed: ctx.installed?.bin(bin) ?? null, trace: exists, name: app, traceLabel: ui('složka ~/{0}', dir), whatMissing: ui('zatím neuložil žádný chat') })),
        count,
        watching: Boolean(watcher?.active),
        lastEventAt,
      };
    },
  };
}
