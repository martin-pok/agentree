import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createSession, deriveStatus } from '../src/model.js';
import { vytvorPrekladac } from '../public/js/texty-serveru.js';
import EN from '../public/js/i18n/en.js';
import { startTestServer, api, tempDir, writeJsonl } from './helpers.mjs';
import { applyClaudeLine, newFileState, parseResets, describeTool, todosProgress } from '../src/connectors/claude-code.js';

const T0 = Date.parse('2026-09-10T10:00:00Z');
const at = (sec) => new Date(T0 + sec * 1000).toISOString();

function feed(lines, hooks = {}) {
  const s = createSession({ connector: 'claude-code', localId: 'abc', provider: 'anthropic', app: 'Claude Code' });
  const st = newFileState();
  for (const l of lines) applyClaudeLine(st, s, l, hooks);
  return { s, st };
}

test('zadání → nástroj → výsledek → konec tahu', () => {
  const lines = [
    { type: 'user', timestamp: at(0), cwd: '/Users/x/proj', gitBranch: 'main', message: { role: 'user', content: 'Oprav testy' } },
    { type: 'assistant', timestamp: at(2), message: { id: 'm1', model: 'claude-opus-5', stop_reason: 'tool_use', content: [{ type: 'text', text: 'Spustím testy.' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test', description: 'Spustit testy' } }], usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 } } },
  ];
  const { s, st } = feed(lines);
  assert.equal(deriveStatus(s, T0 + 5000).status, 'working');
  assert.equal(s.activity, 'Spouští příkaz: Spustit testy');
  assert.equal(st.pendingTools.size, 1);

  for (const l of [
    { type: 'assistant', timestamp: at(2), message: { id: 'm1', model: 'claude-opus-5', stop_reason: 'tool_use', content: [], usage: { input_tokens: 10, output_tokens: 50, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 } } },
    { type: 'user', timestamp: at(30), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok 12 tests' }] } },
    { type: 'assistant', timestamp: at(35), message: { id: 'm2', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo.' }], usage: { input_tokens: 1, output_tokens: 10 } } },
  ]) applyClaudeLine(st, s, l);

  assert.equal(s.turns, 1);
  assert.equal(s.cwd, '/Users/x/proj');
  assert.equal(s.branch, 'main');
  assert.deepEqual(s.transcript.map((e) => e.role), ['user', 'assistant', 'tool', 'result', 'assistant']);
  assert.equal(s.tokens.output, 60, 'opakovaná zpráva se stejným id se nepočítá dvakrát');
  assert.equal(s.tokens.input, 11);
  assert.equal(s.tokens.cacheWrite, 100);
  assert.equal(s.tokens.cacheRead, 1000);
  // Hlavní metrika je vstup + výstup (11 + 60). Zápis do cache je technická režie a do
  // hodinových přihrádek, ze kterých se kreslí všechny grafy, nepatří – jinak hlavní číslo
  // vyjde skoro devětkrát vyšší, než kolik uživatel vidí u dodavatele.
  assert.equal(Object.values(s.hourly).reduce((a, b) => a + b, 0), 71, 'hodinové přihrádky nesmí obsahovat zápis do cache');
  assert.equal(s.running, false);
  assert.equal(deriveStatus(s, T0 + 40000).status, 'waiting');
});

test('dlouhé přemýšlení bez zápisu není „hotovo“; dlouho čekající nástroj bez hooků je „možná čeká na povolení“', () => {
  const { s, st } = feed([
    { type: 'user', timestamp: at(0), message: { content: 'Napiš celou aplikaci' } },
    { type: 'assistant', timestamp: at(5), message: { id: 'x', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'rm -rf dist', description: 'Smazat build' } }] } },
  ]);
  s.staleMs = 30 * 60e3;
  const long = deriveStatus(s, T0 + 5000 + 120e3);
  assert.equal(long.status, 'working');
  assert.equal(long.reason, 'Spouští příkaz: Smazat build · možná čeká na tvé povolení');
  s.hookAt = T0;
  assert.equal(deriveStatus(s, T0 + 125e3).reason, 'Spouští příkaz: Smazat build', 's hooky víme jistě, proto bez domněnky');
  applyClaudeLine(st, s, { type: 'user', timestamp: at(130), message: { content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'ok' }] } });
  assert.equal(s.toolWaitSince, 0);
  const stale = deriveStatus(s, T0 + 130e3 + 31 * 60e3);
  assert.equal(stale.status, 'waiting');
  assert.equal(stale.stale, true, 'bez konce tahu je to jen nečinnost, ne dokončení');
});

test('AskUserQuestion přepne na „potřebuje rozhodnutí“ a odpověď ho zruší', () => {
  const { s, st } = feed([
    { type: 'user', timestamp: at(0), message: { content: 'Navrhni logo' } },
    { type: 'assistant', timestamp: at(3), message: { id: 'q', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'ask1', name: 'AskUserQuestion', input: { questions: [{ question: 'Jaký styl?' }] } }] } },
  ]);
  assert.equal(deriveStatus(s, T0 + 60000).status, 'needs_input');
  assert.equal(deriveStatus(s, T0 + 60000).reason, 'Jaký styl?');
  applyClaudeLine(st, s, { type: 'user', timestamp: at(90), message: { content: [{ type: 'tool_result', tool_use_id: 'ask1', content: 'Minimalistický' }] } });
  assert.equal(s.pending, null);
  assert.equal(deriveStatus(s, T0 + 91000).status, 'working');
});

