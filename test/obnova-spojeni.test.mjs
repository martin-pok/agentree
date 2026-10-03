import test from 'node:test';
import assert from 'node:assert/strict';

// Živý proud v okně (public/js/api.js#connectStream). Když server na /api/stream odpoví chybou
// (503 při přetížení, restart, výpadek proxy), prohlížeč EventSource zavře natrvalo a sám se už
// nikdy nepřipojí. Okno pak navždy ukazovalo „Agenteeq neběží“ a bez živých změn, i když server
// dávno zase běžel (ověřeno v Chromiu i WebKitu). Testy běží nad atrapou EventSource.

class FalesnyProud {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static vsechny = [];
  constructor(url) {
    this.url = url;
    this.readyState = FalesnyProud.CONNECTING;
    this.posluchaci = new Map();
    this.onerror = null;
    FalesnyProud.vsechny.push(this);
  }
  addEventListener(name, fn) { this.posluchaci.set(name, fn); }
  close() { this.readyState = FalesnyProud.CLOSED; }
  pozdrav() { this.readyState = FalesnyProud.OPEN; this.posluchaci.get('hello')?.({ data: '{"version":"x"}' }); }
  // Síťová chyba: prohlížeč se připojuje sám (CONNECTING).
  vypadek() { this.readyState = FalesnyProud.CONNECTING; this.onerror?.(); }
  // Chybová odpověď serveru: prohlížeč proud zavře natrvalo (CLOSED).
  odmitnuti() { this.readyState = FalesnyProud.CLOSED; this.onerror?.(); }
}

globalThis.EventSource = FalesnyProud;
const { connectStream } = await import('../public/js/api.js');

function pripoj() {
  const stavy = [];
  const pozdravy = [];
  const spojeni = connectStream({ onHello: (h) => pozdravy.push(h), onEvent: () => {}, onStatus: (s) => stavy.push(s) });
  return { spojeni, stavy, pozdravy };
}

test('proud zavřený chybovou odpovědí serveru se znovu naváže sám', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  FalesnyProud.vsechny.length = 0;
  const { spojeni, stavy, pozdravy } = pripoj();
  FalesnyProud.vsechny[0].pozdrav();
  FalesnyProud.vsechny[0].odmitnuti();
  assert.deepEqual(stavy, ['live', 'offline']);
  assert.equal(FalesnyProud.vsechny.length, 1, 'nové spojení se nezakládá hned, server může být přetížený');

  t.mock.timers.tick(2000);
  assert.equal(FalesnyProud.vsechny.length, 2, 'po krátké prodlevě vznikne nové spojení');
  FalesnyProud.vsechny[1].pozdrav();
  assert.equal(stavy.at(-1), 'live');
  assert.equal(pozdravy.length, 2, 'nový pozdrav = okno si stáhne čerstvý snímek');
  spojeni.close();
});

test('opakované odmítnutí prodlužuje prodlevu, úspěch ji vrátí na začátek', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  FalesnyProud.vsechny.length = 0;
  const { spojeni } = pripoj();
  const prodlevy = [];
  for (let i = 0; i < 6; i++) {
    const pred = FalesnyProud.vsechny.length;
    FalesnyProud.vsechny.at(-1).odmitnuti();
    let ms = 0;
    while (FalesnyProud.vsechny.length === pred && ms < 120000) { t.mock.timers.tick(500); ms += 500; }
    prodlevy.push(ms);
  }
  assert.deepEqual(prodlevy, [2000, 5000, 10000, 30000, 30000, 30000], 'nejvýš jednou za 30 s');

  FalesnyProud.vsechny.at(-1).pozdrav();
  const pred = FalesnyProud.vsechny.length;
  FalesnyProud.vsechny.at(-1).odmitnuti();
  t.mock.timers.tick(2000);
  assert.equal(FalesnyProud.vsechny.length, pred + 1, 'po úspěšném spojení se začíná znovu od 2 s');
  spojeni.close();
});

test('síťový výpadek nechá znovupřipojení na prohlížeči a nezakládá druhé spojení', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  FalesnyProud.vsechny.length = 0;
  const { spojeni, stavy } = pripoj();
  FalesnyProud.vsechny[0].pozdrav();
  FalesnyProud.vsechny[0].vypadek();
  t.mock.timers.tick(60000);
  assert.equal(FalesnyProud.vsechny.length, 1);
  assert.deepEqual(stavy, ['live', 'reconnecting']);
  spojeni.close();
});

test('obnov() po návratu do okna připojí zavřený proud hned, živý nechá být', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  FalesnyProud.vsechny.length = 0;
  const { spojeni } = pripoj();
  FalesnyProud.vsechny[0].pozdrav();
  spojeni.obnov();
  assert.equal(FalesnyProud.vsechny.length, 1, 'živé spojení se nepřerušuje');

  FalesnyProud.vsechny[0].odmitnuti();
  spojeni.obnov();
  assert.equal(FalesnyProud.vsechny.length, 2, 'zavřené se naváže bez čekání');
  t.mock.timers.tick(60000);
  assert.equal(FalesnyProud.vsechny.length, 2, 'naplánovaný pokus se zrušil, spojení nejsou dvě');
  spojeni.close();
});

test('close() zastaví i naplánované znovupřipojení', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  FalesnyProud.vsechny.length = 0;
  const { spojeni } = pripoj();
  FalesnyProud.vsechny[0].odmitnuti();
  spojeni.close();
  t.mock.timers.tick(60000);
  assert.equal(FalesnyProud.vsechny.length, 1);
  spojeni.obnov();
  assert.equal(FalesnyProud.vsechny.length, 1, 'zavřené spojení už nic nezakládá');
});
