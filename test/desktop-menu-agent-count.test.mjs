import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pocetProListu } from '../public/js/agent-selection.js';

test('native menu count is separate from attention badge and updates with sessions', async () => {
  const server = await fs.readFile(new URL('../desktop/server.mjs', import.meta.url), 'utf8');
  const swift = await fs.readFile(new URL('../desktop/Agenteeq.swift', import.meta.url), 'utf8');
  assert.ok(server.includes('pocetProListu(sessions)'), 'menu bar uses the same agent selection as overview and extension');
  assert.ok(server.includes("type: 'running-agents', count: running, uncertain: nejiste"));
  assert.ok(server.includes('setInterval(badge, 15_000)'), 'time-based status expiry must refresh the menu bar');
  assert.ok(server.includes('!== lastRunningKey'), 'unchanged counts must not produce duplicate events');
  assert.ok(server.includes("app.store.on('session', scheduleBadge)"));
  assert.ok(server.includes("app.store.on('session:remove', scheduleBadge)"));
  assert.ok(swift.includes('if type == "running-agents"'));
  assert.ok(swift.includes('statusItem.button?.title = title'));
  assert.ok(swift.includes('active == 0 ? " ?"'), 'only stale agents: unknown, never a confident 0');
  const badge = swift.slice(swift.indexOf('if type == "badge"'), swift.indexOf('if type == "running-agents"'));
  assert.ok(!badge.includes('statusItem.button?.title'), 'attention count never overwrites agent count');
  assert.ok(swift.includes('statusItem.button?.title = " —"'), 'unknown before first snapshot');
  assert.ok(swift.includes('self.statusItem.button?.title = " —"'), 'server failure must clear stale count');
  assert.ok(swift.includes('Agenteeq – spojení s agenty přerušeno'), 'disconnected status is explicit');
});

// Lišta dřív počítala `status === 'working'` přímo ze všech relací: podřízený agent i starší běh
// plánované úlohy se počítaly navíc a vzdálený Claude Code bez čerstvého stavu (stale) dal „0“,
// i když podle posledních dat pracoval.
test('menu bar count: same selection as overview, stale agents are uncertain, not zero', () => {
  const s = (id, status, extra = {}) => ({ id, status, lastAt: 1, stale: false, ...extra });
  assert.deepEqual(pocetProListu([]), { pracuje: 0, nejiste: 0 });
  assert.deepEqual(pocetProListu([
    s('rodic', 'working'),
    s('pod', 'working', { parentId: 'rodic' }),
    s('ukol-stary', 'working', { connector: 'x', taskName: 't', lastAt: 1 }),
    s('ukol-novy', 'working', { connector: 'x', taskName: 't', lastAt: 2 }),
    s('vzdaleny', 'waiting', { stale: true }),
    s('hotovy', 'waiting'),
    s('cekajici', 'needs_input'),
  ]), { pracuje: 2, nejiste: 1 });
  assert.deepEqual(pocetProListu([s('vzdaleny', 'waiting', { stale: true })]), { pracuje: 0, nejiste: 1 });
});