test('chyba limitu → stav „limit“, čas obnovení a zrušení po úspěšné odpovědi', () => {
  const limits = [];
  let resolvedAt = 0;
  const { s, st } = feed(
    [
      { type: 'user', timestamp: at(0), message: { content: 'Pokračuj' } },
      { type: 'assistant', timestamp: at(1), isApiErrorMessage: true, message: { id: 'e1', model: '<synthetic>', content: [{ type: 'text', text: "You've hit your session limit · resets 1am (Europe/Prague)" }] } },
    ],
    { onLimit: (l) => limits.push(l), onSuccess: (ts) => { resolvedAt = ts; } },
  );
  assert.equal(deriveStatus(s, T0 + 2000).status, 'limited');
  assert.equal(limits.length, 1);
  assert.equal(limits[0].id, 'claude:session');
  assert.ok(limits[0].resetsAt > T0);
  applyClaudeLine(st, s, { type: 'assistant', timestamp: at(7200), message: { id: 'ok', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Pokračuji.' }] } }, { onSuccess: (ts) => { resolvedAt = ts; } });
  assert.equal(s.limit, null);
  assert.equal(resolvedAt, T0 + 7200 * 1000);
});

test('přerušení uživatelem ukončí práci', () => {
  const { s } = feed([
    { type: 'user', timestamp: at(0), message: { content: 'Udělej refaktor' } },
    { type: 'assistant', timestamp: at(2), message: { id: 'a', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'Edit', input: { file_path: '/a/b.js' } }] } },
    { type: 'user', timestamp: at(4), message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } },
  ]);
  assert.equal(s.running, false);
  assert.equal(s.transcript.at(-1).text, 'Přerušeno uživatelem');
});

test('vložený systémový kontext se nepočítá jako zadání', () => {
  const { s } = feed([
    { type: 'user', timestamp: at(0), message: { content: '<command-name>/clear</command-name>' } },
    { type: 'user', timestamp: at(1), message: { content: 'Skutečné zadání' } },
  ]);
  assert.equal(s.turns, 1);
  assert.equal(s.firstPrompt, 'Skutečné zadání');
});

test('parseResets počítá nejbližší budoucí čas', () => {
  const late = Date.parse('2026-09-10T23:30:00+02:00');
  assert.equal(parseResets('resets 1am (Europe/Prague)', late), Date.parse('2026-09-11T01:00:00+02:00'));
  const morning = new Date(2026, 8, 10, 10, 0).getTime();
  assert.equal(parseResets('resets 3:30pm', morning), new Date(2026, 8, 10, 15, 30).getTime());
  assert.equal(parseResets('bez času', morning), null);
});

