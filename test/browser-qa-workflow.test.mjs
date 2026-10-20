import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const workflow = await fs.readFile(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8');

test('browser QA is parallelized without losing any of the ten acceptance checks', () => {
  const start = workflow.indexOf('  browser-qa:\n');
  const webStart = workflow.indexOf('  browser-web-qa:\n');
  const nextStart = workflow.indexOf('  chrome-store:\n');
  assert.ok(start >= 0 && webStart > start && nextStart > webStart, 'desktop, web and Chrome jobs must be independent');
  const desktop = workflow.slice(start, webStart);
  const web = workflow.slice(webStart, nextStart);
  const commands = (section) => [...section.matchAll(/^      - run: npm run (qa:[a-z-]+)$/gm)].map((m) => m[1]);
  const expectedDesktop = ['qa:desktop', 'qa:axe', 'qa:desktop-inset', 'qa:assistant', 'qa:refresh', 'qa:tvary', 'qa:studio'];
  const expectedWeb = ['qa:site', 'qa:extension', 'qa:contrast'];
  assert.deepEqual(commands(desktop), expectedDesktop);
  assert.deepEqual(commands(web), expectedWeb);
  assert.equal(new Set([...commands(desktop), ...commands(web)]).size, 10, 'QA steps cannot silently disappear or run twice');
  for (const [jobName, section] of [['desktop', desktop], ['web', web]]) {
    assert.match(section, /runs-on: ubuntu-24\.04$/m, jobName + ' must remain a distinct job pinned to a Playwright-verified Ubuntu');
    assert.match(section, /npm install --no-save --package-lock=false playwright@1\.62\.1( axe-core@[0-9.]+)?$/m);
    assert.match(section, /playwright install --with-deps chromium webkit/);
    assert.match(section, /if: always\(\)/, jobName + ' must preserve QA artifacts on failures');
    assert.doesNotMatch(section, /continue-on-error:\s*true/, 'failed visual QA must fail CI');
  }
  assert.match(web, /name: browser-web-qa/, 'web QA artifacts must be identifiable independently');
  assert.doesNotMatch(web, /needs:\s*browser-qa/, 'web checks cannot wait for desktop');
});

test('každý job s playwright install --with-deps má připnutou verzi Ubuntu', () => {
  const jobs = workflow.split(/^  (?=[a-z-]+:\n)/m).filter((j) => j.includes('--with-deps'));
  assert.equal(jobs.length, 3, 'desktop QA, web QA a Chrome Web Store');
  for (const job of jobs) {
    assert.match(job, /runs-on: ubuntu-24\.04$/m, job.split('\n')[0]);
    assert.doesNotMatch(job, /runs-on: ubuntu-latest/, job.split('\n')[0]);
  }
});
