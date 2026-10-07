import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTags, validateProject, normalizeProjects, LIMITS } from '../src/projects.js';
import { startTestServer, api } from './helpers.mjs';
import { SABLONY_PROJEKTU, stitkyZTextu } from '../public/js/sablony.js';

// Štítky projektů a šablony briefu (roadmapa v0.6 #5).

test('štítky: oříznutí, bez duplicit podle velikosti písmen, nejvýš osm', () => {
  assert.deepEqual(normalizeTags(['  klient ', 'Klient', 'web,  Q4', '', 42, 'x'.repeat(LIMITS.tag + 1)]), ['klient', 'web Q4']);
  assert.equal(normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`)).length, LIMITS.tags);
  assert.deepEqual(normalizeProjects({ items: [{ id: 'a', name: 'A', tags: 'nic' }] }).items[0].tags, [], 'starý projekt bez štítků');
});

test('štítky: uložení ohlásí příliš dlouhý štítek a příliš mnoho štítků, nic tiše nezahodí', () => {
  const dlouhy = validateProject({ name: 'P', tags: ['x'.repeat(LIMITS.tag + 1)] }, []);
  assert.equal(dlouhy.ok, false);
  assert.ok(dlouhy.errors.tags);
  const moc = validateProject({ name: 'P', tags: Array.from({ length: LIMITS.tags + 1 }, (_, i) => `t${i}`) }, []);
  assert.equal(moc.ok, false);
  assert.ok(moc.errors.tags);
  const ok = validateProject({ name: 'P', tags: ['klient', 'KLIENT', 'web'] }, []);
  assert.deepEqual(ok.value.tags, ['klient', 'web'], 'duplicita jen jednou, nepočítá se do limitu');
  assert.equal(validateProject({ name: 'P', tags: 'klient' }, []).ok, false);
});

test('štítky: API uloží štítky i kostru briefu ze šablony a úprava je změní', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const vyvoj = SABLONY_PROJEKTU().find((s) => s.id === 'vyvoj');
  const r = await api(srv.url).send('POST', '/api/projects', { name: 'Web klienta', tags: stitkyZTextu('klient, web '), notes: vyvoj.brief });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.project.tags, ['klient', 'web']);
  assert.match(r.body.project.notes, /^Cíl:\nRepozitář a větev:/);
  const u = await api(srv.url).send('PATCH', `/api/projects/${r.body.project.id}`, { tags: ['interní'] });
  assert.equal(u.status, 200);
  assert.deepEqual(u.body.project.tags, ['interní']);
});

test('šablony: každá kromě prázdné má kostru briefu a štítek', () => {
  const s = SABLONY_PROJEKTU();
  assert.deepEqual(s.map((x) => x.id), ['prazdny', 'agentura', 'vyvoj', 'marketing']);
  for (const x of s.slice(1)) { assert.match(x.brief, /:\n/); assert.equal(x.tags.length, 1); }
  assert.deepEqual(stitkyZTextu(' a ,, b  c ,'), ['a', 'b c']);
});
