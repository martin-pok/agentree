import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createSession, deriveStatus, summarize, pushEntry } from '../src/model.js';
import { statusPill, vetaStavu } from '../public/js/ui.js';
import { STATUS } from '../public/js/format.js';
import { stavRobota, vetaRobota } from '../public/js/robot-bubliny.js';

// Pravdivé stavy v rozhraní (0.45.1): karta v „Právě teď“ nesla u každé konverzace se stavem
// `waiting` štítek „Hotovo“ – i když agent spadl uprostřed práce (stale) nebo vůbec neodpověděl.
// Na Agentech měla stejná konverzace štítek „Čeká na zadání“. Jeden stav, dvě jména, a jedno z nich
// nepravdivé.

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const HOUR = 3600e3;

function konverzace(now) {
  const s = createSession({ connector: 'claude-code', localId: 'x', provider: 'anthropic', app: 'Claude Code' });
  s.title = 'Úprava webu';
  s.lastAt = now - 60e3;
  return s;
}

test('model: „done“ jen u agenta, který odpověděl a jehož tah neskončil vypršením', () => {
  const now = Date.now();
  const bezOdpovedi = konverzace(now);
  assert.deepEqual(deriveStatus(bezOdpovedi, now), { status: 'waiting', reason: 'Zatím bez odpovědi agenta', stale: false, done: false });

  const stale = konverzace(now);
  pushEntry(stale, { at: now - 40 * 60e3, role: 'assistant', text: 'Začínám' });
  Object.assign(stale, { running: true, runningAt: now - 40 * 60e3, staleMs: 30 * 60e3 });
  assert.deepEqual(deriveStatus(stale, now), { status: 'waiting', reason: 'Delší dobu bez aktivity', stale: true, done: false });

  const hotovo = konverzace(now);
  pushEntry(hotovo, { at: now - 60e3, role: 'assistant', text: 'Hotovo' });
  assert.deepEqual(deriveStatus(hotovo, now), { status: 'waiting', reason: 'Hotovo, čeká na další zadání', stale: false, done: true });

  // Pracující agent ani agent, který čeká na tvé rozhodnutí, „hotový“ není.
  Object.assign(hotovo, { running: true, runningAt: now - 1000 });
  assert.equal(summarize(hotovo, now, 24 * HOUR).done, false);
  Object.assign(hotovo, { running: false, pending: { kind: 'permission', text: 'Smím?', at: now } });
  assert.equal(summarize(hotovo, now, 24 * HOUR).done, false);
  // Ukončená konverzace se taky nevydává za doběhlou práci.
  Object.assign(hotovo, { pending: null, ended: true });
  assert.equal(summarize(hotovo, now, 24 * HOUR).done, false);

  assert.equal(summarize(stale, now, 24 * HOUR).done, false, 'souhrn pro klienta nese příznak');
  assert.equal(summarize(konverzace(now), now, 24 * HOUR).done, false);
});

test('karta „Právě teď“: štítek je stejný jako na Agentech, „Hotovo“ jen u doběhlého agenta', () => {
  const now = Date.now();
  const bezOdpovedi = summarize(konverzace(now), now, 24 * HOUR);
  const staleSession = konverzace(now);
  pushEntry(staleSession, { at: now - 40 * 60e3, role: 'assistant', text: 'Začínám' });
  Object.assign(staleSession, { running: true, runningAt: now - 40 * 60e3, staleMs: 30 * 60e3 });
  const stale = summarize(staleSession, now, 24 * HOUR);
  const hotovaSession = konverzace(now);
  pushEntry(hotovaSession, { at: now - 60e3, role: 'assistant', text: 'Hotovo' });
  const hotova = summarize(hotovaSession, now, 24 * HOUR);

  for (const s of [bezOdpovedi, stale, hotova]) {
    const pill = statusPill(s.status, 'pb-stav');
    assert.match(pill, /class="pill pb-stav" data-status="waiting"/, 'barva ze stejného .pill[data-status] jako na Agentech');
    assert.ok(pill.includes(STATUS.waiting.label), 'jméno ze STATUS, ne z vlastního slovníku');
    assert.doesNotMatch(pill, /Hotovo/);
  }
  assert.equal(vetaStavu(bezOdpovedi), 'Zatím bez odpovědi agenta');
  assert.equal(vetaStavu(stale), 'Delší dobu bez aktivity');
  assert.equal(vetaStavu(hotova), 'Hotovo, čeká na další zadání');
  assert.equal(vetaStavu({ status: 'working', activity: 'Upravuje app.js' }), 'Upravuje app.js');
  assert.equal(vetaStavu({ status: 'failed', reason: 'Failed to authenticate' }), 'Failed to authenticate');
});

