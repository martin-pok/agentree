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

/* ---------- Spojení okna se serverem (public/js/spojeni.js) ---------- */

// Simulace bez prohlížeče: vlastní hodiny a časovače, proud ovládaný testem a snímky, které test
// „doručí“, kdy chce – tak jde přesně nastavit, co přijde během načítání.
function simulace({ hlidat = true, skryto = () => false } = {}) {
  let ted = 1_000_000;
  let id = 0;
  const casovace = new Map();
  const hodiny = {
    now: () => ted,
    setTimeout: (f, ms) => { casovace.set(++id, { f, kdy: ted + ms }); return id; },
    clearTimeout: (i) => { casovace.delete(i); },
    setInterval: (f, ms) => { casovace.set(++id, { f, kdy: ted + ms, kazdych: ms }); return id; },
    clearInterval: (i) => { casovace.delete(i); },
  };
  const dorucit = () => new Promise((r) => setImmediate(r));
  const proudy = [];
  const snimky = [];
  const zaznam = [];
  const stavy = [];
  const odparovano = [];
  const chyby = [];
  const spojeni = vytvorSpojeni({
    proud: (h) => {
      const p = { h, zavreny: false, otevreny: false, close() { this.zavreny = true; }, otevreno() { return this.otevreny && !this.zavreny; } };
      proudy.push(p);
      return p;
    },
    nactiSnimek: () => new Promise((ok, ko) => { snimky.push({ ok, ko }); }),
    naSnimek: (snap, { znovu }) => zaznam.push(['snimek', snap.v, znovu]),
    naUdalost: (name, data) => zaznam.push([name, data]),
    naStav: (stav, info) => stavy.push({ stav, ...info }),
    naOdparovani: (err) => odparovano.push(err),
    naChybuSnimku: (err) => chyby.push(err),
    hodiny,
    hlidat,
    skryto,
  });
  return {
    spojeni, proudy, snimky, zaznam, stavy, odparovano, chyby, dorucit,
    get ted() { return ted; },
    // Uspaný počítač: čas běží, časovače stojí.
    spanek(ms) { ted += ms; for (const c of casovace.values()) c.kdy += ms; },
    async posun(ms) {
      const cil = ted + ms;
      for (;;) {
        const dalsi = [...casovace.entries()].filter(([, c]) => c.kdy <= cil).sort((a, b) => a[1].kdy - b[1].kdy)[0];
        if (!dalsi) break;
        const [i, c] = dalsi;
        ted = c.kdy;
        if (c.kazdych) c.kdy += c.kazdych;
        else casovace.delete(i);
        c.f();
        await dorucit();
      }
      ted = cil;
      await dorucit();
    },
    posledni: () => proudy.at(-1),
    stav: () => stavy.at(-1)?.stav,
    async pozdrav() { const p = proudy.at(-1); p.otevreny = true; p.h.onHello({}); await dorucit(); },
    async snimek(v) { snimky.shift().ok({ v }); await dorucit(); },
    async selze(err) { snimky.shift().ko(err); await dorucit(); },
  };
}

const { vytvorSpojeni, TICHO_MS } = await import('../public/js/spojeni.js').catch(() => ({}));

// Připojené spojení: první snímek, pozdrav proudu a snímek vyžádaný po pozdravu.
async function pripojene(sim) {
  sim.spojeni.start();
  await sim.dorucit();
  await sim.snimek(1);
  await sim.pozdrav();
  await sim.snimek(2);
  return sim;
}

// Dřív se „Připojeno“ rozsvítilo už při pozdravu proudu, před načtením stavu – a svítilo i tehdy,
// když se stav načíst nepodařilo. Okno tak vydávalo data z doby před výpadkem za aktuální.
test('spojení: „Připojeno“ až po načtení snímku vyžádaného po pozdravu proudu', async () => {
  const sim = simulace();
  sim.spojeni.start();
  await sim.dorucit();
  await sim.snimek(1);
  assert.notEqual(sim.stav(), 'live', 'první snímek bez proudu ještě není živý stav');
  assert.equal(sim.proudy.length, 1, 'proud se otevře po prvním snímku');
  await sim.pozdrav();
  assert.notEqual(sim.stav(), 'live', 'pozdrav sám nic nepotvrzuje');
  sim.posledni().h.onEvent('limits', ['L1']);
  assert.deepEqual(sim.zaznam, [['snimek', 1, false]], 'událost během načítání čeká ve frontě');
  await sim.snimek(2);
  assert.deepEqual(sim.zaznam.slice(1), [['snimek', 2, true], ['limits', ['L1']]], 'po snímku se fronta přehraje');
  assert.equal(sim.stav(), 'live');
  assert.equal(sim.spojeni.dataZ(), sim.ted);
});

