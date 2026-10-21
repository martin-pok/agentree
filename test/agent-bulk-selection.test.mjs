import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { selectableSessions, pruneSelection, selectionOutsideVisible } from '../public/js/agent-bulk-selection.js';

test('hromadné zařazení zahrnuje jen konverzace, ne pouze detekované procesy', () => {
  const rows = [
    { id: 'chat-a' },
    { id: 'process', proces: { pid: 123 } },
    { id: 'chat-b' },
  ];
  assert.deepEqual(selectableSessions(rows).map((row) => row.id), ['chat-a', 'chat-b']);
});

test('výběr odstraní zaniklé/nezařaditelné konverzace a spočítá položky skryté filtrem', () => {
  const selected = new Set(['visible', 'hidden', 'gone', 'process']);
  pruneSelection(selected, [
    { id: 'visible' },
    { id: 'hidden' },
    { id: 'process', proces: { pid: 123 } },
  ]);
  assert.deepEqual([...selected], ['visible', 'hidden']);
  assert.equal(selectionOutsideVisible(selected, [{ id: 'visible' }]), 1);
});

test('výběr agentů má samostatnou akci, únikový klávesový krok a počet ve potvrzení', async () => {
  const agents = await fs.readFile(new URL('../public/js/views/agents.js', import.meta.url), 'utf8');
  const projects = await fs.readFile(new URL('../public/js/projects-ui.js', import.meta.url), 'utf8');
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(agents, /btn--primary agent-select-toggle/);
  assert.match(agents, /aria-pressed="false"/);
  assert.match(agents, /e\.key !== 'Escape'/);
  assert.match(agents, /selectionOutsideVisible\(f\.selected, list\)/);
  assert.match(projects, /Zařadit vybrané \(\{0\}\)/);
  assert.match(css, /\.agent-select-toggle\[aria-pressed='true'\]/);
});