// Týdenní limit s obnovou za šest dní se dřív četl jen podle hodiny – ukazoval obnovu dnes nebo zítra.
test('parseResets: hláška s datem a starší tvar s epochou', () => {
  const now = new Date(2026, 8, 26, 10, 0).getTime();
  assert.equal(parseResets("You've hit your weekly limit · resets Oct 2, 5pm (Europe/Prague)", now), Date.parse('2026-10-02T17:00:00+02:00'));
  assert.equal(parseResets('Weekly limit reached ∙ resets Oct 2 at 9:30am', now), new Date(2026, 9, 2, 9, 30).getTime());
  assert.equal(parseResets('resets Sep 30, 11pm', now), new Date(2026, 8, 30, 23, 0).getTime());
  const prosinec = new Date(2026, 11, 30, 10, 0).getTime();
  assert.equal(parseResets('resets Jan 3, 9am', prosinec), new Date(2027, 0, 3, 9, 0).getTime(), 'přes Nový rok');
  assert.equal(parseResets('Claude AI usage limit reached|1759327200', now), 1759327200000);
  assert.equal(parseResets('resets tomorrow 9am', now), null, 'neznámý tvar se nedomýšlí');
});

// Hláška uvádí zónu účtu („resets 11pm (Europe/Prague)“). Dřív se hodina brala v místní zóně
// serveru, takže na počítači v jiné zóně vyšla obnova o hodiny vedle. Test běží schválně v zóně,
// která není ani pražská, ani UTC.
test('parseResets: hodina platí v zóně z hlášky, i přes přechod letního času', () => {
  const puvodni = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const vecer = Date.parse('2026-10-10T20:00:00Z'); // 22:00 v Praze (CEST)
    assert.equal(parseResets("You've hit your session limit · resets 11pm (Europe/Prague)", vecer), Date.parse('2026-10-10T21:00:00Z'));
    assert.equal(parseResets('resets 11pm (UTC)', vecer), Date.parse('2026-10-10T23:00:00Z'));
    // Po 23:00 pražského času míří tatáž hodina na další den.
    assert.equal(parseResets('resets 11pm (Europe/Prague)', Date.parse('2026-10-10T21:30:00Z')), Date.parse('2026-10-11T21:00:00Z'));
    assert.equal(parseResets('resets Oct 12, 9am (Europe/Prague)', vecer), Date.parse('2026-10-12T07:00:00Z'));
    // Podzimní přechod (25. 10. 2026, 3:00 CEST → 2:00 CET): „zítra v 9“ je už v zimním čase,
    // tedy 8:00 UTC – ne 7:00, jak by vyšlo přičtením 24 hodin k dnešku.
    assert.equal(parseResets('resets 9am (Europe/Prague)', Date.parse('2026-10-24T12:00:00Z')), Date.parse('2026-10-25T08:00:00Z'));
    // Jarní přechod (29. 3. 2026, 2:00 CET → 3:00 CEST).
    assert.equal(parseResets('resets 5am (Europe/Prague)', Date.parse('2026-03-28T22:00:00Z')), Date.parse('2026-03-29T03:00:00Z'));
    assert.equal(parseResets('resets 1am (Europe/Prague)', Date.parse('2026-03-28T22:00:00Z')), Date.parse('2026-03-29T00:00:00Z'));
    // Neznámá zóna se nehádá: platí místní čas počítače jako u hlášky bez zóny.
    assert.equal(parseResets('resets 11pm (Mars/Olympus)', vecer), parseResets('resets 11pm', vecer));
  } finally {
    if (puvodni === undefined) delete process.env.TZ;
    else process.env.TZ = puvodni;
  }
});

