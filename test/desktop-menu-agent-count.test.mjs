import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('native menu count is separate from attention badge and updates with sessions', async () => {
  const server = await fs.readFile(new URL('../desktop/server.mjs', import.meta.url), 'utf8');
  const swift = await fs.readFile(new URL('../desktop/Agenteeq.swift', import.meta.url), 'utf8');
  assert.match(server, /type: 'running-agents', count: sessions\.filter\(\(s\) => s\.status === 'working'\)\.length/);
  assert.match(server, /app\.store\.on\('session', scheduleBadge\)/);
  assert.match(server, /app\.store\.on\('session:remove', scheduleBadge\)/);
  assert.match(swift, /if type == "running-agents"/);
  assert.match(swift, /statusItem\.button\?\.title = " \\(active\)"/);
  const badge = swift.slice(swift.indexOf('if type == "badge"'), swift.indexOf('if type == "running-agents"'));
  assert.doesNotMatch(badge, /statusItem\.button\?\.title/, 'attention count never overwrites agent count');
  assert.match(swift, /statusItem\.button\?\.title = " —"/, 'unknown before first snapshot');
});
