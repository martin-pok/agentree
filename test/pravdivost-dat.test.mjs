import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createSession } from '../src/model.js';
import { applyClaudeLine, newFileState } from '../src/connectors/claude-code.js';
import { zustatekKreditu } from '../src/connectors/codex.js';
import { detectTopUps } from '../src/credits.js';
import { findLatestSample, planUsageSeries } from '../src/connectors/claude-desktop-usage.js';
import { CURSOR_HEADERS_SQL } from '../src/connectors/cursor.js';
import { limitState, limitAge, creditAge } from '../public/js/ui.js';
import { startTestServer, api, tempDir, writeJsonl } from './helpers.mjs';

// Každý test tady odpovídá nepravdě, kterou audit 22. 9. 2026 našel ve skutečných datech: aplikace
// ukazovala číslo, které se se zdrojem neshodovalo. Testy hlídají, aby se žádná z nich nevrátila.

const H = 3600e3;
const iso = (t) => new Date(t).toISOString();
const tokenyCelkem = (sessions) => sessions.reduce((a, s) => a + Object.values(s.hourly || {}).reduce((x, y) => x + y, 0), 0);

async function pockej(fn, { ms = 8000 } = {}) {
  const konec = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > konec) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const asistent = ({ t, sessionId, id, model = 'claude-opus-5', input = 0, output = 0, text = 'ok' }) => ({
  type: 'assistant', timestamp: iso(t), sessionId,
  message: { id, model, stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: input, output_tokens: output } },
});
const limitChyba = ({ t, sessionId, text = "You've hit your session limit · resets 11:20pm (Europe/Prague)" }) => ({
  type: 'assistant', timestamp: iso(t), sessionId, isApiErrorMessage: true,
  message: { id: `e-${t}`, model: '<synthetic>', content: [{ type: 'text', text }] },
});

/* ---------- Tokeny: odbočka relace nesmí počítat historii rodiče znovu ---------- */

test('odbočka relace: zkopírované řádky rodiče se do tokenů nepočítají', () => {
  const s = createSession({ connector: 'claude-code', localId: 'F', provider: 'anthropic', app: 'Claude Code' });
  const st = newFileState();
  st.ownSessionId = 'F';
  const t = Date.now() - H;
  applyClaudeLine(st, s, asistent({ t, sessionId: 'P', id: 'm1', input: 1000, output: 200 }));
  applyClaudeLine(st, s, asistent({ t: t + 60e3, sessionId: 'F', id: 'm2', input: 30, output: 7 }));
  assert.equal(s.tokens.input, 30, 'vstup jen z vlastních řádků');
  assert.equal(s.tokens.output, 7);
  assert.equal(tokenyCelkem([s]), 37);
});

test('pomocný agent: řádky nesou identifikátor rodiče a počítají se', () => {
  const s = createSession({ connector: 'claude-code', localId: 'agent-x', provider: 'anthropic', app: 'Claude Code' });
  const st = newFileState(true);
  st.ownSessionId = 'P'; // u pomocného agenta patří tokeny relaci rodiče
  applyClaudeLine(st, s, asistent({ t: Date.now() - H, sessionId: 'P', id: 'a1', input: 50, output: 10 }));
  assert.equal(tokenyCelkem([s]), 60, 'práce pomocného agenta nesmí zmizet');
});

test('řádek bez identifikátoru relace (starší formát) se počítá', () => {
  const s = createSession({ connector: 'claude-code', localId: 'F', provider: 'anthropic', app: 'Claude Code' });
  const st = newFileState();
  st.ownSessionId = 'F';
  applyClaudeLine(st, s, asistent({ t: Date.now() - H, sessionId: undefined, id: 'm1', input: 4, output: 1 }));
  assert.equal(tokenyCelkem([s]), 5);
});

