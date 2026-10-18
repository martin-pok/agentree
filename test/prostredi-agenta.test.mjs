import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envOf, jeCloud, ENV } from '../public/js/icons.js';

// Ikona u agenta (notebook / mrak) musí odpovídat tomu, kde agent opravdu pracuje. Vzdálená relace
// Claude Code z claude.ai/code běží na serverech Anthropicu, ne na tomto počítači – dřív dostala notebook.
test('mrak u konverzací z prohlížeče a vzdálených relací Claude Code, notebook u místních agentů', () => {
  const vzdalena = { connector: 'claude-desktop-code', source: 'desktop-cache', app: 'Claude Desktop · vzdálený Code' };
  const web = { connector: 'web', source: 'web', app: 'Codex · web' };
  const mistni = [{ connector: 'codex', app: 'Codex · aplikace', cwd: '/Users/m/Documents/Codex/x' }, { connector: 'claude-code', app: 'Claude Code' }, { connector: 'cursor', app: 'Cursor' }];
  assert.equal(envOf(vzdalena), ENV.cloud);
  assert.equal(envOf(web), ENV.cloud);
  for (const s of mistni) { assert.equal(envOf(s), ENV.local, s.app); assert.equal(jeCloud(s), false); }
});
