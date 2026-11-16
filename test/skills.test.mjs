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
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: home });
  await writeSkill(home, ['.claude', 'skills', 'shrnuti', 'SKILL.md'], '---\nname: Shrnutí změn\ndescription: Popíše diff\n---\nobsah');
  await writeSkill(home, ['.claude', 'plugins', 'cache', 'balik', 'skills', 'zaloha', 'SKILL.md'], '---\nname: Záloha\n---\nobsah');
  await writeSkill(home, ['.codex', 'skills', '.system', 'review-agent', 'SKILL.md'], '---\nname: Revize\ndescription: Kontrola příkazů\n---\nobsah');
  await writeSkill(home, ['.agents', 'skills', 'muj-postup', 'SKILL.md'], '---\nname: Můj postup\ndescription: Vlastní sdílená dovednost\n---\nobsah');
  await writeSkill(home, ['.claude', 'skills', 'shrnuti', 'POZNAMKY.md'], 'tohle není dovednost');

  const skills = createSkills({ config });
  const list = await skills.list();
  assert.equal(list.length, 4, 'jen soubory SKILL.md ze všech aktivních zdrojů');
  assert.deepEqual(list.map((s) => s.name), ['Můj postup', 'Revize', 'Shrnutí změn', 'Záloha'], 'řazeno česky podle názvu');
  assert.deepEqual(list.map((s) => s.sourceId).sort(), ['claude', 'claude-plugin', 'codex', 'shared']);
  assert.equal(list.find((s) => s.sourceId === 'shared').origin, 'own');
  const bezPopisu = list.find((s) => s.name === 'Záloha');
  assert.equal(bezPopisu.description, '', 'chybějící popis se nedomýšlí');
  assert.ok(bezPopisu.bytes > 0 && bezPopisu.at > 0);
});

test('Dovednosti: obsah se vydá jen podle id ze seznamu, cesta z požadavku se nepoužije', async () => {
  const home = await tempDir();
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: home });
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
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: home });
  const skills = createSkills({ config });
  assert.deepEqual(await skills.list(), []);
});

test('Dovednosti: najde také ~/skills a vlastní adresáře Claude Code i Codexu', async () => {
  const home = await tempDir();
  const claude = path.join(home, 'custom-claude');
  const codex = path.join(home, 'custom-codex');
  const config = loadConfig({
    AGENTEEQ_SOURCE_HOME: home,
    AGENTEEQ_HOME: home,
    AGENTEEQ_CLAUDE_CONFIG_DIR: claude,
    AGENTEEQ_CODEX_HOME: codex,
  });
  await writeSkill(home, ['skills', 'taste', 'SKILL.md'], '---\nname: Taste\ndescription: Design judgment\n---\n');
  await writeSkill(home, ['custom-claude', 'skills', 'claude-extra', 'SKILL.md'], '---\nname: Claude extra\n---\n');
  await writeSkill(home, ['custom-codex', 'skills', 'codex-extra', 'SKILL.md'], '---\nname: Codex extra\n---\n');

  const list = await createSkills({ config }).list();
  assert.deepEqual(list.map(({ name, sourceId }) => [name, sourceId]), [
    ['Claude extra', 'claude'],
    ['Codex extra', 'codex'],
    ['Taste', 'user-skills'],
  ]);
  assert.equal(createSkills({ config }).rootOf({ tool: 'claude', rel: ['skills'] }), path.join(claude, 'skills'));
});

test('Dovednosti: sleduje symlinkované adresáře a soubory bez duplicit a cyklů', async (t) => {
  const home = await tempDir();
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: home });
  const target = await writeSkill(home, ['shared-target', 'SKILL.md'], '---\nname: Linked skill\n---\n');
  await fs.mkdir(path.join(home, '.agents', 'skills'), { recursive: true });
  await fs.symlink(path.dirname(target), path.join(home, '.agents', 'skills', 'linked'), 'dir');
  await fs.symlink(path.join(home, '.agents', 'skills'), path.join(path.dirname(target), 'cycle'), 'dir');
  await fs.symlink(path.dirname(target), path.join(home, 'skills'), 'dir');
  await fs.mkdir(path.join(home, '.claude', 'skills', 'file-linked'), { recursive: true });
  await fs.symlink(target, path.join(home, '.claude', 'skills', 'file-linked', 'SKILL.md'));
  const list = await createSkills({ config }).list();
  assert.equal(list.filter((skill) => skill.name === 'Linked skill').length, 1);
  assert.match(list.find((skill) => skill.name === 'Linked skill').dir, /\.agents[\\/]skills[\\/]linked$/);
  t.after(() => fs.rm(home, { recursive: true, force: true }));
});

test('Dovednosti: seznam není potichu omezen na prvních 400 položek', async () => {
  const home = await tempDir();
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: home });
  for (let i = 0; i < 405; i++) {
    await writeSkill(home, ['.agents', 'skills', `skill-${String(i).padStart(3, '0')}`, 'SKILL.md'], `---\nname: Skill ${i}\n---\n`);
  }
  assert.equal((await createSkills({ config }).list()).length, 405);
});

test('Dovednosti: vlastní příkazy a subagenti Claude, příkazy Codexu a Gemini i dovednosti v projektu', async () => {
  const { createSkills } = await import('../src/skills.js');
  const home = await tempDir('skills-vse-');
  const projekt = await tempDir('skills-projekt-');
  const pis = async (f, t) => { await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, t); };
  await pis(path.join(home, '.claude', 'commands', 'nasadit.md'), '---\ndescription: Nasadí web na Vercel\n---\nKroky…');
  await pis(path.join(home, '.claude', 'agents', 'recenzent.md'), '---\nname: recenzent\ndescription: Projde diff jako senior\n---\n');
  await pis(path.join(home, '.codex', 'prompts', 'opravit.md'), 'Oprav chybu v testech');
  await pis(path.join(home, '.gemini', 'commands', 'git', 'commit.toml'), 'description = "Napíše zprávu commitu"\nprompt = "…"\n');
  await pis(path.join(projekt, '.claude', 'skills', 'brand', 'SKILL.md'), '---\nname: brand\ndescription: Barvy a písma klienta\n---\n');
  await pis(path.join(home, '.claude', 'commands', '.skryty.md'), 'nic');
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: path.join(home, 'app') });
  const skills = createSkills({ config, slozkyProjektu: () => [projekt, projekt, 'relativni/cesta', home] });
  const items = await skills.list();
  const podle = (n) => items.find((s) => s.name === n);
  assert.equal(podle('nasadit')?.sourceId, 'claude-command');
  assert.equal(podle('nasadit')?.description, 'Nasadí web na Vercel');
  assert.equal(podle('recenzent')?.sourceId, 'claude-agent');
  assert.equal(podle('opravit')?.sourceId, 'codex-prompt');
  assert.equal(podle('commit')?.sourceId, 'gemini-command');
  assert.equal(podle('commit')?.description, 'Napíše zprávu commitu');
  assert.equal(podle('brand')?.sourceId, 'project-claude');
  assert.equal(podle('brand')?.projekt, path.basename(projekt), 'název projektu u dovednosti, ne ve filtru zdrojů');
  assert.equal(items.filter((s) => s.name === 'brand').length, 1, 'stejná složka projektu jen jednou');
  assert.equal(items.some((s) => s.name.startsWith('.')), false, 'skryté soubory ne');
  const text = await skills.read(podle('commit').id);
  assert.match(text.text, /Napíše zprávu commitu/, 'obsah se čte z téhož souboru');
});
