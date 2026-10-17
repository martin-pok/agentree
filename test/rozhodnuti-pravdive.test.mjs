import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createSession, summarize } from '../src/model.js';
import { applyClaudeLine, newFileState, otazkyZVstupu } from '../src/connectors/claude-code.js';
import { openTargets, planOpen, ALL_APPS } from '../src/openers.js';
import { beziVeSlozce } from '../src/odpoved.js';
import { vetaStavu, openButtons, otazkyHtml, kindLabel } from '../public/js/ui.js';
import { jeOtazkaNaCekani, coNaMeCeka } from '../public/js/co-ceka.js';

// Co má uživatel rozhodnout, musí být vidět a musí jít udělat (audit před spuštěním, B1, B2,
// přepis otázky a Pomocník „co na mě čeká?“).

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const T0 = Date.parse('2026-10-10T10:00:00Z');
const at = (sec) => new Date(T0 + sec * 1000).toISOString();
const HOUR = 3600e3;

function claude(lines, app = 'Claude Code') {
  const s = createSession({ connector: 'claude-code', localId: '0b6a3c1e-1111-4222-8333-944455556666', provider: 'anthropic', app });
  const st = newFileState();
  for (const l of lines) applyClaudeLine(st, s, l);
  return s;
}

// --- B1: „možná čeká na tvé povolení“ se z modelu dostane až do rozhraní ---

