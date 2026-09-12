import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadConfig } from '../src/config.js';
import { createSkills, parseFrontMatter } from '../src/skills.js';
import { tempDir } from './helpers.mjs';

async function writeSkill(home, rel, text) {
  const file = path.join(home, ...rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
  return file;
}

test('Dovednosti: hlavička souboru se čte, název chybí → vezme se složka', () => {
  assert.deepEqual(parseFrontMatter('---\nname: pd-intake\ndescription: "Hodinový intake"\n---\ntělo'), { name: 'pd-intake', description: 'Hodinový intake' });
  assert.deepEqual(parseFrontMatter('bez hlavičky'), {});
  assert.deepEqual(parseFrontMatter('---\nname: x\nallowed-tools: Bash\n---\n'), { name: 'x' }, 'jiné klíče se ignorují');
});

test('Dovednosti: najdou se u Claude, v pluginech i u Codexu; seznam je řazený', async () => {
  const home = await tempDir();
  const config = loadConfig({ AGENTREE_SOURCE_HOME: home, AGENTREE_HOME: home });
  await writeSkill(home, ['.claude', 'skills', 'shrnuti', 'SKILL.md'], '---\nname: Shrnutí změn\ndescription: Popíše diff\n---\nobsah');
  await writeSkill(home, ['.claude', 'plugins', 'cache', 'balik', 'skills', 'zaloha', 'SKILL.md'], '---\nname: Záloha\n---\nobsah');
  await writeSkill(home, ['.codex', 'skills', '.system', 'review-agent', 'SKILL.md'], '---\nname: Revize\ndescription: Kontrola příkazů\n---\nobsah');
  await writeSkill(home, ['.claude', 'skills', 'shrnuti', 'POZNAMKY.md'], 'tohle není dovednost');

  const skills = createSkills({ config });
  const list = await skills.list();
  assert.equal(list.length, 3, 'jen soubory SKILL.md');
  assert.deepEqual(list.map((s) => s.name), ['Revize', 'Shrnutí změn', 'Záloha'], 'řazeno česky podle názvu');
  assert.deepEqual(list.map((s) => s.sourceId).sort(), ['claude', 'claude-plugin', 'codex']);
  const bezPopisu = list.find((s) => s.name === 'Záloha');
  assert.equal(bezPopisu.description, '', 'chybějící popis se nedomýšlí');
  assert.ok(bezPopisu.bytes > 0 && bezPopisu.at > 0);
});

test('Dovednosti: obsah se vydá jen podle id ze seznamu, cesta z požadavku se nepoužije', async () => {
  const home = await tempDir();
  const config = loadConfig({ AGENTREE_SOURCE_HOME: home, AGENTREE_HOME: home });
  await writeSkill(home, ['.claude', 'skills', 'test', 'SKILL.md'], '---\nname: Test\n---\nskutečný obsah');
  await fs.writeFile(path.join(home, 'tajne.md'), 'tohle se nesmí vydat');

  const skills = createSkills({ config });
  const [item] = await skills.list();
  const read = await skills.read(item.id);
  assert.match(read.text, /skutečný obsah/);
  assert.equal(await skills.read('neexistuje000'), null, 'neznámé id nic nevydá');
  assert.equal(await skills.read('../../tajne.md'), null, 'cesta místo id se odmítne');
  assert.equal(await skills.read(''), null);
});

test('Dovednosti: prázdný a chybějící domov nic nerozbije', async () => {
  const home = await tempDir();
  const config = loadConfig({ AGENTREE_SOURCE_HOME: home, AGENTREE_HOME: home });
  const skills = createSkills({ config });
  assert.deepEqual(await skills.list(), []);
});