// Návrat k oknu (a obnovená síť) stahoval snímek mimo frontu událostí: co mezitím přišlo živým
// proudem, přepsal snímek vzniklý o chvíli dřív – a tahle změna už znovu nepřišla.
test('spojení: obnova po návratu k oknu nepřepíše novější události starším snímkem', async () => {
  const sim = await pripojene(simulace());
  await sim.posun(4000);
  sim.spojeni.obnov();
  await sim.dorucit();
  sim.posledni().h.onEvent('session', { id: 'x', status: 'needs_input' });
  await sim.snimek(3);
  assert.deepEqual(sim.zaznam.slice(-2), [['snimek', 3, true], ['session', { id: 'x', status: 'needs_input' }]]);
  assert.equal(sim.stav(), 'live');
});

// Proud, který prohlížeč zavřel natrvalo (HTTP chyba od proxy, 503), se dřív už nikdy nenavázal:
// okno zůstalo „Bez spojení“ nad starými daty, dokud ho člověk ručně nenačetl znovu.
test('spojení: natrvalo zavřený proud se naváže znovu s pauzou', async () => {
  const sim = await pripojene(simulace());
  sim.posledni().h.onError(true);
  assert.equal(sim.stav(), 'reconnecting');
  await sim.posun(2000);
  await sim.snimek(3); // snímek zároveň ověří, že nejde o zrušené spárování
  assert.equal(sim.proudy.length, 2, 'nový proud');
  assert.equal(sim.proudy[0].zavreny, true);
  await sim.pozdrav();
  await sim.snimek(4);
  assert.equal(sim.stav(), 'live');
});

// Spojení, které tiše umřelo (Mac usnul, telefon změnil síť), prohlížeč drží otevřené klidně
// hodiny. Okno ho dřív nepoznalo a hlásilo „Připojeno“ nad starými daty.
test('spojení: bez zprávy ze serveru déle než tři známky života se spojení obnoví', async () => {
  const sim = await pripojene(simulace());
  for (let i = 0; i < 6; i++) { await sim.posun(15000); sim.posledni().h.onPing(); }
  assert.equal(sim.proudy.length, 1, 'se známkami života spojení drží');
  const dataZ = sim.spojeni.dataZ();
  await sim.posun(TICHO_MS + 5000);
  assert.equal(sim.proudy.length, 2, 'po tichu nový proud');
  assert.equal(sim.proudy[0].zavreny, true);
  const s = sim.stavy.at(-1);
  assert.equal(s.stav, 'reconnecting');
  assert.equal(s.okamzite, true, 'data se hned označí jako neověřená, bez čekání');
  assert.equal(s.dataZ, dataZ, 'okno ví, z kdy jsou poslední ověřená data');
});

// Uspaný počítač s otevřeným oknem: po probuzení běželo spojení dál, žádný nový pozdrav, žádný
// nový snímek – stopky „Pracuje už“ a stavy „běží“ z doby před spánkem se tvářily jako živé.
test('spojení: po probuzení počítače se data hned označí a načtou znovu', async () => {
  const sim = await pripojene(simulace());
  await sim.posun(5000);
  sim.spanek(2 * 3600e3);
  await sim.posun(5000);
  const s = sim.stavy.at(-1);
  assert.equal(s.stav, 'reconnecting');
  assert.equal(s.probuzeni, true);
  assert.equal(s.okamzite, true);
  assert.equal(sim.proudy.length, 2, 'nové spojení místo toho z doby před spánkem');
  await sim.pozdrav();
  await sim.snimek(3);
  assert.deepEqual(sim.zaznam.at(-1), ['snimek', 3, true]);
  assert.equal(sim.stav(), 'live');
});

test('spojení: skrytá karta se za probuzení nepovažuje (prohlížeč jí časovače zpomaluje)', async () => {
  let skryto = false;
  const sim = await pripojene(simulace({ skryto: () => skryto }));
  skryto = true;
  sim.spanek(60e3);
  sim.posledni().h.onPing();
  await sim.posun(5000);
  assert.equal(sim.proudy.length, 1);
  skryto = false;
  sim.spojeni.obnov();
  await sim.dorucit();
  assert.equal(sim.proudy.length, 1, 'živé spojení se jen tiše srovná snímkem');
  await sim.snimek(3);
  assert.equal(sim.stav(), 'live');
});