test('B1: věta o stavu pracujícího agenta nese i „možná čeká na tvé povolení“ z modelu', () => {
  const s = claude([
    { type: 'user', timestamp: at(0), cwd: '/Users/x/proj', message: { content: 'Spusť testy' } },
    { type: 'assistant', timestamp: at(2), message: { id: 'm1', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test', description: 'Spustit testy' } }] } },
  ]);
  const kratce = summarize(s, T0 + 10e3, 24 * HOUR);
  assert.equal(kratce.status, 'working');
  assert.equal(vetaStavu(kratce), 'Spouští příkaz: Spustit testy', 'bez domněnky jen činnost');

  const dlouho = summarize(s, T0 + 2e3 + 120e3, 24 * HOUR);
  assert.equal(dlouho.status, 'working', 'stav odvozuje jen model');
  assert.equal(dlouho.activity, 'Spouští příkaz: Spustit testy');
  assert.equal(vetaStavu(dlouho), 'Spouští příkaz: Spustit testy · možná čeká na tvé povolení');

  // Bez činnosti a bez domněnky zůstává obecné „Pracuje“.
  assert.equal(vetaStavu({ status: 'working', activity: '', reason: '' }), 'Pracuje');
  assert.equal(vetaStavu({ status: 'working', activity: 'Upravuje app.js', reason: 'Upravuje app.js' }), 'Upravuje app.js');
});

test('B1: Agenti, detail, projekt i Právě teď ukazují větu z vetaStavu, ne holou činnost', async () => {
  const agenti = await zdroj('public/js/views/agents.js');
  assert.match(agenti, /if \(s\.status === 'working'\) sub = `[^`]*\$\{esc\(vetaStavu\(s\)\)\}/);
  const detail = await zdroj('public/js/views/session.js');
  assert.match(detail, /<span class="live-activity">\$\{esc\(vetaStavu\(s\)\)\}<\/span>/);
  const projekt = await zdroj('public/js/views/project.js');
  assert.match(projekt, /\$\{esc\(vetaStavu\(s\)\)\}/);
  const prehled = await zdroj('public/js/views/overview.js');
  assert.match(prehled, /\$\{esc\(vetaStavu\(s\)\)\}/);
  for (const [soubor, kod] of [['agents.js', agenti], ['session.js', detail], ['project.js', projekt]]) {
    assert.doesNotMatch(kod, /esc\(s\.activity(?: \|\| tr\('Pracuje'\))?\)/, `${soubor}: holá činnost by domněnku o povolení schovala`);
  }
});

// --- B2: hlavní akce u konverzace z příkazové řádky vede do Terminálu ---

test('B2: Claude Code a Codex z příkazové řádky mají hlavní akci „Pokračovat v Terminálu“', () => {
  const cli = { id: 'claude-code:0b6a3c1e-1111-4222-8333-944455556666', connector: 'claude-code', app: 'Claude Code', source: 'local', cwd: '/Users/jana/Design & Web' };
  assert.deepEqual(openTargets(cli, ALL_APPS).map((t) => t.id), ['terminal', 'app', 'folder']);
  // Cíl jde do Terminálu jako jeden argument se složkou v uvozovkách – „Design & Web“ se nerozpadne.
  assert.equal(planOpen(cli, 'terminal', ALL_APPS).command, "cd '/Users/jana/Design & Web' && claude --resume 0b6a3c1e-1111-4222-8333-944455556666");
  const tlacitka = openButtons({ ...cli, open: openTargets(cli, ALL_APPS) }, { small: true, max: 2 });
  assert.match(tlacitka, /^<button class="btn btn--sm btn--primary" type="button" data-open-target="terminal"/, 'první, tmavé tlačítko vede do Terminálu');
  assert.match(tlacitka, /data-open-target="app"/, 'Claude.app zůstává jako vedlejší volba');

  const codexId = '01a0546a-6679-76d3-9454-ba9f37a24013';
  const codexCli = { id: `codex:${codexId}`, connector: 'codex', app: 'Codex CLI', source: 'local', cwd: '/Users/x/web' };
  assert.deepEqual(openTargets(codexCli, ALL_APPS).map((t) => t.id), ['terminal', 'app', 'folder']);
});

test('B2: Claude Desktop a aplikace Codex se dál otevírají hlavně v aplikaci', () => {
  const desktop = { id: 'claude-code:0b6a3c1e-1111-4222-8333-944455556666', connector: 'claude-code', app: 'Claude Desktop · Code', source: 'local', cwd: '/Users/x/proj' };
  assert.deepEqual(openTargets(desktop, ALL_APPS).map((t) => t.id), ['app', 'terminal', 'folder']);
  const codexApp = { id: 'codex:01a0546a-6679-76d3-9454-ba9f37a24013', connector: 'codex', app: 'Codex · aplikace', source: 'local', cwd: '/Users/x/web' };
  assert.deepEqual(openTargets(codexApp, ALL_APPS).map((t) => t.id), ['app', 'terminal', 'folder']);
  // Bez programu claude Terminál nabídnout nejde – hlavní zůstane, co skutečně jde.
  const bezCli = { id: 'claude-code:0b6a3c1e-1111-4222-8333-944455556666', connector: 'claude-code', app: 'Claude Code', source: 'local', cwd: '/Users/x' };
  assert.deepEqual(openTargets(bezCli, { claude: true, cli: { claude: false } }).map((t) => t.id), ['app', 'folder']);
});

test('B2: konverzace, jejíž program ve složce běží, se nerozdvojí – Terminál se jen přepne do popředí', () => {
  const cli = { id: 'claude-code:0b6a3c1e-1111-4222-8333-944455556666', connector: 'claude-code', app: 'Claude Code', source: 'local', cwd: '/Users/jana/Design & Web' };
  const bezi = planOpen(cli, 'terminal', ALL_APPS, { bezi: true });
  assert.deepEqual([bezi.kind, bezi.args, bezi.title], ['open', ['-a', 'Terminal'], 'Přepnout do Terminálu'], 'žádný druhý `claude --resume` nad čekající konverzací');
  assert.equal(openTargets(cli, ALL_APPS, { bezi: true })[0].label, 'Přepnout do Terminálu');
  // Víme, že nic neběží, nebo to nevíme: pokračuje se novým `--resume` (příkaz jde i zkopírovat).
  for (const stav of [false, null]) assert.match(planOpen(cli, 'terminal', ALL_APPS, { bezi: stav }).command, /claude --resume /);
  // Claude Desktop se přepnutím Terminálu netýká.
  const desktop = { ...cli, app: 'Claude Desktop · Code' };
  assert.equal(planOpen(desktop, 'terminal', ALL_APPS, { bezi: true }).kind, 'terminal');
});

test('B2: běží ve složce konverzace program téhož nástroje – ano, ne, nevím', () => {
  const s = { connector: 'claude-code', cwd: '/Users/jana/Design & Web' };
  assert.equal(beziVeSlozce(s, [{ runtime: 'claude-code', cwd: '/Users/jana/Design & Web' }]), true);
  assert.equal(beziVeSlozce(s, [{ runtime: 'claude-code', cwd: '/Users/jana/jinde' }, { runtime: 'codex', cwd: '/Users/jana/Design & Web' }]), false, 'jiná složka ani jiný nástroj se nepočítají');
  assert.equal(beziVeSlozce(s, [{ runtime: 'claude-code', cwd: null }]), null, 'proces bez zjištěné složky = nevím');
  assert.equal(beziVeSlozce(s, null), null, 'výpis procesů není = nevím');
  assert.equal(beziVeSlozce({ connector: 'codex', cwd: '/x' }, [{ runtime: 'codex', cwd: '/x' }]), true);
  assert.equal(beziVeSlozce({ connector: 'cursor', cwd: '/x' }, [{ runtime: 'claude-code', cwd: '/x' }]), null);
});

// --- Přepis: otázka agenta lidsky a i s nabízenými možnostmi ---

test('přepis: AskUserQuestion nese otázku i nabízené možnosti', () => {
  const s = claude([
    { type: 'user', timestamp: at(0), message: { content: 'Navrhni logo' } },
    { type: 'assistant', timestamp: at(3), message: { id: 'q', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'ask1', name: 'AskUserQuestion', input: { questions: [{ question: 'Smím přepsat soubor?', header: 'Soubor', options: [{ label: 'Ano', description: 'Přepsat' }, { label: 'Ne' }], multiSelect: false }] } }] } },
  ]);
  const otazka = s.transcript.find((e) => e.tool === 'AskUserQuestion');
  assert.deepEqual(otazka.questions, [{ question: 'Smím přepsat soubor?', options: ['Ano', 'Ne'] }]);
  assert.equal(otazka.text, 'Smím přepsat soubor?', 'text zůstává pro hledání a starší klienty');
  // Jiné nástroje pole nedostanou; nesmyslný vstup nic nevymyslí.
  assert.equal(s.transcript.find((e) => e.role === 'user').questions, undefined);
  assert.deepEqual(otazkyZVstupu({ questions: [{ options: [{ label: 'X' }] }, null, { question: 'Proč?' }] }), [{ question: 'Proč?', options: [] }]);
  assert.deepEqual(otazkyZVstupu(null), []);
});

