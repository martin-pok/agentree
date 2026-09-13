import test from 'node:test';
import assert from 'node:assert/strict';
import { originOf, ORIGINS } from '../src/skills.js';

// Zdroj říká, který nástroj dovednost čte. Původ říká, kdo ji napsal — a to je to, co uživatel
// potřebuje, když má mezi stovkou dovedností od výrobce najít dvě vlastní.

test('dovednosti z oficiálního katalogu Anthropicu se poznají v obou umístěních', () => {
  for (const d of [
    '/Users/x/.claude/plugins/marketplaces/claude-plugins-official/plugins/git/skills/commit',
    '/Users/x/.claude/plugins/cache/claude-plugins-official/plugins/docs/skills/write',
  ]) assert.equal(originOf(d), 'anthropic', d);
});

test('systémové dovednosti Codexu patří OpenAI', () => {
  assert.equal(originOf('/Users/x/.codex/skills/.system/imagegen'), 'openai');
  assert.equal(originOf('/Users/x/.codex/skills/.system/skill-creator'), 'openai');
});

test('plugin od někoho třetího není ani Anthropic, ani moje', () => {
  assert.equal(originOf('/Users/x/.claude/plugins/marketplaces/superwhisper/skills/dictate'), 'plugin');
  assert.equal(originOf('/Users/x/.claude/plugins/cache/superwhisper/skills/dictate'), 'plugin');
});

test('všechno ostatní je moje — vlastní složky, plánované úlohy i paměť Codexu', () => {
  for (const d of [
    '/Users/x/.claude/skills/muj-postup',
    '/Users/x/.claude/scheduled-tasks/pd-intake',
    '/Users/x/.codex/skills/muj-vlastni',
    '/Users/x/.codex/memories/skills/pencil-premium-frame-workflow',
  ]) assert.equal(originOf(d), 'own', d);
});

test('nesmyslný vstup nespadne a skončí jako moje', () => {
  for (const d of ['', null, undefined, '/', 'neco']) assert.equal(originOf(d), 'own');
});

test('každý původ má český název pro rozhraní', () => {
  for (const k of ['anthropic', 'openai', 'plugin', 'own']) {
    assert.ok(ORIGINS[k] && ORIGINS[k].length > 2, `chybí název pro ${k}`);
  }
  assert.equal(Object.keys(ORIGINS).length, 4, 'názvů je přesně tolik, kolik je původů');
});

// Slovo „cache" je v cestě pluginu i jinde; tenhle test hlídá, že se nechytá kdekoli.
test('samotné slovo v cestě nestačí — rozhoduje celá struktura', () => {
  assert.equal(originOf('/Users/x/.claude/skills/cache-warmer'), 'own');
  assert.equal(originOf('/Users/x/projekty/marketplaces/neco'), 'own');
});
