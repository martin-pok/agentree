import test from 'node:test';
import assert from 'node:assert/strict';
import { prehledProRozsireni } from '../src/prehled-rozsireni.js';
import { agentsList, state } from '../public/js/state.js';
import { selectAgents } from '../public/js/agent-selection.js';

const s = (id, status, extra = {}) => ({ id, status, title: `Agent ${id}`, app: 'Claude Code', lastAt: Number(id.replace(/\D/g, '')) || 1, reason: 'Povolit zápis?', ...extra });

test('rozšíření: souhrn stavu, rozhodnutí a pracujících bez přepisu a cest', () => {
  const p = prehledProRozsireni([s('a1', 'needs_input'), s('a2', 'working', { activity: 'Upravuje hlavičku', cwd: '/Users/x/tajne' }), s('a3', 'failed'), s('a4', 'waiting'), s('a5', 'needs_input', { archived: true })]);
  assert.equal(p.zdravi.stav, 'problem');
  assert.equal(p.zdravi.veta, 'Selhal 1 agent');
  assert.deepEqual([p.zdravi.pracuje, p.zdravi.cekaNaTebe, p.zdravi.selhalo, p.zdravi.limit], [1, 1, 1, 0]);
  assert.deepEqual(p.rozhodnuti.map((x) => [x.id, x.status]), [['a1', 'needs_input'], ['a3', 'failed']], 'archivované se neukazují');
  assert.equal(p.pracuji[0].reason, 'Upravuje hlavičku');
  assert.doesNotMatch(JSON.stringify(p), /tajne|cwd/, 'žádné cesty ze stroje');
});

test('rozšíření: nepodařilo se zjistit ≠ nic neběží; klidný stav', () => {
  assert.equal(prehledProRozsireni([], { procesyNevim: true }).zdravi.stav, 'nevim');
  assert.match(prehledProRozsireni([], { procesyNevim: true }).zdravi.veta, /Nepodařilo se zjistit/);
  assert.equal(prehledProRozsireni([s('b1', 'working')]).zdravi.veta, 'Vše běží v pořádku');
  assert.equal(prehledProRozsireni([]).zdravi.veta, 'V pořádku, nikdo nepracuje');
});

test('rozšíření: věta o stavu má správný tvar podle počtu, stejně jako v aplikaci', () => {
  const veta = (...st) => prehledProRozsireni(st.map((x, i) => s(`c${i + 1}`, x))).zdravi.veta;
  assert.equal(veta('needs_input'), 'Potřebuje tě 1 agent');
  assert.equal(veta('needs_input', 'needs_input'), 'Potřebují tě 2 agenti');
  assert.equal(veta(...Array(5).fill('needs_input')), 'Potřebuje tě 5 agentů');
  assert.equal(veta('failed', 'failed', 'needs_input'), 'Selhali 2 agenti', 'problém má přednost před čekáním');
  assert.equal(veta('limited'), 'Na limit narazil 1 agent');
  assert.equal(veta('failed', 'limited'), 'Problém mají 2 agenti');
  assert.equal(veta(...Array(3).fill('failed'), ...Array(2).fill('limited')), 'Problém má 5 agentů');
});


test('extension mirrors dashboard for 20 concurrent agents and does not double-count child sessions', () => {
  const real = Array.from({ length: 20 }, (_, i) => s('live-' + (i + 1), 'working', {
    connector: i % 2 ? 'claude-code' : 'codex',
    lastAt: 1000 + i,
  }));
  const children = [
    s('child-1', 'working', { connector: 'codex', parentId: real[0].id, lastAt: 1100 }),
    s('child-2', 'needs_input', { connector: 'codex', parentId: real[0].id, lastAt: 1200 }),
  ];
  const all = [...real, ...children];
  const before = state.sessions;
  try {
    state.sessions = new Map(all.map((x) => [x.id, x]));
    const desktop = agentsList();
    const popup = prehledProRozsireni(all);
    assert.equal(desktop.length, 20, 'main app has exactly 20 visible agents');
    assert.equal(popup.zdravi.pracuje, 20, 'extension has exactly the same 20');
    assert.equal(popup.zdravi.cekaNaTebe, 0, 'hidden child must not create a phantom action');
    assert.deepEqual(selectAgents(all).map(x => x.id).sort(), desktop.map(x => x.id).sort());
    assert.equal(popup.rozhodnuti.length, 0);
    assert.equal(popup.pracuji.length, 4, 'popup only renders first four, aggregate stays 20');
  } finally {
    state.sessions = before;
  }
});

