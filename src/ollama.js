// Klient Ollamy — lokální modely běží na počítači uživatele, zdarma a bez odesílání dat.

export function createOllamaClient({ baseUrl = 'http://127.0.0.1:11434', fetchImpl = globalThis.fetch } = {}) {
  const url = (p) => `${baseUrl.replace(/\/$/, '')}${p}`;

  return {
    baseUrl,
    async models() {
      try {
        const res = await fetchImpl(url('/api/tags'), { signal: AbortSignal.timeout(800) });
        if (!res.ok) return { ok: false, models: [] };
        const json = await res.json();
        const models = (json.models || []).map((m) => ({ name: String(m.name || m.model || ''), size: Number(m.size) || 0 })).filter((m) => m.name);
        return { ok: true, models };
      } catch {
        return { ok: false, models: [] };
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
        throw new Error(`Ollama odpověděla ${res.status}${detail ? `: ${detail}` : ''}`);
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