test('rodič a jeho odbočka dohromady: tokeny započítané právě jednou', async () => {
  const home = await tempDir('pravda-fork-');
  const proj = path.join(home, '.claude', 'projects', '-Users-x-web');
  const t = Date.now() - 2 * H;
  const rodic = [
    { type: 'user', timestamp: iso(t), sessionId: 'P', cwd: '/Users/x/web', message: { role: 'user', content: 'Oprav web' } },
    asistent({ t: t + 1000, sessionId: 'P', id: 'm1', input: 1000, output: 200 }),
  ];
  await writeJsonl(path.join(proj, 'P.jsonl'), rodic);
  // Odbočka: celá historie rodiče (s jeho identifikátorem) a pak vlastní práce.
  await writeJsonl(path.join(proj, 'F.jsonl'), [...rodic, asistent({ t: t + H, sessionId: 'F', id: 'm2', input: 30, output: 7 })]);
  const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    const stav = await pockej(async () => {
      const r = await api(demo.url).send('GET', '/api/state');
      const cc = r.body.sessions.filter((x) => x.connector === 'claude-code');
      return cc.length === 2 ? cc : null;
    });
    assert.ok(stav, 'obě relace se načetly');
    assert.equal(tokenyCelkem(stav), 1237, 'skutečná spotřeba 1 200 + 37, ne 2 437');
    assert.equal(tokenyCelkem(stav.filter((x) => x.id.endsWith(':P'))), 1200, 'historie patří rodiči');
  } finally { await demo.close(); }
});

/* ---------- Limit relace: úspěch jiného modelu ho nesmí shodit ---------- */

test('limit vyčerpaný u jednoho modelu platí dál, i když jiný model odpovídá', async () => {
  const home = await tempDir('pravda-limit-');
  const proj = path.join(home, '.claude', 'projects', '-Users-x-web');
  const t = Date.now() - 20 * 60e3;
  // Přesně jak se to stalo 22. 9.: Opus 5 narazil na limit, v téže relaci se přepnulo na Opus 5.5
  // a ten odpověděl. Jeden soubor = pevné pořadí, úspěch se zpracuje až po hlášce.
  await writeJsonl(path.join(proj, 'P.jsonl'), [
    asistent({ t, sessionId: 'P', id: 'p1', model: 'claude-opus-5', input: 5, output: 5 }),
    limitChyba({ t: t + 60e3, sessionId: 'P' }),
    asistent({ t: t + 3 * 60e3, sessionId: 'P', id: 'p2', model: 'claude-opus-5-5', input: 5, output: 5 }),
  ]);
  const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    const limit = await pockej(async () => {
      const r = await api(demo.url).send('GET', '/api/state');
      return r.body.limits.find((l) => l.id.startsWith('claude:session'));
    });
    assert.ok(limit, 'limit relace je v přehledu');
    assert.equal(limit.model, 'claude-opus-5', 'ví se, který model narazil');
    assert.equal(limit.reached, true, 'Opus 5 je pořád zablokovaný – odpověď Opusu 5.5 to nemění');
    assert.match(limit.label, /claude-opus-5/);
  } finally { await demo.close(); }
});

test('limit skončí, když zase odpoví týž model – bez ohledu na pořadí načtení souborů', async () => {
  const home = await tempDir('pravda-limit2-');
  const proj = path.join(home, '.claude', 'projects', '-Users-x-web');
  const t = Date.now() - 20 * 60e3;
  // Hláška o limitu v jednom souboru, pozdější úspěch téhož modelu v jiném. Soubory se čtou souběžně,
  // takže úspěch se může načíst dřív než hláška – výsledek musí být stejný.
  // Soubor s pozdějším úspěchem se jmenuje abecedně dřív, takže se načte před hláškou o limitu.
  // Právě v tomhle pořadí limit dřív zůstal viset jako vyčerpaný.
  await writeJsonl(path.join(proj, 'A.jsonl'), [asistent({ t: t + 5 * 60e3, sessionId: 'A', id: 'a1', model: 'claude-opus-5' })]);
  await writeJsonl(path.join(proj, 'P.jsonl'), [
    asistent({ t, sessionId: 'P', id: 'p1', model: 'claude-opus-5' }),
    limitChyba({ t: t + 60e3, sessionId: 'P' }),
  ]);
  const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    const limit = await pockej(async () => {
      const r = await api(demo.url).send('GET', '/api/state');
      return r.body.limits.find((l) => l.id.startsWith('claude:session'));
    });
    assert.ok(limit);
    assert.equal(limit.reached, false, 'Opus 5 po limitu zase odpověděl, limit už neplatí');
  } finally { await demo.close(); }
});

