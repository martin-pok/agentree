import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHistorie, denniSouhrny } from '../src/historie.js';
import { dlouheObdobi, dlouhePrihradky } from '../public/js/historie-stats.js';
import { hourKey, localDay } from '../src/util.js';
import { tempDir, startTestServer, api } from './helpers.mjs';

// Dlouhá historie Statistik (src/historie.js): konektory čtou jen 30 dní, starší dny se proto
// ukládají jako denní souhrny a po vypadnutí z okna se zmrazí. Nic se nedopočítává.

const DEN = 86400e3;
const poledne = (ts) => { const d = new Date(ts); d.setHours(12, 0, 0, 0); return d.getTime(); };

function konverzace({ id, provider = 'anthropic', app = 'Claude Code', model = 'claude-opus', project = 'web', startedAt, hodiny, turns = 3, parentId = null }) {
  const hourly = {};
  for (const [ts, tokeny] of hodiny) hourly[hourKey(ts)] = (hourly[hourKey(ts)] || 0) + tokeny;
  return { id, provider, app, model, project, startedAt, lastAt: Math.max(...hodiny.map(([t]) => t)), turns, parentId, hourly };
}

test('historie: denní souhrn sčítá tokeny, aktivní hodiny a konverzace podle dne začátku', () => {
  const den = poledne(Date.now()) - 3 * DEN;
  const s = [
    konverzace({ id: 'a', startedAt: den, hodiny: [[den, 100], [den + 3600e3, 50], [den + DEN, 30]] }),
    konverzace({ id: 'b', provider: 'openai', app: 'Codex', model: 'gpt-5', project: 'api', startedAt: den, hodiny: [[den, 20]], turns: 2 }),
    // Podagent: tokeny ano, konverzace a zadání ne (každá práce jen jednou).
    konverzace({ id: 'c', startedAt: den, hodiny: [[den, 5]], parentId: 'a', turns: 9 }),
  ];
  const dny = denniSouhrny(s, localDay(den));
  const d = dny[localDay(den)];
  assert.equal(d.tokeny, 175);
  assert.deepEqual(d.poskytovatele, { anthropic: 155, openai: 20 });
  assert.deepEqual(d.aplikace, { 'Claude Code': 155, Codex: 20 });
  assert.equal(d.hodiny, 2, 'dvě různé hodiny, souběh se počítá jednou');
  assert.equal(d.konverzace, 2);
  assert.equal(d.zadani, 5);
  assert.deepEqual(d.slozkyKonverzace, { web: 1, api: 1 });
  assert.equal(dny[localDay(den + DEN)].tokeny, 30);
  assert.equal(dny[localDay(den + DEN)].konverzace, 0, 'pokračování další den není nová konverzace');
});

test('historie: den mimo okno se zmrazí, přežije restart a nic starého se nedopočítá', async () => {
  const dataDir = await tempDir('agenteeq-historie-');
  let now = poledne(Date.now());
  const h = createHistorie({ dataDir, windowDays: 30, now: () => now });
  await h.load();
  const stary = now - 10 * DEN;
  h.aktualizuj([konverzace({ id: 'a', startedAt: stary, hodiny: [[stary, 1000]] })]);
  const od = h.snapshot().od;
  assert.equal(od, localDay(now - 27 * DEN), 'historie sahá jen tam, kde má úplná data');
  assert.equal(h.snapshot().dny[localDay(stary)].tokeny, 1000);
  // O 40 dní později: konverzace už v paměti není (vypadla z okna), den ale zůstane.
  now += 40 * DEN;
  h.aktualizuj([]);
  assert.equal(h.snapshot().dny[localDay(stary)].tokeny, 1000, 'zmrazený den se nesmaže');
  assert.equal(h.snapshot().od, od, 'začátek historie se neposouvá');
  await h.flush();
  // Restart: data z disku.
  const znovu = createHistorie({ dataDir, windowDays: 30, now: () => now });
  await znovu.load();
  assert.equal(znovu.snapshot().dny[localDay(stary)].tokeny, 1000);
  const soubor = JSON.parse(await fs.readFile(path.join(dataDir, 'historie.json'), 'utf8'));
  assert.equal(soubor.verze, 1);
  assert.doesNotMatch(JSON.stringify(soubor), /"id"|transcript|title/, 'ukládají se jen součty');
});

