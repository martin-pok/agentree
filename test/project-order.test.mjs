import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.mjs';
import { PROJECT_COLORS, normalizeProjects, reorderProjects } from '../src/projects.js';

test('paleta má šestnáct různých barev a kalná šedožlutá v ní není', () => {
  assert.equal(PROJECT_COLORS.length, 16);
  assert.equal(new Set(PROJECT_COLORS).size, 16);
  assert.ok(!PROJECT_COLORS.includes('#C99A3E'));
  assert.ok(PROJECT_COLORS.every((c) => /^#[0-9A-F]{6}$/.test(c)));
});

test('starší projekt s původní žlutou dostane novou, ostatní barvy zůstanou', () => {
  const d = normalizeProjects({ items: [
    { id: 'a', name: 'A', color: '#C99A3E' },
    { id: 'b', name: 'B', color: '#4285F4' },
    { id: 'c', name: 'C', color: '#123456' },
  ] });
  assert.equal(d.items[0].color, '#F2B824');
  assert.equal(d.items[1].color, '#4285F4', 'modrá se nemění');
  assert.equal(d.items[2].color, PROJECT_COLORS[0], 'neznámá barva padne na výchozí');
});

test('změna pořadí přeuspořádá jen vybrané a ostatní nechá na místě', () => {
  const d = { items: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })) };
  assert.equal(reorderProjects(d, ['c', 'a', 'b']), true);
  assert.equal(d.items.map((p) => p.id).join(''), 'cabde');
  assert.equal(reorderProjects(d, ['e', 'x', 'd']), true, 'neznámé ID se ignoruje');
  assert.equal(d.items.map((p) => p.id).join(''), 'cabed');
  assert.equal(reorderProjects(d, ['a']), false, 'jedna položka nic nemění');
  assert.equal(reorderProjects(d, 'a,b'), false);
  assert.equal(reorderProjects(d, [1, 2]), false);
  assert.equal(d.items.length, 5, 'žádný projekt nezmizí ani se nezdvojí');
});

test('pořadí projektů se ukládá přes rozhraní a přežije čtení stavu', async () => {
  const t = await startTestServer();
  try {
    const ids = [];
    for (const name of ['Alfa', 'Beta', 'Gama']) ids.push(t.app.createProject({ name }).project.id);
    const res = await fetch(`${t.url}/api/projects/order`, { method: 'PUT', headers: { 'X-Agenteeq': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [ids[2], ids[0], ids[1]] }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.projects.items.map((p) => p.name), ['Gama', 'Alfa', 'Beta']);
    const bad = await fetch(`${t.url}/api/projects/order`, { method: 'PUT', headers: { 'X-Agenteeq': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ['jen-jedno'] }) });
    assert.equal(bad.status, 422);
    const cross = await fetch(`${t.url}/api/projects/order`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    assert.equal(cross.status, 403, 'bez hlavičky se pořadí nezmění (CSRF)');
  } finally {
    await t.close();
  }
});
