import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { jeNocniTicho, minutyDne, normalizujTicho } from '../src/nocni-ticho.js';
import { AlertEngine, NARAZ, PROBUZENI, textSouhrnu } from '../src/alerts.js';
import { Store } from '../src/store.js';
import { loadConfig } from '../src/config.js';
import { normalizeData } from '../src/datastore.js';
import { tempDir, fakeDatastore, startTestServer, api, waitFor } from './helpers.mjs';

// Noční ticho a souhrn místo jednotlivých upozornění (src/nocni-ticho.js, src/alerts.js).
// Všechno běží na pevných hodinách: `now` se AlertEngine podstrčí a čas se posouvá ručně,
// nikde se nečeká na skutečný čas. Časy se skládají v místním čase (new Date(r, m, d, h, min)),
// takže testy platí v jakémkoli časovém pásmu – stejně jako ticho, které se řídí hodinami počítače.

const cas = (h, m = 0, den = 28, s = 0) => new Date(2026, 8, den, h, m, s).getTime();
const NOC = { quietHours: true, quietFrom: '22:00', quietTo: '07:00' };

test('noční ticho přes půlnoc: začátek do ticha patří, konec už ne', () => {
  const pripady = [[21, 59, false], [22, 0, true], [23, 59, true], [0, 0, true], [3, 30, true], [6, 59, true], [7, 0, false], [12, 0, false]];
  for (const [h, m, ticho] of pripady) assert.equal(jeNocniTicho(NOC, cas(h, m)), ticho, `${h}:${String(m).padStart(2, '0')}`);
  assert.equal(jeNocniTicho(NOC, cas(6, 59, 28, 59)), true, '6:59:59 je pořád ticho');
  assert.equal(jeNocniTicho(NOC, cas(21, 59, 28, 59)), false, '21:59:59 ještě ne');
});

test('noční ticho v rámci dne, vypnuté, stejné časy a nesmysly', () => {
  const odpoledne = { quietHours: true, quietFrom: '13:00', quietTo: '15:30' };
  for (const [h, m, ticho] of [[12, 59, false], [13, 0, true], [15, 29, true], [15, 30, false], [23, 0, false], [2, 0, false]]) {
    assert.equal(jeNocniTicho(odpoledne, cas(h, m)), ticho, `${h}:${m}`);
  }
  // Vypnuté ticho neztiší nic, ani uprostřed nastaveného rozsahu.
  assert.equal(jeNocniTicho({ ...NOC, quietHours: false }, cas(23, 0)), false);
  assert.equal(jeNocniTicho({ ...NOC, quietHours: 'true' }, cas(23, 0)), false, 'zapnuto jen skutečným true');
  // Stejný začátek a konec se uložit nedá; kdyby se do souhrnu dostal ručně, ticho je prázdné.
  for (const h of [0, 7, 22]) assert.equal(jeNocniTicho({ quietHours: true, quietFrom: '07:00', quietTo: '07:00' }, cas(h)), false);
  assert.equal(jeNocniTicho({ quietHours: true, quietFrom: '7:00', quietTo: '08:00' }, cas(7, 30)), false, 'čas bez úvodní nuly neplatí');
  assert.equal(jeNocniTicho({ quietHours: true }, cas(23)), false);
  assert.equal(minutyDne('23:59'), 1439);
  assert.equal(minutyDne('24:00'), null);
});

test('starý soubor bez nových polí má ticho vypnuté, nesmyslné hodnoty se vrátí na výchozí', () => {
  const stary = normalizeData({ settings: { notifications: { needsInput: false, native: false } } }).settings.notifications;
  assert.deepEqual([stary.quietHours, stary.quietFrom, stary.quietTo], [false, '22:00', '07:00']);
  assert.equal(stary.needsInput, false, 'ostatní nastavení zůstane');
  assert.equal(normalizeData({}).settings.notifications.quietHours, false);
  assert.deepEqual(normalizujTicho({ quietHours: 'ano', quietFrom: '25:00', quietTo: 700 }), { quietHours: false, quietFrom: '22:00', quietTo: '07:00' });
  assert.deepEqual(normalizujTicho({ quietHours: true, quietFrom: '23:30', quietTo: '05:00' }), { quietHours: true, quietFrom: '23:30', quietTo: '05:00' });
});

