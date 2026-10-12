// Klient Ollamy – lokální modely běží na počítači uživatele, zdarma a bez odesílání dat.
import { ui } from './texty.js';

export function createOllamaClient({ baseUrl = 'http://127.0.0.1:11434', fetchImpl = globalThis.fetch } = {}) {
  const url = (p) => `${baseUrl.replace(/\/$/, '')}${p}`;

  return {
    baseUrl,
    async models() {
      try {
        const res = await fetchImpl(url('/api/tags'), { signal: AbortSignal.timeout(800) });
        if (!res.ok) return { ok: false, models: [] };
        const json = await res.json();
        // `remote` = cloudový model (Ollama ho jen přepošle na svůj server), `capabilities` posílají
        // novější verze („completion“, „embedding“…). Obojí potřebuje Pomocník (src/pomocnik.js).
        const models = (json.models || []).map((m) => ({
          name: String(m.name || m.model || ''),
          size: Number(m.size) || 0,
          remote: Boolean(m.remote_host || m.remote_model),
          family: String(m.details?.family || ''),
          capabilities: Array.isArray(m.capabilities) ? m.capabilities.map(String) : [],
        })).filter((m) => m.name);
        return { ok: true, models };
      } catch {
        return { ok: false, models: [] };
      }
    },

    // Modely právě načtené v paměti (běžící Ollama) – pro přehled běžících aplikací.
    async loaded() {
      try {
        const res = await fetchImpl(url('/api/ps'), { signal: AbortSignal.timeout(600) });
        const json = res.ok ? await res.json() : null;
        return { ok: Boolean(json), models: (json?.models || []).map((m) => String(m.name || m.model || '')).filter(Boolean) };
      } catch {
        return { ok: false, models: [] };
      }
    },

    // Podrobnosti modelu: schopnosti a jestli je cloudový. null = nepodařilo se zjistit.
    async show(model) {
      try {
        const res = await fetchImpl(url('/api/show'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(800) });
        if (!res.ok) return null;
        const json = await res.json();
        return { remote: Boolean(json.remote_host || json.remote_model), capabilities: Array.isArray(json.capabilities) ? json.capabilities.map(String) : [] };
      } catch {
        return null;
      }
    },

    // Streamovaná odpověď: onDelta(text) pro každý kousek, na konci { tokensIn, tokensOut }.
    async chat({ model, messages, signal, onDelta }) {
      const res = await fetchImpl(url('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true }),
        signal,
      });
      if (!res.ok || !res.body) {
        let detail = '';
        try { detail = (await res.json()).error || ''; } catch { /* bez těla */ }
        throw new Error(detail ? ui('Ollama odpověděla {0}: {1}', res.status, detail) : ui('Ollama odpověděla {0}', res.status));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let result = { tokensIn: 0, tokensOut: 0 };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          let o;
          try { o = JSON.parse(line); } catch { continue; }
          if (o.error) throw new Error(`Ollama: ${o.error}`);
          if (o.message?.content) onDelta(o.message.content);
          if (o.done) result = { tokensIn: o.prompt_eval_count || 0, tokensOut: o.eval_count || 0 };
        }
      }
      return result;
    },
  };
}
