import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createHttpServer } from '../src/http.js';

export async function tempDir(prefix = 'agenteeq-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeJsonl(file, rows, { append = false } = {}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  if (append) await fs.appendFile(file, body);
  else await fs.writeFile(file, body);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, timeout = 4000, step = 25) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(step);
  }
  throw new Error(`Podmínka nesplněna do ${timeout} ms`);
}

export function fakeDatastore(settings = {}) {
  return {
    data: {
      settings: { notifications: { needsInput: true, limits: true, budget: true, done: true, doneMinSeconds: 60, native: false, browser: false, ...settings } },
      alerts: [],
      alertKeys: {},
      credits: {},
    },
    pushAlert(a) { this.data.alerts.push(a); },
    save() {},
  };
}

export async function startTestServer(env = {}, appOptions = {}) {
  const sourceHome = env.AGENTEEQ_SOURCE_HOME || (await tempDir('agenteeq-src-'));
  const dataHome = env.AGENTEEQ_HOME || (await tempDir('agenteeq-data-'));
  const config = loadConfig({
    PORT: '0',
    AGENTEEQ_SOURCE_HOME: sourceHome,
    AGENTEEQ_HOME: dataHome,
    AGENTEEQ_PROCESSES: '0',
    AGENTEEQ_NATIVE_NOTIFY: '0',
    AGENTEEQ_KEYCHAIN: '0',
    AGENTEEQ_CLOUD: '0',
    AGENTEEQ_SCAN_MS: '60000',
    AGENTEEQ_QUIET: '1',
    AGENTEEQ_OPEN: 'dry',
    // Nikdy nesahat na skutečnou Ollamu na počítači, kde běží testy (port 9 = discard, spojení odmítnuto).
    AGENTEEQ_OLLAMA_URL: 'http://127.0.0.1:9',
    ...env,
  });
  const app = await createApp(config, appOptions);
  await app.start();
  const server = createHttpServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    app,
    server,
    url,
    sourceHome,
    dataHome,
    async close() {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
      await app.stop();
    },
  };
}

// Minimalistický SSE klient nad fetch – sbírá události do pole.
export async function openStream(url) {
  const controller = new AbortController();
  const res = await fetch(`${url}/api/stream`, { signal: controller.signal });
  const events = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const event = chunk.match(/^event: (.+)$/m)?.[1];
          const data = chunk.match(/^data: (.+)$/m)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data), at: Date.now() });
        }
      }
    } catch { /* přerušeno */ }
  })();
  return { events, close: () => controller.abort() };
}

export const api = (url) => ({
  get: (p) => fetch(url + p).then(async (r) => ({ status: r.status, body: await r.json() })),
  send: (method, p, body, headers = { 'X-Agenteeq': '1' }) =>
    fetch(url + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, body: await r.json() })),
});

export const EXTENSION_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

// Spáruje rozšíření tak, jak to dělá skutečná instalace: jednorázový kód z okna aplikace,
// požadavek z původu chrome-extension://… a volitelně ID instalace. Vrací status a odpověď.
export async function pairExtension(url, { origin = EXTENSION_ORIGIN, installationId } = {}) {
  const code = (await api(url).send('POST', '/api/extension/pair-code', {})).body.code;
  const headers = { Origin: origin, 'X-Agenteeq-Pair-Code': code, ...(installationId ? { 'X-Agenteeq-Installation-Id': installationId } : {}) };
  const res = await fetch(`${url}/api/extension/pair`, { method: 'POST', headers });
  return { status: res.status, ...(await res.json()) };
}
