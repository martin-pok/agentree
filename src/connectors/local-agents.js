// Konektor „Neznámí a lokální agenti“ — na rozdíl od processes.js (pevný seznam 14 aplikací)
// se snaží nepřehlédnout ŽÁDNÝ lokální AI běhový proces: zná desítky konkrétních nástrojů
// (Ollama, LM Studio, llama.cpp, ComfyUI, …) a navíc heuristicky odhaduje neznámé/vlastní
// modely podle argumentů procesu a otevřených portů. Heuristika je vždy označená jako taková
// (source: 'heuristika', confidence: 'nízká') — nikdy se netváří jako ověřená data.
import { etimeToSec } from './processes.js';
import { clip, run } from '../util.js';

// Katalog známých lokálních běhových prostředí. `match` dostane celý řetězec argumentů
// jednoho procesu (`ps ... args=`) a vrátí, jestli proces patří k tomuto nástroji.
export const KNOWN_LOCAL = [
  { id: 'ollama', name: 'Ollama', kind: 'server', match: /(^|\/)ollama(\s|$)/, ports: [11434] },
  { id: 'lmstudio', name: 'LM Studio', kind: 'app', match: (a) => a.includes('/LM Studio.app/Contents/MacOS/') || /(^|\/)lms(\s|$)/.test(a), ports: [1234] },
  { id: 'llama-cpp', name: 'llama.cpp', kind: 'cli', match: (a) => /(^|\/)(llama-server|llama-cli)(\s|$)/.test(a) || (/(^|\/)main(\s|$)/.test(a) && /\.gguf\b/i.test(a)) },
  { id: 'vllm', name: 'vLLM', kind: 'server', match: /vllm\.entrypoints|python3?\s+-m\s+vllm\b/, ports: [8000] },
  { id: 'comfyui', name: 'ComfyUI', kind: 'server', match: (a) => /ComfyUI/i.test(a) && /main\.py/.test(a), ports: [8188] },
  { id: 'text-generation-webui', name: 'Text Generation WebUI', kind: 'server', match: /text-generation-webui/i, ports: [7860] },
  { id: 'koboldcpp', name: 'KoboldCpp', kind: 'server', match: /koboldcpp/i, ports: [5001] },
  { id: 'jan', name: 'Jan', kind: 'app', match: /\/Jan\.app\/Contents\/MacOS\//i },
  { id: 'gpt4all', name: 'GPT4All', kind: 'app', match: /GPT4All/i },
  { id: 'localai', name: 'LocalAI', kind: 'server', match: /local-ai|localai/i, ports: [8080] },
  { id: 'open-webui', name: 'Open WebUI', kind: 'server', match: /open[-_]webui/i, ports: [8080] },
  { id: 'mlx-lm', name: 'MLX LM', kind: 'server', match: /mlx_lm\.server/ },
  { id: 'sglang', name: 'SGLang', kind: 'server', match: /sglang/i, ports: [30000] },
  { id: 'tabbyapi', name: 'TabbyAPI', kind: 'server', match: /tabbyapi/i, ports: [5000] },
  { id: 'litellm', name: 'LiteLLM', kind: 'server', match: /litellm/i },
  { id: 'whisper-cpp', name: 'whisper.cpp', kind: 'cli', match: /(^|\/)whisper-server(\s|$)/i },
  { id: 'stable-diffusion-webui', name: 'Stable Diffusion WebUI', kind: 'server', match: /stable-diffusion-webui/i, ports: [7860] },
  { id: 'automatic1111', name: 'AUTOMATIC1111', kind: 'server', match: /automatic1111/i, ports: [7860] },
  { id: 'invokeai', name: 'InvokeAI', kind: 'app', match: /invokeai/i },
  { id: 'transformers-serve', name: 'Transformers serve', kind: 'cli', match: /(^|\s)transformers(-cli)?\s+serve(\s|$)/i },
];

// Procesy, které se nikdy nesmí označit — vlastní proces, systémové služby a testovací běh.
const EXCLUDE = /agenteeq|node --test|xcode|spotlight|mdworker|finder|safari|chrome|chrome_crashpad|windowserver|kernel_task/i;

// Slabé signály neznámého modelu — samy o sobě stačí, jen když proces něco reálně dělá
// (cpu > 0) nebo drží typický inferenční port. Bez toho jde často jen o slovo v cestě
// k domovské složce (repozitář „moje-llama-app“ apod.) a nic to neznamená.
const WEAK_KEYWORDS = /\b(llama|mistral|qwen|gemma|phi|deepseek|whisper|diffusion|transformers|torchrun|inference|serve)\b/i;
// Silné signály — model na disku nebo explicitní --model — stačí samy o sobě.
const MODEL_FILE = /\.(gguf|safetensors|mlx)\b/i;
const MODEL_FLAG = /(^|\s)--model(\s|=)/;
const MODELS_DIR = /models\//i;
const PY_OR_NODE = /(^|\/)(python3?|node)(\s|$)/;
const INFERENCE_PORTS = new Set([11434, 1234, 8188, 5000, 5001, 7860, 8000, 8080, 30000]);

function isExcluded(args) {
  if (!args) return true;
  if (args.startsWith('/System/Library')) return true;
  return EXCLUDE.test(args);
}

function matchesKnown(entry, args) {
  return typeof entry.match === 'function' ? Boolean(entry.match(args)) : entry.match.test(args);
}

function matchesHeuristic(args, port, cpu) {
  const strong = MODEL_FILE.test(args) || MODEL_FLAG.test(args) || (MODELS_DIR.test(args) && PY_OR_NODE.test(args));
  if (strong) return true;
  if (port && INFERENCE_PORTS.has(port) && PY_OR_NODE.test(args)) return true;
  if (WEAK_KEYWORDS.test(args) && (cpu > 0 || (port && INFERENCE_PORTS.has(port)))) return true;
  return false;
}

// Vytáhne název modelu z `--model X` (přednostně) nebo `-m X` — basename bez přípony souboru.
// `--model` má přednost, protože `-m` u pythonu často znamená spouštěný modul (`python -m vllm…`),
// ne cestu k modelu.
function extractModel(args) {
  const m = args.match(/--model[= ]("[^"]+"|'[^']+'|\S+)/) || args.match(/(?:^|\s)-m\s+("[^"]+"|'[^']+'|\S+)/);
  if (!m) return undefined;
  const raw = m[1].replace(/^['"]|['"]$/g, '').split('/').pop();
  const name = raw?.replace(/\.(gguf|safetensors|mlx|bin)$/i, '');
  return name || undefined;
}

function commandBase(args) {
  const first = args.trim().split(/\s+/)[0] || '';
  return first.split('/').pop() || 'proces';
}

function parseRow(line) {
  const m = line.trim().match(/^(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);
  if (!m) return null;
  return { pid: Number(m[1]), cpu: Number(m[3]), memMB: Number(m[4]) / 1024, uptimeSec: etimeToSec(m[2]), args: m[5] };
}

const HEURISTIC_NOTE = 'Rozpoznáno podle argumentů procesu — vlastní nebo neznámý model, Agenteeq u něj neumí číst konverzace ani limity.';

/**
 * Projde výpis `ps` (stejný tvar jako v processes.js: pid etime %cpu rss args) a najde
 * všechny lokální AI běhy — známé i heuristicky odhadnuté. Nikdy nic nespouští, nesahá
 * na síť a nevyhodí výjimku; na nesmyslném vstupu vrátí [].
 */
export function detectLocalAgents(psOutput, { ports = [], now = Date.now() } = {}) {
  try {
    if (typeof psOutput !== 'string' || !psOutput.trim()) return [];
    const portByPid = new Map();
    for (const p of Array.isArray(ports) ? ports : []) {
      if (p && Number.isFinite(p.pid) && Number.isFinite(p.port) && !portByPid.has(p.pid)) portByPid.set(p.pid, p.port);
    }

    const groups = new Map();
    for (const line of psOutput.split('\n')) {
      const row = parseRow(line);
      if (!row || isExcluded(row.args)) continue;
      const port = portByPid.get(row.pid);

      let key, base;
      const known = KNOWN_LOCAL.find((k) => matchesKnown(k, row.args));
      if (known) {
        key = known.id;
        base = { id: known.id, name: known.name, kind: known.kind, source: 'known', confidence: 'vysoká', note: '' };
      } else {
        if (!matchesHeuristic(row.args, port, row.cpu)) continue;
        const model = extractModel(row.args);
        key = model ? `heuristika:model:${model}` : `heuristika:prikaz:${commandBase(row.args)}`;
        base = {
          id: key,
          name: model ? `Neznámý model (${model})` : `Neznámý lokální proces (${commandBase(row.args)})`,
          kind: 'server',
          source: 'heuristika',
          confidence: 'nízká',
          note: HEURISTIC_NOTE,
        };
      }

      const g = groups.get(key) || { ...base, processes: 0, cpu: 0, memMB: 0, uptimeSec: -1, pid: row.pid, args: '', port: undefined, model: undefined };
      g.processes += 1;
      g.cpu = Math.round((g.cpu + row.cpu) * 10) / 10;
      g.memMB += row.memMB;
      if (row.uptimeSec >= g.uptimeSec) {
        g.uptimeSec = row.uptimeSec;
        g.pid = row.pid;
        g.args = clip(row.args, 200);
      }
      if (port) g.port = port;
      const model = extractModel(row.args);
      if (model) g.model = model;
      groups.set(key, g);
    }

    return [...groups.values()].map((g) => ({ ...g, memMB: Math.round(g.memMB) }));
  } catch {
    return [];
  }
}

/**
 * Rozparsuje výstup `lsof -nP -iTCP -sTCP:LISTEN` na seznam naslouchajících portů.
 * Zvládne adresy `*:port`, `127.0.0.1:port` i `[::1]:port`. Na neplatném vstupu vrátí [].
 */
export function parseListeningPorts(lsofOutput) {
  try {
    if (typeof lsofOutput !== 'string' || !lsofOutput.trim()) return [];
    const out = [];
    for (const line of lsofOutput.split('\n')) {
      if (!line || /^COMMAND\s/.test(line)) continue;
      const m = line.match(/^(\S+)\s+(\d+)\s+.*:(\d+)\s*\(LISTEN\)\s*$/);
      if (!m) continue;
      out.push({ port: Number(m[3]), pid: Number(m[2]), command: m[1] });
    }
    return out;
  } catch {
    return [];
  }
}

export function createLocalAgentsConnector(ctx) {
  const onDetect = ctx?.onDetect;
  let timer = null;
  let list = [];
  let lastOk = 0;

  async function poll() {
    const [psRes, lsofRes] = await Promise.all([
      run('ps', ['-axo', 'pid=,etime=,%cpu=,rss=,args=']),
      run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN']),
    ]);
    const ports = parseListeningPorts(lsofRes.ok ? lsofRes.stdout : '');
    list = detectLocalAgents(psRes.ok ? psRes.stdout : '', { ports });
    if (psRes.ok) lastOk = Date.now();
    onDetect?.(list);
  }

  return {
    id: 'local-agents',
    name: 'Neznámí a lokální agenti',
    provider: 'local',
    kind: 'local',
    verified: false,
    source: 'ps · lsof',
    description: 'Najde lokální AI modely a servery mimo pevný seznam známých aplikací — podle procesů a otevřených portů (Ollama, LM Studio, llama.cpp, ComfyUI a desítky dalších, plus heuristika pro neznámé).',
    async start() {
      await poll();
      timer = setInterval(() => poll().catch(() => {}), 10000);
      timer.unref?.();
    },
    scan: poll,
    stop() {
      clearInterval(timer);
      timer = null;
    },
    idle: async () => {},
    status() {
      return {
        state: lastOk ? (list.length ? 'connected' : 'idle') : 'idle',
        detail: list.length ? `${list.length} lokálních agentů mimo známý seznam.` : 'Žádný neznámý ani lokální agent teď neběží.',
        count: list.length,
      };
    },
  };
}
