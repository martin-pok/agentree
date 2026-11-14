// Klíčenka macOS jen se svolením (vlastník 14. 11. 2026): přihlášení Claude Code z Klíčenky se čte
// až po kliknutí „Povolit účet Claude“. Do té doby se macOS na nic neptá.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startTestServer, tempDir } from './helpers.mjs';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('přihlášení Claude se z Klíčenky čte jen se svolením – v aplikaci i v konektoru', async () => {
  const app = await zdroj('src/app.js');
  assert.match(app, /const klicenkaClaude = \(\) => Boolean\(config\.keychain\) && datastore\.data\.claudeKlicenka\?\.povoleno === true;/);
  assert.match(app, /prihlaseniClaudeCodeSDuvodem\(\{ \.\.\.config, keychain: klicenkaClaude\(\), claudeConfigDir: configDir \}\)/);
  assert.match(app, /createClaudeDesktopCodeConnector\(\{ \.\.\.ctx, claudeCloud: \{ klicenka: \(\) => klicenkaClaude\(\)/);
  const kon = await zdroj('src/connectors/claude-desktop-code.js');
  assert.match(kon, /prihlaseniClaudeCodeSDuvodem\(\{ \.\.\.config, keychain: klicenka\(\) \}\)/);
  assert.doesNotMatch(kon, /prihlaseniClaudeCodeSDuvodem\(config\)/, 'žádné čtení Klíčenky bez svolení');
});

test('svolení: výchozí vypnuto, zapne a vypne ho jen požadavek z aplikace, přežije restart', async () => {
  const home = await tempDir('klicenka-');
  const data = await tempDir('klicenka-data-');
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: data, AGENTEEQ_KEYCHAIN: '0', AGENTEEQ_CLOUD: '0', AGENTEEQ_OPEN: 'dry', AGENTEEQ_QUIET: '1', AGENTEEQ_PROCESSES: '0', AGENTEEQ_UCET_URL: '0' });
  config.keychain = true; // jako na macOS
  const app = await createApp(config);
  try {
    assert.deepEqual(app.stavKlicenky(), { potreba: true, povoleno: false }, 'bez kliknutí se Klíčenka nečte');
    assert.equal(app.spendPayload().claudeKlicenka.povoleno, false);
    assert.equal((await app.povolKlicenkuClaude(true)).claudeKlicenka.povoleno, true);
  } finally { await app.stop?.(); }
  const znovu = await createApp(config);
  try {
    assert.equal(znovu.stavKlicenky().povoleno, true, 'svolení se pamatuje');
    assert.equal((await znovu.povolKlicenkuClaude(false)).claudeKlicenka.povoleno, false, 'jde vypnout');
  } finally { await znovu.stop?.(); }
});

test('svolení přes API: bez hlavičky aplikace (CSRF) neprojde', async () => {
  const srv = await startTestServer();
  try {
    const bez = await fetch(`${srv.url}/api/claude/klicenka`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"povolit":true}' });
    assert.ok(bez.status >= 400);
    const spatne = await fetch(`${srv.url}/api/claude/klicenka`, { method: 'POST', headers: { 'X-Agenteeq': '1', 'Content-Type': 'application/json' }, body: '{"povolit":"ano"}' });
    assert.equal(spatne.status, 422);
    const ok = await fetch(`${srv.url}/api/claude/klicenka`, { method: 'POST', headers: { 'X-Agenteeq': '1', 'Content-Type': 'application/json' }, body: '{"povolit":true}' });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).claudeKlicenka.potreba, false, 'mimo macOS Klíčenka není');
  } finally { await srv.close(); }
});