test('přepis: otázka se ukáže jako „Ptá se tě“ s možnostmi, všechno escapované', async () => {
  const html = otazkyHtml([{ question: 'Smím <b>smazat</b> build?', options: ['Ano', '<img src=x onerror=alert(1)>'] }]);
  assert.match(html, /<p class="tool-question">Smím &lt;b&gt;smazat&lt;\/b&gt; build\?<\/p>/);
  assert.match(html, /<ul class="tool-options" aria-label="Nabízené možnosti"><li>Ano<\/li><li>&lt;img src=x onerror=alert\(1\)&gt;<\/li><\/ul>/);
  assert.doesNotMatch(html, /<img|<b>/);
  assert.equal(otazkyHtml([]), '');
  const detail = await zdroj('public/js/views/session.js');
  assert.match(detail, /if \(name === 'AskUserQuestion'\) return kindLabel\('question'\);/, 'místo jména nástroje lidský popisek');
  assert.match(detail, /if \(e\.questions\?\.length\) return questionsHtml\(e, time\);/);
  assert.match(detail, /otazkyHtml\(e\.questions\)/);
  assert.equal(kindLabel('question'), 'Ptá se tě');
});

// --- Pomocník: „co na mě čeká?“ ze živého stavu ---

test('Pomocník pozná otázku „co na mě čeká?“ česky i anglicky, hledání a nastavení nechá být', () => {
  for (const q of ['co na mě čeká?', 'Co na mě čeká', 'čeká na mě něco?', 'potřebuje mě někdo?', 'kdo čeká na moje rozhodnutí', 'co mám schválit?', 'co čeká?', 'What is waiting for me?', "what's waiting", 'anything waiting on me?', 'who needs me', 'pending decisions']) {
    assert.ok(jeOtazkaNaCekani(q), q);
  }
  for (const q of ['najdi chat, kde jsme řešili, co na mě čeká', 'Jak zapnu upozornění na telefon?', 'co potřebuju k propojení Codexu', 'Kde nastavím rozpočet?', 'find chat about waiting for me', '']) {
    assert.ok(!jeOtazkaNaCekani(q), q);
  }
});

