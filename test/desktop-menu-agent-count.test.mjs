import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('native menu count is separate from attention badge and updates with sessions', async () => {
  const server = await fs.readFile(new URL('../desktop/server.mjs', import.meta.url), 'utf8');
  const swift = await fs.readFile(new URL('../desktop/Agenteeq.swift', import.meta.url), 'utf8');
  assert.ok(server.includes("type: 'running-agents', count: sessions.filter((s) => s.status === 'working').length"));
  assert.ok(server.includes("app.store.on('session', scheduleBadge)"));
  assert.ok(server.includes("app.store.on('session:remove', scheduleBadge)"));
  assert.ok(swift.includes('if type == "running-agents"'));
  assert.ok(swift.includes('statusItem.button?.title = " \\(active)"'));
  const badge = swift.slice(swift.indexOf('if type == "badge"'), swift.indexOf('if type == "running-agents"'));
  assert.ok(!badge.includes('statusItem.button?.title'), 'attention count never overwrites agent count');
  assert.ok(swift.includes('statusItem.button?.title = " —"'), 'unknown before first snapshot');
  assert.ok(swift.includes('self.statusItem.button?.title = " —"'), 'server failure must clear stale count');
  assert.ok(swift.includes('Agenteeq – spojení s agenty přerušeno'), 'disconnected status is explicit');
});
