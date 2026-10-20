import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Asistent musí poskytovat konkrétní kontextové postupy přímo v UI, ne pouze tři
// statické odpovědi nebo vzdálený model. Tento test hlídá propojení a obsah katalogu.
const source = await fs.readFile(new URL('../public/js/assistant-guide.js', import.meta.url), 'utf8');
const ui = await fs.readFile(new URL('../public/js/robot-guide.js', import.meta.url), 'utf8');

test('pomocník používá průvodce před obecným vyhledáváním', () => {
  assert.match(ui, /import \{ odpovedPruvodce, poradSNastavenim, znalostiPruvodce, jeHledaniChatu \} from '\.\/assistant-guide\.js'/);
  // AI odpovídá ze znalostní báze průvodce; bez AI odpoví průvodce sám.
  assert.match(ui, /request\('POST', '\/api\/pomocnik\/ai', \{ dotaz, historie, stranka: trasa\(\), znalosti: znalostiPruvodce\(LOCALE\) \}\)/);
  const guideIndex = ui.indexOf('odpovedPruvodce(dotaz');
  const serverIndex = ui.indexOf("request('POST', '/api/pomocnik', { dotaz })");
  assert.ok(guideIndex >= 0 && serverIndex > guideIndex);
  assert.match(ui, /previousTopic/);
  assert.match(ui, /odpoved = \{ kdo: 'on', \.\.\.rada \}/);
});

test('průvodce vrací skutečné navigační cíle a omezuje neověřená tvrzení', () => {
  assert.match(source, /cileHledani\(\)/);
  assert.match(source, /previousTopic/);
  for (const topic of ['extension', 'connect', 'alerts', 'costs', 'mobile', 'update', 'projects', 'agents']) {
    assert.ok(source.includes("id: '"+topic+"'"), topic);
  }
  assert.match(source, /Odhad není faktura/);
  assert.match(source, /nikoli přímo od služby/);
});


test('assistant guidance uses actual app snapshot without claiming provider status', () => {
  assert.match(source, /snapshot\.connection !== 'live'/);
  assert.match(source, /snapshot\.sessions instanceof Map/);
  assert.match(source, /snapshot\.updates\?\.currentVersion/);
  assert.match(ui, /snapshot: state/);
});


test('CZ/EN: odpovědi, kontext a reálná verze fungují také pro en-GB locale', async () => {
  // Run the actual guide implementation (not a source-only regex) against the real nav registry.
  const { guideAnswer: guide } = await import('../public/js/assistant-guide.js');
  const cs = guide('Proč mi nefunguje rozšíření v Chromu?', { language: 'cs-CZ' });
  assert.equal(cs.topic, 'extension');
  assert.match(cs.text, /Nastavení/);
  assert.equal(cs.cile[0].karta, 'extension');
  const en = guide('My Chrome extension is not working', { language: 'en-GB' });
  assert.equal(en.topic, 'extension');
  assert.match(en.text, /Settings/);
  assert.doesNotMatch(en.text, /Nastavení/);
  const followUp = guide('And what next?', { previousTopic: 'extension', language: 'en-GB' });
  assert.equal(followUp.topic, 'extension');
  const update = guide('How do I update?', { language: 'en-GB', snapshot: { updates: { currentVersion: '0.46.1' } } });
  assert.match(update.text, /0[.]46[.]1/);
  const noVersion = guide('How do I update?', { language: 'en-GB', snapshot: { updates: { currentVersion: 'unknown' } } });
  assert.doesNotMatch(noVersion.text, /Installed version reported/);
  const disconnected = guide('Why are agents missing?', { language: 'en-GB', snapshot: { connection: 'offline' } });
  assert.match(disconnected.text, /not confirmed/);
  const connected = guide('Why are agents missing?', { language: 'en-GB', snapshot: { connection: 'live', loaded: true, sessions: new Map([['a', { id: 'a' }]]) } });
  assert.doesNotMatch(connected.text, /not confirmed|no sessions/);
  const empty = guide('Why are agents missing?', { language: 'en-GB', snapshot: { connection: 'live', loaded: true, sessions: new Map() } });
  assert.match(empty.text, /contains no sessions/);
  const connecting = guide('Proč nevidím agenty?', { language: 'cs-CZ', snapshot: { connection: 'connecting', loaded: false, sessions: new Map() } });
  assert.match(connecting.text, /nemám potvrzené spojení/);

  for (const question of ['jak tahle app funguje?', 'Jak funguje Agenteeq?', 'Co dělá Agenteeq?']) {
    const overview = guide(question, { language: 'cs-CZ', route: 'prehled', snapshot: { connection: 'live' } });
    assert.equal(overview.topic, 'overview', question);
    assert.deepEqual(overview.cile, [], 'obecný dotaz nesmí vrátit náhodné navigační odkazy');
    assert.match(overview.text, /kdo pracuje a kdo čeká na tvoje rozhodnutí/);
    assert.match(overview.text, /Projekty seskupují/);
    assert.match(overview.text, /Právě jsi v Přehledu/);
    assert.match(overview.text, /nový úkol napiš do pole pod pozdravem/);
  }
  const englishOverview = guide('How does this app work?', { language: 'en-GB', route: 'agenti', snapshot: { connection: 'offline' } });
  assert.equal(englishOverview.topic, 'overview');
  assert.deepEqual(englishOverview.cile, []);
  assert.match(englishOverview.text, /working or waiting for you/);
  assert.match(englishOverview.text, /live connection is not confirmed/);
  assert.doesNotMatch(englishOverview.text, /Právě jsi/);

  assert.equal(guide('Find chat about invoices', { language: 'en-GB' }), null, 'conversation search stays routed to retrieval');
});
