import test from 'node:test';
import assert from 'node:assert/strict';
import { slozkaSDotazySystemu } from '../src/platform.js';
import { planLaunch } from '../src/launcher.js';
import { lzeOdpovedet } from '../src/odpoved.js';
import { tempDir } from './helpers.mjs';

// Agent spuštěný z Agenteeq na pozadí je podproces Agenteeq. Z domovské nebo chráněné složky by
// si prošel Fotky, Zprávy a další soukromé složky a macOS by se jménem Agenteeq ptal na povolení
// (vlastník 20. 10. 2026: „to se nesmí stávat“). Proto se tam na pozadí nespouští ani neobnovuje.
const H = '/Users/eva';

test('chráněné složky macOS: domov, kořen, Library, média a přímo Plocha/Dokumenty/Stažené', () => {
  for (const c of ['/', '/Users', H, `${H}/`, `${H}/Library`, `${H}/Library/Application Support/x`, `${H}/Pictures`, `${H}/Pictures/Fotky`, `${H}/Music`, `${H}/Movies/a`, `${H}/Desktop`, `${H}/Documents`, `${H}/Downloads`]) {
    assert.equal(slozkaSDotazySystemu(c, H, 'macos'), true, c);
  }
  for (const c of [`${H}/Documents/web`, `${H}/Desktop/Design & Web`, `${H}/Downloads/repo`, `${H}/code/agentree`, '/tmp/x', `${H}/.config`]) {
    assert.equal(slozkaSDotazySystemu(c, H, 'macos'), false, c);
  }
  assert.equal(slozkaSDotazySystemu(H, H, 'linux'), false, 'jinde se systém neptá');
  assert.equal(slozkaSDotazySystemu('relativni', H, 'macos'), false);
});

// Skutečné složky z tempDir: pravidlo počítá s cestami macOS, na Windows by D:\… nebyla absolutní POSIX cesta.
test('spuštění na pozadí v domovské složce se odmítne, v Terminálu projde', { skip: process.platform === 'win32' && 'cesty macOS (POSIX); pravidlo samo ověřuje test výše' }, async () => {
  const home = await tempDir('dotazy-home-');
  const env = { bins: { claude: '/usr/local/bin/claude', codex: '/usr/local/bin/codex' }, ollama: [] };
  for (const agent of ['claude-code', 'codex']) {
    const r = await planLaunch({ agent, mode: 'background', prompt: 'ahoj', cwd: home }, env, { home, system: 'macos', promptFile: '/tmp/p.txt' });
    assert.equal(r.ok, false, agent);
    assert.equal(r.field, 'cwd');
    assert.match(r.error, /Fotky, Zprávy/);
    const t = await planLaunch({ agent, mode: 'terminal', prompt: 'ahoj', cwd: home }, env, { home, system: 'macos', promptFile: '/tmp/p.txt' });
    assert.equal(t.ok, true, `${agent}: Terminál se ptá sám za sebe`);
  }
  const projekt = await tempDir('dotazy-projekt-');
  const ok = await planLaunch({ agent: 'claude-code', mode: 'background', prompt: 'ahoj', cwd: projekt }, env, { home, system: 'macos' });
  assert.equal(ok.ok, true);
});

test('odpověď z aplikace do konverzace běžící v domovské složce se nenabídne', () => {
  const s = { connector: 'claude-code', localId: '01234567-89ab-4cde-8f01-23456789abcd', cwd: H, id: 'claude-code:x' };
  const r = lzeOdpovedet(s, { procesy: [], claude: '/bin/claude', home: H, system: 'macos' });
  assert.equal(r.lze, false);
  assert.equal(r.kod, 'slozka-chranena');
  assert.equal(lzeOdpovedet({ ...s, cwd: `${H}/code/web` }, { procesy: [], claude: '/bin/claude', home: H, system: 'macos' }).lze, true);
});
