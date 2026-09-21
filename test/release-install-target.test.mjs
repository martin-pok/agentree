import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../scripts/release-mac.mjs', import.meta.url), 'utf8');

test('lokální instalace macOS nemůže nahradit libovolnou cestu', () => {
  assert.match(source, /const UZIVATELSKE_APLIKACE = path\.join\(os\.homedir\(\), 'Applications', 'Agenteeq\.app'\)/);
  assert.match(source, /const SYSTEMOVE_APLIKACE = '\/Applications\/Agenteeq\.app'/);
  assert.match(source, /process\.env\.AGENTEEQ_INSTALL_PATH/);
  assert.match(source, /new Set\(\[UZIVATELSKE_APLIKACE, SYSTEMOVE_APLIKACE\]\)/);
  assert.match(source, /pozadovanyCil \|\| \(await existuje\(UZIVATELSKE_APLIKACE\) \? UZIVATELSKE_APLIKACE : SYSTEMOVE_APLIKACE\)/);
});
