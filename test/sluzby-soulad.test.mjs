import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { WEB_SITES, normalizedWebUrl } from '../src/connectors/web.js';
import { WEBY } from '../src/napojeni.js';
import { RUNTIMES, rozpoznejNastroj } from '../src/connectors/processes.js';
import { APLIKACE, PROGRAMY } from '../src/objev.js';

// Každá AI služba, kterou Agenteeq ukazuje, musí jít opravdu rozpoznat – napříč všemi seznamy,
// které o ní něco tvrdí: napojení (src/napojeni.js), adaptéry rozšíření (extension/sites.js),
// oprávnění rozšíření (manifest), povolené adresy serveru (src/connectors/web.js), okno nalezených
// nástrojů (src/objev.js) a katalog procesů (src/connectors/processes.js). Rozejdou-li se,
// „Napojit“ čeká na službu, kterou rozšíření pojmenuje jinak, nebo ji vůbec nevidí.

const okno = { sessionStorage: { getItem: () => null, setItem: () => {} } };
const kontext = vm.createContext({ window: okno, sessionStorage: okno.sessionStorage, Event: class {}, InputEvent: class {} });
vm.runInContext(await fs.readFile(new URL('../extension/sites.js', import.meta.url), 'utf8'), kontext);
const { SITES, detect } = kontext.window.AgenteeqSites;
const manifest = JSON.parse(await fs.readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
const vzor = (glob, url) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(url);
const pokryto = (seznam, url) => seznam.some((g) => vzor(g, url));
const CESTA = { 'codex-web': '/codex', 'claude-code-web': '/code', 'github-copilot': '/copilot', 'google-ai-studio': '/prompts/new_chat' };

test('soulad služeb: adresa z „Napojit“ pozná rozšíření jako tutéž službu a smí ji číst i server', () => {
  for (const [id, w] of Object.entries(WEBY)) {
    assert.equal(detect(new URL(w.url))?.id, id, `${w.url}: rozšíření by službu pojmenovalo jinak a napojení by nikdy nepotvrdilo`);
    assert.ok(pokryto(manifest.content_scripts[0].matches, w.url), `${w.url}: na stránce neběží skript rozšíření`);
    assert.ok(pokryto(manifest.host_permissions, w.url), `${w.url}: chybí oprávnění rozšíření`);
    assert.ok(WEB_SITES[id], `${id}: server službu nezná`);
    assert.ok(normalizedWebUrl(id, w.url), `${w.url}: server adresu odmítne`);
  }
});

test('soulad služeb: každá adresa adaptéru je v manifestu i na seznamu serveru, každá služba serveru má adaptér', () => {
  for (const s of SITES) {
    for (const host of s.hosts) {
      const url = `https://${host}${CESTA[s.id] || '/'}`;
      assert.ok(pokryto(manifest.content_scripts[0].matches, url), `${s.id}: ${url} mimo content_scripts`);
      assert.ok(normalizedWebUrl(s.id, url), `${s.id}: server odmítne ${url}`);
    }
  }
  for (const id of Object.keys(WEB_SITES)) assert.ok(SITES.find((s) => s.id === id), `${id}: služba serveru bez adaptéru v rozšíření`);
});

test('soulad služeb: každý nástroj z okna nalezených se z typického procesu pozná jako on sám', () => {
  for (const [id, jmena] of Object.entries(APLIKACE)) {
    for (const j of jmena) assert.equal(rozpoznejNastroj(`/Applications/${j}.app/Contents/MacOS/${j}`)?.id, id, `${j}.app`);
  }
  for (const [id, program] of Object.entries(PROGRAMY)) assert.equal(rozpoznejNastroj(`/usr/local/bin/${program}`)?.id, id, program);
  for (const r of RUNTIMES.filter((x) => x.druh === 'webova-aplikace')) {
    const jmeno = r.name.replace(/ \(web\)$/, '');
    assert.equal(rozpoznejNastroj(`/Users/x/Applications/Chrome Apps.localized/${jmeno}.app/Contents/MacOS/app_mode_loader`)?.id, r.id, jmeno);
  }
});

test('soulad služeb: Windows, spuštění přes npm a agenti jen v terminálu', () => {
  const vzorky = {
    goose: '/opt/homebrew/bin/goose session',
    amp: '/usr/local/bin/amp',
    crush: '/usr/local/bin/crush',
    droid: '/usr/local/bin/droid',
    'claude-code': 'node /Users/x/.nvm/versions/node/v22/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    codex: 'node /usr/local/lib/node_modules/@openai/codex/bin/codex.js',
    'gemini-cli': 'node /usr/local/lib/node_modules/@google/gemini-cli/dist/index.js',
    cursor: 'C:\\Users\\x\\AppData\\Local\\Programs\\cursor\\Cursor.exe',
    vscode: 'C:\\Users\\x\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
    'claude-desktop': 'C:\\Users\\x\\AppData\\Local\\AnthropicClaude\\app-1.0\\Claude.exe',
    'codex-app': 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1.0_x64\\app\\Codex.exe',
  };
  for (const [id, args] of Object.entries(vzorky)) assert.equal(rozpoznejNastroj(args)?.id, id, args);
  // Pomocný proces aplikace se nepočítá jako další spuštěný nástroj (Claude by byl dvakrát).
  assert.equal(rozpoznejNastroj('/Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper'), null);
});
