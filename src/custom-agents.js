// Vlastní agenti = lokální služba, kterou si uživatel sám zaregistruje (ComfyUI, Ollama,
// OpenAI-kompatibilní server jako LM Studio nebo vLLM). Agenteeq jen čte její stav přes GET –
// nikdy nic nezapisuje a nikdy nesahá mimo lokální/privátní síť. Bezpečnost tohoto souboru
// (validateEndpoint) má přednost před vším ostatním: co neprojde, se nikdy nezavolá.

import crypto from 'node:crypto';

export const AGENT_TYPES = {
  comfyui: { label: 'ComfyUI', path: '/queue' },
  ollama: { label: 'Ollama', path: '/api/tags' },
  openai: { label: 'OpenAI-kompatibilní (LM Studio, vLLM, llama.cpp)', path: '/v1/models' },
};

export const MAX_AGENTS = 8;

const MAX_INPUT_LEN = 200;
const MAX_NAME_LEN = 40;
const ID_RE = /^[a-z0-9-]{1,32}$/;

// IPv4 v tečkovém zápisu → 32bitové číslo, nebo null když to není platná IPv4 adresa.
function ipv4ToInt(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inIpv4Range(host, base, prefix) {
  const ip = ipv4ToInt(host);
  if (ip === null) return false;
  const baseInt = ipv4ToInt(base);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

// Hostitel smí být jen lokální nebo v privátní síti – nikdy veřejná doména ani cloudová metadata.
function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;
  if (host.endsWith('.local')) return true;
  if (ipv4ToInt(host) === null) return false; // není to IPv4 a není to nic z výše uvedeného
  if (inIpv4Range(host, '169.254.0.0', 16)) return false; // link-local a cloudová metadata – vždy odmítnout
  if (host === '0.0.0.0') return false;
  if (inIpv4Range(host, '127.0.0.0', 8)) return true;
  if (inIpv4Range(host, '10.0.0.0', 8)) return true;
  if (inIpv4Range(host, '172.16.0.0', 12)) return true;
  if (inIpv4Range(host, '192.168.0.0', 16)) return true;
  return false;
}

// Ověří a znormalizuje adresu lokální služby. Nikdy nic síťově nevolá – jen parsuje řetězec.
export function validateEndpoint(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_INPUT_LEN) {
    return { ok: false, error: 'Adresa je povinná a smí mít nejvýš 200 znaků.' };
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Adresa nedává smysl – zkontroluj formát (např. http://127.0.0.1:8188).' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Podporuje se jen http:// nebo https://.' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'Adresa nesmí obsahovat jméno ani heslo.' };
  }
  if (!isAllowedHost(url.hostname)) {
    return { ok: false, error: 'Hostitel musí být lokální nebo v privátní síti (localhost, 127.0.0.1, 10.x, 172.16–31.x, 192.168.x nebo .local).' };
  }
  // Origin bez cesty, dotazu a fragmentu – přes adresu se tak nedá propašovat jiný požadavek.
  return { ok: true, origin: url.origin };
}

function sanitizeName(raw, fallback) {
  const stripped = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const name = stripped.length > 0 ? stripped : fallback;
  return name.slice(0, MAX_NAME_LEN);
}

// Ověří a doplní záznam agenta zadaný uživatelem. Nepřijaté hodnoty se nahradí bezpečným výchozím stavem.
export function normalizeAgent(input, { now = Date.now() } = {}) {
  const src = input && typeof input === 'object' ? input : {};

  if (typeof src.type !== 'string' || !Object.prototype.hasOwnProperty.call(AGENT_TYPES, src.type)) {
    return { ok: false, error: 'Neznámý typ agenta.' };
  }

  const name = sanitizeName(src.name, '');
  if (name.length === 0) {
    return { ok: false, error: 'Název je povinný.' };
  }

  const endpoint = validateEndpoint(src.origin ?? src.endpoint ?? src.url);
  if (!endpoint.ok) return endpoint;

  const id = typeof src.id === 'string' && ID_RE.test(src.id) ? src.id : crypto.randomUUID().slice(0, 8);
  const addedAt = Number.isFinite(src.addedAt) ? src.addedAt : now;

  return { ok: true, agent: { id, name, type: src.type, origin: endpoint.origin, addedAt } };
}

async function readBounded(res, maxBytes) {
  if (!res.body) {
    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) return { tooLarge: true };
    return { text };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text };
  } catch {
    return { tooLarge: true };
  }
}

// Jednoduché skloňování slovesa „čekat" podle počtu (1 čeká, 2–4 čekají, jinak čeká).
const waitWord = (n) => (n >= 2 && n <= 4 ? 'čekají' : 'čeká');

function summarize(type, json) {
  if (type === 'comfyui') {
    if (!Array.isArray(json?.queue_running) || !Array.isArray(json?.queue_pending)) {
      return { running: true, detail: 'Odpovídá' };
    }
    const running = json.queue_running.length;
    const pending = json.queue_pending.length;
    return { running: true, detail: `Fronta: ${running} běží, ${pending} ${waitWord(pending)}` };
  }
  if (type === 'ollama') {
    if (!Array.isArray(json?.models)) return { running: true, detail: 'Odpovídá' };
    return { running: true, detail: `Modelů: ${json.models.length}` };
  }
  if (type === 'openai') {
    if (!Array.isArray(json?.data)) return { running: true, detail: 'Odpovídá' };
    return { running: true, detail: `Modelů: ${json.data.length}` };
  }
  return { running: true, detail: 'Odpovídá' };
}

// Zjistí stav zaregistrované lokální služby jedním GET požadavkem. Nikdy nevyhazuje výjimku ven –
// timeout, odmítnuté spojení i neočekávaná odpověď se vždy promění na klidné { ok: false }.
export async function probeAgent(agent, { fetchImpl = globalThis.fetch, timeoutMs = 1500, maxBytes = 65536 } = {}) {
  const at = Date.now();
  try {
    const def = AGENT_TYPES[agent.type];
    const url = `${agent.origin}${def.path}`;
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status >= 300 && res.status < 400) {
      return { ok: false, running: false, detail: 'Služba odpovídá přesměrováním, to Agenteeq nenásleduje.', at };
    }
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, running: false, detail: `Služba odpověděla ${res.status}.`, at };
    }

    const body = await readBounded(res, maxBytes);
    if (body.tooLarge) {
      return { ok: false, running: false, detail: 'Odpověď je příliš velká.', at };
    }

    let json;
    try {
      json = JSON.parse(body.text);
    } catch {
      return { ok: false, running: false, detail: 'Odpověď není JSON.', at };
    }

    return { ...summarize(agent.type, json), ok: true, at };
  } catch {
    return { ok: false, running: false, detail: 'Služba neodpovídá.', at };
  }
}
