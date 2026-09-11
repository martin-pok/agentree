import fs from 'node:fs/promises';
import path from 'node:path';
import { run, clip } from './util.js';

// Git pro projekty: přehled repozitáře a bezpečné pracovní kopie (worktree) pro paralelní agenty.
// Vše přes execFile s polem argumentů (bez shellu); názvy větví a cesty se ověřují před použitím.

const git = (cwd, args, timeout = 10000) => run('git', ['-C', cwd, ...args], { timeout });
const REF = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[\w][\w./-]{0,119}$/;

export const isSafeRef = (name) => typeof name === 'string' && REF.test(name) && !name.endsWith('.lock') && !name.endsWith('/') && !name.endsWith('.');

export function slugify(text, max = 24) {
  return String(text || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, max).replace(/-+$/, '') || 'ukol';
}

// Adresa vzdáleného repozitáře bez přihlašovacích údajů; odkaz na web jen u známých služeb.
export function remoteInfo(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  let host;
  let repoPath;
  const ssh = u.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?\/?$/);
  if (ssh) [, host, repoPath] = ssh;
  else {
    try {
      const x = new URL(u);
      host = x.hostname;
      repoPath = x.pathname.replace(/^\/+/, '').replace(/\.git\/?$/, '').replace(/\/+$/, '');
    } catch {
      return null;
    }
  }
  if (!/^[\w.-]+$/.test(host || '') || !/^[\w.-]+(\/[\w.-]+)*$/.test(repoPath || '')) return null;
  return { host, path: repoPath, web: ['github.com', 'gitlab.com', 'bitbucket.org'].includes(host) ? `https://${host}/${repoPath}` : null };
}

export function parseStatus(out) {
  const r = { branch: null, detached: false, upstream: null, ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0, conflicts: 0 };
  for (const line of String(out).split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const b = line.slice(14).trim();
      if (b === '(detached)') r.detached = true;
      else r.branch = b;
    } else if (line.startsWith('# branch.upstream ')) r.upstream = line.slice(18).trim();
    else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) [r.ahead, r.behind] = [Number(m[1]), Number(m[2])];
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = line.slice(2, 4);
      if (xy[0] !== '.') r.staged++;
      if (xy[1] !== '.') r.modified++;
    } else if (line.startsWith('u ')) r.conflicts++;
    else if (line.startsWith('? ')) r.untracked++;
  }
  return r;
}

export function parseWorktrees(out) {
  const list = [];
  let cur = null;
  for (const line of String(out).split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9), branch: null, head: '', detached: false, main: list.length === 0 };
      list.push(cur);
    } else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5, 12);
    else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (cur && line === 'detached') cur.detached = true;
  }
  return list;
}

export async function repoInfo(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) return { isRepo: false, error: 'Cesta musí začínat lomítkem.' };
  const st = await fs.stat(dir).catch(() => null);
  if (!st?.isDirectory()) return { isRepo: false, path: dir, error: 'Složka neexistuje.' };
  const top = await git(dir, ['rev-parse', '--show-toplevel']);
  if (!top.ok) {
    const missing = /ENOENT|not found/i.test(top.stderr);
    return { isRepo: false, path: dir, error: missing ? 'Git není nainstalovaný.' : '' };
  }
  const root = top.stdout.trim();
  const [status, log, branches, worktrees, remote] = await Promise.all([
    git(root, ['status', '--porcelain=v2', '--branch']),
    git(root, ['log', '-n', '8', '--pretty=format:%h%x1f%s%x1f%an%x1f%ct']),
    git(root, ['for-each-ref', '--sort=-committerdate', '--count=40', '--format=%(refname:short)%x1f%(committerdate:unix)', 'refs/heads']),
    git(root, ['worktree', 'list', '--porcelain']),
    git(root, ['remote', 'get-url', 'origin']),
  ]);
  const s = parseStatus(status.stdout);
  return {
    isRepo: true,
    root,
    name: path.basename(root),
    ...s,
    clean: s.staged + s.modified + s.untracked + s.conflicts === 0,
    commits: log.stdout.split('\n').filter(Boolean).map((l) => {
      const [short, subject, author, ct] = l.split('\x1f');
      return { short, subject: clip(subject, 140), author: clip(author, 60), at: Number(ct) * 1000 };
    }),
    branches: branches.stdout.split('\n').filter(Boolean).map((l) => {
      const [name, ct] = l.split('\x1f');
      return { name, at: Number(ct) * 1000 };
    }),
    worktrees: parseWorktrees(worktrees.stdout),
    remote: remote.ok ? remoteInfo(remote.stdout) : null,
  };
}