// Surová anglická hláška („You've hit your session limit · resets 11pm (Europe/Prague)“) se dřív
// stala důvodem stavu, a tím textem v Agentech, v kartě rozhodnutí, v detailu i v upozornění.
// Důvod je teď věta z rozpoznaných údajů – česky, a v angličtině přes slovník serverových textů.
test('limit: důvod stavu je věta z druhu limitu a času obnovy, surová hláška jen jako záloha', () => {
  const puvodni = process.env.TZ;
  process.env.TZ = 'Europe/Prague';
  try {
    const hlaska = "You've hit your session limit · resets 11pm (Europe/Prague)";
    const { s } = feed([
      { type: 'user', timestamp: at(0), message: { content: 'Pokračuj' } },
      { type: 'assistant', timestamp: at(1), isApiErrorMessage: true, message: { id: 'e1', model: '<synthetic>', content: [{ type: 'text', text: hlaska }] } },
    ]);
    const { status, reason } = deriveStatus(s, T0 + 2000);
    assert.equal(status, 'limited');
    assert.equal(reason, 'Limit relace vyčerpán · obnoví se 10. 9. 23:00');
    assert.doesNotMatch(reason, /hit your|resets/);
    assert.equal(s.limit.text, hlaska, 'surová hláška zůstává v datech');
    const en = vytvorPrekladac(EN.server, EN.texty, 'en-GB');
    assert.equal(en(reason), 'Session limit used up · resets 10/09, 23:00');

    // Hláška bez času obnovy: věta bez času. Obnova v nerozpoznaném tvaru: raději surová hláška.
    const bezCasu = feed([{ type: 'assistant', timestamp: at(1), isApiErrorMessage: true, message: { id: 'e2', model: '<synthetic>', content: [{ type: 'text', text: "You've hit your weekly limit" }] } }]).s;
    assert.equal(deriveStatus(bezCasu, T0 + 2000).reason, 'Týdenní limit vyčerpán');
    const divny = feed([{ type: 'assistant', timestamp: at(1), isApiErrorMessage: true, message: { id: 'e3', model: '<synthetic>', content: [{ type: 'text', text: "You've hit your weekly limit · resets tomorrow" }] } }]).s;
    assert.equal(deriveStatus(divny, T0 + 2000).reason, "You've hit your weekly limit · resets tomorrow");
  } finally {
    if (puvodni === undefined) delete process.env.TZ;
    else process.env.TZ = puvodni;
  }
});

test('popis nástrojů a průběh úkolů', () => {
  assert.equal(describeTool('Edit', { file_path: '/x/y/app.js' }), 'Upravuje soubor: app.js');
  assert.equal(describeTool('mcp__asana__get_task', {}), 'Používá nástroj: asana · get task');
  assert.deepEqual(todosProgress([{ status: 'completed', content: 'a' }, { status: 'in_progress', content: 'b', activeForm: 'Dělám b' }, { status: 'pending', content: 'c' }]), { done: 1, total: 3, current: 'Dělám b' });
});

test('Pomocný agent: přepis v podsložce subagents se čte celý a váže se na rodiče', async () => {
  const home = await tempDir('agenteeq-src-');
  const parent = '11111111-2222-3333-4444-555555555555';
  const now = Date.now();
  const iso = (ms) => new Date(now + ms).toISOString();
  const proj = path.join(home, '.claude', 'projects', '-Users-x-proj');
  await writeJsonl(path.join(proj, `${parent}.jsonl`), [
    { type: 'user', timestamp: iso(-60000), cwd: '/Users/x/proj', message: { content: 'Zkontroluj bezpečnost' } },
    { type: 'assistant', timestamp: iso(-59000), message: { id: 'm1', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Spouštím pomocníka' }], usage: { input_tokens: 10, output_tokens: 20 } } },
    { type: 'assistant', timestamp: iso(-58000), message: { id: 'm1b', model: 'claude-opus-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Agent', input: { description: 'Kontrola validace adres' } }], usage: { input_tokens: 0, output_tokens: 0 } } },
    { type: 'user', timestamp: iso(-57000), message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'Async agent launched successfully.\nagentId: abc123 (internal ID)' }] }] } },
  ]);
  await writeJsonl(path.join(proj, parent, 'subagents', 'agent-abc123.jsonl'), [
    { type: 'user', isSidechain: true, timestamp: iso(-50000), cwd: '/Users/x/proj', message: { content: 'Projdi validaci adres' } },
    { type: 'assistant', isSidechain: true, timestamp: iso(-49000), message: { id: 'm2', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo, nic podezřelého' }], usage: { input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 50 } } },
  ]);

  const s = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  try {
    const stav = (await api(s.url).get('/api/state')).body;
    const rodic = stav.sessions.find((x) => x.id === `claude-code:${parent}`);
    const pomocnik = stav.sessions.find((x) => x.id === 'claude-code:agent-abc123');

    assert.ok(rodic, 'rodičovská konverzace musí existovat');
    assert.ok(pomocnik, 'pomocný agent se musí načíst – jeho práce nesmí zmizet');
    assert.equal(pomocnik.parentId, `claude-code:${parent}`, 'pomocník je navázaný na rodiče');
    assert.equal(pomocnik.subagent?.label, 'Pomocný agent');
    assert.equal(pomocnik.tokens.input + pomocnik.tokens.output, 300, 'tokeny pomocníka se počítají');
    assert.equal(pomocnik.tokens.cacheWrite, 50, 'režie cache se drží zvlášť');
    assert.equal(pomocnik.title, 'Kontrola validace adres', 'název se bere z popisu úlohy v rodičovském přepisu');
    assert.equal(rodic.tokens.input + rodic.tokens.output, 30, 'rodiči se tokeny pomocníka nepřičítají dvakrát');
    assert.equal(rodic.tokens.input + rodic.tokens.output, 30, 'tokeny pomocníka zůstávají u pomocníka');
    assert.ok(!pomocnik.resume, 'pomocného agenta nelze samostatně obnovit');
  } finally {
    await s.close();
  }
});

