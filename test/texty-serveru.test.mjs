import test from 'node:test';
import assert from 'node:assert/strict';
import EN from '../public/js/i18n/en.js';
import { vytvorPrekladac, vytvorPrelozData } from '../public/js/texty-serveru.js';
import { AlertEngine } from '../src/alerts.js';
import { budgetAlertCandidates } from '../src/spend.js';
import { launchTargets, MODES } from '../src/launcher.js';
import { ui } from '../src/texty.js';
import { startTestServer, api, fakeDatastore } from './helpers.mjs';

// Texty, které skládá server, se v angličtině překládají na klientu (public/js/texty-serveru.js).
// Tyhle testy berou skutečné výstupy serveru – upozornění, nabídku spouštění, snímek stavu – a
// ověřují, že po překladu v nich nezůstala čeština. Dřív v angličtině zůstávaly česky režimy
// spouštění, stavy zdrojů, útrata i titulky upozornění.

const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
const trServer = vytvorPrekladac(EN.server, EN.texty, 'en-GB');
const prelozData = vytvorPrelozData(trServer);

test('překlad: celý text, vzor s proměnnými, vnořený text a hodnoty v zápisu jazyka', () => {
  assert.equal(trServer('V aplikaci'), 'In the app');
  assert.equal(trServer('3 konverzace s aktivitou za 30 dní.'), '3 conversations with activity in the last 30 days.');
  assert.equal(trServer('1 konverzace s aktivitou za 30 dní.'), '1 conversation with activity in the last 30 days.');
  // Vnořený text: název limitu uprostřed věty, i s malým písmenem.
  assert.equal(trServer('Codex: Týdenní limit vyčerpán'), 'Codex: Weekly limit used up');
  assert.equal(trServer('Claude Code: limit relace je obnovený'), 'Claude Code: session limit has reset');
  // Tatáž proměnná dvakrát a jiné pořadí slov.
  assert.equal(trServer('Hlavní složka repozitáře je na větvi dev, ne na main. Přepni ji na main a zkus to znovu.'), 'The main repository folder is on branch dev, not main. Switch it to main and try again.');
  // Čísla a data, která server složil po česku, dostanou anglický zápis.
  assert.equal(trServer(`Zadání může mít nejvýš ${(20000).toLocaleString('cs-CZ')} znaků.`), 'The prompt can be at most 20,000 characters.');
  assert.match(trServer('Licence vypršela 28. 9. 2026.'), /^The licence expired on 28\/09\/2026\.$/);
  // Činnost agenta: přeloží se popisek, obsah zůstane.
  assert.equal(trServer('Spouští příkaz: npm test'), 'Running a command: npm test');
  assert.equal(trServer('Spouští příkaz: npm test · možná čeká na tvé povolení'), 'Running a command: npm test · may be waiting for your permission');
});

test('překlad: neznámý text zůstane beze změny a nic se nevymýšlí', () => {
  for (const text of ['Moje vlastní konverzace', 'constructor', '__proto__', '', 'x'.repeat(5000), 'Hotfix: přihlášení']) {
    assert.equal(trServer(text), text);
  }
  assert.equal(trServer(undefined), undefined);
  assert.equal(trServer(null), null);
});

test('překlad dat: obsah uživatele a kódy se nemění, texty rozhraní ano', () => {
  const data = prelozData({
    sessions: [{ id: 'x', status: 'working', title: 'Oprav přihlášení', lastPrompt: 'Pracuje', cwd: '/Users/me/Na pozadí', activity: 'Čte soubor: app.js', reason: 'Pracuje' }],
    launch: { modes: { ...MODES }, targets: [{ id: 'claude-code', label: 'Claude Code', note: ui('Běží na tvém předplatném Claude.') }] },
    entries: [{ role: 'user', text: 'Pracuje' }, { role: 'system', text: 'Přerušeno uživatelem' }, { role: 'tool', tool: 'Úprava souborů', text: 'a.js' }],
    settings: { profile: 'Na pozadí' },
  });
  assert.equal(data.sessions[0].title, 'Oprav přihlášení', 'titulek od uživatele');
  assert.equal(data.sessions[0].lastPrompt, 'Pracuje', 'zadání uživatele se nepřekládá');
  assert.equal(data.sessions[0].cwd, '/Users/me/Na pozadí');
  assert.equal(data.sessions[0].status, 'working');
  assert.equal(data.sessions[0].activity, 'Reading a file: app.js');
  assert.equal(data.sessions[0].reason, 'Working');
  assert.deepEqual(data.launch.modes, { terminal: 'In Terminal', background: 'In the background', app: 'In the app', web: 'On the web', local: 'Locally' });
  assert.equal(data.launch.targets[0].note, 'Runs on your Claude subscription.');
  assert.deepEqual(data.entries.map((e) => e.text), ['Pracuje', 'Interrupted by the user', 'a.js']);
  assert.equal(data.entries[2].tool, 'File changes');
  assert.equal(data.settings.profile, 'Na pozadí');
});

