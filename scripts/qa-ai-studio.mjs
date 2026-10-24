// Regression for the discovery → Track → Agents flow. A running PWA proves only
// that its window is open; a web conversation appears after the extension reports it.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { startTestServer, api } from '../test/helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const engines = process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium', 'webkit'];
await fs.mkdir('dist/qa', { recursive: true });

for (const engine of engines) {
  const vypisProcesu = async () => ({
    ok: true,
    stdout: ' 4242 00:01:00 0.0 100 /Users/test/Applications/Chrome Apps.localized/Google AI Studio.app/Contents/MacOS/app_mode_loader',
  });
  const server = await startTestServer({ AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '60000' }, { vypisProcesu });
  const browserType = engine === 'webkit' ? webkit : chromium;
  const browser = await browserType.launch(engine === 'chromium' && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const a = api(server.url);
    assert.equal((await a.send('PUT', '/api/settings', { welcomeCompleted: true, objevHotovo: true, onboardingDismissed: true, lastSeenVersion: '999.0.0' })).status, 200);
    const runtime = server.app.store.runtimes.find((r) => r.id === 'pwa-google-ai-studio');
    assert.equal(runtime?.running, true, 'the PWA must really be detected as running');
    assert.equal((await a.send('POST', '/api/nastroje/pwa-google-ai-studio/pridat', {})).status, 200);

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
    await page.goto(`${server.url}/#/agenti`);
    const tracked = page.locator('[data-region="tracked-runtimes"]');
    await tracked.getByText('Google AI Studio (web)', { exact: true }).waitFor();
    assert.equal(await page.locator('dialog[open]').count(), 0, 'a modal must not hide the running app');
    assert.equal(await page.getByText('Zatím žádná webová konverzace', { exact: true }).count(), 1);
    assert.equal(await page.locator('[data-region="table"] [data-key]').count(), 0, 'process must not be invented as a conversation');
    assert.ok((await tracked.boundingBox()).y < (await page.locator('[data-region="table"]').boundingBox()).y,
      'tracked running PWA must be visible before the conversation list');
    await page.screenshot({ path: `dist/qa/${engine}-ai-studio-tracked.png` });

    const result = server.app.connectors.web.ingest({
      site: 'google-ai-studio', conversationId: 'qa-prompt', url: 'https://aistudio.google.com/apps/qa-prompt',
      title: 'QA Studio prompt', generating: true,
      messages: [{ role: 'user', text: 'Test prompt' }, { role: 'assistant', text: 'Test reply' }],
    });
    assert.equal(result.ok, true);
    const live = (await a.get('/api/state')).body.sessions.find(s => s.id === 'web:google-ai-studio:qa-prompt');
    assert.equal(live?.status, 'working');
    assert.equal(live?.url, 'https://aistudio.google.com/apps/qa-prompt');
    await page.locator('[data-region="table"] [data-key]').getByText('QA Studio prompt', { exact: true }).waitFor();
    assert.equal(await page.getByText('Zatím žádná webová konverzace', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `dist/qa/${engine}-ai-studio-session.png` });
    await tracked.getByRole('link', { name: 'Otevřít konverzaci' }).click();
    const transcript = page.getByLabel('Přepis konverzace');
    await transcript.getByText('Test prompt', { exact: true }).waitFor();
    await transcript.getByText('Test reply', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${engine}: tracked PWA and reported conversation visible`);
  } finally {
    await browser.close();
    await server.close();
  }
}