test('spojení: zrušené spárování (401) ukončí pokusy a vrátí párování', async () => {
  const sim = await pripojene(simulace());
  sim.posledni().h.onError(true);
  await sim.posun(2000);
  await sim.selze(Object.assign(new Error('Nespárováno'), { status: 401 }));
  assert.equal(sim.odparovano.length, 1);
  await sim.posun(120e3);
  assert.equal(sim.proudy.length, 1, 'žádné další pokusy');
  assert.equal(sim.proudy[0].zavreny, true);
});

test('spojení: snímek, který po pozdravu selže, nehlásí „Připojeno“ a zkusí se znovu', async () => {
  const sim = simulace();
  sim.spojeni.start();
  await sim.dorucit();
  await sim.snimek(1);
  await sim.pozdrav();
  await sim.selze(Object.assign(new Error('Chyba 500'), { status: 500 }));
  assert.equal(sim.stav(), 'reconnecting');
  assert.equal(sim.chyby.length, 1, 'skutečná chyba serveru se ukáže');
  await sim.posun(2000);
  await sim.snimek(2);
  assert.equal(sim.proudy.length, 2);
  await sim.pozdrav();
  await sim.snimek(3);
  assert.equal(sim.stav(), 'live');
});

// Událost z dřívějšího spojení nesmí přijít po snímku, který vznikl až po novém pozdravu –
// přepsala by novější stav starším (třeba limity) a ten by se tvářil jako živý.
test('spojení: po novém pozdravu se nepřehrají události z předchozího spojení', async () => {
  const sim = await pripojene(simulace());
  sim.spojeni.obnov(); // obnova čeká na snímek…
  await sim.posun(3500);
  sim.spojeni.obnov();
  await sim.dorucit();
  sim.posledni().h.onEvent('limits', ['stare']);
  sim.posledni().h.onError(false); // …spojení na chvíli spadne a prohlížeč ho naváže sám
  await sim.pozdrav();
  await sim.snimek(3);
  await sim.snimek(4);
  assert.ok(!sim.zaznam.some(([n]) => n === 'limits'), `záznam: ${JSON.stringify(sim.zaznam)}`);
  assert.deepEqual(sim.zaznam.at(-1), ['snimek', 4, true]);
  assert.equal(sim.stav(), 'live');
});

// Transport: známku života musí proud předat dál a natrvalo zavřený proud ohlásit jako takový –
// jinak by se nový nenavázal.
test('živý proud v okně předá známku života i natrvalo zavřené spojení', async () => {
  const { connectStream } = await import('../public/js/api.js');
  const puvodni = globalThis.EventSource;
  class Atrapa {
    static CONNECTING = 0; static OPEN = 1; static CLOSED = 2;
    constructor(url) { this.url = url; this.readyState = 0; this.posluchaci = {}; Atrapa.posledni = this; }
    addEventListener(name, fn) { this.posluchaci[name] = fn; }
    close() { this.readyState = 2; }
  }
  globalThis.EventSource = Atrapa;
  try {
    const zaznam = [];
    const p = connectStream({ onHello: () => zaznam.push('hello'), onEvent: (n) => zaznam.push(n), onPing: () => zaznam.push('ping'), onError: (natrvalo) => zaznam.push(`chyba:${natrvalo}`) });
    const es = Atrapa.posledni;
    assert.equal(es.url, '/api/stream');
    es.readyState = 1;
    es.posluchaci.hello({ data: '{"now":1}' });
    assert.equal(p.otevreno(), true);
    es.posluchaci.ping({ data: '{"now":2}' });
    es.readyState = 0;
    es.onerror();
    es.readyState = 2;
    es.onerror();
    assert.deepEqual(zaznam, ['hello', 'ping', 'chyba:false', 'chyba:true']);
    p.close();
    assert.equal(p.otevreno(), false);
  } finally {
    globalThis.EventSource = puvodni;
  }
});

test('spojení: ukázka bez serveru nehlídá ticho ani probuzení', async () => {
  const sim = await pripojene(simulace({ hlidat: false }));
  await sim.posun(10 * 60e3);
  sim.spanek(3600e3);
  await sim.posun(10e3);
  assert.equal(sim.proudy.length, 1);
  assert.equal(sim.stav(), 'live');
});
