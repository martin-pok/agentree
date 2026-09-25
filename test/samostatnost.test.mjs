import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer, api } from './helpers.mjs';

// Agenteeq musí fungovat samostatně: bez npm závislostí, bez cizích serverů a bez Claude.
// Claude Code, Codex, Cursor a ostatní jsou zdroje dat, které aplikace najde, když na počítači
// jsou – ne podmínka, aby se spustila. Stejně tak účet, cloud a Admin API: jen volitelné.

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('samostatnost: žádné npm závislosti', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  for (const pole of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies']) {
    assert.deepEqual(Object.keys(pkg[pole] || {}), [], `${pole} musí zůstat prázdné (AGENTS.md: bez runtime závislostí)`);
  }
});

test('samostatnost: rozhraní aplikace nenačítá nic z cizích serverů', async () => {
  const html = await fs.readFile(path.join(ROOT, 'public/index.html'), 'utf8');
  for (const m of html.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    assert.doesNotMatch(m[1], /^(?:https?:)?\/\//, `index.html načítá ${m[1]} – písma, skripty i obrázky musí být součástí aplikace`);
  }
  const js = await fs.readdir(path.join(ROOT, 'public/js'), { recursive: true });
  for (const soubor of js.filter((f) => f.endsWith('.js'))) {
    const text = await fs.readFile(path.join(ROOT, 'public/js', soubor), 'utf8');
    assert.doesNotMatch(text, /\bimport\b[^;]*['"]https?:\/\//, `${soubor} importuje modul z internetu`);
  }
  const css = await fs.readFile(path.join(ROOT, 'public/styles.css'), 'utf8');
  assert.doesNotMatch(css, /@import\s+url\(\s*['"]?https?:/, 'styly nesmí stahovat nic zvenku');
});

test('samostatnost: bez Claude Code, bez ~/.claude, bez účtu a bez sítě aplikace nastartuje a obslouží rozhraní', async () => {
  // Domov je prázdný (žádné ~/.claude, ~/.codex…), účet i cloud vypnuté, Ollama nedostupná.
  const s = await startTestServer();
  try {
    const a = api(s.url);
    const stav = await a.get('/api/state');
    assert.equal(stav.status, 200);
    assert.deepEqual(stav.body.sessions, [], 'bez zdrojů nejsou žádné konverzace – a to je v pořádku');
    assert.ok(Array.isArray(stav.body.connectors) && stav.body.connectors.length > 0, 'konektory se nahlásí, i když nic nenašly');
    const claude = stav.body.connectors.find((c) => /claude/i.test(c.id || c.name || ''));
    if (claude) assert.notEqual(claude.state, 'error', 'chybějící Claude Code není chyba aplikace');
    const index = await fetch(`${s.url}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /<main|id="view"/, 'rozhraní se vydá');
  } finally {
    await s.close();
  }
});
