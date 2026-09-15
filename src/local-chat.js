import { uid, clip, clipBlock, MIN } from './util.js';
import { touch, pushEntry, updateEntry, addTokens } from './model.js';

const TEXT_MAX = 20000;

// Lokální chat s modelem v Ollamě jako běžná session v Agenteeq (živý přepis, stav, tokeny).
// Konverzace žije v paměti serveru – po restartu zůstane jen do dalšího spuštění.
export function createLocalChat({ store, ollama }) {
  const chats = new Map();

  async function runTurn(s, prompt) {
    const chat = chats.get(s.id);
    const started = Date.now();
    touch(s, started);
    s.turns++;
    s.lastPrompt = prompt;
    if (!s.firstPrompt) s.firstPrompt = prompt;
    pushEntry(s, { at: started, role: 'user', text: clipBlock(prompt, TEXT_MAX) });
    chat.messages.push({ role: 'user', content: prompt });
    const entry = pushEntry(s, { at: started, role: 'assistant', text: '' });
    Object.assign(s, { running: true, runningAt: started, turnStartedAt: started, turnSteps: 0, staleMs: 10 * MIN, activity: `Generuje odpověď (${chat.model})…` });
    store.commit(s);

    const controller = new AbortController();
    chat.controller = controller;
    let text = '';
    let lastCommit = 0;
    try {
      const usage = await ollama.chat({
        model: chat.model,
        messages: chat.messages,
        signal: controller.signal,
        onDelta: (delta) => {
          text = (text + delta).slice(0, TEXT_MAX);
          const now = Date.now();
          s.runningAt = now;
          if (now - lastCommit > 120) {
            lastCommit = now;
            updateEntry(s, entry, { text });
            touch(s, now);
            store.commit(s);
          }
        },
      });
      updateEntry(s, entry, { text: text || '(model nevrátil žádný text)' });
      chat.messages.push({ role: 'assistant', content: text });
      addTokens(s, Date.now(), { input: usage.tokensIn, output: usage.tokensOut });
    } catch (err) {
      const message = controller.signal.aborted ? 'Odpověď zastavena.' : clip(err.message, 300);
      if (text) {
        updateEntry(s, entry, { text });
        chat.messages.push({ role: 'assistant', content: text });
        pushEntry(s, { at: Date.now(), role: 'error', text: message });
      } else {
        updateEntry(s, entry, { role: 'error', text: message });
        chat.messages.pop();
      }
    } finally {
      chat.controller = null;
      Object.assign(s, { running: false, activity: '' });
      touch(s, Date.now());
      store.commit(s);
    }
  }

  return {
    start({ model, prompt }) {
      const s = store.ensure({ connector: 'local-chat', localId: uid(), provider: 'local', app: `Ollama · ${model}`, source: 'local' });
      s.model = model;
      s.title = clip(prompt, 90);
      chats.set(s.id, { model, messages: [], controller: null });
      runTurn(s, prompt);
      return s.id;
    },
    reply(id, prompt) {
      const chat = chats.get(id);
      const s = store.get(id);
      if (!chat || !s) return { ok: false, status: 404, error: 'Tahle lokální konverzace už neexistuje (server se restartoval).' };
      if (chat.controller) return { ok: false, status: 409, error: 'Model ještě odpovídá. Počkej na dokončení nebo ho zastav.' };
      const text = typeof prompt === 'string' ? prompt.trim() : '';
      if (!text) return { ok: false, status: 422, error: 'Napiš zprávu.' };
      if (text.length > TEXT_MAX) return { ok: false, status: 422, error: 'Zpráva je příliš dlouhá.' };
      runTurn(s, text);
      return { ok: true };
    },
    stop(id) {
      const chat = chats.get(id);
      if (!chat?.controller) return false;
      chat.controller.abort();
      return true;
    },
    has: (id) => chats.has(id),
    isRunning: (id) => Boolean(chats.get(id)?.controller),
  };
}