test('repeated scheduled task counts only latest run, without losing unrelated agents', () => {
  const old = s('plan-old', 'needs_input', { connector: 'claude-code', taskName: 'backup', lastAt: 100 });
  const now = s('plan-new', 'working', { connector: 'claude-code', taskName: 'backup', lastAt: 200 });
  const otherConnector = s('codex-run', 'failed', { connector: 'codex', taskName: 'backup', lastAt: 150 });
  const plain = s('plain-agent', 'working', { connector: 'claude-code', lastAt: 90 });
  const all = [old, now, otherConnector, plain];
  const p = prehledProRozsireni(all);
  assert.deepEqual(selectAgents(all).map(s => s.id), ['plan-new', 'codex-run', 'plain-agent']);
  assert.deepEqual([p.zdravi.pracuje, p.zdravi.cekaNaTebe, p.zdravi.selhalo], [2, 0, 1]);
  assert.equal(p.zdravi.stav, 'problem');
  assert.deepEqual(p.rozhodnuti.map(x => x.id), ['codex-run']);
  assert.ok(!JSON.stringify(p).includes('plan-old'), 'obsolete run must never appear');
});

test('child is standalone when parent is absent or archived, archived sessions never count', () => {
  const orphan = s('orphan', 'needs_input', { parentId: 'missing-id', lastAt: 400 });
  const parent = s('parent', 'working', { archived: true, lastAt: 120 });
  const child = s('child', 'working', { parentId: 'parent', lastAt: 130 });
  const p = prehledProRozsireni([orphan, parent, child]);
  assert.deepEqual([p.zdravi.pracuje, p.zdravi.cekaNaTebe], [1, 1]);
  assert.deepEqual(p.rozhodnuti.map(x => x.id), ['orphan']);
  assert.deepEqual(p.pracuji.map(x => x.id), ['child']);
});

test('extension reports incomplete process scan even when important agents are visible', () => {
  for (const entries of [
    [s('work1', 'working')],
    [s('help1', 'needs_input')],
    [s('failed1', 'failed')],
    [s('limit1', 'limited')],
    [s('mixed1', 'working'), s('mixed2', 'needs_input'), s('mixed3', 'failed')],
  ]) {
    const missing = prehledProRozsireni(entries, { procesyNevim: true });
    const healthy = prehledProRozsireni(entries, { procesyNevim: false });
    assert.equal(missing.zdravi.procesyNevim, true, 'unknown must not be hidden by priority');
    assert.equal(healthy.zdravi.procesyNevim, false);
    assert.deepEqual([missing.zdravi.pracuje, missing.zdravi.cekaNaTebe, missing.zdravi.selhalo, missing.zdravi.limit],
      [healthy.zdravi.pracuje, healthy.zdravi.cekaNaTebe, healthy.zdravi.selhalo, healthy.zdravi.limit],
      'observed counts remain factual, not artificially suppressed');
    assert.equal(missing.zdravi.stav, healthy.zdravi.stav === 'ok' ? 'nevim' : healthy.zdravi.stav,
      'urgent problems keep their correct priority');
    assert.doesNotMatch(JSON.stringify(missing), /transcript|cwd|token|password/,
      'only the boolean, never process metadata or private text, crosses into Chrome');
  }
});
