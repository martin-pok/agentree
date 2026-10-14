import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { assertVerifiedCommit, resolveTagCommit } from '../scripts/verify-publish-tag.mjs';

const commit = 'a'.repeat(40);
const tagObject = 'b'.repeat(40);
const nestedTag = 'c'.repeat(40);
const repo = 'martin-pok/agentree';
const tag = 'v0.46.8';

test('publish tag guard resolves lightweight and nested annotated tags to their commit', async () => {
  const base = `repos/${repo}/git/`;
  const lightweight = await resolveTagCommit({ repo, tag, get: async () => ({ object: { type: 'commit', sha: commit } }) });
  assert.equal(lightweight, commit);

  const calls = [];
  const responses = new Map([
    [`${base}ref/tags/${tag}`, { object: { type: 'tag', sha: tagObject } }],
    [`${base}tags/${tagObject}`, { object: { type: 'tag', sha: nestedTag } }],
    [`${base}tags/${nestedTag}`, { object: { type: 'commit', sha: commit } }],
  ]);
  assert.equal(await resolveTagCommit({ repo, tag, get: async endpoint => {
    calls.push(endpoint);
    return responses.get(endpoint);
  } }), commit);
  assert.deepEqual(calls, [...responses.keys()]);
});

test('publish tag guard rejects malformed refs, unsupported objects and unbounded indirection', async () => {
  await assert.rejects(resolveTagCommit({ repo, tag: '../main', get: async () => ({}) }), /Invalid repository or release tag/);
  await assert.rejects(resolveTagCommit({ repo, tag, get: async () => ({ object: { type: 'tree', sha: commit } }) }), /does not resolve/);
  await assert.rejects(resolveTagCommit({ repo, tag, get: async () => ({ object: { type: 'commit', sha: 'short' } }) }), /Invalid GitHub tag object/);
  await assert.rejects(resolveTagCommit({ repo, tag, get: async () => ({ object: { type: 'tag', sha: tagObject } }) }), /too deep/);
});

test('publish tag guard fails when a tag moves to another green commit', () => {
  assert.doesNotThrow(() => assertVerifiedCommit(commit, commit));
  assert.throws(() => assertVerifiedCommit(commit, 'd'.repeat(40)), /moved since CI verification/);
  assert.throws(() => assertVerifiedCommit('invalid', commit), /moved since CI verification/);
});

test('publish workflow binds CI, notes and final visibility change to the first verified SHA', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  const initial = workflow.indexOf('node scripts/verify-publish-tag.mjs "$TAG" --write verified-tag-sha.txt');
  const ci = workflow.indexOf('actions/workflows/test.yml/runs?head_sha=${SHA}');
  const notes = workflow.indexOf('node scripts/verify-publish-tag.mjs "$TAG" --check verified-tag-sha.txt --local');
  const changelog = workflow.indexOf('git show "${TAG_SHA}:CHANGELOG.md"');
  const finalCheck = workflow.lastIndexOf('node scripts/verify-publish-tag.mjs "$TAG" --check verified-tag-sha.txt');
  const publish = workflow.indexOf('gh api --method PATCH "repos/$GITHUB_REPOSITORY/releases/$RELEASE_ID"');
  assert.ok(initial > 0 && initial < ci && ci < notes && notes < changelog && changelog < finalCheck && finalCheck < publish);
  assert.match(workflow, /TAG_SHA=\$\(cat verified-tag-sha\.txt\)/);
});
