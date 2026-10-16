import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAgentRobot, PERSONA_ACCESSORIES, PERSONA_AVATARS } from '../public/js/agent-appearance.js';

const source = async (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Notion: appearance customization belongs to one selected agent detail, never global Overview', async () => {
  const home = await source('public/js/home-studio.js');
  const detail = await source('public/js/views/session.js');
  assert.doesNotMatch(home, /studio-customize|data-native name="agent"/);
  assert.match(detail, /data-agent-appearance/);
  assert.match(detail, /editAgentAppearance\(v\.id, \{ onSaved: update \}\)/);
  const appearance = await source('public/js/agent-appearance.js');
  assert.match(appearance, /state\.sessions\.get\(id\)/);
  assert.match(appearance, /saved\[id\] =/);
  assert.match(appearance, /localStorage\.setItem\(PERSONA_KEY/);
});

test('Notion: compact, keyboard-addressable, branded choices instead of system dropdowns', async () => {
  const editor = await source('public/js/agent-appearance.js');
  const style = await source('public/workbench.css');
  assert.doesNotMatch(editor, /<select\b|data-native/);
  assert.match(editor, /aria-pressed="false"/);
  assert.match(editor, /control\.setAttribute\('aria-pressed', String\(selected\)\)/);
  assert.match(editor, /dialog\.showModal\(\)/);
  assert.match(editor, /dialog\.addEventListener\('close', \(\) => dialog\.remove\(\)/);
  assert.match(style, /\.appearance-choice:focus-visible/);
  assert.match(style, /@media \(max-width: 480px\)/);
});

test('Notion: avatars retain the 108x112 canonical robot proportions and allow optional vector outfits', () => {
  assert.deepEqual(PERSONA_ACCESSORIES, ['none', 'cap', 'glasses', 'shirt', 'spacesuit']);
  for (const avatar of PERSONA_AVATARS) {
    const original = renderAgentRobot(avatar);
    assert.match(original, /viewBox="0 0 108 112"/);
    assert.equal((original.match(/<svg\b/g) || []).length, 1);
    for (const outfit of PERSONA_ACCESSORIES) {
      const vector = renderAgentRobot(avatar, outfit);
      assert.match(vector, /viewBox="0 0 108 112"/);
      assert.equal((vector.match(/<\/svg>/g) || []).length, 1);
      if (outfit !== 'none') assert.match(vector, new RegExp('robot-accessory--' + outfit));
      assert.equal(vector.includes('<script'), false);
    }
  }
});

test('Notion: English translations cover all new agent appearance controls', async () => {
  const dict = await source('public/js/i18n/en.js');
  for (const text of ['Vzhled agenta', 'Upravit vzhled', 'Doplňky a oblečení', 'Bez doplňku', 'Čepice', 'Brýle', 'Tričko', 'Skafandr']) {
    assert.ok(dict.includes('"' + text + '":'), text + ' needs English translation');
  }
});
