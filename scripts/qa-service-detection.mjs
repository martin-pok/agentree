// Real Chromium MV3 worker/content scripts -> paired local HTTP API -> unified state.
// Vendor URLs serve controlled synthetic DOM: no provider login or personal browser profile.
// This checks our transport and detector logic, not the current logged-in vendor interface.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startTestServer, api } from '../test/helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const output = 'dist/qa-detection';
const sites = [
  ['chatgpt', 'https://chatgpt.com/c/qa-synthetic'],
  ['codex-web', 'https://chatgpt.com/codex/tasks/qa-synthetic'],
  ['claude', 'https://claude.ai/chat/qa-synthetic'],
  ['claude-code-web', 'https://claude.ai/code/session_qa-synthetic'],
  ['gemini', 'https://gemini.google.com/app/qa-synthetic'],
  ['google-ai-studio', 'https://aistudio.google.com/prompts/qa-synthetic'],
  ['mscopilot', 'https://copilot.microsoft.com/chats/qa-synthetic'],
  ['perplexity', 'https://www.perplexity.ai/search/qa-synthetic'],
  ['grok', 'https://grok.com/c/qa-synthetic'],
  ['qwen', 'https://chat.qwen.ai/c/qa-synthetic'],
  ['github-copilot', 'https://github.com/copilot/c/qa-synthetic'],
];

async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    const result = await predicate();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Expected detector state not observed within 10 seconds');
}

async function listenOnExtensionPort(server) {
  await new Promise(resolve => server.server.close(resolve));
  try {
    await new Promise((resolve, reject) => {
      const fail = error => reject(error);
      server.server.once('error', fail);
      server.server.listen(4620, '127.0.0.1', () => {
        server.server.removeListener('error', fail);
        resolve();
      });
    });
  } catch (error) {
    await server.app.stop();
    throw new Error('Detector QA needs free localhost port 4620; existing applications were not touched.', { cause: error });
  }
}

function fixture(site) {
  const messages = site === 'gemini'
    ? '<user-query><span class="query-text">Synthetic prompt</span></user-query><model-response><message-content>Synthetic response</message-content></model-response>'
    : '<div data-message-author-role="user" data-role="user" data-testid="user-message">Synthetic prompt</div><div data-message-author-role="assistant" data-role="assistant" data-testid="assistant-message" data-is-streaming="false">Synthetic response</div>';
  return `<!doctype html><html><head><title>Synthetic QA ${site}</title></head><body><main>${messages}<button aria-label="Stop generating">Stop</button></main></body></html>`;
}

let server = await startTestServer({ PORT: '4620' });
await listenOnExtensionPort(server);
const a = api('http://127.0.0.1:4620');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-mv3-'));
const extension = path.resolve('extension');
const results = [];
let context;
let restartRecovery = false;
try {
  // Full Playwright Chromium supports extensions in headless mode. A distribution's
  // Chromium or chrome-headless-shell may disable command-line extension loading.
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  const code = (await a.send('POST', '/api/extension/pair-code', {})).body.code;
  // Real background fetch and browser-issued Origin. Pairing through the action popup
  // and foregrounding a native window are separate checks; no Chrome API is mocked.
  await worker.evaluate(async code => { await pair(code); await hello(); }, code);
  await context.route('https://**/*', route => {
    const entry = sites.find(([, url]) => url === route.request().url());
    return route.fulfill({ contentType: 'text/html', body: fixture(entry?.[0] || 'synthetic-resource') });
  });
  const session = async site => (await a.get('/api/state')).body.sessions.find(s => s.id.includes(`:${site}:`));
  for (const [site, url] of sites) {
    const page = await context.newPage();
    const started = Date.now();
    try {
      await page.goto(url);
      const working = await waitFor(async () => { const s = await session(site); return s?.status === 'working' && s; });
      const workingMs = Date.now() - started;
      assert.ok(workingMs <= 2000, `${site}: detection took ${workingMs} ms`);
      const detail = (await a.get(`/api/sessions/${encodeURIComponent(working.id)}`)).body;
      const counts = Object.fromEntries(['user', 'assistant'].map(role => [role, detail.transcript.filter(entry => entry.role === role).length]));
      assert.deepEqual(counts, { user: 1, assistant: 1 }, `${site}: both synthetic messages reach the transcript API`);
      await page.evaluate(() => document.querySelector('button')?.remove());
      const completed = await waitFor(async () => { const s = await session(site); return s?.status === 'waiting' && s; });
      await page.evaluate(() => {
        const alert = document.createElement('div');
        alert.setAttribute('role', 'alert'); alert.textContent = 'Usage limit reached';
        document.body.appendChild(alert);
      });
      const limited = await waitFor(async () => { const s = await session(site); return s?.status === 'limited' && s; });
      results.push({ site, workingMs, working: working.status, completed: completed.status, limited: limited.status });
    } catch (error) {
      results.push({ site, error: error.message });
    } finally {
      await page.close();
    }
  }
  // Keep one real content script alive while its local app restarts. Reuse only the
  // isolated test profile/data so the extension must recover its actual pairing.
  const page = await context.newPage();
  await page.goto(sites[0][1]);
  await waitFor(async () => (await session('chatgpt'))?.status === 'working');
  const env = { PORT: '4620', AGENTEEQ_SOURCE_HOME: server.sourceHome, AGENTEEQ_HOME: server.dataHome };
  await server.close();
  server = await startTestServer(env);
  await listenOnExtensionPort(server);
  await page.evaluate(() => document.querySelector('[data-message-author-role="assistant"]').textContent = 'Synthetic response after restart');
  await waitFor(async () => {
    const s = await session('chatgpt');
    if (s?.status !== 'working') return false;
    const detail = (await a.get(`/api/sessions/${encodeURIComponent(s.id)}`)).body;
    return detail.transcript.some(entry => entry.role === 'assistant' && entry.text === 'Synthetic response after restart');
  });
  restartRecovery = true;
  await page.close();
  assert.equal(results.length, sites.length);
  assert.equal(results.filter(r => r.error).length, 0, 'Every supported service must pass');
} finally {
  await fs.mkdir(output, { recursive: true });
  const report = { kind: 'real_chromium_mv3_with_synthetic_vendor_dom', chromeApisMocked: false, restartRecovery, results };
  await fs.writeFile(path.join(output, 'matrix.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  await context?.close();
  await server.close();
  await fs.rm(profile, { recursive: true, force: true });
}
