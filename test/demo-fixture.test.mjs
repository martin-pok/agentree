import test from 'node:test';
import assert from 'node:assert/strict';
import { pripravUkazku } from '../scripts/demo-fixture.mjs';
import { api } from './helpers.mjs';

test('ukázková scéna: angličtina zachová stejná data a přeloží obsah včetně žádosti o rozhodnutí', async () => {
  for (const jazyk of ['cs', 'en']) {
    const demo = await pripravUkazku({}, { oznacit: false, jazyk });
    try {
      const { body } = await api(demo.url).get('/api/state');
      assert.equal(body.settings.language, jazyk);
      assert.equal(body.sessions.length, 6);
      assert.equal(body.projects.items.length, 3);
      const codex = body.sessions.find(s => s.id === 'codex:showcase-api');
      assert.ok(codex);
      assert.equal(codex.pending.text, jazyk === 'en' ? 'Allow writing the new configuration?' : 'Povolit zápis nové konfigurace?');
      assert.equal(codex.title, jazyk === 'en' ? 'API migration' : 'migrace API');
      const texty = body.sessions.flatMap(s => [s.title, s.activity, s.pending?.text || '']).concat(body.projects.items.flatMap(p => [p.name, p.description]));
      if (jazyk === 'en') assert.doesNotMatch(texty.join(' '), /[áčďéěíňóřšťúůýž]/i);
      assert.equal(body.limits.find(l => l.id === 'showcase-five').usedPercent, 62);
    } finally { await demo.close(); }
  }
});

test('ukázková scéna: pracující Claude Code a Codex jsou v Propojení napojené, ne „nepodařilo se zjistit“', async () => {
  const demo = await pripravUkazku({});
  try {
    const { body } = await api(demo.url).get('/api/napojeni');
    const agenti = Object.fromEntries(body.napojeni.filter((n) => n.druh === 'agent').map((n) => [n.id, n]));
    for (const id of ['claude-code', 'codex']) {
      assert.equal(agenti[id].nainstalovano, true, id);
      assert.equal(agenti[id].napojeno, true, id);
      assert.equal(agenti[id].ceka, false, id);
    }
    // Webové chaty ukázka nepřepisuje: bez rozšíření zůstávají „potřebuje rozšíření“.
    assert.ok(body.napojeni.filter((n) => n.druh === 'web').every((n) => n.napojeno !== true));
  } finally { await demo.close(); }
});
