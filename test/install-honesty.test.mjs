import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, tempDir } from './helpers.mjs';
import { noDataState } from '../src/connectors/install-state.js';
import { appSupportDir, appInstalled } from '../src/platform.js';

// Složka s daty není důkaz instalace. ~/.gemini drží i nastavení MCP, ~/.copilot i VS Code zůstanou
// po odinstalaci — a aplikace z nich tvrdila „Gemini CLI je nainstalovaný“, přestože příkaz `gemini`
// na Macu nebyl. Uživatel pak hledal, proč mu „nefunguje“ nástroj, který vůbec nemá.

test('tři stavy: nalezeno, nenalezeno, nevím — a nikdy tvrzení bez opory', () => {
  const zaklad = { trace: true, name: 'Gemini CLI', traceLabel: 'složka ~/.gemini', whatMissing: 'zatím neuložil žádný chat' };

  const ano = noDataState({ ...zaklad, installed: true });
  assert.equal(ano.state, 'idle');
  assert.match(ano.detail, /je nainstalovaný/);

  const ne = noDataState({ ...zaklad, installed: false });
  assert.equal(ne.state, 'missing', 'chybějící nástroj se nesmí tvářit jako připojený');
  assert.match(ne.detail, /na tomto Macu není/);
  assert.match(ne.detail, /zůstala po něm jen složka ~\/\.gemini/, 'uživatel se dozví, proč aplikace nějakou stopu vidí');
  assert.doesNotMatch(ne.detail, /je nainstalovaný/);

  const nevim = noDataState({ ...zaklad, installed: null });
  assert.equal(nevim.state, 'idle');
  assert.doesNotMatch(nevim.detail, /nainstalovaný/, 'když se instalace neověřila, nic se o ní netvrdí');
  assert.match(nevim.detail, /Nalezena složka ~\/\.gemini/);
});

test('bez stopy a bez nástroje je odpověď stejná ve všech případech', () => {
  for (const installed of [false, null]) {
    const r = noDataState({ installed, trace: false, name: 'Qwen Code', traceLabel: 'složka ~/.qwen', whatMissing: 'x' });
    assert.equal(r.state, 'missing');
    assert.equal(r.detail, 'Qwen Code na tomto počítači není.');
  }
});

test('appInstalled hledá v obou složkách Aplikací a mimo macOS nevěří ničemu', () => {
  const existuje = new Set(['/Applications/Cursor.app', '/Users/x/Applications/Zed.app']);
  const fileExists = (p) => existuje.has(p);
  assert.equal(appInstalled('Cursor', '/Users/x', { fileExists, enabled: true }), true);
  assert.equal(appInstalled('Zed', '/Users/x', { fileExists, enabled: true }), true, 'i ~/Applications');
  assert.equal(appInstalled(['Visual Studio Code', 'VSCodium'], '/Users/x', { fileExists, enabled: true }), false);
  assert.equal(appInstalled('Cursor', '/Users/x', { fileExists, enabled: false }), null, 'jiný systém = nevím, ne „ne“');
});

async function stav(installed, pripravit) {
  const home = await tempDir('agenteeq-honest-');
  await pripravit(home);
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: home }, { installed });
  try {
    await srv.app.rescan?.();
    return Object.fromEntries(['gemini-cli', 'qwen-code', 'copilot-cli', 'vscode-copilot'].map((id) => [id, srv.app.connectors[id].status()]));
  } finally {
    await srv.close();
  }
}

test('Gemini CLI: stará složka bez příkazu = „není“, ne „je nainstalovaný“', async () => {
  const pripravit = (home) => fs.mkdir(path.join(home, '.gemini'), { recursive: true });
  const bezPrikazu = await stav({ bin: () => false, app: () => false }, pripravit);
  assert.equal(bezPrikazu['gemini-cli'].state, 'missing');
  assert.doesNotMatch(bezPrikazu['gemini-cli'].detail, /je nainstalovaný/);
  assert.match(bezPrikazu['gemini-cli'].detail, /zůstala po něm jen složka/);

  const sPrikazem = await stav({ bin: (n) => n === 'gemini', app: () => false }, pripravit);
  assert.equal(sPrikazem['gemini-cli'].state, 'idle');
  assert.match(sPrikazem['gemini-cli'].detail, /Gemini CLI je nainstalovaný/);

  const nevim = await stav({ bin: () => null, app: () => null }, pripravit);
  assert.doesNotMatch(nevim['gemini-cli'].detail, /nainstalovaný/);
});

test('Copilot CLI a VS Code: stejné pravidlo, nezávisle na sobě', async () => {
  const pripravit = async (home) => {
    await fs.mkdir(path.join(home, '.copilot'), { recursive: true });
    await fs.mkdir(path.join(appSupportDir(home), 'Code', 'User'), { recursive: true });
  };
  const r = await stav({ bin: (n) => n === 'copilot', app: () => false }, pripravit);
  assert.match(r['copilot-cli'].detail, /Copilot CLI je nainstalovaný/, 'příkaz je → smí se tvrdit');
  assert.equal(r['vscode-copilot'].state, 'missing', 'VS Code aplikace není → jen osiřelá složka');
  assert.doesNotMatch(r['vscode-copilot'].detail, /je nainstalovaný/);
});

test('Qwen Code bez stopy i bez příkazu hlásí „není“', async () => {
  const r = await stav({ bin: () => false, app: () => false }, async () => {});
  assert.equal(r['qwen-code'].state, 'missing');
  assert.equal(r['qwen-code'].detail, 'Qwen Code na tomto počítači není.');
});