test('API: noční ticho se uloží, stejný začátek a konec nebo špatný tvar se odmítne beze změny', async () => {
  const s = await startTestServer();
  try {
    const c = api(s.url);
    const ok = await c.send('PUT', '/api/settings', { notifications: { quietHours: true, quietFrom: '23:30', quietTo: '06:00' } });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.body.settings.notifications.quietHours, ok.body.settings.notifications.quietFrom, ok.body.settings.notifications.quietTo], [true, '23:30', '06:00']);
    for (const zmena of [{ quietFrom: '06:00' }, { quietTo: '23:30' }, { quietFrom: '05:00', quietTo: '05:00' }]) {
      const r = await c.send('PUT', '/api/settings', { notifications: { ...zmena, needsInput: false } });
      assert.equal(r.status, 422, JSON.stringify(zmena));
      assert.match(r.body.error, /jiný čas/);
    }
    for (const spatne of ['7:00', '24:00', 2200, '', null]) {
      assert.equal((await c.send('PUT', '/api/settings', { notifications: { quietTo: spatne } })).status, 422, String(spatne));
    }
    const n = (await c.get('/api/state')).body.settings.notifications;
    assert.deepEqual([n.quietFrom, n.quietTo, n.needsInput], ['23:30', '06:00', true], 'odmítnutý požadavek nezměnil nic, ani ostatní pole');
    // Posun jen jednoho konce projde, když se nepotká s druhým.
    assert.equal((await c.send('PUT', '/api/settings', { notifications: { quietFrom: '22:00' } })).body.settings.notifications.quietFrom, '22:00');
    await s.app.datastore.flush();
    const naDisku = JSON.parse(await fs.readFile(s.app.datastore.file, 'utf8')).settings.notifications;
    assert.deepEqual([naDisku.quietHours, naDisku.quietFrom, naDisku.quietTo], [true, '22:00', '06:00']);
  } finally { await s.close(); }
});

// Prostředí pro engine: skutečný Store, atrapa úložiště a nativních oznámení, pevné hodiny.
async function prostredi(nastaveni = {}) {
  const home = await tempDir();
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: home });
  const datastore = fakeDatastore({ native: true, ...NOC, ...nastaveni });
  const store = new Store({ config, datastore });
  const hodiny = { t: cas(21, 0) };
  const oznameni = [];
  const bubliny = [];
  const alerts = new AlertEngine({ store, datastore, now: () => hodiny.t, notifier: { native: async (n) => { oznameni.push({ ...n, at: hodiny.t }); return true; } } });
  store.ready = true;
  alerts.start();
  store.on('alert', (a) => { if (!a.muted) bubliny.push(a); });
  const sezeni = (id, title) => {
    const s = store.ensure({ connector: 'claude-code', localId: id, provider: 'anthropic', app: 'Claude Code' });
    s.title = title || id;
    return s;
  };
  // Agent se zeptá na povolení: working → needs_input.
  const zepta = (id, title) => {
    const s = sezeni(id, title);
    Object.assign(s, { lastAt: hodiny.t - 1000, startedAt: hodiny.t - 60e3, running: true, runningAt: hodiny.t, turnStartedAt: hodiny.t - 60e3, pending: null });
    store.commit(s, hodiny.t);
    s.pending = { kind: 'permission', text: `Povolit Bash v ${id}?`, at: hodiny.t };
    store.commit(s, hodiny.t);
    return s;
  };
  // Rozhodnutí padlo (třeba z telefonu nebo přímo v Terminálu) – agent zase pracuje.
  const vyres = (s) => {
    s.pending = null;
    s.runningAt = hodiny.t;
    s.lastAt = hodiny.t;
    store.commit(s, hodiny.t);
  };
  // Dlouhá úloha doběhla: working → waiting.
  const dokonci = (id, title) => {
    const s = sezeni(id, title);
    Object.assign(s, { lastAt: hodiny.t - 5 * 60e3, startedAt: hodiny.t - 10 * 60e3, running: true, runningAt: hodiny.t - 1000, turnStartedAt: hodiny.t - 5 * 60e3, turns: 1 });
    store.commit(s, hodiny.t);
    s.running = false;
    s.lastAt = hodiny.t;
    store.commit(s, hodiny.t);
    return s;
  };
  return { store, datastore, alerts, hodiny, oznameni, bubliny, zepta, vyres, dokonci };
}

