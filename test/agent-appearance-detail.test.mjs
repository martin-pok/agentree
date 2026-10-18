import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAgentRobot, PERSONA_AVATARS } from '../public/js/agent-appearance.js';
import { WARDROBE, SLOTS, NO_LOOK, normalizeLook, pickLook } from '../public/js/robot-wardrobe.js';

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
  assert.match(editor, /dialog\.addEventListener\('close', \(\) => \{[^}]*dialog\.remove\(\)/);
  assert.match(editor, /look-grip/);
  assert.match(style, /\.look-scroll/);
  assert.match(style, /\.look-tile:focus-visible/);
  assert.match(style, /@media \(max-width: 720px\)/);
  assert.match(editor, /role="tablist"/);
  assert.match(editor, /ArrowRight/);
});

test('Notion: avatars retain the 108x112 canonical robot proportions and wear only vector clothes', () => {
  for (const avatar of PERSONA_AVATARS) {
    const original = renderAgentRobot(avatar);
    assert.match(original, /viewBox="0 0 108 112"/);
    assert.equal((original.match(/<svg\b/g) || []).length, 1);
    for (const slot of SLOTS) {
      for (const id of Object.keys(WARDROBE[slot])) {
        const vector = renderAgentRobot(avatar, pickLook({}, slot, id));
        assert.match(vector, /viewBox="0 0 108 112"/, `${slot}:${id}`);
        assert.equal((vector.match(/<svg\b/g) || []).length, 1, `${slot}:${id}`);
        assert.equal((vector.match(/<\/svg>/g) || []).length, 1, `${slot}:${id}`);
        assert.match(vector, /robot-wear/, `${slot}:${id} se musí vykreslit`);
        assert.equal(/<script|onload|href=/i.test(vector), false, `${slot}:${id}`);
        // Každá <g> je zavřená: špatně vložená vrstva by robota rozbila.
        assert.equal((vector.match(/<g\b/g) || []).length, (vector.match(/<\/g>/g) || []).length, `${slot}:${id}`);
      }
    }
  }
});

test('šatník: je z čeho vybírat a každá položka má český popisek', () => {
  assert.ok(Object.keys(WARDROBE.hat).length >= 15 && Object.keys(WARDROBE.costume).length >= 11);
  assert.ok(Object.keys(WARDROBE.face).length >= 11 && Object.keys(WARDROBE.outfit).length >= 11);
  for (const slot of SLOTS) for (const item of Object.values(WARDROBE[slot])) assert.ok(String(item.label()).length > 2);
});

test('šatník: čepice, brýle a oblečení se kombinují; převlek nahradí jen oblečení', () => {
  let look = pickLook(NO_LOOK, 'hat', 'crown');
  look = pickLook(look, 'face', 'monocle');
  look = pickLook(look, 'outfit', 'scarf');
  assert.deepEqual(look, { hat: 'crown', face: 'monocle', outfit: 'scarf', costume: 'none' });
  const suit = pickLook(look, 'costume', 'pirate');
  assert.deepEqual(suit, { hat: 'crown', face: 'monocle', outfit: 'none', costume: 'pirate' }, 'čepice a obličej zůstanou, oblečení zmizí');
  assert.equal(pickLook(suit, 'outfit', 'tee').costume, 'none', 'oblečení nahradí převlek');
  assert.equal(pickLook(suit, 'hat', 'cap').costume, 'pirate', 'čepice převlek nenahradí');
  assert.equal(pickLook(suit, 'costume', 'none').costume, 'none');
  assert.deepEqual(pickLook(look, 'hat', 'neexistuje'), look, 'neznámá položka nic nezmění');
});

test('šatník: převlek s čepicí a brýlemi se vykreslí; vlastní pokrývku hlavy převleku vyměnila čepice', () => {
  const nindza = renderAgentRobot('Scout', { costume: 'ninja' });
  assert.match(nindza, /fill-rule="evenodd"/, 'nindža má kuklu');
  const snepici = renderAgentRobot('Scout', { costume: 'ninja', hat: 'cap', face: 'glasses' });
  assert.doesNotMatch(snepici, /fill-rule="evenodd"/, 'kukla ustoupí čepici');
  assert.match(snepici, /M28 24\.5C28 7\.5 40 1\.5/, 'čepice je vidět');
  assert.match(snepici, /robot-wear--mid/, 'tělo převleku zůstalo');
  assert.match(snepici, /M32 46 25 43\.500/, 'brýle jsou vidět');
  // Přilba kosmonauta je nad brýlemi (brýle jsou uvnitř přilby), ne pod nimi.
  const kosmonaut = renderAgentRobot('Scout', { costume: 'astronaut', face: 'glasses' });
  assert.ok(kosmonaut.indexOf('stroke-width="2.200" opacity=".9"') > kosmonaut.indexOf('M32 46 25 43.500'), 'přilba je až po brýlích');
  for (const kus of [nindza, snepici, kosmonaut]) {
    assert.equal((kus.match(/<g\b/g) || []).length, (kus.match(/<\/g>/g) || []).length, 'párové <g>');
  }
});

test('šatník: vzhled uložený starou verzí (jedno „accessory“) se pořád načte', () => {
  assert.equal(normalizeLook('cap').hat, 'cap');
  assert.equal(normalizeLook({ accessory: 'glasses' }).face, 'glasses');
  assert.equal(normalizeLook({ accessory: 'shirt' }).outfit, 'tee');
  assert.equal(normalizeLook({ accessory: 'spacesuit' }).costume, 'astronaut');
  assert.deepEqual(normalizeLook(null), NO_LOOK);
  assert.deepEqual(normalizeLook({ hat: '<script>' }), NO_LOOK, 'neznámá hodnota z úložiště se zahodí');
  assert.deepEqual(normalizeLook({ costume: 'ninja', hat: 'crown', outfit: 'tee' }), { ...NO_LOOK, hat: 'crown', costume: 'ninja' }, 'převlek vyloučí jen oblečení');
});

test('Notion: English translations cover all new agent appearance controls', async () => {
  const dict = await source('public/js/i18n/en.js');
  const texty = ['Vzhled agenta', 'Upravit vzhled', 'Vzhled robota', 'Bez doplňku', 'Hlava', 'Obličej', 'Oblečení', 'Převleky', 'Postava', 'Barva', 'Obnovit výchozí', 'Bez čepice', 'Bez oblečení', 'Bez převleku'];
  for (const slot of SLOTS) for (const item of Object.values(WARDROBE[slot])) texty.push(item.label());
  for (const text of texty) {
    assert.ok(dict.includes('"' + text + '":'), text + ' needs English translation');
  }
});
