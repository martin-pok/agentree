import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoInfo, createWorktree, workDiff, acceptWork, discardWork, cleanupWork, remoteInfo, isSafeRef, slugify, parseStatus } from '../src/git.js';
import { tempDir } from './helpers.mjs';

const g = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

async function makeRepo() {
  const dir = await tempDir('agenteeq-git-');
  g(dir, 'init', '-q', '-b', 'main');
  g(dir, 'config', 'user.name', 'Test');
  g(dir, 'config', 'user.email', 'test@example.com');
  g(dir, 'config', 'commit.gpgsign', 'false');
  g(dir, 'config', 'core.hooksPath', path.join(dir, '.no-hooks'));
  // Git na Windows si ve výchozím stavu překládá konce řádků (core.autocrlf=true).
  // Agenteeq do obsahu souborů nesahá, takže by test porovnával chování Gitu, ne naše.
  g(dir, 'config', 'core.autocrlf', 'false');
  await fs.writeFile(path.join(dir, 'README.md'), '# Web\n');
  g(dir, 'add', '-A');
  g(dir, 'commit', '-q', '-m', 'Začátek');
  return dir;
}

test('git: pomocné funkce — bezpečné větve, slug, adresa bez hesla, status', () => {
  for (const ok of ['main', 'agenteeq/claude-cenik-1430', 'feature/x.y']) assert.equal(isSafeRef(ok), true, ok);
  for (const bad of ['-rf', 'a..b', 'x.lock', 'a b', 'refs//x', '', 'x/', 'x@{1}', '$(rm)']) assert.equal(isSafeRef(bad), false, bad);
  assert.equal(slugify('Přidej ceník & testy!'), 'pridej-cenik-testy');
  assert.equal(slugify('   '), 'ukol');
  assert.deepEqual(remoteInfo('https://jan:tajne@github.com/studio/web.git'), { host: 'github.com', path: 'studio/web', web: 'https://github.com/studio/web' });
  assert.deepEqual(remoteInfo('git@gitlab.com:studio/app.git'), { host: 'gitlab.com', path: 'studio/app', web: 'https://gitlab.com/studio/app' });
  assert.equal(remoteInfo('nesmysl'), null);
  const s = parseStatus('# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1\n1 M. N... 100644 100644 100644 a b x.js\n1 .M N... 100644 100644 100644 a b y.js\n? novy.txt\nu UU N... 1 2 3 4 a b c k.js');
  assert.deepEqual(s, { branch: 'main', detached: false, upstream: 'origin/main', ahead: 2, behind: 1, staged: 1, modified: 1, untracked: 1, conflicts: 1 });
});

test('git: přehled repozitáře a složka, která repozitář není', async () => {
  const repo = await makeRepo();
  g(repo, 'remote', 'add', 'origin', 'https://jan:tajne@github.com/studio/web.git');
  await fs.writeFile(path.join(repo, 'novy.txt'), 'x');
  const info = await repoInfo(path.join(repo));
  assert.equal(info.isRepo, true);
  assert.equal(info.branch, 'main');
  assert.equal(info.untracked, 1);
  assert.equal(info.clean, false);
  assert.equal(info.commits[0].subject, 'Začátek');
  assert.equal(info.worktrees.length, 1);
  assert.equal(info.remote.web, 'https://github.com/studio/web');
  assert.ok(!JSON.stringify(info).includes('tajne'), 'heslo z adresy se nikdy nevrací');
  const plain = await tempDir();
  assert.equal((await repoInfo(plain)).isRepo, false);
  assert.equal((await repoInfo('relativni')).isRepo, false);
});

test('git: pracovní kopie agenta → změny → přijetí (commit + sloučení) → úklid', async () => {
  const repo = await makeRepo();
  const wtRoot = await tempDir('agenteeq-wt-');
  const dir = path.join(wtRoot, 'claude-cenik');
  assert.equal((await createWorktree({ repo, base: 'main', branch: '-bad', dir })).ok, false);
  assert.equal((await createWorktree({ repo, base: 'neni', branch: 'agenteeq/x', dir })).error, 'Větev neni v repozitáři neexistuje.');
  const wt = await createWorktree({ repo, base: 'main', branch: 'agenteeq/claude-cenik', dir });
  assert.equal(wt.ok, true, wt.error);
  assert.equal((await createWorktree({ repo, base: 'main', branch: 'agenteeq/jina', dir })).ok, false, 'stejná složka podruhé ne');
  assert.equal((await repoInfo(repo)).worktrees.length, 2);

  await fs.writeFile(path.join(dir, 'cenik.html'), '<h1>Ceník</h1>\n');
  await fs.appendFile(path.join(dir, 'README.md'), 'Ceník\n');
  const diff = await workDiff({ dir, base: 'main' });
  assert.equal(diff.fileCount, 2);
  assert.equal(diff.dirty, true);
  assert.ok(diff.files.some((f) => f.file === 'cenik.html' && f.untracked));

  await fs.writeFile(path.join(repo, 'rozpracovano.txt'), 'nesmí vadit');
  const accepted = await acceptWork({ repo, dir, branch: 'agenteeq/claude-cenik', base: 'main', message: 'Agenteeq: Claude Code — ceník' });
  assert.deepEqual(accepted, { ok: true, merged: true });
  assert.equal(await fs.readFile(path.join(repo, 'cenik.html'), 'utf8'), '<h1>Ceník</h1>\n');
  assert.match(g(repo, 'log', '--oneline', '-3'), /Agenteeq: Claude Code — ceník/);

  const cleaned = await cleanupWork({ repo, dir, branch: 'agenteeq/claude-cenik' });
  assert.deepEqual(cleaned, { ok: true, branchDeleted: true });
  assert.equal((await repoInfo(repo)).worktrees.length, 1);
});

test('git: konflikt se bezpečně vrátí, neuložené změny v hlavní složce blokují, zahození odstraní vše', async () => {
  const repo = await makeRepo();
  const wtRoot = await tempDir('agenteeq-wt-');
  const dir = path.join(wtRoot, 'codex-readme');
  await createWorktree({ repo, base: 'main', branch: 'agenteeq/codex-readme', dir });
  await fs.writeFile(path.join(dir, 'README.md'), '# Web od Codexu\n');
  await fs.writeFile(path.join(repo, 'README.md'), '# Web ručně\n');

  const blocked = await acceptWork({ repo, dir, branch: 'agenteeq/codex-readme', base: 'main' });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /neuložené změny/);

  g(repo, 'commit', '-q', '-am', 'Ruční úprava');
  const head = g(repo, 'rev-parse', 'HEAD');
  const conflict = await acceptWork({ repo, dir, branch: 'agenteeq/codex-readme', base: 'main' });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, true);
  assert.equal(g(repo, 'rev-parse', 'HEAD'), head, 'hlavní větev se nezměnila');
  assert.equal(g(repo, 'status', '--porcelain'), '', 'žádný rozpracovaný merge');

  g(repo, 'checkout', '-q', '-b', 'jina');
  assert.match((await acceptWork({ repo, dir, branch: 'agenteeq/codex-readme', base: 'main' })).error, /je na větvi jina/);
  g(repo, 'checkout', '-q', 'main');

  assert.deepEqual(await discardWork({ repo, dir, branch: 'agenteeq/codex-readme' }), { ok: true });
  assert.equal(await fs.stat(dir).catch(() => null), null);
  assert.doesNotMatch(g(repo, 'branch'), /codex-readme/);
});
