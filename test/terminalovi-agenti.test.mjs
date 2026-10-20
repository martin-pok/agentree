import test from 'node:test';
import assert from 'node:assert/strict';
import { agentniProcesy } from '../src/connectors/processes.js';
import { createBeziciAgenti } from '../src/bezici-agenti.js';
import { Store } from '../src/store.js';
import { stavAgentu } from '../public/js/stav-vety.js';
import { loadConfig } from '../src/config.js';
import { fakeDatastore, tempDir } from './helpers.mjs';

// Vlastník 20. 10. 2026: „VŽDY MUSÍME DETEKOVAT VŠECHNY AGENTY, CO PRÁVĚ BĚŽÍ.“ Agenti v terminálu,
// jejichž přepisy Agenteeq nečte (Aider, Goose, OpenCode, Amp, Crush, Droid, Auggie, Cursor Agent),
// se dřív v přehledu vůbec neukázali. Teď je každý běžící vidět jako detekovaný proces.
const radek = (pid, args, ppid = 1) => `${pid} ${ppid} 00:10 0.0 1000 ${args}`;

test('agenti v terminálu bez čitelného přepisu se počítají jako běžící agenti', () => {
  const vystup = [
    radek(101, '/opt/homebrew/bin/goose session'),
    radek(102, '/opt/homebrew/bin/opencode'),
    radek(103, '/usr/bin/python3 -m aider --model sonnet'),
    radek(104, '/Users/e/.local/bin/cursor-agent'),
    radek(105, '/usr/local/bin/amp'),
    radek(106, '/usr/local/bin/crush'),
    radek(107, '/usr/local/bin/droid'),
    radek(108, '/usr/local/bin/auggie'),
    radek(109, '/usr/local/bin/aider'),
    // Bez konverzace: server, MCP, verze, přihlášení.
    radek(201, '/opt/homebrew/bin/opencode serve --port 4096'),
    radek(202, '/opt/homebrew/bin/goose mcp developer'),
    radek(203, '/usr/local/bin/amp --version'),
    radek(204, '/Users/e/.local/bin/cursor-agent login'),
  ].join('\n');
  assert.deepEqual(agentniProcesy(vystup).map((p) => [p.pid, p.runtime]), [
    [101, 'goose'], [102, 'opencode'], [103, 'aider'], [104, 'cursor-agent'], [105, 'amp'], [106, 'crush'], [107, 'droid'], [108, 'auggie'], [109, 'aider'],
  ]);
});

test('běžící Goose bez přepisu je v přehledu jako detekovaný proces a po skončení zmizí', async () => {
  const d = await tempDir('terminal-agenti-');
  const store = new Store({ config: loadConfig({ AGENTEEQ_SOURCE_HOME: d, AGENTEEQ_HOME: d }), datastore: fakeDatastore() });
  const bezici = createBeziciAgenti({ store });
  bezici.upravit([{ pid: 101, runtime: 'goose', od: Date.now() - 5000, cwd: '/Users/e/web' }]);
  const s = store.sessions.get('goose:proces-101');
  assert.ok(s, 'Goose je v přehledu');
  assert.equal(s.app, 'Goose');
  assert.equal(s.cwd, '/Users/e/web');
  bezici.upravit(null);
  assert.ok(store.sessions.get('goose:proces-101'), 'nevíme ≠ nic neběží: při selhání výpisu zůstane');
  bezici.upravit([]);
  assert.equal(store.sessions.get('goose:proces-101'), undefined);
});

test('Přehled: „nikdo nepracuje“ přizná otevřené AI aplikace, jejichž chaty Agenteeq nevidí', () => {
  const r = stavAgentu({ nevidim: ['ChatGPT'] });
  assert.equal(r.stav, 'ok');
  assert.match(r.poznamka, /Otevřené: ChatGPT\. Chaty z těchto aplikací Agenteeq nevidí\./);
  assert.equal(stavAgentu({ pracuje: 1, nevidim: ['ChatGPT'] }).poznamka, '', 'když někdo pracuje, poznámka neruší');
  assert.equal(stavAgentu({}).poznamka, '');
});