test('během ticha se upozornění uloží, ale oznámení ani bublina nepřijde', async () => {
  const p = await prostredi();
  p.hodiny.t = cas(23, 10);
  p.zepta('a', 'Refaktor');
  assert.equal(p.datastore.data.alerts.length, 1, 'upozornění je v seznamu (zvoneček, stav)');
  assert.equal(p.datastore.data.alerts[0].muted, 'quiet');
  assert.equal(p.oznameni.length, 0, 'žádné systémové oznámení ani zvuk');
  assert.equal(p.bubliny.length, 0, 'žádná bublina v otevřeném okně');
  assert.equal(p.alerts.unread(), 1);
  // Mimo ticho totéž projde normálně.
  p.hodiny.t = cas(21, 0, 29);
  p.zepta('b', 'Migrace');
  assert.equal(p.oznameni.length, 1);
  assert.equal(p.datastore.data.alerts.at(-1).muted, undefined);
});

test('souhrn po tichu počítá jen to, co pořád platí; vyřešené a přečtené vynechá', async () => {
  const p = await prostredi();
  p.hodiny.t = cas(23, 0);
  p.zepta('a', 'Refaktor');
  p.hodiny.t = cas(23, 30);
  const b = p.zepta('b', 'Migrace databáze');
  p.hodiny.t = cas(0, 15, 29);
  p.vyres(b); // vyřešilo se samo – do souhrnu nepatří
  p.hodiny.t = cas(1, 0, 29);
  p.store.setLimit({ id: 'codex:primary', provider: 'openai', app: 'Codex', label: 'Týdenní limit', usedPercent: 100, windowMinutes: 10080, reached: true, resetsAt: cas(12, 0, 30), at: 1 });
  p.hodiny.t = cas(2, 0, 29);
  p.dokonci('c', 'Testy');
  p.hodiny.t = cas(3, 0, 29);
  p.zepta('c', 'Testy'); // tatáž konverzace se pak zeptala – počítá se jednou, podle posledního
  p.hodiny.t = cas(4, 0, 29);
  p.zepta('d', 'Přečtené v noci');
  p.alerts.markRead([p.datastore.data.alerts.at(-1).id]);
  assert.equal(p.oznameni.length, 0);
  assert.ok(p.datastore.data.alerts.every((x) => x.muted === 'quiet'));

  p.hodiny.t = cas(6, 59, 29, 59);
  assert.deepEqual(p.alerts.tick(), [], 'dokud ticho trvá, souhrn nepřijde');

  p.hodiny.t = cas(7, 0, 29);
  const [souhrn, ...navic] = p.alerts.tick();
  assert.equal(navic.length, 0, 'jediný souhrn');
  assert.equal(souhrn.kind, 'digest');
  assert.equal(souhrn.digest, 'quiet');
  assert.equal(souhrn.title, 'Během nočního ticha: 2× čeká na rozhodnutí, 1× limit');
  assert.equal(souhrn.body, 'Refaktor, Testy, Codex: Týdenní limit');
  assert.equal(souhrn.count, 3);
  assert.equal(souhrn.route, '#/agenti?stav=needs_input', 'víc konverzací → Agenti s filtrem „Potřebuje tebe“');
  assert.equal(souhrn.level, 'action');
  assert.equal(p.oznameni.length, 1, 'ráno přijde právě jedno oznámení');
  assert.equal(p.oznameni[0].title, souhrn.title);
  assert.equal(p.oznameni[0].sound, true);
  assert.equal(p.bubliny.length, 1);

  p.hodiny.t = cas(7, 5, 29);
  assert.deepEqual(p.alerts.tick(), [], 'druhý souhrn za tutéž noc nepřijde');
  assert.ok(p.datastore.data.alerts.filter((x) => x.muted === 'quiet').every((x) => x.digested));
});

test('když se v noci všechno vyřeší samo, ráno nepřijde nic; jedna konverzace vede rovnou do ní', async () => {
  const p = await prostredi();
  p.hodiny.t = cas(23, 0);
  const a = p.zepta('a', 'Refaktor');
  p.hodiny.t = cas(2, 0, 29);
  p.vyres(a);
  p.hodiny.t = cas(7, 0, 29);
  assert.deepEqual(p.alerts.tick(), []);
  assert.equal(p.oznameni.length, 0);

  const q = await prostredi();
  q.hodiny.t = cas(23, 0);
  q.zepta('jedina', 'Refaktor');
  q.hodiny.t = cas(7, 30, 29);
  const [souhrn] = q.alerts.tick();
  assert.equal(souhrn.title, 'Během nočního ticha: 1× čeká na rozhodnutí');
  assert.equal(souhrn.sessionId, 'claude-code:jedina');
  assert.equal(souhrn.route, '#/agent/claude-code%3Ajedina');
});