// Regrese: tah, který skončil chybou API (500, přetížení, vypršelé přihlášení…), se hlásil jako
// „Hotovo, čeká na další zadání“ (done: true). Selhání není dokončení.
test('chyba API mimo limit: „selhalo“ s textem chyby, nové zadání nebo úspěšná odpověď ho zruší', () => {
  const chyba = 'API Error: 500 {"type":"error","error":{"type":"api_error","message":"Internal server error"}}';
  const { s, st } = feed([
    { type: 'user', timestamp: at(0), message: { content: 'Oprav to' } },
    { type: 'assistant', timestamp: at(2), isApiErrorMessage: true, message: { id: 'e1', model: '<synthetic>', content: [{ type: 'text', text: chyba }] } },
  ]);
  const d = deriveStatus(s, T0 + 10e3);
  assert.equal(d.status, 'failed');
  assert.equal(d.reason, chyba);
  assert.equal(d.done ?? false, false);
  assert.equal(s.failure.kind, 'chyba');
  // Úspěšná odpověď později (např. pokračování) selhání ruší.
  applyClaudeLine(st, s, { type: 'assistant', timestamp: at(20), message: { id: 'm2', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo.' }], usage: { input_tokens: 1, output_tokens: 1 } } });
  assert.equal(s.failure, null);
  assert.equal(deriveStatus(s, T0 + 25e3).status, 'waiting');

  // Nové zadání po selhání: agent zase pracuje.
  const b = feed([
    { type: 'user', timestamp: at(0), message: { content: 'Oprav to' } },
    { type: 'assistant', timestamp: at(2), isApiErrorMessage: true, message: { id: 'e1', model: '<synthetic>', content: [{ type: 'text', text: 'API Error: Request timed out.' }] } },
    { type: 'user', timestamp: at(30), message: { content: 'Zkus to znovu' } },
  ]);
  assert.equal(deriveStatus(b.s, T0 + 31e3).status, 'working');

  // Zrušený požadavek je přerušení, ne selhání ani „hotovo“.
  const c = feed([
    { type: 'user', timestamp: at(0), message: { content: 'Oprav to' } },
    { type: 'assistant', timestamp: at(2), isApiErrorMessage: true, message: { id: 'e1', model: '<synthetic>', content: [{ type: 'text', text: 'Request was aborted.' }] } },
  ]);
  const dc = deriveStatus(c.s, T0 + 10e3);
  assert.deepEqual([dc.status, dc.done, dc.reason], ['waiting', false, 'Přerušeno, čeká na další zadání']);

  // Chyba pomocníka v rodičovském přepisu rodiče neshazuje.
  const d2 = feed([
    { type: 'user', timestamp: at(0), message: { content: 'Oprav to' } },
    { type: 'assistant', timestamp: at(2), isSidechain: true, isApiErrorMessage: true, message: { id: 'e1', model: '<synthetic>', content: [{ type: 'text', text: 'API Error: 529 Overloaded' }] } },
  ]);
  assert.equal(d2.s.failure, null);
});