export async function createWorktree({ repo, base, branch, dir }) {
  if (!isSafeRef(branch)) return { ok: false, error: 'Neplatný název větve.' };
  if (!isSafeRef(base)) return { ok: false, error: 'Neplatná výchozí větev.' };
  if (!path.isAbsolute(dir) || /[\n\r\0]/.test(dir)) return { ok: false, error: 'Neplatná cesta pracovní kopie.' };
  const verify = await git(repo, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  if (!verify.ok) return { ok: false, error: `Větev ${base} v repozitáři neexistuje.` };
  if (await fs.stat(dir).catch(() => null)) return { ok: false, error: 'Pracovní kopie s tímto názvem už existuje.' };
  await fs.mkdir(path.dirname(dir), { recursive: true });
  const r = await git(repo, ['worktree', 'add', '-b', branch, dir, base], 60000);
  if (!r.ok) return { ok: false, error: clip(r.stderr.trim().split('\n').pop() || 'Pracovní kopii se nepodařilo vytvořit.', 200) };
  return { ok: true, path: dir, branch, base };
}

// Změny agenta proti výchozí větvi: commity i neuložené změny v jeho pracovní kopii.
export async function workDiff({ dir, base }) {
  if (!isSafeRef(base)) return { ok: false, error: 'Neplatná výchozí větev.' };
  const [short, numstat, untracked, ahead] = await Promise.all([
    git(dir, ['diff', '--shortstat', base]),
    git(dir, ['diff', '--numstat', base]),
    git(dir, ['ls-files', '--others', '--exclude-standard']),
    git(dir, ['rev-list', '--count', `${base}..HEAD`]),
  ]);
  if (!short.ok) return { ok: false, error: 'Pracovní kopie není dostupná.' };
  const files = numstat.stdout.split('\n').filter(Boolean).map((l) => {
    const [add, del, file] = l.split('\t');
    return { file, added: Number(add) || 0, removed: Number(del) || 0 };
  });
  const newFiles = untracked.stdout.split('\n').filter(Boolean);
  for (const f of newFiles) files.push({ file: f, added: 0, removed: 0, untracked: true });
  return {
    ok: true,
    files: files.slice(0, 50),
    fileCount: files.length,
    added: files.reduce((a, f) => a + f.added, 0),
    removed: files.reduce((a, f) => a + f.removed, 0),
    commits: Number(ahead.stdout.trim()) || 0,
    dirty: files.some((f) => f.untracked) || Boolean(short.stdout.trim()),
  };
}

// Přijmout práci agenta: uložit jeho změny (commit) a sloučit větev do výchozí větve v hlavní složce.
// Při konfliktu se sloučení vrátí a nic se nezmění.
export async function acceptWork({ repo, dir, branch, base, message }) {
  if (!isSafeRef(branch) || !isSafeRef(base)) return { ok: false, error: 'Neplatná větev.' };
  const wt = await git(dir, ['status', '--porcelain']);
  if (!wt.ok) return { ok: false, error: 'Pracovní kopie agenta není dostupná.' };
  if (wt.stdout.trim()) {
    const add = await git(dir, ['add', '-A']);
    const commit = add.ok ? await git(dir, ['commit', '-m', clip(message || `Agentree: práce na ${branch}`, 200)], 30000) : add;
    if (!commit.ok) {
      const identity = /user\.name|user\.email|identity/i.test(commit.stderr);
      return { ok: false, error: identity ? 'Git nezná tvoje jméno a e-mail. Nastav je v Terminálu: git config --global user.name "Jméno" a git config --global user.email "email".' : `Změny se nepodařilo uložit: ${clip(commit.stderr.trim().split('\n').pop(), 160)}` };
    }
  }
  const ahead = await git(repo, ['rev-list', '--count', `${base}..${branch}`]);
  if (!ahead.ok) return { ok: false, error: 'Větev agenta nebo výchozí větev neexistuje.' };
  if (Number(ahead.stdout.trim()) === 0) return { ok: true, merged: false, nothing: true };
  const head = await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (head.stdout.trim() !== base) return { ok: false, error: `Hlavní složka repozitáře je na větvi ${head.stdout.trim() || '?'}, ne na ${base}. Přepni ji na ${base} a zkus to znovu.` };
  const main = await git(repo, ['status', '--porcelain', '--untracked-files=no']);
  if (main.stdout.trim()) return { ok: false, error: 'Hlavní složka repozitáře má neuložené změny. Ulož je (commit) nebo odlož, pak změny agenta přijmi.' };
  const merge = await git(repo, ['merge', '--no-ff', '--no-edit', branch], 60000);
  if (!merge.ok) {
    await git(repo, ['merge', '--abort']);
    return { ok: false, conflict: true, error: 'Změny se nedají sloučit automaticky (konflikt v souborech). Nic se nezměnilo — požádej agenta, ať se přizpůsobí aktuální větvi, nebo to vyřeš ručně.' };
  }
  return { ok: true, merged: true };
}

export async function discardWork({ repo, dir, branch }) {
  if (!isSafeRef(branch)) return { ok: false, error: 'Neplatná větev.' };
  const rm = await git(repo, ['worktree', 'remove', '--force', dir], 30000);
  if (!rm.ok && await fs.stat(dir).catch(() => null)) return { ok: false, error: `Pracovní kopii se nepodařilo odstranit: ${clip(rm.stderr.trim(), 160)}` };
  await git(repo, ['worktree', 'prune']);
  await git(repo, ['branch', '-D', branch]);
  return { ok: true };
}

// Po přijetí: uklidit pracovní kopii, větev smazat jen když je sloučená.
export async function cleanupWork({ repo, dir, branch }) {
  if (!isSafeRef(branch)) return { ok: false, error: 'Neplatná větev.' };
  const dirty = await git(dir, ['status', '--porcelain']);
  if (dirty.ok && dirty.stdout.trim()) return { ok: false, error: 'Pracovní kopie má neuložené změny.' };
  await git(repo, ['worktree', 'remove', dir], 30000);
  await git(repo, ['worktree', 'prune']);
  const del = await git(repo, ['branch', '-d', branch]);
  return { ok: true, branchDeleted: del.ok };
}