test('Pomocník: vyjmenuje agenty, kteří potřebují tebe (a selhané), s odkazy – nic nevymýšlí', () => {
  const agenti = [
    { id: 'claude-code:a', title: 'Logo', app: 'Claude Code', status: 'needs_input', reason: 'Smím přepsat soubor?', pending: { at: 100 }, lastAt: 100, project: 'web' },
    { id: 'claude-code:b', title: 'Testy', app: 'Claude Code', status: 'needs_input', reason: 'Nejspíš čeká na tvé povolení: Upravuje app.js', pending: { at: 300 }, lastAt: 300 },
    { id: 'codex:c', title: 'Migrace', app: 'Codex CLI', status: 'failed', reason: 'Spuštění selhalo', failure: { at: 200 }, lastAt: 200 },
    { id: 'claude-code:d', title: 'Pracuje', app: 'Claude Code', status: 'working', reason: 'Spouští příkaz', lastAt: 400 },
    { id: 'claude-code:e', title: 'Hotovo', app: 'Claude Code', status: 'waiting', reason: 'Hotovo, čeká na další zadání', lastAt: 500 },
  ];
  const r = coNaMeCeka({ agenti, nacteno: true, spojeni: 'live' });
  assert.equal(r.text, 'Na tvé rozhodnutí čekají 2 agenti. Selhal nebo narazil na limit 1 agent.');
  assert.deepEqual(r.vysledky.map((v) => v.sessionId), ['claude-code:b', 'claude-code:a', 'codex:c'], 'nejdřív rozhodnutí (nejnovější nahoře), pak problémy; pracující a hotoví ne');
  assert.equal(r.vysledky[0].ukazka, 'Nejspíš čeká na tvé povolení: Upravuje app.js', 'důvod ze serveru beze změny');
  assert.equal(r.vysledky[1].app, 'Potřebuje tebe · Claude Code');
  assert.equal(r.cile[0].route, '#/agenti?stav=needs_input');
  assert.equal(r.pozn, undefined);

  assert.equal(coNaMeCeka({ agenti: agenti.slice(0, 1), nacteno: true }).text, 'Na tvé rozhodnutí čeká 1 agent.');
  const nic = coNaMeCeka({ agenti: agenti.slice(3), nacteno: true, spojeni: 'live' });
  assert.equal(nic.text, 'Na tvé rozhodnutí teď nečeká žádný agent a žádný neselhal ani nenarazil na limit.');
  assert.deepEqual(nic.vysledky, []);
  assert.doesNotMatch(nic.text, /Nic se nenašlo|prohledáno/);
});

test('Pomocník: nenačtený stav se nevydává za „nic nečeká“, nepotvrzené spojení se přizná', () => {
  const nenacteno = coNaMeCeka({ agenti: [], nacteno: false });
  assert.match(nenacteno.text, /nepodařilo zjistit/);
  assert.doesNotMatch(nenacteno.text, /nečeká žádný/);
  const offline = coNaMeCeka({ agenti: [], nacteno: true, spojeni: 'offline' });
  assert.match(offline.pozn, /není potvrzené/);
  const mnoho = Array.from({ length: 8 }, (_, i) => ({ id: `x:${i}`, title: `A${i}`, app: 'Claude Code', status: 'needs_input', reason: '?', pending: { at: i }, lastAt: i }));
  const r = coNaMeCeka({ agenti: mnoho, nacteno: true });
  assert.equal(r.vysledky.length, 6);
  assert.match(r.pozn, /Další najdeš v sekci Agenti/);
});

test('Pomocník se na čekání ptá živého stavu dřív, než začne hledat v přepisech', async () => {
  // Rozhoduje odpovedPruvodce (public/js/assistant-guide.js); chování hlídá test/pomocnik-dotazy.test.mjs.
  const kod = await zdroj('public/js/robot-guide.js');
  const otazka = kod.indexOf('odpovedPruvodce(dotaz');
  assert.ok(otazka > 0 && otazka < kod.indexOf("request('POST', '/api/pomocnik'"));
  assert.match(kod, /odpovedPruvodce\(dotaz, \{[^}]*snapshot: state, agenti: agentsList \}\)/);
  const pruvodce = await zdroj('public/js/assistant-guide.js');
  assert.match(pruvodce, /jeOtazkaNaCekani\(dotaz\)/);
  assert.match(pruvodce, /coNaMeCeka\(\{ agenti: seznam, nacteno: Boolean\(snapshot\?\.loaded\), spojeni: snapshot\?\.connection \}\)/);
  assert.match(kod, /tr\('Co na mě čeká\?'\)/, 'nabízí se i jako návrh');
});