test('Přehled nemá vlastní slovník stavů a nedoběhlé čekání přizná všude, kde je štítek', async () => {
  const prehled = await zdroj('public/js/views/overview.js');
  assert.match(prehled, /statusPill\(s, 'pb-stav'\)/);
  assert.match(prehled, /esc\(vetaStavu\(s\)\)/);
  assert.doesNotMatch(prehled, /waiting: tr\('Hotovo'\)/, 'čekání se nesmí jmenovat „Hotovo“');
  assert.doesNotMatch(prehled, /data-ton="\$\{s\.status/, 'barva štítku jen z .pill[data-status]');
  assert.match(prehled, /s\.status === 'waiting' && !s\.done \? ' data-done="false"'/);
  const css = await zdroj('public/workbench.css');
  assert.doesNotMatch(css, /\.pb-stav\[data-ton/, 'druhá sada barev stavu');
  const agenti = await zdroj('public/js/views/agents.js');
  assert.match(agenti, /s\.status === 'waiting' && !s\.done && s\.reason\) sub = `\$\{esc\(s\.reason\)\}/);
  const detail = await zdroj('public/js/views/session.js');
  assert.match(detail, /statusPill\(s\)\}\$\{s\.status === 'waiting' && !s\.done && s\.reason \? `<span>\$\{esc\(s\.reason\)\}<\/span>`/);
  assert.match(await zdroj('public/js/home-studio.js'), /s\.status === 'waiting' && !s\.done \? ' data-done="false"'/);
});

test('robot u čekání, které nedoběhlo, neříká „hotovo“ a nehlásí se sám', async () => {
  const prvek = (atributy) => ({
    closest: (sel) => {
      const m = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      const k = m[1].replace(/^data-/, '');
      const v = atributy[k];
      if (v === undefined || (m[2] !== undefined && v !== m[2])) return null;
      return { dataset: atributy };
    },
  });
  assert.equal(stavRobota(prvek({ status: 'waiting' })), 'waiting');
  assert.equal(stavRobota(prvek({ status: 'waiting', done: 'false' })), 'ticho');
  assert.equal(stavRobota(prvek({ state: 'waiting', done: 'false' })), 'ticho', 'portrét v detailu');
  for (let i = 0; i < 20; i++) assert.doesNotMatch(vetaRobota('ticho', { nahoda: () => 1 }), /[Hh]otov|volné ruce|Připraven/);
  const kod = await zdroj('public/js/robot-bubliny.js');
  assert.match(kod, /const DULEZITE = new Set\(\['needs_input', 'failed', 'limited', 'waiting'\]\);/, 'vypršelý tah se sám neohlásí');
});

// Detail konverzace držel `v.odpoved` a `v.odpovedStav` z předchozí konverzace: do doběhnutí load()
// (a po jeho selhání natrvalo) ukazoval formulář nebo důvod z A, a obnovOdpoved se pro B při stejném
// stavu obou konverzací vůbec nespustilo.
test('detail konverzace při vstupu i odchodu zapomene stav odpovědi', async () => {
  const kod = await zdroj('public/js/views/session.js');
  const mount = kod.slice(kod.indexOf('function mount('), kod.indexOf('el.innerHTML', kod.indexOf('function mount(')));
  assert.match(mount, /Object\.assign\(v, \{[^}]*odpoved: null[^}]*\}\)/, 'mount nuluje odpověď');
  assert.match(mount, /Object\.assign\(v, \{[^}]*odpovedStav: null[^}]*\}\)/, 'mount nuluje stav, pro který se odpověď zjišťovala');
  const unmount = kod.slice(kod.indexOf('unmount() {'));
  assert.match(unmount, /Object\.assign\(v, \{[^}]*odpoved: null, odpovedStav: null[^}]*\}\)/, 'unmount nuluje obojí');
  assert.match(kod, /if \(v\.odpovedStav !== s\.status\) \{ v\.odpovedStav = s\.status; obnovOdpoved\(\); \}/, 'obnovení podle stavu zůstává');
});

// „Nevím“ ze serveru (program claude se ještě hledá, výpis procesů selhal) je dočasný stav. Detail
// se na něj musí zeptat znovu sám – stav konverzace se mezitím měnit nemusí – a časovač nesmí
// přežít odchod z detailu ani přechod do jiné konverzace.
test('detail se na dočasné „nevím“ u odpovědi zeptá znovu a časovač uklidí', async () => {
  const kod = await zdroj('public/js/views/session.js');
  assert.match(kod, /v\.odpovedZnovu = v\.odpoved\?\.kod === 'nevim' \? setTimeout\(obnovOdpoved, ODPOVED_ZNOVU_MS\) : null;/);
  const obnov = kod.slice(kod.indexOf('async function obnovOdpoved('), kod.indexOf('async function load('));
  assert.match(obnov, /znovuOdpoved\(\)/, 'po obnovení se naplánuje další dotaz, když je stav dál „nevím“');
  const load = kod.slice(kod.indexOf('async function load('), kod.indexOf('function mount('));
  assert.match(load, /v\.odpoved = r\.odpoved \|\| null;\s*znovuOdpoved\(\);/, 'i po prvním načtení');
  const mount = kod.slice(kod.indexOf('function mount('), kod.indexOf('el.innerHTML', kod.indexOf('function mount(')));
  assert.match(mount, /clearTimeout\(v\.odpovedZnovu\)/, 'přechod do jiné konverzace zruší časovač');
  const unmount = kod.slice(kod.indexOf('unmount() {'));
  assert.match(unmount, /clearTimeout\(v\.odpovedZnovu\)/, 'odchod z detailu zruší časovač');
});

test('future or invalid activity timestamp cannot make an agent look actively working', () => {
  const now = Date.now();
  for (const at of [now + 61e3, now + 86400e3, Number.POSITIVE_INFINITY, Number.NaN]) {
    const s = konverzace(now);
    s.running = true;
    s.runningAt = at;
    assert.notEqual(deriveStatus(s, now).status, 'working', `bad runningAt: ${at}`);
    assert.equal(deriveStatus(s, now).stale, true);
  }
  const smallClockSkew = konverzace(now);
  smallClockSkew.running = true;
  smallClockSkew.runningAt = now + 15e3;
  assert.equal(deriveStatus(smallClockSkew, now).status, 'working', 'small device clock drift is tolerated');
});

// Nastavení → Propojení si u nováčka protiřečilo: „Napojené modely“ psaly u Claude Code a Codexu
// „Agent na tomto počítači“ (vedle štítku „Nepodařilo se zjistit“ nebo „CLI nenalezeno“) a o dvě
// karty níž „Zdroje agentů“ hlásily „Claude Code na tomto počítači není“. Každá sekce teď říká jen
// fakt, který sama ověřila: řádek modelu přítomnost programu ve štítku (nevím / není / je),
// zdroje to, jestli na počítači našly konverzace.
test('Propojení: řádek modelu netvrdí přítomnost agenta, nevím a není zůstávají rozlišené', async () => {
  globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  const { radekNapojeni } = await import('../public/js/napojeni-ui.js');
  const zaklad = { druh: 'agent', id: 'claude-code', label: 'Claude Code', provider: 'anthropic', logo: 'claude', napojeno: null, posledni: 0, oknoDni: 30 };
  const nevim = radekNapojeni({ ...zaklad, nainstalovano: null });
  const neni = radekNapojeni({ ...zaklad, nainstalovano: false });
  const je = radekNapojeni({ ...zaklad, nainstalovano: true, napojeno: false, posledni: Date.now() - 60e3 });
  for (const html of [nevim, neni, je]) {
    assert.doesNotMatch(html, /Agent na /, 'podtitulek netvrdí, že agent na počítači je');
    assert.match(html, /Programovací agent/);
  }
  assert.match(nevim, /data-state="unavailable"[^>]*><i><\/i>Nepodařilo se zjistit/, 'nevím ≠ není');
  assert.doesNotMatch(nevim, /data-napojit/, 'napojit bez známého programu nejde, tlačítko by jen vrátilo chybu');
  assert.match(neni, /data-state="missing"[^>]*><i><\/i>Program nenalezen/);
  assert.match(neni, /posledních 30 dní tu nepracoval/);
  assert.match(je, /naposledy pracoval/);
  assert.match(je, /data-napojit="claude-code"/);
});

test('Zdroje agentů: bez složky s konverzacemi hlásí chybějící konverzace, ne chybějící nástroj', async () => {
  const { startTestServer, api } = await import('./helpers.mjs');
  const srv = await startTestServer();
  try {
    const { body } = await api(srv.url).get('/api/state');
    const zdroj = (id) => body.connectors.find((c) => c.id === id);
    assert.equal(zdroj('claude-code').state, 'missing');
    assert.match(zdroj('claude-code').detail, /nejsou žádné konverzace Claude Code/);
    assert.equal(zdroj('codex').state, 'missing');
    assert.match(zdroj('codex').detail, /nejsou žádné konverzace Codexu/);
    for (const id of ['claude-code', 'codex']) assert.doesNotMatch(zdroj(id).detail, /není\.$/);
  } finally {
    await srv.close();
  }
});

// Průvodce na Přehledu: nesplněný krok „Agenti na tomto počítači nalezeni“ se četl jako hotová věc,
// i když se nenašel žádný agent. Nesplněný krok je teď úkol. A tlačítka v pěti kartách nestála na
// jedné linii – karta má řádek pro text, který se roztáhne, a tlačítko pod ním.
test('průvodce: nesplněný krok s agenty je úkol a tlačítka karet stojí na jedné linii', async () => {
  const kod = await zdroj('public/js/views/overview.js');
  const prvniKrok = kod.slice(kod.indexOf('function onboardingHtml('), kod.indexOf("tr('Propojení s Claude Code')"));
  assert.match(prvniKrok, /nalezeni \? tr\('Agenti na \{0\} nalezeni', tomtoPocitaci\(\)\) : tr\('Najít agenty na \{0\}', tomtoPocitaci\(\)\)/);
  assert.match(prvniKrok, /done: nalezeni,/);
  const css = await zdroj('public/styles.css');
  const krok = /\n\.onboard-step \{([^}]*)\}/.exec(css)[1];
  assert.match(krok, /grid-template-rows: 1fr auto/, 'text v roztažitelném řádku, tlačítko pod ním');
  assert.doesNotMatch(krok, /align-content: start/, 'obsah karty se nesmí smrsknout nahoru');
  assert.match(/\n\.onboard-step \.btn \{([^}]*)\}/.exec(css)[1], /align-self: end/);
  assert.match(/\n\.onboard-text \{([^}]*)\}/.exec(css)[1], /align-content: start/, 'nadpis a popis drží u sebe i v nižší kartě');
});


test('P0 Codex limit appears in the overview attention inbox and does not masquerade as waiting', async () => {
  const prehled = await zdroj('public/js/views/overview.js');
  assert.match(prehled, /const attention = \[\.\.\.failed, \.\.\.limited, \.\.\.needs\]/);
  assert.match(prehled, /attention\.slice\(0, 4\)\.map\(decisionCard\)/);
  assert.match(prehled, /tr\('Vyžaduje pozornost'\)/);
  const ui = await zdroj('public/js/ui.js');
  assert.match(ui, /const limited = s\.status === 'limited'/);
  assert.match(ui, /limited \? tr\('Vyčerpaný limit'\)/);
  const en = await zdroj('public/js/i18n/en.js');
  assert.match(en, /"Vyžaduje pozornost": "Needs attention"/);
});

test('Propojení: webové chaty bez rozšíření jsou jeden řádek, s rozšířením každý svůj', async () => {
  globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  const { seznamNapojeni } = await import('../public/js/napojeni-ui.js');
  const agent = { druh: 'agent', id: 'codex', label: 'Codex', provider: 'openai', logo: 'openai', nainstalovano: true, napojeno: true, posledni: 0 };
  const web = (id, label, nainstalovano) => ({ druh: 'web', id, label, provider: 'openai', logo: 'openai', nainstalovano, napojeno: null, posledni: 0 });
  const bez = seznamNapojeni([agent, web('chatgpt', 'ChatGPT', false), web('gemini', 'Gemini', false), web('grok', 'Grok', false)]);
  assert.equal((bez.match(/<li /g) || []).length, 2, 'agent + jeden souhrnný řádek');
  assert.equal((bez.match(/data-action="extension-scroll"/g) || []).length, 1);
  assert.match(bez, /ChatGPT, Gemini, Grok/);
  const s = seznamNapojeni([agent, web('chatgpt', 'ChatGPT', true), web('gemini', 'Gemini', true)]);
  assert.equal((s.match(/<li /g) || []).length, 3, 's rozšířením má každá služba vlastní stav');
});