test('po probuzení Macu souhrn počká, až zdroje doženou noc – co se mezitím vyřešilo, v něm není', async () => {
  const p = await prostredi();
  p.hodiny.t = cas(23, 0);
  p.alerts.tick();
  const a = p.zepta('a', 'Refaktor');
  p.zepta('b', 'Migrace');
  p.hodiny.t = cas(23, 0, 28, 5);
  p.alerts.tick();
  // Mac spal do 7:30. Hned po probuzení je ticho pryč, ale stav konverzací je ještě z večera.
  p.hodiny.t = cas(7, 30, 29);
  assert.deepEqual(p.alerts.tick(), [], 'první průchod po probuzení nic neposílá');
  p.hodiny.t = cas(7, 30, 29, 8);
  p.vyres(a); // zdroj dohnal noc: rozhodnutí padlo z telefonu
  assert.deepEqual(p.alerts.tick(), []);
  p.hodiny.t = cas(7, 30, 29, 15);
  const [souhrn, ...navic] = p.alerts.tick();
  assert.equal(navic.length, 0);
  assert.equal(souhrn.title, 'Během nočního ticha: 1× čeká na rozhodnutí');
  assert.equal(souhrn.body, 'Migrace');
  assert.equal(PROBUZENI.cekaniMs, 15e3);
});

test('souhrn po tichu přežije restart aplikace a vypnutí ticha pošle souhrn hned', async () => {
  const p = await prostredi();
  p.hodiny.t = cas(23, 0);
  p.zepta('a', 'Refaktor');
  // Nový engine nad stejnými daty (restart), ranní průchod.
  const znovu = new AlertEngine({ store: p.store, datastore: p.datastore, now: () => cas(8, 0, 29), notifier: { native: async () => true } });
  const [souhrn] = znovu.tick();
  assert.equal(souhrn?.title, 'Během nočního ticha: 1× čeká na rozhodnutí');

  const q = await prostredi();
  q.hodiny.t = cas(23, 0);
  q.zepta('b', 'Migrace');
  q.datastore.data.settings.notifications.quietHours = false; // uživatel ticho v noci vypnul
  q.hodiny.t = cas(23, 1);
  assert.equal(q.alerts.tick().length, 1);
});

test('souhrn s rozpočtem a limity vede na Útratu a Přehled a mluví jazykem aplikace', async () => {
  const p = await prostredi();
  p.hodiny.t = cas(23, 0);
  p.alerts.raise({ key: 'budget:2026-09:total:80', level: 'warning', kind: 'budget', title: 'Vyčerpáno 80 % rozpočtu: Celkem', body: '' });
  p.alerts.raise({ key: 'budget:2026-09:total:100', level: 'critical', kind: 'budget', title: 'Rozpočet překročen: Celkem', body: '' });
  p.hodiny.t = cas(7, 0, 29);
  const [rozpocet] = p.alerts.tick();
  assert.equal(rozpocet.title, 'Během nočního ticha: 1× rozpočet', '80 % a 100 % téhož rozpočtu je jedna věc');
  assert.equal(rozpocet.route, '#/utrata');

  const q = await prostredi();
  q.datastore.data.settings.language = 'en';
  q.hodiny.t = cas(23, 0);
  q.store.setLimit({ id: 'claude:5h', provider: 'anthropic', app: 'Claude', label: '5hodinový limit', usedPercent: 85, windowMinutes: 300, reached: false, resetsAt: cas(9, 0, 29), at: 1 });
  q.store.setLimit({ id: 'codex:week', provider: 'openai', app: 'Codex', label: 'Týdenní limit', usedPercent: 100, windowMinutes: 10080, reached: true, resetsAt: cas(3, 0, 29), at: 1 });
  q.hodiny.t = cas(7, 0, 29);
  const [limity] = q.alerts.tick();
  // Týdenní limit Codexu se ve 3:00 obnovil – vyřešilo se samo.
  assert.equal(limity.title, 'During quiet hours: 1× limit');
  assert.equal(limity.route, '#/prehled');
});

