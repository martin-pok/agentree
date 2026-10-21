import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAgentsForList } from '../public/js/data.js';

test('seznam agentů řadí živou práci, zachycené procesy, zásah, selhání a pak ostatní stavy', () => {
  const agents = [
    { id: 'old-failed', status: 'failed', lastAt: 1 },
    { id: 'waiting', status: 'waiting', lastAt: 99 },
    { id: 'needs-input', status: 'needs_input', lastAt: 90 },
    { id: 'working-old', status: 'working', lastAt: 2 },
    { id: 'working-new', status: 'working', lastAt: 100 },
    { id: 'observed', status: 'observed', lastAt: 110 },
    { id: 'limited', status: 'limited', lastAt: 101 },
    { id: 'idle', status: 'idle', lastAt: 102 },
  ].sort(compareAgentsForList);

  assert.deepEqual(agents.map((agent) => agent.id), [
    'working-new', 'working-old', 'observed', 'needs-input', 'old-failed', 'limited', 'waiting', 'idle',
  ]);
});
