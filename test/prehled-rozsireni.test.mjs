import test from 'node:test';
import assert from 'node:assert/strict';
import { prehledProRozsireni } from '../src/prehled-rozsireni.js';

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
