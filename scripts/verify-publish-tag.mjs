// Keep every publish step bound to the commit whose CI was checked first.
// Resolve a GitHub tag reference once per check, including annotated tags.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const shaPattern = /^[a-f0-9]{40}$/;
const tagPattern = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export async function resolveTagCommit({ repo, tag, get }) {
  if (!repoPattern.test(repo) || !tagPattern.test(tag)) throw new Error('Invalid repository or release tag');
  let object = (await get(`repos/${repo}/git/ref/tags/${tag}`))?.object;
  for (let depth = 0; depth < 5; depth++) {
    if (!object || !shaPattern.test(object.sha)) throw new Error('Invalid GitHub tag object');
    if (object.type === 'commit') return object.sha;
    if (object.type !== 'tag') throw new Error('Tag does not resolve to a commit');
    object = (await get(`repos/${repo}/git/tags/${object.sha}`))?.object;
  }
  throw new Error('Tag indirection is too deep');
}

export function assertVerifiedCommit(approved, actual) {
  if (!shaPattern.test(approved) || !shaPattern.test(actual) || actual !== approved) {
    throw new Error('Release tag moved since CI verification');
  }
}

async function main() {
  const [tag, mode, file, localOption] = process.argv.slice(2);
  if (!['--write', '--check'].includes(mode) || !file || (localOption && localOption !== '--local')) {
    throw new Error('Usage: verify-publish-tag.mjs vX.Y.Z --write|--check sha-file [--local]');
  }
  const repo = process.env.GITHUB_REPOSITORY;
  const get = async (endpoint) => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
  const sha = await resolveTagCommit({ repo, tag, get });
  if (mode === '--write') {
    if (localOption) throw new Error('--local is only valid with --check');
    await fs.writeFile(file, `${sha}\n`, { flag: 'wx' });
  } else {
    const approved = (await fs.readFile(file, 'utf8')).trim();
    assertVerifiedCommit(approved, sha);
    if (localOption) {
      const local = execFileSync('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' }).trim();
      try { assertVerifiedCommit(approved, local); }
      catch { throw new Error('Fetched local tag differs from verified source'); }
    }
  }
  console.log(`Verified release source ${sha}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { await main(); }
  catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
