import test from 'node:test';
import assert from 'node:assert/strict';
import { openTargets, planOpen, ALL_APPS, planRuntimeFocus, RUNTIME_APPS } from '../src/openers.js';

const CODEX_ID = '01a0546a-6679-76d3-9454-ba9f37a24013';

test('Codex: otevře přímo vlákno, pokračování v Terminálu a složku', () => {
  const s = { id: `codex:${CODEX_ID}`, connector: 'codex', source: 'local', cwd: "/Users/x/it's" };
  assert.deepEqual(openTargets(s, ALL_APPS).map((t) => t.id), ['app', 'terminal', 'folder']);
  assert.deepEqual(planOpen(s, 'app', ALL_APPS).args, [`codex://threads/${CODEX_ID}`]);
  assert.equal(planOpen(s, 'terminal', ALL_APPS).command, `cd '/Users/x/it'\\''s' && codex resume ${CODEX_ID}`);
  assert.deepEqual(planOpen(s, 'folder', ALL_APPS).args, ["/Users/x/it's"]);
});

test('bez nainstalované aplikace nebo CLI se akce nenabízí', () => {
  const s = { id: `codex:${CODEX_ID}`, connector: 'codex', source: 'local', cwd: '/Users/x/web' };
  assert.deepEqual(openTargets(s, { codex: false, cli: { codex: false } }).map((t) => t.id), ['folder']);
  const claude = { id: 'claude-code:abc-123', connector: 'claude-code', source: 'local', cwd: '/Users/x' };
  const apps = { claude: true, cli: { claude: false } };
  assert.deepEqual(openTargets(claude, apps).map((t) => t.id), ['app', 'folder']);
  assert.deepEqual(planOpen(claude, 'app', apps).args, ['-a', 'Claude']);
});

test('web: jen https odkaz, žádná složka ani Terminál', () => {
  const ok = { id: 'web:chatgpt:abc', connector: 'web', source: 'web', url: 'https://chatgpt.com/c/abc' };
  assert.deepEqual(openTargets(ok, ALL_APPS).map((t) => t.id), ['app']);
  assert.deepEqual(planOpen(ok, 'app', ALL_APPS).args, ['https://chatgpt.com/c/abc']);
  const bad = { ...ok, url: 'javascript:alert(1)' };
  assert.deepEqual(openTargets(bad, ALL_APPS), []);
});

test('nebezpečné ID ani neznámý cíl neprojdou', () => {
  const evil = { id: 'claude-code:x; rm -rf ~', connector: 'claude-code', source: 'local', cwd: '/tmp' };
  assert.equal(planOpen(evil, 'terminal', ALL_APPS), null);
  assert.equal(planOpen(evil, 'shell', ALL_APPS), null);
  const cursor = { id: 'cursor:k1', connector: 'cursor', source: 'local', cwd: '/Users/x/app' };
  assert.deepEqual(planOpen(cursor, 'app', ALL_APPS).args, ['-a', 'Cursor', '/Users/x/app']);
});

test('přepnutí do aplikace: plán vzniká jen z pevného seznamu, nikdy z požadavku', () => {
  const p = planRuntimeFocus('chatgpt');
  assert.deepEqual(p, { kind: 'open', args: ['-a', 'ChatGPT'], label: 'ChatGPT', title: 'Přepnout do ChatGPT' });
  assert.equal(planRuntimeFocus('claude-desktop').args[1], 'Claude');
  assert.equal(planRuntimeFocus('vscode').args[1], 'Visual Studio Code');

  // Nic, co není v seznamu, plán nedostane — ani šikovně poskládaný vstup.
  for (const id of ['vymysleny', '../../Applications/Calculator', 'Terminal', '', null, undefined, 'chatgpt; rm -rf /']) {
    assert.equal(planRuntimeFocus(id), null, `${id} nesmí projít`);
  }
  // Každá položka seznamu má název aplikace bez cesty a bez shellových metaznaků.
  for (const [id, r] of Object.entries(RUNTIME_APPS)) {
    assert.match(id, /^[\w-]{1,40}$/, id);
    assert.match(r.app, /^[A-Za-z0-9 ]{1,40}$/, r.app);
  }
});
