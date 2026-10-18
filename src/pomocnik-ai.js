// Pomocník jako AI: odpovídá vlastními slovy na otázky k Agenteeq, jen ze znalostní báze aplikace.
//
// Žádný placený klíč ani cloud Agenteeq. Použije AI, která už na tomto počítači je:
//   1. Ollama s lokálním modelem (zdarma, nic neopustí počítač) – přednost;
//   2. Claude Code (`claude -p`) na předplatné uživatele – otázka a znalostní báze odejdou do
//      Anthropicu, proto to rozhraní u odpovědi i v Nastavení říká. Běží bez nástrojů, bez MCP,
//      bez hooků a bez uložení konverzace, v prázdné dočasné složce (žádný CLAUDE.md projektu).
// Když nic z toho není, vrátí `{ engine: null }` a rozhraní odpoví deterministickým průvodcem
// (public/js/assistant-guide.js). Aplikace tedy funguje i bez AI (test/samostatnost.test.mjs).
// Do modelu nikdy nejdou konverzace uživatele – jen otázka, stránka, krátká historie chatu
// s pomocníkem a znalostní báze.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { vyberLokalniModel } from './pomocnik.js';

const MAX_ZNALOSTI = 24000;
const MAX_HISTORIE = 6;

const ZAKLAD = {
  cs: `Agenteeq je aplikace pro Mac (běží i jako webové rozhraní na tomto počítači), která na jednom místě ukazuje všechny AI agenty a chaty: Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, Qwen Code a přes rozšíření pro Chrome i webové chaty (ChatGPT, Claude.ai, Gemini, Copilot, Perplexity, Grok, Qwen Chat). Ukazuje, kdo pracuje, kdo čeká na tebe, limity předplatných, tokeny a útratu. Data zůstávají na tomto počítači.
Stránky: Přehled (pozdrav, Spustit agenta, Vyžaduje pozornost, Stav agentů, Právě teď, limity), Upozornění, Agenti (seznam konverzací, filtry, detail s přepisem, Vzhled agenta – postava, barva, čepice, doplněk na obličej, oblečení a převleky), Projekty, Statistiky, Útrata (rozpočty, předplatné, náklady z Admin API), Dovednosti, Nastavení (Propojení, Upozornění, Účet a vzhled, Náklady za API, Aplikace na tomto počítači – spouštění, aktualizace, otevřít na telefonu, Tailscale, soukromí).
Vpravo nahoře: stav spojení, obnovit data, Hledat (otevře hledání v celé aplikaci), zvonek s upozorněními. Vedle nadpisu stránky je tlačítko zpět.`,
  en: `Agenteeq is a Mac app (also a web interface on this computer) that shows all your AI agents and chats in one place: Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, Qwen Code and, through the Chrome extension, web chats (ChatGPT, Claude.ai, Gemini, Copilot, Perplexity, Grok, Qwen Chat). It shows who is working, who is waiting for you, subscription limits, tokens and spend. Data stays on this computer.
Pages: Overview (greeting, Start agent, Needs attention, Agent status, Right now, limits), Alerts, Agents (conversation list, filters, detail with transcript, Agent look – character, colour, hat, face accessory, clothes and costumes), Projects, Statistics, Spend (budgets, subscriptions, Admin API costs), Skills, Settings (Connections, Alerts, Account and appearance, API costs, App on this computer – start at login, updates, open on phone, Tailscale, privacy).
Top right: connection status, refresh data, Search (searches the whole app), the bell with alerts. Next to the page title there is a back button.`,
};

function pokyn(jazyk) {
  return jazyk === 'en'
    ? 'You are Pomocník, the friendly built-in assistant of the Agenteeq app. Answer ONLY questions about Agenteeq, using ONLY the knowledge base below. Reply in English, 1–4 short sentences, concrete steps with exact names of pages, cards and buttons (e.g. "Settings → Alerts"). If the knowledge base does not cover it, say honestly you don\'t know and suggest the closest place in the app. For questions outside Agenteeq (code, weather, health…) politely say you only help with Agenteeq. Never invent features, numbers or settings. No markdown headings, no lists longer than 4 items.'
    : 'Jsi Pomocník, přátelský vestavěný asistent aplikace Agenteeq. Odpovídáš POUZE na otázky k Agenteeq a POUZE ze znalostní báze níže. Piš česky, tykej, 1–4 krátké věty, konkrétní kroky s přesnými názvy stránek, karet a tlačítek (třeba „Nastavení → Upozornění“). Když to znalostní báze nepokrývá, řekni poctivě, že to nevíš, a navrhni nejbližší místo v aplikaci. Na otázky mimo Agenteeq (kód, počasí, zdraví…) slušně řekni, že pomáháš jen s Agenteeq. Nikdy si nevymýšlej funkce, čísla ani nastavení. Žádné nadpisy v markdownu, seznamy nejvýš o 4 bodech.';
}

