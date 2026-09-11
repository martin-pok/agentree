import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { normalizeProjects, validateProject, resolveProject, assignSessions, deleteProject, projectCsv, PROJECT_COLORS, NO_PROJECT } from '../src/projects.js';
import { tempDir } from './helpers.mjs';

test('projekty: normalizace zahodí neplatná data a sirotčí přiřazení', () => {
  const d = normalizeProjects({
    items: [{ id: 'a', name: '  Klient   Alfa ', color: '#nope', folders: ['/ok', 'relativni'] }, { id: 'b' }, null],
    assignments: { 's1': 'a', 's2': 'neni', 's3': NO_PROJECT, 's4': 5 },
  });
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].name, 'Klient Alfa');
  assert.equal(d.items[0].color, PROJECT_COLORS[0]);
  assert.deepEqual(d.items[0].folders, ['/ok']);
  assert.deepEqual(d.assignments, { s1: 'a', s3: '' });
});

test('projekty: validace názvu, barvy, složek a úprav', async () => {
  const dir = await tempDir();
  const items = [];
  assert.equal(validateProject({}, items).errors.name, 'Zadej název projektu.');
  const created = validateProject({ name: 'Web pro Kavárnu', folders: [dir, dir] }, items);
  assert.equal(created.ok, true);
  assert.deepEqual(created.value.folders, [dir], 'duplicitní složky se sloučí');
  items.push(created.value);
  assert.equal(validateProject({ name: 'web pro kavárnu' }, items).errors.name, 'Projekt s tímto názvem už máš.');
  assert.notEqual(validateProject({ name: 'Druhý' }, items).value.color, created.value.color, 'nový projekt dostane nepoužitou barvu');
  assert.match(validateProject({ name: 'X', folders: ['relativni'] }, items).errors.folders, /lomítkem/);
  assert.match(validateProject({ name: 'X', folders: [path.join(dir, 'neni')] }, items).errors.folders, /neexistuje/);
  assert.equal(validateProject({ name: 'X', color: 'red' }, items).errors.color, 'Vyber barvu z nabídky.');
  assert.equal(validateProject({ name: 'x'.repeat(61) }, items).errors.name, 'Název může mít nejvýš 60 znaků.');

  const edited = validateProject({ notes: 'Brief: minimalistický web', archived: true }, items, { id: created.value.id });
  assert.equal(edited.ok, true);
  assert.equal(edited.value.name, 'Web pro Kavárnu', 'úprava bez názvu název nemaže');
  assert.equal(edited.value.archived, true);
  assert.equal(validateProject({ name: 'Y' }, items, { id: 'neni' }).status, 404);
});

test('projekty: ruční přiřazení má přednost, složka automaticky (nejdelší shoda), záměrně bez projektu', async () => {
  const root = await tempDir();
  const inner = path.join(root, 'klient', 'web');
  await fs.mkdir(inner, { recursive: true });
  const data = { items: [{ id: 'p1', folders: [root] }, { id: 'p2', folders: [path.join(root, 'klient')] }], assignments: {}, snapshots: {} };
  const live = { s: { id: 's', title: 'Web kavárny', app: 'Claude Code', cwd: inner, lastAt: 5 } };
  assert.deepEqual(resolveProject({ id: 's', cwd: inner }, data), { projectId: 'p2', projectSource: 'folder' });
  assert.deepEqual(resolveProject({ id: 's', cwd: `${root}-jiny` }, data), { projectId: null, projectSource: null }, 'prefix bez oddělovače není shoda');
  assert.deepEqual(resolveProject({ id: 'w', cwd: '' }, data), { projectId: null, projectSource: null });

  assert.equal(assignSessions(data, ['s', 'w'], 'p1', (sid) => live[sid]).count, 2);
  assert.deepEqual(resolveProject({ id: 's', cwd: inner }, data), { projectId: 'p1', projectSource: 'manual' });
  assert.equal(data.snapshots.s.projectId, 'p1', 'snímek drží konverzaci v projektu i po vypadnutí z okna');
  assert.equal(data.snapshots.w, undefined, 'bez dat o konverzaci se snímek nevytvoří');
  assignSessions(data, ['s'], NO_PROJECT, (sid) => live[sid]);
  assert.deepEqual(resolveProject({ id: 's', cwd: inner }, data), { projectId: null, projectSource: 'none' });
  assert.equal(data.snapshots.s, undefined);
  assignSessions(data, ['s'], null, (sid) => live[sid]);
  assert.equal(resolveProject({ id: 's', cwd: inner }, data).projectSource, 'folder', 'reset vrátí automatické pravidlo');
  assert.equal(data.snapshots.s.projectId, 'p2', 'snímek následuje pravidlo složky');
  assert.deepEqual(Object.keys(normalizeProjects({ ...data, items: data.items.map((p) => ({ ...p, name: p.id })) }).snapshots), ['s']);

  assert.equal(assignSessions(data, [], 'p1').ok, false);
  assert.equal(assignSessions(data, ['x'], 'neni').error, 'Projekt neexistuje.');
  assert.equal(deleteProject(data, 'p1'), true);
  assert.equal(data.assignments.w, undefined, 'smazání projektu uvolní jeho konverzace');
  assert.equal(deleteProject(data, 'p1'), false);
});

test('projekty: CSV export pro vyúčtování (BOM, středníky, uvozovky, ochrana proti vzorcům)', () => {
  const now = Date.parse('2026-09-11T12:00:00Z');
  const csv = projectCsv([
    { title: '=HYPERLINK("x")', app: 'Codex · ChatGPT app', model: 'gpt-5.6', status: 'working', startedAt: now - 3600e3, lastAt: now, turns: 3, tokens: { input: 10, output: 20, cacheWrite: 5 }, hourly: { '2026-09-11T10': 5, '2026-09-11T11': 30, '2026-07-01T10': 9 }, cwd: '/Users/x/web; klient', url: '' },
  ], now);
  assert.ok(csv.startsWith('﻿Konverzace;Aplikace'));
  const line = csv.split('\r\n')[1];
  assert.ok(line.startsWith(`"'=HYPERLINK(""x"")"`), line);
  assert.ok(line.includes(';Pracuje;'));
  assert.ok(line.includes(';3;35;2;'), 'zadání, tokeny a hodiny s aktivitou za 30 dní');
  assert.ok(line.includes('"/Users/x/web; klient"'));
});