/* ---------- Kredity Codexu: nula je údaj, ne šum ---------- */

test('kredity: has_credits false znamená nulu, ne „nic se nestalo“', () => {
  assert.equal(zustatekKreditu({ has_credits: false, balance: '0' }), 0);
  assert.equal(zustatekKreditu({ has_credits: false, balance: null }), 0);
  assert.equal(zustatekKreditu({ has_credits: true, balance: '5.3143140000' }), 5.314314);
  assert.equal(zustatekKreditu({ balance: null }), null, 'bez částky i bez příznaku nevíme nic');
  assert.equal(zustatekKreditu(undefined), null);
});

test('kredity: po vyčerpání aplikace ukáže nulu, ne poslední kladný zůstatek', async () => {
  const home = await tempDir('pravda-kredity-');
  const t = Date.now() - 3 * 86400e3;
  const d = new Date(t);
  const dir = path.join(home, '.codex', 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  const kredit = (at, c) => ({ timestamp: iso(at), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 1 } }, rate_limits: { limit_id: 'codex', credits: c } } });
  await writeJsonl(path.join(dir, 'rollout-k.jsonl'), [
    { timestamp: iso(t), type: 'session_meta', payload: { id: 'k', cwd: '/Users/x/web', timestamp: iso(t) } },
    kredit(t + 1000, { has_credits: true, balance: '5.3143140000', unlimited: false }),
    kredit(t + 2 * 86400e3, { has_credits: false, balance: '0', unlimited: false }),
  ]);
  const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    const c = await pockej(async () => {
      const r = await api(demo.url).send('GET', '/api/state');
      const x = r.body.credits.find((y) => y.id === 'codex');
      return x && x.history.length >= 2 ? x : null;
    });
    assert.ok(c, 'kredity se načetly');
    assert.equal(c.balance, 0, 'Codex hlásí nulu – dřív tu svítilo 5,31');
    assert.equal(c.at, t + 2 * 86400e3, 'datum patří nulovému odečtu');
  } finally { await demo.close(); }
});

test('kredity: nula z nedávné konverzace nese svoje datum, i když se historie nákupů načte až po ní', async () => {
  const home = await tempDir('pravda-kredity-poradi-');
  const slozka = (t) => { const d = new Date(t); return path.join(home, '.codex', 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')); };
  const kredit = (at, c) => ({ timestamp: iso(at), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 1 } }, rate_limits: { limit_id: 'codex', credits: c } } });
  // Nákup je ve starém souboru mimo sledované okno – ten čte až historie na pozadí.
  const stary = Date.now() - 60 * 86400e3;
  const staryFile = path.join(slozka(stary), 'rollout-stary.jsonl');
  await writeJsonl(staryFile, [
    { timestamp: iso(stary), type: 'session_meta', payload: { id: 'stary', cwd: '/Users/x/web', timestamp: iso(stary) } },
    kredit(stary + 1000, { has_credits: true, balance: '5.31', unlimited: false }),
  ]);
  const { utimes } = await import('node:fs/promises');
  await utimes(staryFile, new Date(stary), new Date(stary));
  // Nula ve včerejší konverzaci – tu čte běžný průchod jako první, dřív než historii.
  const vcera = Date.now() - 86400e3;
  await writeJsonl(path.join(slozka(vcera), 'rollout-vcera.jsonl'), [
    { timestamp: iso(vcera), type: 'session_meta', payload: { id: 'vcera', cwd: '/Users/x/web', timestamp: iso(vcera) } },
    kredit(vcera + 1000, { has_credits: false, balance: '0', unlimited: false }),
  ]);
  const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    const c = await pockej(async () => {
      const r = await api(demo.url).send('GET', '/api/state');
      const x = r.body.credits.find((y) => y.id === 'codex');
      return x && x.balance === 0 ? x : null;
    }, { ms: 12000 });
    assert.ok(c, 'po načtení historie je zůstatek nula');
    assert.equal(c.at, vcera + 1000, 'datum patří včerejšímu odečtu, ne nějakému staršímu');
  } finally { await demo.close(); }
});