function sestavZpravy({ dotaz, historie = [], stranka = '', znalosti = [], jazyk = 'cs' }) {
  const kb = [ZAKLAD[jazyk === 'en' ? 'en' : 'cs'], ...znalosti.map((z) => String(z || '').trim()).filter(Boolean)].join('\n- ').slice(0, MAX_ZNALOSTI);
  const system = `${pokyn(jazyk)}\n\n${jazyk === 'en' ? 'KNOWLEDGE BASE' : 'ZNALOSTNÍ BÁZE'}:\n- ${kb}\n\n${jazyk === 'en' ? 'The user is now on page' : 'Uživatel je teď na stránce'}: ${String(stranka).slice(0, 40) || '?'}`;
  const hist = historie.slice(-MAX_HISTORIE).map((h) => ({ role: h.kdo === 'ja' ? 'user' : 'assistant', content: String(h.text || '').slice(0, 800) })).filter((h) => h.content);
  return { system, messages: [...hist, { role: 'user', content: String(dotaz).slice(0, 500) }] };
}

function spust(cmd, args, { cwd, timeout, env }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = execFile(cmd, args, { cwd, timeout, env, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) =>
        resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
    } catch (err) {
      resolve({ ok: false, stdout: '', stderr: String(err.message) });
      return;
    }
    child.stdin?.end();
  });
}

const vycisti = (text) => String(text || '').replace(/\r/g, '').replace(/^#+\s*/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim().slice(0, 1600);

/**
 * Vytvoří pomocníka. `claudeBin()` vrací cestu ke Claude Code (nebo nic), `ignoruj(id)` zaregistruje
 * session id, jejíž hooky má Agenteeq zahodit (aby se dotaz pomocníka neukázal jako agent).
 */
export function createPomocnikAi({ ollama, claudeBin = () => null, ignoruj = () => {}, spustit = spust, tmpDir = os.tmpdir() }) {
  let pracovni = null;
  async function slozka() {
    if (!pracovni) pracovni = await fs.mkdtemp(path.join(tmpDir, 'agenteeq-pomocnik-'));
    return pracovni;
  }

  async function engine({ smiCloud }) {
    const { model } = await vyberLokalniModel({ ollama }).catch(() => ({ model: null }));
    if (model) return { id: 'ollama', model, label: model };
    const bin = smiCloud ? claudeBin() : null;
    if (bin) return { id: 'claude-code', bin, label: 'Claude Code' };
    return null;
  }

  async function odpovez({ dotaz, historie, stranka, znalosti, jazyk = 'cs', smiCloud = true, casMs = 45000 }) {
    const e = await engine({ smiCloud });
    if (!e) return { engine: null };
    const { system, messages } = sestavZpravy({ dotaz, historie, stranka, znalosti, jazyk });
    if (e.id === 'ollama') {
      let text = '';
      try {
        await ollama.chat({ model: e.model, signal: AbortSignal.timeout(casMs), messages: [{ role: 'system', content: system }, ...messages], onDelta: (d) => { text += d; } });
      } catch {
        return { engine: null, chyba: 'ollama' };
      }
      return text.trim() ? { engine: 'ollama', label: e.label, text: vycisti(text) } : { engine: null };
    }
    // Claude Code: jedna otázka, bez nástrojů a bez paměti. Historie jde jako text v zadání.
    const id = randomUUID();
    ignoruj(id);
    const prepis = messages.slice(0, -1).map((m) => `${m.role === 'user' ? (jazyk === 'en' ? 'User' : 'Uživatel') : 'Pomocník'}: ${m.content}`).join('\n');
    const zadani = `${prepis ? `${prepis}\n\n` : ''}${jazyk === 'en' ? 'User' : 'Uživatel'}: ${messages.at(-1).content}`;
    const args = ['-p', '--output-format', 'text', '--model', 'haiku', '--session-id', id, '--no-session-persistence',
      '--tools', '', '--strict-mcp-config', '--settings', JSON.stringify({ disableAllHooks: true }),
      '--system-prompt', system, '--', zadani];
    const opts = { cwd: await slozka(), timeout: casMs, env: { ...process.env, AGENTEEQ_POMOCNIK: '1' } };
    let r = await spustit(e.bin, args, opts);
    // Starší Claude Code nezná --tools ani --no-session-persistence: stejné zadání s výčtem
    // zakázaných nástrojů (bez nich model nic nečte ani nespouští).
    if (!r.ok && /unknown option|unexpected argument|nezn/i.test(r.stderr)) {
      const starsi = args.filter((a, i) => !['--tools', '--no-session-persistence'].includes(a) && !(args[i - 1] === '--tools'));
      starsi.splice(starsi.indexOf('--'), 0, '--disallowedTools', 'Bash Edit Write MultiEdit NotebookEdit Read Glob Grep LS WebFetch WebSearch Task TodoWrite');
      r = await spustit(e.bin, starsi, opts);
    }
    if (!r.ok || !r.stdout.trim()) return { engine: null, chyba: 'claude-code' };
    return { engine: 'claude-code', label: e.label, text: vycisti(r.stdout) };
  }

  return { odpovez, engine };
}

export const _test = { sestavZpravy, vycisti };
