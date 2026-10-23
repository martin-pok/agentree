import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Tečka stavu na ikoně rozšíření (extension/odznak.js): přednost má to, co tě potřebuje, a nezjištěný
// stav je šedý – nikdy se netváří jako „nic neběží“ (CLAUDE.md).
async function nacti(jazyk = 'cs') {
  const kontext = vm.createContext({ chrome: { i18n: { getMessage: (k) => (k === 'jazyk' ? jazyk : '') } } });
  for (const f of ['extension/i18n.js', 'extension/odznak.js']) vm.runInContext(await fs.readFile(new URL(`../${f}`, import.meta.url), 'utf8'), kontext);
  return kontext.AgenteeqOdznak;
}

test('odznak: pořadí stavů a věta do popisku ikony', async () => {
  const { stavOdznaku } = await nacti();
  const z = (x) => ({ zdravi: { stav: 'ok', pracuje: 0, cekaNaTebe: 0, selhalo: 0, limit: 0, ...x } });
  assert.deepEqual({ ...stavOdznaku(z({ cekaNaTebe: 2, selhalo: 1, pracuje: 3 })) }, { ton: 'need', veta: 'Potřebují tě 2 agenti' });
  assert.equal(stavOdznaku(z({ selhalo: 1, limit: 1, pracuje: 1 })).ton, 'fail');
  assert.equal(stavOdznaku(z({ limit: 1, pracuje: 1 })).ton, 'limit');
  assert.deepEqual({ ...stavOdznaku(z({ pracuje: 5 })) }, { ton: 'work', veta: 'Pracuje 5 agentů' });
  assert.deepEqual({ ...stavOdznaku(z({})) }, { ton: null, veta: 'V pořádku, nikdo nepracuje' });
});

test('odznak: nedostupná aplikace a nezjištěné procesy jsou šedé, nespárované rozšíření bez tečky', async () => {
  const { stavOdznaku } = await nacti();
  assert.equal(stavOdznaku(null).ton, 'nevim');
  assert.equal(stavOdznaku({ zdravi: { stav: 'nevim', pracuje: 0 } }).ton, 'nevim');
  assert.equal(stavOdznaku(null, { sparovano: false }).ton, null);
  const en = await nacti('en');
  assert.equal(en.stavOdznaku(null).veta, 'Agenteeq isn’t responding – agent status unknown');
  assert.equal(en.stavOdznaku({ zdravi: { stav: 'ok', pracuje: 1 } }).veta, '1 agent is working');
});