test('historie: den uvnitř okna se přepočítá z živých dat (oprava i smazání)', async () => {
  const dataDir = await tempDir('agenteeq-historie-');
  const now = poledne(Date.now());
  const h = createHistorie({ dataDir, windowDays: 30, now: () => now });
  await h.load();
  h.aktualizuj([konverzace({ id: 'a', startedAt: now, hodiny: [[now, 10]] })]);
  h.aktualizuj([konverzace({ id: 'a', startedAt: now, hodiny: [[now, 25]] })]);
  assert.equal(h.snapshot().dny[localDay(now)].tokeny, 25, 'žádné dvojí započtení');
  h.aktualizuj([]);
  assert.equal(h.snapshot().dny[localDay(now)], undefined, 'den v okně bez konverzací zmizí');
  await h.flush();
});

test('historie: poškozený soubor nezabrání startu', async () => {
  const dataDir = await tempDir('agenteeq-historie-');
  await fs.writeFile(path.join(dataDir, 'historie.json'), '{nedokončený');
  const h = createHistorie({ dataDir, windowDays: 30 });
  await h.load();
  assert.deepEqual(h.snapshot().dny, {});
});

test('Statistiky: 90 dní je 13 týdnů končících dneškem, 12 měsíců je 12 kalendářních měsíců', () => {
  const now = new Date(2026, 9, 7, 15).getTime();
  const q = dlouhePrihradky('quarter', now);
  assert.equal(q.length, 13);
  assert.equal(q.at(-1).dny.at(-1), '2026-10-07');
  assert.equal(new Set(q.flatMap((p) => p.dny)).size, 91);
  const y = dlouhePrihradky('year', now);
  assert.equal(y.length, 12);
  assert.equal(y[0].dny[0], '2025-11-01');
  assert.equal(y.at(-1).dny.at(-1), '2026-10-07', 'letošní měsíc končí dneškem');
});

test('Statistiky: dlouhé období sečte souhrny a mezeru před začátkem historie neprohlásí za nulu', () => {
  const now = new Date(2026, 9, 7, 15).getTime();
  const den = (tokeny, extra = {}) => ({ tokeny, poskytovatele: { anthropic: tokeny }, aplikace: { 'Claude Code': tokeny }, modely: { opus: tokeny }, slozky: { web: tokeny }, slozkyKonverzace: { web: 1 }, hodiny: 2, konverzace: 1, zadani: 4, barvy: { aplikace: { 'Claude Code': 'anthropic' }, modely: { opus: 'anthropic' }, slozky: { web: 'anthropic' } }, ...extra });
  const historie = { od: '2026-09-10', dny: { '2026-09-10': den(100), '2026-10-07': den(50) } };
  const r = dlouheObdobi(historie, 'year', now);
  assert.equal(r.tokeny, 150);
  assert.equal(r.konverzace, 2);
  assert.equal(r.zadani, 8);
  assert.equal(r.hodiny, 4);
  assert.deepEqual(r.series.map((s) => [s.key, s.values.at(-2), s.values.at(-1)]), [['anthropic', 100, 50]]);
  assert.deepEqual(r.slozky.map((x) => [x.key, x.value, x.count]), [['web', 150, 2]]);
  assert.equal(r.chybiDo, '2026-09-10', 'období začíná dřív, než historie sahá');
  assert.equal(dlouheObdobi({ od: '2025-01-01', dny: {} }, 'year', now).chybiDo, null);
});

test('API: /api/historie vrátí souhrny z živých konverzací a začátek historie', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const s = srv.app.store.ensure({ connector: 'codex', localId: 'historie', provider: 'openai', app: 'Codex' });
  const ted = Date.now();
  Object.assign(s, { title: 'Historie', lastAt: ted, startedAt: ted, turns: 1 });
  s.hourly[hourKey(ted)] = 1234;
  srv.app.store.commit(s);
  const r = await api(srv.url).send('GET', '/api/historie');
  assert.equal(r.status, 200);
  assert.equal(r.body.dny[localDay(ted)].tokeny, 1234);
  assert.match(r.body.od, /^\d{4}-\d{2}-\d{2}$/);
});