test('upozornění ze src/alerts.js jsou po překladu anglicky (alerts.js se nemění)', () => {
  const now = Date.now();
  const limity = [
    { id: 'c5', app: 'Claude Code', label: 'Limit 5 h', windowMinutes: 300, resetsAt: now - 1000, usedPercent: 60 },
    { id: 'cw', app: 'Codex', label: 'Týdenní limit', windowMinutes: 10080, resetsAt: now - 1000, usedPercent: 30 },
    { id: 'cs', app: 'Claude Code', label: 'Limit relace', windowMinutes: 1440, resetsAt: now - 1000, usedPercent: 10 },
  ];
  const store = { emit() {}, on() {}, list: () => [], limitList: () => limity };
  const datastore = fakeDatastore({ limitReset: true });
  const alerts = new AlertEngine({ store, datastore, notifier: { native: async () => true } });
  const s = { id: 's1', app: 'Codex', title: 'Úkol', reason: 'Potřebuje tvé rozhodnutí', lastAt: now, turnStartedAt: now - 600e3 };
  alerts.onSession({ ...s, status: 'working' });
  alerts.onSession({ ...s, status: 'failed', failure: { at: now } });
  alerts.onSession({ ...s, status: 'needs_input', pending: { at: now } });
  alerts.onSession({ ...s, status: 'limited', limit: { at: now, text: 'Usage limit reached' } });
  alerts.onSession({ ...s, status: 'working' });
  alerts.onSession({ ...s, status: 'waiting', stale: false });
  alerts.onLimit({ id: 'l1', app: 'Codex', label: 'Týdenní limit', reached: true, resetsAt: now + 3600e3 }, null);
  alerts.onLimit({ id: 'l2', app: 'Claude Code', label: 'Limit 5 h', reached: false, usedPercent: 85, resetsAt: now + 3600e3 }, { usedPercent: 10 });
  alerts.onLimit({ id: 'l3', app: 'Claude Code', label: 'Limit 5 h', reached: false, usedPercent: 96 }, { usedPercent: 10 });
  alerts.checkLimitResets(now);
  alerts.checkBudgets({ monthKey: '2026-09', currency: 'CZK', budgets: [{ scope: 'total', label: ui('Celkem'), spent: 1200, budget: 1000, pct: 120 }, { scope: 'claude', label: 'Claude', spent: 850, budget: 1000, pct: 85 }] });
  const kinds = new Set(datastore.data.alerts.map((a) => a.kind));
  for (const k of ['failed', 'needs_input', 'limit', 'done', 'limit_near', 'limit_reset', 'budget']) assert.ok(kinds.has(k), `chybí upozornění ${k}`);
  const prelozene = prelozData(structuredClone(datastore.data.alerts));
  for (const a of prelozene) {
    // Tělo nese i titulek konverzace od uživatele („Úkol“) – ten zůstává, jak je.
    const text = `${a.title} | ${a.body === 'Úkol' ? '' : a.body}`;
    assert.doesNotMatch(text, CZ, `česky zůstalo: ${text}`);
    assert.doesNotMatch(text, /\b(na|je|se|vyčerpán)\b/, `česky zůstalo: ${text}`);
  }
  assert.ok(prelozene.some((a) => a.title === 'Codex needs your decision'));
  assert.ok(prelozene.some((a) => a.title === 'Claude Code: 5-hour limit at 85 %'));
  assert.ok(prelozene.some((a) => a.title === 'Codex: weekly limit has reset'));
  assert.ok(prelozene.some((a) => a.title === 'Budget exceeded: Total'));
});

test('nabídka spouštění a rozpočty jsou po překladu anglicky', () => {
  const targets = prelozData(launchTargets({ bins: { claude: '/x/claude', codex: '/x/codex', gemini: '/x/gemini', qwen: '/x/qwen' }, chatgptApp: true, claudeApp: true, ollama: { ok: true, models: [] } }));
  for (const t of targets) {
    assert.doesNotMatch(JSON.stringify([t.note, t.permissions, t.sandboxes]), CZ, t.id);
  }
  const rozpocty = prelozData(budgetAlertCandidates({ monthKey: '2026-09', currency: 'USD', budgets: [{ scope: 'total', label: ui('Celkem'), spent: 90, budget: 100, pct: 90 }] }));
  assert.equal(rozpocty[0].title, '90 % of the budget used: Total');
  assert.doesNotMatch(rozpocty[0].body, CZ);
});

test('snímek stavu ze serveru: zdroje, útrata, spouštění a licence po překladu bez češtiny', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const stav = prelozData((await api(srv.url).get('/api/state')).body);
  const texty = [];
  for (const c of stav.connectors) texty.push(c.name, c.detail, c.description);
  texty.push(...Object.values(stav.launch.modes), ...stav.launch.targets.flatMap((x) => [x.note, ...Object.values(x.permissions || {}), ...Object.values(x.sandboxes || {})]));
  texty.push(...Object.values(stav.spend.kinds), ...Object.values(stav.spend.services).map((x) => x.label));
  texty.push(stav.license.planLabel);
  const cesky = texty.filter((x) => typeof x === 'string' && CZ.test(x));
  assert.deepEqual(cesky, []);
});
