import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, api, openStream, waitFor, sleep } from './helpers.mjs';

// Čerstvá data po výpadku a uspání. Každý test drží jednu opravu; popis vady je u testu.

const MIN = 60e3;

// Uspaný Mac: časovače Node stojí (monotónní hodiny spánek nepočítají), Date.now() ne. Stav
// konverzace se přitom počítá z času (práce „vyprší“) a přepočítává se po 5 s. Po probuzení tak
// snímek až do prvního průchodu vydával „pracuje“ odvozené před uspáním – a prohlížeč, který si
// po probuzení stáhl stav jako první, ho ukázal jako aktuální.
test('snímek stavu odvozuje stav konverzace v okamžiku dotazu, ne před uspáním', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const { store } = s.app;
  const pred = Date.now() - 40 * MIN;
  const session = store.ensure({ connector: 'codex', localId: 'uspany', provider: 'openai', app: 'Codex' });
  Object.assign(session, { title: 'Refaktor před uspáním', running: true, runningAt: pred, lastAt: pred, startedAt: pred - MIN, staleMs: 15 * MIN, turns: 1 });
  // Souhrn naposledy spočítaný těsně před uspáním (poslední průchod časovače).
  store.commit(session, pred + 1000);
  assert.equal(store.summary(session.id).status, 'working', 'příprava: před uspáním agent pracoval');

  const snimek = (await api(s.url).get('/api/state')).body;
  const x = snimek.sessions.find((v) => v.id === session.id);
  assert.notEqual(x.status, 'working', 'po 40 minutách bez známky běhu to není „pracuje“');
  assert.equal(x.stale, true, 'je to „delší dobu bez aktivity“, ne dokončená práce');
});

// Server posílal známku života jako komentář SSE („: ping“). EventSource komentáře do JavaScriptu
// nepředá, takže okno nemělo jak poznat spojení, které tiše umřelo (Mac usnul, telefon změnil síť)
// – a dál hlásilo „Připojeno“ nad starými daty. Známka života je proto pojmenovaná událost.
test('živý proud posílá známku života jako událost, kterou prohlížeč uvidí', async (t) => {
  mock.timers.enable({ apis: ['setInterval'] });
  let s;
  try { s = await startTestServer(); } catch (err) { mock.timers.reset(); throw err; }
  t.after(async () => { await s.close(); mock.timers.reset(); });
  const proud = await openStream(s.url);
  t.after(() => proud.close());
  await waitFor(() => proud.events.some((e) => e.event === 'hello'));
  mock.timers.tick(15000);
  const ping = await waitFor(() => proud.events.find((e) => e.event === 'ping'));
  assert.ok(Number.isFinite(ping.data.now), 'nese čas serveru');
});

// Po probuzení Macu čekalo všechno, co se zjišťuje dotazem, na svůj další průchod: výpis procesů
// až 5 s, vlastní agenti („Odpovídá“) 30 s, průchod souborů 10 s. Okno mezitím dostávalo stav
// z doby před uspáním jako živý. Hlídač pozná spánek podle mezery mezi průchody a vše zjistí hned.
test('hlídač probuzení pozná uspaný počítač podle mezery mezi průchody', async () => {
  const { hlidacProbuzeni, PROBUZENI_MEZERA_MS } = await import('../src/probuzeni.js');
  let ted = 1_000_000;
  const spal = hlidacProbuzeni({ now: () => ted });
  assert.equal(spal(), false, 'první průchod nic nesrovnává');
  ted += 5000;
  assert.equal(spal(), false, 'běžný průchod po 5 s');
  ted += PROBUZENI_MEZERA_MS + 1;
  assert.equal(spal(), true, 'mezera přes minutu = počítač spal');
  ted += 5000;
  assert.equal(spal(), false, 'probuzení se hlásí jednou');
});

test('po probuzení aplikace hned znovu projde zdroje a přepočítá stavy', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const prosle = [];
  for (const c of Object.values(s.app.connectors)) {
    if (c.kind !== 'local') continue;
    c.scan = async () => { prosle.push(c.id); };
  }
  const { store } = s.app;
  const pred = Date.now() - 40 * MIN;
  const session = store.ensure({ connector: 'codex', localId: 'po-probuzeni', provider: 'openai', app: 'Codex' });
  Object.assign(session, { title: 'Běžel před uspáním', running: true, runningAt: pred, lastAt: pred, startedAt: pred, staleMs: 15 * MIN });
  store.commit(session, pred + 1000);
  const udalosti = [];
  store.on('session', (x) => udalosti.push(x));
  await s.app.poProbuzeni();
  assert.ok(prosle.includes('codex') && prosle.includes('claude-code'), `projité zdroje: ${prosle.join(', ')}`);
  assert.equal(store.summary(session.id).status, 'waiting', 'stav přepočítaný hned, ne až dalším průchodem');
  assert.ok(udalosti.some((x) => x.id === session.id), 'změna odešla do živého proudu');
});

/* ---------- Okno (public/js) ---------- */

globalThis.requestAnimationFrame ??= () => 0;
const okno = await import('../public/js/state.js');

const snimek = (zmeny = {}) => ({
  ready: true, version: 'test', host: null, windowDays: 30, sessions: [], runtimes: [], limits: [], credits: [], connectors: [],
  spend: null, alerts: { unread: 0, items: [] }, settings: null, integrations: null,
  projects: { items: [], assignments: {}, snapshots: {}, colors: [], limits: {} }, launch: { targets: [], modes: {} }, runs: [], license: null, usage: {}, ...zmeny,
});

// Snímek stavu přepisy nenese – otevřený přepis si detail agenta načte zvlášť a dál ho plní živý
// proud. Po obnovení spojení se ale snímek načetl znovu a přepis ne: co agent napsal během výpadku,
// v okně chybělo, dokud člověk neodešel a nevrátil se.
test('po obnovení spojení se otevřený přepis načte celý znovu', async () => {
  const temata = [];
  const odhlas = okno.subscribe((t) => temata.push(...t));
  okno.state.transcripts.set('codex:a', { entries: new Map([[1, { seq: 1, role: 'user', text: 'Ahoj' }]]), stale: false, loaded: true, error: '' });
  okno.applySnapshot(snimek(), { znovu: true });
  assert.equal(okno.state.transcripts.get('codex:a').stale, true, 'přepis je označený k novému načtení');
  await sleep(300);
  // Pohledy, které si data stahují samy (Dovednosti, historie limitů), se podle tématu načtou taky.
  assert.ok(temata.includes('znovu'), `témata: ${temata.join(', ')}`);
  odhlas();
  okno.state.transcripts.clear();
});

// Přepis se načítá celou odpovědí serveru. Položka, která mezitím přišla živým proudem, se dřív
// přepsala starší odpovědí a zmizela až do dalšího načtení.
test('přírůstek přepisu, který přijde během načítání, se neztratí', () => {
  okno.zacniNacitaniPrepisu('codex:b');
  okno.applyEvent('transcript', { id: 'codex:b', reset: false, entries: [{ seq: 3, role: 'assistant', text: 'Hotovo' }] });
  // Odpověď vznikla na serveru dřív, než agent zprávu dopsal.
  okno.dokonciNacitaniPrepisu('codex:b', [{ seq: 1, role: 'user', text: 'Uprav ceník' }, { seq: 2, role: 'tool', text: 'edit' }]);
  const t = okno.state.transcripts.get('codex:b');
  assert.deepEqual([...t.entries.keys()].sort(), [1, 2, 3]);
  assert.equal(t.loaded, true);
  okno.state.transcripts.clear();
});
