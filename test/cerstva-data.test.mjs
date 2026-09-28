import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, api, openStream, waitFor } from './helpers.mjs';

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