test('text souhrnu: pořadí podle naléhavosti a zkrácený výčet', () => {
  const polozky = [
    { kind: 'done', nazev: 'A' }, { kind: 'needs_input', nazev: 'B' }, { kind: 'limit_reset', nazev: 'C' },
    { kind: 'failed', nazev: 'D' }, { kind: 'needs_input', nazev: 'E' }, { kind: 'limit_near', nazev: 'F' },
  ];
  assert.deepEqual(textSouhrnu('quiet', polozky), {
    title: 'Během nočního ticha: 2× čeká na rozhodnutí, 1× selhalo spuštění, 1× limit, 1× dokončeno, 1× obnovený limit',
    body: 'B, E, D a 3 další',
  });
  assert.equal(textSouhrnu('burst', polozky.slice(0, 2), 'en').title, 'More alerts: 1× waiting for your decision, 1× finished');
  assert.equal(textSouhrnu('burst', polozky, 'en').body, 'B, E, D and 3 more');
  const osm = Array.from({ length: 8 }, (_, i) => ({ kind: 'done', nazev: `U${i}` }));
  assert.equal(textSouhrnu('burst', osm).body, 'U0, U1, U2 a 5 dalších');
});

test('náraz: víc než tři za minutu → první tři samostatně, zbytek v jednom souhrnu, jakmile je místo', async () => {
  const p = await prostredi({ quietHours: false });
  const t0 = cas(12, 0);
  const s = [];
  for (let i = 0; i < 6; i++) {
    p.hodiny.t = t0 + i * 1000;
    s.push(p.zepta(`n${i}`, `Úloha ${i}`));
  }
  assert.equal(p.oznameni.length, NARAZ.max, 'samostatně přijdou jen tři');
  assert.deepEqual(p.datastore.data.alerts.map((a) => a.muted || null), [null, null, null, 'burst', 'burst', 'burst']);
  p.hodiny.t = t0 + 8000;
  p.vyres(s[4]); // jedno z odložených se mezitím vyřešilo
  p.hodiny.t = t0 + 59999;
  assert.deepEqual(p.alerts.tick(), [], 'v minutě od prvního oznámení už místo není');
  p.hodiny.t = t0 + 60000;
  const [souhrn, ...navic] = p.alerts.tick();
  assert.equal(navic.length, 0);
  assert.equal(souhrn.digest, 'burst');
  assert.equal(souhrn.title, 'Další upozornění: 2× čeká na rozhodnutí');
  assert.equal(souhrn.body, 'Úloha 3, Úloha 5');
  assert.equal(p.oznameni.length, 4, 'tři samostatná a jeden souhrn místo série');
  p.hodiny.t = t0 + 65000;
  assert.deepEqual(p.alerts.tick(), []);
});

test('náraz: stálý přísun nikdy nepřekročí tři oznámení za minutu a nic se neztratí', async () => {
  const p = await prostredi({ quietHours: false });
  const t0 = cas(12, 0);
  let alertu = 0;
  // Tři minuty přijde upozornění každých 5 s, pak minutu nic. Průchod tick() jde po 5 s jako v aplikaci.
  for (let t = t0; t <= t0 + 240e3; t += 5000) {
    p.hodiny.t = t;
    if (t <= t0 + 180e3) { p.zepta(`r${t}`, `Úloha ${(t - t0) / 1000}`); alertu++; }
    p.alerts.tick();
  }
  const casy = p.oznameni.map((n) => n.at);
  for (const t of casy) assert.ok(casy.filter((x) => x >= t && x < t + NARAZ.oknoMs).length <= NARAZ.max, `v minutě od ${(t - t0) / 1000} s víc než tři oznámení`);
  const souhrny = p.datastore.data.alerts.filter((a) => a.kind === 'digest');
  const samostatne = p.datastore.data.alerts.filter((a) => a.kind !== 'digest' && !a.muted).length;
  assert.equal(samostatne + souhrny.reduce((n, a) => n + a.count, 0), alertu, 'každé upozornění přišlo samo, nebo je v souhrnu');
  // Souhrn odejde, jakmile nejstarší oznámení vypadne z minuty: 0 s → 60 s, 65 s → 120 s, 125 s → 180 s.
  assert.deepEqual(souhrny.map((d) => (d.at - t0) / 1000), [60, 120, 180]);
  for (const d of souhrny) {
    const prvniOdlozene = Math.min(...p.datastore.data.alerts.filter((a) => a.muted === 'burst' && a.at <= d.at && a.at > d.at - NARAZ.oknoMs).map((a) => a.at));
    assert.ok(d.at - prvniOdlozene <= NARAZ.oknoMs, 'souhrn nejpozději minutu po prvním odloženém');
  }
});

