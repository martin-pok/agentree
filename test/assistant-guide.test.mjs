import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Asistent musí poskytovat konkrétní kontextové postupy přímo v UI, ne pouze tři
// statické odpovědi nebo vzdálený model. Tento test hlídá propojení a obsah katalogu.
const source = await fs.readFile(new URL('../public/js/assistant-guide.js', import.meta.url), 'utf8');
const ui = await fs.readFile(new URL('../public/js/robot-guide.js', import.meta.url), 'utf8');

test('pomocník používá průvodce před obecným vyhledáváním', () => {
  assert.match(ui, /import \{ guideAnswer \} from '\.\/assistant-guide\.js'/);
  const guideIndex = ui.indexOf('guideAnswer(dotaz');
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
  assert.match(source, /Odhady nepovažuj za skutečné faktury/);
  assert.match(source, /ne z přímého potvrzení služby/);
});
