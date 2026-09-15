import { processList } from '../platform.js';

export const RUNTIMES = [
  { id: 'claude-desktop', name: 'Claude Desktop', provider: 'anthropic', test: (a) => a.startsWith('/Applications/Claude.app/Contents/MacOS/Claude') },
  { id: 'claude-code', name: 'Claude Code', provider: 'anthropic', test: (a) => /\/claude(\s|$)/.test(a) && !/disclaimer|chrome-native-host/.test(a) },
  { id: 'chatgpt', name: 'ChatGPT', provider: 'openai', test: (a) => a.startsWith('/Applications/ChatGPT.app/Contents/MacOS/ChatGPT') },
  // Aplikace ChatGPT si spouští vlastní vnitřní `codex app-server`; jako samostatný Codex CLI se počítat nesmí.
  { id: 'codex', name: 'Codex', provider: 'openai', test: (a) => /(^|\/)codex(\s|$)/.test(a) && !a.includes('/ChatGPT.app/') },
  { id: 'copilot-cli', name: 'Copilot CLI', provider: 'github', test: (a) => /(^|\/)copilot(\s|$)/.test(a) && !a.includes('.app/') },
  { id: 'vscode', name: 'VS Code', provider: 'github', test: (a) => /\/Visual Studio Code( - Insiders)?\.app\/Contents\/MacOS\//.test(a) },
  { id: 'cursor', name: 'Cursor', provider: 'cursor', test: (a) => a.startsWith('/Applications/Cursor.app/Contents/MacOS/Cursor') },
  { id: 'ms-copilot', name: 'Microsoft Copilot', provider: 'microsoft', test: (a) => /\/(Microsoft )?Copilot\.app\/Contents\/MacOS\//.test(a) },
  { id: 'gemini-cli', name: 'Gemini CLI', provider: 'google', test: (a) => /(^|\/)gemini(\s|$)/.test(a) },
  { id: 'qwen-code', name: 'Qwen Code', provider: 'alibaba', test: (a) => /(^|\/)qwen(\s|$)/.test(a) },
  { id: 'perplexity', name: 'Perplexity', provider: 'perplexity', test: (a) => /\/Perplexity\.app\/Contents\/MacOS\//.test(a) },
  { id: 'grok', name: 'Grok', provider: 'xai', test: (a) => /\/Grok\.app\/Contents\/MacOS\//.test(a) },
  { id: 'ollama', name: 'Ollama', provider: 'local', test: (a) => /(^|\/)ollama(\s|$)/.test(a) || a.includes('/Ollama.app/Contents/MacOS/') },
  { id: 'lmstudio', name: 'LM Studio', provider: 'local', test: (a) => a.includes('/LM Studio.app/Contents/MacOS/') },
];

export function etimeToSec(t) {
  const [d, rest] = t.includes('-') ? t.split('-') : ['0', t];
  const parts = rest.split(':').map(Number);
  while (parts.length < 3) parts.unshift(0);
  return Number(d) * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function parsePs(out) {
  const runtimes = RUNTIMES.map((r) => ({ id: r.id, name: r.name, provider: r.provider, running: false, processes: 0, cpu: 0, memMB: 0, uptimeSec: 0, detail: '' }));
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const idx = RUNTIMES.findIndex((r) => r.test(m[5]));
    if (idx === -1) continue;
    const r = runtimes[idx];
    r.running = true;
    r.processes++;
    r.cpu += Number(m[3]);
    r.memMB += Number(m[4]) / 1024;
    r.uptimeSec = Math.max(r.uptimeSec, etimeToSec(m[2]));
  }
  for (const r of runtimes) {
    r.cpu = Math.round(r.cpu * 10) / 10;
    r.memMB = Math.round(r.memMB);
  }
  return runtimes;
}

export function createProcessesConnector(ctx) {
  const { store, config } = ctx;
  let timer = null;
  let ollama = { ok: false, models: [] };
  let lastOk = 0;

  async function poll() {
    const res = await processList();
    const runtimes = res.ok ? parsePs(res.stdout) : store.runtimes;
    try {
      const r = await fetch('http://127.0.0.1:11434/api/ps', { signal: AbortSignal.timeout(600) });
      const json = r.ok ? await r.json() : null;
      ollama = { ok: Boolean(json), models: (json?.models || []).map((m) => m.name) };
    } catch {
      ollama = { ok: false, models: [] };
    }
    const o = runtimes.find((r) => r.id === 'ollama');
    if (o && ollama.ok) {
      o.running = true;
      o.detail = ollama.models.length ? `Načteno: ${ollama.models.join(', ')}` : 'Žádný model v paměti';
    }
    if (res.ok) lastOk = Date.now();
    store.setRuntimes(runtimes);
  }

  return {
    id: 'processes',
    name: 'Aplikace na tomto Macu',
    provider: 'other',
    kind: 'local',
    verified: true,
    source: 'ps · localhost:11434',
    description: 'Pozná, které AI aplikace a CLI právě běží, jejich zátěž a modely načtené v Ollamě.',
    async start() {
      await poll();
      timer = setInterval(() => poll().catch(() => {}), config.processIntervalMs);
      timer.unref?.();
    },
    scan: poll,
    stop() {
      clearInterval(timer);
    },
    idle: async () => {},
    status() {
      const running = store.runtimes.filter((r) => r.running).length;
      // Dokud se výpis procesů ani jednou nepovedl, nevíme nic — a „0 aplikací běží“
      // by byla lež, ne údaj. Ollamu poznáme i tak, ta jde přes HTTP.
      return {
        state: lastOk ? 'connected' : 'error',
        detail: lastOk
          ? `${running} AI aplikací běží${ollama.ok ? ` · Ollama: ${ollama.models.length} modelů` : ''}.`
          : `Seznam běžících aplikací se na tomto systému nepodařilo získat${ollama.ok ? `, Ollama ale odpovídá: ${ollama.models.length} modelů` : ''}.`,
        count: running,
        watching: Boolean(timer),
        lastEventAt: lastOk,
      };
    },
  };
}