test('kredity: nula, která přijde za běhu, se v aplikaci objeví hned – ne až po restartu', async () => {
  const home = await tempDir('pravda-kredity-zive-');
  const t = Date.now() - 2 * H;
  const d = new Date(t);
  const soubor = path.join(home, '.codex', 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'), 'rollout-zive.jsonl');
  const kredit = (at, c) => ({ timestamp: iso(at), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 1 } }, rate_limits: { limit_id: 'codex', credits: c } } });
  await writeJsonl(soubor, [
    { timestamp: iso(t), type: 'session_meta', payload: { id: 'zive', cwd: '/Users/x/web', timestamp: iso(t) } },
    kredit(t + 1000, { has_credits: true, balance: '12.5', unlimited: false }),
  ]);
  const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    const stav = () => api(demo.url).send('GET', '/api/state').then((r) => r.body.credits.find((y) => y.id === 'codex'));
    assert.ok(await pockej(async () => (await stav())?.balance === 12.5), 'výchozí zůstatek');
    await new Promise((r) => setTimeout(r, 2500)); // historie na pozadí doběhne a už se znovu nespustí
    const kdy = Date.now();
    await writeJsonl(soubor, [kredit(kdy, { has_credits: false, balance: '0', unlimited: false })], { append: true });
    const c = await pockej(async () => { const x = await stav(); return x?.balance === 0 ? x : null; }, { ms: 10000 });
    assert.ok(c, 'Codex za běhu nahlásil nulu – aplikace ji musí ukázat bez restartu');
    assert.equal(c.at, kdy);
  } finally { await demo.close(); }
});

test('kredity: kdo je nikdy neměl, nedostane kartu „Kredity 0“', async () => {
  const home = await tempDir('pravda-bezkreditu-');
  const t = Date.now() - 86400e3;
  const d = new Date(t);
  const dir = path.join(home, '.codex', 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  await writeJsonl(path.join(dir, 'rollout-n.jsonl'), [
    { timestamp: iso(t), type: 'session_meta', payload: { id: 'n', cwd: '/Users/x/web', timestamp: iso(t) } },
    { timestamp: iso(t + 1000), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 1 } }, rate_limits: { limit_id: 'codex', credits: { has_credits: false, balance: null } } } },
  ]);
  const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    await pockej(async () => (await api(demo.url).send('GET', '/api/state')).body.sessions.some((x) => x.connector === 'codex'));
    const r = await api(demo.url).send('GET', '/api/state');
    assert.equal(r.body.credits.length, 0);
  } finally { await demo.close(); }
});

test('doplnění kreditů: srovnání dvou konverzací není nákup', () => {
  const t = Date.parse('2026-08-01T12:59:16Z');
  // 1. 8.: jedna konverzace přehrála starší historii (pokles na 87,36), o 9 s později jiná
  // nahlásila 195,83. Napříč konverzacemi to vypadalo jako nákup +108,46 – žádný nebyl.
  const odecty = [
    { at: t - 60e3, balance: 195.83, zdroj: 'a' },
    { at: t, balance: 176.18, zdroj: 'b' }, { at: t, balance: 87.36, zdroj: 'b' },
    { at: t + 9e3, balance: 195.83, zdroj: 'a' },
    { at: t + 600e3, balance: 190.1, zdroj: 'a' },
  ];
  assert.deepEqual(detectTopUps(odecty), []);
});

test('doplnění kreditů: jedno doplnění viděné ve třech konverzacích je jedno', () => {
  const t = Date.parse('2026-07-12T07:50:58Z');
  const odecty = ['x', 'y', 'z'].flatMap((zdroj, i) => [
    { at: t - 3600e3 + i, balance: 132.08, zdroj },
    { at: t + i * 5000, balance: 250.7, zdroj },
    { at: t + 1800e3 + i, balance: 248, zdroj },
  ]);
  const nalezene = detectTopUps(odecty);
  assert.equal(nalezene.length, 1, '12. 7. to viděly tři konverzace během 15 s');
  assert.equal(Math.round(nalezene[0].amount * 100) / 100, 118.62);
});