test('náraz těsně před tichem počká na ranní souhrn; zkušební upozornění ticho dodrží, náraz ne', async () => {
  const p = await prostredi();
  for (let i = 0; i < 5; i++) {
    p.hodiny.t = cas(21, 59, 28, 50 + i);
    p.zepta(`v${i}`, `Večer ${i}`);
  }
  assert.equal(p.oznameni.length, 3);
  p.hodiny.t = cas(22, 0, 28, 5);
  assert.deepEqual(p.alerts.tick(), [], 've 22:00 už je ticho – žádný souhrn nárazu');
  assert.ok(p.datastore.data.alerts.filter((a) => a.muted).every((a) => a.muted === 'quiet'));
  // Mezi 22:00 a 7:00 neproběhl žádný průchod – Mac spal. Souhrn počká 15 s, než zdroje doženou noc.
  p.hodiny.t = cas(7, 0, 29);
  assert.deepEqual(p.alerts.tick(), []);
  p.hodiny.t = cas(7, 0, 29, 15);
  const [rano] = p.alerts.tick();
  assert.equal(rano.title, 'Během nočního ticha: 2× čeká na rozhodnutí');

  // Zkušební upozornění: v tichu ztlumené (a do souhrnu se nepočítá), mimo ticho nikdy nečeká.
  const q = await prostredi();
  q.hodiny.t = cas(23, 0);
  assert.equal(q.alerts.raise({ key: 'test:1', level: 'action', kind: 'test', title: 'Testovací upozornění', body: '' }).muted, 'quiet');
  q.hodiny.t = cas(7, 0, 29);
  assert.deepEqual(q.alerts.tick(), []);
  for (let i = 0; i < 5; i++) {
    q.hodiny.t = cas(12, 0, 29, i);
    assert.equal(q.alerts.raise({ key: `test:x${i}`, level: 'action', kind: 'test', title: 'Testovací upozornění', body: '' }).muted, undefined);
  }
});

test('aplikace pro Mac a Windows: ztlumené upozornění nepošle do systému nic, odznak se mění dál', async () => {
  const dir = await tempDir('agenteeq-ticho-desktop-');
  const env = { ...process.env, PORT: '0', AGENTEEQ_SOURCE_HOME: dir, AGENTEEQ_HOME: dir, AGENTEEQ_PROCESSES: '0', AGENTEEQ_CLOUD: '0', AGENTEEQ_NATIVE_NOTIFY: '0', AGENTEEQ_KEYCHAIN: '0', AGENTEEQ_UCET_URL: '0', AGENTEEQ_OPEN: 'dry', AGENTEEQ_QUIET: '1', AGENTEEQ_OLLAMA_URL: 'http://127.0.0.1:9' };
  const child = spawn(process.execPath, ['desktop/server.mjs'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let vystup = '';
  child.stdout.on('data', (d) => { vystup += d; });
  const zpravy = () => vystup.split('\n').filter((x) => x.startsWith('AGENTEEQ_DESKTOP ')).map((x) => JSON.parse(x.slice(17)));
  const exited = new Promise((r) => child.once('exit', r));
  try {
    const ready = await waitFor(() => zpravy().find((x) => x.ready), 15000);
    const c = api(`http://127.0.0.1:${ready.port}`);
    // Ticho kolem právě teď (hodina před a po), ať test nezávisí na denní době.
    const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const ted = Date.now();
    assert.equal((await c.send('PUT', '/api/settings', { notifications: { quietHours: true, quietFrom: hhmm(ted - 3600e3), quietTo: hhmm(ted + 3600e3) } })).status, 200);
    const ztlumene = (await c.send('POST', '/api/alerts/test', {})).body.alert;
    assert.equal(ztlumene.muted, 'quiet');
    assert.equal((await c.send('PUT', '/api/settings', { notifications: { quietHours: false } })).status, 200);
    const slysitelne = (await c.send('POST', '/api/alerts/test', {})).body.alert;
    assert.equal(slysitelne.muted, undefined);
    await waitFor(() => zpravy().some((x) => x.type === 'notification'), 5000);
    const oznameni = zpravy().filter((x) => x.type === 'notification');
    assert.deepEqual(oznameni.map((x) => x.id), [slysitelne.id], 'do systému šlo jen upozornění mimo ticho');
    assert.equal(oznameni[0].route, '#/upozorneni');
    assert.ok(zpravy().some((x) => x.type === 'badge'), 'odznak (stav) se posílá dál');
    child.stdin.end();
    assert.equal(await exited, 0);
  } finally { if (child.exitCode === null) child.kill(); }
});
