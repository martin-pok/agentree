import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { run, shellQuote } from './util.js';

// Rychlé spouštění agentů. Plán se skládá jen z ověřených vstupů a pevných příkazů — klient nikdy neposílá příkaz.

export const PROMPT_MAX = 20000;
const URL_PROMPT_MAX = 6000;
const BUNDLED_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex';

export const CLAUDE_PERMISSIONS = { plan: 'Jen plán, bez změn', acceptEdits: 'Smí upravovat soubory' };
export const CODEX_SANDBOXES = { 'read-only': 'Jen čtení', 'workspace-write': 'Smí upravovat projekt' };

export const MODES = {
  terminal: 'V Terminálu',
  background: 'Na pozadí',
  app: 'V aplikaci',
  web: 'Na webu',
  local: 'Lokálně',
};

// Parametr ?q= není u webových služeb oficiálně dokumentovaný — zadání se proto vždy i zkopíruje do schránky.
const WEB = {
  chatgpt: { label: 'ChatGPT', logo: 'openai', provider: 'openai', url: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`, base: 'https://chatgpt.com/' },
  'claude-web': { label: 'Claude.ai', logo: 'claude', provider: 'anthropic', url: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`, base: 'https://claude.ai/new' },
  perplexity: { label: 'Perplexity', logo: 'perplexity', provider: 'perplexity', url: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`, base: 'https://www.perplexity.ai/' },
  gemini: { label: 'Gemini', logo: 'gemini', provider: 'google', url: null, base: 'https://gemini.google.com/app' },
  mscopilot: { label: 'Microsoft Copilot', logo: 'copilot', provider: 'microsoft', url: (q) => `https://copilot.microsoft.com/?q=${encodeURIComponent(q)}`, base: 'https://copilot.microsoft.com/' },
  grok: { label: 'Grok', logo: 'grok', provider: 'xai', url: (q) => `https://grok.com/?q=${encodeURIComponent(q)}`, base: 'https://grok.com/' },
  qwen: { label: 'Qwen Chat', logo: 'qwen', provider: 'alibaba', url: null, base: 'https://chat.qwen.ai/' },
};

export async function detectLaunchEnv({ ollama }) {
  const r = await run('/bin/zsh', ['-lc', 'for c in claude codex gemini qwen; do p=$(command -v "$c" 2>/dev/null) && echo "$c=$p"; done'], { timeout: 6000 });
  const bins = {};
  for (const line of r.stdout.split('\n')) {
    const [name, ...rest] = line.trim().split('=');
    const p = rest.join('=');
    if (name && p.startsWith('/')) bins[name] = p;
  }
  if (!bins.codex && fs.existsSync(BUNDLED_CODEX)) bins.codex = BUNDLED_CODEX;
  return { bins, chatgptApp: fs.existsSync('/Applications/ChatGPT.app'), claudeApp: fs.existsSync('/Applications/Claude.app'), ollama: await ollama.models() };
}

export function launchTargets(env) {
  const { bins = {}, chatgptApp = false, claudeApp = false, ollama = { ok: false, models: [] } } = env || {};
  const out = [];
  // Pořadí režimů = doporučení: nejdřív aplikace, pak práce na pozadí, Terminál až nakonec.
  const claudeModes = [...(claudeApp ? ['app'] : []), ...(bins.claude ? ['background', 'terminal'] : [])];
  if (claudeModes.length) {
    out.push({ id: 'claude-code', label: 'Claude Code', logo: 'claude', provider: 'anthropic', group: 'agent', modes: claudeModes, projectModes: ['background', 'terminal'], optionalFolderModes: ['app'], permissions: CLAUDE_PERMISSIONS, note: 'Běží na tvém předplatném Claude.' });
  }
  const codexModes = [...(chatgptApp ? ['app'] : []), ...(bins.codex ? ['background', 'terminal'] : [])];
  if (codexModes.length) {
    out.push({ id: 'codex', label: 'Codex', logo: 'codex', provider: 'openai', group: 'agent', modes: codexModes, projectModes: ['background', 'terminal'], sandboxes: CODEX_SANDBOXES, note: 'Běží na tvém předplatném ChatGPT.' });
  }
  if (bins.gemini) out.push({ id: 'gemini-cli', label: 'Gemini CLI', logo: 'gemini', provider: 'google', group: 'agent', modes: ['terminal'], projectModes: ['terminal'], beta: true, note: 'S osobním Google účtem má bezplatný denní limit.' });
  if (bins.qwen) out.push({ id: 'qwen-code', label: 'Qwen Code', logo: 'qwen', provider: 'alibaba', group: 'agent', modes: ['terminal'], projectModes: ['terminal'], beta: true, note: 'Podle nastavení Qwen Code.' });
  if (ollama.ok) {
    out.push({ id: 'ollama', label: 'Ollama', logo: 'ollama', provider: 'local', group: 'local', modes: ['local'], projectModes: [], models: ollama.models.map((m) => m.name), note: ollama.models.length ? 'Lokální model na tvém Macu — zdarma, data nikam neodcházejí.' : 'Ollama běží, ale nemá stažený žádný model (ollama pull llama3.2).' });
  }
  for (const [id, w] of Object.entries(WEB)) {
    out.push({ id, label: w.label, logo: w.logo, provider: w.provider, group: 'web', modes: ['web'], projectModes: [], prefill: Boolean(w.url), note: w.url ? 'Otevře novou konverzaci se zadáním (zadání je i ve schránce).' : 'Otevře aplikaci; zadání vložíš ze schránky (⌘V).' });
  }
  return out;
}

const fail = (error, field) => ({ ok: false, error, field });

export async function planLaunch(input, env, { promptFile, sessionUuid = crypto.randomUUID() } = {}) {
  const target = launchTargets(env).find((t) => t.id === input?.agent);
  if (!target) return fail('Tento agent na tomto počítači není k dispozici.', 'agent');
  const mode = input.mode;
  if (!target.modes.includes(mode)) return fail('Tento režim agent nepodporuje.', 'mode');
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt) return fail('Napiš, co má agent udělat.', 'prompt');
  if (prompt.length > PROMPT_MAX) return fail(`Zadání může mít nejvýš ${PROMPT_MAX.toLocaleString('cs-CZ')} znaků.`, 'prompt');

  let cwd = null;
  const folderOptional = target.optionalFolderModes?.includes(mode) && typeof input.cwd === 'string' && input.cwd !== '';
  if (target.projectModes.includes(mode) || folderOptional) {
    if (typeof input.cwd !== 'string' || !path.isAbsolute(input.cwd) || /[\n\r\0]/.test(input.cwd)) return fail('Vyber složku projektu.', 'cwd');
    const st = await fsp.stat(input.cwd).catch(() => null);
    if (!st?.isDirectory()) return fail('Tato složka neexistuje.', 'cwd');
    cwd = path.resolve(input.cwd);
  }

  const { bins = {} } = env;
  const base = { agent: target.id, label: target.label, mode, prompt, cwd };
  const promptArg = () => `"$(cat ${shellQuote(promptFile)})"`;

  switch (target.id) {
    case 'claude-code': {
      if (mode === 'app') {
        // Aplikace Claude: claude://code/new otevře novou konverzaci Claude Code s předvyplněným zadáním ve zvolené složce.
        const fits = prompt.length <= URL_PROMPT_MAX;
        const params = new URLSearchParams();
        if (fits) params.set('q', prompt);
        if (cwd) params.append('folder', cwd);
        const query = params.toString();
        return { ok: true, plan: { ...base, kind: 'open', args: [`claude://code/new${query ? `?${query}` : ''}`], copyPrompt: !fits, handoff: fits ? 'confirm' : 'paste' } };
      }
      if (mode === 'terminal') {
        return { ok: true, plan: { ...base, kind: 'terminal', sessionId: `claude-code:${sessionUuid}`, command: `cd ${shellQuote(cwd)} && ${shellQuote(bins.claude)} --session-id ${sessionUuid} -- ${promptArg()}` } };
      }
      const permission = input.permission ?? 'plan';
      if (!CLAUDE_PERMISSIONS[permission]) return fail('Neznámé oprávnění.', 'permission');
      return {
        ok: true,
        plan: { ...base, kind: 'background', permission, sessionId: `claude-code:${sessionUuid}`, argv: [bins.claude, '-p', '--session-id', sessionUuid, '--permission-mode', permission, '--', prompt] },
      };
    }
    case 'codex': {
      if (mode === 'app') {
        const fits = prompt.length <= URL_PROMPT_MAX;
        return { ok: true, plan: { ...base, kind: 'open', args: [fits ? `codex://threads/new?prompt=${encodeURIComponent(prompt)}` : 'codex://threads/new'], copyPrompt: !fits, handoff: fits ? 'confirm' : 'paste' } };
      }
      if (mode === 'terminal') return { ok: true, plan: { ...base, kind: 'terminal', command: `cd ${shellQuote(cwd)} && ${shellQuote(bins.codex)} -- ${promptArg()}` } };
      const sandbox = input.sandbox ?? 'read-only';
      if (!CODEX_SANDBOXES[sandbox]) return fail('Neznámý režim sandboxu.', 'sandbox');
      return { ok: true, plan: { ...base, kind: 'background', sandbox, sessionId: null, argv: [bins.codex, 'exec', '--skip-git-repo-check', '-C', cwd, '-s', sandbox, '--', prompt] } };
    }
    case 'gemini-cli':
      return { ok: true, plan: { ...base, kind: 'terminal', command: `cd ${shellQuote(cwd)} && ${shellQuote(bins.gemini)} -i ${promptArg()}` } };
    case 'qwen-code':
      return { ok: true, plan: { ...base, kind: 'terminal', command: `cd ${shellQuote(cwd)} && ${shellQuote(bins.qwen)} -i ${promptArg()}` } };
    case 'ollama': {
      if (!target.models.length) return fail('Ollama nemá stažený žádný model. Spusť v Terminálu: ollama pull llama3.2', 'model');
      const model = input.model ?? target.models[0];
      if (!target.models.includes(model)) return fail('Tento model v Ollamě není.', 'model');
      return { ok: true, plan: { ...base, kind: 'local', model } };
    }
    default: {
      const w = WEB[target.id];
      if (!w) return fail('Neznámý agent.', 'agent');
      const prefilled = Boolean(w.url && prompt.length <= URL_PROMPT_MAX);
      const handoffId = target.id === 'gemini' && typeof input.browserHandoffId === 'string' && /^[0-9a-f-]{36}$/i.test(input.browserHandoffId)
        ? input.browserHandoffId
        : null;
      const url = handoffId ? `${w.base}#agentree-handoff=${handoffId}` : prefilled ? w.url(prompt) : w.base;
      return { ok: true, plan: { ...base, kind: 'open', args: [url], copyPrompt: true, handoff: prefilled ? 'confirm-or-paste' : 'paste' } };
    }
  }
}

// Soubory se zadáním pro Terminál (0600) — mazání starších než den.
export const promptFilePath = (dir, name) => path.join(dir, `${name}.txt`);

export async function writePromptFile(dir, prompt, name = crypto.randomUUID()) {
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  const now = Date.now();
  for (const entry of await fsp.readdir(dir).catch(() => [])) {
    const full = path.join(dir, entry);
    const st = await fsp.stat(full).catch(() => null);
    if (st && now - st.mtimeMs > 86400e3) await fsp.rm(full, { force: true });
  }
  const file = promptFilePath(dir, name);
  await fsp.writeFile(file, prompt, { mode: 0o600 });
  return file;
}