test('doplnění kreditů: skutečné doplnění uvnitř konverzace se pozná, i dvakrát za den', () => {
  const t = Date.parse('2026-08-15T14:33:50Z');
  const odecty = [
    { at: t - 60e3, balance: 0, zdroj: 'k' }, { at: t, balance: 250, zdroj: 'k' }, { at: t + 600e3, balance: 200, zdroj: 'k' },
    { at: t + 4800e3, balance: 0, zdroj: 'k' }, { at: t + 5010e3, balance: 250, zdroj: 'k' }, { at: t + 5600e3, balance: 240, zdroj: 'k' },
  ];
  assert.deepEqual(detectTopUps(odecty).map((x) => x.amount), [250, 250]);
});

test('zůstatek kreditů nese datum a starý se zvýrazní', () => {
  const now = Date.now();
  assert.equal(creditAge({ at: now - 38 * 86400e3 }, now).stary, true);
  assert.equal(creditAge({ at: now - 38 * 86400e3 }, now).text, 'zjištěno před 38\u00a0dny');
  assert.equal(creditAge({ at: now - 3600e3 }, now).stary, false);
  assert.equal(creditAge({}, now), null, 'bez času odečtu se datum nevymýšlí');
});

/* ---------- Limity v rozhraní: stáří a vypršelá okna ---------- */

test('okno bez času obnovy po své délce vyprší – staré procento se neukáže jako současné', () => {
  const now = Date.now();
  const l = { windowMinutes: 300, usedPercent: 71, resetsAt: null, at: now - 6 * H };
  assert.equal(limitState(l, now).renewed, true, 'šest hodin po odečtu pětihodinového okna');
  assert.equal(limitState(l, now).label, 'Obnoveno');
  assert.equal(limitState({ ...l, at: now - H }, now).label, '71 %', 'v rámci okna číslo platí');
});

test('obnovené okno netvrdí, že je plná kapacita – nový stav nikdo nezměřil', () => {
  const now = Date.now();
  const { advice } = limitState({ usedPercent: 97, resetsAt: now - H, at: now - 20 * H }, now);
  assert.doesNotMatch(advice, /Plná kapacita|právě/);
});

test('limit starší než půl hodiny nese datum měření', () => {
  const now = Date.now();
  assert.equal(limitAge({ at: now - 5 * 60e3 }, now), '', 'čerstvý údaj data nepotřebuje');
  assert.equal(limitAge({ at: now - 20 * H }, now), 'změřeno před 20\u00a0h');
});

/* ---------- Historie limitů Claude: jeden účet ---------- */

test('historie Claude Desktopu: nejnovější vzorek podle času a jen jeho účet', () => {
  const now = Date.now();
  const json = {
    samples: [
      { t: now - 3 * H, org: 'B', u: { fh: 10, sd: 20 } },
      { t: now - 2 * H, org: 'A', u: { fh: 90, sd: 95 } },
      { t: now - 1 * H, org: 'B', u: { fh: 12, sd: 21 } },
      { t: now - 4 * H, org: 'A', u: { fh: 80, sd: 94 } }, // zapsáno mimo pořadí
    ],
  };
  assert.equal(findLatestSample(json).u.fh, 12, 'nejnovější podle času, ne poslední v poli');
  const serie = planUsageSeries(json, { now });
  assert.deepEqual(serie.fiveHour.map((p) => p.value), [10, 12], 'vzorky druhého účtu se nemíchají');
});

/* ---------- Cursor: agent bez času změny ---------- */

test('Cursor: agent, který má jen čas vzniku, se do období započítá', async (t) => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { t.skip('node:sqlite není k dispozici'); return; }
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE composerHeaders (composerId TEXT, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER, isArchived INTEGER, isSubagent INTEGER, value TEXT)');
  const now = Date.now();
  const vloz = db.prepare('INSERT INTO composerHeaders VALUES (?, ?, ?, ?, 0, 0, ?)');
  vloz.run('cerstvy-bez-zmeny', 'w', now - H, null, '{}');
  vloz.run('stary', 'w', now - 60 * 86400e3, now - 59 * 86400e3, '{}');
  vloz.run('cerstvy', 'w', now - 2 * H, now - H, '{}');
  const ids = db.prepare(CURSOR_HEADERS_SQL).all(now - 30 * 86400e3).map((r) => r.composerId);
  assert.deepEqual(ids.sort(), ['cerstvy', 'cerstvy-bez-zmeny']);
});
